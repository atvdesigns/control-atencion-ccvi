import { initializeApp } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";
import { randomUUID } from "node:crypto";
import { HttpsError, onCall } from "firebase-functions/v2/https";

initializeApp();

type ServiceType = "representation" | "vehicle_owner";

interface KioskArrivalInput {
  centerId: string;
  serviceType: ServiceType;
}

interface CenterWindow {
  windowId: string;
  windowNumber: number;
  serviceType: ServiceType;
  serviceLabel: string;
  validationLevel: "enhanced" | "standard";
  publicCodePrefix: string;
  enabled: boolean;
  displayOrder: number;
}

interface CenterConfig {
  centerId: string;
  timezone: string;
  serviceStartTime: string;
  serviceEndTime: string;
  enabled: boolean;
  windows: CenterWindow[] | Record<string, CenterWindow>;
  documentaryRequirements?: Record<
    ServiceType,
    Array<{ label?: unknown; enabled?: unknown }> | Record<string, { label?: unknown; enabled?: unknown }>
  >;
  paymentMethods?: Array<{ label?: unknown; accepted?: unknown }> | Record<string, { label?: unknown; accepted?: unknown }>;
}

type WindowRole = "operator-window-1" | "operator-window-2";

interface UserProfile {
  uid: string;
  role: "admin" | WindowRole | "cashier";
  centerIds: string[];
  centerAccess: Record<string, true>;
  enabled: boolean;
}

interface WindowCase {
  caseId: string;
  publicToken: string;
  centerId: string;
  sessionId: string;
  publicCode: string;
  globalArrivalSequence: number;
  serviceType: ServiceType;
  serviceLabel: string;
  assignedWindowId: string;
  assignedWindowNumber: number;
  assignedOperatorId: string | null;
  isPriority: boolean;
  currentState: string;
  arrivalAt: number;
  calledToWindowAt: number | null;
  updatedAt: number;
  [key: string]: unknown;
}

interface WindowDay {
  metadata?: Record<string, unknown>;
  cases?: Record<string, WindowCase>;
  events?: Record<string, unknown>;
  [key: string]: unknown;
}

interface CallNextWindowContext {
  centerId: string;
  sessionId: string;
  windowId: string;
  role: WindowRole;
  uid: string;
  timestamp: number;
  eventId: string;
}

const serviceTypes: ServiceType[] = ["representation", "vehicle_owner"];
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const centerIdPattern = /^[A-Za-z0-9_-]{1,128}$/;
const windowIdPattern = /^[A-Za-z0-9_-]{1,128}$/;

const recordOf = <T>(value: unknown): Record<string, T> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, T>) }
    : {};

const valuesOf = <T>(value: T[] | Record<string, T> | undefined): T[] =>
  Array.isArray(value) ? value : Object.values(value ?? {});

export const selectNextWindowCase = (
  cases: Record<string, WindowCase>,
  centerId: string,
  sessionId: string,
  windowId: string,
  consecutivePriorityCases: number,
) => {
  const eligible = Object.values(cases)
    .filter((caseItem) =>
      caseItem.centerId === centerId &&
      caseItem.sessionId === sessionId &&
      caseItem.assignedWindowId === windowId &&
      caseItem.currentState === "waiting_document_validation")
    .sort((a, b) =>
      a.arrivalAt - b.arrivalAt ||
      a.globalArrivalSequence - b.globalArrivalSequence ||
      a.caseId.localeCompare(b.caseId));
  const priority = eligible.filter((caseItem) => caseItem.isPriority);
  const regular = eligible.filter((caseItem) => !caseItem.isPriority);
  if (priority.length > 0 && (regular.length === 0 || consecutivePriorityCases < 2)) {
    return priority[0];
  }
  return regular[0] ?? priority[0];
};

export const authorizedWindowId = (
  profile: UserProfile | null,
  uid: string,
  centerId: string,
  requestedWindowId: string,
  windows: CenterWindow[],
) => {
  if (!profile || profile.uid !== uid || profile.enabled !== true) return null;
  if (!profile.centerIds?.includes(centerId) || profile.centerAccess?.[centerId] !== true) return null;
  const windowNumber = profile.role === "operator-window-1" ? 1 :
    profile.role === "operator-window-2" ? 2 : null;
  if (!windowNumber) return null;
  const windowItem = windows.find((item) => item.windowNumber === windowNumber);
  return windowItem?.windowId === requestedWindowId ? windowItem.windowId : null;
};

export const applyCallNextWindowMutation = (
  currentDay: WindowDay | null,
  context: CallNextWindowContext,
) => {
  if (!currentDay) return { status: "no-eligible-case" as const, day: undefined, caseId: null };
  const cases = recordOf<WindowCase>(currentDay.cases);
  const hasActiveCase = Object.values(cases).some((caseItem) =>
    caseItem.centerId === context.centerId &&
    caseItem.sessionId === context.sessionId &&
    caseItem.assignedWindowId === context.windowId &&
    ["called_to_window", "in_document_validation"].includes(caseItem.currentState));
  if (hasActiveCase) return { status: "active-case" as const, day: undefined, caseId: null };

  const metadata = recordOf<unknown>(currentDay.metadata);
  const counters = recordOf<number>(metadata.consecutivePriorityCasesByWindow);
  const previousPriorityCount = Number.isSafeInteger(counters[context.windowId])
    ? counters[context.windowId]
    : 0;
  const next = selectNextWindowCase(
    cases,
    context.centerId,
    context.sessionId,
    context.windowId,
    previousPriorityCount,
  );
  if (!next) return { status: "no-eligible-case" as const, day: undefined, caseId: null };

  const nextCase: WindowCase = {
    ...next,
    assignedOperatorId: context.role,
    currentState: "called_to_window",
    calledToWindowAt: context.timestamp,
    updatedAt: context.timestamp,
  };
  const day: WindowDay = {
    ...currentDay,
    metadata: {
      ...metadata,
      consecutivePriorityCasesByWindow: {
        ...counters,
        [context.windowId]: next.isPriority ? previousPriorityCount + 1 : 0,
      },
    },
    cases: { ...cases, [next.caseId]: nextCase },
    events: {
      ...recordOf(currentDay.events),
      [context.eventId]: {
        eventId: context.eventId,
        centerId: context.centerId,
        sessionId: context.sessionId,
        caseId: next.caseId,
        actorRole: context.role,
        actorId: context.role,
        action: "called_to_window",
        fromState: next.currentState,
        toState: "called_to_window",
        timestamp: context.timestamp,
        optionalNote: null,
      },
    },
  };
  return { status: "called" as const, day, caseId: next.caseId };
};

export const runCallNextWindowTransaction = async (
  subscribeToAuthoritativeDay: (
    onValue: (exists: boolean) => void,
    onError: (error: unknown) => void,
  ) => () => void,
  transact: (
    update: (currentDay: WindowDay | null) => WindowDay | undefined,
  ) => Promise<{ committed: boolean; value: WindowDay | null }>,
  context: CallNextWindowContext,
) => {
  let detachListener = () => {};
  try {
    const authoritativeDayExists = await new Promise<boolean>((resolve, reject) => {
      detachListener = subscribeToAuthoritativeDay(resolve, reject);
    });
    if (!authoritativeDayExists) {
      return {
        status: "no-eligible-case" as const,
        caseId: null,
        committedDay: null,
      };
    }

    const outcomeHolder: {
      value: ReturnType<typeof applyCallNextWindowMutation> | null;
    } = { value: null };
    let transactionStateWasNull = false;
    const transaction = await transact((currentDay) => {
      if (!currentDay) {
        transactionStateWasNull = true;
        outcomeHolder.value = null;
        return undefined;
      }
      const mutation = applyCallNextWindowMutation(currentDay, context);
      outcomeHolder.value = mutation;
      return mutation.day;
    });
    const mutationOutcome = outcomeHolder.value;

    if (transaction.committed) {
      if (mutationOutcome?.status !== "called" || !mutationOutcome.caseId) {
        throw new Error("CALL_NEXT_TRANSACTION_INVALID_COMMIT");
      }
      return {
        status: mutationOutcome.status,
        caseId: mutationOutcome.caseId,
        committedDay: transaction.value,
      };
    }

    if (mutationOutcome) {
      if (mutationOutcome.status === "called") {
        throw new Error("CALL_NEXT_TRANSACTION_NOT_COMMITTED");
      }
      return {
        status: mutationOutcome.status,
        caseId: mutationOutcome.caseId,
        committedDay: null,
      };
    }

    if (transactionStateWasNull) {
      return {
        status: "no-eligible-case" as const,
        caseId: null,
        committedDay: null,
      };
    }
    throw new Error("CALL_NEXT_TRANSACTION_ABORTED");
  } finally {
    detachListener();
  }
};

export const callNextWindowResponse = (
  status: "called" | "no-eligible-case" | "active-case",
  publicCode?: string,
) => {
  if (status === "called") {
    return { ok: true, outcome: "called" as const, ...(publicCode ? { publicCode } : {}) };
  }
  return {
    ok: false,
    outcome: status === "active-case" ? "active_case_exists" as const : "no_eligible_case" as const,
  };
};

const parseInput = (value: unknown): KioskArrivalInput => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpsError("invalid-argument", "Los datos de la solicitud no son válidos.");
  }

  const input = value as Record<string, unknown>;
  const keys = Object.keys(input);
  if (
    keys.length !== 2 ||
    !keys.includes("centerId") ||
    !keys.includes("serviceType") ||
    typeof input.centerId !== "string" ||
    !centerIdPattern.test(input.centerId) ||
    typeof input.serviceType !== "string" ||
    input.serviceType.length > 32 ||
    !serviceTypes.includes(input.serviceType as ServiceType)
  ) {
    throw new HttpsError("invalid-argument", "Los datos de la solicitud no son válidos.");
  }

  return {
    centerId: input.centerId,
    serviceType: input.serviceType as ServiceType,
  };
};

const dateTimeInZone = (now: Date, timezone: string) => {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((item) => item.type === type)?.value;
    const year = part("year");
    const month = part("month");
    const day = part("day");
    const hour = Number(part("hour"));
    const minute = Number(part("minute"));
    if (!year || !month || !day || !Number.isInteger(hour) || !Number.isInteger(minute)) {
      throw new Error("INVALID_TIMEZONE_PARTS");
    }
    return { dayId: `${year}-${month}-${day}`, minutes: hour * 60 + minute };
  } catch {
    throw new HttpsError("failed-precondition", "La configuración horaria del centro no es válida.");
  }
};

const timeToMinutes = (value: string) => {
  if (!timePattern.test(value)) {
    throw new HttpsError("failed-precondition", "El horario del centro no está configurado correctamente.");
  }
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
};

const isWithinServiceHours = (center: CenterConfig, currentMinutes: number) => {
  const start = timeToMinutes(center.serviceStartTime);
  const end = timeToMinutes(center.serviceEndTime);
  if (start === end) return false;
  return start < end
    ? currentMinutes >= start && currentMinutes < end
    : currentMinutes >= start || currentMinutes < end;
};

const publicRequirements = (center: CenterConfig, serviceType: ServiceType) =>
  valuesOf(center.documentaryRequirements?.[serviceType])
    .filter((item) => item.enabled === true && typeof item.label === "string")
    .map((item) => item.label as string);

const publicPaymentMethods = (center: CenterConfig) =>
  valuesOf(center.paymentMethods)
    .filter((item) => typeof item.label === "string" && typeof item.accepted === "boolean")
    .map((item) => ({ label: item.label as string, accepted: item.accepted as boolean }));

export const createKioskArrival = onCall(
  { region: "us-central1", enforceAppCheck: false },
  async (request) => {
    try {
      const { centerId, serviceType } = parseInput(request.data);
      const database = getDatabase();
      const centerSnapshot = await database.ref(`centers/${centerId}`).get();
      if (!centerSnapshot.exists()) {
        throw new HttpsError("not-found", "El centro solicitado no está disponible.");
      }

      const center = centerSnapshot.val() as CenterConfig;
      if (center.centerId !== centerId || center.enabled !== true) {
        throw new HttpsError("failed-precondition", "El centro no está disponible para emitir turnos.");
      }

      const assignedWindow = valuesOf(center.windows)
        .filter((windowItem) => windowItem.enabled === true && windowItem.serviceType === serviceType)
        .sort((a, b) => a.displayOrder - b.displayOrder)[0];
      if (
        !assignedWindow ||
        !assignedWindow.windowId ||
        !Number.isInteger(assignedWindow.windowNumber) ||
        assignedWindow.windowNumber < 1 ||
        !/^V[1-9]\d*$/.test(assignedWindow.publicCodePrefix) ||
        typeof assignedWindow.serviceLabel !== "string" ||
        !["enhanced", "standard"].includes(assignedWindow.validationLevel)
      ) {
        throw new HttpsError("failed-precondition", "No existe una ventanilla habilitada para esta atención.");
      }

      const now = new Date();
      const timestamp = now.getTime();
      const { dayId, minutes } = dateTimeInZone(now, center.timezone);
      if (!isWithinServiceHours(center, minutes)) {
        throw new HttpsError("failed-precondition", "El centro está fuera de su horario de atención.");
      }

      const sessionId = `${centerId}-${dayId}`;
      const caseId = randomUUID();
      const publicToken = randomUUID();
      const eventId = randomUUID();
      const dayReference = database.ref(`days/${centerId}/${dayId}`);
      const transaction = await dayReference.transaction(
        (currentValue) => {
          const currentDay = recordOf<unknown>(currentValue);
          const currentMetadata = recordOf<unknown>(currentDay.metadata);
          if (currentMetadata.status === "closed") return;

          const windowSequences = recordOf<number>(currentMetadata.windowSequences);
          const storedSequence = windowSequences[assignedWindow.windowId];
          const currentSequence =
            Number.isSafeInteger(storedSequence) && storedSequence >= 0 ? storedSequence : 0;
          const publicSequence = currentSequence + 1;
          const publicCode = `${assignedWindow.publicCodePrefix}-${String(publicSequence).padStart(2, "0")}`;
          const storedGlobalSequence = currentMetadata.nextGlobalArrivalSequence;
          const globalArrivalSequence =
            typeof storedGlobalSequence === "number" &&
            Number.isSafeInteger(storedGlobalSequence) &&
            storedGlobalSequence >= 1
              ? storedGlobalSequence
              : 1;

          const caseRecord = {
            caseId,
            publicToken,
            centerId,
            sessionId,
            publicCode,
            globalArrivalSequence,
            publicSequence,
            serviceType,
            serviceLabel: assignedWindow.serviceLabel,
            validationLevel: assignedWindow.validationLevel,
            personKind: "not_specified",
            assignedWindowId: assignedWindow.windowId,
            assignedWindowNumber: assignedWindow.windowNumber,
            assignedOperatorId: null,
            isPriority: false,
            priorityType: null,
            priorityCreatedBy: null,
            priorityCreatedAt: null,
            currentState: "waiting_document_validation",
            arrivalAt: timestamp,
            calledToWindowAt: null,
            documentValidationStartedAt: null,
            documentValidationCompletedAt: null,
            documentStatus: "pending",
            optionalInternalNote: null,
            folderCode: null,
            paymentQueueNumber: null,
            paymentTicketId: null,
            cashierId: null,
            calledToCashierAt: null,
            cashierStartedAt: null,
            paymentCompletedAt: null,
            completedAt: null,
            updatedAt: timestamp,
          };
          const arrivalEvent = {
            eventId,
            centerId,
            sessionId,
            caseId,
            actorRole: "kiosk",
            actorId: "kiosk",
            action: "arrival_created",
            fromState: null,
            toState: "waiting_document_validation",
            timestamp,
            optionalNote: null,
          };

          return {
            ...currentDay,
            metadata: {
              sessionId,
              centerId,
              date: dayId,
              status: "open",
              nextGlobalArrivalSequence: globalArrivalSequence + 1,
              windowSequences: {
                ...windowSequences,
                [assignedWindow.windowId]: publicSequence,
              },
              consecutivePriorityCasesByWindow:
                currentMetadata.consecutivePriorityCasesByWindow ?? {},
              consecutivePriorityCasesForCashier:
                currentMetadata.consecutivePriorityCasesForCashier ?? 0,
              nextFolderNumber: currentMetadata.nextFolderNumber ?? 1,
              nextPaymentQueueNumber: currentMetadata.nextPaymentQueueNumber ?? 1,
              openedAt: currentMetadata.openedAt ?? timestamp,
              closedAt: null,
            },
            cases: {
              ...recordOf(currentDay.cases),
              [caseId]: caseRecord,
            },
            events: {
              ...recordOf(currentDay.events),
              [eventId]: arrivalEvent,
            },
          };
        },
        undefined,
        false,
      );

      if (!transaction.committed) {
        throw new HttpsError("failed-precondition", "La jornada no está disponible para emitir turnos.");
      }

      const committedCase = transaction.snapshot.child(`cases/${caseId}`).val() as
        | { publicCode?: unknown }
        | null;
      if (!committedCase || typeof committedCase.publicCode !== "string") {
        throw new Error("COMMITTED_CASE_NOT_FOUND");
      }

      await database.ref(`public/turns/${publicToken}`).set({
        centerId,
        publicCode: committedCase.publicCode,
        isPriority: false,
        status: "Prepare su documentación",
        serviceType,
        serviceLabel: assignedWindow.serviceLabel,
        destination: `Ventanilla ${assignedWindow.windowNumber}`,
        updatedAt: timestamp,
        requirements: publicRequirements(center, serviceType),
        paymentMethods: publicPaymentMethods(center),
      });

      return { publicCode: committedCase.publicCode, publicToken };
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      console.error("createKioskArrival failed", error);
      throw new HttpsError("internal", "No fue posible crear el turno. Intente nuevamente.");
    }
  },
);

export const callNextWindowCase = onCall(
  { region: "us-central1", enforceAppCheck: false },
  async (request) => {
    const startedAt = Date.now();
    let finalOutcomeLogged = false;
    let safeWindow: number | null = null;
    let failureStage = "request";
    const logFinalOutcome = (
      outcome: string,
      details: { publicCode?: string; stage?: string; errorCategory?: string } = {},
    ) => {
      if (finalOutcomeLogged) return;
      finalOutcomeLogged = true;
      console.info({
        operation: "callNextWindowCase",
        window: safeWindow,
        outcome,
        durationMs: Date.now() - startedAt,
        ...details,
      });
    };

    try {
      if (!request.auth?.uid) {
        logFinalOutcome("unauthenticated");
        throw new HttpsError("unauthenticated", "Debe iniciar sesión para continuar.");
      }
      if (!request.data || typeof request.data !== "object" || Array.isArray(request.data)) {
        logFinalOutcome("invalid_request");
        throw new HttpsError("invalid-argument", "Los datos de la solicitud no son válidos.");
      }
      const input = request.data as Record<string, unknown>;
      if (
        Object.keys(input).length !== 2 ||
        typeof input.centerId !== "string" ||
        !centerIdPattern.test(input.centerId) ||
        typeof input.windowId !== "string" ||
        !windowIdPattern.test(input.windowId)
      ) {
        logFinalOutcome("invalid_request");
        throw new HttpsError("invalid-argument", "Los datos de la solicitud no son válidos.");
      }

      const centerId = input.centerId;
      const requestedWindowId = input.windowId;
      const uid = request.auth.uid;
      const database = getDatabase();
      const [profileSnapshot, centerSnapshot] = await Promise.all([
        database.ref(`users/${uid}`).get(),
        database.ref(`centers/${centerId}`).get(),
      ]);
      if (!profileSnapshot.exists()) {
        logFinalOutcome("missing_profile");
        throw new HttpsError("permission-denied", "Su cuenta no está habilitada para esta operación.");
      }
      if (!centerSnapshot.exists()) {
        logFinalOutcome("invalid_center");
        throw new HttpsError("not-found", "El centro solicitado no está disponible.");
      }

      const profile = profileSnapshot.val() as UserProfile;
      const center = centerSnapshot.val() as CenterConfig;
      if (profile.role === "operator-window-1") safeWindow = 1;
      if (profile.role === "operator-window-2") safeWindow = 2;
      if (profile.uid !== uid || profile.enabled !== true) {
        logFinalOutcome("disabled_or_invalid_profile");
        throw new HttpsError("permission-denied", "Su cuenta no está habilitada para esta operación.");
      }
      if (!profile.centerIds?.includes(centerId) || profile.centerAccess?.[centerId] !== true) {
        logFinalOutcome("center_access_denied");
        throw new HttpsError("permission-denied", "No tiene permisos para operar en este centro.");
      }
      if (!safeWindow) {
        logFinalOutcome("wrong_role");
        throw new HttpsError("permission-denied", "No tiene permisos para operar esta ventanilla.");
      }
      const windows = valuesOf(center.windows);
      const windowId = authorizedWindowId(profile, uid, centerId, requestedWindowId, windows);
      if (!windowId) {
        logFinalOutcome("wrong_window");
        throw new HttpsError("permission-denied", "No tiene permisos para operar esta ventanilla.");
      }
      if (center.centerId !== centerId || center.enabled !== true) {
        logFinalOutcome("invalid_center");
        throw new HttpsError("failed-precondition", "El centro no está disponible.");
      }

      const now = new Date();
      const timestamp = now.getTime();
      const { dayId } = dateTimeInZone(now, center.timezone);
      const sessionId = `${centerId}-${dayId}`;
      const eventId = randomUUID();
      const dayReference = database.ref(`days/${centerId}/${dayId}`);
      failureStage = "day_hydration";
      const mutationOutcome = await runCallNextWindowTransaction(
        (onValue, onError) => {
          const listener = dayReference.on(
            "value",
            (snapshot) => onValue(snapshot.exists()),
            onError,
          );
          return () => dayReference.off("value", listener);
        },
        async (update) => {
          failureStage = "transaction";
          const transaction = await dayReference.transaction(
            (currentValue) => update(currentValue as WindowDay | null),
            undefined,
            false,
          );
          return {
            committed: transaction.committed,
            value: transaction.snapshot.val() as WindowDay | null,
          };
        },
        {
            centerId,
            sessionId,
            windowId,
            role: profile.role as WindowRole,
            uid,
            timestamp,
            eventId,
        },
      );

      if (mutationOutcome.status !== "called" || !mutationOutcome.caseId) {
        const response = callNextWindowResponse(mutationOutcome.status);
        logFinalOutcome(response.outcome);
        return response;
      }
      const committedCase = mutationOutcome.committedDay?.cases?.[mutationOutcome.caseId] ?? null;
      if (!committedCase) throw new Error("COMMITTED_CASE_NOT_FOUND");

      const destination = `Ventanilla ${committedCase.assignedWindowNumber}`;
      failureStage = "public_projection";
      await database.ref().update({
        [`public/turns/${committedCase.publicToken}`]: {
          centerId,
          publicCode: committedCase.publicCode,
          isPriority: committedCase.isPriority,
          status: `Diríjase a ${destination}`,
          serviceType: committedCase.serviceType,
          serviceLabel: committedCase.serviceLabel,
          destination,
          updatedAt: timestamp,
          requirements: publicRequirements(center, committedCase.serviceType),
          paymentMethods: publicPaymentMethods(center),
        },
        [`public/displays/${centerId}/${dayId}/${committedCase.caseId}`]: {
          publicCode: committedCase.publicCode,
          isPriority: committedCase.isPriority,
          status: `Diríjase a ${destination}`,
          destination,
          updatedAt: timestamp,
        },
        [`public/displayCalls/${centerId}/${dayId}/${eventId}`]: {
          publicCode: committedCase.publicCode,
          isPriority: committedCase.isPriority,
          destinationType: "window",
          destinationLabel: destination,
          calledAt: timestamp,
        },
      });

      logFinalOutcome("called", { publicCode: committedCase.publicCode });
      return callNextWindowResponse("called", committedCase.publicCode);
    } catch (error) {
      if (!finalOutcomeLogged) {
        const errorCategory = error instanceof Error && [
          "CALL_NEXT_TRANSACTION_INVALID_COMMIT",
          "CALL_NEXT_TRANSACTION_NOT_COMMITTED",
          "CALL_NEXT_TRANSACTION_ABORTED",
          "COMMITTED_CASE_NOT_FOUND",
        ].includes(error.message)
          ? error.message.toLowerCase()
          : "unexpected_error";
        logFinalOutcome("internal_error", { stage: failureStage, errorCategory });
      }
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "No fue posible llamar el siguiente turno. Intente nuevamente.");
    }
  },
);

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

const serviceTypes: ServiceType[] = ["representation", "vehicle_owner"];
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const centerIdPattern = /^[A-Za-z0-9_-]{1,128}$/;

const recordOf = <T>(value: unknown): Record<string, T> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, T>) }
    : {};

const valuesOf = <T>(value: T[] | Record<string, T> | undefined): T[] =>
  Array.isArray(value) ? value : Object.values(value ?? {});

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
        publicCode: committedCase.publicCode,
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

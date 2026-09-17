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
type PriorityType =
  | "older_adult"
  | "pregnant"
  | "wheelchair_user"
  | "disability"
  | "reduced_mobility"
  | "other";

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

interface PriorityArrivalContext {
  centerId: string;
  sessionId: string;
  dayId: string;
  role: WindowRole;
  window: CenterWindow;
  priorityType: PriorityType;
  timestamp: number;
  caseId: string;
  publicToken: string;
  arrivalEventId: string;
  priorityEventId: string;
}

interface CommittedPriorityArrival {
  createdCase: Record<string, unknown>;
  metadata: unknown;
  events: [unknown, unknown];
}

type PriorityMutationOperation = "set" | "change" | "remove";
interface PriorityMutationContext {
  centerId: string;
  sessionId: string;
  caseId: string;
  windowId: string;
  serviceType: ServiceType;
  role: WindowRole;
  uid: string;
  operation: PriorityMutationOperation;
  priorityType: PriorityType | null;
  timestamp: number;
  eventId: string;
}

type WindowTransitionOperation = "start" | "no_show";
interface WindowTransitionContext {
  centerId: string;
  sessionId: string;
  caseId: string;
  windowId: string;
  serviceType: ServiceType;
  role: WindowRole;
  uid: string;
  operation: WindowTransitionOperation;
  timestamp: number;
  eventId: string;
}

let priorityArrivalAfterCommitTestHook: (() => void) | null = null;
let priorityArrivalBeforeTransactionTestHook: (() => void) | null = null;
export const setPriorityArrivalAfterCommitTestHook = (hook: (() => void) | null) => {
  if (!process.env.FIREBASE_DATABASE_EMULATOR_HOST) {
    throw new Error("PRIORITY_TEST_HOOK_REQUIRES_EMULATOR");
  }
  priorityArrivalAfterCommitTestHook = hook;
};
export const setPriorityArrivalBeforeTransactionTestHook = (hook: (() => void) | null) => {
  if (!process.env.FIREBASE_DATABASE_EMULATOR_HOST) {
    throw new Error("PRIORITY_TEST_HOOK_REQUIRES_EMULATOR");
  }
  priorityArrivalBeforeTransactionTestHook = hook;
};

const serviceTypes: ServiceType[] = ["representation", "vehicle_owner"];
const priorityTypes: PriorityType[] = [
  "older_adult", "pregnant", "wheelchair_user", "disability", "reduced_mobility", "other",
];
export const isPriorityArrivalInput = (value: unknown): value is { centerId: string; priorityType: PriorityType } => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  return Object.keys(input).length === 2 && typeof input.centerId === "string" &&
    centerIdPattern.test(input.centerId) && typeof input.priorityType === "string" &&
    priorityTypes.includes(input.priorityType as PriorityType);
};
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

export const authorizePriorityWindow = (
  profile: UserProfile | null,
  uid: string,
  centerId: string,
  windows: CenterWindow[],
) => {
  if (!profile || profile.uid !== uid || profile.enabled !== true) return null;
  if (!profile.centerIds?.includes(centerId) || profile.centerAccess?.[centerId] !== true) return null;
  const windowNumber = profile.role === "operator-window-1" ? 1 :
    profile.role === "operator-window-2" ? 2 : null;
  if (!windowNumber) return null;
  const windowItem = windows.find((item) => item.windowNumber === windowNumber && item.enabled === true);
  return windowItem && windowItem.windowId && /^V[1-9]\d*$/.test(windowItem.publicCodePrefix) &&
    serviceTypes.includes(windowItem.serviceType) && typeof windowItem.serviceLabel === "string" &&
    ["enhanced", "standard"].includes(windowItem.validationLevel) ? windowItem : null;
};

export const applyPriorityArrivalMutation = (
  currentDay: WindowDay | null,
  context: PriorityArrivalContext,
  allowInitialization: boolean,
) => {
  if (!currentDay && !allowInitialization) {
    return { status: "transaction-conflict" as const, day: undefined };
  }
  const day = currentDay ?? {};
  const metadata = recordOf<unknown>(day.metadata);
  if (metadata.status === "closed") return { status: "closed" as const, day: undefined };
  const windowSequences = recordOf<number>(metadata.windowSequences);
  const storedSequence = windowSequences[context.window.windowId];
  const currentSequence = Number.isSafeInteger(storedSequence) && storedSequence >= 0 ? storedSequence : 0;
  const publicSequence = currentSequence + 1;
  const storedGlobalSequence = metadata.nextGlobalArrivalSequence;
  const globalArrivalSequence = typeof storedGlobalSequence === "number" &&
    Number.isSafeInteger(storedGlobalSequence) && storedGlobalSequence >= 1 ? storedGlobalSequence : 1;
  const publicCode = `${context.window.publicCodePrefix}-${String(publicSequence).padStart(2, "0")}`;
  const caseRecord = {
    caseId: context.caseId, publicToken: context.publicToken, centerId: context.centerId,
    sessionId: context.sessionId, publicCode, globalArrivalSequence, publicSequence,
    serviceType: context.window.serviceType, serviceLabel: context.window.serviceLabel,
    validationLevel: context.window.validationLevel, personKind: "not_specified",
    assignedWindowId: context.window.windowId, assignedWindowNumber: context.window.windowNumber,
    assignedOperatorId: null, isPriority: true, priorityType: context.priorityType,
    priorityCreatedBy: context.role, priorityCreatedAt: context.timestamp,
    currentState: "waiting_document_validation", arrivalAt: context.timestamp,
    calledToWindowAt: null, documentValidationStartedAt: null,
    documentValidationCompletedAt: null, documentStatus: "pending",
    optionalInternalNote: null, folderCode: null, paymentQueueNumber: null,
    paymentTicketId: null, cashierId: null, calledToCashierAt: null,
    cashierStartedAt: null, paymentCompletedAt: null, completedAt: null,
    updatedAt: context.timestamp,
  };
  const event = (eventId: string, action: string, fromState: string | null, optionalNote: string | null) => ({
    eventId, centerId: context.centerId, sessionId: context.sessionId, caseId: context.caseId,
    actorRole: context.role, actorId: context.role, action, fromState,
    toState: "waiting_document_validation", timestamp: context.timestamp, optionalNote,
  });
  return {
    status: "created" as const,
    caseRecord,
    day: {
      ...day,
      metadata: {
        sessionId: context.sessionId, centerId: context.centerId, date: context.dayId, status: "open",
        nextGlobalArrivalSequence: globalArrivalSequence + 1,
        windowSequences: { ...windowSequences, [context.window.windowId]: publicSequence },
        consecutivePriorityCasesByWindow: metadata.consecutivePriorityCasesByWindow ?? {},
        consecutivePriorityCasesForCashier: metadata.consecutivePriorityCasesForCashier ?? 0,
        nextFolderNumber: metadata.nextFolderNumber ?? 1,
        nextPaymentQueueNumber: metadata.nextPaymentQueueNumber ?? 1,
        openedAt: metadata.openedAt ?? context.timestamp, closedAt: null,
      },
      cases: { ...recordOf(day.cases), [context.caseId]: caseRecord },
      events: {
        ...recordOf(day.events),
        [context.arrivalEventId]: event(context.arrivalEventId, "arrival_created", null, null),
        [context.priorityEventId]: event(
          context.priorityEventId, "priority_created", "waiting_document_validation", context.priorityType,
        ),
      },
    } as WindowDay,
  };
};

export const runPriorityArrivalTransaction = async (
  subscribeToAuthoritativeDay: (
    onValue: (exists: boolean) => void,
    onError: (error: unknown) => void,
  ) => () => void,
  transact: (
    update: (currentDay: WindowDay | null) => WindowDay | undefined,
  ) => Promise<{ committed: boolean; value: WindowDay | null }>,
  context: PriorityArrivalContext,
) => {
  let detachListener = () => {};
  try {
    const authoritativeDayExists = await new Promise<boolean>((resolve, reject) => {
      detachListener = subscribeToAuthoritativeDay(resolve, reject);
    });
    const outcomeHolder: { value: ReturnType<typeof applyPriorityArrivalMutation> | null } = { value: null };
    const transaction = await transact((currentDay) => {
      outcomeHolder.value = applyPriorityArrivalMutation(currentDay, context, !authoritativeDayExists);
      return outcomeHolder.value.day;
    });
    const outcome = outcomeHolder.value;
    if (transaction.committed && outcome?.status === "created") {
      return { status: "created" as const, caseRecord: outcome.caseRecord, committedDay: transaction.value };
    }
    if (outcome?.status === "closed") return { status: "closed" as const, caseRecord: null, committedDay: null };
    return { status: "transaction-conflict" as const, caseRecord: null, committedDay: null };
  } finally {
    detachListener();
  }
};

const priorityCreatedResponse = (
  committed: CommittedPriorityArrival,
  outcome: "created" | "created_but_projection_sync_failed",
) => ({ ok: true, outcome, ...committed });

export const completePriorityArrivalAfterCommit = async (
  committed: CommittedPriorityArrival,
  syncProjection: () => Promise<void>,
) => {
  try {
    await syncProjection();
    return priorityCreatedResponse(committed, "created");
  } catch {
    return priorityCreatedResponse(committed, "created_but_projection_sync_failed");
  }
};

export const applyExistingCasePriorityMutation = (
  currentDay: WindowDay | null,
  context: PriorityMutationContext,
) => {
  if (!currentDay) return { status: "case_not_found" as const, day: undefined, caseRecord: null, event: null };
  const cases = recordOf<WindowCase>(currentDay.cases);
  const current = cases[context.caseId];
  if (!current) return { status: "case_not_found" as const, day: undefined, caseRecord: null, event: null };
  if (current.centerId !== context.centerId || current.sessionId !== context.sessionId ||
    current.assignedWindowId !== context.windowId || current.serviceType !== context.serviceType) {
    return { status: "unauthorized" as const, day: undefined, caseRecord: null, event: null };
  }
  if (!["waiting_document_validation", "called_to_window", "in_document_validation"].includes(current.currentState)) {
    return { status: "invalid_case_state" as const, day: undefined, caseRecord: null, event: null };
  }
  if ((context.operation === "set" && current.isPriority) ||
    (context.operation === "change" && (!current.isPriority || current.priorityType === context.priorityType)) ||
    (context.operation === "remove" && !current.isPriority)) {
    return { status: "conflict" as const, day: undefined, caseRecord: null, event: null };
  }
  const nextCase: WindowCase = {
    ...current,
    isPriority: context.operation !== "remove",
    priorityType: context.operation === "remove" ? null : context.priorityType,
  };
  const action = context.operation === "set" ? "priority_created" :
    context.operation === "change" ? "priority_updated" : "priority_removed";
  const event = {
    eventId: context.eventId, centerId: context.centerId, sessionId: context.sessionId,
    caseId: context.caseId, actorRole: context.role, actorId: context.uid, action,
    fromState: current.currentState, toState: current.currentState, timestamp: context.timestamp,
    optionalNote: context.operation === "remove" ? (current.priorityType ?? null) : context.priorityType,
  };
  return {
    status: context.operation === "remove" ? "removed" as const : "updated" as const,
    caseRecord: nextCase,
    event,
    day: {
      ...currentDay,
      cases: { ...cases, [context.caseId]: nextCase },
      events: { ...recordOf(currentDay.events), [context.eventId]: event },
    } as WindowDay,
  };
};

export const runExistingCasePriorityTransaction = async (
  subscribeToAuthoritativeDay: (
    onValue: (exists: boolean) => void,
    onError: (error: unknown) => void,
  ) => () => void,
  transact: (
    update: (currentDay: WindowDay | null) => WindowDay | undefined,
  ) => Promise<{ committed: boolean; value: WindowDay | null }>,
  context: PriorityMutationContext,
) => {
  let detach = () => {};
  try {
    const exists = await new Promise<boolean>((resolve, reject) => {
      detach = subscribeToAuthoritativeDay(resolve, reject);
    });
    if (!exists) return { status: "case_not_found" as const, caseRecord: null, event: null };
    const holder: { value: ReturnType<typeof applyExistingCasePriorityMutation> | null } = { value: null };
    const transaction = await transact((day) => {
      holder.value = applyExistingCasePriorityMutation(day, context);
      return holder.value.day;
    });
    const outcome = holder.value;
    if (transaction.committed && outcome && (outcome.status === "updated" || outcome.status === "removed")) {
      return { status: outcome.status, caseRecord: outcome.caseRecord, event: outcome.event };
    }
    return { status: outcome?.status ?? "conflict" as const, caseRecord: null, event: null };
  } finally {
    detach();
  }
};

export const applyWindowTransitionMutation = (
  currentDay: WindowDay | null,
  context: WindowTransitionContext,
) => {
  if (!currentDay) return { status: "case_not_found" as const, day: undefined, caseRecord: null, event: null };
  const cases = recordOf<WindowCase>(currentDay.cases);
  const current = cases[context.caseId];
  if (!current) return { status: "case_not_found" as const, day: undefined, caseRecord: null, event: null };
  if (current.centerId !== context.centerId || current.sessionId !== context.sessionId ||
    current.assignedWindowId !== context.windowId || current.serviceType !== context.serviceType ||
    current.assignedOperatorId !== context.role) {
    return { status: "unauthorized" as const, day: undefined, caseRecord: null, event: null };
  }
  if (current.currentState !== "called_to_window") {
    return { status: "invalid_case_state" as const, day: undefined, caseRecord: null, event: null };
  }
  const nextState = context.operation === "start" ? "in_document_validation" : "no_show";
  const nextCase: WindowCase = {
    ...current,
    currentState: nextState,
    ...(context.operation === "start" ? { documentValidationStartedAt: context.timestamp } : {}),
    updatedAt: context.timestamp,
  };
  const event = {
    eventId: context.eventId, centerId: context.centerId, sessionId: context.sessionId,
    caseId: context.caseId, actorRole: context.role, actorId: context.uid,
    action: context.operation === "start" ? "validation_started" : "window_no_show",
    fromState: current.currentState, toState: nextState, timestamp: context.timestamp, optionalNote: null,
  };
  return {
    status: context.operation === "start" ? "started" as const : "no_show" as const,
    caseRecord: nextCase,
    event,
    day: {
      ...currentDay,
      cases: { ...cases, [context.caseId]: nextCase },
      events: { ...recordOf(currentDay.events), [context.eventId]: event },
    } as WindowDay,
  };
};

export const runWindowTransitionTransaction = async (
  subscribeToAuthoritativeDay: (
    onValue: (exists: boolean) => void,
    onError: (error: unknown) => void,
  ) => () => void,
  transact: (
    update: (currentDay: WindowDay | null) => WindowDay | undefined,
  ) => Promise<{ committed: boolean; value: WindowDay | null }>,
  context: WindowTransitionContext,
) => {
  let detach = () => {};
  try {
    const exists = await new Promise<boolean>((resolve, reject) => {
      detach = subscribeToAuthoritativeDay(resolve, reject);
    });
    if (!exists) return { status: "case_not_found" as const, caseRecord: null, event: null };
    const holder: { value: ReturnType<typeof applyWindowTransitionMutation> | null } = { value: null };
    const transaction = await transact((day) => {
      holder.value = applyWindowTransitionMutation(day, context);
      return holder.value.day;
    });
    const outcome = holder.value;
    if (transaction.committed && outcome && (outcome.status === "started" || outcome.status === "no_show")) {
      return { status: outcome.status, caseRecord: outcome.caseRecord, event: outcome.event };
    }
    return { status: outcome?.status ?? "conflict" as const, caseRecord: null, event: null };
  } finally {
    detach();
  }
};

export const completeWindowTransitionAfterCommit = async (
  committed: { status: "started" | "no_show"; caseRecord: WindowCase; event: unknown },
  syncProjection: () => Promise<void>,
) => {
  try {
    await syncProjection();
    return { ok: true, outcome: committed.status, caseRecord: committed.caseRecord, event: committed.event };
  } catch {
    return {
      ok: true,
      outcome: `${committed.status}_projection_failed` as "started_projection_failed" | "no_show_projection_failed",
      caseRecord: committed.caseRecord,
      event: committed.event,
    };
  }
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

export const resolvePrioritySchedule = (
  center: CenterConfig,
  requestedCenterId: string,
  now: Date,
) => {
  if (center.centerId !== requestedCenterId || center.enabled !== true) {
    return { outcome: "config_unavailable" as const };
  }
  try {
    const localTime = dateTimeInZone(now, center.timezone);
    return isWithinServiceHours(center, localTime.minutes)
      ? { outcome: "open" as const, ...localTime }
      : { outcome: "closed" as const };
  } catch {
    return { outcome: "config_unavailable" as const };
  }
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

export const createPriorityArrival = onCall(
  { region: "us-central1", enforceAppCheck: false },
  async (request) => {
    const startedAt = Date.now();
    let centerForLog: string | null = null;
    let windowForLog: number | null = null;
    let committed = false;
    let commitRecovery: {
      committed: boolean;
      snapshot: { child: (path: string) => { val: () => unknown } } | null;
      caseId: string;
      priorityEventId: string;
      arrivalEventId: string;
    } | null = null;
    let committedPayload: CommittedPriorityArrival | null = null;
    let logged = false;
    const log = (outcome: string, stage: string) => {
      if (logged) return;
      logged = true;
      try {
        console.info({
          operation: "createPriorityArrival", outcome, stage, center: centerForLog,
          window: windowForLog, transactionCommitted: committed, durationMs: Date.now() - startedAt,
        });
      } catch {
        // Logging must never change the business outcome returned to the operator.
      }
    };
    try {
      if (!request.auth?.uid) {
        log("unauthenticated", "authorization");
        return { ok: false, outcome: "unauthenticated" as const };
      }
      if (!isPriorityArrivalInput(request.data)) {
        log("invalid_priority", "input");
        return { ok: false, outcome: "invalid_priority" as const };
      }
      const centerId = request.data.centerId;
      const priorityType = request.data.priorityType;
      centerForLog = centerId;
      const uid = request.auth.uid;
      const database = getDatabase();
      const [profileSnapshot, centerSnapshot] = await Promise.all([
        database.ref(`users/${uid}`).get(), database.ref(`centers/${centerId}`).get(),
      ]);
      if (!profileSnapshot.exists()) {
        log("unauthorized", "profile");
        return { ok: false, outcome: "unauthorized" as const };
      }
      if (!centerSnapshot.exists()) {
        log("config_unavailable", "center");
        return { ok: false, outcome: "config_unavailable" as const };
      }
      const profile = profileSnapshot.val() as UserProfile;
      const center = centerSnapshot.val() as CenterConfig;
      if (profile.role === "operator-window-1") windowForLog = 1;
      if (profile.role === "operator-window-2") windowForLog = 2;
      const assignedWindow = authorizePriorityWindow(profile, uid, centerId, valuesOf(center.windows));
      if (!assignedWindow) {
        log("unauthorized", "authority");
        return { ok: false, outcome: "unauthorized" as const };
      }
      const now = new Date();
      const timestamp = now.getTime();
      const schedule = resolvePrioritySchedule(center, centerId, now);
      if (schedule.outcome === "closed") {
        log("closed", "schedule");
        return { ok: false, outcome: "closed" as const };
      }
      if (schedule.outcome !== "open") {
        log("config_unavailable", "schedule");
        return { ok: false, outcome: "config_unavailable" as const };
      }
      const traceGroupId = randomUUID();
      const context: PriorityArrivalContext = {
        centerId, dayId: schedule.dayId, sessionId: `${centerId}-${schedule.dayId}`,
        role: profile.role as WindowRole, window: assignedWindow, priorityType, timestamp,
        caseId: randomUUID(), publicToken: randomUUID(),
        priorityEventId: `${traceGroupId}-0-priority`,
        arrivalEventId: `${traceGroupId}-1-arrival`,
      };
      const dayReference = database.ref(`days/${centerId}/${schedule.dayId}`);
      commitRecovery = {
        committed: false,
        snapshot: null,
        caseId: context.caseId,
        priorityEventId: context.priorityEventId,
        arrivalEventId: context.arrivalEventId,
      };
      priorityArrivalBeforeTransactionTestHook?.();
      const transaction = await runPriorityArrivalTransaction(
        (onValue, onError) => {
          const listener = dayReference.on("value", (snapshot) => onValue(snapshot.exists()), onError);
          return () => dayReference.off("value", listener);
        },
        async (update) => {
          const result = await dayReference.transaction(update, undefined, false);
          if (result.committed && commitRecovery) {
            commitRecovery.snapshot = result.snapshot;
            commitRecovery.committed = true;
            committed = true;
            priorityArrivalAfterCommitTestHook?.();
          }
          return { committed: result.committed, value: result.snapshot.val() as WindowDay | null };
        },
        context,
      );
      if (transaction.status === "closed") {
        log("closed", "transaction");
        return { ok: false, outcome: "closed" as const };
      }
      if (transaction.status !== "created" || !transaction.caseRecord || !transaction.committedDay) {
        log("transaction_conflict", "transaction");
        return { ok: false, outcome: "transaction_conflict" as const };
      }
      committed = true;
      const createdCase = transaction.caseRecord;
      const metadata = transaction.committedDay.metadata;
      const events = recordOf(transaction.committedDay.events);
      committedPayload = {
        createdCase,
        metadata,
        events: [events[context.priorityEventId], events[context.arrivalEventId]],
      };
      const response = await completePriorityArrivalAfterCommit(committedPayload, async () => {
        await database.ref().update({
          [`public/turns/${context.publicToken}`]: {
            centerId, publicCode: createdCase.publicCode, isPriority: true,
            status: "Prepare su documentación", serviceType: assignedWindow.serviceType,
            serviceLabel: assignedWindow.serviceLabel,
            destination: `Ventanilla ${assignedWindow.windowNumber}`, updatedAt: timestamp,
            requirements: publicRequirements(center, assignedWindow.serviceType),
            paymentMethods: publicPaymentMethods(center),
          },
          [`public/displays/${centerId}/${schedule.dayId}/cases/${context.caseId}`]: null,
        });
      });
      if (response.outcome === "created_but_projection_sync_failed") {
        log("created_but_projection_sync_failed", "projection");
        return response;
      }
      log("created", "complete");
      return response;
    } catch (error) {
      if (commitRecovery?.committed) {
        try {
          const snapshot = commitRecovery.snapshot;
          if (snapshot) {
            committedPayload = {
              createdCase: snapshot.child(`cases/${commitRecovery.caseId}`).val() as Record<string, unknown>,
              metadata: snapshot.child("metadata").val(),
              events: [
                snapshot.child(`events/${commitRecovery.priorityEventId}`).val(),
                snapshot.child(`events/${commitRecovery.arrivalEventId}`).val(),
              ],
            };
          }
        } catch {
          committedPayload = null;
        }
        if (!committedPayload) {
          log("created_but_projection_sync_failed", "post_commit_recovery");
          return { ok: true, outcome: "created_but_projection_sync_failed" as const };
        }
      }
      if (committedPayload) {
        log("created_but_projection_sync_failed", "post_commit");
        try {
          console.error({ operation: "createPriorityArrival", category: "post_commit_warning" });
        } catch {
          // Preserve duplicate-safe client semantics even if diagnostic output fails.
        }
        return priorityCreatedResponse(committedPayload, "created_but_projection_sync_failed");
      }
      log("internal_error", "internal");
      try {
        console.error({ operation: "createPriorityArrival", category: "internal_error" });
      } catch {
        // The controlled client response remains authoritative.
      }
      return { ok: false, outcome: "internal_error" as const };
    }
  },
);

export const updateCasePriority = onCall(
  { region: "us-central1", enforceAppCheck: false },
  async (request) => {
    const startedAt = Date.now();
    let centerForLog: string | null = null;
    let windowForLog: number | null = null;
    let committed = false;
    const finish = (outcome: string) => {
      try {
        console.info({ operation: "updateCasePriority", outcome, center: centerForLog,
          window: windowForLog, transactionCommitted: committed, durationMs: Date.now() - startedAt });
      } catch { /* logging cannot alter the outcome */ }
    };
    try {
      if (!request.auth?.uid) { finish("unauthenticated"); return { ok: false, outcome: "unauthenticated" as const }; }
      const input = request.data as Record<string, unknown> | null;
      const operation = input?.operation;
      const priorityType = input?.priorityType;
      const expectedKeys = operation === "remove" ? 3 : 4;
      if (!input || Array.isArray(input) || Object.keys(input).length !== expectedKeys ||
        typeof input.centerId !== "string" || !centerIdPattern.test(input.centerId) ||
        typeof input.caseId !== "string" || !/^[A-Za-z0-9_-]{1,256}$/.test(input.caseId) ||
        !["set", "change", "remove"].includes(operation as string) ||
        (operation === "remove" ? "priorityType" in input :
          typeof priorityType !== "string" || !priorityTypes.includes(priorityType as PriorityType))) {
        const invalidPriority = (operation === "set" || operation === "change") &&
          (typeof priorityType !== "string" || !priorityTypes.includes(priorityType as PriorityType));
        finish(invalidPriority ? "invalid_priority" : "invalid_operation");
        return { ok: false, outcome: invalidPriority ? "invalid_priority" as const : "invalid_operation" as const };
      }
      const centerId = input.centerId;
      const caseId = input.caseId;
      centerForLog = centerId;
      const database = getDatabase();
      const [profileSnapshot, centerSnapshot] = await Promise.all([
        database.ref(`users/${request.auth.uid}`).get(), database.ref(`centers/${centerId}`).get(),
      ]);
      if (!profileSnapshot.exists()) { finish("unauthorized"); return { ok: false, outcome: "unauthorized" as const }; }
      if (!centerSnapshot.exists()) { finish("config_unavailable"); return { ok: false, outcome: "config_unavailable" as const }; }
      const profile = profileSnapshot.val() as UserProfile;
      const center = centerSnapshot.val() as CenterConfig;
      const windowItem = authorizePriorityWindow(profile, request.auth.uid, centerId, valuesOf(center.windows));
      if (profile.role === "operator-window-1") windowForLog = 1;
      if (profile.role === "operator-window-2") windowForLog = 2;
      if (!windowItem) { finish("unauthorized"); return { ok: false, outcome: "unauthorized" as const }; }
      if (center.centerId !== centerId || center.enabled !== true) {
        finish("config_unavailable"); return { ok: false, outcome: "config_unavailable" as const };
      }
      let dayId: string;
      try { dayId = dateTimeInZone(new Date(), center.timezone).dayId; }
      catch { finish("config_unavailable"); return { ok: false, outcome: "config_unavailable" as const }; }
      const timestamp = Date.now();
      const context: PriorityMutationContext = {
        centerId, sessionId: `${centerId}-${dayId}`, caseId, windowId: windowItem.windowId,
        serviceType: windowItem.serviceType, role: profile.role as WindowRole, uid: request.auth.uid,
        operation: operation as PriorityMutationOperation,
        priorityType: operation === "remove" ? null : priorityType as PriorityType,
        timestamp, eventId: randomUUID(),
      };
      const reference = database.ref(`days/${centerId}/${dayId}`);
      const result = await runExistingCasePriorityTransaction(
        (onValue, onError) => {
          const listener = reference.on("value", (snapshot) => onValue(snapshot.exists()), onError);
          return () => reference.off("value", listener);
        },
        async (update) => {
          const tx = await reference.transaction(update, undefined, false);
          return { committed: tx.committed, value: tx.snapshot.val() as WindowDay | null };
        },
        context,
      );
      if (result.status !== "updated" && result.status !== "removed") {
        finish(result.status);
        return { ok: false, outcome: result.status };
      }
      committed = true;
      const current = result.caseRecord as WindowCase;
      const event = result.event;
      try {
        const status = current.currentState === "called_to_window" ? `Diríjase a Ventanilla ${current.assignedWindowNumber}` :
          current.currentState === "in_document_validation" ? "Atención en ventanilla" : "Prepare su documentación";
        const destination = `Ventanilla ${current.assignedWindowNumber}`;
        await database.ref().update({
          [`public/turns/${current.publicToken}`]: {
            centerId, publicCode: current.publicCode, isPriority: current.isPriority, status,
            serviceType: current.serviceType, serviceLabel: current.serviceLabel, destination,
            updatedAt: current.updatedAt, requirements: publicRequirements(center, current.serviceType),
            paymentMethods: publicPaymentMethods(center),
          },
          [`public/displays/${centerId}/${dayId}/cases/${caseId}`]:
            current.currentState === "waiting_document_validation" ? null : {
              publicCode: current.publicCode, isPriority: current.isPriority, status, destination,
              updatedAt: current.updatedAt,
            },
        });
      } catch {
        finish(`${result.status}_projection_failed`);
        return { ok: true, outcome: `${result.status}_projection_failed`, caseRecord: current, event };
      }
      finish(result.status);
      return { ok: true, outcome: result.status, caseRecord: current, event };
    } catch {
      finish("internal_error");
      return { ok: false, outcome: "internal_error" as const };
    }
  },
);

const createWindowTransitionCallable = (operation: WindowTransitionOperation) => onCall(
  { region: "us-central1", enforceAppCheck: false },
  async (request) => {
    const operationName = operation === "start" ? "startWindowValidation" : "markWindowCaseNoShow";
    const startedAt = Date.now();
    let centerForLog: string | null = null;
    let windowForLog: number | null = null;
    let committed: { status: "started" | "no_show"; caseRecord: WindowCase; event: unknown } | null = null;
    const finish = (outcome: string) => {
      try {
        console.info({ operation: operationName, outcome, center: centerForLog, window: windowForLog,
          transactionCommitted: Boolean(committed), durationMs: Date.now() - startedAt });
      } catch { /* logging cannot alter the outcome */ }
    };
    try {
      if (!request.auth?.uid) { finish("unauthenticated"); return { ok: false, outcome: "unauthenticated" as const }; }
      const input = request.data as Record<string, unknown> | null;
      if (!input || Array.isArray(input) || Object.keys(input).length !== 2 ||
        typeof input.centerId !== "string" || !centerIdPattern.test(input.centerId) ||
        typeof input.caseId !== "string" || !/^[A-Za-z0-9_-]{1,256}$/.test(input.caseId)) {
        finish("invalid_request"); return { ok: false, outcome: "invalid_request" as const };
      }
      const centerId = input.centerId;
      const caseId = input.caseId;
      const uid = request.auth.uid;
      centerForLog = centerId;
      const database = getDatabase();
      const [profileSnapshot, centerSnapshot] = await Promise.all([
        database.ref(`users/${uid}`).get(), database.ref(`centers/${centerId}`).get(),
      ]);
      if (!profileSnapshot.exists()) { finish("unauthorized"); return { ok: false, outcome: "unauthorized" as const }; }
      if (!centerSnapshot.exists()) { finish("config_unavailable"); return { ok: false, outcome: "config_unavailable" as const }; }
      const profile = profileSnapshot.val() as UserProfile;
      const center = centerSnapshot.val() as CenterConfig;
      const windowItem = authorizePriorityWindow(profile, uid, centerId, valuesOf(center.windows));
      if (profile.role === "operator-window-1") windowForLog = 1;
      if (profile.role === "operator-window-2") windowForLog = 2;
      if (!windowItem) { finish("unauthorized"); return { ok: false, outcome: "unauthorized" as const }; }
      if (center.centerId !== centerId || center.enabled !== true) {
        finish("config_unavailable"); return { ok: false, outcome: "config_unavailable" as const };
      }
      let dayId: string;
      try { dayId = dateTimeInZone(new Date(), center.timezone).dayId; }
      catch { finish("config_unavailable"); return { ok: false, outcome: "config_unavailable" as const }; }
      const timestamp = Date.now();
      const reference = database.ref(`days/${centerId}/${dayId}`);
      const result = await runWindowTransitionTransaction(
        (onValue, onError) => {
          const listener = reference.on("value", (snapshot) => onValue(snapshot.exists()), onError);
          return () => reference.off("value", listener);
        },
        async (update) => {
          const tx = await reference.transaction(update, undefined, false);
          return { committed: tx.committed, value: tx.snapshot.val() as WindowDay | null };
        },
        {
          centerId, sessionId: `${centerId}-${dayId}`, caseId, windowId: windowItem.windowId,
          serviceType: windowItem.serviceType, role: profile.role as WindowRole, uid, operation,
          timestamp, eventId: randomUUID(),
        },
      );
      if (result.status !== "started" && result.status !== "no_show") {
        finish(result.status); return { ok: false, outcome: result.status };
      }
      committed = { status: result.status, caseRecord: result.caseRecord as WindowCase, event: result.event };
      const response = await completeWindowTransitionAfterCommit(committed, async () => {
        const current = committed?.caseRecord as WindowCase;
        const destination = `Ventanilla ${current.assignedWindowNumber}`;
        const status = operation === "start" ? "Atención en ventanilla" : "No se registró su presentación";
        await database.ref().update({
          [`public/turns/${current.publicToken}`]: {
            centerId, publicCode: current.publicCode, isPriority: current.isPriority, status,
            serviceType: current.serviceType, serviceLabel: current.serviceLabel, destination,
            updatedAt: current.updatedAt, requirements: publicRequirements(center, current.serviceType),
            paymentMethods: publicPaymentMethods(center),
          },
          [`public/displays/${centerId}/${dayId}/cases/${caseId}`]: operation === "start" ? {
            publicCode: current.publicCode, isPriority: current.isPriority, status, destination,
            updatedAt: current.updatedAt,
          } : null,
        });
      });
      finish(response.outcome);
      return response;
    } catch {
      if (committed) {
        const response = await completeWindowTransitionAfterCommit(committed, async () => { throw new Error("post_commit"); });
        finish(response.outcome);
        return response;
      }
      finish("internal_error");
      return { ok: false, outcome: "internal_error" as const };
    }
  },
);

export const startWindowValidation = createWindowTransitionCallable("start");
export const markWindowCaseNoShow = createWindowTransitionCallable("no_show");

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

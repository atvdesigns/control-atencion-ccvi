import type {
  AppData,
  CaseRecord,
  CenterConfig,
  DocumentStatus,
  Metrics,
  PaymentQueueItem,
  PriorityType,
  Role,
  ServiceType,
  TraceEvent,
  WindowConfig,
} from "./types";
import {
  createDefaultDocumentaryRequirements,
  createDefaultPaymentMethods,
  normalizeDocumentaryRequirements,
  normalizePaymentMethods,
} from "./centerJourneyConfig";
import { database, ref, runTransaction } from "./services/firebase";

const STORAGE_KEY = "ccvi-control-atencion-demo-v2-3";

export const todayId = () => new Date().toISOString().slice(0, 10);

const DEFAULT_SERVICE_START_TIME = "08:00";
const DEFAULT_SERVICE_END_TIME = "17:00";
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface DocumentaryPriorityPolicy {
  maxConsecutivePriorityCases: number;
}

export const DEFAULT_DOCUMENTARY_PRIORITY_POLICY: DocumentaryPriorityPolicy = {
  maxConsecutivePriorityCases: 2,
};

export const DEFAULT_CASHIER_PRIORITY_POLICY: DocumentaryPriorityPolicy = {
  maxConsecutivePriorityCases: 2,
};

const pad = (value: number, length = 3) => String(value).padStart(length, "0");

const suffix = () => Math.random().toString(36).slice(2, 4).toUpperCase();

const clampInteger = (value: number, min: number, max: number, fallback: number) => {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(value)));
};

const normalizeServiceTime = (value: string | undefined, fallback: string) =>
  value && TIME_PATTERN.test(value) ? value : fallback;

const timeToMinutes = (time: string) => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

export const getCenterServiceHours = (center: CenterConfig) => ({
  start: normalizeServiceTime(center.serviceStartTime, DEFAULT_SERVICE_START_TIME),
  end: normalizeServiceTime(center.serviceEndTime, DEFAULT_SERVICE_END_TIME),
});

export const isCenterOpenForTickets = (center: CenterConfig, now = new Date()) => {
  const { start, end } = getCenterServiceHours(center);
  const startMinutes = timeToMinutes(start);
  const endMinutes = timeToMinutes(end);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  if (startMinutes === endMinutes) return false;
  if (startMinutes < endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }

  return currentMinutes >= startMinutes || currentMinutes < endMinutes;
};

export const formatServiceHours = (center: CenterConfig) => {
  const { start, end } = getCenterServiceHours(center);
  return `${start} a ${end}`;
};

const normalizeCenter = (center: CenterConfig): CenterConfig => ({
  ...center,
  serviceStartTime: normalizeServiceTime(center.serviceStartTime, DEFAULT_SERVICE_START_TIME),
  serviceEndTime: normalizeServiceTime(center.serviceEndTime, DEFAULT_SERVICE_END_TIME),
  cashierCommissionRate:
    center.cashierCommissionRate !== undefined &&
    Number.isFinite(center.cashierCommissionRate) &&
    center.cashierCommissionRate >= 0
      ? center.cashierCommissionRate
      : undefined,
  cashiers: (center.cashiers ?? []).map((cashier) => ({
    ...cashier,
    cashierName: cashier.cashierName?.trim() || undefined,
  })),
  documentaryRequirements: normalizeDocumentaryRequirements(center.documentaryRequirements),
  paymentMethods: normalizePaymentMethods(center.paymentMethods),
});

const normalizeData = (data: AppData): AppData => ({
  ...data,
  centers: Object.fromEntries(
    Object.entries(data.centers).map(([centerId, center]) => [centerId, normalizeCenter(center)]),
  ),
  cases: Object.fromEntries(
    Object.entries(data.cases ?? {}).map(([caseId, caseItem]) => [
      caseId,
      {
        ...caseItem,
        isPriority: caseItem.isPriority ?? false,
        priorityType: caseItem.priorityType ?? null,
        priorityCreatedBy: caseItem.priorityCreatedBy ?? null,
        priorityCreatedAt: caseItem.priorityCreatedAt ?? null,
      },
    ]),
  ),
  sessions: Object.fromEntries(
    Object.entries(data.sessions ?? {}).map(([sessionId, session]) => [
      sessionId,
      {
        ...session,
        consecutivePriorityCasesByWindow: session.consecutivePriorityCasesByWindow ?? {},
        consecutivePriorityCasesForCashier: session.consecutivePriorityCasesForCashier ?? 0,
      },
    ]),
  ),
});

export const formatPublicCode = (windowNumber: number, sequence: number): string => {
  if (!Number.isInteger(windowNumber) || windowNumber < 1) {
    throw new Error("INVALID_WINDOW_NUMBER");
  }

  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error("INVALID_PUBLIC_SEQUENCE");
  }

  return `V${windowNumber}-${String(sequence).padStart(2, "0")}`;
};

export const getAccessiblePublicCode = (publicCode: string) => {
  const match = /^V(\d+)-(\d+)$/.exec(publicCode);
  if (!match) return `Turno ${publicCode}`;

  const [, windowNumber, sequence] = match;
  return `Turno de Ventanilla ${windowNumber}, número ${sequence
    .split("")
    .map((digit) => (digit === "0" ? "cero" : digit))
    .join(" ")}`;
};

const normalizePublicTicketLabel = (publicCode: string) =>
  publicCode.replace(/(?:\s+P)+$/u, "");

export const formatPublicTicketLabel = (publicCode: string, isPriority: boolean) => {
  const normalizedPublicCode = normalizePublicTicketLabel(publicCode);
  return `${normalizedPublicCode}${isPriority ? " P" : ""}`;
};

export const getAccessiblePublicTicketLabel = (publicCode: string, isPriority: boolean) => {
  const normalizedPublicCode = normalizePublicTicketLabel(publicCode);
  return `Turno ${normalizedPublicCode}${isPriority ? ", atención preferencial" : ""}`;
};

export const serviceLabels: Record<ServiceType, string> = {
  representation: "Representación, empresa o poder notarial",
  vehicle_owner: "Propietario del vehículo retenido",
};

export const serviceSupportText: Record<ServiceType, string> = {
  representation:
    "Seleccione esta opción si representa a una empresa o realiza el trámite en nombre de otra persona mediante un poder notarial.",
  vehicle_owner: "Seleccione esta opción si usted es el propietario del vehículo retenido.",
};

export const roleLabels: Record<Role, string> = {
  kiosk: "Tótem",
  "operator-window-1": "Ventanilla 1",
  "operator-window-2": "Ventanilla 2",
  cashier1: "Caja 1",
  cashier2: "Caja 2",
  cashier3: "Caja 3",
  cashier4: "Caja 4",
  cashier5: "Caja 5",
  admin: "Administrador",
  display: "Monitor público",
};

export const stateLabels: Record<string, string> = {
  arrived: "Turno creado",
  waiting_document_validation: "En espera de atención",
  called_to_window: "Diríjase a ventanilla",
  in_document_validation: "Documentación en revisión",
  documentation_incomplete: "Documentación incompleta",
  rejected: "Trámite no aprobado",
  approved_for_cashier: "Documentación aprobada",
  waiting_cashier: "En espera de caja",
  called_to_cashier: "Diríjase a caja",
  in_cashier_attention: "En atención en caja",
  payment_completed: "Pago registrado",
  completed: "Trámite finalizado",
  no_show: "No se presentó al llamado",
  paused: "Atención pausada",
  cancelled: "Trámite cancelado",
};

const createWindow = (
  centerId: string,
  windowNumber: number,
  serviceType: ServiceType,
  displayOrder: number,
): WindowConfig => ({
  windowId: `${centerId}-window-${windowNumber}`,
  centerId,
  windowNumber,
  name: `Ventanilla ${windowNumber}`,
  serviceType,
  serviceLabel: serviceLabels[serviceType],
  validationLevel: serviceType === "representation" ? "enhanced" : "standard",
  publicCodePrefix: `V${windowNumber}`,
  enabled: true,
  displayOrder,
  version: 1,
});

const windowSequencesFor = (center: CenterConfig): Record<string, number> =>
  center.windows.reduce<Record<string, number>>((acc, windowItem) => {
    acc[windowItem.windowId] = 0;
    return acc;
  }, {});

const issuedWindowSequencesFor = (
  data: AppData,
  center: CenterConfig,
  sessionId: string,
): Record<string, number> => {
  const sequences = windowSequencesFor(center);
  const windowsByNumber = new Map(
    center.windows.map((windowItem) => [windowItem.windowNumber, windowItem]),
  );

  Object.values(data.cases).forEach((caseItem) => {
    if (caseItem.centerId !== center.centerId || caseItem.sessionId !== sessionId) return;

    const match = /^V(\d+)-(\d+)$/.exec(caseItem.publicCode);
    if (!match) return;

    const windowNumber = Number(match[1]);
    const publicSequence = Number(match[2]);
    const issuingWindow = windowsByNumber.get(windowNumber);

    if (!issuingWindow || !Number.isSafeInteger(publicSequence) || publicSequence < 1) return;

    sequences[issuingWindow.windowId] = Math.max(
      sequences[issuingWindow.windowId] ?? 0,
      publicSequence,
    );
  });

  return sequences;
};

export const defaultCenter = (now = Date.now()): CenterConfig => ({
  centerId: "ccvi-san-bernardo",
  shortCode: "SB",
  name: "CCVI San Bernardo",
  address: "Santa Pamela 12030, San Bernardo",
  timezone: "America/Santiago",
  serviceStartTime: DEFAULT_SERVICE_START_TIME,
  serviceEndTime: DEFAULT_SERVICE_END_TIME,
  enabled: true,
  kioskTimeoutSeconds: 12,
  qrEnabled: true,
  paperlessMode: true,
  documentaryRequirements: createDefaultDocumentaryRequirements(),
  paymentMethods: createDefaultPaymentMethods(),
  windows: [
    createWindow("ccvi-san-bernardo", 1, "representation", 1),
    createWindow("ccvi-san-bernardo", 2, "vehicle_owner", 2),
  ],
  cashiers: [1, 2, 3, 4, 5].map((index) => ({
    cashierId: `cashier${index}`,
    centerId: "ccvi-san-bernardo",
    name: `Caja ${index}`,
    enabled: true,
    displayOrder: index,
  })),
  createdAt: now,
  updatedAt: now,
});

export const createInitialData = (): AppData => {
  const center = defaultCenter();
  const sessionId = `${center.centerId}-${todayId()}`;

  return {
    selectedCenterId: center.centerId,
    centers: {
      [center.centerId]: center,
    },
    sessions: {
      [sessionId]: {
        sessionId,
        centerId: center.centerId,
        date: todayId(),
        status: "open",
        nextGlobalArrivalSequence: 1,
        windowSequences: windowSequencesFor(center),
        consecutivePriorityCasesByWindow: {},
        consecutivePriorityCasesForCashier: 0,
        nextFolderNumber: 1,
        nextPaymentQueueNumber: 1,
        openedAt: Date.now(),
        closedAt: null,
      },
    },
    cases: {},
    paymentQueue: {},
    events: [],
  };
};

export const getSessionId = (data: AppData) => `${data.selectedCenterId}-${todayId()}`;

export const getCurrentCenter = (data: AppData) => data.centers[data.selectedCenterId];

export const getCurrentSession = (data: AppData) => {
  const sessionId = getSessionId(data);
  return data.sessions[sessionId];
};

export const ensureSession = (data: AppData): AppData => {
  const sessionId = getSessionId(data);
  const center = getCurrentCenter(data);
  const existing = data.sessions[sessionId];

  if (existing) {
    const normalizedSequences = issuedWindowSequencesFor(data, center, sessionId);
    const sequencesAreCurrent = center.windows.every(
      (windowItem) =>
        existing.windowSequences?.[windowItem.windowId] ===
        normalizedSequences[windowItem.windowId],
    );
    const priorityCountersAreCurrent = Boolean(existing.consecutivePriorityCasesByWindow);
    const cashierPriorityCounterIsCurrent = Number.isInteger(
      existing.consecutivePriorityCasesForCashier,
    );

    if (sequencesAreCurrent && priorityCountersAreCurrent && cashierPriorityCounterIsCurrent) {
      return data;
    }

    return {
      ...data,
      sessions: {
        ...data.sessions,
        [sessionId]: {
          ...existing,
          windowSequences: normalizedSequences,
          consecutivePriorityCasesByWindow: existing.consecutivePriorityCasesByWindow ?? {},
          consecutivePriorityCasesForCashier: existing.consecutivePriorityCasesForCashier ?? 0,
        },
      },
    };
  }

  return {
    ...data,
    sessions: {
      ...data.sessions,
      [sessionId]: {
        sessionId,
        centerId: data.selectedCenterId,
        date: todayId(),
        status: "open",
        nextGlobalArrivalSequence: 1,
        windowSequences: windowSequencesFor(center),
        consecutivePriorityCasesByWindow: {},
        consecutivePriorityCasesForCashier: 0,
        nextFolderNumber: 1,
        nextPaymentQueueNumber: 1,
        openedAt: Date.now(),
        closedAt: null,
      },
    },
  };
};

export const loadData = (): AppData => {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return createInitialData();

  try {
    return ensureSession(normalizeData(JSON.parse(raw) as AppData));
  } catch {
    return createInitialData();
  }
};

export const saveData = (data: AppData) => {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
};

export const event = (
  data: AppData,
  caseId: string,
  actorRole: string,
  action: string,
  fromState: string | null,
  toState: string,
  optionalNote: string | null = null,
): TraceEvent => ({
  eventId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  centerId: data.selectedCenterId,
  sessionId: getSessionId(data),
  caseId,
  actorRole,
  actorId: actorRole,
  action,
  fromState,
  toState,
  timestamp: Date.now(),
  optionalNote,
});

export const getPublicStatusUrl = (publicToken: string) =>
  `${window.location.origin}/turno/${publicToken}`;

const firstEnabledWindowFor = (center: CenterConfig, serviceType: ServiceType) =>
  center.windows
    .filter((windowItem) => windowItem.enabled && windowItem.serviceType === serviceType)
    .sort((a, b) => a.displayOrder - b.displayOrder)[0];

export const windowForRole = (center: CenterConfig, role: Role) => {
  const windowNumber = role === "operator-window-1" ? 1 : role === "operator-window-2" ? 2 : null;
  if (!windowNumber) return null;
  return center.windows.find((windowItem) => windowItem.windowNumber === windowNumber) ?? null;
};

export const createArrival = (data: AppData, serviceType: ServiceType): AppData => {
  const base = ensureSession(data);
  const center = getCurrentCenter(base);
  const session = getCurrentSession(base);
  const assignedWindow = firstEnabledWindowFor(center, serviceType);

  if (!assignedWindow || session.status !== "open" || !isCenterOpenForTickets(center)) return base;

  const now = Date.now();
  const currentSequence = Math.max(0, session.windowSequences[assignedWindow.windowId] ?? 0);
  const publicSequence = currentSequence + 1;
  const publicCode = formatPublicCode(assignedWindow.windowNumber, publicSequence);
  const caseId = `${center.shortCode}-${pad(session.nextGlobalArrivalSequence)}-${suffix()}`;
  const publicToken = `${caseId.toLowerCase()}-${Math.random().toString(36).slice(2, 8)}`;

  const caseRecord: CaseRecord = {
    caseId,
    publicToken,
    centerId: center.centerId,
    sessionId: session.sessionId,
    publicCode,
    globalArrivalSequence: session.nextGlobalArrivalSequence,
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
    arrivalAt: now,
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
    updatedAt: now,
  };

  const updated: AppData = {
    ...base,
    sessions: {
      ...base.sessions,
      [session.sessionId]: {
        ...session,
        nextGlobalArrivalSequence: session.nextGlobalArrivalSequence + 1,
        windowSequences: {
          ...session.windowSequences,
          [assignedWindow.windowId]: publicSequence,
        },
      },
    },
    cases: {
      ...base.cases,
      [caseId]: caseRecord,
    },
  };

  return {
    ...updated,
    events: [
      event(updated, caseId, "kiosk", "arrival_created", null, "waiting_document_validation"),
      ...updated.events,
    ],
  };
};

type RealtimeOperationalDay = {
  metadata?: Partial<ReturnType<typeof getCurrentSession>>;
  cases?: Record<string, CaseRecord>;
  paymentQueue?: Record<string, PaymentQueueItem>;
  events?: Record<string, TraceEvent> | TraceEvent[];
};

const collectionRecord = <T>(value: unknown): Record<string, T> => {
  if (!value || typeof value !== "object") return {};
  return { ...(value as Record<string, T>) };
};

const transactionNonce = () => {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi) throw new Error("SECURE_RANDOM_UNAVAILABLE");

  if (typeof cryptoApi.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }

  const values = new Uint32Array(4);
  cryptoApi.getRandomValues(values);
  return Array.from(values, (value) => value.toString(36)).join("-");
};

export const createArrivalRealtime = async (
  data: AppData,
  serviceType: ServiceType,
): Promise<AppData> => {
  if (!database) return createArrival(data, serviceType);

  const base = ensureSession(data);
  const center = getCurrentCenter(base);
  const session = getCurrentSession(base);
  const assignedWindow = firstEnabledWindowFor(center, serviceType);

  if (!assignedWindow || session.status !== "open" || !isCenterOpenForTickets(center)) {
    return base;
  }

  const now = Date.now();
  const nonce = transactionNonce();
  const caseId = `${center.shortCode}-${session.date}-${nonce}`;
  const publicToken = transactionNonce();
  const eventId = `${now}-${transactionNonce()}`;
  const dayReference = ref(database, `days/${center.centerId}/${session.date}`);

  const result = await runTransaction(
    dayReference,
    (currentValue: RealtimeOperationalDay | null) => {
      const currentDay = currentValue ?? {};
      const currentMetadata = currentDay.metadata ?? {};
      if (currentMetadata.status === "closed") return;

      const windowSequences = collectionRecord<number>(currentMetadata.windowSequences);
      const storedSequence = windowSequences[assignedWindow.windowId];
      const currentSequence =
        Number.isSafeInteger(storedSequence) && storedSequence >= 0 ? storedSequence : 0;
      const publicSequence = currentSequence + 1;
      const publicCode = formatPublicCode(assignedWindow.windowNumber, publicSequence);
      const storedGlobalSequence = currentMetadata.nextGlobalArrivalSequence;
      const globalArrivalSequence =
        typeof storedGlobalSequence === "number" &&
        Number.isSafeInteger(storedGlobalSequence) &&
        storedGlobalSequence >= 1
          ? storedGlobalSequence
          : 1;

      const caseRecord: CaseRecord = {
        caseId,
        publicToken,
        centerId: center.centerId,
        sessionId: session.sessionId,
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
        arrivalAt: now,
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
        updatedAt: now,
      };
      const arrivalEvent: TraceEvent = {
        eventId,
        centerId: center.centerId,
        sessionId: session.sessionId,
        caseId,
        actorRole: "kiosk",
        actorId: "kiosk",
        action: "arrival_created",
        fromState: null,
        toState: "waiting_document_validation",
        timestamp: now,
        optionalNote: null,
      };

      return {
        ...currentDay,
        metadata: {
          ...session,
          ...currentMetadata,
          sessionId: session.sessionId,
          centerId: center.centerId,
          date: session.date,
          status: "open",
          nextGlobalArrivalSequence: globalArrivalSequence + 1,
          windowSequences: {
            ...windowSequences,
            [assignedWindow.windowId]: publicSequence,
          },
        },
        cases: {
          ...collectionRecord<CaseRecord>(currentDay.cases),
          [caseId]: caseRecord,
        },
        events: {
          ...collectionRecord<TraceEvent>(currentDay.events),
          [eventId]: arrivalEvent,
        },
      } satisfies RealtimeOperationalDay;
    },
    { applyLocally: false },
  );

  if (!result.committed) return base;

  const committedDay = result.snapshot.val() as RealtimeOperationalDay | null;
  const committedCase = committedDay?.cases?.[caseId];
  const committedEvent = collectionRecord<TraceEvent>(committedDay?.events)[eventId];
  const committedMetadata = committedDay?.metadata;

  if (!committedCase || !committedEvent || !committedMetadata) return base;

  return {
    ...base,
    sessions: {
      ...base.sessions,
      [session.sessionId]: {
        ...session,
        ...committedMetadata,
      },
    },
    cases: {
      ...base.cases,
      [caseId]: committedCase,
    },
    events: [committedEvent, ...base.events],
  };
};

export const createCenter = (
  data: AppData,
  name: string,
  shortCode: string,
  representationWindows: number,
  ownerWindows: number,
  cashiers: number,
  serviceStartTime = DEFAULT_SERVICE_START_TIME,
  serviceEndTime = DEFAULT_SERVICE_END_TIME,
  cashierCommissionRate?: number,
): AppData => {
  const now = Date.now();
  const safeRepresentationWindows = clampInteger(representationWindows, 1, 20, 1);
  const safeOwnerWindows = clampInteger(ownerWindows, 1, 20, 1);
  const safeCashiers = clampInteger(cashiers, 1, 20, 1);
  const cleanCode = shortCode.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4) || "CCVI";
  const centerId = `${cleanCode.toLowerCase()}-${now}`;
  let nextWindowNumber = 1;
  const windows = [
    ...Array.from({ length: safeRepresentationWindows }, (_, index) =>
      createWindow(centerId, nextWindowNumber++, "representation", index + 1),
    ),
    ...Array.from({ length: safeOwnerWindows }, (_, index) =>
      createWindow(centerId, nextWindowNumber++, "vehicle_owner", safeRepresentationWindows + index + 1),
    ),
  ];

  const center: CenterConfig = {
    centerId,
    shortCode: cleanCode,
    name,
    timezone: "America/Santiago",
    serviceStartTime: normalizeServiceTime(serviceStartTime, DEFAULT_SERVICE_START_TIME),
    serviceEndTime: normalizeServiceTime(serviceEndTime, DEFAULT_SERVICE_END_TIME),
    enabled: true,
    kioskTimeoutSeconds: 12,
    qrEnabled: true,
    paperlessMode: true,
    documentaryRequirements: createDefaultDocumentaryRequirements(),
    paymentMethods: createDefaultPaymentMethods(),
    cashierCommissionRate:
      cashierCommissionRate !== undefined &&
      Number.isFinite(cashierCommissionRate) &&
      cashierCommissionRate >= 0
        ? cashierCommissionRate
        : undefined,
    windows,
    cashiers: Array.from({ length: safeCashiers }, (_, index) => ({
      cashierId: `${centerId}-cashier-${index + 1}`,
      centerId,
      name: `Caja ${index + 1}`,
      enabled: true,
      displayOrder: index + 1,
    })),
    createdAt: now,
    updatedAt: now,
  };

  return ensureSession({
    ...data,
    selectedCenterId: centerId,
    centers: {
      ...data.centers,
      [centerId]: center,
    },
  });
};

export const updateCenter = (
  data: AppData,
  centerId: string,
  patch: Pick<
    CenterConfig,
    | "name"
    | "shortCode"
    | "timezone"
    | "serviceStartTime"
    | "serviceEndTime"
    | "kioskTimeoutSeconds"
    | "qrEnabled"
    | "documentaryRequirements"
    | "paymentMethods"
    | "cashiers"
    | "cashierCommissionRate"
  >,
): AppData => {
  const center = data.centers[centerId];
  if (!center) return data;

  const nextCenter: CenterConfig = {
    ...center,
    name: patch.name.trim() || center.name,
    shortCode: patch.shortCode.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4) || center.shortCode,
    timezone: patch.timezone.trim() || center.timezone,
    serviceStartTime: normalizeServiceTime(patch.serviceStartTime, getCenterServiceHours(center).start),
    serviceEndTime: normalizeServiceTime(patch.serviceEndTime, getCenterServiceHours(center).end),
    kioskTimeoutSeconds: clampInteger(patch.kioskTimeoutSeconds, 8, 30, center.kioskTimeoutSeconds),
    qrEnabled: patch.qrEnabled,
    cashierCommissionRate:
      patch.cashierCommissionRate !== undefined &&
      Number.isFinite(patch.cashierCommissionRate) &&
      patch.cashierCommissionRate >= 0
        ? patch.cashierCommissionRate
        : undefined,
    cashiers: patch.cashiers.map((cashier) => ({
      ...cashier,
      cashierName: cashier.cashierName?.trim() || undefined,
    })),
    documentaryRequirements: normalizeDocumentaryRequirements(patch.documentaryRequirements),
    paymentMethods: normalizePaymentMethods(patch.paymentMethods),
    updatedAt: Date.now(),
  };

  return {
    ...data,
    centers: {
      ...data.centers,
      [centerId]: nextCenter,
    },
  };
};

export const deleteCenter = (data: AppData, centerId: string): AppData => {
  const centerIds = Object.keys(data.centers);
  if (!data.centers[centerId] || centerIds.length <= 1) return data;

  const nextCenters = Object.fromEntries(
    Object.entries(data.centers).filter(([id]) => id !== centerId),
  );
  const nextSelectedCenterId =
    data.selectedCenterId === centerId
      ? Object.keys(nextCenters)[0]
      : data.selectedCenterId;

  const nextData: AppData = {
    ...data,
    selectedCenterId: nextSelectedCenterId,
    centers: nextCenters,
    sessions: Object.fromEntries(
      Object.entries(data.sessions).filter(([, session]) => session.centerId !== centerId),
    ),
    cases: Object.fromEntries(
      Object.entries(data.cases).filter(([, caseItem]) => caseItem.centerId !== centerId),
    ),
    paymentQueue: Object.fromEntries(
      Object.entries(data.paymentQueue).filter(([, item]) => item.centerId !== centerId),
    ),
    events: data.events.filter((item) => item.centerId !== centerId),
  };

  return ensureSession(nextData);
};

export const selectCenter = (data: AppData, centerId: string): AppData =>
  ensureSession({ ...data, selectedCenterId: centerId });

const transitionCase = (
  data: AppData,
  caseId: string,
  patch: Partial<CaseRecord>,
  action: string,
  actorRole: string,
): AppData => {
  const current = data.cases[caseId];
  if (!current) return data;
  const nextCase = { ...current, ...patch, updatedAt: Date.now() };
  const nextData = {
    ...data,
    cases: {
      ...data.cases,
      [caseId]: nextCase,
    },
  };

  return {
    ...nextData,
    events: [
      event(nextData, caseId, actorRole, action, current.currentState, nextCase.currentState),
      ...nextData.events,
    ],
  };
};

const documentaryFifo = (a: CaseRecord, b: CaseRecord) =>
  a.arrivalAt - b.arrivalAt ||
  a.globalArrivalSequence - b.globalArrivalSequence ||
  a.caseId.localeCompare(b.caseId);

const priorityLimit = (policy: DocumentaryPriorityPolicy) =>
  clampInteger(policy.maxConsecutivePriorityCases, 1, 100, 2);

export const nextOperatorCase = (
  data: AppData,
  windowId: string,
  policy: DocumentaryPriorityPolicy = DEFAULT_DOCUMENTARY_PRIORITY_POLICY,
) => {
  const sessionId = getSessionId(data);
  const eligibleCases = Object.values(data.cases)
    .filter(
      (caseItem) =>
        caseItem.centerId === data.selectedCenterId &&
        caseItem.sessionId === sessionId &&
        caseItem.assignedWindowId === windowId &&
        caseItem.currentState === "waiting_document_validation",
    )
    .sort(documentaryFifo);

  const priorityCases = eligibleCases.filter((caseItem) => caseItem.isPriority);
  const regularCases = eligibleCases.filter((caseItem) => !caseItem.isPriority);
  const consecutivePriorityCases =
    data.sessions[sessionId]?.consecutivePriorityCasesByWindow?.[windowId] ?? 0;

  if (
    priorityCases.length > 0 &&
    (regularCases.length === 0 || consecutivePriorityCases < priorityLimit(policy))
  ) {
    return priorityCases[0];
  }

  return regularCases[0] ?? priorityCases[0];
};

export const callNextForOperator = (data: AppData, windowId: string, role: Role): AppData => {
  const active = Object.values(data.cases).some(
    (caseItem) =>
      caseItem.centerId === data.selectedCenterId &&
      caseItem.assignedWindowId === windowId &&
      ["called_to_window", "in_document_validation"].includes(caseItem.currentState),
  );
  if (active) return data;

  const next = nextOperatorCase(data, windowId);
  if (!next) return data;

  const sessionId = getSessionId(data);
  const session = data.sessions[sessionId];
  const previousPriorityCount = session.consecutivePriorityCasesByWindow?.[windowId] ?? 0;
  const nextPriorityCount = next.isPriority ? previousPriorityCount + 1 : 0;
  const dataWithPriorityCount: AppData = {
    ...data,
    sessions: {
      ...data.sessions,
      [sessionId]: {
        ...session,
        consecutivePriorityCasesByWindow: {
          ...session.consecutivePriorityCasesByWindow,
          [windowId]: nextPriorityCount,
        },
      },
    },
  };

  return transitionCase(
    dataWithPriorityCount,
    next.caseId,
    { currentState: "called_to_window", calledToWindowAt: Date.now() },
    "called_to_window",
    role,
  );
};

export const callNextForOperatorRealtime = async (
  data: AppData,
  windowId: string,
  role: Role,
): Promise<AppData> => {
  if (!database) return callNextForOperator(data, windowId, role);

  const base = ensureSession(data);
  const session = getCurrentSession(base);
  const now = Date.now();
  const eventId = `${now}-${transactionNonce()}`;
  const dayReference = ref(database, `days/${base.selectedCenterId}/${session.date}`);

  const result = await runTransaction(
    dayReference,
    (currentValue: RealtimeOperationalDay | null) => {
      if (!currentValue) return;

      const remoteCases = collectionRecord<CaseRecord>(currentValue.cases);
      const remoteMetadata = currentValue.metadata ?? {};
      const remoteSession = {
        ...session,
        ...remoteMetadata,
      };
      const transactionData: AppData = {
        ...base,
        cases: remoteCases,
        sessions: {
          ...base.sessions,
          [session.sessionId]: remoteSession,
        },
      };
      const hasActiveCase = Object.values(remoteCases).some(
        (caseItem) =>
          caseItem.centerId === base.selectedCenterId &&
          caseItem.sessionId === session.sessionId &&
          caseItem.assignedWindowId === windowId &&
          ["called_to_window", "in_document_validation"].includes(caseItem.currentState),
      );
      if (hasActiveCase) return;

      const next = nextOperatorCase(transactionData, windowId);
      if (!next || next.currentState !== "waiting_document_validation") return;

      const previousPriorityCount =
        remoteSession.consecutivePriorityCasesByWindow?.[windowId] ?? 0;
      const nextPriorityCount = next.isPriority ? previousPriorityCount + 1 : 0;
      const nextCase: CaseRecord = {
        ...next,
        assignedOperatorId: role,
        currentState: "called_to_window",
        calledToWindowAt: now,
        updatedAt: now,
      };
      const callEvent: TraceEvent = {
        eventId,
        centerId: next.centerId,
        sessionId: next.sessionId,
        caseId: next.caseId,
        actorRole: role,
        actorId: role,
        action: "called_to_window",
        fromState: next.currentState,
        toState: nextCase.currentState,
        timestamp: now,
        optionalNote: null,
      };

      return {
        ...currentValue,
        metadata: {
          ...remoteSession,
          consecutivePriorityCasesByWindow: {
            ...remoteSession.consecutivePriorityCasesByWindow,
            [windowId]: nextPriorityCount,
          },
        },
        cases: {
          ...remoteCases,
          [next.caseId]: nextCase,
        },
        events: {
          ...collectionRecord<TraceEvent>(currentValue.events),
          [eventId]: callEvent,
        },
      } satisfies RealtimeOperationalDay;
    },
    { applyLocally: false },
  );

  if (!result.committed) return base;

  const committedDay = result.snapshot.val() as RealtimeOperationalDay | null;
  const committedMetadata = committedDay?.metadata;
  const committedEvent = collectionRecord<TraceEvent>(committedDay?.events)[eventId];
  if (!committedDay?.cases || !committedMetadata || !committedEvent) return base;

  return {
    ...base,
    sessions: {
      ...base.sessions,
      [session.sessionId]: { ...session, ...committedMetadata },
    },
    cases: { ...base.cases, ...committedDay.cases },
    events: [committedEvent, ...base.events],
  };
};

export const startValidation = (data: AppData, caseId: string, role: Role): AppData => {
  const current = data.cases[caseId];
  if (!current || current.currentState !== "called_to_window") return data;

  return transitionCase(
    data,
    caseId,
    { currentState: "in_document_validation", documentValidationStartedAt: Date.now() },
    "validation_started",
    role,
  );
};

export const startValidationRealtime = async (
  data: AppData,
  caseId: string,
  role: Role,
): Promise<AppData> => {
  if (!database) return startValidation(data, caseId, role);

  const base = ensureSession(data);
  const session = getCurrentSession(base);
  const expectedCase = base.cases[caseId];
  if (!expectedCase) return base;

  const now = Date.now();
  const eventId = `${now}-${transactionNonce()}`;
  const dayReference = ref(database, `days/${base.selectedCenterId}/${session.date}`);
  const result = await runTransaction(
    dayReference,
    (currentValue: RealtimeOperationalDay | null) => {
      if (!currentValue) return;

      const remoteCases = collectionRecord<CaseRecord>(currentValue.cases);
      const current = remoteCases[caseId];
      if (
        !current ||
        current.centerId !== base.selectedCenterId ||
        current.sessionId !== session.sessionId ||
        current.assignedWindowId !== expectedCase.assignedWindowId ||
        current.assignedOperatorId !== role ||
        current.currentState !== "called_to_window"
      ) {
        return;
      }

      const nextCase: CaseRecord = {
        ...current,
        currentState: "in_document_validation",
        documentValidationStartedAt: now,
        updatedAt: now,
      };
      const validationEvent: TraceEvent = {
        eventId,
        centerId: current.centerId,
        sessionId: current.sessionId,
        caseId,
        actorRole: role,
        actorId: role,
        action: "validation_started",
        fromState: current.currentState,
        toState: nextCase.currentState,
        timestamp: now,
        optionalNote: null,
      };

      return {
        ...currentValue,
        cases: {
          ...remoteCases,
          [caseId]: nextCase,
        },
        events: {
          ...collectionRecord<TraceEvent>(currentValue.events),
          [eventId]: validationEvent,
        },
      } satisfies RealtimeOperationalDay;
    },
    { applyLocally: false },
  );

  if (!result.committed) return base;

  const committedDay = result.snapshot.val() as RealtimeOperationalDay | null;
  const committedCase = committedDay?.cases?.[caseId];
  const committedEvent = collectionRecord<TraceEvent>(committedDay?.events)[eventId];
  if (!committedCase || !committedEvent) return base;

  return {
    ...base,
    cases: { ...base.cases, [caseId]: committedCase },
    events: [committedEvent, ...base.events],
  };
};

export const markWindowNoShow = (data: AppData, caseId: string, role: Role): AppData => {
  const current = data.cases[caseId];
  if (!current || current.currentState !== "called_to_window") return data;

  return transitionCase(
    data,
    caseId,
    { currentState: "no_show" },
    "window_no_show",
    role,
  );
};

export const markCaseAsPriority = (
  data: AppData,
  caseId: string,
  priorityType: PriorityType,
  role: Role,
): AppData => {
  const current = data.cases[caseId];
  if (
    !current ||
    !["operator-window-1", "operator-window-2"].includes(role) ||
    current.centerId !== data.selectedCenterId ||
    current.isPriority ||
    !["waiting_document_validation", "called_to_window", "in_document_validation"].includes(
      current.currentState,
    )
  ) {
    return data;
  }

  const now = Date.now();
  const nextData: AppData = {
    ...data,
    cases: {
      ...data.cases,
      [caseId]: {
        ...current,
        isPriority: true,
        priorityType,
        priorityCreatedBy: role,
        priorityCreatedAt: now,
        updatedAt: now,
      },
    },
  };

  return {
    ...nextData,
    events: [
      event(
        nextData,
        caseId,
        role,
        "priority_created",
        current.currentState,
        current.currentState,
        priorityType,
      ),
      ...nextData.events,
    ],
  };
};

export const updateCasePriority = (
  data: AppData,
  caseId: string,
  priorityType: PriorityType,
  role: Role,
): AppData => {
  const current = data.cases[caseId];
  if (
    !current ||
    !["operator-window-1", "operator-window-2"].includes(role) ||
    current.centerId !== data.selectedCenterId ||
    !current.isPriority ||
    current.priorityType === priorityType ||
    !["waiting_document_validation", "called_to_window", "in_document_validation"].includes(
      current.currentState,
    )
  ) {
    return data;
  }

  const nextData: AppData = {
    ...data,
    cases: {
      ...data.cases,
      [caseId]: {
        ...current,
        priorityType,
        updatedAt: Date.now(),
      },
    },
  };

  return {
    ...nextData,
    events: [
      event(
        nextData,
        caseId,
        role,
        "priority_updated",
        current.currentState,
        current.currentState,
        priorityType,
      ),
      ...nextData.events,
    ],
  };
};

export const removeCasePriority = (
  data: AppData,
  caseId: string,
  role: Role,
): AppData => {
  const current = data.cases[caseId];
  if (
    !current ||
    !["operator-window-1", "operator-window-2"].includes(role) ||
    current.centerId !== data.selectedCenterId ||
    !current.isPriority ||
    !["waiting_document_validation", "called_to_window", "in_document_validation"].includes(
      current.currentState,
    )
  ) {
    return data;
  }

  const nextData: AppData = {
    ...data,
    cases: {
      ...data.cases,
      [caseId]: {
        ...current,
        isPriority: false,
        priorityType: null,
        updatedAt: Date.now(),
      },
    },
  };

  return {
    ...nextData,
    events: [
      event(
        nextData,
        caseId,
        role,
        "priority_removed",
        current.currentState,
        current.currentState,
        current.priorityType ?? undefined,
      ),
      ...nextData.events,
    ],
  };
};

export const reassignCase = (
  data: AppData,
  caseId: string,
  targetWindowId: string,
  role: Role,
): AppData => {
  const base = ensureSession(data);
  const current = base.cases[caseId];
  const targetWindow = getCurrentCenter(base).windows.find(
    (windowItem) => windowItem.windowId === targetWindowId && windowItem.enabled,
  );

  if (!current || !targetWindow || current.currentState !== "in_document_validation") return base;

  return transitionCase(
    base,
    caseId,
    {
      serviceType: targetWindow.serviceType,
      serviceLabel: targetWindow.serviceLabel,
      validationLevel: targetWindow.validationLevel,
      assignedWindowId: targetWindow.windowId,
      assignedWindowNumber: targetWindow.windowNumber,
      currentState: "waiting_document_validation",
      calledToWindowAt: null,
      documentValidationStartedAt: null,
    },
    "case_reassigned",
    role,
  );
};

export const finishDocumentValidation = (
  data: AppData,
  caseId: string,
  status: Exclude<DocumentStatus, "pending">,
  role: Role,
  rejectedContact?: {
    customerName?: string;
    customerPhone?: string;
  },
): AppData => {
  const base = ensureSession(data);
  const current = base.cases[caseId];
  if (!current || current.currentState !== "in_document_validation") return base;
  const now = Date.now();

  if (status === "incomplete" || status === "rejected") {
    const rejectedCustomerName = rejectedContact?.customerName?.trim() || undefined;
    const rejectedCustomerPhone = rejectedContact?.customerPhone?.trim() || undefined;

    return transitionCase(
      base,
      caseId,
      {
        currentState: status === "incomplete" ? "documentation_incomplete" : "rejected",
        documentStatus: status,
        documentValidationCompletedAt: now,
        ...(status === "rejected"
          ? { rejectedCustomerName, rejectedCustomerPhone }
          : {}),
      },
      status === "incomplete" ? "documentation_incomplete" : "case_rejected",
      role,
    );
  }

  const session = getCurrentSession(base);
  const center = getCurrentCenter(base);
  const folderCode = `${center.shortCode}-F${pad(session.nextFolderNumber)}`;
  const queueNumber = session.nextPaymentQueueNumber;
  const queueItemId = `${center.shortCode}-PAY-${pad(queueNumber)}-${suffix()}`;
  const paymentItem: PaymentQueueItem = {
    queueItemId,
    centerId: center.centerId,
    sessionId: session.sessionId,
    caseId,
    publicCode: current.publicCode,
    folderCode,
    queueNumber,
    approvedAt: now,
    state: "waiting_cashier",
    cashierId: null,
    reservedAt: null,
    calledAt: null,
    startedAt: null,
    completedAt: null,
    updatedAt: now,
  };

  const nextCase: CaseRecord = {
    ...current,
    currentState: "waiting_cashier",
    documentStatus: "approved",
    documentValidationCompletedAt: now,
    folderCode,
    paymentQueueNumber: queueNumber,
    paymentTicketId: queueItemId,
    updatedAt: now,
  };

  const nextData: AppData = {
    ...base,
    sessions: {
      ...base.sessions,
      [session.sessionId]: {
        ...session,
        nextFolderNumber: session.nextFolderNumber + 1,
        nextPaymentQueueNumber: session.nextPaymentQueueNumber + 1,
      },
    },
    cases: {
      ...base.cases,
      [caseId]: nextCase,
    },
    paymentQueue: {
      ...base.paymentQueue,
      [queueItemId]: paymentItem,
    },
  };

  return {
    ...nextData,
    events: [
      event(nextData, caseId, role, "folder_code_generated", "in_document_validation", "waiting_cashier"),
      event(nextData, caseId, role, "added_to_cashier_queue", "approved_for_cashier", "waiting_cashier"),
      ...nextData.events,
    ],
  };
};

export const finishDocumentValidationRealtime = async (
  data: AppData,
  caseId: string,
  status: Exclude<DocumentStatus, "pending">,
  role: Role,
  rejectedContact?: {
    customerName?: string;
    customerPhone?: string;
  },
): Promise<AppData> => {
  if (!database) {
    return finishDocumentValidation(data, caseId, status, role, rejectedContact);
  }

  const base = ensureSession(data);
  const session = getCurrentSession(base);
  const center = getCurrentCenter(base);
  const expectedCase = base.cases[caseId];
  if (!expectedCase) return base;

  const now = Date.now();
  const eventIds =
    status === "approved"
      ? [`${now}-${transactionNonce()}`, `${now}-${transactionNonce()}`]
      : [`${now}-${transactionNonce()}`];
  const queueItemId = `${center.shortCode}-PAY-${transactionNonce()}`;
  const rejectedCustomerName = rejectedContact?.customerName?.trim() || undefined;
  const rejectedCustomerPhone = rejectedContact?.customerPhone?.trim() || undefined;
  const dayReference = ref(database, `days/${center.centerId}/${session.date}`);

  const result = await runTransaction(
    dayReference,
    (currentValue: RealtimeOperationalDay | null) => {
      if (!currentValue) return;

      const remoteCases = collectionRecord<CaseRecord>(currentValue.cases);
      const current = remoteCases[caseId];
      if (
        !current ||
        current.centerId !== center.centerId ||
        current.sessionId !== session.sessionId ||
        current.assignedWindowId !== expectedCase.assignedWindowId ||
        current.assignedOperatorId !== role ||
        current.currentState !== "in_document_validation"
      ) {
        return;
      }

      const remoteEvents = collectionRecord<TraceEvent>(currentValue.events);
      if (status === "incomplete" || status === "rejected") {
        const nextState =
          status === "incomplete" ? "documentation_incomplete" : "rejected";
        const nextCase: CaseRecord = {
          ...current,
          currentState: nextState,
          documentStatus: status,
          documentValidationCompletedAt: now,
          ...(status === "rejected"
            ? { rejectedCustomerName, rejectedCustomerPhone }
            : {}),
          updatedAt: now,
        };
        const completionEvent: TraceEvent = {
          eventId: eventIds[0],
          centerId: current.centerId,
          sessionId: current.sessionId,
          caseId,
          actorRole: role,
          actorId: role,
          action: status === "incomplete" ? "documentation_incomplete" : "case_rejected",
          fromState: current.currentState,
          toState: nextState,
          timestamp: now,
          optionalNote: null,
        };

        return {
          ...currentValue,
          cases: { ...remoteCases, [caseId]: nextCase },
          events: { ...remoteEvents, [eventIds[0]]: completionEvent },
        } satisfies RealtimeOperationalDay;
      }

      const remoteMetadata = currentValue.metadata ?? {};
      const storedFolderNumber = remoteMetadata.nextFolderNumber;
      const folderNumber =
        Number.isSafeInteger(storedFolderNumber) && Number(storedFolderNumber) >= 1
          ? Number(storedFolderNumber)
          : session.nextFolderNumber;
      const storedQueueNumber = remoteMetadata.nextPaymentQueueNumber;
      const queueNumber =
        Number.isSafeInteger(storedQueueNumber) && Number(storedQueueNumber) >= 1
          ? Number(storedQueueNumber)
          : session.nextPaymentQueueNumber;
      const folderCode = `${center.shortCode}-F${pad(folderNumber)}`;
      const remotePaymentQueue = collectionRecord<PaymentQueueItem>(currentValue.paymentQueue);
      const folderAlreadyExists =
        Object.values(remoteCases).some(
          (caseItem) => caseItem.caseId !== caseId && caseItem.folderCode === folderCode,
        ) || Object.values(remotePaymentQueue).some((item) => item.folderCode === folderCode);
      if (folderAlreadyExists || remotePaymentQueue[queueItemId]) return;

      const paymentItem: PaymentQueueItem = {
        queueItemId,
        centerId: current.centerId,
        sessionId: current.sessionId,
        caseId,
        publicCode: current.publicCode,
        folderCode,
        queueNumber,
        approvedAt: now,
        state: "waiting_cashier",
        cashierId: null,
        reservedAt: null,
        calledAt: null,
        startedAt: null,
        completedAt: null,
        updatedAt: now,
      };
      const nextCase: CaseRecord = {
        ...current,
        currentState: "waiting_cashier",
        documentStatus: "approved",
        documentValidationCompletedAt: now,
        folderCode,
        paymentQueueNumber: queueNumber,
        paymentTicketId: queueItemId,
        updatedAt: now,
      };
      const folderEvent: TraceEvent = {
        eventId: eventIds[0],
        centerId: current.centerId,
        sessionId: current.sessionId,
        caseId,
        actorRole: role,
        actorId: role,
        action: "folder_code_generated",
        fromState: "in_document_validation",
        toState: "waiting_cashier",
        timestamp: now,
        optionalNote: null,
      };
      const queueEvent: TraceEvent = {
        eventId: eventIds[1],
        centerId: current.centerId,
        sessionId: current.sessionId,
        caseId,
        actorRole: role,
        actorId: role,
        action: "added_to_cashier_queue",
        fromState: "approved_for_cashier",
        toState: "waiting_cashier",
        timestamp: now,
        optionalNote: null,
      };

      return {
        ...currentValue,
        metadata: {
          ...session,
          ...remoteMetadata,
          nextFolderNumber: folderNumber + 1,
          nextPaymentQueueNumber: queueNumber + 1,
        },
        cases: { ...remoteCases, [caseId]: nextCase },
        paymentQueue: { ...remotePaymentQueue, [queueItemId]: paymentItem },
        events: {
          ...remoteEvents,
          [eventIds[0]]: folderEvent,
          [eventIds[1]]: queueEvent,
        },
      } satisfies RealtimeOperationalDay;
    },
    { applyLocally: false },
  );

  if (!result.committed) return base;

  const committedDay = result.snapshot.val() as RealtimeOperationalDay | null;
  const committedCase = committedDay?.cases?.[caseId];
  if (!committedCase) return base;

  const committedEvents = collectionRecord<TraceEvent>(committedDay?.events);
  const nextEvents = eventIds
    .map((eventId) => committedEvents[eventId])
    .filter((eventItem): eventItem is TraceEvent => Boolean(eventItem));
  if (nextEvents.length !== eventIds.length) return base;

  const nextData: AppData = {
    ...base,
    cases: { ...base.cases, [caseId]: committedCase },
    events: [...nextEvents, ...base.events],
  };

  if (status !== "approved") return nextData;

  const committedMetadata = committedDay?.metadata;
  const committedPaymentItem = committedCase.paymentTicketId
    ? committedDay?.paymentQueue?.[committedCase.paymentTicketId]
    : undefined;
  if (!committedMetadata || !committedPaymentItem) return base;

  return {
    ...nextData,
    sessions: {
      ...base.sessions,
      [session.sessionId]: { ...session, ...committedMetadata },
    },
    paymentQueue: {
      ...base.paymentQueue,
      [committedPaymentItem.queueItemId]: committedPaymentItem,
    },
  };
};

const cashierFifo = (a: PaymentQueueItem, b: PaymentQueueItem) =>
  a.approvedAt - b.approvedAt ||
  a.queueNumber - b.queueNumber ||
  a.queueItemId.localeCompare(b.queueItemId);

export const nextCashierQueueItem = (
  data: AppData,
  policy: DocumentaryPriorityPolicy = DEFAULT_CASHIER_PRIORITY_POLICY,
) => {
  const sessionId = getSessionId(data);
  const eligibleItems = Object.values(data.paymentQueue)
    .filter((item) => {
      const relatedCase = data.cases[item.caseId];
      return (
        item.centerId === data.selectedCenterId &&
        item.sessionId === sessionId &&
        item.state === "waiting_cashier" &&
        relatedCase?.currentState === "waiting_cashier"
      );
    })
    .sort(cashierFifo);

  const priorityItems = eligibleItems.filter(
    (item) => data.cases[item.caseId]?.isPriority === true,
  );
  const regularItems = eligibleItems.filter(
    (item) => data.cases[item.caseId]?.isPriority !== true,
  );
  const consecutivePriorityCases =
    data.sessions[sessionId]?.consecutivePriorityCasesForCashier ?? 0;

  if (
    priorityItems.length > 0 &&
    (regularItems.length === 0 || consecutivePriorityCases < priorityLimit(policy))
  ) {
    return priorityItems[0];
  }

  return regularItems[0] ?? priorityItems[0];
};

export const callNextForCashier = (data: AppData, cashierId: string): AppData => {
  const active = Object.values(data.paymentQueue).find(
    (item) =>
      item.centerId === data.selectedCenterId &&
      item.cashierId === cashierId &&
      (item.state === "called_to_cashier" || item.state === "in_cashier_attention"),
  );
  if (active) return data;

  const next = nextCashierQueueItem(data);
  if (!next) return data;

  const now = Date.now();
  const relatedCase = data.cases[next.caseId];
  const sessionId = getSessionId(data);
  const session = data.sessions[sessionId];
  if (!relatedCase || !session) return data;
  const nextPriorityCount = relatedCase.isPriority
    ? session.consecutivePriorityCasesForCashier + 1
    : 0;
  const updatedQueue: PaymentQueueItem = {
    ...next,
    state: "called_to_cashier",
    cashierId,
    reservedAt: now,
    calledAt: now,
    updatedAt: now,
  };
  const updatedCase: CaseRecord = {
    ...relatedCase,
    currentState: "called_to_cashier",
    cashierId,
    calledToCashierAt: now,
    updatedAt: now,
  };
  const nextData: AppData = {
    ...data,
    sessions: {
      ...data.sessions,
      [sessionId]: {
        ...session,
        consecutivePriorityCasesForCashier: nextPriorityCount,
      },
    },
    cases: { ...data.cases, [relatedCase.caseId]: updatedCase },
    paymentQueue: { ...data.paymentQueue, [next.queueItemId]: updatedQueue },
  };

  return {
    ...nextData,
    events: [
      event(nextData, relatedCase.caseId, cashierId, "called_to_cashier", "waiting_cashier", "called_to_cashier"),
      ...nextData.events,
    ],
  };
};

export const startCashierAttention = (data: AppData, queueItemId: string): AppData => {
  const item = data.paymentQueue[queueItemId];
  if (!item || item.state !== "called_to_cashier") return data;
  const now = Date.now();
  const relatedCase = data.cases[item.caseId];
  const nextData: AppData = {
    ...data,
    cases: {
      ...data.cases,
      [relatedCase.caseId]: {
        ...relatedCase,
        currentState: "in_cashier_attention",
        cashierStartedAt: now,
        updatedAt: now,
      },
    },
    paymentQueue: {
      ...data.paymentQueue,
      [queueItemId]: {
        ...item,
        state: "in_cashier_attention",
        startedAt: now,
        updatedAt: now,
      },
    },
  };

  return {
    ...nextData,
    events: [
      event(nextData, relatedCase.caseId, item.cashierId ?? "cashier", "cashier_attention_started", "called_to_cashier", "in_cashier_attention"),
      ...nextData.events,
    ],
  };
};

export const completePayment = (data: AppData, queueItemId: string): AppData => {
  const item = data.paymentQueue[queueItemId];
  if (!item || item.state !== "in_cashier_attention") return data;
  const now = Date.now();
  const relatedCase = data.cases[item.caseId];
  const center = data.centers[relatedCase.centerId];
  const cashier = center?.cashiers.find(
    (candidate) => candidate.cashierId === (item.cashierId ?? relatedCase.cashierId),
  );
  const cashierNameAtCompletion = cashier?.cashierName?.trim() || undefined;
  const commissionRateApplied = center?.cashierCommissionRate;
  const cashierDurationMs = relatedCase.cashierStartedAt === null
    ? undefined
    : Math.max(0, now - relatedCase.cashierStartedAt);
  const nextData: AppData = {
    ...data,
    cases: {
      ...data.cases,
      [relatedCase.caseId]: {
        ...relatedCase,
        currentState: "completed",
        paymentCompletedAt: now,
        cashierNameAtCompletion,
        cashierDurationMs,
        commissionRateApplied,
        commissionAmount: commissionRateApplied,
        completedAt: now,
        updatedAt: now,
      },
    },
    paymentQueue: {
      ...data.paymentQueue,
      [queueItemId]: {
        ...item,
        state: "completed",
        completedAt: now,
        updatedAt: now,
      },
    },
  };

  return {
    ...nextData,
    events: [
      event(nextData, relatedCase.caseId, item.cashierId ?? "cashier", "payment_completed", "in_cashier_attention", "completed"),
      ...nextData.events,
    ],
  };
};

export const pausePayment = (
  data: AppData,
  queueItemId: string,
  role: Role,
  note: string | null = null,
): AppData => {
  const item = data.paymentQueue[queueItemId];
  if (!item || item.state !== "in_cashier_attention") return data;
  const now = Date.now();
  const relatedCase = data.cases[item.caseId];
  const nextData: AppData = {
    ...data,
    cases: {
      ...data.cases,
      [relatedCase.caseId]: {
        ...relatedCase,
        currentState: "paused",
        optionalInternalNote: note,
        updatedAt: now,
      },
    },
    paymentQueue: {
      ...data.paymentQueue,
      [queueItemId]: {
        ...item,
        state: "paused",
        cashierId: null,
        updatedAt: now,
      },
    },
  };

  return {
    ...nextData,
    events: [
      event(nextData, relatedCase.caseId, role, "payment_not_completed", "in_cashier_attention", "paused", note),
      ...nextData.events,
    ],
  };
};

export const resumePausedPayment = (data: AppData, queueItemId: string, cashierId: string): AppData => {
  const active = Object.values(data.paymentQueue).find(
    (item) =>
      item.centerId === data.selectedCenterId &&
      item.cashierId === cashierId &&
      (item.state === "called_to_cashier" || item.state === "in_cashier_attention"),
  );
  if (active) return data;

  const item = data.paymentQueue[queueItemId];
  if (!item || item.centerId !== data.selectedCenterId || item.state !== "paused") return data;
  const now = Date.now();
  const relatedCase = data.cases[item.caseId];
  const nextData: AppData = {
    ...data,
    cases: {
      ...data.cases,
      [relatedCase.caseId]: {
        ...relatedCase,
        currentState: "in_cashier_attention",
        cashierId,
        calledToCashierAt: now,
        cashierStartedAt: now,
        updatedAt: now,
      },
    },
    paymentQueue: {
      ...data.paymentQueue,
      [queueItemId]: {
        ...item,
        state: "in_cashier_attention",
        cashierId,
        calledAt: now,
        startedAt: now,
        updatedAt: now,
      },
    },
  };

  return {
    ...nextData,
    events: [
      event(nextData, relatedCase.caseId, cashierId, "payment_resumed", "paused", "in_cashier_attention"),
      ...nextData.events,
    ],
  };
};

export const markNoShow = (data: AppData, queueItemId: string): AppData => {
  const item = data.paymentQueue[queueItemId];
  if (!item || item.state !== "called_to_cashier") return data;
  const now = Date.now();
  const relatedCase = data.cases[item.caseId];
  const nextData: AppData = {
    ...data,
    cases: {
      ...data.cases,
      [relatedCase.caseId]: {
        ...relatedCase,
        currentState: "no_show",
        updatedAt: now,
      },
    },
    paymentQueue: {
      ...data.paymentQueue,
      [queueItemId]: {
        ...item,
        state: "no_show",
        updatedAt: now,
      },
    },
  };

  return {
    ...nextData,
    events: [
      event(nextData, relatedCase.caseId, item.cashierId ?? "cashier", "no_show", "called_to_cashier", "no_show"),
      ...nextData.events,
    ],
  };
};

const average = (values: number[]) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

export const calculateMetrics = (data: AppData, sessionId?: string): Metrics => {
  const cases = Object.values(data.cases).filter(
    (caseItem) =>
      caseItem.centerId === data.selectedCenterId &&
      (!sessionId || caseItem.sessionId === sessionId),
  );
  const completedCases = cases.filter((caseItem) => caseItem.currentState === "completed");

  return {
    totalArrivals: cases.length,
    representationArrivals: cases.filter((caseItem) => caseItem.serviceType === "representation").length,
    vehicleOwnerArrivals: cases.filter((caseItem) => caseItem.serviceType === "vehicle_owner").length,
    approved: cases.filter((caseItem) => caseItem.documentStatus === "approved").length,
    incomplete: cases.filter((caseItem) => caseItem.documentStatus === "incomplete").length,
    rejected: cases.filter((caseItem) => caseItem.documentStatus === "rejected").length,
    waitingCashier: cases.filter((caseItem) => caseItem.currentState === "waiting_cashier").length,
    inCashierAttention: cases.filter((caseItem) => caseItem.currentState === "in_cashier_attention").length,
    completed: completedCases.length,
    averageValidationMs: average(
      cases
        .filter(
          (caseItem) =>
            caseItem.documentValidationStartedAt && caseItem.documentValidationCompletedAt,
        )
        .map(
          (caseItem) =>
            Number(caseItem.documentValidationCompletedAt) -
            Number(caseItem.documentValidationStartedAt),
        ),
    ),
    averageCashierWaitMs: average(
      cases
        .filter((caseItem) => caseItem.documentValidationCompletedAt && caseItem.calledToCashierAt)
        .map(
          (caseItem) =>
            Number(caseItem.calledToCashierAt) - Number(caseItem.documentValidationCompletedAt),
        ),
    ),
    averageCashierHandlingMs: average(
      cases
        .filter((caseItem) => caseItem.cashierStartedAt && caseItem.paymentCompletedAt)
        .map(
          (caseItem) =>
            Number(caseItem.paymentCompletedAt) - Number(caseItem.cashierStartedAt),
        ),
    ),
    averageEndToEndMs: average(
      completedCases.map((caseItem) => Number(caseItem.completedAt) - caseItem.arrivalAt),
    ),
  };
};

export const formatDuration = (ms: number | null) => {
  if (ms === null) return "--";
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

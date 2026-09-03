export type ServiceType = "representation" | "vehicle_owner";

export type ValidationLevel = "enhanced" | "standard";

export type PersonKind = "natural" | "legal" | "not_specified";

export type CaseState =
  | "arrived"
  | "waiting_document_validation"
  | "called_to_window"
  | "in_document_validation"
  | "documentation_incomplete"
  | "rejected"
  | "approved_for_cashier"
  | "waiting_cashier"
  | "called_to_cashier"
  | "in_cashier_attention"
  | "payment_completed"
  | "completed"
  | "no_show"
  | "paused"
  | "cancelled";

export type DocumentStatus = "pending" | "approved" | "incomplete" | "rejected";

export type PriorityType =
  | "older_adult"
  | "pregnant"
  | "wheelchair_user"
  | "disability"
  | "reduced_mobility"
  | "other";

export type PaymentQueueState =
  | "waiting_cashier"
  | "reserved"
  | "called_to_cashier"
  | "in_cashier_attention"
  | "paused"
  | "no_show"
  | "completed";

export type Role =
  | "kiosk"
  | "operator-window-1"
  | "operator-window-2"
  | "cashier1"
  | "cashier2"
  | "cashier3"
  | "cashier4"
  | "cashier5"
  | "cashier"
  | "admin"
  | "display";

export type PrivateUserRole =
  | "admin"
  | "operator-window-1"
  | "operator-window-2"
  | "cashier";

export interface UserProfile {
  uid: string;
  role: PrivateUserRole;
  centerIds: string[];
  cashierId?: string;
  enabled: boolean;
}

export interface PublicPaymentMethod {
  label: string;
  accepted: boolean;
}

export interface PublicTurnStatus {
  publicCode: string;
  status: string;
  serviceType: ServiceType;
  serviceLabel: string;
  destination: string | null;
  updatedAt: number;
  requirements: string[];
  paymentMethods: PublicPaymentMethod[];
}

export interface PublicDisplayEntry {
  publicCode: string;
  isPriority: boolean;
  status: string;
  destination: string;
  updatedAt: number;
}

export interface WindowConfig {
  windowId: string;
  centerId: string;
  windowNumber: number;
  name: string;
  serviceType: ServiceType;
  serviceLabel: string;
  validationLevel: ValidationLevel;
  publicCodePrefix: string;
  enabled: boolean;
  displayOrder: number;
  version: number;
}

export interface CashierConfig {
  cashierId: string;
  centerId: string;
  name: string;
  cashierName?: string;
  enabled: boolean;
  displayOrder: number;
}

export interface DocumentaryRequirement {
  requirementId: string;
  label: string;
  enabled: boolean;
}

export type DocumentaryRequirementsByService = Record<
  ServiceType,
  DocumentaryRequirement[]
>;

export interface PaymentMethodConfig {
  paymentMethodId: string;
  label: string;
  accepted: boolean;
}

export interface CenterConfig {
  centerId: string;
  shortCode: string;
  name: string;
  address?: string;
  timezone: string;
  serviceStartTime: string;
  serviceEndTime: string;
  enabled: boolean;
  kioskTimeoutSeconds: number;
  qrEnabled: boolean;
  paperlessMode: true;
  windows: WindowConfig[];
  cashiers: CashierConfig[];
  cashierCommissionRate?: number;
  documentaryRequirements: DocumentaryRequirementsByService;
  paymentMethods: PaymentMethodConfig[];
  createdAt: number;
  updatedAt: number;
}

export interface SessionMetadata {
  sessionId: string;
  centerId: string;
  date: string;
  status: "open" | "closed";
  nextGlobalArrivalSequence: number;
  windowSequences: Record<string, number>;
  consecutivePriorityCasesByWindow: Record<string, number>;
  consecutivePriorityCasesForCashier: number;
  nextFolderNumber: number;
  nextPaymentQueueNumber: number;
  openedAt: number;
  closedAt: number | null;
}

export interface CaseRecord {
  caseId: string;
  publicToken: string;
  centerId: string;
  sessionId: string;
  publicCode: string;
  globalArrivalSequence: number;
  publicSequence: number;
  serviceType: ServiceType;
  serviceLabel: string;
  validationLevel: ValidationLevel;
  personKind: PersonKind;
  assignedWindowId: string;
  assignedWindowNumber: number;
  assignedOperatorId: string | null;
  isPriority: boolean;
  priorityType: PriorityType | null;
  priorityCreatedBy: string | null;
  priorityCreatedAt: number | null;
  currentState: CaseState;
  arrivalAt: number;
  calledToWindowAt: number | null;
  documentValidationStartedAt: number | null;
  documentValidationCompletedAt: number | null;
  documentStatus: DocumentStatus;
  rejectedCustomerName?: string;
  rejectedCustomerPhone?: string;
  optionalInternalNote: string | null;
  folderCode: string | null;
  paymentQueueNumber: number | null;
  paymentTicketId: string | null;
  cashierId: string | null;
  calledToCashierAt: number | null;
  cashierStartedAt: number | null;
  paymentCompletedAt: number | null;
  cashierNameAtCompletion?: string;
  cashierDurationMs?: number;
  commissionRateApplied?: number;
  commissionAmount?: number;
  completedAt: number | null;
  updatedAt: number;
}

export interface PaymentQueueItem {
  queueItemId: string;
  centerId: string;
  sessionId: string;
  caseId: string;
  publicCode: string;
  folderCode: string;
  queueNumber: number;
  approvedAt: number;
  state: PaymentQueueState;
  cashierId: string | null;
  reservedAt: number | null;
  calledAt: number | null;
  startedAt: number | null;
  completedAt: number | null;
  updatedAt: number;
}

export interface TraceEvent {
  eventId: string;
  centerId: string;
  sessionId: string;
  caseId: string;
  actorRole: string;
  actorId: string | null;
  action: string;
  fromState: string | null;
  toState: string;
  timestamp: number;
  optionalNote: string | null;
}

export interface AppData {
  selectedCenterId: string;
  centers: Record<string, CenterConfig>;
  sessions: Record<string, SessionMetadata>;
  cases: Record<string, CaseRecord>;
  paymentQueue: Record<string, PaymentQueueItem>;
  events: TraceEvent[];
}

export interface Metrics {
  totalArrivals: number;
  representationArrivals: number;
  vehicleOwnerArrivals: number;
  approved: number;
  incomplete: number;
  rejected: number;
  waitingCashier: number;
  inCashierAttention: number;
  completed: number;
  averageValidationMs: number | null;
  averageCashierWaitMs: number | null;
  averageCashierHandlingMs: number | null;
  averageEndToEndMs: number | null;
}

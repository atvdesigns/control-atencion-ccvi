import type { AppData, CaseRecord, PaymentQueueItem, SessionMetadata, TraceEvent } from "./types";

export interface AdminOperationalSnapshot {
  metadata?: unknown;
  cases?: unknown;
  paymentQueue?: unknown;
  events?: unknown;
}

const recordOrEmpty = <T>(value: unknown): Record<string, T> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, T>
    : {};

export const sortTraceEventsNewestFirst = (events: TraceEvent[]): TraceEvent[] =>
  [...events].sort(
    (left, right) => right.timestamp - left.timestamp || left.eventId.localeCompare(right.eventId),
  );

export const traceEventsFromSnapshot = (value: unknown): TraceEvent[] => {
  const events = Array.isArray(value)
    ? value as TraceEvent[]
    : Object.values(recordOrEmpty<TraceEvent>(value));
  return sortTraceEventsNewestFirst(events);
};

export const adminReportDataFromSnapshot = (
  data: AppData,
  session: SessionMetadata,
  snapshot: AdminOperationalSnapshot,
): AppData => {
  const metadata = recordOrEmpty<unknown>(snapshot.metadata);
  return {
    ...data,
    sessions: {
      ...data.sessions,
      [session.sessionId]: { ...session, ...metadata },
    },
    cases: recordOrEmpty<CaseRecord>(snapshot.cases),
    paymentQueue: recordOrEmpty<PaymentQueueItem>(snapshot.paymentQueue),
    events: traceEventsFromSnapshot(snapshot.events),
  };
};

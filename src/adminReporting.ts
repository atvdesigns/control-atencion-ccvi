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

export type AdminReportingPeriod = "today" | "week" | "month" | "year";

export const authoritativeReportingSessions = (
  currentSession: SessionMetadata,
  discoveredSessions: SessionMetadata[],
): SessionMetadata[] => {
  const sessions = new Map(discoveredSessions.map((session) => [session.sessionId, session]));
  sessions.set(currentSession.sessionId, currentSession);
  return [...sessions.values()]
    .filter((session) => session.centerId === currentSession.centerId)
    .sort((left, right) => right.date.localeCompare(left.date));
};

const utcDate = (dayId: string) => new Date(`${dayId}T00:00:00.000Z`);
const dayId = (date: Date) => date.toISOString().slice(0, 10);

export const operationalDayRange = (selectedDayId: string, period: AdminReportingPeriod) => {
  const selected = utcDate(selectedDayId);
  const start = new Date(selected);
  const end = new Date(selected);
  if (period === "week") {
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
    end.setTime(start.getTime()); end.setUTCDate(end.getUTCDate() + 6);
  } else if (period === "month") {
    start.setUTCDate(1); end.setUTCMonth(end.getUTCMonth() + 1, 0);
  } else if (period === "year") {
    start.setUTCMonth(0, 1); end.setUTCMonth(11, 31);
  }
  return { startOperationalDay: dayId(start), endOperationalDay: dayId(end) };
};

export const includedOperationalDays = (
  persistedDayIds: string[], selectedDayId: string, period: AdminReportingPeriod,
) => {
  const range = operationalDayRange(selectedDayId, period);
  return persistedDayIds.filter((item) => item >= range.startOperationalDay && item <= range.endOperationalDay).sort();
};

export const adminRangeDataFromSnapshots = (
  currentData: AppData,
  currentDayId: string,
  includedDayIds: string[],
  snapshots: Record<string, AdminOperationalSnapshot>,
): AppData => {
  const cases: Record<string, CaseRecord> = {};
  const paymentQueue: Record<string, PaymentQueueItem> = {};
  const events: TraceEvent[] = [];
  for (const selectedDayId of includedDayIds) {
    const source = selectedDayId === currentDayId
      ? { cases: currentData.cases, paymentQueue: currentData.paymentQueue, events: currentData.events }
      : snapshots[selectedDayId] ?? {};
    for (const [key, value] of Object.entries(recordOrEmpty<CaseRecord>(source.cases))) cases[`${selectedDayId}:${key}`] = value;
    for (const [key, value] of Object.entries(recordOrEmpty<PaymentQueueItem>(source.paymentQueue))) paymentQueue[`${selectedDayId}:${key}`] = value;
    events.push(...traceEventsFromSnapshot(source.events));
  }
  return { ...currentData, cases, paymentQueue, events: sortTraceEventsNewestFirst(events) };
};

import type { AppData } from "./types";
import type { PublicKioskConfig } from "./services/firebase";

export interface OperationalCenterConfig {
  enabled: boolean;
  serviceStartTime: string;
  serviceEndTime: string;
  timezone: string;
}

export type OperationalConfigStatus = "loading" | "ready" | "error";

export interface OperationalConfigLifecycleState {
  contextKey: string | null;
  centerId: string | null;
  status: OperationalConfigStatus;
  config: OperationalCenterConfig | null;
}

interface OperationalAuthorityRef {
  current: OperationalConfigLifecycleState;
}

export const invalidateOperationalAuthority = (
  authorityRef: OperationalAuthorityRef,
): OperationalConfigLifecycleState => {
  const invalidated = {
    contextKey: null,
    centerId: null,
    status: "loading" as const,
    config: null,
  };
  authorityRef.current = invalidated;
  return invalidated;
};

export const applyOperationalDataContextChange = (
  current: AppData,
  next: AppData,
  authorityRef: OperationalAuthorityRef,
): AppData => {
  if (next.selectedCenterId !== current.selectedCenterId) {
    invalidateOperationalAuthority(authorityRef);
  }
  return next;
};

export const resolveActiveOperationalConfig = (
  contextKey: string | null,
  centerId: string,
  state: OperationalConfigLifecycleState,
): OperationalConfigLifecycleState =>
  contextKey && state.contextKey === contextKey && state.centerId === centerId
    ? state
    : {
        contextKey,
        centerId: contextKey ? centerId : null,
        status: "loading",
        config: null,
      };

export const isOperationalExecutionContextCurrent = (
  requested: OperationalConfigLifecycleState,
  current: OperationalConfigLifecycleState,
) =>
  requested === current &&
  requested.status === "ready" &&
  requested.config !== null &&
  requested.contextKey !== null &&
  requested.centerId !== null;

export const createOperationalExecutionGuard = (
  requested: OperationalConfigLifecycleState,
  getCurrent: () => OperationalConfigLifecycleState,
) => () => isOperationalExecutionContextCurrent(requested, getCurrent());

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export const operationalConfigFromPublicProjection = (
  centerId: string,
  projection: PublicKioskConfig | null,
): OperationalCenterConfig | null => {
  if (
    !projection ||
    projection.centerId !== centerId ||
    !TIME_PATTERN.test(projection.serviceStartTime) ||
    !TIME_PATTERN.test(projection.serviceEndTime) ||
    typeof projection.enabled !== "boolean" ||
    !projection.timezone
  ) {
    return null;
  }

  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: projection.timezone }).format(new Date(0));
  } catch {
    return null;
  }

  return {
    enabled: projection.enabled,
    serviceStartTime: projection.serviceStartTime,
    serviceEndTime: projection.serviceEndTime,
    timezone: projection.timezone,
  };
};

export const hydrateOperationalCenterConfig = (
  data: AppData,
  centerId: string,
  config: OperationalCenterConfig,
): AppData => {
  const center = data.centers[centerId];
  if (!center) return data;
  return {
    ...data,
    centers: {
      ...data.centers,
      [centerId]: { ...center, ...config },
    },
  };
};

export const subscribeToAuthorizedOperationalConfig = ({
  contextKey,
  centerId,
  authorizedCenterIds,
  subscribe,
  onState,
}: {
  contextKey: string;
  centerId: string;
  authorizedCenterIds: readonly string[];
  subscribe: (
    centerId: string,
    onSnapshot: (config: PublicKioskConfig | null) => void,
    onError: () => void,
  ) => () => void;
  onState: (state: OperationalConfigLifecycleState) => void;
}) => {
  if (!authorizedCenterIds.includes(centerId)) {
    onState({ contextKey, centerId, status: "error", config: null });
    return () => undefined;
  }

  let disposed = false;
  onState({ contextKey, centerId, status: "loading", config: null });
  try {
    const unsubscribe = subscribe(
      centerId,
      (projection) => {
        if (disposed) return;
        const config = operationalConfigFromPublicProjection(centerId, projection);
        if (!config) {
          onState({ contextKey, centerId, status: "error", config: null });
          return;
        }
        onState({ contextKey, centerId, status: "ready", config });
      },
      () => {
        if (!disposed) onState({ contextKey, centerId, status: "error", config: null });
      },
    );
    return () => {
      disposed = true;
      unsubscribe();
    };
  } catch {
    if (!disposed) onState({ contextKey, centerId, status: "error", config: null });
    return () => undefined;
  }
};

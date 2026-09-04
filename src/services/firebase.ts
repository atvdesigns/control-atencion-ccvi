import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type Auth,
  type User,
} from "firebase/auth";
import {
  connectDatabaseEmulator,
  get,
  getDatabase,
  onValue,
  ref,
  remove,
  runTransaction,
  set,
  update,
  type Database,
  type Unsubscribe,
} from "firebase/database";
import {
  getFunctions,
  httpsCallable,
  type Functions,
} from "firebase/functions";
import { getPublicJourneyPresentation } from "../publicJourney";
import type {
  CaseRecord,
  CenterConfig,
  PrivateUserRole,
  PublicDisplayEntry,
  PublicTurnStatus,
  UserProfile,
} from "../types";

export { onValue, ref, runTransaction, set, update };
export { onAuthStateChanged, signInWithEmailAndPassword, signOut };

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const hasFirebaseConfig = Object.values(firebaseConfig).every(Boolean);
export const useFirebaseEmulator =
  import.meta.env.VITE_USE_FIREBASE_EMULATOR === "true";

export let firebaseApp: FirebaseApp | null = null;
export let firebaseDatabase: Database | null = null;
export let firebaseAuth: Auth | null = null;
export let firebaseFunctions: Functions | null = null;

if (hasFirebaseConfig) {
  firebaseApp = initializeApp(firebaseConfig);
  firebaseDatabase = getDatabase(firebaseApp);
  firebaseAuth = getAuth(firebaseApp);
  firebaseFunctions = getFunctions(firebaseApp, "us-central1");

  if (useFirebaseEmulator) {
    connectDatabaseEmulator(firebaseDatabase, "127.0.0.1", 9000);
  }
}

export const database = firebaseDatabase;
export const auth = firebaseAuth;
export const functions = firebaseFunctions;

interface CreateKioskArrivalResponse {
  publicCode: string;
  publicToken: string;
}

export const createKioskArrivalCallable = async (
  centerId: string,
  serviceType: string,
): Promise<CreateKioskArrivalResponse> => {
  if (!functions) throw new Error("FIREBASE_FUNCTIONS_UNAVAILABLE");

  const callable = httpsCallable<
    { centerId: string; serviceType: string },
    CreateKioskArrivalResponse
  >(functions, "createKioskArrival");
  const result = await callable({ centerId, serviceType });
  if (
    !result.data ||
    typeof result.data.publicCode !== "string" ||
    typeof result.data.publicToken !== "string"
  ) {
    throw new Error("INVALID_KIOSK_ARRIVAL_RESPONSE");
  }
  return result.data;
};

const configuredUsernameDomain =
  import.meta.env.VITE_FIREBASE_USERNAME_DOMAIN?.trim().toLowerCase();
const authUsernameDomain =
  configuredUsernameDomain && /^[a-z0-9.-]+$/.test(configuredUsernameDomain)
    ? configuredUsernameDomain
    : "staging.ccvi.local";
const safeUsernamePattern = /^[a-z0-9](?:[a-z0-9._-]{1,30}[a-z0-9])?$/;

export const usernameToAuthEmail = (username: string): string => {
  const normalizedUsername = username.trim().toLowerCase();
  if (!safeUsernamePattern.test(normalizedUsername)) {
    throw new Error("INVALID_USERNAME");
  }

  return `${normalizedUsername}@${authUsernameDomain}`;
};

export const signInWithUsername = (username: string, password: string) => {
  if (!auth) throw new Error("FIREBASE_AUTH_UNAVAILABLE");
  return signInWithEmailAndPassword(auth, usernameToAuthEmail(username), password);
};

export const signOutCurrentUser = () => {
  if (!auth) return Promise.resolve();
  return signOut(auth);
};

const privateUserRoles: PrivateUserRole[] = [
  "admin",
  "operator-window-1",
  "operator-window-2",
  "cashier",
];

export const getUserProfileRealtime = async (
  uid: string,
): Promise<UserProfile | null> => {
  if (!database || !uid) return null;

  const snapshot = await get(ref(database, `users/${uid}`));
  if (!snapshot.exists()) return null;

  const value = snapshot.val() as Partial<UserProfile> | null;
  if (
    !value ||
    value.uid !== uid ||
    !privateUserRoles.includes(value.role as PrivateUserRole) ||
    !Array.isArray(value.centerIds) ||
    !value.centerIds.every((centerId) => typeof centerId === "string") ||
    typeof value.enabled !== "boolean" ||
    (value.cashierId !== undefined && typeof value.cashierId !== "string")
  ) {
    return null;
  }

  return value as UserProfile;
};

export type AuthSessionState =
  | { status: "loading"; user: null; profile: null }
  | { status: "authenticated"; user: User; profile: UserProfile }
  | { status: "unauthenticated"; user: null; profile: null }
  | { status: "unauthorized"; user: User | null; profile: null };

export const observeAuthSession = (
  onSession: (session: AuthSessionState) => void,
): Unsubscribe => {
  onSession({ status: "loading", user: null, profile: null });
  if (!auth) {
    onSession({ status: "unauthenticated", user: null, profile: null });
    return () => undefined;
  }

  let observationId = 0;
  const unsubscribe = onAuthStateChanged(
    auth,
    async (user) => {
      const currentObservation = ++observationId;
      if (!user) {
        onSession({ status: "unauthenticated", user: null, profile: null });
        return;
      }

      try {
        const profile = await getUserProfileRealtime(user.uid);
        if (currentObservation !== observationId) return;
        if (!profile?.enabled) {
          onSession({ status: "unauthorized", user, profile: null });
          return;
        }
        onSession({ status: "authenticated", user, profile });
      } catch {
        if (currentObservation === observationId) {
          onSession({ status: "unauthorized", user, profile: null });
        }
      }
    },
    () => onSession({ status: "unauthorized", user: null, profile: null }),
  );

  return () => {
    observationId += 1;
    unsubscribe();
  };
};

export interface OperationalDaySnapshot {
  metadata?: unknown;
  cases?: unknown;
  paymentQueue?: unknown;
  events?: unknown;
}

export const subscribeToOperationalDay = (
  centerId: string,
  dayId: string,
  onSnapshot: (snapshot: OperationalDaySnapshot) => void,
): Unsubscribe => {
  if (!database || !centerId || !dayId) return () => undefined;

  return onValue(ref(database, `days/${centerId}/${dayId}`), (snapshot) => {
    if (!snapshot.exists()) return;

    const value = snapshot.val() as OperationalDaySnapshot | null;
    if (!value || typeof value !== "object") return;

    onSnapshot({
      metadata: value.metadata,
      cases: value.cases,
      paymentQueue: value.paymentQueue,
      events: value.events,
    });
  });
};

export const subscribeToPublicTurnStatus = (
  publicToken: string,
  onSnapshot: (status: PublicTurnStatus | null) => void,
  onError: () => void,
): Unsubscribe => {
  if (!database) throw new Error("FIREBASE_DATABASE_UNAVAILABLE");
  if (!publicToken || publicToken.length > 256) {
    onSnapshot(null);
    return () => undefined;
  }

  return onValue(
    ref(database, `public/turns/${publicPathSegment(publicToken)}`),
    (snapshot) => {
      if (!snapshot.exists()) {
        onSnapshot(null);
        return;
      }

      const value = snapshot.val() as Partial<PublicTurnStatus> | null;
      if (
        !value ||
        typeof value.publicCode !== "string" ||
        typeof value.status !== "string" ||
        !["representation", "vehicle_owner"].includes(value.serviceType ?? "") ||
        typeof value.serviceLabel !== "string" ||
        (value.destination !== null && typeof value.destination !== "string") ||
        typeof value.updatedAt !== "number" ||
        !Array.isArray(value.requirements) ||
        !value.requirements.every((item) => typeof item === "string") ||
        !Array.isArray(value.paymentMethods) ||
        !value.paymentMethods.every(
          (item) =>
            item &&
            typeof item.label === "string" &&
            typeof item.accepted === "boolean",
        )
      ) {
        onError();
        return;
      }

      onSnapshot({
        publicCode: value.publicCode,
        status: value.status,
        serviceType: value.serviceType as PublicTurnStatus["serviceType"],
        serviceLabel: value.serviceLabel,
        destination: value.destination,
        updatedAt: value.updatedAt,
        requirements: [...value.requirements],
        paymentMethods: value.paymentMethods.map((item) => ({
          label: item.label,
          accepted: item.accepted,
        })),
      });
    },
    onError,
  );
};

export const subscribeToPublicDisplay = (
  centerId: string,
  dayId: string,
  onSnapshot: (entries: PublicDisplayEntry[]) => void,
  onError: () => void,
): Unsubscribe => {
  if (!database) throw new Error("FIREBASE_DATABASE_UNAVAILABLE");

  return onValue(
    ref(
      database,
      `public/displays/${publicPathSegment(centerId)}/${publicPathSegment(dayId)}`,
    ),
    (snapshot) => {
      if (!snapshot.exists()) {
        onSnapshot([]);
        return;
      }

      const entries = Object.values(snapshot.val() as Record<string, unknown>)
        .filter((value): value is Record<string, unknown> =>
          Boolean(value && typeof value === "object" && !Array.isArray(value)),
        )
        .flatMap((value) => {
          if (
            typeof value.publicCode !== "string" ||
            typeof value.isPriority !== "boolean" ||
            typeof value.status !== "string" ||
            typeof value.destination !== "string" ||
            typeof value.updatedAt !== "number"
          ) {
            return [];
          }
          return [{
            publicCode: value.publicCode,
            isPriority: value.isPriority,
            status: value.status,
            destination: value.destination,
            updatedAt: value.updatedAt,
          }];
        });
      onSnapshot(entries);
    },
    onError,
  );
};

const publicPathSegment = (value: string) => {
  if (!value || /[.#$[\]/]/.test(value)) {
    throw new Error("INVALID_PUBLIC_PATH_SEGMENT");
  }
  return value;
};

const withoutUndefined = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value
      .map((item) => withoutUndefined(item))
      .filter((item) => item !== undefined);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, withoutUndefined(item)]),
    );
  }
  return value;
};

const centerConfigReference = (centerId: string) => {
  if (!database) throw new Error("FIREBASE_DATABASE_UNAVAILABLE");
  return ref(database, `centers/${publicPathSegment(centerId)}`);
};

export const writeCenterConfigRealtime = (center: CenterConfig) =>
  set(centerConfigReference(center.centerId), withoutUndefined(center));

export const removeCenterConfigRealtime = (centerId: string) =>
  remove(centerConfigReference(centerId));

export const getCenterConfigRealtime = async (
  centerId: string,
): Promise<CenterConfig | null> => {
  const snapshot = await get(centerConfigReference(centerId));
  return snapshot.exists() ? (snapshot.val() as CenterConfig) : null;
};

const publicCashierDestination = (
  caseItem: CaseRecord,
  center: CenterConfig,
) => {
  if (!caseItem.cashierId) return null;
  return center.cashiers.find((item) => item.cashierId === caseItem.cashierId)?.name ?? null;
};

export const toPublicTurnStatus = (
  caseItem: CaseRecord,
  center: CenterConfig,
): PublicTurnStatus => {
  const presentation = getPublicJourneyPresentation(
    caseItem,
    publicCashierDestination(caseItem, center),
  );

  return {
    publicCode: caseItem.publicCode,
    status: presentation.title,
    serviceType: caseItem.serviceType,
    serviceLabel: caseItem.serviceLabel,
    destination: presentation.destination,
    updatedAt: caseItem.updatedAt,
    requirements: center.documentaryRequirements[caseItem.serviceType]
      .filter((item) => item.enabled)
      .map((item) => item.label),
    paymentMethods: center.paymentMethods.map((item) => ({
      label: item.label,
      accepted: item.accepted,
    })),
  };
};

export const toPublicDisplayEntry = (
  caseItem: CaseRecord,
  center: CenterConfig,
): PublicDisplayEntry | null => {
  if (
    ![
      "called_to_window",
      "in_document_validation",
      "called_to_cashier",
      "in_cashier_attention",
    ].includes(caseItem.currentState)
  ) {
    return null;
  }

  const presentation = getPublicJourneyPresentation(
    caseItem,
    publicCashierDestination(caseItem, center),
  );
  if (!presentation.destination) return null;

  return {
    publicCode: caseItem.publicCode,
    isPriority: caseItem.isPriority,
    status: presentation.title,
    destination: presentation.destination,
    updatedAt: caseItem.updatedAt,
  };
};

export const publicTurnStatusUpdate = (
  publicToken: string,
  status: PublicTurnStatus | null,
) => ({
  [`public/turns/${publicPathSegment(publicToken)}`]: status,
});

export const publicDisplayEntryUpdate = (
  centerId: string,
  dayId: string,
  entryKey: string,
  entry: PublicDisplayEntry | null,
) => ({
  [`public/displays/${publicPathSegment(centerId)}/${publicPathSegment(dayId)}/${publicPathSegment(entryKey)}`]: entry,
});

export const writePublicTurnStatus = (
  publicToken: string,
  status: PublicTurnStatus,
) => {
  if (!database) return Promise.reject(new Error("FIREBASE_DATABASE_UNAVAILABLE"));
  return update(ref(database), publicTurnStatusUpdate(publicToken, status));
};

export const removePublicTurnStatus = (publicToken: string) => {
  if (!database) return Promise.reject(new Error("FIREBASE_DATABASE_UNAVAILABLE"));
  return update(ref(database), publicTurnStatusUpdate(publicToken, null));
};

export const writePublicDisplayEntry = (
  centerId: string,
  dayId: string,
  entryKey: string,
  entry: PublicDisplayEntry,
) => {
  if (!database) return Promise.reject(new Error("FIREBASE_DATABASE_UNAVAILABLE"));
  return update(
    ref(database),
    publicDisplayEntryUpdate(centerId, dayId, entryKey, entry),
  );
};

export const removePublicDisplayEntry = (
  centerId: string,
  dayId: string,
  entryKey: string,
) => {
  if (!database) return Promise.reject(new Error("FIREBASE_DATABASE_UNAVAILABLE"));
  return update(
    ref(database),
    publicDisplayEntryUpdate(centerId, dayId, entryKey, null),
  );
};

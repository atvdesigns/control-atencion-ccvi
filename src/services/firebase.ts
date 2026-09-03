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
  runTransaction,
  set,
  update,
  type Database,
  type Unsubscribe,
} from "firebase/database";
import type { PrivateUserRole, UserProfile } from "../types";

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

if (hasFirebaseConfig) {
  firebaseApp = initializeApp(firebaseConfig);
  firebaseDatabase = getDatabase(firebaseApp);
  firebaseAuth = getAuth(firebaseApp);

  if (useFirebaseEmulator) {
    connectDatabaseEmulator(firebaseDatabase, "127.0.0.1", 9000);
  }
}

export const database = firebaseDatabase;
export const auth = firebaseAuth;

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

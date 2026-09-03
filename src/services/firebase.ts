import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type Auth,
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

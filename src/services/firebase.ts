import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  connectDatabaseEmulator,
  getDatabase,
  onValue,
  ref,
  runTransaction,
  set,
  update,
  type Database,
  type Unsubscribe,
} from "firebase/database";

export { onValue, ref, runTransaction, set, update };

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

if (hasFirebaseConfig) {
  firebaseApp = initializeApp(firebaseConfig);
  firebaseDatabase = getDatabase(firebaseApp);

  if (useFirebaseEmulator) {
    connectDatabaseEmulator(firebaseDatabase, "127.0.0.1", 9000);
  }
}

export const database = firebaseDatabase;

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

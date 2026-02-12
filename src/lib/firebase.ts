
import {initializeApp, getApps, getApp, type FirebaseApp} from 'firebase/app';
import {getAuth, connectAuthEmulator, type Auth} from 'firebase/auth';
import {getFirestore, type Firestore} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

function isBrowser() {
  return typeof window !== 'undefined';
}

export function getFirebaseApp(): FirebaseApp {
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

let cachedAuth: Auth | null = null;
export function getFirebaseAuth(): Auth {
  if (!isBrowser()) {
    throw new Error('Firebase Auth can only be initialized in the browser.');
  }

  if (cachedAuth) return cachedAuth;

  const app = getFirebaseApp();
  const auth = getAuth(app);

  // Use the Auth emulator ONLY when explicitly enabled.
  // (Connecting unconditionally in dev breaks auth if emulator isn't running.)
  const useEmulator =
    process.env.NODE_ENV === 'development' &&
    process.env.NEXT_PUBLIC_USE_FIREBASE_AUTH_EMULATOR === 'true' &&
    window.location.hostname === 'localhost';

  if (useEmulator) {
    try {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', {disableWarnings: true});
      // eslint-disable-next-line no-console
      console.log('Firebase Auth connected to local emulator.');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to connect Firebase Auth to local emulator', error);
    }
  }

  cachedAuth = auth;
  return auth;
}

let cachedDb: Firestore | null = null;
export function getFirebaseDb(): Firestore {
  const app = getFirebaseApp();
  if (cachedDb) return cachedDb;
  cachedDb = getFirestore(app);
  return cachedDb;
}

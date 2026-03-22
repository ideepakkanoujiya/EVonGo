import 'server-only';

import {
  applicationDefault,
  cert,
  getApp,
  getApps,
  initializeApp,
  type App,
  type ServiceAccount,
} from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

function normalizeEnvValue(value?: string) {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return undefined;
  }

  const hasDoubleQuotes = trimmed.startsWith('"') && trimmed.endsWith('"');
  const hasSingleQuotes = trimmed.startsWith("'") && trimmed.endsWith("'");

  if (hasDoubleQuotes || hasSingleQuotes) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function normalizePrivateKey(privateKey?: string) {
  return normalizeEnvValue(privateKey)?.replace(/\\n/g, '\n');
}

function getServiceAccountFromEnv(): ServiceAccount | null {
  const serviceAccountJson = normalizeEnvValue(process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON);

  if (serviceAccountJson) {
    try {
      const parsed = JSON.parse(serviceAccountJson) as ServiceAccount;
      return {
        ...parsed,
        privateKey: normalizePrivateKey(parsed.privateKey),
      };
    } catch {
      throw new Error('Invalid FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON value.');
    }
  }

  const projectId = normalizeEnvValue(process.env.FIREBASE_ADMIN_PROJECT_ID);
  const clientEmail = normalizeEnvValue(process.env.FIREBASE_ADMIN_CLIENT_EMAIL);
  const privateKey = normalizePrivateKey(process.env.FIREBASE_ADMIN_PRIVATE_KEY);

  if (projectId && clientEmail && privateKey) {
    return {
      projectId,
      clientEmail,
      privateKey,
    };
  }

  return null;
}

function hasApplicationDefaultCredentials() {
  return Boolean(
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      process.env.GOOGLE_CLOUD_PROJECT ||
      process.env.GCLOUD_PROJECT ||
      process.env.K_SERVICE ||
      process.env.FUNCTION_TARGET
  );
}

export function getFirebaseAdminApp(): App {
  if (getApps().length) {
    return getApp();
  }

  const serviceAccount = getServiceAccountFromEnv();

  if (serviceAccount) {
    return initializeApp({
      credential: cert(serviceAccount),
      projectId: serviceAccount.projectId ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    });
  }

  if (hasApplicationDefaultCredentials()) {
    return initializeApp({
      credential: applicationDefault(),
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    });
  }

  throw new Error(
    'Firebase Admin credentials are not configured. Set FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON or FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, and FIREBASE_ADMIN_PRIVATE_KEY.'
  );
}

let cachedAdminDb: Firestore | null = null;

export function getFirebaseAdminDb(): Firestore {
  if (cachedAdminDb) {
    return cachedAdminDb;
  }

  cachedAdminDb = getFirestore(getFirebaseAdminApp());
  return cachedAdminDb;
}

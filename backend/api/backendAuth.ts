import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getAuth, Auth } from 'firebase-admin/auth';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

let db: Firestore | null = null;
let auth: Auth | null = null;
let isInitialized = false;

export function initializeFirebaseAdmin() {
  if (isInitialized) return { db, auth };

  try {
    const serviceAccountVar = process.env.FIREBASE_SERVICE_ACCOUNT;

    if (serviceAccountVar) {
      const serviceAccount = JSON.parse(serviceAccountVar);
      initializeApp({
        credential: cert(serviceAccount)
      });
      console.log('[Firebase Admin] Initialized with env service account.');
      isInitialized = true;
    } else {
      const serviceAccountPath = path.join(process.cwd(), 'firebase-service-account.json');
      if (fs.existsSync(serviceAccountPath)) {
        const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
        initializeApp({
          credential: cert(serviceAccount)
        });
        console.log('[Firebase Admin] Initialized with local json file.');
        isInitialized = true;
      } else {
        const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
        if (fs.existsSync(configPath)) {
          const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
          initializeApp({
            projectId: config.projectId
          });
          console.log('[Firebase Admin] Initialized dynamically with applet config projectId.');
          isInitialized = true;
        } else {
          console.warn('[Firebase Admin] WARNING: Firebase credentials not found.');
        }
      }
    }
  } catch (error) {
    console.error('[Firebase Admin] Initialization failed:', error);
  }

  if (isInitialized) {
    db = getFirestore();
    auth = getAuth();
  }

  return { db, auth };
}

export function getFirestoreAdmin() {
  const { db } = initializeFirebaseAdmin();
  return db;
}

export function getAuthAdmin() {
  const { auth } = initializeFirebaseAdmin();
  return auth;
}

// FASE 1: Firebase Custom Claims - Função administrativa para atualizar Claims
export async function setCustomUserClaims(
  uid: string,
  role: string,
  permissions: string[],
  empresaId?: string
) {
  const authAdmin = getAuthAdmin();
  if (authAdmin) {
    await authAdmin.setCustomUserClaims(uid, {
      role,
      permissoes: permissions,
      empresaId: empresaId || 'empresa-default'
    });
    console.log(`[Custom Claims] Updated for user ${uid}: role=${role}, empresaId=${empresaId}`);
  }
}

// FASE 1: Forçar renovação de token (faz o client reobter token com novas claims)
export async function forceTokenRefresh(uid: string) {
  const authAdmin = getAuthAdmin();
  if (authAdmin) {
    try {
      await authAdmin.revokeRefreshTokens(uid);
      console.log(`[Custom Claims] Refresh tokens revoked for user ${uid} - client must re-auth`);
    } catch (err) {
      console.error(`[Custom Claims] Error revoking tokens for ${uid}:`, err);
    }
  }
}

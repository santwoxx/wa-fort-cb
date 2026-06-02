import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut 
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
// Your custom web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyD8COLSxMaFixfV0E9Ui2kAqQoYd-2Wxik",
  authDomain: "wa-fort-cb.firebaseapp.com",
  projectId: "wa-fort-cb",
  storageBucket: "wa-fort-cb.firebasestorage.app",
  messagingSenderId: "1070201018076",
  appId: "1:1070201018076:web:5f86487a8659ac174dc619",
  measurementId: "G-VW6XB6578W"
};

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// Initialize Services
export const db = getFirestore(app);
export const auth = getAuth(app);

// Providers
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: "select_account"
});

// Custom sign-in with popup (preferred inside preview iframes)
export const signInWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error("Erro ao autenticar com o Google:", error);
    throw error;
  }
};

export const logout = async () => {
  await signOut(auth);
};

// --- FIRESTORE ADVANCED ERROR HANDLERS & PROTOCOL (AS SPECIFIED BY SKILL) ---

export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error("Firestore Permission/Access Error: ", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

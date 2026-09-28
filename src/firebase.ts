/**
 * Firebase Client Integration for Kingfisher
 */
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  type User as FirebaseUser
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  onSnapshot,
  getDocFromServer,
  query,
  orderBy
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// CRITICAL: The app will break without passing firestoreDatabaseId
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
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

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
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
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Validate connection on boot
export async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    }
  }
}

// Auth operations
export async function signInWithGoogle() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    // Sync user record to Firestore
    await syncUserProfile(user);
    return user;
  } catch (error) {
    console.error("Google Sign-In Error:", error);
    throw error;
  }
}

export async function signOutUser() {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Sign-Out Error:", error);
    throw error;
  }
}

// User Profile sync
export async function syncUserProfile(user: FirebaseUser) {
  const userRef = doc(db, 'users', user.uid);
  try {
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      await setDoc(userRef, {
        id: user.uid,
        email: user.email || '',
        displayName: user.displayName || 'Director',
        photoURL: user.photoURL || '',
        createdAt: new Date().toISOString()
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
  }
}

export interface SavedPromptItem {
  id: string;
  userId: string;
  promptId: string;
  title: string;
  snippet: string;
  createdAt: string;
  notes?: string;
}

// Save prompt for user
export async function savePrompt(promptId: string, title: string, snippet: string) {
  const user = auth.currentUser;
  if (!user) throw new Error("Authentication required to save prompts.");

  const docId = `${promptId.replace(/[^a-zA-Z0-9_\-]/g, '_')}_${Date.now()}`;
  const docRef = doc(db, 'users', user.uid, 'savedPrompts', docId);

  const payload: SavedPromptItem = {
    id: docId,
    userId: user.uid,
    promptId,
    title,
    snippet,
    createdAt: new Date().toISOString(),
    notes: 'Saved from Kingfisher Cinematic Library'
  };

  try {
    await setDoc(docRef, payload);
    return payload;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `users/${user.uid}/savedPrompts/${docId}`);
  }
}

// Remove saved prompt
export async function removeSavedPrompt(docId: string) {
  const user = auth.currentUser;
  if (!user) throw new Error("Authentication required.");

  const docRef = doc(db, 'users', user.uid, 'savedPrompts', docId);
  try {
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `users/${user.uid}/savedPrompts/${docId}`);
  }
}

// Subscribe to user saved prompts
export function subscribeSavedPrompts(userId: string, callback: (items: SavedPromptItem[]) => void) {
  const collRef = collection(db, 'users', userId, 'savedPrompts');
  return onSnapshot(collRef, (snapshot) => {
    const list: SavedPromptItem[] = [];
    snapshot.forEach(docSnap => {
      list.push(docSnap.data() as SavedPromptItem);
    });
    callback(list);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, `users/${userId}/savedPrompts`);
  });
}

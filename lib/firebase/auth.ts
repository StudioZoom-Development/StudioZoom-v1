import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  type UserCredential,
} from 'firebase/auth'
import { auth } from './config'

/** Sign in with email + password */
export async function signIn(
  email: string,
  password: string
): Promise<UserCredential> {
  return signInWithEmailAndPassword(auth, email, password)
}

/** Sign out the current user */
export async function signOut(): Promise<void> {
  return firebaseSignOut(auth)
}

/** Send password reset email */
export async function resetPassword(email: string): Promise<void> {
  return sendPasswordResetEmail(auth, email)
}

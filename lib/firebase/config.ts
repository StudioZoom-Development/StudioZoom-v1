import { initializeApp, getApps } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'mock-api-key-for-build',
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'mock-auth-domain-for-build',
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'mock-project-id-for-build',
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'mock-storage-bucket-for-build',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || 'mock-sender-id-for-build',
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID || 'mock-app-id-for-build',
}

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]

export const auth    = getAuth(app)
export const db      = getFirestore(app)
export const storage = getStorage(app)

// Uncomment to use Firebase emulator suite locally
// if (process.env.NEXT_PUBLIC_APP_ENV === 'development' && typeof window !== 'undefined') {
//   connectFirestoreEmulator(db, 'localhost', 8080)
// }

export default app

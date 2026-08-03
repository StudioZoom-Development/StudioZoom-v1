/**
 * Firebase Admin SDK singleton — server-side only.
 * Lazy-initialised on first API call so build doesn't require the env var.
 *
 * Required env var (set in .env.local, NOT committed):
 *   FIREBASE_ADMIN_SERVICE_ACCOUNT = the full service-account JSON as a single-line string
 */
import { initializeApp, getApps, cert, type App } from 'firebase-admin/app'
import { getAuth, type Auth }                       from 'firebase-admin/auth'
import { getFirestore, type Firestore }             from 'firebase-admin/firestore'

let _app:       App       | null = null
let _auth:      Auth      | null = null
let _firestore: Firestore | null = null

function getAdminApp(): App {
  if (_app) return _app
  if (getApps().length > 0) { _app = getApps()[0]; return _app }

  const raw = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT
  if (!raw) {
    throw new Error(
      'FIREBASE_ADMIN_SERVICE_ACCOUNT env var is missing. ' +
      'Add it to .env.local as the full service-account JSON string.'
    )
  }

  const serviceAccount = JSON.parse(raw) as {
    project_id:   string
    client_email: string
    private_key:  string
  }

  _app = initializeApp({
    credential: cert({
      projectId:   serviceAccount.project_id,
      clientEmail: serviceAccount.client_email,
      privateKey:  serviceAccount.private_key.replace(/\\n/g, '\n'),
    }),
  })
  return _app
}

export function getAdminAuth(): Auth {
  if (!_auth) _auth = getAuth(getAdminApp())
  return _auth
}

export function getAdminFirestore(): Firestore {
  if (!_firestore) _firestore = getFirestore(getAdminApp())
  return _firestore
}

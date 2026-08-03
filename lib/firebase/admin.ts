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

  let raw = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT
  if (!raw) {
    throw new Error(
      'FIREBASE_ADMIN_SERVICE_ACCOUNT env var is missing. ' +
      'Add it to .env.local as the full service-account JSON string.'
    )
  }

  raw = raw.trim()
  // Strip outer quotes if wrapped in single or double quotes
  if ((raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"'))) {
    raw = raw.slice(1, -1)
  }

  try {
    const serviceAccount = JSON.parse(raw) as {
      project_id?:   string
      projectId?:    string
      client_email?: string
      clientEmail?:  string
      private_key?:  string
      privateKey?:   string
    }

    const projectId   = serviceAccount.project_id   || serviceAccount.projectId
    const clientEmail = serviceAccount.client_email || serviceAccount.clientEmail
    let   privateKey  = serviceAccount.private_key  || serviceAccount.privateKey

    if (!projectId || !clientEmail || !privateKey) {
      throw new Error('Missing projectId, clientEmail, or privateKey in FIREBASE_ADMIN_SERVICE_ACCOUNT JSON.')
    }

    // Format multiline private key correctly
    privateKey = privateKey.replace(/\\n/g, '\n')

    _app = initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    })
    return _app
  } catch (err) {
    console.error('[Admin SDK Init Error]:', err)
    throw err
  }
}

export function getAdminAuth(): Auth {
  if (!_auth) _auth = getAuth(getAdminApp())
  return _auth
}

export function getAdminFirestore(): Firestore {
  if (!_firestore) _firestore = getFirestore(getAdminApp())
  return _firestore
}

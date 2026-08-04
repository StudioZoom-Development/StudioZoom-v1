/**
 * Firebase Admin SDK singleton — server-side only.
 * Lazy-initialised on first API call using dynamic import so Next.js build
 * and serverless evaluation do not fail statically.
 */
import type { App }       from 'firebase-admin/app'
import type { Auth }      from 'firebase-admin/auth'
import type { Firestore } from 'firebase-admin/firestore'

let _app:       App       | null = null
let _auth:      Auth      | null = null
let _firestore: Firestore | null = null

export async function getAdminApp(): Promise<App> {
  if (_app) return _app

  const { initializeApp, getApps, cert } = await import('firebase-admin/app')
  if (getApps().length > 0) {
    _app = getApps()[0]
    return _app
  }

  let raw = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT
  if (!raw) {
    throw new Error(
      'FIREBASE_ADMIN_SERVICE_ACCOUNT env var is missing. ' +
      'Add it to Vercel project environment variables.'
    )
  }

  raw = raw.trim()
  // Strip outer quotes if wrapped in single or double quotes
  if ((raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"'))) {
    raw = raw.slice(1, -1)
  }

  // Support Base64 encoded JSON string
  if (!raw.startsWith('{')) {
    try {
      const decoded = Buffer.from(raw, 'base64').toString('utf8').trim()
      if (decoded.startsWith('{')) {
        raw = decoded
      }
    } catch {
      // Continue with raw if not base64
    }
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

    const projectId   = serviceAccount.project_id   || serviceAccount.projectId   || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
    const clientEmail = serviceAccount.client_email || serviceAccount.clientEmail || process.env.FIREBASE_CLIENT_EMAIL
    let   privateKey  = serviceAccount.private_key  || serviceAccount.privateKey  || process.env.FIREBASE_PRIVATE_KEY

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

export async function getAdminAuth(): Promise<Auth> {
  if (!_auth) {
    const app = await getAdminApp()
    const { getAuth } = await import('firebase-admin/auth')
    _auth = getAuth(app)
  }
  return _auth
}

export async function getAdminFirestore(): Promise<Firestore> {
  if (!_firestore) {
    const app = await getAdminApp()
    const { getFirestore } = await import('firebase-admin/firestore')
    _firestore = getFirestore(app)
  }
  return _firestore
}

/**
 * Firebase Admin REST API Client — zero external npm dependencies.
 * Uses Google OAuth2 & Identity Toolkit REST API to replace firebase-admin/auth,
 * completely eliminating Next.js Turbopack ERR_REQUIRE_ESM errors on Vercel.
 */
import crypto from 'crypto'

interface ServiceAccount {
  project_id?:   string
  projectId?:    string
  client_email?: string
  clientEmail?:  string
  private_key?:  string
  privateKey?:   string
}

let cachedToken: { token: string; expiresAt: number } | null = null

function getServiceAccount(): { projectId: string; clientEmail: string; privateKey: string } {
  let raw = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT
  if (!raw) {
    throw new Error('FIREBASE_ADMIN_SERVICE_ACCOUNT env var is missing.')
  }

  raw = raw.trim()
  if ((raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"'))) {
    raw = raw.slice(1, -1)
  }

  if (!raw.startsWith('{')) {
    try {
      const decoded = Buffer.from(raw, 'base64').toString('utf8').trim()
      if (decoded.startsWith('{')) raw = decoded
    } catch {}
  }

  const parsed = JSON.parse(raw) as ServiceAccount
  const projectId   = parsed.project_id   || parsed.projectId   || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'studio-zoom'
  const clientEmail = parsed.client_email || parsed.clientEmail || ''
  let   privateKey  = parsed.private_key  || parsed.privateKey  || ''

  if (!clientEmail || !privateKey) {
    throw new Error('Invalid FIREBASE_ADMIN_SERVICE_ACCOUNT JSON: missing client_email or private_key.')
  }

  privateKey = privateKey.replace(/\\n/g, '\n')

  return { projectId, clientEmail, privateKey }
}

async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  if (cachedToken && cachedToken.expiresAt > now + 300) {
    return cachedToken.token
  }

  const { clientEmail, privateKey } = getServiceAccount()

  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
  const claimSet = Buffer.from(JSON.stringify({
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/identitytoolkit https://www.googleapis.com/auth/firebase',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  })).toString('base64url')

  const sign = crypto.createSign('RSA-SHA256')
  sign.update(`${header}.${claimSet}`)
  const signature = sign.sign(privateKey, 'base64url')
  const jwt = `${header}.${claimSet}.${signature}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`OAuth2 token error (${res.status}): ${text}`)
  }

  const data = await res.json() as { access_token: string; expires_in: number }
  cachedToken = {
    token: data.access_token,
    expiresAt: now + (data.expires_in || 3600),
  }
  return data.access_token
}

export async function adminSendPasswordReset(email: string): Promise<{ success: boolean; email: string }> {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY
  if (!apiKey) throw new Error('NEXT_PUBLIC_FIREBASE_API_KEY env var is required')

  const accessToken = await getAccessToken()

  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      requestType: 'PASSWORD_RESET',
      email: email.trim(),
    }),
  })

  const data = await res.json() as { email?: string; error?: { message?: string } }

  if (!res.ok) {
    const message = data.error?.message ?? 'Failed to send reset email'
    if (message === 'EMAIL_NOT_FOUND') {
      throw new Error(`No account exists for ${email}. Please check the email address.`)
    }
    throw new Error(message)
  }

  return { success: true, email: data.email ?? email }
}

export async function adminCreateUser(params: { name: string; email: string; password?: string }): Promise<{ uid: string; email: string }> {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY
  if (!apiKey) throw new Error('NEXT_PUBLIC_FIREBASE_API_KEY env var is required')

  const accessToken = await getAccessToken()

  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      email: params.email.trim(),
      password: params.password,
      displayName: params.name.trim(),
      returnSecureToken: true,
    }),
  })

  const data = await res.json() as { localId?: string; email?: string; error?: { message?: string } }

  if (!res.ok) {
    const message = data.error?.message ?? 'Failed to create user'
    if (message === 'EMAIL_EXISTS') {
      throw new Error(`An account with email ${params.email} already exists.`)
    }
    throw new Error(message)
  }

  return { uid: data.localId!, email: data.email! }
}

export async function adminDeleteUser(uid: string): Promise<boolean> {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY
  if (!apiKey) throw new Error('NEXT_PUBLIC_FIREBASE_API_KEY env var is required')

  const accessToken = await getAccessToken()

  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      localId: uid,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    console.warn(`[adminDeleteUser] Auth delete returned ${res.status}: ${text}`)
  }

  return true
}

export async function adminDisableUser(uid: string): Promise<boolean> {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY
  if (!apiKey) throw new Error('NEXT_PUBLIC_FIREBASE_API_KEY env var is required')

  const accessToken = await getAccessToken()

  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:update?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      localId: uid,
      disableUser: true,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    console.warn(`[adminDisableUser] Auth update returned ${res.status}: ${text}`)
  }

  return true
}

import crypto from 'crypto'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// Load environment variables from .env.local
const env = Object.fromEntries(
  readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
    .split('\n').filter(l => l.includes('='))
    .map(l => {
      const idx = l.indexOf('=')
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim().replace(/^["']|["']$/g, '')]
    })
)

async function getAccessToken() {
  const raw = env.FIREBASE_ADMIN_SERVICE_ACCOUNT
  if (!raw) throw new Error('FIREBASE_ADMIN_SERVICE_ACCOUNT is missing in .env.local')
  const jsonStr = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8')
  const sa = JSON.parse(jsonStr)

  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const claim = Buffer.from(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/cloud-platform',
    aud: sa.token_uri || 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  })).toString('base64url')

  const signInput = `${header}.${claim}`
  const signer = crypto.createSign('RSA-SHA256')
  signer.update(signInput)
  const signature = signer.sign(sa.private_key, 'base64url')
  const jwt = `${signInput}.${signature}`

  const res = await fetch(sa.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })
  const data = await res.json()
  return { token: data.access_token, projectId: sa.project_id }
}

function toFirestoreValue(val) {
  if (val === null || val === undefined) return { nullValue: null }
  if (typeof val === 'boolean') return { booleanValue: val }
  if (typeof val === 'number') {
    return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val }
  }
  if (typeof val === 'string') return { stringValue: val }
  if (val instanceof Date) return { timestampValue: val.toISOString() }
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map(toFirestoreValue) } }
  }
  if (typeof val === 'object') {
    const fields = {}
    for (const [k, v] of Object.entries(val)) {
      fields[k] = toFirestoreValue(v)
    }
    return { mapValue: { fields } }
  }
  return { stringValue: String(val) }
}

async function setDoc(token, projectId, collectionName, docId, data) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collectionName}/${docId}`
  const fields = {}
  for (const [k, v] of Object.entries(data)) {
    fields[k] = toFirestoreValue(v)
  }
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields }),
  })
  if (!res.ok) {
    const err = await res.text()
    console.error(`Failed to set ${collectionName}/${docId}:`, err)
  } else {
    console.log(`✓ Set ${collectionName}/${docId}`)
  }
}

async function runSeed() {
  const { token, projectId } = await getAccessToken()
  console.log(`Connected to Firestore (${projectId}) via OAuth Admin Token`)

  // 1. FREELANCERS
  const freelancers = [
    {
      id: 'fl_guna_v',
      name: 'Guna V',
      skill: 'photographer',
      dayRate: 6000,
      contact: '+91 98411 20345',
      notes: 'Strong candid work. Prefers South Chennai events. Own Sony kit.',
      isActive: true,
      createdAt: new Date('2023-01-15T10:00:00Z'),
      updatedAt: new Date('2026-07-20T10:00:00Z'),
    },
    {
      id: 'fl_vimal_s',
      name: 'Vimal S',
      skill: 'videographer',
      dayRate: 5500,
      contact: '+91 97907 88123',
      notes: 'Experienced gimbal & drone operator. Panasonic Lumix kit.',
      isActive: true,
      createdAt: new Date('2023-08-10T10:00:00Z'),
      updatedAt: new Date('2026-06-15T10:00:00Z'),
    },
    {
      id: 'fl_sandhya_p',
      name: 'Sandhya P',
      skill: 'editor',
      dayRate: 4000,
      contact: '+91 96005 41267',
      notes: 'Premiere Pro & DaVinci Resolve colorist.',
      isActive: false,
      createdAt: new Date('2024-03-01T10:00:00Z'),
      updatedAt: new Date('2026-03-05T10:00:00Z'),
    },
    {
      id: 'fl_karthik_r',
      name: 'Karthik R',
      skill: 'designer',
      dayRate: 3500,
      contact: '+91 99400 73456',
      notes: 'Album designer with rich typography and layout aesthetics.',
      isActive: true,
      createdAt: new Date('2024-06-15T10:00:00Z'),
      updatedAt: new Date('2026-07-01T10:00:00Z'),
    },
  ]

  for (const fl of freelancers) {
    const { id, ...data } = fl
    await setDoc(token, projectId, 'freelancers', id, { ...data, freelancerId: id })
  }

  // 2. ASSIGN Guna V to projects (including double booking on 2 Aug 2026)
  const projectsToUpdate = [
    {
      id: 'proj_karthik_wedding',
      eventName: 'Karthik weds Priya',
      clientId: 'client_karthik_rajan',
      eventType: 'wedding',
      eventDate: new Date('2026-08-02T09:00:00Z'),
      stage: 'planning',
      status: 'upcoming',
      staffUids: ['GnbwIqJRSdRBX2ZyZnyEcy4QuQ42', 'aLJWIldrWDdUHFP6HfE56okpZyn1', 'xa7XnTOfqAav1fZiaP8nKqwVcZS2'],
      freelancerIds: ['fl_guna_v'],
    },
    {
      id: 'proj_sangeetha_baby',
      eventName: 'Sangeetha Baby Shoot',
      clientId: 'client_sangeetha',
      eventType: 'portrait',
      eventDate: new Date('2026-08-02T15:00:00Z'),
      stage: 'booked',
      status: 'upcoming',
      staffUids: [],
      freelancerIds: ['fl_guna_v'],
    },
    {
      id: 'proj_meera_prewedding',
      eventName: 'Meera & Vikram — Pre-Wedding',
      clientId: 'client_meera_krishnan',
      eventType: 'preWedding',
      eventDate: new Date('2026-07-28T08:00:00Z'),
      stage: 'planning',
      status: 'upcoming',
      staffUids: [],
      freelancerIds: ['fl_guna_v'],
    },
  ]

  for (const p of projectsToUpdate) {
    await setDoc(token, projectId, 'projects', p.id, {
      ...p,
      projectId: p.id,
      updatedAt: new Date(),
      createdAt: new Date('2026-06-01T10:00:00Z'),
    })
  }

  // 3. PAYOUTS & AUTO-EXPENSES FOR GUNA V
  const payouts = [
    {
      payoutId: 'flp_001',
      freelancerId: 'fl_guna_v',
      freelancerName: 'Guna V',
      projectId: 'proj_divya_engagement',
      eventName: 'Divya & Arjun — Engagement',
      days: 1,
      dayRate: 6000,
      amount: 6000,
      paidDate: new Date('2026-07-13T10:00:00Z'),
      method: 'gpay',
      postedExpenseId: 'EXP-0231',
    },
    {
      payoutId: 'flp_002',
      freelancerId: 'fl_guna_v',
      freelancerName: 'Guna V',
      projectId: 'proj_aishwarya_wedding',
      eventName: 'Aishwarya & Naveen — Wedding',
      days: 3,
      dayRate: 6000,
      amount: 18000,
      paidDate: new Date('2026-06-15T10:00:00Z'),
      method: 'bankTransfer',
      postedExpenseId: 'EXP-0214',
    },
    {
      payoutId: 'flp_003',
      freelancerId: 'fl_guna_v',
      freelancerName: 'Guna V',
      projectId: 'proj_ravi_wedding',
      eventName: 'Ravi & Shruti — Wedding',
      days: 2,
      dayRate: 6000,
      amount: 12000,
      paidDate: new Date('2026-06-16T10:00:00Z'),
      method: 'gpay',
      postedExpenseId: 'EXP-0215',
    },
    {
      payoutId: 'flp_004',
      freelancerId: 'fl_guna_v',
      freelancerName: 'Guna V',
      projectId: 'proj_vel_murugan',
      eventName: 'Vel Murugan Jewellers',
      days: 2,
      dayRate: 6000,
      amount: 12000,
      paidDate: new Date('2026-07-02T10:00:00Z'),
      method: 'cash',
      postedExpenseId: 'EXP-0222',
    },
  ]

  for (const py of payouts) {
    await setDoc(token, projectId, 'freelancerPayouts', py.payoutId, {
      ...py,
      recordedBy: 'admin',
      createdAt: py.paidDate,
    })

    // Auto-create matching expense doc
    const expId = `exp_${py.postedExpenseId.toLowerCase().replace('-', '_')}`
    await setDoc(token, projectId, 'expenses', expId, {
      expenseId: expId,
      code: py.postedExpenseId,
      date: py.paidDate,
      category: 'freelancer',
      amount: py.amount,
      method: py.method,
      vendor: py.freelancerName,
      projectId: py.projectId,
      source: 'freelancerPayout',
      note: `Freelancer payout: ${py.freelancerName} · ${py.days} days`,
      createdBy: 'admin',
      createdAt: py.paidDate,
    })
  }

  console.log('✅ Freelancers seed completed successfully!')
}

runSeed().catch(console.error)

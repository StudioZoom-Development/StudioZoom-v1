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

const IDS = {
  // CLIENTS
  karthikClientId: 'client_karthik_rajan',
  meenaClientId:   'client_meena_krishnan',

  // STAFF UIDs
  sivaUid:         'aLJWIldrWDdUHFP6HfE56okpZyn1',
  nareshUid:       'GnbwIqJRSdRBX2ZyZnyEcy4QuQ42',
  varunUid:        'xa7XnTOfqAav1fZiaP8nKqwVcZS2',
  mohanUid:        'MSMpCgxm3TehySLUbTGX3i1ywDj1',
  adminUid:        '7NxENmDjRfOu009Vcu9qie2NzJA3',
}

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
  if (typeof val === 'number') return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val }
  if (typeof val === 'string') return { stringValue: val }
  if (val instanceof Date) return { timestampValue: val.toISOString() }
  if (Array.isArray(val)) return { arrayValue: { values: val.map(toFirestoreValue) } }
  if (typeof val === 'object') {
    const fields = {}
    for (const [k, v] of Object.entries(val)) {
      if (v !== undefined) fields[k] = toFirestoreValue(v)
    }
    return { mapValue: { fields } }
  }
  return { stringValue: String(val) }
}

async function setDocRest(token, projectId, collectionName, docId, data) {
  const fields = {}
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined) fields[k] = toFirestoreValue(v)
  }

  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collectionName}/${docId}`
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ fields }),
  })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Failed to write doc ${collectionName}/${docId}: ${errText}`)
  }
}

async function updateDocRest(token, projectId, collectionName, docId, data) {
  const fields = {}
  const updateMaskParams = []
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined) {
      fields[k] = toFirestoreValue(v)
      updateMaskParams.push(`updateMask.fieldPaths=${encodeURIComponent(k)}`)
    }
  }

  const queryStr = updateMaskParams.join('&')
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collectionName}/${docId}?${queryStr}`
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ fields }),
  })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Failed to update doc ${collectionName}/${docId}: ${errText}`)
  }
}

async function seed() {
  console.log('🌱 Starting seed...')
  const { token, projectId } = await getAccessToken()
  const now = new Date()

  // ── PROJECT 1: Karthik weds Priya ──────────────────────────────────────────
  const karthikProjectId = 'project_karthik_2026'
  const karthikEventDate = new Date('2026-08-14T00:00:00Z')

  await setDocRest(token, projectId, 'projects', karthikProjectId, {
    projectId:     karthikProjectId,
    clientId:      IDS.karthikClientId,
    eventDate:     karthikEventDate,
    eventName:     'Karthik weds Priya',
    clientName:    'Karthik Rajan',
    clientContact: '+91 98765 43210',
    eventType:     'wedding',
    packageType:   'Gold',
    stage:         'planning',
    status:        'upcoming',
    callTime:      '6:00 AM',
    staffUids:     [IDS.sivaUid, IDS.nareshUid, IDS.varunUid],
    freelancerIds: [],
    milestones: {
      depositPaid: new Date('2026-07-20T00:00:00Z'),
    },
    createdBy:     IDS.adminUid,
    createdAt:     new Date('2026-07-20T00:00:00Z'),
    updatedAt:     now,
  })
  console.log('✅ Project 1: Karthik weds Priya (planning)')

  await updateDocRest(token, projectId, 'clients', IDS.karthikClientId, {
    projectId: karthikProjectId,
    updatedAt: now,
  })
  console.log('✅ Client 1: linked projectId')

  // ── PROJECT 2: Meena Portrait Session ──────────────────────────────────────
  const meenaProjectId = 'project_meena_2026'
  const meenaEventDate = new Date('2026-08-22T00:00:00Z')

  await setDocRest(token, projectId, 'projects', meenaProjectId, {
    projectId:     meenaProjectId,
    clientId:      IDS.meenaClientId,
    eventDate:     meenaEventDate,
    eventName:     'Meena Portrait Session',
    clientName:    'Meena Krishnan',
    clientContact: '+91 87654 32109',
    eventType:     'portrait',
    packageType:   'Silver',
    stage:         'booked',
    status:        'upcoming',
    staffUids:     [],
    freelancerIds: [],
    milestones:    {},
    createdBy:     IDS.adminUid,
    createdAt:     new Date('2026-07-18T00:00:00Z'),
    updatedAt:     now,
  })
  console.log('✅ Project 2: Meena Portrait Session (booked)')

  await updateDocRest(token, projectId, 'clients', IDS.meenaClientId, {
    projectId: meenaProjectId,
    updatedAt: now,
  })
  console.log('✅ Client 2: linked projectId')

  // ── STAFF ASSIGNMENTS for Karthik project ──────────────────────────────────
  const eventDateStr = '2026-08-14'
  const assignments = [
    { id: 'assign_karthik_siva',   staffUid: IDS.sivaUid,   staffName: 'Siva Prakash', role: 'photographer' },
    { id: 'assign_karthik_naresh', staffUid: IDS.nareshUid, staffName: 'Naresh',       role: 'videographer' },
    { id: 'assign_karthik_varun',  staffUid: IDS.varunUid,  staffName: 'Varun',        role: 'assistant' },
  ]

  for (const a of assignments) {
    await setDocRest(token, projectId, 'staffAssignments', a.id, {
      assignmentId: a.id,
      projectId:    karthikProjectId,
      clientId:     IDS.karthikClientId,
      staffUid:     a.staffUid,
      staffName:    a.staffName,
      eventDate:    eventDateStr,
      role:         a.role,
      status:       'confirmed',
      createdAt:    new Date('2026-07-20T00:00:00Z'),
    })
  }
  console.log('✅ Staff assignments: Siva, Naresh, Varun → Karthik project')

  // ── PAST PROJECTS for work history (historical data) ──────────────────────
  const pastProjects = [
    {
      id:          'project_ravi_2026',
      eventName:   'Ravi & Shruti Wedding',
      eventDate:   new Date('2026-06-14T00:00:00Z'),
      dateStr:     '2026-06-14',
      clientId:    'client_ravi_past',
      clientName:  'Ravi Kumar',
      eventType:   'wedding',
      packageType: 'Platinum',
      stage:       'postProduction',
      status:      'ongoing',
      staffUids:   [IDS.sivaUid, IDS.varunUid],
      milestones: {
        depositPaid:        new Date('2026-05-01T00:00:00Z'),
        rawPhotosDelivered: new Date('2026-06-16T00:00:00Z'),
        rawVideosDelivered: new Date('2026-06-16T00:00:00Z'),
      },
      assignees: [
        { id: 'assign_ravi_siva',  uid: IDS.sivaUid,  name: 'Siva Prakash', role: 'photographer' },
        { id: 'assign_ravi_varun', uid: IDS.varunUid, name: 'Varun',        role: 'videographer' },
      ]
    },
    {
      id:          'project_divya_2026',
      eventName:   'Divya & Arjun Engagement',
      eventDate:   new Date('2026-07-24T00:00:00Z'),
      dateStr:     '2026-07-24',
      clientId:    'client_divya_past',
      clientName:  'Divya Menon',
      eventType:   'engagement',
      packageType: 'Gold',
      stage:       'preProduction',
      status:      'upcoming',
      staffUids:   [IDS.sivaUid, IDS.nareshUid],
      milestones: {
        depositPaid: new Date('2026-07-01T00:00:00Z'),
      },
      assignees: [
        { id: 'assign_divya_siva',   uid: IDS.sivaUid,   name: 'Siva Prakash', role: 'photographer' },
        { id: 'assign_divya_naresh', uid: IDS.nareshUid, name: 'Naresh',       role: 'videographer' },
      ]
    },
    {
      id:          'project_prakash_2026',
      eventName:   'Prakash Family Portrait',
      eventDate:   new Date('2026-07-18T00:00:00Z'),
      dateStr:     '2026-07-18',
      clientId:    'client_prakash_past',
      clientName:  'Prakash Venkat',
      eventType:   'portrait',
      packageType: 'Silver',
      stage:       'delivered',
      status:      'completed',
      staffUids:   [IDS.sivaUid],
      milestones: {
        depositPaid:        new Date('2026-07-10T00:00:00Z'),
        rawPhotosDelivered: new Date('2026-07-19T00:00:00Z'),
        delivered:          new Date('2026-07-28T00:00:00Z'),
      },
      assignees: [
        { id: 'assign_prakash_siva', uid: IDS.sivaUid, name: 'Siva Prakash', role: 'photographer' },
      ]
    },
    {
      id:          'project_sangeetha_2026',
      eventName:   'Sangeetha Baby Shoot',
      eventDate:   new Date('2026-08-05T00:00:00Z'),
      dateStr:     '2026-08-05',
      clientId:    'client_sangeetha_past',
      clientName:  'Sangeetha R',
      eventType:   'studio',
      packageType: 'Silver',
      stage:       'booked',
      status:      'upcoming',
      staffUids:   [IDS.nareshUid, IDS.mohanUid],
      milestones: {
        depositPaid: new Date('2026-07-25T00:00:00Z'),
      },
      assignees: [
        { id: 'assign_sangeetha_naresh', uid: IDS.nareshUid, name: 'Naresh',  role: 'photographer' },
        { id: 'assign_sangeetha_mohan',  uid: IDS.mohanUid,  name: 'Mohan K', role: 'assistant'    },
      ]
    },
  ]

  for (const p of pastProjects) {
    await setDocRest(token, projectId, 'projects', p.id, {
      projectId:     p.id,
      clientId:      p.clientId,
      eventDate:     p.eventDate,
      eventName:     p.eventName,
      clientName:    p.clientName,
      clientContact: '',
      eventType:     p.eventType,
      packageType:   p.packageType,
      stage:         p.stage,
      status:        p.status,
      staffUids:     p.staffUids,
      freelancerIds: [],
      milestones:    p.milestones,
      createdBy:     IDS.adminUid,
      createdAt:     p.eventDate,
      updatedAt:     now,
    })

    for (const a of p.assignees) {
      await setDocRest(token, projectId, 'staffAssignments', a.id, {
        assignmentId: a.id,
        projectId:    p.id,
        clientId:     p.clientId,
        staffUid:     a.uid,
        staffName:    a.name,
        eventDate:    p.dateStr,
        role:         a.role,
        status:       'confirmed',
        createdAt:    p.eventDate,
      })
    }
    console.log(`✅ Past project: ${p.eventName} (${p.stage}) + assignments`)
  }

  // ── FIX USER PROFILES ──────────────────────────────────────────────────────
  console.log('\n🔧 Fixing user profiles...')
  const userFixes = [
    {
      uid: IDS.nareshUid,
      updates: {
        jobTitle:   'Videographer',
        joinDate:   new Date('2023-09-01T00:00:00Z'),
        baseSalary: 27000,
        role:       'staff',
        isActive:   true,
      }
    },
    {
      uid: IDS.varunUid,
      updates: {
        jobTitle:   'Photographer',
        joinDate:   new Date('2024-01-15T00:00:00Z'),
        baseSalary: 24000,
        role:       'staff',
        isActive:   true,
      }
    },
    {
      uid: IDS.mohanUid,
      updates: {
        jobTitle: 'Assistant',
        isActive: true,
      }
    },
    {
      uid: IDS.adminUid,
      updates: {
        role:     'admin',
        isActive: true,
        jobTitle: 'Studio Director',
      }
    },
  ]

  for (const fix of userFixes) {
    if (fix.uid && !fix.uid.startsWith('PASTE_')) {
      await updateDocRest(token, projectId, 'users', fix.uid, {
        ...fix.updates,
        updatedAt: now,
      })
      console.log(`✅ Fixed user: ${fix.uid.slice(0, 8)}...`)
    }
  }

  console.log(`
✅ Seed complete! Here's what was created:

PROJECTS (6 total):
  project_karthik_2026   → Karthik weds Priya     [planning]  ← linked to real client
  project_meena_2026     → Meena Portrait Session  [booked]    ← linked to real client
  project_ravi_2026      → Ravi & Shruti Wedding   [postProduction]
  project_divya_2026     → Divya & Arjun Engagement[preProduction]
  project_prakash_2026   → Prakash Family Portrait [delivered]
  project_sangeetha_2026 → Sangeetha Baby Shoot    [booked]

STAFF ASSIGNMENTS (10 total):
  Karthik: Siva (Lead Photo) · Naresh (Video) · Varun (Assistant)
  Ravi:    Siva (Photo) · Varun (Video)
  Divya:   Siva (Photo) · Naresh (Video)
  Prakash: Siva (Photo)
  Sangeetha: Naresh (Photo) · Mohan (Assistant)

WORK HISTORY now visible on:
  Siva Prakash  → Karthik, Ravi, Divya, Prakash (4 projects)
  Naresh        → Karthik, Divya, Sangeetha (3 projects)
  Varun         → Karthik, Ravi (2 projects)
  Mohan K       → Sangeetha (1 project)
  `)
}

seed().catch(console.error).finally(() => process.exit(0))

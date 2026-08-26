// Seed Real-time Attendance, TimeLogs, and Leave Requests for August 2026
// Authenticated strictly as Admin (7NxENmDjRfOu009Vcu9qie2NzJA3) writing for all team member real UIDs

import { initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import { getFirestore, doc, setDoc, deleteDoc, Timestamp } from 'firebase/firestore'
import fs from 'fs'

function loadEnv() {
  const envPath = fs.existsSync('.env.local') ? '.env.local' : '.env.development'
  if (!fs.existsSync(envPath)) return {}
  const content = fs.readFileSync(envPath, 'utf8')
  const env = {}
  content.split('\n').forEach(line => {
    line = line.trim()
    if (!line || line.startsWith('#')) return
    const match = line.match(/^([^=]+)=(.*)$/)
    if (match) {
      let val = match[2].trim()
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1)
      env[match[1].trim()] = val
    }
  })
  return env
}

const env = loadEnv()

const firebaseConfig = {
  apiKey:            env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain:        env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

const app  = initializeApp(firebaseConfig)
const auth = getAuth(app)
const db   = getFirestore(app)

const ADMIN_EMAIL    = 'admin@studiozoom.in'
const ADMIN_PASSWORD = 'StudioZoom@2026'

// Exact Real UIDs from Firestore /users
const realTeamMembers = [
  { uid: '7NxENmDjRfOu009Vcu9qie2NzJA3', name: 'Studio Admin', role: 'admin', email: 'admin@studiozoom.in', pass: 'StudioZoom@2026' },
  { uid: '4YSrRGHmhYVp6yERExXloOUC0mm1', name: 'Studio Manager', role: 'manager', email: 'manager@studiozoom.in', pass: 'Manager@2026' },
  { uid: 'q8rVV55QTxWmNivve3cjYhkywRG3', name: 'Siva Prakash', role: 'staff', email: 'siva@studiozoom.in', pass: 'Staff@2026' },
  { uid: 'AHKr90FXsiQEcGSE5QzAhPUw1yl1', name: 'Kavya R', role: 'staff', email: 'kavya@studiozoom.in', pass: 'Staff@2026' },
  { uid: '1gJBWJl5iOfWHeZJnG7iaNACgrw1', name: 'Ramesh D', role: 'staff', email: 'ramesh@studiozoom.in', pass: 'Staff@2026' },
  { uid: 'EmpaoYKGNpXHezIC4vDyLuMQs2o1', name: 'Deepak S', role: 'staff', email: 'deepak@studiozoom.in', pass: 'Staff@2026' },
  { uid: 'aDJNaSpNhCVhJeMtV3AMJ0rQ8Dn2', name: 'Anitha M', role: 'staff', email: 'anitha@studiozoom.in', pass: 'Staff@2026' },
  { uid: 'CfWF8fvp5Te9lJcOJHybC7w8liJ3', name: 'Sathish Kumar', role: 'staff', email: 'satish@studiozoom.in', pass: 'Staff@2026' },
  { uid: 'duwlzlCnzIMSqOh8TsKtrmIWTXG2', name: 'Naresh babu', role: 'staff', email: 'naresh@studiozoom.in', pass: 'Staff@2026' },
]

const presetSchedules = {
  'Studio Admin': {
    1: { status: 'P', hours: 540 }, 2: { status: 'WO', hours: 0 }, 3: { status: 'P', hours: 550 },
    4: { status: 'P', hours: 540 }, 5: { status: 'P', hours: 538 }, 6: { status: 'P', hours: 557 },
    7: { status: 'P', hours: 540 }, 8: { status: 'P', hours: 535 }, 9: { status: 'WO', hours: 0 },
    10: { status: 'P', hours: 170, open: true },
  },
  'Studio Manager': {
    1: { status: 'P', hours: 545 }, 2: { status: 'WO', hours: 0 }, 3: { status: 'Late', hours: 525 },
    4: { status: 'P', hours: 540 }, 5: { status: 'P', hours: 550 }, 6: { status: 'P', hours: 560 },
    7: { status: 'P', hours: 535 }, 8: { status: 'P', hours: 540 }, 9: { status: 'WO', hours: 0 },
    10: { status: 'P', hours: 165, open: true },
  },
  'Siva Prakash': {
    1: { status: 'P', hours: 540 }, 2: { status: 'WO', hours: 0 }, 3: { status: 'P', hours: 540 },
    4: { status: 'P', hours: 540 }, 5: { status: 'Late', hours: 535 }, 6: { status: 'P', hours: 550 },
    7: { status: 'P', hours: 540 }, 8: { status: 'P', hours: 540 }, 9: { status: 'WO', hours: 0 },
    10: { status: 'P', hours: 170, open: true },
  },
  'Kavya R': {
    1: { status: 'P', hours: 540 }, 2: { status: 'WO', hours: 0 }, 3: { status: 'P', hours: 535 },
    4: { status: 'HalfDay', hours: 270 }, 5: { status: 'P', hours: 540 }, 6: { status: 'P', hours: 540 },
    7: { status: 'P', hours: 540 }, 8: { status: 'P', hours: 550 }, 9: { status: 'WO', hours: 0 },
    10: { status: 'Late', hours: 95, open: true },
  },
  'Ramesh D': {
    1: { status: 'P', hours: 545 }, 2: { status: 'WO', hours: 0 }, 3: { status: 'P', hours: 540 },
    4: { status: 'P', hours: 540 }, 5: { status: 'P', hours: 540 }, 6: { status: 'AB', hours: 0 },
    7: { status: 'P', hours: 540 }, 8: { status: 'P', hours: 540 }, 9: { status: 'WO', hours: 0 },
    10: { status: 'P', hours: 170, open: true },
  },
  'Deepak S': {
    1: { status: 'P', hours: 540 }, 2: { status: 'WO', hours: 0 }, 3: { status: 'Permission', hours: 480 },
    4: { status: 'P', hours: 540 }, 5: { status: 'P', hours: 540 }, 6: { status: 'P', hours: 540 },
    7: { status: 'P', hours: 540 }, 8: { status: 'P', hours: 540 }, 9: { status: 'WO', hours: 0 },
    10: { status: 'P', hours: 170, open: true },
  },
  'Anitha M': {
    1: { status: 'P', hours: 540 }, 2: { status: 'WO', hours: 0 }, 3: { status: 'P', hours: 540 },
    4: { status: 'P', hours: 540 }, 5: { status: 'P', hours: 540 }, 6: { status: 'P', hours: 540 },
    7: { status: 'Late', hours: 530 }, 8: { status: 'P', hours: 540 }, 9: { status: 'WO', hours: 0 },
    10: { status: 'P', hours: 170, open: true },
  },
}

const defaultSchedule = {
  1: { status: 'P', hours: 540 }, 2: { status: 'WO', hours: 0 }, 3: { status: 'P', hours: 540 },
  4: { status: 'P', hours: 540 }, 5: { status: 'P', hours: 540 }, 6: { status: 'P', hours: 540 },
  7: { status: 'P', hours: 540 }, 8: { status: 'P', hours: 540 }, 9: { status: 'WO', hours: 0 },
  10: { status: 'P', hours: 170, open: true },
}

async function runSeed() {
  console.log('🚀 Starting Attendance Seeding for August 2026...')

  const cred = await signInWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD)
  console.log(`✓ Authenticated as Admin (${cred.user.uid})`)

  // Cleanup legacy dummy user docs if present
  const dummyIds = [
    'uid_anitha_m', 'uid_deepak_s', 'uid_kavya_r',
    'uid_ramesh_d', 'uid_siva_prakash', 'uid_studio_admin', 'uid_studio_manager'
  ]
  for (const id of dummyIds) {
    try { await deleteDoc(doc(db, 'users', id)) } catch {}
  }

  console.log('\n--- Seeding Attendance Records for Staff, Manager, and Admin ---')

  for (const m of realTeamMembers) {
    const sched = presetSchedules[m.name] || defaultSchedule
    const dailyStatus = {}
    const dailyHours = {}
    let presentCount = 0
    let lateCount = 0
    let halfDayCount = 0
    let absentCount = 0
    let weekOffCount = 0
    let totalMinutes = 0

    for (let day = 1; day <= 10; day++) {
      const dayStr = `2026-08-${String(day).padStart(2, '0')}`
      const info = sched[day] || { status: 'P', hours: 540 }

      dailyStatus[dayStr] = info.status
      dailyHours[dayStr]  = info.hours

      if (info.status === 'P')          presentCount++
      else if (info.status === 'Late')  { presentCount++; lateCount++ }
      else if (info.status === 'HalfDay') halfDayCount++
      else if (info.status === 'AB')    absentCount++
      else if (info.status === 'WO')    weekOffCount++
      else if (info.status === 'Permission') presentCount++

      totalMinutes += info.hours
    }

    const attDocId = `${m.uid}_2026_8`
    await setDoc(doc(db, 'attendance', attDocId), {
      attendanceId: attDocId,
      staffUid: m.uid,
      year: 2026,
      month: 8,
      dailyStatus,
      dailyHours,
      summary: {
        present: presentCount,
        late: lateCount,
        halfDay: halfDayCount,
        absent: absentCount,
        weekOff: weekOffCount,
        totalMinutes,
      }
    }, { merge: true })

    console.log(`  ✓ Seeded /attendance/${attDocId} for [${m.role.toUpperCase()}] ${m.name}`)
  }

  console.log('\n--- Seeding Leave Requests for August 2026 ---')
  const leaveData = [
    { name: 'Kavya R', date: '2026-08-14', type: 'leave', status: 'approved' },
    { name: 'Ramesh D', date: '2026-08-18', type: 'leave', status: 'approved' },
    { name: 'Deepak S', date: '2026-08-12', type: 'permission', status: 'pending' },
  ]

  for (const l of leaveData) {
    const member = realTeamMembers.find(m => m.name === l.name)
    if (!member) continue
    const reqId = `req_${member.uid}_${l.date}`
    await setDoc(doc(db, 'leaveRequests', reqId), {
      requestId: reqId,
      staffUid:  member.uid,
      date:      l.date,
      type:      l.type,
      status:    l.status,
      createdAt: Timestamp.now(),
    }, { merge: true })
    console.log(`  ✓ Seeded /leaveRequests/${reqId} for ${member.name} on ${l.date}`)
  }

  // Also seed Admin's own timeLogs so today's open session is active for Admin
  console.log('\n--- Seeding TimeLogs for Admin & Active Sessions ---')
  const adminUid = cred.user.uid
  for (let day = 1; day <= 10; day++) {
    const dayStr = `2026-08-${String(day).padStart(2, '0')}`
    const checkInDate = new Date(2026, 7, day, 9, 0, 0)
    const isToday = day === 10
    const checkOutDate = isToday ? null : new Date(2026, 7, day, 18, 0, 0)

    const logId = `${adminUid}_${dayStr}`
    await setDoc(doc(db, 'timeLogs', logId), {
      logId,
      staffUid: adminUid,
      date: dayStr,
      checkInAt: Timestamp.fromDate(checkInDate),
      checkOutAt: checkOutDate ? Timestamp.fromDate(checkOutDate) : null,
      workedMinutes: isToday ? 170 : 540,
      standardMinutes: 540,
      variance: isToday ? -370 : 0,
      status: isToday ? 'open' : 'closed',
      overrideStatus: 'In',
    }, { merge: true })
  }
  console.log(`  ✓ Seeded /timeLogs for Admin (${adminUid})`)

  console.log('\n🎉 Realtime Attendance Seeding Completed Successfully for Staff, Admin, and Manager!')
  process.exit(0)
}

runSeed().catch(err => {
  console.error('❌ Seeding failed:', err)
  process.exit(1)
})

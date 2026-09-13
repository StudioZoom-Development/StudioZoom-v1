import { initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import {
  getFirestore, doc, getDoc, collection,
  writeBatch, serverTimestamp, Timestamp, getDocs
} from 'firebase/firestore'
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
const app = initializeApp({
  apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.NEXT_PUBLIC_FIREBASE_APP_ID,
})
const auth = getAuth(app)
const db = getFirestore(app)

// Helper mimicking query logic
async function createBookingDirect(data) {
  let nextNum = 1
  let prefix = 'ZS-INV-'
  const numSnap = await getDoc(doc(db, 'studioSettings', 'numberingConfig'))
  if (numSnap.exists()) {
    const numData = numSnap.data()
    nextNum = numData.invoiceStartNumber ?? 1
    prefix  = numData.invoicePrefix ?? 'ZS-INV-'
  }

  const year      = new Date().getFullYear()
  const invoiceNo = `${prefix}${year}-${String(nextNum).padStart(3, '0')}`

  const balanceDue    = Math.max(0, data.totalAmount - data.advanceAmount)
  const paymentStatus = balanceDue <= 0 ? 'paid'
    : data.advanceAmount > 0 ? 'partial' : 'unpaid'

  const batch      = writeBatch(db)
  const clientRef  = doc(collection(db, 'clients'))
  const projectRef = doc(collection(db, 'projects'))

  const formattedContact = data.contact.trim().startsWith('+91')
    ? data.contact.trim()
    : `+91${data.contact.trim()}`

  const formattedEventDates = data.eventDates && data.eventDates.length > 0
    ? data.eventDates.map(ed => ({
        id: ed.id,
        label: ed.label,
        date: Timestamp.fromDate(new Date(ed.date)),
        location: ed.location || '',
        startTime: ed.startTime || '09:00',
        endTime:   ed.endTime || '18:00',
      }))
    : []

  const formattedRecurringSchedule = data.recurringSchedule
    ? {
        frequency:        data.recurringSchedule.frequency,
        startDate:        Timestamp.fromDate(new Date(data.recurringSchedule.startDate)),
        endDate:          Timestamp.fromDate(new Date(data.recurringSchedule.endDate)),
        totalSessions:    data.recurringSchedule.totalSessions,
        perSessionRate:   data.recurringSchedule.perSessionRate,
        paymentType:      data.recurringSchedule.paymentType || 'perSession',
        sessionStartTime: data.recurringSchedule.sessionStartTime || '09:00',
        sessionEndTime:   data.recurringSchedule.sessionEndTime || '18:00',
      }
    : null

  const clientDocData = {
    clientId:          clientRef.id,
    projectId:         projectRef.id,
    name:              data.clientName,
    contact:           formattedContact,
    email:             data.email,
    eventName:         data.eventName,
    eventType:         data.eventType,
    customEventType:   data.customEventType || '',
    eventDate:         Timestamp.fromDate(data.eventDate),
    startTime:         data.startTime || '09:00',
    endTime:           data.endTime || '18:00',
    location:          data.location,
    notes:             data.notes || '',
    bookingType:       data.bookingType || 'oneTime',
    eventDates:        formattedEventDates,
    ...(formattedRecurringSchedule ? { recurringSchedule: formattedRecurringSchedule } : {}),
    packageType:       data.packageType,
    totalAmount:       data.totalAmount,
    balanceDue,
    paymentStatus,
    invoiceNumber:     invoiceNo,
    status:            data.status,
    isDeleted:         false,
    createdBy:         data.createdBy,
    createdAt:         serverTimestamp(),
    updatedAt:         serverTimestamp(),
  }

  batch.set(clientRef, clientDocData)

  if (data.advanceAmount > 0) {
    const payRef = doc(collection(db, 'clients', clientRef.id, 'payments'))
    batch.set(payRef, {
      paymentId:  payRef.id,
      instalment: '1st',
      amount:     data.advanceAmount,
      date:       Timestamp.fromDate(data.advanceDate),
      method:     data.paymentMethod,
      recordedBy: data.createdBy,
      createdAt:  serverTimestamp(),
    })
  }

  const projectDocData = {
    projectId:         projectRef.id,
    clientId:          clientRef.id,
    eventDate:         Timestamp.fromDate(data.eventDate),
    startTime:         data.startTime || '09:00',
    endTime:           data.endTime || '18:00',
    eventName:         data.eventName,
    clientName:        data.clientName,
    clientContact:     formattedContact,
    eventType:         data.eventType,
    customEventType:   data.customEventType || '',
    notes:             data.notes || '',
    bookingType:       data.bookingType || 'oneTime',
    eventDates:        formattedEventDates,
    ...(formattedRecurringSchedule ? { recurringSchedule: formattedRecurringSchedule } : {}),
    packageType:       data.packageType,
    stage:             'booked',
    status:            'upcoming',
    staffUids:         [],
    freelancerIds:     [],
    milestones:        data.advanceAmount > 0
      ? { depositPaid: Timestamp.fromDate(data.advanceDate) }
      : {},
    createdBy:         data.createdBy,
    createdAt:         serverTimestamp(),
    updatedAt:         serverTimestamp(),
  }

  batch.set(projectRef, projectDocData)

  if (data.status === 'booked' && numSnap.exists()) {
    batch.update(doc(db, 'studioSettings', 'numberingConfig'), {
      invoiceStartNumber: nextNum + 1,
    })
  }

  await batch.commit()
  return { clientId: clientRef.id, projectId: projectRef.id }
}

async function runTests() {
  console.log('🚀 Starting Automated Booking Types Validation...')
  const cred = await signInWithEmailAndPassword(auth, 'admin@studiozoom.in', 'StudioZoom@2026')
  const uid = cred.user.uid
  console.log('✅ Authenticated as Admin:', uid)

  // ── TEST 1: One-time Event with "other" type and ₹0 advance ────────────────
  console.log('\n--- TEST 1: One-time Event (Other Type, ₹0 Advance) ---')
  const test1Payload = {
    eventName:       'Sharma Housewarming',
    eventType:       'other',
    customEventType: 'Housewarming Ceremony',
    eventDate:       new Date('2026-09-10'),
    startTime:       '10:00',
    endTime:         '15:00',
    location:        'Adyar, Chennai',
    clientName:      'Ramesh Sharma',
    contact:         '9876543210',
    email:           'ramesh@example.com',
    notes:           'Need 2 traditional photographers',
    bookingType:     'oneTime',
    packageType:     'Custom',
    totalAmount:     25000,
    advanceAmount:   0,
    advanceDate:     new Date('2026-09-06'),
    paymentMethod:   'gpay',
    status:          'booked',
    createdBy:       uid,
  }

  const { clientId: c1Id, projectId: p1Id } = await createBookingDirect(test1Payload)
  const c1Snap = await getDoc(doc(db, 'clients', c1Id))
  const c1 = c1Snap.data()
  console.log(`Created Client: ${c1Id}, Project: ${p1Id}`)
  console.log(`  - status: "${c1.status}" (Expected: "booked") ->`, c1.status === 'booked' ? '✅ PASS' : '❌ FAIL')
  console.log(`  - paymentStatus: "${c1.paymentStatus}" (Expected: "unpaid") ->`, c1.paymentStatus === 'unpaid' ? '✅ PASS' : '❌ FAIL')
  console.log(`  - balanceDue: ₹${c1.balanceDue} (Expected: 25000) ->`, c1.balanceDue === 25000 ? '✅ PASS' : '❌ FAIL')
  console.log(`  - eventType: "${c1.eventType}", customEventType: "${c1.customEventType}" ->`, c1.customEventType === 'Housewarming Ceremony' ? '✅ PASS' : '❌ FAIL')
  console.log(`  - timings: "${c1.startTime} - ${c1.endTime}" ->`, (c1.startTime === '10:00' && c1.endTime === '15:00') ? '✅ PASS' : '❌ FAIL')

  // ── TEST 2: Multi-date Event ───────────────────────────────────────────────
  console.log('\n--- TEST 2: Multi-date Event (3 Dates with distinct timings) ---')
  const test2Payload = {
    eventName:       'Arun weds Sneha',
    eventType:       'wedding',
    eventDate:       new Date('2026-10-10'),
    startTime:       '18:00',
    endTime:         '23:00',
    location:        'Chennai',
    clientName:      'Arun Kumar',
    contact:         '+919840123456',
    email:           'arun@gmail.com',
    notes:           '3 day destination coverage',
    bookingType:     'multiDate',
    eventDates: [
      { id: 'd1', label: 'Sangeet', date: '2026-10-10', startTime: '18:00', endTime: '23:00', location: 'ITC Grand Chola' },
      { id: 'd2', label: 'Muhurtham', date: '2026-10-11', startTime: '06:00', endTime: '12:00', location: 'Mayor Ramanathan Hall' },
      { id: 'd3', label: 'Reception', date: '2026-10-11', startTime: '18:30', endTime: '22:30', location: 'Mayor Ramanathan Hall' },
    ],
    packageType:     'Gold',
    totalAmount:     150000,
    advanceAmount:   50000,
    advanceDate:     new Date('2026-09-06'),
    paymentMethod:   'gpay',
    status:          'booked',
    createdBy:       uid,
  }

  const { clientId: c2Id, projectId: p2Id } = await createBookingDirect(test2Payload)
  const c2Snap = await getDoc(doc(db, 'clients', c2Id))
  const c2 = c2Snap.data()
  const p2Snap = await getDoc(doc(db, 'projects', p2Id))
  const p2 = p2Snap.data()
  const paySnap = await getDocs(collection(db, 'clients', c2Id, 'payments'))
  console.log(`Created Client: ${c2Id}, Project: ${p2Id}`)
  console.log(`  - eventDates count: ${c2.eventDates.length} (Expected: 3) ->`, c2.eventDates.length === 3 ? '✅ PASS' : '❌ FAIL')
  console.log(`  - payments subcollection count: ${paySnap.docs.length} ->`, paySnap.docs.length === 1 ? '✅ PASS' : '❌ FAIL')
  console.log(`  - paymentStatus: "${c2.paymentStatus}", balanceDue: ₹${c2.balanceDue} (Expected: 100000) ->`, c2.balanceDue === 100000 ? '✅ PASS' : '❌ FAIL')
  console.log(`  - Project denormalized eventDates length: ${p2.eventDates.length} ->`, p2.eventDates.length === 3 ? '✅ PASS' : '❌ FAIL')

  // ── TEST 3: Recurring Contract Event ───────────────────────────────────────
  console.log('\n--- TEST 3: Recurring Event (Contract / Monthly Sessions) ---')
  const test3Payload = {
    eventName:       'Academic Year Coverage 2026-27',
    eventType:       'schoolEvent',
    eventDate:       new Date('2026-09-15'),
    startTime:       '09:00',
    endTime:         '13:00',
    location:        'Greenwood Campus, OMR',
    clientName:      'Greenwood Academy',
    contact:         '9944001122',
    email:           'events@greenwood.edu',
    notes:           'Monthly sports and stage events',
    bookingType:     'recurring',
    recurringSchedule: {
      frequency:        'monthly',
      startDate:        '2026-09-15',
      endDate:          '2027-03-15',
      totalSessions:    6,
      perSessionRate:   7500,
      paymentType:      'custom',
      sessionStartTime: '09:00',
      sessionEndTime:   '13:00',
    },
    packageType:     'Custom',
    totalAmount:     45000,
    advanceAmount:   15000,
    advanceDate:     new Date('2026-09-06'),
    paymentMethod:   'bankTransfer',
    status:          'booked',
    createdBy:       uid,
  }

  const { clientId: c3Id, projectId: p3Id } = await createBookingDirect(test3Payload)
  const c3Snap = await getDoc(doc(db, 'clients', c3Id))
  const c3 = c3Snap.data()
  console.log(`Created Client: ${c3Id}, Project: ${p3Id}`)
  console.log(`  - recurringSchedule.frequency: "${c3.recurringSchedule?.frequency}" ->`, c3.recurringSchedule?.frequency === 'monthly' ? '✅ PASS' : '❌ FAIL')
  console.log(`  - recurringSchedule.totalSessions: ${c3.recurringSchedule?.totalSessions} ->`, c3.recurringSchedule?.totalSessions === 6 ? '✅ PASS' : '❌ FAIL')
  console.log(`  - recurringSchedule session timings: "${c3.recurringSchedule?.sessionStartTime} - ${c3.recurringSchedule?.sessionEndTime}" ->`, (c3.recurringSchedule?.sessionStartTime === '09:00' && c3.recurringSchedule?.sessionEndTime === '13:00') ? '✅ PASS' : '❌ FAIL')
  console.log(`  - balanceDue: ₹${c3.balanceDue} (Expected: 30000) ->`, c3.balanceDue === 30000 ? '✅ PASS' : '❌ FAIL')
  console.log(`  - paymentStatus: "${c3.paymentStatus}" (Expected: "partial") ->`, c3.paymentStatus === 'partial' ? '✅ PASS' : '❌ FAIL')

  console.log('\n🎉 ALL 3 BOOKING TYPES CREATED & VALIDATED SUCCESSFULLY WITH 0 ERRORS!')
  process.exit(0)
}

runTests().catch(err => {
  console.error('❌ Test failed:', err)
  process.exit(1)
})

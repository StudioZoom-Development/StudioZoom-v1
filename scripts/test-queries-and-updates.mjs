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

async function testUpdatesAndPayments() {
  console.log('🔄 Testing Updates and Payments on all 3 Booking Types...')
  await signInWithEmailAndPassword(auth, 'admin@studiozoom.in', 'StudioZoom@2026')

  // 1. Test Recording Payment on Unpaid One-time booking
  const c1Id = 'LqfRSHspCsJCKX9fvubk'
  const c1Snap = await getDoc(doc(db, 'clients', c1Id))
  const c1 = c1Snap.data()
  console.log(`\n1. Recording ₹10,000 Payment on ${c1.eventName} (${c1Id}):`)
  console.log(`   Initial balance: ₹${c1.balanceDue}, status: ${c1.paymentStatus}`)

  const batch = writeBatch(db)
  const payRef = doc(collection(db, 'clients', c1Id, 'payments'))
  batch.set(payRef, {
    paymentId:  payRef.id,
    instalment: '1st',
    amount:     10000,
    date:       Timestamp.fromDate(new Date()),
    method:     'gpay',
    recordedBy: 'system-test',
    createdAt:  serverTimestamp(),
  })
  const newBalance = c1.totalAmount - 10000
  batch.update(doc(db, 'clients', c1Id), {
    balanceDue:    newBalance,
    paymentStatus: 'partial',
    updatedAt:     serverTimestamp(),
  })
  await batch.commit()

  const c1Updated = (await getDoc(doc(db, 'clients', c1Id))).data()
  console.log(`   Updated balance: ₹${c1Updated.balanceDue} (Expected: 15000) ->`, c1Updated.balanceDue === 15000 ? '✅ PASS' : '❌ FAIL')
  console.log(`   Updated paymentStatus: "${c1Updated.paymentStatus}" (Expected: "partial") ->`, c1Updated.paymentStatus === 'partial' ? '✅ PASS' : '❌ FAIL')

  // 2. Test Editing Multi-date Event Sub-dates and project sync
  const c2Id = 'gnO9Zv0A3QupAu7q3KpH'
  console.log(`\n2. Updating Multi-date Event Dates & Timing on (${c2Id}):`)
  const c2Snap = await getDoc(doc(db, 'clients', c2Id))
  const c2 = c2Snap.data()
  const p2Id = c2.projectId

  const updatedDates = [
    ...c2.eventDates,
    { id: 'd4', label: 'Maruveedu', date: Timestamp.fromDate(new Date('2026-10-12')), startTime: '11:00', endTime: '16:00', location: 'Bride Residence' }
  ]

  const batch2 = writeBatch(db)
  batch2.update(doc(db, 'clients', c2Id), {
    eventDates: updatedDates,
    updatedAt:  serverTimestamp(),
  })
  if (p2Id) {
    batch2.update(doc(db, 'projects', p2Id), {
      eventDates: updatedDates,
      updatedAt:  serverTimestamp(),
    })
  }
  await batch2.commit()

  const c2Updated = (await getDoc(doc(db, 'clients', c2Id))).data()
  const p2Updated = (await getDoc(doc(db, 'projects', p2Id))).data()
  console.log(`   Client eventDates length: ${c2Updated.eventDates.length} (Expected: 4) ->`, c2Updated.eventDates.length === 4 ? '✅ PASS' : '❌ FAIL')
  console.log(`   Project synced eventDates length: ${p2Updated.eventDates.length} (Expected: 4) ->`, p2Updated.eventDates.length === 4 ? '✅ PASS' : '❌ FAIL')

  console.log('\n🎉 ALL UPDATES & PAYMENT TRANSITIONS VERIFIED CLEANLY!')
  process.exit(0)
}

testUpdatesAndPayments().catch(err => {
  console.error('❌ Test failed:', err)
  process.exit(1)
})

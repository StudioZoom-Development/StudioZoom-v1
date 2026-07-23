// Complete seed script for Studio Zoom Firestore
// Seeding /users, /equipment, /studioSettings/config, and /clients

import { initializeApp } from 'firebase/app'
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  getIdToken
} from 'firebase/auth'
import {
  getFirestore,
  doc,
  setDoc,
  collection,
  Timestamp,
  serverTimestamp
} from 'firebase/firestore'
import fs from 'fs'
import path from 'path'

// Read env variables from .env.development or .env.local
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

async function runSeed() {
  console.log('🚀 Starting Studio Zoom Firestore Seeding...')

  let adminUser
  try {
    const cred = await signInWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD)
    adminUser = cred.user
    console.log(`✓ Signed in as Admin (${adminUser.uid})`)
  } catch (err) {
    console.log('⚠️ Could not sign in admin, attempting to create admin user...')
    const cred = await createUserWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD)
    adminUser = cred.user
    console.log(`✓ Admin Auth user created (${adminUser.uid})`)
  }

  // 1. /users
  console.log('\n--- Seeding Users ---')
  const staffUsers = [
    { name: 'Studio Admin', email: ADMIN_EMAIL, role: 'admin', uid: adminUser.uid },
    { name: 'Studio Manager', email: 'manager@studiozoom.in', role: 'manager', pass: 'Manager@2026' },
    { name: 'Siva Prakash', email: 'siva@studiozoom.in', role: 'staff', pass: 'Staff@2026' },
    { name: 'Naresh', email: 'naresh@studiozoom.in', role: 'staff', pass: 'Staff@2026' },
    { name: 'Varun', email: 'varun@studiozoom.in', role: 'staff', pass: 'Staff@2026' },
    { name: 'Rakesh', email: 'rakesh@studiozoom.in', role: 'staff', pass: 'Staff@2026' },
  ]

  for (const u of staffUsers) {
    let uid = u.uid
    if (!uid) {
      try {
        const cred = await createUserWithEmailAndPassword(auth, u.email, u.pass)
        uid = cred.user.uid
        console.log(`  + Auth user created for ${u.name} (${u.email})`)
      } catch (e) {
        try {
          const cred = await signInWithEmailAndPassword(auth, u.email, u.pass)
          uid = cred.user.uid
        } catch (e2) {
          uid = 'uid_' + u.name.toLowerCase().replace(/\s+/g, '_')
        }
      }
      // Re-sign in as Admin so Firestore writes are performed with Admin privileges
      await signInWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD)
    }

    await setDoc(doc(db, 'users', uid), {
      uid,
      name: u.name,
      email: u.email,
      role: u.role,
      isActive: true,
      createdAt: serverTimestamp(),
    }, { merge: true })
    console.log(`  ✓ User doc written: ${u.name} [${u.role}]`)
  }

  // 2. /equipment
  console.log('\n--- Seeding Equipment ---')
  const equipmentItems = [
    { itemCode: '001', name: 'Canon EOS R6', category: 'cameraBody', brand: 'Canon', serialNumber: 'R6-8841', purchasePrice: 185000, condition: 'excellent', location: 'Studio Cabinet A', status: 'available' },
    { itemCode: '023', name: 'RF 24-70mm f/2.8', category: 'lens', brand: 'Canon', serialNumber: 'L24-1192', purchasePrice: 145000, condition: 'good', location: 'Studio Cabinet A', status: 'available' },
    { itemCode: '027', name: 'RF 50mm f/1.2', category: 'lens', brand: 'Canon', serialNumber: 'L50-0420', purchasePrice: 165000, condition: 'excellent', location: 'Studio Cabinet A', status: 'available' },
    { itemCode: '041', name: 'DJI Air 3', category: 'drone', brand: 'DJI', serialNumber: 'DA3-7765', purchasePrice: 85000, condition: 'good', location: 'Studio Cabinet B', status: 'available' },
    { itemCode: '031', name: 'Godox SL-60W', category: 'light', brand: 'Godox', serialNumber: 'GX-SL60-112', purchasePrice: 12000, condition: 'good', location: 'Studio Cabinet B', status: 'available' },
  ]

  for (const item of equipmentItems) {
    const itemRef = doc(db, 'equipment', `eq_${item.itemCode}`)
    await setDoc(itemRef, {
      ...item,
      createdAt: serverTimestamp()
    }, { merge: true })
    console.log(`  ✓ Equipment written: ${item.name} (${item.itemCode})`)
  }

  // 3. /studioSettings -> config
  console.log('\n--- Seeding Studio Settings ---')
  const configRef = doc(db, 'studioSettings', 'config')
  await setDoc(configRef, {
    studioName: 'Studio Zoom',
    address: 'Avadi, Tamil Nadu',
    city: 'Avadi',
    phone: '+91 XXXXX XXXXX',
    email: 'info@studiozoom.in',
    defaultTerms: '50% advance required. Balance due on delivery.',
    gstEnabled: false,
    gstRate: 18,
    invoicePrefix: 'ZS-INV-',
    quotationPrefix: 'ZS-Q-',
    invoiceStartNumber: 1,
    quotationStartNumber: 1,
    packages: [
      {
        id: 'silver',
        name: 'Silver',
        price: 45000,
        lineItems: [
          { description: 'Photography (4 hrs)', qty: 1, rate: 25000, amount: 25000 },
          { description: 'Photo editing', qty: 1, rate: 20000, amount: 20000 }
        ]
      },
      {
        id: 'gold',
        name: 'Gold',
        price: 75000,
        lineItems: [
          { description: 'Photography full day', qty: 1, rate: 40000, amount: 40000 },
          { description: 'Videography', qty: 1, rate: 20000, amount: 20000 },
          { description: 'Photo + video edit', qty: 1, rate: 15000, amount: 15000 }
        ]
      },
      {
        id: 'platinum',
        name: 'Platinum',
        price: 125000,
        lineItems: [
          { description: 'Photography full day (2 shooters)', qty: 1, rate: 60000, amount: 60000 },
          { description: 'Cinematic videography', qty: 1, rate: 35000, amount: 35000 },
          { description: 'Premium album 30 sheets', qty: 1, rate: 30000, amount: 30000 }
        ]
      }
    ]
  }, { merge: true })
  console.log('  ✓ Studio Settings config document written!')

  // 4. /clients
  console.log('\n--- Seeding Clients ---')
  const client1Ref = doc(db, 'clients', 'client_karthik_rajan')
  await setDoc(client1Ref, {
    name: 'Karthik Rajan',
    contact: '+91 98765 43210',
    email: 'karthik@email.com',
    eventName: 'Karthik weds Priya',
    eventType: 'wedding',
    eventDate: Timestamp.fromDate(new Date('2026-08-14')),
    location: 'Sri Mahalakshmi Mahal, Avadi',
    packageType: 'Gold',
    totalAmount: 75000,
    balanceDue: 50000,
    paymentStatus: 'partial',
    invoiceNumber: 'ZS-INV-2026-001',
    status: 'booked',
    createdBy: adminUser.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true })
  console.log('  ✓ Client written: Karthik Rajan (Booked)')

  const client2Ref = doc(db, 'clients', 'client_meena_krishnan')
  await setDoc(client2Ref, {
    name: 'Meena Krishnan',
    contact: '+91 87654 32109',
    email: 'meena@email.com',
    eventName: 'Meena Portrait Session',
    eventType: 'portrait',
    eventDate: Timestamp.fromDate(new Date('2026-08-22')),
    location: 'Studio Zoom, Avadi',
    packageType: 'Silver',
    totalAmount: 45000,
    balanceDue: 45000,
    paymentStatus: 'unpaid',
    invoiceNumber: 'ZS-INV-2026-002',
    status: 'inquiry',
    createdBy: adminUser.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true })
  console.log('  ✓ Client written: Meena Krishnan (Inquiry)')

  console.log('\n=======================================')
  console.log(' 🎉 Firestore Seed Complete!')
  console.log('=======================================\n')
  process.exit(0)
}

runSeed().catch(err => {
  console.error('❌ Seeding failed:', err)
  process.exit(1)
})

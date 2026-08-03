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
  deleteDoc,
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

  // ── Clean up old studioSettings documents before seeding fresh ones
  console.log('\n--- Cleaning up old studioSettings ---')
  for (const docId of ['config', 'brandConfig', 'numberingConfig', 'packageConfig']) {
    try {
      await deleteDoc(doc(db, 'studioSettings', docId))
      console.log(`  ✓ Deleted studioSettings/${docId}`)
    } catch {
      console.log(`  ℹ  studioSettings/${docId} did not exist — skipping`)
    }
  }

  // 1. /users
  console.log('\n--- Seeding Users ---')
  const staffUsers = [
    { name: 'Studio Admin', email: ADMIN_EMAIL, role: 'admin', uid: adminUser.uid, jobTitle: 'Studio Admin', contact: '+91 98400 00000', joinDate: '2020-01-01', baseSalary: 50000 },
    { name: 'Studio Manager', email: 'manager@studiozoom.in', role: 'manager', pass: 'Manager@2026', jobTitle: 'Studio Manager', contact: '+91 98400 11111', joinDate: '2021-03-15', baseSalary: 35000 },
    { name: 'Siva Prakash', email: 'siva@studiozoom.in', role: 'staff', pass: 'Staff@2026', jobTitle: 'Photographer', contact: '+91 98400 11223', joinDate: '2022-03-12', baseSalary: 28000 },
    { name: 'Kavya R', email: 'kavya@studiozoom.in', role: 'staff', pass: 'Staff@2026', jobTitle: 'Editor', contact: '+91 98400 22334', joinDate: '2023-01-05', baseSalary: 26000 },
    { name: 'Ramesh D', email: 'ramesh@studiozoom.in', role: 'staff', pass: 'Staff@2026', jobTitle: 'Videographer', contact: '+91 98400 33445', joinDate: '2022-08-20', baseSalary: 27000 },
    { name: 'Deepak S', email: 'deepak@studiozoom.in', role: 'staff', pass: 'Staff@2026', jobTitle: 'Drone Operator', contact: '+91 98400 44556', joinDate: '2024-02-15', baseSalary: 24000 },
    { name: 'Anitha M', email: 'anitha@studiozoom.in', role: 'staff', pass: 'Staff@2026', jobTitle: 'Designer', contact: '+91 98400 55667', joinDate: '2023-06-03', baseSalary: 25000 },
    { name: 'Mohan K', email: 'mohan@studiozoom.in', role: 'staff', pass: 'Staff@2026', jobTitle: 'Assistant', contact: '+91 98400 66778', joinDate: '2024-10-10', baseSalary: 18000, isActive: false },
  ]

  const seededStaffUids = {}

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

    seededStaffUids[u.name] = uid

    await setDoc(doc(db, 'users', uid), {
      uid,
      name: u.name,
      email: u.email,
      role: u.role,
      jobTitle: u.jobTitle,
      contact: u.contact,
      joinDate: Timestamp.fromDate(new Date(u.joinDate)),
      baseSalary: u.baseSalary,
      isActive: u.isActive !== undefined ? u.isActive : true,
      photoURL: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true })
    console.log(`  ✓ User doc written: ${u.name} [${u.jobTitle}]`)
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

  // 3. /studioSettings — 4 focused documents
  console.log('\n--- Seeding Studio Settings ---')

  // brandConfig — per-studio contact details
  const brandConfigRef = doc(db, 'studioSettings', 'brandConfig')
  await setDoc(brandConfigRef, {
    studioZoom: {
      phone:   '+91 XXXXX XXXXX',
      address: 'Avadi, Tamil Nadu',
      city:    'Avadi',
      email:   'info@studiozoom.in',
      gstin:   '',
      upiId:   '',
    },
    studioZoomProds: {
      phone:   '+91 XXXXX XXXXX',
      address: 'Avadi, Tamil Nadu',
      city:    'Avadi',
      email:   'productions@studiozoom.in',
      gstin:   '',
      upiId:   '',
    },
    updatedAt: serverTimestamp(),
  }, { merge: true })
  console.log('  ✓ brandConfig written')

  // numberingConfig — invoice/quotation numbering & GST
  const numberingRef = doc(db, 'studioSettings', 'numberingConfig')
  await setDoc(numberingRef, {
    gstEnabled:           false,
    invoicePrefix:        'ZS-INV-',
    quotationPrefix:      'ZS-Q-',
    invoiceStartNumber:   1,
    quotationStartNumber: 1,
    updatedAt: serverTimestamp(),
  }, { merge: true })
  console.log('  ✓ numberingConfig written')

  // packageConfig — service package templates
  const packageRef = doc(db, 'studioSettings', 'packageConfig')
  await setDoc(packageRef, {
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
    ],
    updatedAt: serverTimestamp(),
  }, { merge: true })
  console.log('  ✓ packageConfig written')

  // config — active runtime state
  const configRef = doc(db, 'studioSettings', 'config')
  await setDoc(configRef, {
    activeStudioId:         'studio-zoom',
    currentInvoiceNumber:   0,
    currentQuotationNumber: 0,
    updatedAt: serverTimestamp(),
  }, { merge: true })
  console.log('  ✓ config (active state) written')

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

  // 5. /attendance, /payslips, /projects, /staffAssignments for staff
  console.log('\n--- Seeding Attendance, Payslips, Projects & Staff Assignments ---')

  const sivaUid = seededStaffUids['Siva Prakash'] || 'siva_uid'

  // Attendance summary
  const now = new Date()
  const attRef = doc(db, 'attendance', `${sivaUid}_${now.getFullYear()}_${now.getMonth() + 1}`)
  await setDoc(attRef, {
    staffUid: sivaUid,
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    summary: { present: 17, late: 1, absent: 0, totalMinutes: 9600 }
  }, { merge: true })
  console.log(`  ✓ Attendance document written for Siva Prakash`)

  // Payslips
  const payslips = [
    { id: `ps_${sivaUid}_1`, payslipNumber: 'ZS-PS-0136', month: 6, year: 2026, netPay: 22000, staffUid: sivaUid },
    { id: `ps_${sivaUid}_2`, payslipNumber: 'ZS-PS-0130', month: 5, year: 2026, netPay: 25500, staffUid: sivaUid },
    { id: `ps_${sivaUid}_3`, payslipNumber: 'ZS-PS-0124', month: 4, year: 2026, netPay: 28000, staffUid: sivaUid },
    { id: `ps_${sivaUid}_4`, payslipNumber: 'ZS-PS-0118', month: 3, year: 2026, netPay: 24000, staffUid: sivaUid },
  ]
  for (const ps of payslips) {
    await setDoc(doc(db, 'payslips', ps.id), {
      ...ps,
      createdAt: serverTimestamp()
    }, { merge: true })
  }
  console.log(`  ✓ 4 Payslip documents written for Siva Prakash`)

  // Projects
  const projects = [
    { id: 'proj_karthik', eventName: 'Karthik weds Priya', stage: 'planning' },
    { id: 'proj_divya', eventName: 'Divya & Arjun', stage: 'preProduction' },
    { id: 'proj_meera', eventName: 'Meera & Vikram', stage: 'planning' },
    { id: 'proj_aishwarya', eventName: 'Aishwarya & Naveen', stage: 'delivered' },
  ]
  for (const p of projects) {
    await setDoc(doc(db, 'projects', p.id), {
      projectId: p.id,
      eventName: p.eventName,
      stage: p.stage,
      status: 'ongoing',
      createdAt: serverTimestamp()
    }, { merge: true })
  }
  console.log(`  ✓ 4 Project documents written`)

  // Staff Assignments
  const assignments = [
    { id: `sa_${sivaUid}_1`, staffUid: sivaUid, projectId: 'proj_karthik', role: 'photographer', eventDate: '2026-08-02' },
    { id: `sa_${sivaUid}_2`, staffUid: sivaUid, projectId: 'proj_divya', role: 'photographer', eventDate: '2026-07-24' },
    { id: `sa_${sivaUid}_3`, staffUid: sivaUid, projectId: 'proj_meera', role: 'photographer', eventDate: '2026-07-28' },
    { id: `sa_${sivaUid}_4`, staffUid: sivaUid, projectId: 'proj_aishwarya', role: 'photographer', eventDate: '2026-06-12' },
  ]
  for (const a of assignments) {
    await setDoc(doc(db, 'staffAssignments', a.id), {
      ...a,
      createdAt: serverTimestamp()
    }, { merge: true })
  }
  console.log(`  ✓ 4 Staff Assignment documents written for Siva Prakash`)

  console.log('\n=======================================')
  console.log(' 🎉 Firestore Seed Complete!')
  console.log('=======================================\n')
  process.exit(0)
}

runSeed().catch(err => {
  console.error('❌ Seeding failed:', err)
  process.exit(1)
})

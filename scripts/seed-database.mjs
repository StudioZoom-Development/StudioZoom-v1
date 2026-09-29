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
    { itemCode: 'CAM-01', name: 'Sony A7 IV', category: 'camera', brand: 'Sony', model: 'ILCE-7M4', serialNumber: 'SN-4482-A7M4-2201', purchasePrice: 215000, condition: 'good', location: 'Shelf B2 · Studio', status: 'out', assignedToName: 'Siva Prakash', assignedToUid: 'uid_siva_prakash', notes: 'Sensor clean & firmware 3.1 completed' },
    { itemCode: 'CAM-02', name: 'Canon EOS R6 Mark II', category: 'camera', brand: 'Canon', model: 'EOS R6 Mark II', serialNumber: 'SN-3891-R6M2-0442', purchasePrice: 245000, condition: 'good', location: 'Camera Vault A1', status: 'available' },
    { itemCode: 'CAM-03', name: 'Sony FX3 Cinema Line', category: 'camcorder', brand: 'Sony', model: 'ILME-FX3', serialNumber: 'SN-8829-FX3-9103', purchasePrice: 380000, condition: 'excellent', location: 'Pelican Case #1', status: 'available' },
    { itemCode: 'LEN-01', name: 'Sony FE 24-70mm f/2.8 GM II', category: 'lens', brand: 'Sony', model: 'SEL2470GM2', serialNumber: 'SN-3392-GM2-0191', purchasePrice: 195000, condition: 'good', location: 'Lens Vault A', status: 'available' },
    { itemCode: 'LEN-04', name: 'Sony FE 70-200mm f/2.8 GM OSS II', category: 'lens', brand: 'Sony', model: 'SEL70200GM2', serialNumber: 'SN-7729-GM2-1025', purchasePrice: 245000, condition: 'good', location: 'Lens Vault A', status: 'out', assignedToName: 'Siva Prakash', assignedToUid: 'uid_siva_prakash' },
    { itemCode: 'LEN-07', name: 'Sigma 35mm f/1.4 DG DN Art', category: 'lens', brand: 'Sigma', model: '35mm F1.4 Art', serialNumber: 'SN-5521-ART-3501', purchasePrice: 75000, condition: 'good', location: 'Lens Vault B', status: 'available' },
    { itemCode: 'LEN-08', name: 'Canon RF 50mm f/1.2L USM', category: 'lens', brand: 'Canon', model: 'RF 50mm f/1.2L', serialNumber: 'SN-1142-RF50-8802', purchasePrice: 198000, condition: 'excellent', location: 'Lens Vault A', status: 'available' },
    { itemCode: 'DRN-01', name: 'DJI Mavic 3 Pro Cine Drone', category: 'drone', brand: 'DJI', model: 'Mavic 3 Pro Cine', serialNumber: 'SN-1928-M3P-4019', purchasePrice: 290000, condition: 'good', location: 'Drone Vault B', status: 'out', assignedToName: 'Deepak S', assignedToUid: 'staff_deepak' },
    { itemCode: 'GIM-02', name: 'DJI RS 3 Pro Gimbal Stabilizer', category: 'gimbal', brand: 'DJI', model: 'RS 3 Pro Combo', serialNumber: 'SN-5520-RS3-1944', purchasePrice: 72000, condition: 'service', location: 'Service Shelf S1', status: 'service', notes: 'Roll axis balancing in progress' },
    { itemCode: 'FLS-01', name: 'Godox V1 Round-Head Flash', category: 'flash', brand: 'Godox', model: 'V1-S', serialNumber: 'SN-9912-V1S-8831', purchasePrice: 21000, condition: 'good', location: 'Flash Shelf F1', status: 'available' },
    { itemCode: 'FLS-03', name: 'Godox AD600Pro Witstro Outdoor Strobe', category: 'flash', brand: 'Godox', model: 'AD600Pro', serialNumber: 'SN-4410-AD60-2940', purchasePrice: 65000, condition: 'good', location: 'Studio Lighting Rack', status: 'out', assignedToName: 'Ramesh D', assignedToUid: 'staff_ramesh' },
    { itemCode: 'LGT-05', name: 'Aputure Light Storm LS 300d II', category: 'light', brand: 'Aputure', model: 'LS 300d II', serialNumber: 'SN-6652-300D-0193', purchasePrice: 95000, condition: 'good', location: 'Studio Floor Stand Rack', status: 'available' },
    { itemCode: 'LGT-06', name: 'Nanlite Pavotube II 30X RGB LED Tube', category: 'light', brand: 'Nanlite', model: 'Pavotube II 30X', serialNumber: 'SN-8821-PAVO-3001', purchasePrice: 38000, condition: 'excellent', location: 'Lighting Case C', status: 'available' },
    { itemCode: 'TRP-01', name: 'Manfrotto 055 Carbon Fiber Tripod', category: 'tripod', brand: 'Manfrotto', model: 'MT055CXPRO3', serialNumber: 'SN-2210-MNF-0553', purchasePrice: 34000, condition: 'good', location: 'Studio Grip Stand Area', status: 'available' },
    { itemCode: 'AUD-01', name: 'Sennheiser EW-DP Wireless Mic System', category: 'other', brand: 'Sennheiser', model: 'EW-DP ME2 Set', serialNumber: 'SN-7731-SENN-9920', purchasePrice: 58000, condition: 'excellent', location: 'Audio Locker A2', status: 'available' },
    { itemCode: 'MEM-01', name: 'SanDisk Extreme PRO 128GB V90 SDXC', category: 'sdCard', brand: 'SanDisk', model: 'SDSDXDK-128G', serialNumber: 'SN-1092-SAND-128V', purchasePrice: 14500, condition: 'excellent', location: 'Memory Vault M1', status: 'available' },
    { itemCode: 'BAT-01', name: 'Sony NP-FZ100 Rechargeable Battery Set (x4)', category: 'battery', brand: 'Sony', model: 'NP-FZ100', serialNumber: 'SN-4431-BAT-0044', purchasePrice: 28000, condition: 'good', location: 'Charging Station Rack', status: 'available' },
  ]

  for (const item of equipmentItems) {
    const docId = `eq_${item.itemCode.toLowerCase().replace(/[^a-z0-9]/g, '_')}`
    const itemRef = doc(db, 'equipment', docId)
    await setDoc(itemRef, {
      ...item,
      itemId: docId,
      isDeleted: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true })
    console.log(`  ✓ Equipment written: ${item.name} (${item.itemCode}) [${item.status}]`)
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

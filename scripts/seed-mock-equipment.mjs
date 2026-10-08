// Seed realistic Studio Zoom mock equipment inventory and checkouts (clean DS compliant mock data, NOT from excel)
import { initializeApp } from 'firebase/app'
import {
  getAuth,
  signInWithEmailAndPassword,
} from 'firebase/auth'
import {
  getFirestore,
  doc,
  setDoc,
  deleteDoc,
  collection,
  getDocs,
  Timestamp,
  serverTimestamp,
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

async function seedMockEquipment() {
  console.log('🚀 Connecting to Firebase & seeding clean Mock Equipment...')
  const cred = await signInWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD)
  console.log(`✓ Signed in as Admin (${cred.user.uid})`)

  // 1. Delete all existing equipment docs
  console.log('\n🧹 Clearing existing /equipment collection...')
  const eqSnap = await getDocs(collection(db, 'equipment'))
  let eqDelCount = 0
  for (const d of eqSnap.docs) {
    await deleteDoc(d.ref)
    eqDelCount++
  }
  console.log(`✓ Deleted ${eqDelCount} old equipment documents`)

  // 2. Delete all existing checkouts docs
  console.log('\n🧹 Clearing existing /checkouts collection...')
  const coSnap = await getDocs(collection(db, 'checkouts'))
  let coDelCount = 0
  for (const d of coSnap.docs) {
    await deleteDoc(d.ref)
    coDelCount++
  }
  console.log(`✓ Deleted ${coDelCount} old checkouts documents`)

  // 3. Define curated mock equipment items matching Studio Zoom ERP specs
  const now = Date.now()
  const days = (n) => new Date(now + n * 24 * 3600 * 1000)

  const mockEquipment = [
    {
      itemId: 'eq_cam_01',
      itemCode: 'CAM-01',
      name: 'Sony A7 IV',
      category: 'camera',
      brand: 'Sony',
      model: 'ILCE-7M4',
      serialNumber: 'SN-4482-A7M4-2201',
      purchaseDate: new Date('2023-03-15'),
      purchasePrice: 215000,
      condition: 'good',
      location: 'Shelf B2 · Studio',
      status: 'out',
      assignedToName: 'Siva Prakash',
      assignedToUid: 'uid_siva_prakash',
      dueBackDate: days(3),
      notes: 'Sensor clean & firmware 3.1 completed',
      currentCheckoutId: 'co_cam_01',
    },
    {
      itemId: 'eq_cam_02',
      itemCode: 'CAM-02',
      name: 'Canon EOS R6 Mark II',
      category: 'camera',
      brand: 'Canon',
      model: 'EOS R6 Mark II',
      serialNumber: 'SN-3891-R6M2-0442',
      purchaseDate: new Date('2023-08-20'),
      purchasePrice: 245000,
      condition: 'good',
      location: 'Camera Vault A1',
      status: 'available',
      notes: 'Cleaned and ready for assignment',
    },
    {
      itemId: 'eq_cam_03',
      itemCode: 'CAM-03',
      name: 'Sony FX3 Cinema Line',
      category: 'camcorder',
      brand: 'Sony',
      model: 'ILME-FX3',
      serialNumber: 'SN-8829-FX3-9103',
      purchaseDate: new Date('2024-01-10'),
      purchasePrice: 380000,
      condition: 'excellent',
      location: 'Pelican Case #1',
      status: 'available',
      notes: 'Cinema kit with XLR top handle',
    },
    {
      itemId: 'eq_len_01',
      itemCode: 'LEN-01',
      name: 'Sony FE 24-70mm f/2.8 GM II',
      category: 'lens',
      brand: 'Sony',
      model: 'SEL2470GM2',
      serialNumber: 'SN-3392-GM2-0191',
      purchaseDate: new Date('2023-04-10'),
      purchasePrice: 195000,
      condition: 'good',
      location: 'Lens Vault A',
      status: 'available',
      notes: 'UV filter attached',
    },
    {
      itemId: 'eq_len_04',
      itemCode: 'LEN-04',
      name: 'Sony FE 70-200mm f/2.8 GM OSS II',
      category: 'lens',
      brand: 'Sony',
      model: 'SEL70200GM2',
      serialNumber: 'SN-7729-GM2-1025',
      purchaseDate: new Date('2023-05-18'),
      purchasePrice: 245000,
      condition: 'good',
      location: 'Lens Vault A',
      status: 'out',
      assignedToName: 'Siva Prakash',
      assignedToUid: 'uid_siva_prakash',
      dueBackDate: days(-3), // OVERDUE
      notes: 'Assigned for Divya & Arjun engagement',
      currentCheckoutId: 'co_len_04',
    },
    {
      itemId: 'eq_len_07',
      itemCode: 'LEN-07',
      name: 'Sigma 35mm f/1.4 DG DN Art',
      category: 'lens',
      brand: 'Sigma',
      model: '35mm F1.4 Art',
      serialNumber: 'SN-5521-ART-3501',
      purchaseDate: new Date('2023-09-05'),
      purchasePrice: 75000,
      condition: 'good',
      location: 'Lens Vault B',
      status: 'available',
    },
    {
      itemId: 'eq_len_08',
      itemCode: 'LEN-08',
      name: 'Canon RF 50mm f/1.2L USM',
      category: 'lens',
      brand: 'Canon',
      model: 'RF 50mm f/1.2L',
      serialNumber: 'SN-1142-RF50-8802',
      purchaseDate: new Date('2023-11-12'),
      purchasePrice: 198000,
      condition: 'excellent',
      location: 'Lens Vault A',
      status: 'available',
    },
    {
      itemId: 'eq_drn_01',
      itemCode: 'DRN-01',
      name: 'DJI Mavic 3 Pro Cine Drone',
      category: 'drone',
      brand: 'DJI',
      model: 'Mavic 3 Pro Cine',
      serialNumber: 'SN-1928-M3P-4019',
      purchaseDate: new Date('2024-02-15'),
      purchasePrice: 290000,
      condition: 'good',
      location: 'Drone Vault B',
      status: 'out',
      assignedToName: 'Deepak S',
      assignedToUid: 'EmpaoYKGNpXHezIC4vDyLuMQs2o1',
      dueBackDate: days(-2), // OVERDUE
      notes: 'Includes RC Pro and 3 intelligent flight batteries',
      currentCheckoutId: 'co_drn_01',
    },
    {
      itemId: 'eq_gim_02',
      itemCode: 'GIM-02',
      name: 'DJI RS 3 Pro Gimbal Stabilizer',
      category: 'gimbal',
      brand: 'DJI',
      model: 'RS 3 Pro Combo',
      serialNumber: 'SN-5520-RS3-1944',
      purchaseDate: new Date('2023-10-14'),
      purchasePrice: 72000,
      condition: 'service',
      location: 'Service Shelf S1',
      status: 'service',
      notes: 'Roll axis balancing & firmware re-calibration in progress',
    },
    {
      itemId: 'eq_fls_01',
      itemCode: 'FLS-01',
      name: 'Godox V1 Round-Head Flash',
      category: 'flash',
      brand: 'Godox',
      model: 'V1-S',
      serialNumber: 'SN-9912-V1S-8831',
      purchaseDate: new Date('2023-06-25'),
      purchasePrice: 21000,
      condition: 'good',
      location: 'Flash Shelf F1',
      status: 'available',
    },
    {
      itemId: 'eq_fls_03',
      itemCode: 'FLS-03',
      name: 'Godox AD600Pro Witstro Outdoor Strobe',
      category: 'flash',
      brand: 'Godox',
      model: 'AD600Pro',
      serialNumber: 'SN-4410-AD60-2940',
      purchaseDate: new Date('2023-12-01'),
      purchasePrice: 65000,
      condition: 'good',
      location: 'Studio Lighting Rack',
      status: 'out',
      assignedToName: 'Ramesh D',
      assignedToUid: '1gJBWJl5iOfWHeZJnG7iaNACgrw1',
      dueBackDate: days(4),
      notes: 'Includes portable battery pack & standard reflector',
      currentCheckoutId: 'co_fls_03',
    },
    {
      itemId: 'eq_lgt_05',
      itemCode: 'LGT-05',
      name: 'Aputure Light Storm LS 300d II',
      category: 'light',
      brand: 'Aputure',
      model: 'LS 300d II',
      serialNumber: 'SN-6652-300D-0193',
      purchaseDate: new Date('2023-07-20'),
      purchasePrice: 95000,
      condition: 'good',
      location: 'Studio Floor Stand Rack',
      status: 'available',
    },
    {
      itemId: 'eq_lgt_06',
      itemCode: 'LGT-06',
      name: 'Nanlite Pavotube II 30X RGB LED Tube',
      category: 'light',
      brand: 'Nanlite',
      model: 'Pavotube II 30X',
      serialNumber: 'SN-8821-PAVO-3001',
      purchaseDate: new Date('2024-03-05'),
      purchasePrice: 38000,
      condition: 'excellent',
      location: 'Lighting Case C',
      status: 'available',
    },
    {
      itemId: 'eq_trp_01',
      itemCode: 'TRP-01',
      name: 'Manfrotto 055 Carbon Fiber Tripod',
      category: 'tripod',
      brand: 'Manfrotto',
      model: 'MT055CXPRO3',
      serialNumber: 'SN-2210-MNF-0553',
      purchaseDate: new Date('2023-05-10'),
      purchasePrice: 34000,
      condition: 'good',
      location: 'Studio Grip Stand Area',
      status: 'available',
    },
    {
      itemId: 'eq_aud_01',
      itemCode: 'AUD-01',
      name: 'Sennheiser EW-DP Wireless Mic System',
      category: 'other',
      brand: 'Sennheiser',
      model: 'EW-DP ME2 Set',
      serialNumber: 'SN-7731-SENN-9920',
      purchaseDate: new Date('2024-01-18'),
      purchasePrice: 58000,
      condition: 'excellent',
      location: 'Audio Locker A2',
      status: 'available',
      notes: 'Dual receiver with lavalier transmitter',
    },
    {
      itemId: 'eq_mem_01',
      itemCode: 'MEM-01',
      name: 'SanDisk Extreme PRO 128GB V90 SDXC',
      category: 'sdCard',
      brand: 'SanDisk',
      model: 'SDSDXDK-128G',
      serialNumber: 'SN-1092-SAND-128V',
      purchaseDate: new Date('2024-02-01'),
      purchasePrice: 14500,
      condition: 'excellent',
      location: 'Memory Vault M1',
      status: 'available',
    },
    {
      itemId: 'eq_bat_01',
      itemCode: 'BAT-01',
      name: 'Sony NP-FZ100 Rechargeable Battery Set (x4)',
      category: 'battery',
      brand: 'Sony',
      model: 'NP-FZ100',
      serialNumber: 'SN-4431-BAT-0044',
      purchaseDate: new Date('2024-02-10'),
      purchasePrice: 28000,
      condition: 'good',
      location: 'Charging Station Rack',
      status: 'available',
    },
  ]

  console.log('\n--- Writing 17 Mock Equipment Items ---')
  for (const item of mockEquipment) {
    const docRef = doc(db, 'equipment', item.itemId)
    await setDoc(docRef, {
      ...item,
      purchaseDate: Timestamp.fromDate(item.purchaseDate),
      dueBackDate: item.dueBackDate ? Timestamp.fromDate(item.dueBackDate) : null,
      isDeleted: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    console.log(`  ✓ Written: ${item.name} (${item.itemCode}) [${item.status}]`)
  }

  // 4. Define corresponding active checkouts for items that are 'out'
  const mockCheckouts = [
    {
      checkoutId: 'co_cam_01',
      itemId: 'eq_cam_01',
      itemCode: 'CAM-01',
      itemName: 'Sony A7 IV',
      staffName: 'Siva Prakash',
      staffUid: 'uid_siva_prakash',
      projectId: 'proj_divya_arjun',
      eventName: 'Divya & Arjun — Engagement',
      eventDate: Timestamp.fromDate(days(1)),
      checkedOutAt: Timestamp.fromDate(days(-3)),
      dueBack: Timestamp.fromDate(days(3)),
      checkedOutByUid: cred.user.uid,
      checkedOutByName: 'Studio Admin',
      conditionOnCheckout: 'good',
      status: 'out',
      notes: 'Outdoor daylight shoot at ECR resort',
    },
    {
      checkoutId: 'co_len_04',
      itemId: 'eq_len_04',
      itemCode: 'LEN-04',
      itemName: 'Sony FE 70-200mm f/2.8 GM OSS II',
      staffName: 'Siva Prakash',
      staffUid: 'uid_siva_prakash',
      projectId: 'proj_divya_arjun',
      eventName: 'Divya & Arjun — Engagement',
      eventDate: Timestamp.fromDate(days(-4)),
      checkedOutAt: Timestamp.fromDate(days(-7)),
      dueBack: Timestamp.fromDate(days(-3)), // OVERDUE
      checkedOutByUid: cred.user.uid,
      checkedOutByName: 'Studio Admin',
      conditionOnCheckout: 'good',
      status: 'out',
      notes: 'Overdue by 3 days. Return needed for upcoming weekend wedding.',
    },
    {
      checkoutId: 'co_drn_01',
      itemId: 'eq_drn_01',
      itemCode: 'DRN-01',
      itemName: 'DJI Mavic 3 Pro Cine Drone',
      staffName: 'Deepak S',
      staffUid: 'EmpaoYKGNpXHezIC4vDyLuMQs2o1',
      projectId: 'proj_tvs_lucas',
      eventName: 'TVS Lucas AV recce',
      eventDate: Timestamp.fromDate(days(-3)),
      checkedOutAt: Timestamp.fromDate(days(-6)),
      dueBack: Timestamp.fromDate(days(-2)), // OVERDUE
      checkedOutByUid: cred.user.uid,
      checkedOutByName: 'Studio Admin',
      conditionOnCheckout: 'good',
      status: 'out',
      notes: 'Industrial aerial photography survey.',
    },
    {
      checkoutId: 'co_fls_03',
      itemId: 'eq_fls_03',
      itemCode: 'FLS-03',
      itemName: 'Godox AD600Pro Witstro Outdoor Strobe',
      staffName: 'Ramesh D',
      staffUid: '1gJBWJl5iOfWHeZJnG7iaNACgrw1',
      projectId: 'proj_studio_portraits',
      eventName: 'Studio Sessions & Portrait Shoots',
      eventDate: Timestamp.fromDate(days(2)),
      checkedOutAt: Timestamp.fromDate(days(-1)),
      dueBack: Timestamp.fromDate(days(4)),
      checkedOutByUid: cred.user.uid,
      checkedOutByName: 'Studio Admin',
      conditionOnCheckout: 'good',
      status: 'out',
      notes: 'Fashion portfolio shoot in Studio A.',
    },
  ]

  console.log('\n--- Writing 4 Mock Active Checkouts ---')
  for (const co of mockCheckouts) {
    const docRef = doc(db, 'checkouts', co.checkoutId)
    await setDoc(docRef, {
      ...co,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    console.log(`  ✓ Written checkout: ${co.itemName} -> ${co.staffName} [${co.status}]`)
  }

  console.log('\n🎉 Successfully replaced equipment and checkouts with clean mock data!')
}

seedMockEquipment().then(() => process.exit(0)).catch(err => {
  console.error('Seeding error:', err)
  process.exit(1)
})

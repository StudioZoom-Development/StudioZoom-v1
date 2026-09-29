// Import client equipment inventory from CSV into Firestore
import { initializeApp } from 'firebase/app'
import {
  getAuth,
  signInWithEmailAndPassword,
} from 'firebase/auth'
import {
  getFirestore,
  doc,
  setDoc,
  collection,
  Timestamp,
  serverTimestamp,
} from 'firebase/firestore'
import fs from 'fs'
import path from 'path'

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

function parseCSVLine(line) {
  const result = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  result.push(current.trim())
  return result
}

async function runImport() {
  console.log('🚀 Connecting to Firebase & importing Client Equipment Inventory...')
  const cred = await signInWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD)
  console.log(`✓ Signed in as Admin (${cred.user.uid})`)

  const csvPath = path.resolve('../Equipment Inventory (1) - Main Inventory.csv')
  const content = fs.readFileSync(csvPath, 'utf8')
  const lines = content.split('\r\n').join('\n').split('\n').filter(Boolean)

  console.log(`Found ${lines.length - 1} rows in CSV`)

  const staffMap = {
    'SIVA': { uid: 'staff_siva', name: 'Siva Prakash' },
    'VARUN': { uid: 'staff_varun', name: 'Varun' },
    'MANIKANDAN': { uid: 'staff_manikandan', name: 'Manikandan' },
    'NARESH': { uid: 'staff_naresh', name: 'Naresh' },
    'RAKESH': { uid: 'staff_rakesh', name: 'Rakesh' },
    'KEBA': { uid: 'staff_keba', name: 'Keba' },
    'SANJAY': { uid: 'staff_sanjay', name: 'Sanjay' },
  }

  let count = 0
  let checkoutCount = 0

  for (let i = 1; i <= 77; i++) {
    const line = lines[i]
    if (!line) continue
    const cols = parseCSVLine(line)
    const itemId = cols[1]
    const name = cols[2]
    if (!itemId || !name) continue

    const categoryRaw = cols[3]
    const brandModel = cols[4] || ''
    const serialNo = cols[5] === '-' ? '' : (cols[5] || '')
    const priceRaw = cols[7]
    const conditionRaw = cols[8]
    const locationRaw = cols[9]
    const assignedRaw = cols[10] || ''
    const lastUsedRaw = cols[11] || ''
    const nextMaintRaw = cols[12] || ''
    const notesRaw = cols[13] || ''

    let price = 0
    if (priceRaw && priceRaw !== '-') {
      const cleanPrice = priceRaw.replace(/"/g, '').replace(/,/g, '')
      if (cleanPrice.includes('x')) {
        const parts = cleanPrice.split('x').map(p => parseFloat(p.trim()))
        price = (parts[0] || 0) * (parts[1] || 0)
      } else {
        price = parseFloat(cleanPrice) || 0
      }
    }

    let category = 'other'
    if (categoryRaw === 'Camera Body') category = 'cameraBody'
    else if (categoryRaw === 'Camcorder') category = 'camcorder'
    else if (categoryRaw === 'Camera Lens') category = 'lens'
    else if (categoryRaw === 'Drone') category = 'drone'
    else if (categoryRaw === 'Gimbal') category = 'gimbal'
    else if (categoryRaw === 'Flash Light' || categoryRaw === 'Flash Trigger') category = 'flash'
    else if (categoryRaw === 'Video Light' || categoryRaw === 'Photo Light' || categoryRaw === 'Lights') category = 'light'
    else if (categoryRaw === 'Monopod' || categoryRaw === 'Stand') category = 'tripod'
    else if (categoryRaw === 'SD Card') category = 'sdCard'
    else if (categoryRaw === 'Battery' || categoryRaw === 'Power Bank') category = 'battery'
    else if (categoryRaw === 'Charger' || categoryRaw === 'Flash Charger' || categoryRaw === 'Power Adapter') category = 'charger'
    else if (categoryRaw === 'Wire' || categoryRaw === 'Charging wire' || categoryRaw === 'Power Cable') category = 'wire'

    let brand = 'Studio Zoom'
    if (name.includes('Canon') || brandModel.includes('Canon')) brand = 'Canon'
    else if (name.includes('Sony') || brandModel.includes('Sony')) brand = 'Sony'
    else if (name.includes('DJI') || brandModel.includes('DJI')) brand = 'DJI'
    else if (name.includes('Godox') || brandModel.includes('Godox')) brand = 'Godox'
    else if (name.includes('Samyang') || brandModel.includes('Samyang')) brand = 'Samyang'
    else if (name.includes('Simpex') || brandModel.includes('Simpex')) brand = 'Simpex'
    else if (name.includes('PowerPak') || brandModel.includes('PowerPak')) brand = 'PowerPak'
    else if (name.includes('Hako') || brandModel.includes('Hako')) brand = 'Hako'
    else if (name.includes('Portronics') || brandModel.includes('Portronics')) brand = 'Portronics'
    else if (name.includes('Sandisk') || brandModel.includes('Sandisk')) brand = 'Sandisk'
    else if (name.includes('TyFy') || brandModel.includes('TyFy')) brand = 'TyFy'

    let condition = 'good'
    if (conditionRaw === 'Excellent') condition = 'excellent'
    else if (conditionRaw === 'Can Use') condition = 'canUse'
    else if (conditionRaw === 'Service') condition = 'service'

    let location = locationRaw || 'Back Office'
    if (location === 'STUDIO') location = 'Studio Floor'

    let assignedStaff = null
    let status = 'available'
    if (condition === 'service') {
      status = 'service'
    }

    if (assignedRaw) {
      const a = assignedRaw.toUpperCase()
      for (const [key, val] of Object.entries(staffMap)) {
        if (a.includes(key)) {
          assignedStaff = val
          if (status !== 'service') {
            status = 'out'
          }
          break
        }
      }
    }

    const docId = `eq_${itemId}`
    const dueBackDate = status === 'out' ? new Date(Date.now() + 2 * 24 * 3600 * 1000) : null

    // 1. Write equipment doc
    await setDoc(doc(db, 'equipment', docId), {
      itemId: docId,
      itemCode: itemId,
      name,
      category,
      brand,
      model: brandModel,
      serialNumber: serialNo,
      purchasePrice: price,
      condition,
      location,
      status,
      assignedToName: assignedStaff ? assignedStaff.name : null,
      assignedToUid: assignedStaff ? assignedStaff.uid : null,
      dueBackDate: dueBackDate ? Timestamp.fromDate(dueBackDate) : null,
      notes: nextMaintRaw && nextMaintRaw !== '-' ? `Next maint: ${nextMaintRaw}` : (notesRaw || null),
      isDeleted: false,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    }, { merge: true })

    count++

    // 2. If out with staff, also create active checkout
    if (status === 'out' && assignedStaff) {
      const coId = `co_${itemId}`
      await setDoc(doc(db, 'checkouts', coId), {
        checkoutId: coId,
        itemId: docId,
        itemName: name,
        itemCode: itemId,
        staffUid: assignedStaff.uid,
        staffName: assignedStaff.name,
        projectId: 'proj_studio_assigned',
        eventName: 'Field Shoot / Client Assignment',
        eventDate: Timestamp.fromDate(new Date()),
        checkedOutAt: Timestamp.fromDate(new Date(Date.now() - 3 * 24 * 3600 * 1000)),
        dueBack: Timestamp.fromDate(dueBackDate),
        checkedOutByUid: cred.user.uid,
        checkedOutByName: 'Studio Admin',
        conditionOnCheckout: condition,
        status: 'active',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { merge: true })
      checkoutCount++
    }
  }

  console.log(`✅ Successfully imported ${count} equipment items and ${checkoutCount} active checkouts into Firestore!`)
}

runImport().then(() => process.exit(0)).catch(err => {
  console.error('Import error:', err)
  process.exit(1)
})

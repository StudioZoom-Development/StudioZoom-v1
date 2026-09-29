// Script to verify and seed missing studioSettings documents in devDb
import { initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp
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

async function checkAndSeedSettings() {
  console.log('🔍 Checking studioSettings in project:', firebaseConfig.projectId)

  try {
    const cred = await signInWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD)
    console.log(`✓ Signed in as Admin (${cred.user.uid})`)
  } catch (err) {
    console.warn(`⚠️ Warning signing in: ${err.message}`)
  }

  // 1. brandConfig
  const brandSnap = await getDoc(doc(db, 'studioSettings', 'brandConfig'))
  if (!brandSnap.exists() || Object.keys(brandSnap.data() || {}).length === 0) {
    console.log('⚠️ brandConfig is missing or empty. Seeding brandConfig...')
    await setDoc(doc(db, 'studioSettings', 'brandConfig'), {
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
    console.log('✓ brandConfig seeded successfully.')
  } else {
    console.log('✓ brandConfig exists:', Object.keys(brandSnap.data()))
  }

  // 2. numberingConfig
  const numSnap = await getDoc(doc(db, 'studioSettings', 'numberingConfig'))
  if (!numSnap.exists() || Object.keys(numSnap.data() || {}).length === 0) {
    console.log('⚠️ numberingConfig is missing or empty. Seeding numberingConfig...')
    await setDoc(doc(db, 'studioSettings', 'numberingConfig'), {
      gstEnabled:           false,
      invoicePrefix:        'ZS-INV-',
      quotationPrefix:      'ZS-Q-',
      invoiceStartNumber:   1,
      quotationStartNumber: 1,
      updatedAt: serverTimestamp(),
    }, { merge: true })
    console.log('✓ numberingConfig seeded successfully.')
  } else {
    console.log('✓ numberingConfig exists:', Object.keys(numSnap.data()))
  }

  // 3. config (runtime active config)
  const configSnap = await getDoc(doc(db, 'studioSettings', 'config'))
  if (!configSnap.exists() || Object.keys(configSnap.data() || {}).length === 0) {
    console.log('⚠️ config is missing or empty. Seeding config...')
    await setDoc(doc(db, 'studioSettings', 'config'), {
      activeStudioId:         'studio-zoom',
      currentInvoiceNumber:   0,
      currentQuotationNumber: 0,
      updatedAt: serverTimestamp(),
    }, { merge: true })
    console.log('✓ config seeded successfully.')
  } else {
    console.log('✓ config exists:', Object.keys(configSnap.data()))
  }

  // 4. packageConfig
  const pkgSnap = await getDoc(doc(db, 'studioSettings', 'packageConfig'))
  if (!pkgSnap.exists() || Object.keys(pkgSnap.data() || {}).length === 0) {
    console.log('⚠️ packageConfig is missing or empty. Seeding packageConfig...')
    await setDoc(doc(db, 'studioSettings', 'packageConfig'), {
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
    console.log('✓ packageConfig seeded successfully.')
  } else {
    console.log('✓ packageConfig exists with packages count:', pkgSnap.data()?.packages?.length || 0)
  }

  // 5. equipmentCategories
  const eqCatSnap = await getDoc(doc(db, 'studioSettings', 'equipmentCategories'))
  if (!eqCatSnap.exists() || Object.keys(eqCatSnap.data() || {}).length === 0) {
    console.log('ℹ️ equipmentCategories doc does not exist yet. Initializing empty collection...')
    await setDoc(doc(db, 'studioSettings', 'equipmentCategories'), {
      categories: [],
      updatedAt: serverTimestamp(),
    }, { merge: true })
    console.log('✓ equipmentCategories initialized.')
  } else {
    console.log('✓ equipmentCategories exists with count:', eqCatSnap.data()?.categories?.length || 0)
  }

  console.log('\n🎉 Finished checking and ensuring studioSettings documents!')
}

checkAndSeedSettings().then(() => process.exit(0)).catch((err) => {
  console.error('Error:', err)
  process.exit(1)
})

import { initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import {
  getFirestore, collection, doc, getDocs, setDoc, deleteDoc, writeBatch
} from 'firebase/firestore'
import fs from 'fs'

function parseEnv(filePath) {
  if (!fs.existsSync(filePath)) return {}
  const content = fs.readFileSync(filePath, 'utf8')
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

const prodEnv = parseEnv('.env.production')
const devEnv = fs.existsSync('.env.local.dev')
  ? parseEnv('.env.local.dev')
  : fs.existsSync('.env.development')
  ? parseEnv('.env.development')
  : parseEnv('.env.local')

console.log('--- Firebase Configurations ---')
console.log('Prod Project ID:', prodEnv.NEXT_PUBLIC_FIREBASE_PROJECT_ID)
console.log('Dev Project ID: ', devEnv.NEXT_PUBLIC_FIREBASE_PROJECT_ID)

if (!prodEnv.NEXT_PUBLIC_FIREBASE_PROJECT_ID || !devEnv.NEXT_PUBLIC_FIREBASE_PROJECT_ID) {
  console.error('❌ Error: Missing Firebase configuration for Prod or Dev.')
  process.exit(1)
}

if (prodEnv.NEXT_PUBLIC_FIREBASE_PROJECT_ID === devEnv.NEXT_PUBLIC_FIREBASE_PROJECT_ID) {
  console.error('❌ Refusing to sync: Prod and Dev Project IDs are identical!')
  process.exit(1)
}

const prodApp = initializeApp({
  apiKey: prodEnv.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: prodEnv.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: prodEnv.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: prodEnv.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: prodEnv.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: prodEnv.NEXT_PUBLIC_FIREBASE_APP_ID,
}, 'prodApp')

const devApp = initializeApp({
  apiKey: devEnv.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: devEnv.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: devEnv.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: devEnv.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: devEnv.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: devEnv.NEXT_PUBLIC_FIREBASE_APP_ID,
}, 'devApp')

const prodAuth = getAuth(prodApp)
const prodDb = getFirestore(prodApp)

const devAuth = getAuth(devApp)
const devDb = getFirestore(devApp)

const ADMIN_EMAIL = 'admin@studiozoom.in'
const ADMIN_PASSWORD = 'StudioZoom@2026'

async function sync() {
  console.log('\n🔐 Authenticating Admin on Prod & Dev...')
  try {
    await signInWithEmailAndPassword(prodAuth, ADMIN_EMAIL, ADMIN_PASSWORD)
    console.log('✓ Signed into Production database')
  } catch (err) {
    console.error('❌ Production auth failed:', err.message)
    process.exit(1)
  }

  try {
    await signInWithEmailAndPassword(devAuth, ADMIN_EMAIL, ADMIN_PASSWORD)
    console.log('✓ Signed into Development database')
  } catch (err) {
    console.error('❌ Development auth failed:', err.message)
    process.exit(1)
  }

  console.log('\n🚀 Starting Sync Process...')
  console.log('Mode: studioSettings → Clean Overwrite (Option A)')
  console.log('Mode: users & all other collections → Merge / Upsert (Option B)\n')

  // 1. Sync studioSettings (Option A: Clean Overwrite)
  console.log('📦 Syncing [studioSettings] (Option A - Overwrite)...')
  try {
    const devSettingsSnap = await getDocs(collection(devDb, 'studioSettings'))
    for (const d of devSettingsSnap.docs) {
      await deleteDoc(doc(devDb, 'studioSettings', d.id))
    }
    const prodSettingsSnap = await getDocs(collection(prodDb, 'studioSettings'))
    let settingsCount = 0
    for (const d of prodSettingsSnap.docs) {
      await setDoc(doc(devDb, 'studioSettings', d.id), d.data())
      settingsCount++
    }
    console.log(`✓ studioSettings synced (${settingsCount} documents copied).`)
  } catch (err) {
    console.warn(`⚠️ Warning syncing studioSettings: ${err.message}`)
  }

  // 2. Sync users (Option B: Merge)
  console.log('\n👥 Syncing [users] (Option B - Merge)...')
  try {
    const prodUsersSnap = await getDocs(collection(prodDb, 'users'))
    let userCount = 0
    for (const d of prodUsersSnap.docs) {
      await setDoc(doc(devDb, 'users', d.id), d.data(), { merge: true })
      userCount++
    }
    console.log(`✓ users synced (${userCount} documents merged).`)
  } catch (err) {
    console.warn(`⚠️ Warning syncing users: ${err.message}`)
  }

  // 3. Sync all other collections (Option B: Merge)
  const collectionsToSync = [
    'clients',
    'projects',
    'workItems',
    'staffAssignments',
    'attendance',
    'timeLogs',
    'timeLogCorrections',
    'salaries',
    'payslips',
    'freelancers',
    'freelancerPayouts',
    'equipment',
    'checkouts',
    'quotations',
    'invoices',
    'expenses',
    'budgets',
    'leaveRequests',
    'leads',
    'bookingDrafts',
  ]

  for (const colName of collectionsToSync) {
    process.stdout.write(`📁 Syncing [${colName}]... `)
    try {
      const snap = await getDocs(collection(prodDb, colName))
      if (snap.empty) {
        console.log(`(0 docs)`)
        continue
      }

      let batch = writeBatch(devDb)
      let count = 0
      let total = 0

      for (const d of snap.docs) {
        batch.set(doc(devDb, colName, d.id), d.data(), { merge: true })
        count++
        total++
        if (count >= 400) {
          await batch.commit()
          batch = writeBatch(devDb)
          count = 0
        }
      }
      if (count > 0) {
        await batch.commit()
      }

      // If clients collection, also sync nested payments subcollection
      if (colName === 'clients') {
        let paymentTotal = 0
        for (const clientDoc of snap.docs) {
          const pSnap = await getDocs(collection(prodDb, 'clients', clientDoc.id, 'payments'))
          if (!pSnap.empty) {
            let pBatch = writeBatch(devDb)
            let pCount = 0
            for (const pDoc of pSnap.docs) {
              pBatch.set(doc(devDb, 'clients', clientDoc.id, 'payments', pDoc.id), pDoc.data(), { merge: true })
              pCount++
              paymentTotal++
              if (pCount >= 400) {
                await pBatch.commit()
                pBatch = writeBatch(devDb)
                pCount = 0
              }
            }
            if (pCount > 0) {
              await pBatch.commit()
            }
          }
        }
        console.log(`✓ (${total} docs, ${paymentTotal} payments merged)`)
      } else {
        console.log(`✓ (${total} docs merged)`)
      }
    } catch (err) {
      console.log(`⚠️ Warning: ${err.message}`)
    }
  }

  console.log('\n🎉 Production to Development sync completed successfully!')
  process.exit(0)
}

sync().catch(err => {
  console.error('Fatal sync error:', err)
  process.exit(1)
})

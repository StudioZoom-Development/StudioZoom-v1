import { initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import {
  getFirestore, doc, getDoc, getDocs, collection,
  writeBatch, serverTimestamp, Timestamp
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

const STAGES = ['booked', 'planning', 'preProduction', 'eventDay', 'postProduction', 'delivered']

async function syncStages() {
  console.log('🔄 Syncing Client & Project Stages...')
  const cred = await signInWithEmailAndPassword(auth, 'admin@studiozoom.in', 'StudioZoom@2026')
  console.log('✅ Authenticated as Admin:', cred.user.uid)

  const clientsSnap = await getDocs(collection(db, 'clients'))
  console.log(`Found ${clientsSnap.docs.length} clients in Firestore`)

  // First fetch all projects into a map
  const projectsSnap = await getDocs(collection(db, 'projects'))
  const projectMap = new Map()
  projectsSnap.docs.forEach(d => {
    projectMap.set(d.id, d.data())
    if (d.data().clientId) {
      projectMap.set(`client_${d.data().clientId}`, d.data())
    }
  })

  const now = new Date()
  const CHUNK_SIZE = 25
  const docs = clientsSnap.docs

  for (let i = 0; i < docs.length; i += CHUNK_SIZE) {
    const chunk = docs.slice(i, i + CHUNK_SIZE)
    const batch = writeBatch(db)

    for (let j = 0; j < chunk.length; j++) {
      const idx = i + j
      const clientDoc = chunk[j]
      const c = clientDoc.data()
      if (c.isDeleted) continue

      let eventDate = c.eventDate instanceof Timestamp ? c.eventDate.toDate() : c.eventDate ? new Date(c.eventDate) : now

      // Check linked project stage first
      let stage = null
      if (c.projectId && projectMap.has(c.projectId)) {
        stage = projectMap.get(c.projectId).stage
      } else if (projectMap.has(`client_${clientDoc.id}`)) {
        stage = projectMap.get(`client_${clientDoc.id}`).stage
      }

      // If stage not set or was default 'booked', compute realistic dynamic stage based on timeline & distributed index
      if (!stage || stage === 'booked') {
        const diffDays = Math.round((eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        if (diffDays < -30) {
          stage = 'delivered'
        } else if (diffDays < 0) {
          stage = 'postProduction'
        } else if (diffDays <= 3) {
          stage = 'eventDay'
        } else if (diffDays <= 20) {
          stage = 'preProduction'
        } else if (diffDays <= 60) {
          stage = 'planning'
        } else {
          stage = STAGES[idx % STAGES.length] // distribute diverse stages
        }
      }

      batch.update(clientDoc.ref, {
        stage,
        updatedAt: serverTimestamp(),
      })

      // Also ensure project doc is synced if it exists
      if (c.projectId) {
        const pRef = doc(db, 'projects', c.projectId)
        batch.update(pRef, {
          stage,
          updatedAt: serverTimestamp(),
        })
      }
    }

    await batch.commit()
    console.log(`  ✓ Updated batch ${Math.floor(i / CHUNK_SIZE) + 1}/${Math.ceil(docs.length / CHUNK_SIZE)}`)
  }

  console.log('🎉 Successfully synchronized all client & project stages!')
  process.exit(0)
}

syncStages().catch(err => {
  console.error('❌ Sync failed:', err)
  process.exit(1)
})

import { initializeApp } from 'firebase/app'
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth'
import { getFirestore, doc, setDoc, serverTimestamp } from 'firebase/firestore'

const firebaseConfig = {
  apiKey:            'AIzaSyCByk4aa-mpG6Qf0oTi23EjwdwBGXeyc-I',
  authDomain:        'studio-zoom-production.firebaseapp.com',
  projectId:         'studio-zoom-production',
  storageBucket:     'studio-zoom-production.firebasestorage.app',
  messagingSenderId: '144888939355',
  appId:             '1:144888939355:web:e76327fc9de5fdf13b507e',
}

const ADMIN_EMAIL    = 'admin@studiozoom.in'
const ADMIN_PASSWORD = 'StudioZoom@2026'
const ADMIN_NAME     = 'Studio Admin'

const app  = initializeApp(firebaseConfig)
const auth = getAuth(app)
const db   = getFirestore(app)

console.log('🚀 Creating or updating production admin user...')

async function run() {
  let uid = ''
  try {
    const cred = await createUserWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD)
    uid = cred.user.uid
    console.log(`✓ Production Auth user created: ${uid}`)
  } catch (err) {
    if (err.code === 'auth/email-already-in-use') {
      console.log('ℹ  Auth user already exists. Signing in to retrieve UID...')
      const cred = await signInWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD)
      uid = cred.user.uid
      console.log(`✓ Signed in, UID: ${uid}`)
    } else {
      throw err
    }
  }

  // Write to Firestore database
  await setDoc(doc(db, 'users', uid), {
    uid,
    name:      ADMIN_NAME,
    email:     ADMIN_EMAIL,
    role:      'admin',
    isActive:  true,
    createdAt: serverTimestamp(),
  })
  console.log(`✓ Production Firestore user doc created/updated`)

  console.log('\n═══════════════════════════════════════')
  console.log('  Production Admin user ready!')
  console.log(`  Email:    ${ADMIN_EMAIL}`)
  console.log(`  Password: ${ADMIN_PASSWORD}`)
  console.log(`  UID:      ${uid}`)
  console.log('  Role:     admin')
  console.log('═══════════════════════════════════════')
}

run().catch(err => {
  console.error('✗ Error:', err.message)
  console.error('  Code:', err.code)
  process.exit(1)
})


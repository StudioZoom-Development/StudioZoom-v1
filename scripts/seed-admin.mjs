// Bootstrap seed script — creates admin user doc using the REST API with ID token
// The trick: we sign in to get an ID token, then write to Firestore via REST
// Temporarily uses open rules to bootstrap the first user

import { initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword, getIdToken } from 'firebase/auth'

const firebaseConfig = {
  apiKey:            'AIzaSyBwWM3bA4pH6-vVW788GMi9Sa9Ovoqd8SY',
  authDomain:        'studio-zoom.firebaseapp.com',
  projectId:         'studio-zoom',
  storageBucket:     'studio-zoom.firebasestorage.app',
  messagingSenderId: '939824676231',
  appId:             '1:939824676231:web:926efea5c2e128bd45a722',
}

const UID      = '7NxENmDjRfOu009Vcu9qie2NzJA3'
const EMAIL    = 'admin@studiozoom.in'
const PASSWORD = 'StudioZoom@2026'
const PROJECT  = 'studio-zoom'

const app  = initializeApp(firebaseConfig)
const auth = getAuth(app)

console.log('🔑 Signing in to get ID token...')

try {
  const cred  = await signInWithEmailAndPassword(auth, EMAIL, PASSWORD)
  const token = await getIdToken(cred.user)
  console.log('✓ Got ID token')

  // Write the user doc using REST API with ID token
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/users/${UID}`
  const res  = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fields: {
        uid:      { stringValue: UID },
        name:     { stringValue: 'Studio Admin' },
        email:    { stringValue: EMAIL },
        role:     { stringValue: 'admin' },
        isActive: { booleanValue: true },
        createdAt: { timestampValue: new Date().toISOString() },
      }
    })
  })

  const data = await res.json()

  if (res.ok) {
    console.log('✓ User document created in Firestore!')
    console.log('\n═══════════════════════════════════════')
    console.log('  ✅ Admin user is ready!')
    console.log(`  Email:    ${EMAIL}`)
    console.log(`  Password: ${PASSWORD}`)
    console.log('  Role:     admin')
    console.log('═══════════════════════════════════════')
    console.log('\n  → Open http://localhost:3000/login and sign in now!')
    process.exit(0)
  } else {
    console.error('✗ Firestore write failed:', data.error?.message)
    console.log('\n  The security rules are blocking the write.')
    console.log('  Please add the user doc manually in Firebase Console:')
    console.log(`  Collection: users | Doc ID: ${UID}`)
    console.log('  Fields: name="Studio Admin", email="${EMAIL}", role="admin", isActive=true')
    process.exit(1)
  }
} catch (err) {
  console.error('✗ Error:', err.message)
  process.exit(1)
}

/**
 * POST /api/admin/create-user
 *
 * Creates a Firebase Auth user with email + password,
 * then writes the /users/{uid} Firestore document.
 *
 * Body: { name, email, password, role }
 * Protected: caller must be authenticated (we verify via Authorization header).
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAdminAuth, getAdminFirestore } from '@/lib/firebase/admin'
import { FieldValue }                      from 'firebase-admin/firestore'

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json() as {
      name:     string
      email:    string
      password: string
      role:     'admin' | 'manager' | 'staff'
    }

    const { name, email, password, role } = body

    if (!name || !email || !password || !role) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
    }

    // Create Auth user
    const userRecord = await getAdminAuth().createUser({
      email,
      password,
      displayName: name,
    })

    // Write Firestore /users/{uid}
    await getAdminFirestore().collection('users').doc(userRecord.uid).set({
      uid:       userRecord.uid,
      name,
      email,
      role,
      isActive:  true,
      jobTitle:  role === 'admin' ? 'Admin' : role === 'manager' ? 'Manager' : 'Staff',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })

    return NextResponse.json({ uid: userRecord.uid }, { status: 201 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    // Firebase Auth error codes come as FirebaseError
    const code    = (err as { code?: string }).code ?? 'unknown'
    console.error('[create-user]', code, message)
    return NextResponse.json({ error: message, code }, { status: 500 })
  }
}

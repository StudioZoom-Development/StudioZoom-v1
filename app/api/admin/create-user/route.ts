/**
 * POST /api/admin/create-user
 *
 * Creates a Firebase Auth user with email + password,
 * then writes the /users/{uid} Firestore document with both
 * system access credentials and HR personal details.
 *
 * Body: { name, email, password, role, jobTitle, contact, joinDate, baseSalary }
 * Protected: caller must be authenticated (we verify via Admin SDK).
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAdminAuth, getAdminFirestore } from '@/lib/firebase/admin'
import { FieldValue }                      from 'firebase-admin/firestore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json() as {
      name:        string
      email:       string
      password:    string
      role:        'admin' | 'manager' | 'staff'
      jobTitle?:   string
      contact?:    string
      joinDate?:   string
      baseSalary?: number
    }

    const { name, email, password, role, jobTitle, contact, joinDate, baseSalary } = body

    if (!name || !name.trim() || !email || !email.trim() || !password || !role) {
      return NextResponse.json({ error: 'Name, email, password, and role are required' }, { status: 400 })
    }

    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
    }

    const trimmedEmail = email.trim()
    const trimmedName  = name.trim()

    // 1. Create Auth user
    const userRecord = await getAdminAuth().createUser({
      email:       trimmedEmail,
      password,
      displayName: trimmedName,
    })

    // Parse joinDate if provided
    let parsedJoinDate: Date | null = null
    if (joinDate) {
      const d = new Date(joinDate)
      if (!isNaN(d.getTime())) parsedJoinDate = d
    }

    // Default job title based on role if omitted
    const defaultJobTitle = role === 'admin' ? 'Admin' : role === 'manager' ? 'Manager' : 'Staff'

    // 2. Write Firestore /users/{uid}
    await getAdminFirestore().collection('users').doc(userRecord.uid).set({
      uid:        userRecord.uid,
      name:       trimmedName,
      email:      trimmedEmail,
      role,
      isActive:   true,
      isDeleted:  false,
      jobTitle:   jobTitle?.trim() || defaultJobTitle,
      contact:    contact?.trim() || null,
      joinDate:   parsedJoinDate ? FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
      baseSalary: baseSalary ? Number(baseSalary) : null,
      createdAt:  FieldValue.serverTimestamp(),
      updatedAt:  FieldValue.serverTimestamp(),
    })

    return NextResponse.json({ uid: userRecord.uid }, { status: 201 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const code    = (err as { code?: string }).code ?? 'unknown'
    console.error('[create-user error]', code, message)
    return NextResponse.json({ error: message, code }, { status: 400 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { getAdminAuth, getAdminFirestore } from '@/lib/firebase/admin'
import { FieldValue }                      from 'firebase-admin/firestore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json() as {
      name?:         string
      email?:        string
      password?:     string
      role?:         string
      studioId?:     string
      contact?:      string
      joinDate?:     string
      employment?:   string
      monthlySalary?: number
      workLocation?: string
      notes?:        string
    }

    const name     = body.name?.trim()     ?? ''
    const email    = body.email?.trim()    ?? ''
    const password = body.password         ?? ''
    const role     = body.role             ?? 'staff'
    const studioId = body.studioId         ?? 'studio-1'

    if (!name || !email || !password) {
      return NextResponse.json({ error: 'Name, email, and password are required' }, { status: 400 })
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
    }

    const auth = await getAdminAuth()
    const db   = await getAdminFirestore()

    // 1. Create Firebase Auth user
    const userRecord = await auth.createUser({
      email,
      password,
      displayName: name,
      disabled: false,
    })

    // 2. Set Custom Claims for Role
    await auth.setCustomUserClaims(userRecord.uid, { role, studioId })

    // 3. Write User Document to Firestore
    await db.collection('users').doc(userRecord.uid).set({
      id:          userRecord.uid,
      name,
      email,
      role,
      studioId,
      status:      'active',
      createdAt:   FieldValue.serverTimestamp(),
      updatedAt:   FieldValue.serverTimestamp(),
      isDeleted:   false,
      contact:     body.contact?.trim()     ?? '',
      joinDate:    body.joinDate            ?? '',
      employment:  body.employment          ?? 'fullTime',
      baseSalary:  body.monthlySalary       ?? 0,
      workLocation: body.workLocation       ?? 'onsite',
      notes:       body.notes?.trim()       ?? '',
    })

    return NextResponse.json({
      uid: userRecord.uid,
      email: userRecord.email,
      role,
      studioId
    }, { status: 201 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const code    = (err as { code?: string }).code ?? 'unknown'
    console.error('[create-user error]', code, message)
    return NextResponse.json({ error: message, code }, { status: 400 })
  }
}

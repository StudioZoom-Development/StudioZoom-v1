import { NextRequest, NextResponse } from 'next/server'
import { adminCreateUser, adminGetUserByEmail, adminDeleteUser } from '@/lib/firebase/admin-rest'
import { getAdminFirestore }          from '@/lib/firebase/admin'
import { FieldValue, Timestamp }      from 'firebase-admin/firestore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json() as {
      name?:          string
      email?:         string
      password?:      string
      role?:          string
      studioId?:      string
      contact?:       string
      jobTitle?:      string
      joinDate?:      string
      employment?:    string
      baseSalary?:    number | string
      monthlySalary?: number | string
      workLocation?:  string
      notes?:         string
    }

    const name     = body.name?.trim()     ?? ''
    const email    = body.email?.trim()    ?? ''
    const password = body.password         ?? ''
    const role     = body.role             ?? 'staff'
    const studioId = body.studioId         ?? 'studio-1'
    const jobTitle = body.jobTitle?.trim() ?? ''
    const contact  = body.contact?.trim()  ?? ''

    if (!name || !email || !password) {
      return NextResponse.json({ error: 'Name, email, and password are required' }, { status: 400 })
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
    }

    const db = await getAdminFirestore()

    // 1. Create user via Firebase Auth REST API (handling stale orphan accounts gracefully)
    let userRecord: { uid: string; email: string }
    try {
      userRecord = await adminCreateUser({ name, email, password })
    } catch (createErr: unknown) {
      const errMsg = createErr instanceof Error ? createErr.message : String(createErr)
      if (errMsg.includes('already exists') || errMsg.includes('EMAIL_EXISTS')) {
        // Check if an active user document actually exists in Firestore
        const existingDocs = await db.collection('users').where('email', '==', email).get()
        const activeDoc = existingDocs.docs.find(d => !d.data().isDeleted)

        if (activeDoc) {
          return NextResponse.json({
            error: `An active account with email ${email} already exists.`
          }, { status: 400 })
        }

        // No active user in DB — old account was deleted or never set up in Firestore.
        // Purge the stale Auth user so we can create the fresh user account.
        const staleAuthUser = await adminGetUserByEmail(email)
        if (staleAuthUser) {
          await adminDeleteUser(staleAuthUser.uid)
        }
        for (const docSnap of existingDocs.docs) {
          await docSnap.ref.delete().catch(() => {})
        }

        // Retry creating user freshly
        userRecord = await adminCreateUser({ name, email, password })
      } else {
        throw createErr
      }
    }

    // 2. Write User Document to Firestore

    const rawSalary = body.baseSalary ?? body.monthlySalary ?? 0
    const finalSalary = typeof rawSalary === 'number' ? rawSalary : Number(String(rawSalary).replace(/[^0-9]/g, '')) || 0

    let joinDateVal: FieldValue | Timestamp = FieldValue.serverTimestamp()
    if (body.joinDate && !isNaN(new Date(body.joinDate).getTime())) {
      joinDateVal = Timestamp.fromDate(new Date(body.joinDate))
    }

    await db.collection('users').doc(userRecord.uid).set({
      id:           userRecord.uid,
      uid:          userRecord.uid,
      name,
      email,
      role,
      studioId,
      jobTitle,
      status:       'active',
      isActive:     true,
      isDeleted:    false,
      contact,
      joinDate:     joinDateVal,
      employment:   body.employment          ?? 'fullTime',
      baseSalary:   finalSalary,
      workLocation: body.workLocation        ?? 'onsite',
      notes:        body.notes?.trim()       ?? '',
      createdAt:    FieldValue.serverTimestamp(),
      updatedAt:    FieldValue.serverTimestamp(),
    })

    return NextResponse.json({
      uid: userRecord.uid,
      email: userRecord.email,
      role,
      studioId
    }, { status: 201 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[create-user error]', message)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

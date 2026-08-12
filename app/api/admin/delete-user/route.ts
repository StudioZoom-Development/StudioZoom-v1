import { NextRequest, NextResponse } from 'next/server'
import { adminDeleteUser }            from '@/lib/firebase/admin-rest'
import { getAdminFirestore }          from '@/lib/firebase/admin'
import { FieldValue }                 from 'firebase-admin/firestore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { uid } = await req.json() as { uid: string }

    if (!uid) {
      return NextResponse.json({ error: 'uid is required' }, { status: 400 })
    }

    // 1. Try deleting user from Firebase Auth via Admin REST (graceful if service account missing)
    try {
      await adminDeleteUser(uid)
    } catch (authErr) {
      console.warn('[delete-user] Auth delete skipped/warning:', authErr instanceof Error ? authErr.message : authErr)
    }

    // 2. Soft-delete user document in Firestore (never hard delete)
    try {
      const db = await getAdminFirestore()
      await db.collection('users').doc(uid).update({
        isDeleted: true,
        status:    'inactive',
        updatedAt: FieldValue.serverTimestamp(),
      })
      return NextResponse.json({ success: true, uid }, { status: 200 })
    } catch (dbErr) {
      const msg = dbErr instanceof Error ? dbErr.message : 'Unknown DB error'
      console.warn('[delete-user] Admin Firestore error:', msg)
      return NextResponse.json({ error: msg, fallbackRequired: true }, { status: 400 })
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}


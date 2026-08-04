import { NextRequest, NextResponse } from 'next/server'
import { getAdminAuth, getAdminFirestore } from '@/lib/firebase/admin'
import { FieldValue }                       from 'firebase-admin/firestore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { uid } = await req.json() as { uid: string }

    if (!uid) {
      return NextResponse.json({ error: 'uid is required' }, { status: 400 })
    }

    const auth = await getAdminAuth()
    const db   = await getAdminFirestore()

    // 1. Disable user in Firebase Auth so login token cannot be issued
    try {
      await auth.updateUser(uid, { disabled: true })
    } catch (err: unknown) {
      console.warn('[deactivate-user] Auth disable skipped:', (err as { message?: string }).message)
    }

    // 2. Soft-delete user in Firestore (/users/{uid})
    await db.collection('users').doc(uid).update({
      isDeleted: true,
      status: 'inactive',
      updatedAt: FieldValue.serverTimestamp(),
    })

    return NextResponse.json({ success: true, uid }, { status: 200 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

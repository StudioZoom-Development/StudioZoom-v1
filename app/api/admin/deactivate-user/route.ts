import { NextRequest, NextResponse } from 'next/server'
import { adminDisableUser }           from '@/lib/firebase/admin-rest'
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

    await adminDisableUser(uid)

    const db = await getAdminFirestore()
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

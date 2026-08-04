import { NextRequest, NextResponse } from 'next/server'
import { getAdminAuth, getAdminFirestore } from '@/lib/firebase/admin'

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

    // Hard-delete Firebase Auth account — try catch if user doesn't exist in Auth
    try {
      await auth.deleteUser(uid)
    } catch (err: unknown) {
      console.warn('[delete-user] Auth delete skipped:', (err as { message?: string }).message)
    }

    // Hard-delete Firestore /users/{uid}
    await db.collection('users').doc(uid).delete()

    return NextResponse.json({ success: true, uid }, { status: 200 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

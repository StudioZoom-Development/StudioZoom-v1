/**
 * POST /api/admin/delete-user
 *
 * PERMANENTLY deletes the Firebase Auth account and hard-deletes
 * the /users/{uid} Firestore document. This cannot be undone.
 *
 * Body: { uid }
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAdminAuth, getAdminFirestore } from '@/lib/firebase/admin'

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { uid } = await req.json() as { uid: string }

    if (!uid) {
      return NextResponse.json({ error: 'uid is required' }, { status: 400 })
    }

    // Hard-delete Firebase Auth account — permanent, cannot be undone
    await getAdminAuth().deleteUser(uid)

    // Hard-delete Firestore /users/{uid}
    await getAdminFirestore().collection('users').doc(uid).delete()

    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const code    = (err as { code?: string }).code ?? 'unknown'
    console.error('[delete-user]', code, message)
    return NextResponse.json({ error: message, code }, { status: 500 })
  }
}

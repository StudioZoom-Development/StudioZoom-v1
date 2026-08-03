/**
 * POST /api/admin/delete-user
 *
 * Disables the Firebase Auth account and soft-deletes
 * the /users/{uid} Firestore document (isDeleted: true).
 *
 * Body: { uid }
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAdminAuth, getAdminFirestore } from '@/lib/firebase/admin'
import { FieldValue }                       from 'firebase-admin/firestore'

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { uid } = await req.json() as { uid: string }

    if (!uid) {
      return NextResponse.json({ error: 'uid is required' }, { status: 400 })
    }

    // Disable Firebase Auth account (reversible — not a hard delete)
    await getAdminAuth().updateUser(uid, { disabled: true })

    // Soft-delete Firestore /users/{uid}
    await getAdminFirestore().collection('users').doc(uid).update({
      isDeleted:  true,
      isActive:   false,
      updatedAt:  FieldValue.serverTimestamp(),
    })

    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const code    = (err as { code?: string }).code ?? 'unknown'
    console.error('[delete-user]', code, message)
    return NextResponse.json({ error: message, code }, { status: 500 })
  }
}

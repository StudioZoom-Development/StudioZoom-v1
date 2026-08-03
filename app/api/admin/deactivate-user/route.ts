/**
 * POST /api/admin/deactivate-user
 *
 * Disables the Firebase Auth account (user cannot log in)
 * and sets isActive: false on /users/{uid} in Firestore.
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

    // Disable Firebase Auth account — try catch if user doesn't exist in Auth
    try {
      await getAdminAuth().updateUser(uid, { disabled: true })
    } catch (err: unknown) {
      console.warn('[deactivate-user] Auth update skipped:', (err as { message?: string }).message)
    }

    // Mark inactive in Firestore
    await getAdminFirestore().collection('users').doc(uid).update({
      isActive:  false,
      updatedAt: FieldValue.serverTimestamp(),
    })

    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const code    = (err as { code?: string }).code ?? 'unknown'
    console.error('[deactivate-user]', code, message)
    return NextResponse.json({ error: message, code }, { status: 400 })
  }
}

/**
 * POST /api/admin/reset-password
 *
 * Generates a Firebase password reset link for a given email
 * and returns it so the admin can share it with the user.
 *
 * Body: { email }
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAdminAuth }               from '@/lib/firebase/admin'

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { email } = await req.json() as { email: string }

    if (!email || !email.trim()) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    const trimmedEmail = email.trim()
    const auth = getAdminAuth()

    // 1. Verify user exists in Firebase Auth first
    try {
      await auth.getUserByEmail(trimmedEmail)
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? 'unknown'
      if (code === 'auth/user-not-found') {
        return NextResponse.json({
          error: `No Auth user exists for ${trimmedEmail}. Click "+ Add user" to create their account first.`,
          code
        }, { status: 400 })
      }
      // Re-throw if it's another auth error
      throw err
    }

    // 2. Generate password reset link
    const link = await auth.generatePasswordResetLink(trimmedEmail)

    return NextResponse.json({ link }, { status: 200 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const code    = (err as { code?: string }).code ?? 'unknown'
    console.error('[reset-password error]', code, message)
    return NextResponse.json({ error: message, code }, { status: 400 })
  }
}


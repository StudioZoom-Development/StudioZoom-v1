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

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    const link = await getAdminAuth().generatePasswordResetLink(email)

    return NextResponse.json({ link }, { status: 200 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const code    = (err as { code?: string }).code ?? 'unknown'
    console.error('[reset-password]', code, message)
    return NextResponse.json({ error: message, code }, { status: 500 })
  }
}

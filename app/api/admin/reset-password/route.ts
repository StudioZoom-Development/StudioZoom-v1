import { NextRequest, NextResponse } from 'next/server'
import { adminSendPasswordReset }    from '@/lib/firebase/admin-rest'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { email } = await req.json() as { email: string }

    if (!email || !email.trim()) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    const result = await adminSendPasswordReset(email.trim())

    return NextResponse.json({
      success: true,
      message: `Password reset email sent to ${result.email}`,
      link: `Password reset link sent to ${result.email}`,
    }, { status: 200 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[reset-password error]', message)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

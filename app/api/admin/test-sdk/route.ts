import { NextResponse } from 'next/server'
import { adminSendPasswordReset } from '@/lib/firebase/admin-rest'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(): Promise<NextResponse> {
  try {
    const raw = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT
    if (!raw) {
      return NextResponse.json({ ok: false, error: 'FIREBASE_ADMIN_SERVICE_ACCOUNT env var is missing' }, { status: 500 })
    }

    const test = await adminSendPasswordReset('mani@gmail.com')
    return NextResponse.json({
      ok: true,
      message: 'Firebase Admin REST API client works PERFECTLY!',
      testResult: test,
    }, { status: 200 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const stack   = err instanceof Error ? err.stack   : null
    return NextResponse.json({
      ok: false,
      error: message,
      stack,
    }, { status: 500 })
  }
}

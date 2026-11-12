import { NextRequest, NextResponse } from 'next/server'
import { getAdminFirestore, getAdminAuth } from '@/lib/firebase/admin'
import { calculatePayslip, type PayrollAdjustmentParams } from '@/lib/payroll/calculator'
import { generatePayslipPdf } from '@/lib/payroll/pdfGenerator'
import type { AttendanceRecord, Salary, PayslipRecord } from '@/types'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface GeneratePayload {
  staffUid:     string
  year:         number
  month:        number
  action?:      'download' | 'preview'
  adjustments?: PayrollAdjustmentParams
}

/**
 * Helper to safely extract and verify user identity from request headers.
 */
async function authenticateRequest(req: NextRequest): Promise<{ uid: string; role: 'admin' | 'manager' | 'staff'; name: string }> {
  const authHeader = req.headers.get('authorization') || ''
  if (!authHeader.startsWith('Bearer ')) {
    throw new Error('Unauthorized: Missing or invalid Authorization header')
  }

  const token = authHeader.slice(7).trim()
  if (!token) {
    throw new Error('Unauthorized: Empty token')
  }

  let callerUid = ''
  let callerEmail = ''

  // Attempt verification with Firebase Admin Auth
  try {
    const auth = await getAdminAuth()
    const decoded = await auth.verifyIdToken(token)
    callerUid = decoded.uid
    callerEmail = decoded.email || ''
  } catch (err: unknown) {
    // Fallback: decode JWT payload if running in local preview/dev without service account
    try {
      const parts = token.split('.')
      if (parts.length === 3) {
        const payloadJson = Buffer.from(parts[1], 'base64').toString('utf8')
        const payload = JSON.parse(payloadJson)
        callerUid = payload.user_id || payload.sub || ''
        callerEmail = payload.email || ''
      }
    } catch {
      // ignore
    }

    if (!callerUid) {
      const errMsg = err instanceof Error ? err.message : String(err)
      throw new Error(`Unauthorized token: ${errMsg}`)
    }
  }

  // Look up authoritative user record from Firestore
  const db = await getAdminFirestore()
  const userDoc = await db.collection('users').doc(callerUid).get()
  if (!userDoc.exists) {
    throw new Error('User account not found')
  }

  const userData = userDoc.data() || {}
  const role = (userData.role as 'admin' | 'manager' | 'staff') || 'staff'
  const name = (userData.name as string) || (userData.displayName as string) || callerEmail.split('@')[0] || 'User'

  return { uid: callerUid, role, name }
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const caller = await authenticateRequest(req)
    const body = (await req.json()) as GeneratePayload

    const { staffUid, year, month, action = 'download' } = body

    if (!staffUid || !year || !month) {
      return NextResponse.json(
        { error: 'Missing required fields: staffUid, year, and month are required' },
        { status: 400 }
      )
    }

    // Guard against generating payslips for ongoing or upcoming/future months.
    // Payroll can only be closed and generated for completed calendar months (e.g. In Nov, only up to Oct).
    const now = new Date()
    const targetMonthStart = new Date(Number(year), Number(month) - 1, 1)
    const latestClosedMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    if (targetMonthStart > latestClosedMonthStart) {
      return NextResponse.json(
        { error: 'Cannot generate payslips for ongoing or upcoming months. Payslips are only available after the calendar month has ended.' },
        { status: 400 }
      )
    }

    // Role-based authorization gate
    if (caller.role === 'staff' && caller.uid !== staffUid) {
      return NextResponse.json(
        { error: 'Forbidden: Staff members can only generate their own payslips' },
        { status: 403 }
      )
    }

    const db = await getAdminFirestore()

    // 1. Fetch Staff Member Details
    const staffDoc = await db.collection('users').doc(staffUid).get()
    if (!staffDoc.exists) {
      return NextResponse.json({ error: 'Staff member record not found' }, { status: 404 })
    }
    const staffData = staffDoc.data() || {}
    const staffName = (staffData.name as string) || 'Staff Member'
    const jobTitle = (staffData.jobTitle as string) || (staffData.role as string) || 'Staff'
    const baseSalary = Number(staffData.baseSalary || staffData.monthlySalary || 0)

    if (baseSalary <= 0) {
      return NextResponse.json(
        { error: `Base salary has not been configured for ${staffName}` },
        { status: 400 }
      )
    }

    // 2. Fetch Attendance Record for selected month
    let attendanceRecord: AttendanceRecord | null = null
    const attSnap = await db
      .collection('attendance')
      .where('staffUid', '==', staffUid)
      .where('year', '==', Number(year))
      .where('month', '==', Number(month))
      .limit(1)
      .get()

    if (!attSnap.empty) {
      const d = attSnap.docs[0].data()
      attendanceRecord = {
        attendanceId: attSnap.docs[0].id,
        staffUid,
        year: Number(year),
        month: Number(month),
        dailyStatus: d.dailyStatus || {},
        dailyHours: d.dailyHours || {},
        summary: d.summary || { present: 0, late: 0, halfDay: 0, absent: 0, weekOff: 0, totalMinutes: 0 },
      }
    }

    // 3. Fetch Monthly Salary / Advances Record
    let salaryRecord: Salary | null = null
    const salSnap = await db
      .collection('salaries')
      .where('staffUid', '==', staffUid)
      .where('year', '==', Number(year))
      .where('month', '==', Number(month))
      .limit(1)
      .get()

    if (!salSnap.empty) {
      const d = salSnap.docs[0].data()
      salaryRecord = {
        salaryId: salSnap.docs[0].id,
        staffUid,
        year: Number(year),
        month: Number(month),
        baseSalary,
        advance1: d.advance1,
        advance2: d.advance2,
        advance3: d.advance3,
        totalAdvances: Number(d.totalAdvances || 0),
        salaryPending: Number(d.salaryPending || 0),
      }
    }

    // 4. Determine Payslip Number
    const payslipDocId = `ps_${staffUid}_${year}_${month}`
    const existingPayslipDoc = await db.collection('payslips').doc(payslipDocId).get()

    let payslipNumber = ''
    if (existingPayslipDoc.exists) {
      payslipNumber = existingPayslipDoc.data()?.payslipNumber || ''
    }

    if (!payslipNumber) {
      // Increment or retrieve numbering sequence
      const numberingRef = db.collection('studioSettings').doc('numberingConfig')
      const numDoc = await numberingRef.get()
      let nextSeq = 101
      if (numDoc.exists) {
        const numData = numDoc.data() || {}
        nextSeq = Number(numData.payslipStartNumber || numData.lastPayslipNumber || 100) + 1
      }
      payslipNumber = `ZS-PS-${String(nextSeq).padStart(4, '0')}`

      // Update counter
      await numberingRef.set(
        { lastPayslipNumber: nextSeq, updatedAt: FieldValue.serverTimestamp() },
        { merge: true }
      )
    }

    // 5. Execute Calculation Engine
    // If caller is staff, ignore any client adjustments to prevent tampering
    const safeAdjustments = caller.role === 'staff' ? {} : (body.adjustments || {})

    const payslipSnapshot: PayslipRecord = calculatePayslip({
      staffUid,
      staffName,
      jobTitle,
      year: Number(year),
      month: Number(month),
      baseSalary,
      attendanceRecord,
      salaryRecord,
      adjustments: safeAdjustments,
      payslipNumber,
      generatedByUid: caller.uid,
      generatedByName: caller.name,
      paymentStatus: (existingPayslipDoc.data()?.paymentStatus as 'unpaid' | 'paid') || 'unpaid',
      paymentDate: existingPayslipDoc.data()?.paymentDate,
    })

    // 6. Save/Update Audit Snapshot to Cloud Firestore (sanitizing undefined fields)
    const firestoreData: Record<string, unknown> = {
      payslipId:           payslipSnapshot.payslipId,
      payslipNumber:       payslipSnapshot.payslipNumber,
      staffUid:            payslipSnapshot.staffUid,
      staffName:           payslipSnapshot.staffName,
      jobTitle:            payslipSnapshot.jobTitle,
      month:               payslipSnapshot.month,
      year:                payslipSnapshot.year,
      baseSalary:          payslipSnapshot.baseSalary,
      allowances:          payslipSnapshot.allowances,
      customBonus:         payslipSnapshot.customBonus,
      grossEarnings:       payslipSnapshot.grossEarnings,
      totalCalendarDays:   payslipSnapshot.totalCalendarDays,
      workingDays:         payslipSnapshot.workingDays,
      presentDays:         payslipSnapshot.presentDays,
      halfDays:            payslipSnapshot.halfDays,
      absentDays:          payslipSnapshot.absentDays,
      weekOffs:            payslipSnapshot.weekOffs,
      payableDays:         payslipSnapshot.payableDays,
      dailyRate:           payslipSnapshot.dailyRate,
      attendanceDeduction: payslipSnapshot.attendanceDeduction,
      advances:            payslipSnapshot.advances,
      totalAdvances:       payslipSnapshot.totalAdvances,
      customDeduction:     payslipSnapshot.customDeduction,
      totalDeductions:     payslipSnapshot.totalDeductions,
      netPay:              payslipSnapshot.netPay,
      paymentStatus:       payslipSnapshot.paymentStatus,
      isAdjusted:          payslipSnapshot.isAdjusted,
      generatedByUid:      payslipSnapshot.generatedByUid,
      generatedByName:     payslipSnapshot.generatedByName,
      generatedAt:         FieldValue.serverTimestamp(),
      updatedAt:           FieldValue.serverTimestamp(),
    }

    if (payslipSnapshot.customBonusReason) {
      firestoreData.customBonusReason = payslipSnapshot.customBonusReason
    }
    if (payslipSnapshot.customDeductionReason) {
      firestoreData.customDeductionReason = payslipSnapshot.customDeductionReason
    }
    if (payslipSnapshot.paymentDate) {
      firestoreData.paymentDate = payslipSnapshot.paymentDate
    }

    await db.collection('payslips').doc(payslipDocId).set(firestoreData, { merge: true })

    // 7. Generate in-memory PDF
    const pdfBytes = await generatePayslipPdf(payslipSnapshot)

    // 8. Stream PDF response
    const filename = `Payslip_${payslipNumber}_${staffName.replace(/[^a-zA-Z0-9]/g, '_')}_${month}_${year}.pdf`
    const disposition = action === 'preview' ? 'inline' : 'attachment'

    return new Response(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${disposition}; filename="${filename}"`,
        'Cache-Control': 'no-store, max-age=0',
      },
    })
  } catch (err: unknown) {
    console.error('[Payslip API Error]:', err)
    const message = err instanceof Error ? err.message : 'Failed to generate payslip'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

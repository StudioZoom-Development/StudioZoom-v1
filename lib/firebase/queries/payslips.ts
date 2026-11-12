import {
  collection,
  query,
  where,
  onSnapshot,
  Timestamp,
} from 'firebase/firestore'
import { db, auth } from '@/lib/firebase/config'
import type { PayslipRecord } from '@/types'
import type { PayrollAdjustmentParams } from '@/lib/payroll/calculator'

function mapDocToPayslipRecord(id: string, data: Record<string, unknown>): PayslipRecord {
  let generatedAt = new Date()
  if (data.generatedAt instanceof Timestamp) {
    generatedAt = data.generatedAt.toDate()
  } else if (data.generatedAt instanceof Date) {
    generatedAt = data.generatedAt
  }

  return {
    payslipId:           id,
    payslipNumber:       (data.payslipNumber as string) || 'ZS-PS-0000',
    staffUid:            (data.staffUid as string) || '',
    staffName:           (data.staffName as string) || 'Staff Member',
    jobTitle:            (data.jobTitle as string) || 'Staff',
    month:               Number(data.month) || 1,
    year:                Number(data.year) || new Date().getFullYear(),
    baseSalary:          Number(data.baseSalary) || 0,
    allowances:          Number(data.allowances) || 0,
    customBonus:         Number(data.customBonus) || 0,
    customBonusReason:   (data.customBonusReason as string) || undefined,
    grossEarnings:       Number(data.grossEarnings) || 0,
    totalCalendarDays:   Number(data.totalCalendarDays) || 30,
    workingDays:         Number(data.workingDays) || 26,
    presentDays:         Number(data.presentDays) || 0,
    halfDays:            Number(data.halfDays) || 0,
    absentDays:          Number(data.absentDays) || 0,
    weekOffs:            Number(data.weekOffs) || 4,
    payableDays:         Number(data.payableDays) || 0,
    dailyRate:           Number(data.dailyRate) || 0,
    attendanceDeduction: Number(data.attendanceDeduction) || 0,
    advances:            Array.isArray(data.advances) ? (data.advances as PayslipRecord['advances']) : [],
    totalAdvances:       Number(data.totalAdvances) || 0,
    customDeduction:     Number(data.customDeduction) || 0,
    customDeductionReason: (data.customDeductionReason as string) || undefined,
    totalDeductions:     Number(data.totalDeductions) || 0,
    netPay:              Number(data.netPay) || 0,
    paymentStatus:       (data.paymentStatus as 'unpaid' | 'paid') || 'unpaid',
    paymentDate:         (data.paymentDate as string) || undefined,
    generatedAt,
    generatedByUid:      (data.generatedByUid as string) || '',
    generatedByName:     (data.generatedByName as string) || '',
    isAdjusted:          Boolean(data.isAdjusted),
  }
}

/**
 * Subscribe to all payslips generated for a specific month and year.
 */
export function subscribeMonthlyPayslips(
  year: number,
  month: number,
  onUpdate: (records: PayslipRecord[]) => void,
  onError?: (err: Error) => void
): () => void {
  const col = collection(db, 'payslips')
  const q = query(col, where('year', '==', year), where('month', '==', month))

  return onSnapshot(
    q,
    (snap) => {
      const records = snap.docs.map((d) => mapDocToPayslipRecord(d.id, d.data()))
      onUpdate(records)
    },
    (err) => {
      console.error('[subscribeMonthlyPayslips Error]:', err)
      if (onError) onError(err)
    }
  )
}

/**
 * Subscribe to a specific staff member's complete payslip history across all months.
 */
export function subscribeStaffPayslipHistory(
  staffUid: string,
  onUpdate: (records: PayslipRecord[]) => void,
  onError?: (err: Error) => void
): () => void {
  const col = collection(db, 'payslips')
  const q = query(col, where('staffUid', '==', staffUid))

  return onSnapshot(
    q,
    (snap) => {
      const records = snap.docs.map((d) => mapDocToPayslipRecord(d.id, d.data()))
      // Sort newest first
      records.sort((a, b) => b.year - a.year || b.month - a.month)
      onUpdate(records)
    },
    (err) => {
      console.error('[subscribeStaffPayslipHistory Error]:', err)
      if (onError) onError(err)
    }
  )
}

/**
 * Calls the secure backend API route to generate or preview the payslip PDF.
 */
export async function requestGeneratePayslip(params: {
  staffUid:     string
  year:         number
  month:        number
  action?:      'download' | 'preview'
  adjustments?: PayrollAdjustmentParams
}): Promise<{ blob: Blob; filename: string }> {
  const currentUser = auth.currentUser
  if (!currentUser) {
    throw new Error('User is not signed in')
  }

  const token = await currentUser.getIdToken()
  const res = await fetch('/api/hrms/payslips/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(params),
  })

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ error: 'Failed to generate payslip' }))
    throw new Error(errorData.error || `Server returned ${res.status}`)
  }

  const contentDisposition = res.headers.get('content-disposition') || ''
  let filename = `Payslip_${params.staffUid}_${params.month}_${params.year}.pdf`
  const filenameMatch = contentDisposition.match(/filename="?([^";]+)"?/)
  if (filenameMatch && filenameMatch[1]) {
    filename = filenameMatch[1]
  }

  const blob = await res.blob()
  return { blob, filename }
}

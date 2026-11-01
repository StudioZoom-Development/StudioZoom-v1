import { getDaysInMonth } from 'date-fns'
import type { AttendanceRecord, Salary, PayslipRecord, PayslipAdvanceItem } from '@/types'

export interface PayrollAdjustmentParams {
  applyAttendanceDeduction?: boolean
  customAttendanceDeduction?: number
  // Editable attendance counts
  customPresentDays?:        number
  customLeaveDays?:          number
  customHalfDays?:           number
  customLateDays?:           number
  customAbsentDays?:         number
  // Advances & adjustments
  advanceDeduction?:         number
  customBonus?:              number
  customBonusReason?:        string
  customDeduction?:          number
  customDeductionReason?:    string
  allowances?:               number
}

export interface CalculatePayslipInput {
  staffUid:         string
  staffName:        string
  jobTitle?:        string
  year:             number
  month:            number // 1-12
  baseSalary:       number
  attendanceRecord?: AttendanceRecord | null
  salaryRecord?:     Salary | null
  adjustments?:      PayrollAdjustmentParams
  payslipNumber?:    string
  generatedByUid?:   string
  generatedByName?:  string
  paymentStatus?:    'unpaid' | 'paid'
  paymentDate?:      string
}

/**
 * Format a numeric amount into Indian Rupee string: e.g. ₹25,097 or -₹1,500
 */
export function formatIndianCurrency(amount?: number | null): string {
  if (amount === undefined || amount === null || isNaN(amount)) return '₹0'
  const isNeg = amount < 0
  const absVal = Math.round(Math.abs(amount))
  const formatted = absVal.toLocaleString('en-IN')
  return isNeg ? `-₹${formatted}` : `₹${formatted}`
}

/**
 * Format a numeric amount into standard PDF representation: e.g. Rs. 25,097
 */
export function formatPdfCurrency(amount?: number | null): string {
  if (amount === undefined || amount === null || isNaN(amount)) return 'Rs. 0'
  const isNeg = amount < 0
  const absVal = Math.round(Math.abs(amount))
  const formatted = absVal.toLocaleString('en-IN')
  return isNeg ? `-Rs. ${formatted}` : `Rs. ${formatted}`
}

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen'
]

const TENS = [
  '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'
]

function convertBelowThousand(n: number): string {
  let str = ''
  if (n >= 100) {
    str += ONES[Math.floor(n / 100)] + ' Hundred '
    n %= 100
  }
  if (n >= 20) {
    const tensVal = TENS[Math.floor(n / 10)]
    const rem = n % 10
    if (rem > 0) {
      str += tensVal + '-' + ONES[rem] + ' '
    } else {
      str += tensVal + ' '
    }
    n = 0
  } else if (n > 0) {
    str += ONES[n] + ' '
  }
  return str.trim()
}

/**
 * Convert a positive integer to Indian English words format (Crores, Lakhs, Thousands, Hundreds).
 * Example: 25097 -> "Rupees Twenty-Five Thousand Ninety-Seven Only"
 */
export function numberToWordsINR(amount: number): string {
  const rounded = Math.round(Math.abs(amount))
  if (rounded === 0) return 'Rupees Zero Only'

  let remaining = rounded
  let words = ''

  const crore = Math.floor(remaining / 10000000)
  if (crore > 0) {
    words += convertBelowThousand(crore) + ' Crore '
    remaining %= 10000000
  }

  const lakh = Math.floor(remaining / 100000)
  if (lakh > 0) {
    words += convertBelowThousand(lakh) + ' Lakh '
    remaining %= 100000
  }

  const thousand = Math.floor(remaining / 1000)
  if (thousand > 0) {
    words += convertBelowThousand(thousand) + ' Thousand '
    remaining %= 1000
  }

  if (remaining > 0) {
    words += convertBelowThousand(remaining)
  }

  words = words.trim().replace(/\s+/g, ' ')
  return `Rupees ${words} Only`
}

/**
 * Pure calculation engine to evaluate full payslip figures based on attendance,
 * salary advances, base salary, and optional manager/admin overrides.
 */
export function calculatePayslip(input: CalculatePayslipInput): PayslipRecord {
  const {
    staffUid,
    staffName,
    jobTitle = 'Staff',
    year,
    month,
    baseSalary = 0,
    attendanceRecord,
    salaryRecord,
    adjustments = {},
    payslipNumber = 'ZS-PS-0000',
    generatedByUid = '',
    generatedByName = '',
    paymentStatus = 'unpaid',
    paymentDate,
  } = input

  // 1. Calendar days in the month
  const totalCalendarDays = getDaysInMonth(new Date(year, month - 1, 1))
  const dailyRate = totalCalendarDays > 0 ? baseSalary / totalCalendarDays : 0

  // 2. Attendance metrics
  let presentDays = 0
  let halfDays = 0
  let absentDays = 0
  let weekOffs = 0

  if (attendanceRecord?.summary) {
    presentDays = Number(attendanceRecord.summary.present || 0)
    halfDays = Number(attendanceRecord.summary.halfDay || 0)
    absentDays = Number(attendanceRecord.summary.absent || 0)
    weekOffs = Number(attendanceRecord.summary.weekOff || 0)
  } else if (attendanceRecord?.dailyStatus && Object.keys(attendanceRecord.dailyStatus).length > 0) {
    for (const status of Object.values(attendanceRecord.dailyStatus)) {
      if (status === 'P' || status === 'Permission') presentDays++
      else if (status === 'HalfDay') halfDays++
      else if (status === 'AB') absentDays++
      else if (status === 'WO') weekOffs++
    }
  } else {
    // Standard full attendance: calculate Sundays as week-offs
    for (let day = 1; day <= totalCalendarDays; day++) {
      const dayOfWeek = new Date(year, month - 1, day).getDay()
      if (dayOfWeek === 0) weekOffs++ // Sunday
    }
    presentDays = Math.max(0, totalCalendarDays - weekOffs)
    halfDays = 0
    absentDays = 0
  }

  let isAdjusted = false

  // Apply custom attendance overrides if provided
  if (adjustments.customPresentDays !== undefined && adjustments.customPresentDays >= 0) {
    if (adjustments.customPresentDays !== presentDays) isAdjusted = true
    presentDays = adjustments.customPresentDays
  }
  if (adjustments.customHalfDays !== undefined && adjustments.customHalfDays >= 0) {
    if (adjustments.customHalfDays !== halfDays) isAdjusted = true
    halfDays = adjustments.customHalfDays
  }
  if (adjustments.customAbsentDays !== undefined && adjustments.customAbsentDays >= 0) {
    if (adjustments.customAbsentDays !== absentDays) isAdjusted = true
    absentDays = adjustments.customAbsentDays
  }

  const workingDays = Math.max(0, totalCalendarDays - weekOffs)
  const payableDays = Math.max(0, totalCalendarDays - absentDays - halfDays * 0.5)

  // 3. Auto Attendance Deduction: (absentDays + 0.5 * halfDays) * dailyRate
  const autoAttendanceDeduction = Math.round((absentDays + halfDays * 0.5) * dailyRate)

  let attendanceDeduction = autoAttendanceDeduction

  if (adjustments.applyAttendanceDeduction === false) {
    attendanceDeduction = 0
    isAdjusted = true
  } else if (
    adjustments.customAttendanceDeduction !== undefined &&
    adjustments.customAttendanceDeduction >= 0
  ) {
    if (adjustments.customAttendanceDeduction !== autoAttendanceDeduction) {
      isAdjusted = true
    }
    attendanceDeduction = Math.round(adjustments.customAttendanceDeduction)
  }

  // 4. Advances from monthly salary record
  const advances: PayslipAdvanceItem[] = []
  if (salaryRecord?.advance1 && salaryRecord.advance1.amount > 0) {
    advances.push({
      label: 'Advance 1',
      amount: salaryRecord.advance1.amount,
      date: salaryRecord.advance1.date,
    })
  }
  if (salaryRecord?.advance2 && salaryRecord.advance2.amount > 0) {
    advances.push({
      label: 'Advance 2',
      amount: salaryRecord.advance2.amount,
      date: salaryRecord.advance2.date,
    })
  }
  if (salaryRecord?.advance3 && salaryRecord.advance3.amount > 0) {
    advances.push({
      label: 'Advance 3',
      amount: salaryRecord.advance3.amount,
      date: salaryRecord.advance3.date,
    })
  }

  const scheduledAdvances = advances.reduce((acc, curr) => acc + curr.amount, 0)
  let totalAdvances = scheduledAdvances

  if (adjustments.advanceDeduction !== undefined && adjustments.advanceDeduction >= 0) {
    if (adjustments.advanceDeduction !== scheduledAdvances) {
      isAdjusted = true
    }
    totalAdvances = Math.round(adjustments.advanceDeduction)
  }

  // 5. Allowances & Custom Bonus
  const allowances = adjustments.allowances ? Math.round(adjustments.allowances) : 0
  const customBonus = adjustments.customBonus ? Math.round(adjustments.customBonus) : 0
  const customBonusReason = adjustments.customBonusReason?.trim() || undefined
  if (customBonus > 0) isAdjusted = true

  const grossEarnings = baseSalary + allowances + customBonus

  // 6. Custom Deduction
  const customDeduction = adjustments.customDeduction ? Math.round(adjustments.customDeduction) : 0
  const customDeductionReason = adjustments.customDeductionReason?.trim() || undefined
  if (customDeduction > 0) isAdjusted = true

  // 7. Totals & Net Pay
  const totalDeductions = attendanceDeduction + totalAdvances + customDeduction
  const netPay = Math.max(0, Math.round(grossEarnings - totalDeductions))

  return {
    payslipId: `ps_${staffUid}_${year}_${month}`,
    payslipNumber,
    staffUid,
    staffName,
    jobTitle,
    month,
    year,
    baseSalary,
    allowances,
    customBonus,
    customBonusReason,
    grossEarnings,
    totalCalendarDays,
    workingDays,
    presentDays,
    halfDays,
    absentDays,
    weekOffs,
    payableDays,
    dailyRate: Math.round(dailyRate),
    attendanceDeduction,
    advances,
    totalAdvances,
    customDeduction,
    customDeductionReason,
    totalDeductions,
    netPay,
    paymentStatus,
    paymentDate,
    generatedAt: new Date(),
    generatedByUid,
    generatedByName,
    isAdjusted,
  }
}

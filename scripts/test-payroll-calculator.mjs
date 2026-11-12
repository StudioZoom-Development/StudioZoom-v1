import assert from 'node:assert'
import {
  calculatePayslip,
  formatIndianCurrency,
  formatPdfCurrency,
  numberToWordsINR,
} from '../lib/payroll/calculator.ts'

console.log('--- Testing Payroll Calculator ---')

// 1. Currency Formatting
assert.strictEqual(formatIndianCurrency(25000), '₹25,000')
assert.strictEqual(formatIndianCurrency(-1200), '-₹1,200')
assert.strictEqual(formatPdfCurrency(25097), 'Rs. 25,097')
assert.strictEqual(formatPdfCurrency(-500), '-Rs. 500')
console.log('✓ Currency formatting tests passed')

// 2. Number to words INR
assert.strictEqual(numberToWordsINR(25000), 'Rupees Twenty-Five Thousand Only')
assert.strictEqual(numberToWordsINR(25097), 'Rupees Twenty-Five Thousand Ninety-Seven Only')
assert.strictEqual(numberToWordsINR(100500), 'Rupees One Lakh Five Hundred Only')
console.log('✓ Number to words INR tests passed')

// 3. Calculation Test 1: Full attendance in October (31 days, ₹31,000 salary)
const p1 = calculatePayslip({
  staffUid: 'staff_1',
  staffName: 'Siva Prakash',
  jobTitle: 'Photographer',
  year: 2026,
  month: 10,
  baseSalary: 31000,
  attendanceRecord: {
    attendanceId: 'att_1',
    staffUid: 'staff_1',
    year: 2026,
    month: 10,
    dailyStatus: {},
    dailyHours: {},
    summary: { present: 27, late: 0, halfDay: 0, absent: 0, weekOff: 4, totalMinutes: 14580 },
  },
  salaryRecord: {
    salaryId: 'sal_1',
    staffUid: 'staff_1',
    year: 2026,
    month: 10,
    baseSalary: 31000,
  },
})

assert.strictEqual(p1.totalCalendarDays, 31)
assert.strictEqual(p1.dailyRate, 1000)
assert.strictEqual(p1.attendanceDeduction, 0)
assert.strictEqual(p1.totalDeductions, 0)
assert.strictEqual(p1.netPay, 31000)
console.log('✓ Full attendance test passed')

// 4. Calculation Test 2: 1 Absent day & 1 Half-Day in October (1.5 days lost @ ₹1,000/day = ₹1,500)
const p2 = calculatePayslip({
  staffUid: 'staff_1',
  staffName: 'Siva Prakash',
  year: 2026,
  month: 10,
  baseSalary: 31000,
  attendanceRecord: {
    attendanceId: 'att_1',
    staffUid: 'staff_1',
    year: 2026,
    month: 10,
    dailyStatus: {},
    dailyHours: {},
    summary: { present: 25, late: 1, halfDay: 1, absent: 1, weekOff: 4, totalMinutes: 13500 },
  },
  salaryRecord: {
    salaryId: 'sal_1',
    staffUid: 'staff_1',
    year: 2026,
    month: 10,
    baseSalary: 31000,
    advance1: { amount: 2000, date: '2026-10-15' },
  },
})

assert.strictEqual(p2.absentDays, 1)
assert.strictEqual(p2.halfDays, 1)
assert.strictEqual(p2.attendanceDeduction, 1500)
assert.strictEqual(p2.totalAdvances, 2000)
assert.strictEqual(p2.totalDeductions, 3500)
assert.strictEqual(p2.netPay, 27500)
console.log('✓ Absent + Half-Day + Advance calculation passed')

// 5. Calculation Test 3: Admin override — waive attendance deduction to ₹0
const p3 = calculatePayslip({
  staffUid: 'staff_1',
  staffName: 'Siva Prakash',
  year: 2026,
  month: 10,
  baseSalary: 31000,
  attendanceRecord: {
    attendanceId: 'att_1',
    staffUid: 'staff_1',
    year: 2026,
    month: 10,
    dailyStatus: {},
    dailyHours: {},
    summary: { present: 25, late: 0, halfDay: 1, absent: 1, weekOff: 4, totalMinutes: 13500 },
  },
  adjustments: {
    applyAttendanceDeduction: false, // waived
    customBonus: 1000,
    customBonusReason: 'Diwali Bonus',
  },
})

assert.strictEqual(p3.attendanceDeduction, 0)
assert.strictEqual(p3.customBonus, 1000)
assert.strictEqual(p3.grossEarnings, 32000)
assert.strictEqual(p3.netPay, 32000)
assert.strictEqual(p3.isAdjusted, true)
console.log('✓ Adjustment waiver and bonus test passed')

console.log('\nAll Payroll Calculator tests successfully PASSED!')

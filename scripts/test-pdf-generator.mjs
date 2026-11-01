import assert from 'node:assert'
import fs from 'node:fs'
import { generatePayslipPdf } from '../lib/payroll/pdfGenerator.ts'
import { calculatePayslip } from '../lib/payroll/calculator.ts'

console.log('--- Testing PDF Generator ---')

const record = calculatePayslip({
  staffUid: 'usr_siva_123',
  staffName: 'Siva Prakash',
  jobTitle: 'Senior Photographer',
  year: 2026,
  month: 10,
  baseSalary: 28000,
  payslipNumber: 'ZS-PS-0145',
  attendanceRecord: {
    attendanceId: 'att_123',
    staffUid: 'usr_siva_123',
    year: 2026,
    month: 10,
    dailyStatus: {},
    dailyHours: {},
    summary: { present: 25, late: 1, halfDay: 1, absent: 1, weekOff: 4, totalMinutes: 13500 },
  },
  salaryRecord: {
    salaryId: 'sal_123',
    staffUid: 'usr_siva_123',
    year: 2026,
    month: 10,
    baseSalary: 28000,
    advance1: { amount: 2000, date: '2026-10-12' },
  },
  adjustments: {
    customBonus: 1000,
    customBonusReason: 'Diwali Bonus',
  },
  paymentStatus: 'paid',
  paymentDate: '2026-10-31',
})

const pdfBytes = await generatePayslipPdf(record)
assert.ok(pdfBytes instanceof Uint8Array, 'Output must be a Uint8Array')
console.log(`Generated PDF byte length: ${pdfBytes.byteLength}`)
assert.ok(pdfBytes.byteLength > 1000, 'PDF size should be at least 1KB')

// Validate PDF magic header: %PDF
const header = Buffer.from(pdfBytes.slice(0, 5)).toString('utf8')
assert.ok(header.startsWith('%PDF-'), 'Valid PDF binary header')

console.log(`✓ Generated valid PDF binary (${pdfBytes.byteLength} bytes)`)
console.log('All PDF Generator tests successfully PASSED!')

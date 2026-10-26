import { PDFDocument, StandardFonts, rgb, grayscale } from 'pdf-lib'
import type { PayslipRecord } from '@/types'
import { formatPdfCurrency, numberToWordsINR } from './calculator'
import { format } from 'date-fns'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

// Studio Zoom brand palette
const COLOR_PRIMARY = rgb(0.776, 0.325, 0.624)      // #c6539f
const COLOR_PRIMARY_TINT = rgb(0.98, 0.92, 0.96) // very soft primary tint
const COLOR_TEXT = rgb(0.09, 0.11, 0.10)          // #181d19
const COLOR_TEXT_MUTED = rgb(0.40, 0.40, 0.36)    // #66665c
const COLOR_BORDER = rgb(0.82, 0.82, 0.80)        // #d1d1cc
const COLOR_SURFACE = rgb(0.965, 0.965, 0.955)    // #f6f6f4
const COLOR_WHITE = rgb(1, 1, 1)

/**
 * Generate an in-memory PDF payslip binary buffer using pdf-lib.
 * Does not write to disk or Cloud Storage.
 */
export async function generatePayslipPdf(record: PayslipRecord): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([595.28, 841.89]) // A4 portrait
  const { width, height } = page.getSize()

  const fontRegular = await doc.embedFont(StandardFonts.Helvetica)
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)

  const margin = 36
  const contentWidth = width - margin * 2
  let y = height - margin

  // ─── 1. TOP BRAND ACCENT BAR ────────────────────────────────────────────────
  page.drawRectangle({
    x: margin,
    y: y - 4,
    width: contentWidth,
    height: 4,
    color: COLOR_PRIMARY,
  })
  y -= 20

  // ─── 2. HEADER BLOCK ────────────────────────────────────────────────────────
  // Left: Company Name & Subline
  page.drawText('STUDIO ZOOM', {
    x: margin,
    y: y,
    size: 20,
    font: fontBold,
    color: COLOR_PRIMARY,
  })

  page.drawText('Creative Photography & Film Studio', {
    x: margin,
    y: y - 14,
    size: 9,
    font: fontRegular,
    color: COLOR_TEXT_MUTED,
  })

  // Right: Document Title & Reference
  const monthName = MONTH_NAMES[record.month - 1] || 'Month'
  const titleText = 'PAYSLIP'
  const titleWidth = fontBold.widthOfTextAtSize(titleText, 18)
  page.drawText(titleText, {
    x: width - margin - titleWidth,
    y: y,
    size: 18,
    font: fontBold,
    color: COLOR_TEXT,
  })

  const payslipNoText = `Ref: ${record.payslipNumber || 'ZS-PS-0000'}`
  const payslipNoWidth = fontRegular.widthOfTextAtSize(payslipNoText, 9)
  page.drawText(payslipNoText, {
    x: width - margin - payslipNoWidth,
    y: y - 14,
    size: 9,
    font: fontRegular,
    color: COLOR_TEXT_MUTED,
  })

  const periodText = `Period: ${monthName} ${record.year}`
  const periodWidth = fontBold.widthOfTextAtSize(periodText, 9)
  page.drawText(periodText, {
    x: width - margin - periodWidth,
    y: y - 26,
    size: 9,
    font: fontBold,
    color: COLOR_TEXT,
  })

  y -= 44

  // Subtle separator line
  page.drawLine({
    start: { x: margin, y },
    end: { x: width - margin, y },
    thickness: 0.5,
    color: COLOR_BORDER,
  })
  y -= 14

  // ─── 3. EMPLOYEE & STUDIO INFO CARD ─────────────────────────────────────────
  const cardHeight = 64
  page.drawRectangle({
    x: margin,
    y: y - cardHeight,
    width: contentWidth,
    height: cardHeight,
    color: COLOR_SURFACE,
    borderColor: COLOR_BORDER,
    borderWidth: 0.5,
  })

  const col1X = margin + 14
  const col2X = margin + contentWidth / 2 + 10
  let infoY = y - 18

  // Column 1: Staff Details
  page.drawText('EMPLOYEE NAME:', { x: col1X, y: infoY, size: 8, font: fontBold, color: COLOR_TEXT_MUTED })
  page.drawText(record.staffName.toUpperCase(), { x: col1X + 85, y: infoY, size: 9, font: fontBold, color: COLOR_TEXT })

  infoY -= 15
  page.drawText('DESIGNATION:', { x: col1X, y: infoY, size: 8, font: fontBold, color: COLOR_TEXT_MUTED })
  page.drawText(record.jobTitle || 'Staff Member', { x: col1X + 85, y: infoY, size: 8.5, font: fontRegular, color: COLOR_TEXT })

  infoY -= 15
  page.drawText('EMPLOYEE ID:', { x: col1X, y: infoY, size: 8, font: fontBold, color: COLOR_TEXT_MUTED })
  page.drawText(record.staffUid.slice(0, 16), { x: col1X + 85, y: infoY, size: 8, font: fontRegular, color: COLOR_TEXT_MUTED })

  // Column 2: Studio & Payroll Details
  infoY = y - 18
  page.drawText('ISSUED BY:', { x: col2X, y: infoY, size: 8, font: fontBold, color: COLOR_TEXT_MUTED })
  page.drawText('Studio Zoom Productions', { x: col2X + 80, y: infoY, size: 8.5, font: fontBold, color: COLOR_TEXT })

  infoY -= 15
  page.drawText('ISSUE DATE:', { x: col2X, y: infoY, size: 8, font: fontBold, color: COLOR_TEXT_MUTED })
  const genDateStr = record.generatedAt ? format(new Date(record.generatedAt), 'dd/MM/yyyy') : format(new Date(), 'dd/MM/yyyy')
  page.drawText(genDateStr, { x: col2X + 80, y: infoY, size: 8.5, font: fontRegular, color: COLOR_TEXT })

  infoY -= 15
  page.drawText('PAYMENT STATUS:', { x: col2X, y: infoY, size: 8, font: fontBold, color: COLOR_TEXT_MUTED })
  const statusLabel = record.paymentStatus === 'paid' ? 'PAID' : 'PROCESSED'
  const statusColor = record.paymentStatus === 'paid' ? rgb(0.18, 0.49, 0.20) : COLOR_TEXT
  page.drawText(statusLabel, { x: col2X + 80, y: infoY, size: 8.5, font: fontBold, color: statusColor })

  y -= cardHeight + 14

  // ─── 4. ATTENDANCE SUMMARY ROW ──────────────────────────────────────────────
  const attBoxHeight = 44
  page.drawRectangle({
    x: margin,
    y: y - attBoxHeight,
    width: contentWidth,
    height: attBoxHeight,
    color: COLOR_WHITE,
    borderColor: COLOR_BORDER,
    borderWidth: 0.5,
  })

  const attMetrics = [
    { label: 'CALENDAR DAYS', val: String(record.totalCalendarDays) },
    { label: 'WORKING DAYS',  val: String(record.workingDays) },
    { label: 'PRESENT DAYS',  val: String(record.presentDays) },
    { label: 'WEEK OFFS',     val: String(record.weekOffs) },
    { label: 'HALF DAYS',     val: String(record.halfDays) },
    { label: 'ABSENCES',      val: String(record.absentDays) },
    { label: 'PAYABLE DAYS',  val: String(record.payableDays) },
  ]

  const cellW = contentWidth / attMetrics.length
  attMetrics.forEach((m, idx) => {
    const cx = margin + idx * cellW
    if (idx > 0) {
      page.drawLine({
        start: { x: cx, y },
        end: { x: cx, y: y - attBoxHeight },
        thickness: 0.5,
        color: COLOR_BORDER,
      })
    }

    // Label
    const lw = fontRegular.widthOfTextAtSize(m.label, 6.5)
    page.drawText(m.label, {
      x: cx + (cellW - lw) / 2,
      y: y - 14,
      size: 6.5,
      font: fontRegular,
      color: COLOR_TEXT_MUTED,
    })

    // Value
    const vw = fontBold.widthOfTextAtSize(m.val, 11)
    page.drawText(m.val, {
      x: cx + (cellW - vw) / 2,
      y: y - 32,
      size: 11,
      font: fontBold,
      color: m.label === 'ABSENCES' && Number(m.val) > 0 ? rgb(0.78, 0.2, 0.2) : COLOR_TEXT,
    })
  })

  y -= attBoxHeight + 16

  // ─── 5. EARNINGS & DEDUCTIONS SIDE-BY-SIDE TABLE ────────────────────────────
  const halfW = (contentWidth - 12) / 2
  const leftX = margin
  const rightX = margin + halfW + 12

  // Table Headers
  const tableHeaderHeight = 22
  // Earnings header
  page.drawRectangle({
    x: leftX,
    y: y - tableHeaderHeight,
    width: halfW,
    height: tableHeaderHeight,
    color: COLOR_SURFACE,
    borderColor: COLOR_BORDER,
    borderWidth: 0.5,
  })
  page.drawText('EARNINGS', { x: leftX + 10, y: y - 15, size: 8.5, font: fontBold, color: COLOR_TEXT })
  page.drawText('AMOUNT (INR)', {
    x: leftX + halfW - 10 - fontBold.widthOfTextAtSize('AMOUNT (INR)', 8.5),
    y: y - 15,
    size: 8.5,
    font: fontBold,
    color: COLOR_TEXT,
  })

  // Deductions header
  page.drawRectangle({
    x: rightX,
    y: y - tableHeaderHeight,
    width: halfW,
    height: tableHeaderHeight,
    color: COLOR_SURFACE,
    borderColor: COLOR_BORDER,
    borderWidth: 0.5,
  })
  page.drawText('DEDUCTIONS', { x: rightX + 10, y: y - 15, size: 8.5, font: fontBold, color: COLOR_TEXT })
  page.drawText('AMOUNT (INR)', {
    x: rightX + halfW - 10 - fontBold.widthOfTextAtSize('AMOUNT (INR)', 8.5),
    y: y - 15,
    size: 8.5,
    font: fontBold,
    color: COLOR_TEXT,
  })

  y -= tableHeaderHeight

  // Earnings Rows
  const earningsList: { label: string; amt: number }[] = [
    { label: 'Basic Salary', amt: record.baseSalary },
  ]
  if (record.allowances > 0) {
    earningsList.push({ label: 'Allowances', amt: record.allowances })
  }
  if (record.customBonus > 0) {
    const label = record.customBonusReason ? `Incentive (${record.customBonusReason})` : 'Bonus / Incentive'
    earningsList.push({ label, amt: record.customBonus })
  }

  // Deductions Rows
  const deductionsList: { label: string; amt: number }[] = []
  if (record.attendanceDeduction > 0) {
    const daysLost = (record.absentDays + record.halfDays * 0.5).toFixed(1)
    deductionsList.push({
      label: `Attendance Loss (${daysLost} days)`,
      amt: record.attendanceDeduction,
    })
  } else if (record.isAdjusted && (record.absentDays > 0 || record.halfDays > 0)) {
    deductionsList.push({ label: 'Attendance Loss (Waived)', amt: 0 })
  }

  record.advances.forEach((adv) => {
    deductionsList.push({
      label: adv.date ? `${adv.label} (${adv.date})` : adv.label,
      amt: adv.amount,
    })
  })

  if (record.customDeduction > 0) {
    const label = record.customDeductionReason ? `Adjustment (${record.customDeductionReason})` : 'Other Deduction'
    deductionsList.push({ label, amt: record.customDeduction })
  }

  const maxRows = Math.max(earningsList.length, deductionsList.length, 3)
  const rowHeight = 22

  for (let r = 0; r < maxRows; r++) {
    const rowY = y - rowHeight
    const isZebra = r % 2 === 1
    const rowBg = isZebra ? COLOR_SURFACE : COLOR_WHITE

    // Left row (Earnings)
    page.drawRectangle({
      x: leftX,
      y: rowY,
      width: halfW,
      height: rowHeight,
      color: rowBg,
      borderColor: COLOR_BORDER,
      borderWidth: 0.5,
    })
    const earnItem = earningsList[r]
    if (earnItem) {
      page.drawText(earnItem.label, { x: leftX + 10, y: rowY + 7, size: 8.5, font: fontRegular, color: COLOR_TEXT })
      const amtStr = formatPdfCurrency(earnItem.amt)
      const amtW = fontRegular.widthOfTextAtSize(amtStr, 8.5)
      page.drawText(amtStr, { x: leftX + halfW - 10 - amtW, y: rowY + 7, size: 8.5, font: fontRegular, color: COLOR_TEXT })
    }

    // Right row (Deductions)
    page.drawRectangle({
      x: rightX,
      y: rowY,
      width: halfW,
      height: rowHeight,
      color: rowBg,
      borderColor: COLOR_BORDER,
      borderWidth: 0.5,
    })
    const dedItem = deductionsList[r]
    if (dedItem) {
      page.drawText(dedItem.label, { x: rightX + 10, y: rowY + 7, size: 8.5, font: fontRegular, color: COLOR_TEXT })
      const amtStr = formatPdfCurrency(dedItem.amt)
      const amtW = fontRegular.widthOfTextAtSize(amtStr, 8.5)
      page.drawText(amtStr, { x: rightX + halfW - 10 - amtW, y: rowY + 7, size: 8.5, font: fontRegular, color: COLOR_TEXT })
    }

    y -= rowHeight
  }

  // Totals Row
  const totalRowHeight = 24
  // Gross Total
  page.drawRectangle({
    x: leftX,
    y: y - totalRowHeight,
    width: halfW,
    height: totalRowHeight,
    color: COLOR_SURFACE,
    borderColor: COLOR_BORDER,
    borderWidth: 0.5,
  })
  page.drawText('GROSS EARNINGS', { x: leftX + 10, y: y - 16, size: 8.5, font: fontBold, color: COLOR_TEXT })
  const grossStr = formatPdfCurrency(record.grossEarnings)
  const grossW = fontBold.widthOfTextAtSize(grossStr, 9)
  page.drawText(grossStr, { x: leftX + halfW - 10 - grossW, y: y - 16, size: 9, font: fontBold, color: COLOR_TEXT })

  // Total Deductions
  page.drawRectangle({
    x: rightX,
    y: y - totalRowHeight,
    width: halfW,
    height: totalRowHeight,
    color: COLOR_SURFACE,
    borderColor: COLOR_BORDER,
    borderWidth: 0.5,
  })
  page.drawText('TOTAL DEDUCTIONS', { x: rightX + 10, y: y - 16, size: 8.5, font: fontBold, color: COLOR_TEXT })
  const dedStr = formatPdfCurrency(record.totalDeductions)
  const dedW = fontBold.widthOfTextAtSize(dedStr, 9)
  page.drawText(dedStr, { x: rightX + halfW - 10 - dedW, y: y - 16, size: 9, font: fontBold, color: COLOR_TEXT })

  y -= totalRowHeight + 18

  // ─── 6. NET PAY HIGHLIGHT CALLOUT BANNER ─────────────────────────────────────
  const netBoxHeight = 56
  page.drawRectangle({
    x: margin,
    y: y - netBoxHeight,
    width: contentWidth,
    height: netBoxHeight,
    color: COLOR_PRIMARY_TINT,
    borderColor: COLOR_PRIMARY,
    borderWidth: 1,
  })

  // Left Net Title & Value
  page.drawText('NET SALARY PAYABLE', {
    x: margin + 16,
    y: y - 20,
    size: 9,
    font: fontBold,
    color: COLOR_PRIMARY,
  })

  const netPayStr = formatPdfCurrency(record.netPay)
  page.drawText(netPayStr, {
    x: margin + 16,
    y: y - 44,
    size: 19,
    font: fontBold,
    color: COLOR_TEXT,
  })

  // Right: Amount in words
  const wordsText = numberToWordsINR(record.netPay)
  const wordsW = fontRegular.widthOfTextAtSize(wordsText, 8.5)
  page.drawText('AMOUNT IN WORDS:', {
    x: width - margin - 16 - Math.max(wordsW, 100),
    y: y - 20,
    size: 8,
    font: fontBold,
    color: COLOR_TEXT_MUTED,
  })
  page.drawText(wordsText, {
    x: width - margin - 16 - wordsW,
    y: y - 36,
    size: 8.5,
    font: fontRegular,
    color: COLOR_TEXT,
  })

  y -= netBoxHeight + 32

  // ─── 7. FOOTER & AUTHORIZED SIGNATORY ───────────────────────────────────────
  // Signatory Line on Right
  const signW = 160
  const signX = width - margin - signW
  page.drawLine({
    start: { x: signX, y: y - 20 },
    end: { x: signX + signW, y: y - 20 },
    thickness: 0.5,
    color: COLOR_BORDER,
  })
  page.drawText('Authorized Signatory', {
    x: signX + (signW - fontBold.widthOfTextAtSize('Authorized Signatory', 8)) / 2,
    y: y - 32,
    size: 8,
    font: fontBold,
    color: COLOR_TEXT_MUTED,
  })
  page.drawText('Studio Zoom Productions', {
    x: signX + (signW - fontRegular.widthOfTextAtSize('Studio Zoom Productions', 7.5)) / 2,
    y: y - 43,
    size: 7.5,
    font: fontRegular,
    color: COLOR_TEXT_MUTED,
  })

  // Disclaimer on Left
  const discY = y - 32
  page.drawText('Note: This is a system-generated document created by Studio Zoom HRMS.', {
    x: margin,
    y: discY,
    size: 7.5,
    font: fontRegular,
    color: COLOR_TEXT_MUTED,
  })
  page.drawText('Confidential — For intended recipient only.', {
    x: margin,
    y: discY - 11,
    size: 7.5,
    font: fontRegular,
    color: COLOR_TEXT_MUTED,
  })

  return await doc.save()
}

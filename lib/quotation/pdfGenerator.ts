import { PDFDocument, StandardFonts, rgb, type PDFPage } from 'pdf-lib'
import type { Quotation, QuotationTemplateId } from '@/types'
import { format } from 'date-fns'

// ─────────────────────────────────────────────────────────────────────────────
// COLOR CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
const COLOR_TEXT = rgb(0.12, 0.12, 0.12)
const COLOR_TEXT_MUTED = rgb(0.42, 0.42, 0.42)
const COLOR_PRIMARY_P1 = rgb(0.776, 0.325, 0.624) // #c6539f
const COLOR_PRIMARY_P2 = rgb(0.776, 0.325, 0.624) // #c6539f
const COLOR_PRIMARY_P3 = rgb(0.545, 0.180, 0.404) // #8b2e67
const COLOR_BORDER = rgb(0.85, 0.85, 0.85)
const COLOR_WHITE = rgb(1, 1, 1)

// Standard A4 dimensions in points (72 pt / inch)
const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE SAFE CONFIGURATIONS
// ─────────────────────────────────────────────────────────────────────────────
export interface TemplateSafeConfig {
  id: 'package1' | 'package2' | 'package3'
  name: string
  safeTopY: number // PDF-lib Y coordinate where dynamic content begins (from bottom)
  safeBottomY: number // PDF-lib Y coordinate where content must stop before footer art
  marginX: number // Left and right margins
  contentWidth: number // Usable width: PAGE_WIDTH - 2 * marginX
  totalsBoxWidth: number
}

export const TEMPLATE_CONFIGS: Record<'package1' | 'package2' | 'package3', TemplateSafeConfig> = {
  package1: {
    id: 'package1',
    name: 'Package 1 : Wedding Editorial',
    // Photo collage ends at y ≈ 492 pt. 468 pt provides comfortable breathing room.
    safeTopY: 468,
    // Contact and Instagram footer occupies y ≈ 38..70 pt.
    safeBottomY: 78,
    marginX: 42,
    contentWidth: PAGE_WIDTH - 84, // 511.28 pt
    totalsBoxWidth: 215,
  },
  package2: {
    id: 'package2',
    name: 'Package 2 : Media Production Estimation',
    // Pink header swirl ends at y ≈ 697 pt.
    safeTopY: 668,
    // Leaves room for "Thank You!" (y ≈ 125) and Office address (y ≈ 54..95)
    safeBottomY: 155,
    marginX: 44,
    contentWidth: PAGE_WIDTH - 88, // 507.28 pt
    totalsBoxWidth: 215,
  },
  package3: {
    id: 'package3',
    name: 'Package 3 : Royal Wedding with Add-ons',
    // Purple scalloped badge with rings ends at y ≈ 537 pt.
    // 505 pt starts safely inside clean cream paper.
    safeTopY: 505,
    // Pre-printed bottom floral footer starts at y ≈ 112 pt.
    safeBottomY: 125,
    marginX: 42,
    contentWidth: PAGE_WIDTH - 84, // 511.28 pt
    totalsBoxWidth: 220,
  },
}

/**
 * Normalizes template ID to one of the 3 packages:
 * package1 = Package 1 (Wedding Editorial)
 * package2 = Package 2 (Media Production Estimation)
 * package3 = Package 3 (Royal Wedding with Add-ons)
 */
export function normalizeTemplateKey(id?: QuotationTemplateId): 'package1' | 'package2' | 'package3' {
  if (id === 'package2' || id === 'production') return 'package2'
  if (id === 'package3' || id === 'floral') return 'package3'
  return 'package1'
}

/**
 * Format currency with Indian grouping: e.g. "1,05,000"
 */
export function formatINR(val?: number | null): string {
  if (val === undefined || val === null || isNaN(val)) return '0'
  return Math.round(val).toLocaleString('en-IN')
}

/**
 * Fetch background template image bytes dynamically.
 * Reads the high-res artwork extracted from the HTML template.
 */
async function loadTemplateImage(
  templateKey: 'package1' | 'package2' | 'package3'
): Promise<Uint8Array | null> {
  const num = templateKey === 'package1' ? '1' : templateKey === 'package2' ? '2' : '3'
  const relativePath = `/templates/quotations/thumbnail-${num}.jpg`

  // Browser fetch
  if (typeof window !== 'undefined') {
    try {
      const res = await fetch(relativePath)
      if (res.ok) {
        return new Uint8Array(await res.arrayBuffer())
      }
    } catch (e) {
      console.warn('Could not fetch template image via browser:', e)
    }
  }

  // Node.js fs fallback (for testing and server environments)
  if (typeof window === 'undefined') {
    try {
      const fs = await import('fs')
      const path = await import('path')
      const thumbPath = path.join(process.cwd(), 'public', 'templates', 'quotations', `thumbnail-${num}.jpg`)
      if (fs.existsSync(thumbPath)) {
        return new Uint8Array(fs.readFileSync(thumbPath))
      }
      const htmlPath = path.join(process.cwd(), 'public', 'templates', 'quotations', `Package_${num}.html`)
      if (fs.existsSync(htmlPath)) {
        const text = fs.readFileSync(htmlPath, 'utf8')
        const m = text.match(/data:image\/jpeg;base64,([^\x22\x27\)]+)/)
        if (m) {
          return new Uint8Array(Buffer.from(m[1], 'base64'))
        }
      }
    } catch {
      // Ignore if unavailable
    }
  }

  return null
}

/**
 * Generates an in-memory vector PDF document with the selected Package 1, 2, or 3 template.
 */
export async function generateQuotationPdf(quotation: Quotation): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const templateKey = normalizeTemplateKey(quotation.templateId)
  const config = TEMPLATE_CONFIGS[templateKey]

  // Pre-load background template image
  const bgBytes = await loadTemplateImage(templateKey)
  let bgImage = null
  if (bgBytes) {
    const isJpg = bgBytes[0] === 0xff && bgBytes[1] === 0xd8
    bgImage = isJpg ? await doc.embedJpg(bgBytes) : await doc.embedPng(bgBytes)
  }

  // Helper to add a new page with the exact background template artwork
  const addPageWithTemplate = async (): Promise<PDFPage> => {
    const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    if (bgImage) {
      page.drawImage(bgImage, {
        x: 0,
        y: 0,
        width: PAGE_WIDTH,
        height: PAGE_HEIGHT,
      })
    }
    return page
  }

  let currentPage = await addPageWithTemplate()

  // Embed standard fonts
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica)
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)

  // Standard dates
  const qDate = quotation.createdAt ? format(quotation.createdAt, 'dd MMM yyyy') : format(new Date(), 'dd MMM yyyy')
  const validDateStr = quotation.validityDate ? format(quotation.validityDate, 'dd MMM yyyy') : format(new Date(), 'dd MMM yyyy')
  const evDateStr = quotation.eventDate ? format(quotation.eventDate, 'dd MMM yyyy') : qDate

  const marginX = config.marginX
  const contentWidth = config.contentWidth
  let curY = config.safeTopY

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. PAGE 1 HEADER & GREETINGS (FITTED SAFELY INTO EACH TEMPLATE'S WHITE SPACE)
  // ─────────────────────────────────────────────────────────────────────────────
  if (templateKey === 'package1') {
    // ── PACKAGE 1: Wedding Editorial ──
    // Note: Background photo collage on top. No logo in body.
    currentPage.drawText(`QUOTATION : ${quotation.quotationNumber}`, {
      x: marginX,
      y: curY,
      size: 9.5,
      font: fontBold,
      color: COLOR_PRIMARY_P1,
    })

    const dateStr = `Date: ${qDate}  •  Valid Until: ${validDateStr}`
    currentPage.drawText(dateStr, {
      x: marginX + contentWidth - fontRegular.widthOfTextAtSize(dateStr, 8.5),
      y: curY,
      size: 8.5,
      font: fontRegular,
      color: COLOR_TEXT_MUTED,
    })

    curY -= 18

    // Client line: omit dangling dash if eventType is empty
    const clientText = quotation.eventType && quotation.eventType.trim()
      ? `${quotation.clientName}  —  ${quotation.eventType.trim()}`
      : quotation.clientName
    currentPage.drawText(clientText, {
      x: marginX,
      y: curY,
      size: 11.5,
      font: fontBold,
      color: COLOR_TEXT,
    })

    if (quotation.place && quotation.place.trim()) {
      curY -= 14
      currentPage.drawText(quotation.place.trim(), {
        x: marginX,
        y: curY,
        size: 8.5,
        font: fontRegular,
        color: COLOR_TEXT_MUTED,
      })
    }

    curY -= 20
  } else if (templateKey === 'package2') {
    // ── PACKAGE 2: Media Production Estimation ──
    // Note: StudioZoom logo header is pre-printed in background artwork.
    if (quotation.place && quotation.place.trim()) {
      currentPage.drawText(`Place :  ${quotation.place.trim()}`, {
        x: marginX,
        y: curY,
        size: 9.5,
        font: fontRegular,
        color: COLOR_TEXT,
      })
    }

    currentPage.drawText(`Date :  ${qDate}`, {
      x: marginX,
      y: curY - 16,
      size: 9.5,
      font: fontRegular,
      color: COLOR_TEXT,
    })

    const qNumStr = `Quotation No: ${quotation.quotationNumber}`
    currentPage.drawText(qNumStr, {
      x: marginX + contentWidth - fontBold.widthOfTextAtSize(qNumStr, 9.5),
      y: curY - 16,
      size: 9.5,
      font: fontBold,
      color: COLOR_PRIMARY_P2,
    })

    curY -= 36

    // Greeting
    currentPage.drawText('Respected Sir / Mam,', {
      x: marginX,
      y: curY,
      size: 10,
      font: fontBold,
      color: COLOR_TEXT,
    })
    curY -= 14

    currentPage.drawText('Thank You for Giving us this Great Oppurtunity.', {
      x: marginX,
      y: curY,
      size: 9.5,
      font: fontRegular,
      color: COLOR_TEXT,
    })
    curY -= 13

    currentPage.drawText("We're delighted to Work with you.", {
      x: marginX,
      y: curY,
      size: 9.5,
      font: fontRegular,
      color: COLOR_TEXT,
    })
    curY -= 18

    // Prepared For: omit empty brackets if eventType is empty
    const prepFor = quotation.eventType && quotation.eventType.trim()
      ? `Prepared For:  ${quotation.clientName}  (${quotation.eventType.trim()})`
      : `Prepared For:  ${quotation.clientName}`
    currentPage.drawText(prepFor, {
      x: marginX,
      y: curY,
      size: 10,
      font: fontBold,
      color: COLOR_TEXT,
    })

    curY -= 20
  } else if (templateKey === 'package3') {
    // ── PACKAGE 3: Royal Wedding with Add-ons ──
    // Starts safely below purple scalloped badge inside clean cream paper
    const greetingText = "Thank you for giving us this great oppurtunity. We're delighted to work for you"
    const gw = fontRegular.widthOfTextAtSize(greetingText, 9)
    currentPage.drawText(greetingText, {
      x: (PAGE_WIDTH - gw) / 2,
      y: curY,
      size: 9,
      font: fontRegular,
      color: COLOR_TEXT_MUTED,
    })
    curY -= 16

    // Heading: Never print dangling dash if event name is empty
    const evHeading = quotation.eventType && quotation.eventType.trim()
      ? `[${evDateStr.toUpperCase()} - ${quotation.eventType.trim().toUpperCase()}]`
      : `[${evDateStr.toUpperCase()}]`
    const ehw = fontBold.widthOfTextAtSize(evHeading, 10.5)
    currentPage.drawText(evHeading, {
      x: (PAGE_WIDTH - ehw) / 2,
      y: curY,
      size: 10.5,
      font: fontBold,
      color: COLOR_TEXT,
    })
    curY -= 20

    currentPage.drawText(`Client: ${quotation.clientName}`, {
      x: marginX,
      y: curY,
      size: 9.5,
      font: fontBold,
      color: COLOR_TEXT,
    })

    const qSummary = `Quote: ${quotation.quotationNumber}  •  Valid: ${validDateStr}`
    currentPage.drawText(qSummary, {
      x: marginX + contentWidth - fontRegular.widthOfTextAtSize(qSummary, 8.5),
      y: curY,
      size: 8.5,
      font: fontRegular,
      color: COLOR_TEXT_MUTED,
    })

    curY -= 20
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. LINE ITEMS TABLE (FIXED COLUMNS, RIGHT-ALIGNED NUMBERS, INDIAN FORMAT)
  // ─────────────────────────────────────────────────────────────────────────────
  // Fixed Column Coordinates:
  // Description: marginX + 6 -> marginX + 280 (width ~274 pt)
  // Qty: right-aligned at marginX + 325 pt
  // Rate: right-aligned at marginX + 415 pt
  // Amount: right-aligned at marginX + contentWidth - 6 pt
  const colDescX = marginX + 6
  const colQtyRightX = marginX + 325
  const colRateRightX = marginX + 415
  const colAmountRightX = marginX + contentWidth - 6

  const drawTableHeader = (p: PDFPage, y: number) => {
    if (templateKey === 'package3') {
      // Package 3: Fully transparent table header, no opaque white/gray fill over cream paper
      p.drawLine({
        start: { x: marginX, y: y + 13 },
        end: { x: marginX + contentWidth, y: y + 13 },
        thickness: 0.5,
        color: rgb(0.65, 0.6, 0.55),
      })
      p.drawLine({
        start: { x: marginX, y: y - 5 },
        end: { x: marginX + contentWidth, y: y - 5 },
        thickness: 0.5,
        color: rgb(0.65, 0.6, 0.55),
      })
    } else {
      p.drawRectangle({
        x: marginX,
        y: y - 5,
        width: contentWidth,
        height: 18,
        color: rgb(0.96, 0.96, 0.96),
        borderColor: COLOR_BORDER,
        borderWidth: 0.5,
      })
    }

    const headerColor = templateKey === 'package3' ? rgb(0.35, 0.3, 0.28) : COLOR_TEXT_MUTED

    p.drawText('DESCRIPTION', {
      x: colDescX,
      y: y,
      size: 8,
      font: fontBold,
      color: headerColor,
    })

    const qtyHdr = 'QTY'
    p.drawText(qtyHdr, {
      x: colQtyRightX - fontBold.widthOfTextAtSize(qtyHdr, 8),
      y: y,
      size: 8,
      font: fontBold,
      color: headerColor,
    })

    const rateHdr = 'RATE'
    p.drawText(rateHdr, {
      x: colRateRightX - fontBold.widthOfTextAtSize(rateHdr, 8),
      y: y,
      size: 8,
      font: fontBold,
      color: headerColor,
    })

    const amtHdr = 'AMOUNT'
    p.drawText(amtHdr, {
      x: colAmountRightX - fontBold.widthOfTextAtSize(amtHdr, 8),
      y: y,
      size: 8,
      font: fontBold,
      color: headerColor,
    })
  }

  // Draw initial table header
  drawTableHeader(currentPage, curY)
  curY -= 20

  const items = quotation.lineItems || []
  const rowHeight = 17

  for (let i = 0; i < items.length; i++) {
    // Pagination check: if next row would encroach upon safe bottom area, paginate!
    if (curY - rowHeight < config.safeBottomY) {
      currentPage = await addPageWithTemplate()
      curY = config.safeTopY
      drawTableHeader(currentPage, curY)
      curY -= 20
    }

    const item = items[i]

    // Row zebra background: ONLY on Package 1 & 2 (Package 3 remains 100% transparent)
    if (templateKey !== 'package3' && i % 2 === 1) {
      currentPage.drawRectangle({
        x: marginX,
        y: curY - 4,
        width: contentWidth,
        height: rowHeight - 1,
        color: rgb(0.98, 0.98, 0.98),
      })
    }

    // Description (truncate with ellipsis if exceptionally long)
    let desc = item.description || 'Deliverable Item'
    if (desc.length > 50) desc = desc.slice(0, 48) + '...'

    currentPage.drawText(desc, {
      x: colDescX,
      y: curY,
      size: 8.5,
      font: fontRegular,
      color: COLOR_TEXT,
    })

    // Qty (right-aligned)
    const qtyStr = String(item.qty || 1)
    currentPage.drawText(qtyStr, {
      x: colQtyRightX - fontRegular.widthOfTextAtSize(qtyStr, 8.5),
      y: curY,
      size: 8.5,
      font: fontRegular,
      color: COLOR_TEXT,
    })

    // Rate (right-aligned, Indian format)
    const rateStr = formatINR(item.rate)
    currentPage.drawText(rateStr, {
      x: colRateRightX - fontRegular.widthOfTextAtSize(rateStr, 8.5),
      y: curY,
      size: 8.5,
      font: fontRegular,
      color: COLOR_TEXT,
    })

    // Amount (right-aligned, Indian format)
    const amtStr = formatINR(item.amount)
    currentPage.drawText(amtStr, {
      x: colAmountRightX - fontBold.widthOfTextAtSize(amtStr, 8.5),
      y: curY,
      size: 8.5,
      font: fontBold,
      color: COLOR_TEXT,
    })

    // Subtle row divider line for Package 3
    if (templateKey === 'package3') {
      currentPage.drawLine({
        start: { x: marginX, y: curY - 4 },
        end: { x: marginX + contentWidth, y: curY - 4 },
        thickness: 0.35,
        color: rgb(0.88, 0.84, 0.78),
      })
    }

    curY -= rowHeight
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. PACKAGE DELIVERABLES SUBTOTAL & ADD-ONS (PACKAGE 3 SPECIFIC & GENERAL)
  // ─────────────────────────────────────────────────────────────────────────────
  const addons = quotation.addons || []
  const lineItemsSubtotal = items.reduce((sum, it) => sum + (Number(it.amount) || 0), 0)
  const addonsSubtotal = addons.reduce((sum, it) => sum + (Number(it.amount) || 0), 0)
  const actualSubtotal = quotation.subtotal || lineItemsSubtotal + addonsSubtotal
  const grandTotal = quotation.grandTotal || actualSubtotal

  if (templateKey === 'package3') {
    // Deliverables Subtotal Row
    curY -= 6
    currentPage.drawLine({
      start: { x: marginX, y: curY + 6 },
      end: { x: marginX + contentWidth, y: curY + 6 },
      thickness: 0.5,
      color: rgb(0.65, 0.6, 0.55),
    })

    const delivLabel = 'Package Deliverables:'
    currentPage.drawText(delivLabel, {
      x: marginX + 6,
      y: curY,
      size: 8.5,
      font: fontBold,
      color: COLOR_PRIMARY_P3,
    })

    const delivAmtStr = `Rs. ${formatINR(lineItemsSubtotal)}`
    currentPage.drawText(delivAmtStr, {
      x: colAmountRightX - fontBold.widthOfTextAtSize(delivAmtStr, 8.5),
      y: curY,
      size: 8.5,
      font: fontBold,
      color: COLOR_PRIMARY_P3,
    })

    curY -= 18

    // ADDONS Section: Only render if addons exist; hide completely if empty (never print "None")
    if (addons.length > 0) {
      // Check pagination space for addons block
      const neededAddonHeight = 22 + addons.length * 15
      if (curY - neededAddonHeight < config.safeBottomY) {
        currentPage = await addPageWithTemplate()
        curY = config.safeTopY
      }

      currentPage.drawText('ADDONS', {
        x: marginX + 6,
        y: curY,
        size: 9,
        font: fontBold,
        color: COLOR_PRIMARY_P3,
      })
      curY -= 14

      for (const addon of addons) {
        currentPage.drawText(`• ${addon.description || 'Add-on deliverable'}`, {
          x: marginX + 12,
          y: curY,
          size: 8,
          font: fontRegular,
          color: COLOR_TEXT,
        })

        const aAmtStr = `Rs. ${formatINR(addon.amount)}`
        currentPage.drawText(aAmtStr, {
          x: colAmountRightX - fontBold.widthOfTextAtSize(aAmtStr, 8),
          y: curY,
          size: 8,
          font: fontBold,
          color: COLOR_TEXT,
        })
        curY -= 14
      }
      curY -= 6
    }
  } else if (addons.length > 0) {
    // For Package 1 & 2: render addons if present
    const neededAddonHeight = 20 + addons.length * 14
    if (curY - neededAddonHeight < config.safeBottomY) {
      currentPage = await addPageWithTemplate()
      curY = config.safeTopY
    }

    currentPage.drawText('ADD-ONS', {
      x: marginX + 6,
      y: curY,
      size: 8.5,
      font: fontBold,
      color: templateKey === 'package1' ? COLOR_PRIMARY_P1 : COLOR_PRIMARY_P2,
    })
    curY -= 13

    for (const addon of addons) {
      currentPage.drawText(`• ${addon.description || 'Add-on deliverable'}`, {
        x: marginX + 14,
        y: curY,
        size: 8,
        font: fontRegular,
        color: COLOR_TEXT,
      })

      const aAmtStr = `Rs. ${formatINR(addon.amount)}`
      currentPage.drawText(aAmtStr, {
        x: colAmountRightX - fontBold.widthOfTextAtSize(aAmtStr, 8),
        y: curY,
        size: 8,
        font: fontBold,
        color: COLOR_TEXT,
      })
      curY -= 13
    }
    curY -= 6
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. TOTALS BLOCK & FOOTERS (NORMAL VERTICAL FLOW, STAY TOGETHER)
  // ─────────────────────────────────────────────────────────────────────────────
  const totalsBoxW = config.totalsBoxWidth
  const totalsBoxX = marginX + contentWidth - totalsBoxW

  // Calculate required vertical height for totals so they NEVER split across pages
  let neededTotalsHeight = 55
  if (quotation.gstEnabled) neededTotalsHeight += 28
  if (templateKey === 'package2') neededTotalsHeight += 85 // Includes "Thank You!" and Office footer

  if (curY - neededTotalsHeight < config.safeBottomY) {
    currentPage = await addPageWithTemplate()
    curY = config.safeTopY
  }

  if (templateKey === 'package3') {
    // ── PACKAGE 3 TOTALS ──
    // Separate GST line with clean spacing above the continuous Grand Total bar
    if (quotation.gstEnabled) {
      const gstTotal = (quotation.cgst || 0) + (quotation.sgst || 0)
      const gstLabel = 'Incl. 18% GST:'
      const gstVal = `Rs. ${formatINR(gstTotal)}`

      currentPage.drawText(gstLabel, {
        x: totalsBoxX,
        y: curY,
        size: 8,
        font: fontRegular,
        color: COLOR_TEXT_MUTED,
      })
      currentPage.drawText(gstVal, {
        x: colAmountRightX - fontRegular.widthOfTextAtSize(gstVal, 8),
        y: curY,
        size: 8,
        font: fontRegular,
        color: COLOR_TEXT_MUTED,
      })
      curY -= 18 // Healthy spacing between GST and Grand Total bar
    }

    // Continuous Grand Total bar (single rectangle, label on left, amount on right)
    const rectY = curY - 24
    currentPage.drawRectangle({
      x: totalsBoxX,
      y: rectY,
      width: totalsBoxW,
      height: 20,
      color: COLOR_PRIMARY_P3,
    })

    currentPage.drawText('GRAND TOTAL', {
      x: totalsBoxX + 10,
      y: rectY + 6,
      size: 9,
      font: fontBold,
      color: COLOR_WHITE,
    })

    const grandStr = `Rs. ${formatINR(grandTotal)}`
    currentPage.drawText(grandStr, {
      x: totalsBoxX + totalsBoxW - fontBold.widthOfTextAtSize(grandStr, 9) - 10,
      y: rectY + 6,
      size: 9,
      font: fontBold,
      color: COLOR_WHITE,
    })
    // Note: Package 3 bottom footer is pre-printed in background artwork.
  } else if (templateKey === 'package2') {
    // ── PACKAGE 2 TOTALS, "THANK YOU!" & OFFICE FOOTER ──
    // Subtotal
    currentPage.drawText('Subtotal:', {
      x: totalsBoxX,
      y: curY,
      size: 8.5,
      font: fontRegular,
      color: COLOR_TEXT_MUTED,
    })
    const subStr = `Rs. ${formatINR(actualSubtotal)}`
    currentPage.drawText(subStr, {
      x: colAmountRightX - fontBold.widthOfTextAtSize(subStr, 8.5),
      y: curY,
      size: 8.5,
      font: fontBold,
      color: COLOR_TEXT,
    })
    curY -= 14

    // GST lines in sequential normal flow: Subtotal -> CGST -> SGST -> Grand Total
    if (quotation.gstEnabled) {
      currentPage.drawText('CGST (9%):', {
        x: totalsBoxX,
        y: curY,
        size: 8,
        font: fontRegular,
        color: COLOR_TEXT_MUTED,
      })
      const cgstStr = `Rs. ${formatINR(quotation.cgst || 0)}`
      currentPage.drawText(cgstStr, {
        x: colAmountRightX - fontRegular.widthOfTextAtSize(cgstStr, 8),
        y: curY,
        size: 8,
        font: fontRegular,
        color: COLOR_TEXT,
      })
      curY -= 13

      currentPage.drawText('SGST (9%):', {
        x: totalsBoxX,
        y: curY,
        size: 8,
        font: fontRegular,
        color: COLOR_TEXT_MUTED,
      })
      const sgstStr = `Rs. ${formatINR(quotation.sgst || 0)}`
      currentPage.drawText(sgstStr, {
        x: colAmountRightX - fontRegular.widthOfTextAtSize(sgstStr, 8),
        y: curY,
        size: 8,
        font: fontRegular,
        color: COLOR_TEXT,
      })
      curY -= 14
    }

    // Continuous Grand Total bar strictly inside margins (SGST is fully visible above it)
    const rectY = curY - 26
    currentPage.drawRectangle({
      x: totalsBoxX,
      y: rectY,
      width: totalsBoxW,
      height: 20,
      color: COLOR_PRIMARY_P2,
    })

    currentPage.drawText('GRAND TOTAL', {
      x: totalsBoxX + 10,
      y: rectY + 6,
      size: 9,
      font: fontBold,
      color: COLOR_WHITE,
    })

    const grandStr = `Rs. ${formatINR(grandTotal)}`
    currentPage.drawText(grandStr, {
      x: totalsBoxX + totalsBoxW - fontBold.widthOfTextAtSize(grandStr, 9) - 10,
      y: rectY + 6,
      size: 9,
      font: fontBold,
      color: COLOR_WHITE,
    })

    curY = rectY - 24

    // Centered "Thank You!"
    const tyText = 'Thank You!'
    const tyWidth = fontBold.widthOfTextAtSize(tyText, 13)
    currentPage.drawText(tyText, {
      x: (PAGE_WIDTH - tyWidth) / 2,
      y: Math.max(curY, 120),
      size: 13,
      font: fontBold,
      color: COLOR_TEXT,
    })

    // OFFICE Address on left end (pinned comfortably above page bottom)
    currentPage.drawText('OFFICE:', {
      x: marginX,
      y: 92,
      size: 8.5,
      font: fontBold,
      color: COLOR_TEXT,
    })
    currentPage.drawText('No.3, Kasturi Bai Nagar,N.M.Road, Avadi, Chennai-54.', {
      x: marginX,
      y: 78,
      size: 7.5,
      font: fontRegular,
      color: COLOR_TEXT_MUTED,
    })
    currentPage.drawText('E-mail : studiozoomindia@gmail.com', {
      x: marginX,
      y: 66,
      size: 7.5,
      font: fontRegular,
      color: COLOR_TEXT_MUTED,
    })
    currentPage.drawText('Contact : +91 9381029555 , +91 8072183903.', {
      x: marginX,
      y: 54,
      size: 7.5,
      font: fontRegular,
      color: COLOR_TEXT_MUTED,
    })
  } else if (templateKey === 'package1') {
    // ── PACKAGE 1 TOTALS & FOOTER ──
    // Subtotal
    currentPage.drawText('Subtotal:', {
      x: totalsBoxX,
      y: curY,
      size: 8.5,
      font: fontRegular,
      color: COLOR_TEXT_MUTED,
    })
    const subStr = `Rs. ${formatINR(actualSubtotal)}`
    currentPage.drawText(subStr, {
      x: colAmountRightX - fontBold.widthOfTextAtSize(subStr, 8.5),
      y: curY,
      size: 8.5,
      font: fontBold,
      color: COLOR_TEXT,
    })
    curY -= 14

    // GST lines: Subtotal -> CGST -> SGST -> Grand Total
    if (quotation.gstEnabled) {
      currentPage.drawText('CGST (9%):', {
        x: totalsBoxX,
        y: curY,
        size: 8,
        font: fontRegular,
        color: COLOR_TEXT_MUTED,
      })
      const cgstStr = `Rs. ${formatINR(quotation.cgst || 0)}`
      currentPage.drawText(cgstStr, {
        x: colAmountRightX - fontRegular.widthOfTextAtSize(cgstStr, 8),
        y: curY,
        size: 8,
        font: fontRegular,
        color: COLOR_TEXT,
      })
      curY -= 13

      currentPage.drawText('SGST (9%):', {
        x: totalsBoxX,
        y: curY,
        size: 8,
        font: fontRegular,
        color: COLOR_TEXT_MUTED,
      })
      const sgstStr = `Rs. ${formatINR(quotation.sgst || 0)}`
      currentPage.drawText(sgstStr, {
        x: colAmountRightX - fontRegular.widthOfTextAtSize(sgstStr, 8),
        y: curY,
        size: 8,
        font: fontRegular,
        color: COLOR_TEXT,
      })
      curY -= 14
    }

    // Continuous Grand Total bar strictly inside margins (never overflows)
    const rectY = curY - 26
    currentPage.drawRectangle({
      x: totalsBoxX,
      y: rectY,
      width: totalsBoxW,
      height: 20,
      color: COLOR_PRIMARY_P1,
    })

    currentPage.drawText('GRAND TOTAL', {
      x: totalsBoxX + 10,
      y: rectY + 6,
      size: 9,
      font: fontBold,
      color: COLOR_WHITE,
    })

    const grandStr = `Rs. ${formatINR(grandTotal)}`
    currentPage.drawText(grandStr, {
      x: totalsBoxX + totalsBoxW - fontBold.widthOfTextAtSize(grandStr, 9) - 10,
      y: rectY + 6,
      size: 9,
      font: fontBold,
      color: COLOR_WHITE,
    })

    // Footer: Contact & Instagram at bottom of page
    currentPage.drawLine({
      start: { x: marginX, y: 70 },
      end: { x: marginX + contentWidth, y: 70 },
      thickness: 0.5,
      color: COLOR_BORDER,
    })

    currentPage.drawText('Contact', {
      x: marginX,
      y: 54,
      size: 8.5,
      font: fontBold,
      color: COLOR_TEXT,
    })
    currentPage.drawText('+91 93810 29555  |  +91 80721 83903', {
      x: marginX,
      y: 42,
      size: 7.5,
      font: fontRegular,
      color: COLOR_TEXT_MUTED,
    })

    const igText = 'Instagram - @studio_zoom_chennai'
    currentPage.drawText(igText, {
      x: colAmountRightX - fontRegular.widthOfTextAtSize(igText, 8),
      y: 48,
      size: 8,
      font: fontRegular,
      color: COLOR_PRIMARY_P1,
    })
  }

  return await doc.save()
}

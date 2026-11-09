import { PDFDocument, StandardFonts, rgb, type PDFImage, type PDFPage } from 'pdf-lib'
import type { Quotation } from '@/types'
import { formatPdfCurrency, numberToWordsINR } from '@/lib/payroll/calculator'
import { format } from 'date-fns'

const COLOR_TEXT = rgb(0.12, 0.12, 0.12)
const COLOR_TEXT_MUTED = rgb(0.42, 0.42, 0.42)
const COLOR_PRIMARY = rgb(0.776, 0.325, 0.624) // #c6539f
const COLOR_BORDER = rgb(0.85, 0.85, 0.85)
const COLOR_SURFACE_LIGHT = rgb(0.97, 0.97, 0.97)

/**
 * Fetch background template PDF or PNG bytes dynamically.
 * In Next.js client/SSR, static assets in /public are served via URL paths.
 */
async function loadTemplateAsset(
  templateId: Quotation['templateId'],
  type: 'pdf' | 'png'
): Promise<Uint8Array | null> {
  const fileNameMap: Record<string, string> = {
    production: type === 'pdf' ? 'template-production.pdf' : 'template-production.png',
    modern: type === 'pdf' ? 'template-modern.pdf' : 'template-modern.png',
    floral: type === 'pdf' ? 'template-floral.pdf' : 'template-floral.png',
  }
  const fileName = fileNameMap[templateId || 'production'] || (type === 'pdf' ? 'template-production.pdf' : 'template-production.png')
  const relativePath = type === 'pdf' ? `/templates/quotations/pdf/${fileName}` : `/templates/quotations/${fileName}`

  // Browser fetch
  if (typeof window !== 'undefined') {
    try {
      const res = await fetch(relativePath)
      if (res.ok) {
        const buf = await res.arrayBuffer()
        return new Uint8Array(buf)
      }
    } catch (e) {
      console.warn(`Could not fetch template ${type} via browser:`, e)
    }
  }

  return null
}

/**
 * Generates an in-memory vector PDF document with the selected Package 1, 2, or 3 template.
 */
export async function generateQuotationPdf(quotation: Quotation): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const template = quotation.templateId || 'production'

  let page: PDFPage

  // Attempt vector PDF template copy first for 100% vector sharpness
  const pdfBytes = await loadTemplateAsset(template, 'pdf')
  if (pdfBytes) {
    try {
      const templateDoc = await PDFDocument.load(pdfBytes)
      const [copiedPage] = await doc.copyPages(templateDoc, [0])
      page = doc.addPage(copiedPage)
    } catch {
      page = doc.addPage([595.28, 841.89])
    }
  } else {
    page = doc.addPage([595.28, 841.89])
    // Fallback to high-res raster PNG background
    const pngBytes = await loadTemplateAsset(template, 'png')
    if (pngBytes) {
      try {
        const bgImage: PDFImage = await doc.embedPng(pngBytes)
        page.drawImage(bgImage, {
          x: 0,
          y: 0,
          width: page.getWidth(),
          height: page.getHeight(),
        })
      } catch (err) {
        console.error('Failed to embed PNG template background:', err)
      }
    }
  }

  const { width } = page.getSize()
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica)
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)

  const marginX = 42
  const contentWidth = width - marginX * 2

  // ─────────────────────────────────────────────────────────────────────────────
  // TEMPLATE-SPECIFIC OVERLAYS
  // ─────────────────────────────────────────────────────────────────────────────
  let tableStartY = 540

  if (template === 'production') {
    // ── PACKAGE 1: Media Production Estimation ──────────────────────────────────
    // Top has: Place :, Date :, Respected Sir / Mam, Thank You for Giving us...
    // Footer has: Thank You, OFFICE: No.3 Kasturi Bai Nagar..., Email, Contact
    page.drawText(quotation.place || 'Chennai', {
      x: 92,
      y: 728,
      size: 10,
      font: fontRegular,
      color: COLOR_TEXT,
    })

    const qDate = quotation.createdAt ? format(quotation.createdAt, 'dd MMM yyyy') : format(new Date(), 'dd MMM yyyy')
    page.drawText(qDate, {
      x: 92,
      y: 708,
      size: 10,
      font: fontRegular,
      color: COLOR_TEXT,
    })

    page.drawText(`Quotation No: ${quotation.quotationNumber}`, {
      x: width - marginX - 165,
      y: 708,
      size: 9.5,
      font: fontBold,
      color: COLOR_PRIMARY,
    })

    // Prepared For
    page.drawText(`Prepared For:  ${quotation.clientName}  (${quotation.eventType})`, {
      x: marginX,
      y: 648,
      size: 11,
      font: fontBold,
      color: COLOR_TEXT,
    })

    if (quotation.contact) {
      page.drawText(`Contact: ${quotation.contact}  ${quotation.email ? `•  ${quotation.email}` : ''}`, {
        x: marginX,
        y: 634,
        size: 9,
        font: fontRegular,
        color: COLOR_TEXT_MUTED,
      })
    }

    tableStartY = 610
  } else if (template === 'modern') {
    // ── PACKAGE 2: Wedding Editorial Photo-Strip ────────────────────────────────
    // Top has: Wedding photo strip collage (rings, couple, shoes).
    // Center: Logo.
    // Bottom: PRICE - Rs. [value], Phone numbers, Instagram @studio_zoom_chennai
    page.drawText(`QUOTATION : ${quotation.quotationNumber}`, {
      x: marginX,
      y: 508,
      size: 10,
      font: fontBold,
      color: COLOR_PRIMARY,
    })

    const qDate = quotation.createdAt ? format(quotation.createdAt, 'dd MMM yyyy') : format(new Date(), 'dd MMM yyyy')
    page.drawText(`Date: ${qDate}  •  Valid Until: ${format(quotation.validityDate, 'dd MMM yyyy')}`, {
      x: width - marginX - 220,
      y: 508,
      size: 9,
      font: fontRegular,
      color: COLOR_TEXT_MUTED,
    })

    page.drawText(`${quotation.clientName}  —  ${quotation.eventType}`, {
      x: marginX,
      y: 490,
      size: 13,
      font: fontBold,
      color: COLOR_TEXT,
    })

    if (quotation.place || quotation.eventDate) {
      const evDateStr = quotation.eventDate ? format(quotation.eventDate, 'dd MMM yyyy') : ''
      page.drawText([quotation.place, evDateStr].filter(Boolean).join(' • '), {
        x: marginX,
        y: 476,
        size: 9,
        font: fontRegular,
        color: COLOR_TEXT_MUTED,
      })
    }

    tableStartY = 455
  } else if (template === 'floral') {
    // ── PACKAGE 3: Royal Floral Wedding with Dedicated Add-ons Section ──────────
    // Top: Blossom & Ring, Purple Badge "Wedding Quotation"
    // "Thank you for giving us this great oppurtunity. We're delighted to work for you"
    // Center Placeholder: [DATE - EVENT NAME]
    // Middle-Lower Section: ADD ONS
    // Footer: Contact numbers, studiozoomindia@gmail.com, studiozoom.in, floral corners
    const evDateStr = quotation.eventDate ? format(quotation.eventDate, 'dd MMM yyyy') : format(new Date(), 'dd MMM yyyy')
    const eventHeader = `${evDateStr} - ${quotation.eventType.toUpperCase()}`
    const evTextWidth = fontBold.widthOfTextAtSize(eventHeader, 10.5)

    // Center header exactly aligned with the template's "[DATE - EVENT NAME]" placeholder
    page.drawText(eventHeader, {
      x: (width - evTextWidth) / 2,
      y: 506,
      size: 10.5,
      font: fontBold,
      color: COLOR_TEXT_MUTED,
    })

    page.drawText(`Client: ${quotation.clientName}`, {
      x: marginX,
      y: 486,
      size: 11,
      font: fontBold,
      color: COLOR_TEXT,
    })

    page.drawText(`Quote: ${quotation.quotationNumber}  •  Valid: ${format(quotation.validityDate, 'dd MMM yyyy')}`, {
      x: width - marginX - 220,
      y: 486,
      size: 9,
      font: fontRegular,
      color: COLOR_TEXT_MUTED,
    })

    tableStartY = 465
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. MAIN DELIVERABLES TABLE
  // ─────────────────────────────────────────────────────────────────────────────
  let curY = tableStartY

  // Table header background bar
  page.drawRectangle({
    x: marginX,
    y: curY - 6,
    width: contentWidth,
    height: 18,
    color: COLOR_SURFACE_LIGHT,
    borderColor: COLOR_BORDER,
    borderWidth: 0.5,
  })

  page.drawText('DESCRIPTION / SERVICE', {
    x: marginX + 8,
    y: curY,
    size: 8,
    font: fontBold,
    color: COLOR_TEXT_MUTED,
  })

  page.drawText('QTY', {
    x: marginX + 280,
    y: curY,
    size: 8,
    font: fontBold,
    color: COLOR_TEXT_MUTED,
  })

  page.drawText('RATE (Rs.)', {
    x: marginX + 340,
    y: curY,
    size: 8,
    font: fontBold,
    color: COLOR_TEXT_MUTED,
  })

  page.drawText('AMOUNT (Rs.)', {
    x: marginX + 430,
    y: curY,
    size: 8,
    font: fontBold,
    color: COLOR_TEXT_MUTED,
  })

  curY -= 20

  // Draw Primary Line Items
  const items = quotation.lineItems || []
  const maxPrimaryItems = template === 'floral' ? 4 : 7

  for (let i = 0; i < items.length && i < maxPrimaryItems; i++) {
    const item = items[i]

    if (i % 2 === 1) {
      page.drawRectangle({
        x: marginX,
        y: curY - 4,
        width: contentWidth,
        height: 17,
        color: COLOR_SURFACE_LIGHT,
      })
    }

    let desc = item.description
    if (desc.length > 44) desc = desc.slice(0, 42) + '...'

    page.drawText(desc, {
      x: marginX + 8,
      y: curY,
      size: 8.5,
      font: fontRegular,
      color: COLOR_TEXT,
    })

    page.drawText(String(item.qty || 1), {
      x: marginX + 286,
      y: curY,
      size: 8.5,
      font: fontRegular,
      color: COLOR_TEXT,
    })

    page.drawText(formatPdfCurrency(item.rate), {
      x: marginX + 340,
      y: curY,
      size: 8.5,
      font: fontRegular,
      color: COLOR_TEXT,
    })

    const amtStr = formatPdfCurrency(item.amount)
    const amtWidth = fontBold.widthOfTextAtSize(amtStr, 8.5)
    page.drawText(amtStr, {
      x: marginX + 490 - amtWidth,
      y: curY,
      size: 8.5,
      font: fontBold,
      color: COLOR_TEXT,
    })

    curY -= 17
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. ADD-ONS & TOTALS BREAKDOWN (TEMPLATE-AWARE LAYOUT)
  // ─────────────────────────────────────────────────────────────────────────────
  const totalsBoxX = marginX + 260
  const totalsBoxW = contentWidth - 260
  const addons = quotation.addons || []

  if (template === 'floral') {
    // ── PACKAGE 3 (FLORAL) SPECIALIZED SECTIONS ──────────────────────────────
    // 1. Deliverables subtotal right below line items (above pre-printed ADD ONS)
    page.drawLine({
      start: { x: marginX, y: curY + 4 },
      end: { x: marginX + contentWidth, y: curY + 4 },
      thickness: 0.5,
      color: COLOR_BORDER,
    })
    curY -= 12

    const lineSubtotalStr = formatPdfCurrency(quotation.lineItems?.reduce((a, b) => a + (b.amount || 0), 0) || quotation.subtotal)
    page.drawText('Package Deliverables:', {
      x: totalsBoxX,
      y: curY,
      size: 8.5,
      font: fontBold,
      color: COLOR_TEXT,
    })
    page.drawText(lineSubtotalStr, {
      x: marginX + contentWidth - fontBold.widthOfTextAtSize(lineSubtotalStr, 8.5),
      y: curY,
      size: 8.5,
      font: fontBold,
      color: COLOR_PRIMARY,
    })

    curY -= 11
    const lineWords = numberToWordsINR(quotation.lineItems?.reduce((a, b) => a + (b.amount || 0), 0) || quotation.subtotal)
    page.drawText(`(${lineWords})`, {
      x: totalsBoxX,
      y: curY,
      size: 7,
      font: fontRegular,
      color: COLOR_TEXT_MUTED,
    })

    // 2. Add-ons rendered beneath the pre-printed "ADD ONS" template heading (y ≈ 208)
    curY = 208
    if (addons.length > 0) {
      for (let i = 0; i < addons.length && i < 3; i++) {
        const addon = addons[i]
        page.drawText(`-  ${addon.description}`, {
          x: marginX + 16,
          y: curY,
          size: 8.5,
          font: fontRegular,
          color: COLOR_TEXT,
        })
        const addonAmtStr = formatPdfCurrency(addon.amount)
        const amtWidth = fontBold.widthOfTextAtSize(addonAmtStr, 8.5)
        page.drawText(addonAmtStr, {
          x: marginX + contentWidth - amtWidth,
          y: curY,
          size: 8.5,
          font: fontBold,
          color: COLOR_TEXT,
        })
        curY -= 14
      }
    } else {
      page.drawText('-  None (No optional add-ons selected)', {
        x: marginX + 16,
        y: curY,
        size: 8,
        font: fontRegular,
        color: COLOR_TEXT_MUTED,
      })
      curY -= 14
    }

    // 3. Grand Total and GST bar above the footer (y ≈ 142)
    curY = Math.min(curY - 4, 142)
    if (quotation.gstEnabled) {
      const gstTotal = (quotation.cgst || 0) + (quotation.sgst || 0)
      const gstSummary = `Incl. 18% GST: ${formatPdfCurrency(gstTotal)}`
      page.drawText(gstSummary, {
        x: totalsBoxX,
        y: curY,
        size: 8,
        font: fontRegular,
        color: COLOR_TEXT_MUTED,
      })
      curY -= 13
    }

    page.drawRectangle({
      x: totalsBoxX - 6,
      y: curY - 4,
      width: totalsBoxW + 6,
      height: 18,
      color: COLOR_PRIMARY,
    })
    page.drawText('GRAND TOTAL:', {
      x: totalsBoxX,
      y: curY + 1,
      size: 9,
      font: fontBold,
      color: rgb(1, 1, 1),
    })
    const grandStr = formatPdfCurrency(quotation.grandTotal)
    page.drawText(grandStr, {
      x: marginX + contentWidth - fontBold.widthOfTextAtSize(grandStr, 9),
      y: curY + 1,
      size: 9,
      font: fontBold,
      color: rgb(1, 1, 1),
    })
  } else {
    // ── PACKAGE 1 & 2 STANDARD TOTALS & ADDONS ────────────────────────────────
    if (addons.length > 0) {
      curY -= 8
      page.drawText('ADD-ONS / OPTIONAL SERVICES', {
        x: marginX + 8,
        y: curY,
        size: 8.5,
        font: fontBold,
        color: COLOR_PRIMARY,
      })
      curY -= 14

      for (let i = 0; i < addons.length && i < 3; i++) {
        const addon = addons[i]
        page.drawText(`• ${addon.description}`, {
          x: marginX + 16,
          y: curY,
          size: 8,
          font: fontRegular,
          color: COLOR_TEXT,
        })
        const addonAmtStr = formatPdfCurrency(addon.amount)
        const amtWidth = fontBold.widthOfTextAtSize(addonAmtStr, 8)
        page.drawText(addonAmtStr, {
          x: marginX + contentWidth - amtWidth,
          y: curY,
          size: 8,
          font: fontBold,
          color: COLOR_TEXT,
        })
        curY -= 13
      }
    }

    // Divider under table
    page.drawLine({
      start: { x: marginX, y: curY + 4 },
      end: { x: marginX + contentWidth, y: curY + 4 },
      thickness: 0.5,
      color: COLOR_BORDER,
    })
    curY -= 12

    // Subtotal
    page.drawText('Subtotal:', {
      x: totalsBoxX,
      y: curY,
      size: 9,
      font: fontRegular,
      color: COLOR_TEXT_MUTED,
    })
    const subtotalStr = formatPdfCurrency(quotation.subtotal)
    page.drawText(subtotalStr, {
      x: marginX + contentWidth - fontBold.widthOfTextAtSize(subtotalStr, 9),
      y: curY,
      size: 9,
      font: fontBold,
      color: COLOR_TEXT,
    })
    curY -= 14

    // GST Breakdown (if enabled)
    if (quotation.gstEnabled) {
      page.drawText('CGST (9%):', {
        x: totalsBoxX,
        y: curY,
        size: 8.5,
        font: fontRegular,
        color: COLOR_TEXT_MUTED,
      })
      const cgstStr = formatPdfCurrency(quotation.cgst || 0)
      page.drawText(cgstStr, {
        x: marginX + contentWidth - fontRegular.widthOfTextAtSize(cgstStr, 8.5),
        y: curY,
        size: 8.5,
        font: fontRegular,
        color: COLOR_TEXT,
      })
      curY -= 12

      page.drawText('SGST (9%):', {
        x: totalsBoxX,
        y: curY,
        size: 8.5,
        font: fontRegular,
        color: COLOR_TEXT_MUTED,
      })
      const sgstStr = formatPdfCurrency(quotation.sgst || 0)
      page.drawText(sgstStr, {
        x: marginX + contentWidth - fontRegular.widthOfTextAtSize(sgstStr, 8.5),
        y: curY,
        size: 8.5,
        font: fontRegular,
        color: COLOR_TEXT,
      })
      curY -= 14
    }

    // Grand Total Highlight
    page.drawRectangle({
      x: totalsBoxX - 8,
      y: curY - 5,
      width: totalsBoxW + 8,
      height: 20,
      color: COLOR_PRIMARY,
    })
    page.drawText('GRAND TOTAL:', {
      x: totalsBoxX,
      y: curY,
      size: 9.5,
      font: fontBold,
      color: rgb(1, 1, 1),
    })
    const grandStr = formatPdfCurrency(quotation.grandTotal)
    page.drawText(grandStr, {
      x: marginX + contentWidth - fontBold.widthOfTextAtSize(grandStr, 9.5),
      y: curY,
      size: 9.5,
      font: fontBold,
      color: rgb(1, 1, 1),
    })
    curY -= 16

    // Amount in words
    const words = numberToWordsINR(quotation.grandTotal)
    page.drawText(`(${words})`, {
      x: totalsBoxX,
      y: curY,
      size: 7.5,
      font: fontRegular,
      color: COLOR_TEXT_MUTED,
    })

    // In Package 2: Stamp grand total right beside pre-printed "PRICE - Rs." at bottom (y ≈ 74)
    if (template === 'modern') {
      const priceNumberStr = `${quotation.grandTotal.toLocaleString('en-IN')}/-`
      page.drawText(priceNumberStr, {
        x: 335,
        y: 74,
        size: 13,
        font: fontBold,
        color: COLOR_TEXT,
      })
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. TERMS & CONDITIONS
  // ─────────────────────────────────────────────────────────────────────────────
  if (quotation.termsAndConditions) {
    page.drawText('Terms & Conditions:', {
      x: marginX,
      y: curY + 10,
      size: 8,
      font: fontBold,
      color: COLOR_TEXT_MUTED,
    })
    page.drawText(quotation.termsAndConditions.slice(0, 90), {
      x: marginX,
      y: curY,
      size: 7.5,
      font: fontRegular,
      color: COLOR_TEXT_MUTED,
    })
  }

  return await doc.save()
}

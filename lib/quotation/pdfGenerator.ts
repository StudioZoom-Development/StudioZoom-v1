import { PDFDocument, StandardFonts, rgb, type PDFImage } from 'pdf-lib'
import type { Quotation } from '@/types'
import { formatPdfCurrency, numberToWordsINR } from '@/lib/payroll/calculator'
import { format } from 'date-fns'

const COLOR_TEXT = rgb(0.12, 0.12, 0.12)
const COLOR_TEXT_MUTED = rgb(0.42, 0.42, 0.42)
const COLOR_PRIMARY = rgb(0.776, 0.325, 0.624) // #c6539f
const COLOR_BORDER = rgb(0.85, 0.85, 0.85)
const COLOR_SURFACE_LIGHT = rgb(0.97, 0.97, 0.97)

/**
 * Fetch background template image bytes dynamically.
 * In Next.js client/SSR, static assets in /public are served via URL paths.
 */
async function loadTemplateImageBytes(templateId: Quotation['templateId']): Promise<Uint8Array | null> {
  const fileNameMap: Record<string, string> = {
    production: 'template-production.png',
    modern: 'template-modern.png',
    floral: 'template-floral.png',
  }
  const fileName = fileNameMap[templateId || 'production'] || 'template-production.png'

  // Browser & Client fetch
  if (typeof window !== 'undefined') {
    try {
      const res = await fetch(`/templates/quotations/${fileName}`)
      if (res.ok) {
        const buf = await res.arrayBuffer()
        return new Uint8Array(buf)
      }
    } catch (e) {
      console.warn('Could not fetch template image via browser fetch:', e)
    }
  }

  return null
}

/**
 * Generates an in-memory vector PDF document with the selected template stationery.
 */
export async function generateQuotationPdf(quotation: Quotation): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([595.28, 841.89]) // A4 Portrait
  const { width, height } = page.getSize()

  const fontRegular = await doc.embedFont(StandardFonts.Helvetica)
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)

  // ─── 1. DRAW BACKGROUND TEMPLATE STATIONERY ──────────────────────────────────
  const templateBytes = await loadTemplateImageBytes(quotation.templateId)
  if (templateBytes) {
    try {
      const bgImage: PDFImage = await doc.embedPng(templateBytes)
      page.drawImage(bgImage, {
        x: 0,
        y: 0,
        width,
        height,
      })
    } catch (err) {
      console.error('Failed to embed template background:', err)
    }
  }

  const marginX = 42
  const contentWidth = width - marginX * 2

  // ─── 2. TEMPLATE-SPECIFIC OVERLAYS ───────────────────────────────────────────
  // Coordinates tuned for the 3 distinct stationery designs:
  const template = quotation.templateId || 'production'

  let tableStartY = 540

  if (template === 'production') {
    // Media production template:
    // Has "Place :", "Date :", "Respected Sir / Mam," at top.
    // Office address at bottom.
    // Place & Date
    page.drawText(quotation.place || 'Chennai', {
      x: 90,
      y: 728,
      size: 10,
      font: fontRegular,
      color: COLOR_TEXT,
    })

    const qDate = quotation.createdAt ? format(quotation.createdAt, 'dd MMM yyyy') : format(new Date(), 'dd MMM yyyy')
    page.drawText(qDate, {
      x: 90,
      y: 708,
      size: 10,
      font: fontRegular,
      color: COLOR_TEXT,
    })

    // Quotation number on the right
    page.drawText(`Quotation No: ${quotation.quotationNumber}`, {
      x: width - marginX - 160,
      y: 708,
      size: 9.5,
      font: fontBold,
      color: COLOR_PRIMARY,
    })

    // Prepared For / Event banner
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
    // Minimal Wedding Editorial:
    // Top photo collage occupies up to y ≈ 520.
    // Middle section (y: 510 to 180) is clear white for line items.
    // Bottom contains "PRICE - Rs." and contact info.
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
    // Royal Floral Wedding:
    // Top header + ornamental badge down to y ≈ 580.
    // Has "DATE - EVENT NAME" placeholder around y: 500.
    // Add-ons around y: 220.
    const evDateStr = quotation.eventDate ? format(quotation.eventDate, 'dd MMM yyyy') : format(new Date(), 'dd MMM yyyy')
    const eventHeader = `${evDateStr} - ${quotation.eventType.toUpperCase()}`
    const evTextWidth = fontBold.widthOfTextAtSize(eventHeader, 10.5)
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

    page.drawText(`Quote: ${quotation.quotationNumber}  •  Valid Until: ${format(quotation.validityDate, 'dd MMM yyyy')}`, {
      x: width - marginX - 220,
      y: 486,
      size: 9,
      font: fontRegular,
      color: COLOR_TEXT_MUTED,
    })

    tableStartY = 465
  }

  // ─── 3. ITEM TABLE ───────────────────────────────────────────────────────────
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

  // Draw Line Items
  const items = quotation.lineItems || []
  for (let i = 0; i < items.length; i++) {
    const item = items[i]

    // Alternate soft zebra
    if (i % 2 === 1) {
      page.drawRectangle({
        x: marginX,
        y: curY - 4,
        width: contentWidth,
        height: 17,
        color: COLOR_SURFACE_LIGHT,
      })
    }

    // Truncate description if long
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
    // Avoid running into footer
    if (curY < 170) break
  }

  // Divider under table
  page.drawLine({
    start: { x: marginX, y: curY + 6 },
    end: { x: marginX + contentWidth, y: curY + 6 },
    thickness: 0.5,
    color: COLOR_BORDER,
  })

  curY -= 10

  // ─── 4. TOTALS & GST BREAKDOWN ───────────────────────────────────────────────
  const totalsBoxX = marginX + 270
  const totalsBoxW = contentWidth - 270

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

  curY -= 15

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

    curY -= 13

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

    curY -= 15
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

  curY -= 18

  // Amount in words
  const words = numberToWordsINR(quotation.grandTotal)
  page.drawText(`(${words})`, {
    x: totalsBoxX,
    y: curY,
    size: 7.5,
    font: fontRegular,
    color: COLOR_TEXT_MUTED,
  })

  // ─── 5. NOTES OR TERMS (if any) ──────────────────────────────────────────────
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

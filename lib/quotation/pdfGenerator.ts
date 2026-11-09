import { PDFDocument, StandardFonts, rgb, type PDFImage, type PDFPage } from 'pdf-lib'
import type { Quotation, QuotationTemplateId } from '@/types'
import { formatPdfCurrency, numberToWordsINR } from '@/lib/payroll/calculator'
import { format } from 'date-fns'

const COLOR_TEXT = rgb(0.12, 0.12, 0.12)
const COLOR_TEXT_MUTED = rgb(0.42, 0.42, 0.42)
const COLOR_PRIMARY = rgb(0.776, 0.325, 0.624) // #c6539f
const COLOR_BORDER = rgb(0.85, 0.85, 0.85)
const COLOR_SURFACE_LIGHT = rgb(0.97, 0.97, 0.97)

/**
 * Normalizes template ID to one of the 3 packages:
 * package1 = Package 1 (Wedding Editorial)
 * package2 = Package 2 (Media Production Estimation)
 * package3 = Package 3 (Royal Wedding with Add-ons)
 */
export function normalizeTemplateKey(id?: QuotationTemplateId): 'package1' | 'package2' | 'package3' {
  if (id === 'package2' || id === 'production') return 'package2'
  if (id === 'package3' || id === 'floral') return 'package3'
  return 'package1' // default
}

/**
 * Fetch background template PDF or PNG bytes dynamically.
 */
async function loadTemplateAsset(
  templateKey: 'package1' | 'package2' | 'package3',
  type: 'pdf' | 'png'
): Promise<Uint8Array | null> {
  const fileNameMap: Record<string, string> = {
    package1: `package-1.${type}`,
    package2: `package-2.${type}`,
    package3: `package-3.${type}`,
  }
  const fileName = fileNameMap[templateKey] || `package-1.${type}`
  const relativePath = type === 'pdf' ? `/templates/quotations/pdf/${fileName}` : `/templates/quotations/${fileName}`

  if (typeof window !== 'undefined') {
    try {
      const res = await fetch(relativePath)
      if (res.ok) {
        return new Uint8Array(await res.arrayBuffer())
      }
    } catch (e) {
      console.warn(`Could not fetch template ${type} via browser:`, e)
    }
  }

  return null
}

/**
 * Loads Studio Zoom logo for embedding in Package 1.
 */
async function loadLogoAsset(): Promise<Uint8Array | null> {
  if (typeof window !== 'undefined') {
    try {
      const res = await fetch('/logo.png')
      if (res.ok) {
        return new Uint8Array(await res.arrayBuffer())
      }
    } catch {
      // ignore
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

  let page: PDFPage

  // Attempt vector PDF template copy first
  const pdfBytes = await loadTemplateAsset(templateKey, 'pdf')
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
    const pngBytes = await loadTemplateAsset(templateKey, 'png')
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

  const marginX = 44
  const contentWidth = width - marginX * 2

  const qDate = quotation.createdAt ? format(quotation.createdAt, 'dd MMM yyyy') : format(new Date(), 'dd MMM yyyy')
  const validDateStr = format(quotation.validityDate, 'dd MMM yyyy')
  const evDateStr = quotation.eventDate ? format(quotation.eventDate, 'dd MMM yyyy') : qDate

  let tableStartY = 370

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. TEMPLATE HEADERS & METADATA (FITTED INTO WHITE SPACES)
  // ─────────────────────────────────────────────────────────────────────────────
  if (templateKey === 'package1') {
    // ── PACKAGE 1: Wedding Editorial ──────────────────────────────────────────
    // Background photo collage ends at y ≈ 492 pt.
    // {Header}: Logo, then client info, then deliverables
    const logoBytes = await loadLogoAsset()
    if (logoBytes) {
      try {
        const logoImg = await doc.embedPng(logoBytes)
        page.drawImage(logoImg, {
          x: (width - 55) / 2,
          y: 435,
          width: 55,
          height: 42,
        })
      } catch {
        // Fallback text if image embedding fails
        const logoText = 'STUDIO ZOOM'
        const tw = fontBold.widthOfTextAtSize(logoText, 14)
        page.drawText(logoText, {
          x: (width - tw) / 2,
          y: 445,
          size: 14,
          font: fontBold,
          color: COLOR_PRIMARY,
        })
      }
    }

    page.drawText(`QUOTATION : ${quotation.quotationNumber}`, {
      x: marginX,
      y: 412,
      size: 9.5,
      font: fontBold,
      color: COLOR_PRIMARY,
    })

    page.drawText(`Date: ${qDate}  •  Valid Until: ${validDateStr}`, {
      x: width - marginX - 210,
      y: 412,
      size: 8.5,
      font: fontRegular,
      color: COLOR_TEXT_MUTED,
    })

    page.drawText(`${quotation.clientName}  —  ${quotation.eventType}`, {
      x: marginX,
      y: 394,
      size: 12,
      font: fontBold,
      color: COLOR_TEXT,
    })

    if (quotation.place) {
      page.drawText(quotation.place, {
        x: marginX,
        y: 380,
        size: 8.5,
        font: fontRegular,
        color: COLOR_TEXT_MUTED,
      })
    }

    tableStartY = 365
  } else if (templateKey === 'package2') {
    // ── PACKAGE 2: Media Production Estimation ────────────────────────────────
    // Background pink banner ends at y ≈ 697 pt.
    // {Header}: Place, Date, Quotation No
    page.drawText(`Place :  ${quotation.place || 'Chennai'}`, {
      x: 46,
      y: 672,
      size: 10,
      font: fontRegular,
      color: COLOR_TEXT,
    })

    page.drawText(`Date :  ${qDate}`, {
      x: 46,
      y: 654,
      size: 10,
      font: fontRegular,
      color: COLOR_TEXT,
    })

    page.drawText(`Quotation No: ${quotation.quotationNumber}`, {
      x: 390,
      y: 654,
      size: 9.5,
      font: fontBold,
      color: COLOR_PRIMARY,
    })

    // {Body}: Respected Sir / Mam, greeting
    page.drawText('Respected Sir / Mam,', {
      x: 46,
      y: 620,
      size: 10.5,
      font: fontBold,
      color: COLOR_TEXT,
    })

    page.drawText('Thank You for Giving us this Great Oppurtunity.', {
      x: 46,
      y: 602,
      size: 10,
      font: fontRegular,
      color: COLOR_TEXT,
    })

    page.drawText("We're delighted to Work with you.", {
      x: 46,
      y: 586,
      size: 10,
      font: fontRegular,
      color: COLOR_TEXT,
    })

    page.drawText(`Prepared For:  ${quotation.clientName}  (${quotation.eventType})`, {
      x: 46,
      y: 558,
      size: 10.5,
      font: fontBold,
      color: COLOR_TEXT,
    })

    tableStartY = 530
  } else if (templateKey === 'package3') {
    // ── PACKAGE 3: Royal Wedding with Add-ons ─────────────────────────────────
    // Background blossom & purple badge ends at y ≈ 532 pt.
    // {Header}: Greeting & Event Name
    const gText = "Thank you for giving us this great oppurtunity. We're delighted to work for you"
    page.drawText(gText, {
      x: (width - fontRegular.widthOfTextAtSize(gText, 9)) / 2,
      y: 514,
      size: 9,
      font: fontRegular,
      color: COLOR_TEXT_MUTED,
    })

    const evHeader = `${evDateStr} - ${quotation.eventType.toUpperCase()}`
    page.drawText(evHeader, {
      x: (width - fontBold.widthOfTextAtSize(evHeader, 10.5)) / 2,
      y: 494,
      size: 10.5,
      font: fontBold,
      color: COLOR_TEXT,
    })

    page.drawText(`Client: ${quotation.clientName}`, {
      x: marginX,
      y: 470,
      size: 10.5,
      font: fontBold,
      color: COLOR_TEXT,
    })

    page.drawText(`Quote: ${quotation.quotationNumber}  •  Valid: ${validDateStr}`, {
      x: width - marginX - 210,
      y: 470,
      size: 8.5,
      font: fontRegular,
      color: COLOR_TEXT_MUTED,
    })

    tableStartY = 446
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. MAIN DELIVERABLES TABLE
  // ─────────────────────────────────────────────────────────────────────────────
  let curY = tableStartY

  page.drawRectangle({
    x: marginX,
    y: curY - 5,
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

  curY -= 19

  // Draw Primary Line Items
  const items = quotation.lineItems || []
  const maxPrimaryItems = templateKey === 'package3' ? 4 : templateKey === 'package1' ? 4 : 6

  for (let i = 0; i < items.length && i < maxPrimaryItems; i++) {
    const item = items[i]

    if (i % 2 === 1) {
      page.drawRectangle({
        x: marginX,
        y: curY - 4,
        width: contentWidth,
        height: 16,
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
      x: marginX + contentWidth - amtWidth - 4,
      y: curY,
      size: 8.5,
      font: fontBold,
      color: COLOR_TEXT,
    })

    curY -= 16
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. BODY SECTIONS & ADDONS SPECIFIC TO EACH PACKAGE
  // ─────────────────────────────────────────────────────────────────────────────
  const totalsBoxX = marginX + 260
  const totalsBoxW = contentWidth - 260
  const addons = quotation.addons || []

  if (templateKey === 'package3') {
    // ── PACKAGE 3 ADD-ONS & TOTALS ────────────────────────────────────────────
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

    // ADDONS heading
    curY = 290
    page.drawText('ADD ONS', {
      x: marginX + 4,
      y: curY,
      size: 9.5,
      font: fontBold,
      color: COLOR_PRIMARY,
    })
    curY -= 18

    if (addons.length > 0) {
      for (let i = 0; i < addons.length && i < 3; i++) {
        const addon = addons[i]
        page.drawText(`-  ${addon.description}`, {
          x: marginX + 12,
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
        curY -= 16
      }
    } else {
      page.drawText('-  None (No optional add-ons selected)', {
        x: marginX + 12,
        y: curY,
        size: 8,
        font: fontRegular,
        color: COLOR_TEXT_MUTED,
      })
      curY -= 16
    }

    // Totals bar above the pre-printed footer
    curY = 165
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
  } else if (templateKey === 'package2') {
    // ── PACKAGE 2 TOTALS, "THANK YOU!" & OFFICE FOOTER ────────────────────────
    if (addons.length > 0) {
      curY -= 6
      page.drawText('ADD-ONS', {
        x: marginX + 8,
        y: curY,
        size: 8,
        font: fontBold,
        color: COLOR_PRIMARY,
      })
      curY -= 13

      for (let i = 0; i < addons.length && i < 2; i++) {
        const addon = addons[i]
        page.drawText(`• ${addon.description}`, {
          x: marginX + 16,
          y: curY,
          size: 8,
          font: fontRegular,
          color: COLOR_TEXT,
        })
        const addonAmtStr = formatPdfCurrency(addon.amount)
        page.drawText(addonAmtStr, {
          x: marginX + contentWidth - fontBold.widthOfTextAtSize(addonAmtStr, 8),
          y: curY,
          size: 8,
          font: fontBold,
          color: COLOR_TEXT,
        })
        curY -= 12
      }
    }

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
    curY -= 13

    if (quotation.gstEnabled) {
      page.drawText('CGST (9%):', { x: totalsBoxX, y: curY, size: 8, font: fontRegular, color: COLOR_TEXT_MUTED })
      const cgstStr = formatPdfCurrency(quotation.cgst || 0)
      page.drawText(cgstStr, { x: marginX + contentWidth - fontRegular.widthOfTextAtSize(cgstStr, 8), y: curY, size: 8, font: fontRegular, color: COLOR_TEXT })
      curY -= 11

      page.drawText('SGST (9%):', { x: totalsBoxX, y: curY, size: 8, font: fontRegular, color: COLOR_TEXT_MUTED })
      const sgstStr = formatPdfCurrency(quotation.sgst || 0)
      page.drawText(sgstStr, { x: marginX + contentWidth - fontRegular.widthOfTextAtSize(sgstStr, 8), y: curY, size: 8, font: fontRegular, color: COLOR_TEXT })
      curY -= 13
    }

    page.drawRectangle({
      x: totalsBoxX - 6,
      y: curY - 4,
      width: totalsBoxW + 6,
      height: 18,
      color: COLOR_PRIMARY,
    })
    page.drawText('GRAND TOTAL:', { x: totalsBoxX, y: curY + 1, size: 9, font: fontBold, color: rgb(1, 1, 1) })
    const grandStr = formatPdfCurrency(quotation.grandTotal)
    page.drawText(grandStr, {
      x: marginX + contentWidth - fontBold.widthOfTextAtSize(grandStr, 9),
      y: curY + 1,
      size: 9,
      font: fontBold,
      color: rgb(1, 1, 1),
    })

    // "Thank You!" centered
    const tyStr = 'Thank You!'
    const tyWidth = fontBold.widthOfTextAtSize(tyStr, 13)
    page.drawText(tyStr, {
      x: (width - tyWidth) / 2,
      y: 125,
      size: 13,
      font: fontBold,
      color: COLOR_TEXT,
    })

    // {Footer}: OFFICE Address on left end
    page.drawText('OFFICE:', {
      x: 46,
      y: 92,
      size: 8.5,
      font: fontBold,
      color: COLOR_TEXT,
    })
    page.drawText('No.3, Kasturi Bai Nagar,N.M.Road, Avadi, Chennai-54.', {
      x: 46,
      y: 78,
      size: 7.5,
      font: fontRegular,
      color: COLOR_TEXT_MUTED,
    })
    page.drawText('E-mail : studiozoomindia@gmail.com', {
      x: 46,
      y: 66,
      size: 7.5,
      font: fontRegular,
      color: COLOR_TEXT_MUTED,
    })
    page.drawText('Contact : +91 9381029555 , +91 8072183903.', {
      x: 46,
      y: 54,
      size: 7.5,
      font: fontRegular,
      color: COLOR_TEXT_MUTED,
    })
  } else if (templateKey === 'package1') {
    // ── PACKAGE 1 TOTALS & FOOTER ─────────────────────────────────────────────
    if (addons.length > 0) {
      curY -= 6
      page.drawText('ADD-ONS', {
        x: marginX + 8,
        y: curY,
        size: 8,
        font: fontBold,
        color: COLOR_PRIMARY,
      })
      curY -= 13

      for (let i = 0; i < addons.length && i < 2; i++) {
        const addon = addons[i]
        page.drawText(`• ${addon.description}`, {
          x: marginX + 16,
          y: curY,
          size: 8,
          font: fontRegular,
          color: COLOR_TEXT,
        })
        const addonAmtStr = formatPdfCurrency(addon.amount)
        page.drawText(addonAmtStr, {
          x: marginX + contentWidth - fontBold.widthOfTextAtSize(addonAmtStr, 8),
          y: curY,
          size: 8,
          font: fontBold,
          color: COLOR_TEXT,
        })
        curY -= 12
      }
    }

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
    curY -= 13

    if (quotation.gstEnabled) {
      page.drawText('CGST (9%):', { x: totalsBoxX, y: curY, size: 8, font: fontRegular, color: COLOR_TEXT_MUTED })
      const cgstStr = formatPdfCurrency(quotation.cgst || 0)
      page.drawText(cgstStr, { x: marginX + contentWidth - fontRegular.widthOfTextAtSize(cgstStr, 8), y: curY, size: 8, font: fontRegular, color: COLOR_TEXT })
      curY -= 11

      page.drawText('SGST (9%):', { x: totalsBoxX, y: curY, size: 8, font: fontRegular, color: COLOR_TEXT_MUTED })
      const sgstStr = formatPdfCurrency(quotation.sgst || 0)
      page.drawText(sgstStr, { x: marginX + contentWidth - fontRegular.widthOfTextAtSize(sgstStr, 8), y: curY, size: 8, font: fontRegular, color: COLOR_TEXT })
      curY -= 13
    }

    page.drawRectangle({
      x: totalsBoxX - 6,
      y: curY - 4,
      width: totalsBoxW + 6,
      height: 18,
      color: COLOR_PRIMARY,
    })
    page.drawText('GRAND TOTAL:', { x: totalsBoxX, y: curY + 1, size: 9, font: fontBold, color: rgb(1, 1, 1) })
    const grandStr = formatPdfCurrency(quotation.grandTotal)
    page.drawText(grandStr, {
      x: marginX + contentWidth - fontBold.widthOfTextAtSize(grandStr, 9),
      y: curY + 1,
      size: 9,
      font: fontBold,
      color: rgb(1, 1, 1),
    })

    // {Footer}: Contact and Instagram
    page.drawLine({
      start: { x: marginX, y: 72 },
      end: { x: marginX + contentWidth, y: 72 },
      thickness: 0.5,
      color: COLOR_BORDER,
    })

    page.drawText('Contact', {
      x: marginX,
      y: 56,
      size: 8.5,
      font: fontBold,
      color: COLOR_TEXT,
    })
    page.drawText('+91 93810 29555  |  +91 80721 83903', {
      x: marginX,
      y: 44,
      size: 8,
      font: fontRegular,
      color: COLOR_TEXT_MUTED,
    })

    const igStr = 'Instagram - @studio_zoom_chennai'
    page.drawText(igStr, {
      x: marginX + contentWidth - fontRegular.widthOfTextAtSize(igStr, 8.5),
      y: 50,
      size: 8.5,
      font: fontRegular,
      color: COLOR_PRIMARY,
    })
  }

  return await doc.save()
}

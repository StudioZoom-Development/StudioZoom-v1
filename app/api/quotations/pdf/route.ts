import { NextRequest, NextResponse } from 'next/server'
import { renderQuotationHtml } from '@/lib/quotation/htmlTemplateEngine'
import { getQuotationById } from '@/lib/firebase/queries/quotations'
import type { Quotation } from '@/types'
import puppeteer from 'puppeteer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    let quotation: Quotation | null = body.quotation || (body.lineItems ? body : null)

    if (!quotation && (body.id || body.quotationId)) {
      quotation = await getQuotationById(body.id || body.quotationId)
    }

    if (!quotation) {
      return NextResponse.json({ error: 'Quotation not found or invalid payload' }, { status: 400 })
    }

    // Render HTML with linkedom on the server
    const html = await renderQuotationHtml(quotation)

    // Launch headless Chromium
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    })

    try {
      const page = await browser.newPage()
      await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 2 })
      await page.setContent(html, { waitUntil: 'load' })
      await page.evaluate(() => document.fonts.ready)

      const pdfUint8Array = await page.pdf({
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
        margin: { top: 0, right: 0, bottom: 0, left: 0 },
      })

      const filename = `Quotation_${quotation.quotationNumber || 'draft'}.pdf`

      return new Response(Buffer.from(pdfUint8Array), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      })
    } finally {
      await browser.close()
    }
  } catch (error: unknown) {
    const rawMessage = error instanceof Error ? error.message : 'Failed to generate PDF'
    const message = rawMessage.includes('Could not find Chrome')
      ? 'Headless Chromium is not installed on this server. Please use the in-app Print / Save as PDF feature.'
      : rawMessage
    console.error('[Quotation PDF Route Error]:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

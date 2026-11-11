/**
 * invoiceHtmlRenderer.ts
 *
 * Renders an Invoice as a plain, Zoho-style branded A4 HTML document
 * featuring the Studio Zoom logo, GST split logic (CGST+SGST for Tamil Nadu
 * vs IGST for out-of-state), single-line Advance Received, PAID stamp when
 * settled, Bank/UPI payment details, and print-ready @page A4 CSS.
 */

import { format } from 'date-fns'
import type { Invoice, InvoicePaymentTerms } from '@/types'
import type { StudioBranding } from '@/lib/firebase/queries/settings'
import { numberToWordsINR } from '@/lib/payroll/calculator'

function esc(text: string): string {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatInr(amount: number): string {
  const num = Number(amount) || 0
  return `₹${Math.round(num).toLocaleString('en-IN')}`
}

function fmtDate(d: Date | string | undefined | null): string {
  if (!d) return ''
  try {
    const date = typeof d === 'string' ? new Date(d) : d
    if (Number.isNaN(date.getTime())) return ''
    return format(date, 'dd MMM yyyy')
  } catch {
    return ''
  }
}

function formatTermsLabel(terms: InvoicePaymentTerms): string {
  switch (terms) {
    case 'dueOnReceipt':
      return 'Due on Receipt'
    case 'net7':
      return 'Net 7 Days'
    case 'net15':
      return 'Net 15 Days'
    case 'net30':
      return 'Net 30 Days'
    case 'custom':
      return 'Custom Date'
    default:
      return 'Due on Receipt'
  }
}

let cachedLogoDataUrl: string | null = null

export async function getStudioLogoDataUrl(): Promise<string> {
  if (cachedLogoDataUrl) return cachedLogoDataUrl
  if (typeof window === 'undefined') return '/logo.png'
  try {
    const res = await fetch('/logo.png')
    if (!res.ok) return `${window.location.origin}/logo.png`
    const blob = await res.blob()
    const dataUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : '/logo.png')
      reader.onerror = () => resolve(`${window.location.origin}/logo.png`)
      reader.readAsDataURL(blob)
    })
    cachedLogoDataUrl = dataUrl
    return dataUrl
  } catch {
    return `${window.location.origin}/logo.png`
  }
}

export interface InvoiceRenderOptions {
  branding?: StudioBranding | null
  studioName?: string
  logoSrc?: string
}

export async function renderInvoiceHtml(
  invoice: Invoice,
  options: InvoiceRenderOptions = {}
): Promise<string> {
  const branding = options.branding
  const studioTitle =
    options.studioName ||
    branding?.studioName ||
    (invoice.studioId === 'studio-zoom-productions' ? 'Studio Zoom Productions' : 'Studio Zoom')

  const logoSrc = options.logoSrc || (await getStudioLogoDataUrl())

  const phones = [branding?.phone, branding?.secondaryPhone].filter(Boolean).join('  |  ')
  const addressLine = [branding?.address, branding?.city].filter(Boolean).join(', ')

  const gstEnabled = Boolean(invoice.gstEnabled)
  const docTitle = gstEnabled ? 'TAX INVOICE' : 'INVOICE'
  const gstRate = Number(invoice.gstRate) || 18
  const halfRate = Number((gstRate / 2).toFixed(2))
  const isIgst = invoice.gstSplit === 'igst'

  const items = invoice.lineItems ?? []
  const showSacCol = gstEnabled && items.some((it) => Boolean(it.sacCode?.trim()))
  const showLineDiscCol = invoice.discountType === 'perLine' && items.some((it) => (Number(it.discount) || 0) > 0)

  const rowsHtml =
    items.length > 0
      ? items
          .map((item, idx) => {
            const qty = Number(item.qty) || 0
            const rate = Number(item.rate) || 0
            const lineDisc = Number(item.discount) || 0
            const lineAmount =
              invoice.discountType === 'perLine'
                ? Math.max(0, qty * rate - lineDisc)
                : qty * rate

            return `
              <tr>
                <td class="c-idx">${idx + 1}</td>
                <td class="c-desc">
                  <div class="item-title">${esc(item.description || 'Service')}</div>
                  ${item.subDescription ? `<div class="item-sub">${esc(item.subDescription)}</div>` : ''}
                </td>
                ${showSacCol ? `<td class="c-sac">${esc(item.sacCode || '—')}</td>` : ''}
                <td class="c-qty">${qty}</td>
                <td class="c-num">${formatInr(rate)}</td>
                ${showLineDiscCol ? `<td class="c-num">${lineDisc > 0 ? `-${formatInr(lineDisc)}` : '—'}</td>` : ''}
                <td class="c-num c-amt">${formatInr(lineAmount)}</td>
              </tr>
            `
          })
          .join('')
      : `<tr><td colspan="${4 + (showSacCol ? 1 : 0) + (showLineDiscCol ? 1 : 0)}" class="empty-row">No line items added yet</td></tr>`

  const bankLines: string[] = []
  if (branding?.bankName) bankLines.push(`<div><span>Bank:</span> ${esc(branding.bankName)}</div>`)
  if (branding?.accountHolder) bankLines.push(`<div><span>Account Name:</span> ${esc(branding.accountHolder)}</div>`)
  if (branding?.accountNumber) bankLines.push(`<div><span>Account No:</span> ${esc(branding.accountNumber)}</div>`)
  if (branding?.ifsc) bankLines.push(`<div><span>IFSC:</span> ${esc(branding.ifsc)}</div>`)
  if (branding?.upiId) bankLines.push(`<div><span>UPI ID:</span> ${esc(branding.upiId)}</div>`)

  const totalAmount = Number(invoice.totalAmount) || 0
  const amountPaid = Number(invoice.amountPaid) || 0
  const balanceDue = Math.max(0, Number(invoice.balanceDue) ?? totalAmount - amountPaid)
  const isPaid = totalAmount > 0 && balanceDue <= 0

  const discountVal = Number(invoice.discountAmount) || 0
  const taxableVal = Number(invoice.taxableAmount) || Math.max(0, (Number(invoice.subtotal) || 0) - discountVal)

  const termsText = (invoice.termsAndConditions || branding?.defaultTerms || '').trim()
  const thankYouText =
    (invoice.thankYouNote || branding?.thankYouNote || '').trim() ||
    'Thank you for choosing Studio Zoom to capture your special moments!'

  const eventDateFormatted = fmtDate(invoice.eventDate)

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(docTitle)} - ${esc(invoice.invoiceNumber)}</title>
<style>
  @page {
    size: A4;
    margin: 0;
  }
  * {
    box-sizing: border-box;
  }
  html, body {
    margin: 0;
    padding: 0;
    background: #ffffff;
    color: #18181b;
    font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  @media print {
    html, body {
      background: none;
    }
    .page {
      margin: 0 !important;
      box-shadow: none !important;
    }
  }
  .page {
    width: 210mm;
    min-height: 297mm;
    padding: 14mm 15mm 13mm 15mm;
    margin: 0 auto;
    background: #ffffff;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }
  .top-bar-accent {
    height: 4px;
    background: #c6539f;
    border-radius: 2px;
    margin-bottom: 16px;
  }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 20px;
    padding-bottom: 16px;
    border-bottom: 1px solid #e4e4e7;
  }
  .brand-col {
    flex: 1;
    max-width: 58%;
  }
  .brand-logo-wrap {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 8px;
  }
  .brand-logo {
    height: 42px;
    width: auto;
    object-fit: contain;
    background: #181d19;
    padding: 5px 10px;
    border-radius: 6px;
  }
  .brand-name {
    font-size: 18px;
    font-weight: 700;
    color: #18181b;
    letter-spacing: -0.02em;
  }
  .brand-meta {
    font-size: 10.5px;
    line-height: 1.55;
    color: #52525b;
  }
  .brand-gstin {
    margin-top: 3px;
    font-weight: 600;
    color: #18181b;
  }
  .invoice-col {
    text-align: right;
    min-width: 210px;
  }
  .doc-title {
    font-size: 24px;
    font-weight: 800;
    letter-spacing: 0.03em;
    color: #c6539f;
    margin: 0 0 8px 0;
    line-height: 1.1;
  }
  .meta-table {
    margin-left: auto;
    border-collapse: collapse;
    font-size: 10.5px;
  }
  .meta-table td {
    padding: 2.5px 0;
  }
  .meta-label {
    color: #71717a;
    padding-right: 14px !important;
    text-align: right;
  }
  .meta-val {
    font-weight: 600;
    color: #18181b;
    text-align: right;
  }

  /* BILL TO & EVENT INFO */
  .parties-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
    padding: 14px 0;
    border-bottom: 1px solid #e4e4e7;
  }
  .party-box {
    background: #fafafa;
    border: 0.5px solid #e4e4e7;
    border-radius: 6px;
    padding: 11px 14px;
  }
  .box-label {
    font-size: 9.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #71717a;
    margin-bottom: 5px;
  }
  .client-name {
    font-size: 13px;
    font-weight: 700;
    color: #18181b;
    margin-bottom: 3px;
  }
  .party-line {
    font-size: 10.5px;
    line-height: 1.5;
    color: #3f3f46;
  }
  .party-gstin {
    margin-top: 3px;
    font-size: 10.5px;
    font-weight: 600;
    color: #18181b;
  }

  /* LINE ITEMS TABLE */
  .items-wrap {
    margin-top: 14px;
  }
  table.items {
    width: 100%;
    border-collapse: collapse;
    font-size: 11px;
  }
  table.items thead th {
    background: #181d19;
    color: #ffffff;
    font-size: 9.5px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 8px 10px;
    text-align: left;
  }
  table.items thead th.c-qty,
  table.items thead th.c-sac {
    text-align: center;
  }
  table.items thead th.c-num {
    text-align: right;
  }
  table.items tbody td {
    padding: 9px 10px;
    border-bottom: 0.5px solid #e4e4e7;
    vertical-align: top;
    color: #27272a;
  }
  table.items tbody tr:nth-child(even) td {
    background: #fcfcfd;
  }
  .c-idx {
    width: 28px;
    color: #71717a;
    font-weight: 500;
  }
  .c-desc {
    min-width: 220px;
  }
  .item-title {
    font-weight: 600;
    color: #18181b;
    line-height: 1.35;
  }
  .item-sub {
    font-size: 9.8px;
    color: #71717a;
    margin-top: 2px;
    line-height: 1.35;
    white-space: pre-line;
  }
  .c-sac {
    width: 68px;
    text-align: center;
    font-size: 10px;
    color: #52525b;
  }
  .c-qty {
    width: 48px;
    text-align: center;
    font-weight: 500;
  }
  .c-num {
    width: 92px;
    text-align: right;
    white-space: nowrap;
  }
  .c-amt {
    font-weight: 600;
    color: #18181b;
  }
  .empty-row {
    text-align: center;
    color: #a1a1aa;
    padding: 20px !important;
    font-style: italic;
  }

  /* LOWER SPLIT: WORDS + PAYMENT INFO vs TOTALS */
  .summary-grid {
    display: grid;
    grid-template-columns: 1.15fr 0.85fr;
    gap: 22px;
    margin-top: 16px;
    align-items: start;
  }
  .words-box {
    background: #fafafa;
    border: 0.5px solid #e4e4e7;
    border-radius: 6px;
    padding: 9px 12px;
    margin-bottom: 12px;
  }
  .words-val {
    font-size: 10.5px;
    font-weight: 600;
    color: #18181b;
    line-height: 1.4;
  }
  .bank-box {
    border: 0.5px solid #e4e4e7;
    border-radius: 6px;
    padding: 10px 12px;
    font-size: 10px;
    line-height: 1.6;
    color: #3f3f46;
  }
  .bank-box span {
    color: #71717a;
    font-weight: 500;
    display: inline-block;
    min-width: 82px;
  }

  .totals-box {
    border: 0.5px solid #e4e4e7;
    border-radius: 6px;
    overflow: hidden;
  }
  .t-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6.5px 12px;
    font-size: 11px;
    border-bottom: 0.5px solid #f4f4f5;
    color: #3f3f46;
  }
  .t-row.t-grand {
    background: #fafafa;
    font-size: 12.5px;
    font-weight: 700;
    color: #18181b;
    border-top: 1px solid #d4d4d8;
    border-bottom: 0.5px solid #e4e4e7;
    padding: 8.5px 12px;
  }
  .t-row.t-advance {
    color: #15803d;
    font-weight: 600;
  }
  .t-row.t-balance {
    background: #fdf2f8;
    color: #9d174d;
    font-size: 13px;
    font-weight: 800;
    padding: 9px 12px;
    border-bottom: none;
  }
  .paid-banner {
    background: #ecfdf5;
    color: #15803d;
    border-top: 1px solid #bbf7d0;
    padding: 9px 12px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.06em;
  }
  .paid-pill {
    background: #16a34a;
    color: #ffffff;
    padding: 2px 10px;
    border-radius: 999px;
    font-size: 10.5px;
    letter-spacing: 0.08em;
  }

  /* FOOTER: TERMS + SIGNATURE + THANK YOU */
  .footer-section {
    margin-top: 18px;
    padding-top: 12px;
    border-top: 1px solid #e4e4e7;
  }
  .terms-sign-grid {
    display: grid;
    grid-template-columns: 1.4fr 0.6fr;
    gap: 20px;
    align-items: end;
  }
  .terms-text {
    font-size: 9.5px;
    line-height: 1.55;
    color: #52525b;
    white-space: pre-line;
  }
  .sign-box {
    text-align: right;
  }
  .sign-line {
    width: 140px;
    margin-left: auto;
    border-bottom: 1px solid #a1a1aa;
    height: 30px;
    margin-bottom: 5px;
  }
  .sign-label {
    font-size: 9.5px;
    font-weight: 600;
    color: #52525b;
  }
  .thank-you {
    margin-top: 14px;
    text-align: center;
    font-size: 10.5px;
    font-weight: 600;
    color: #c6539f;
    padding-top: 10px;
    border-top: 0.5px dashed #e4e4e7;
  }
</style>
</head>
<body>
  <div class="page">
    <div>
      <div class="top-bar-accent"></div>

      <!-- HEADER -->
      <div class="header">
        <div class="brand-col">
          <div class="brand-logo-wrap">
            <img class="brand-logo" src="${esc(logoSrc)}" alt="${esc(studioTitle)}" />
            <div class="brand-name">${esc(studioTitle)}</div>
          </div>
          <div class="brand-meta">
            ${addressLine ? `<div>${esc(addressLine)}</div>` : ''}
            ${phones ? `<div>Phone: ${esc(phones)}</div>` : ''}
            ${branding?.email ? `<div>Email: ${esc(branding.email)}</div>` : ''}
            ${gstEnabled && branding?.gstin ? `<div class="brand-gstin">GSTIN: ${esc(branding.gstin)}</div>` : ''}
          </div>
        </div>

        <div class="invoice-col">
          <h1 class="doc-title">${esc(docTitle)}</h1>
          <table class="meta-table">
            <tr>
              <td class="meta-label">Invoice #</td>
              <td class="meta-val">${esc(invoice.invoiceNumber)}</td>
            </tr>
            <tr>
              <td class="meta-label">Invoice Date</td>
              <td class="meta-val">${esc(fmtDate(invoice.invoiceDate))}</td>
            </tr>
            <tr>
              <td class="meta-label">Terms</td>
              <td class="meta-val">${esc(formatTermsLabel(invoice.paymentTerms))}</td>
            </tr>
            <tr>
              <td class="meta-label">Due Date</td>
              <td class="meta-val">${esc(fmtDate(invoice.dueDate))}</td>
            </tr>
          </table>
        </div>
      </div>

      <!-- BILL TO & EVENT DETAILS -->
      <div class="parties-grid">
        <div class="party-box">
          <div class="box-label">Bill To</div>
          <div class="client-name">${esc(invoice.clientName || 'Client')}</div>
          ${invoice.clientAddress ? `<div class="party-line">${esc(invoice.clientAddress)}</div>` : ''}
          ${invoice.clientPhone ? `<div class="party-line">Phone: ${esc(invoice.clientPhone)}</div>` : ''}
          ${invoice.clientEmail ? `<div class="party-line">Email: ${esc(invoice.clientEmail)}</div>` : ''}
          <div class="party-line">Place of Supply: ${esc(invoice.clientState || 'Tamil Nadu')}</div>
          ${gstEnabled && invoice.clientGstin ? `<div class="party-gstin">Client GSTIN: ${esc(invoice.clientGstin)}</div>` : ''}
        </div>

        <div class="party-box">
          <div class="box-label">Event Details</div>
          <div class="client-name">${esc(invoice.eventName || 'Photography & Videography Services')}</div>
          ${eventDateFormatted ? `<div class="party-line">Event Date: ${esc(eventDateFormatted)}</div>` : ''}
          ${invoice.eventVenue ? `<div class="party-line">Venue: ${esc(invoice.eventVenue)}</div>` : ''}
        </div>
      </div>

      <!-- LINE ITEMS -->
      <div class="items-wrap">
        <table class="items">
          <thead>
            <tr>
              <th class="c-idx">#</th>
              <th class="c-desc">Item & Description</th>
              ${showSacCol ? `<th class="c-sac">SAC</th>` : ''}
              <th class="c-qty">Qty</th>
              <th class="c-num">Rate</th>
              ${showLineDiscCol ? `<th class="c-num">Discount</th>` : ''}
              <th class="c-num">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>

      <!-- TOTALS + BANK/UPI + WORDS -->
      <div class="summary-grid">
        <div>
          <div class="words-box">
            <div class="box-label" style="margin-bottom: 3px;">Total In Words</div>
            <div class="words-val">${esc(numberToWordsINR(totalAmount))}</div>
          </div>

          ${
            bankLines.length > 0
              ? `<div class="bank-box">
                   <div class="box-label" style="margin-bottom: 4px;">Bank & Payment Details</div>
                   ${bankLines.join('')}
                 </div>`
              : ''
          }
        </div>

        <div class="totals-box">
          <div class="t-row">
            <span>Sub Total</span>
            <span>${formatInr(invoice.subtotal)}</span>
          </div>
          ${
            discountVal > 0
              ? `<div class="t-row">
                   <span>Discount</span>
                   <span>-${formatInr(discountVal)}</span>
                 </div>`
              : ''
          }
          ${
            discountVal > 0 && gstEnabled
              ? `<div class="t-row">
                   <span>Taxable Value</span>
                   <span>${formatInr(taxableVal)}</span>
                 </div>`
              : ''
          }
          ${
            gstEnabled && !isIgst
              ? `<div class="t-row">
                   <span>CGST (${halfRate}%)</span>
                   <span>${formatInr(invoice.cgst)}</span>
                 </div>
                 <div class="t-row">
                   <span>SGST (${halfRate}%)</span>
                   <span>${formatInr(invoice.sgst)}</span>
                 </div>`
              : ''
          }
          ${
            gstEnabled && isIgst
              ? `<div class="t-row">
                   <span>IGST (${gstRate}%)</span>
                   <span>${formatInr(invoice.igst)}</span>
                 </div>`
              : ''
          }
          <div class="t-row t-grand">
            <span>Grand Total</span>
            <span>${formatInr(totalAmount)}</span>
          </div>
          <div class="t-row t-advance">
            <span>Advance Received</span>
            <span>${amountPaid > 0 ? `-${formatInr(amountPaid)}` : formatInr(0)}</span>
          </div>
          ${
            isPaid
              ? `<div class="paid-banner">
                   <span>SETTLEMENT STATUS</span>
                   <span class="paid-pill">PAID</span>
                 </div>`
              : `<div class="t-row t-balance">
                   <span>Balance Due</span>
                   <span>${formatInr(balanceDue)}</span>
                 </div>`
          }
        </div>
      </div>
    </div>

    <!-- FOOTER -->
    <div class="footer-section">
      <div class="terms-sign-grid">
        <div>
          ${
            termsText
              ? `<div class="box-label" style="margin-bottom: 4px;">Terms & Conditions</div>
                 <div class="terms-text">${esc(termsText)}</div>`
              : ''
          }
        </div>
        <div class="sign-box">
          <div class="sign-line"></div>
          <div class="sign-label">Authorized Signatory (${esc(studioTitle)})</div>
        </div>
      </div>

      <div class="thank-you">${esc(thankYouText)}</div>
    </div>
  </div>
</body>
</html>`
}

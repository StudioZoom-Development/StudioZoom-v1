import type { Quotation, QuotationTemplateId } from '@/types'
import { format } from 'date-fns'

export function normalizeTemplateKey(id?: QuotationTemplateId): 'package1' | 'package2' | 'package3' {
  if (id === 'package2' || id === 'production') return 'package2'
  if (id === 'package3' || id === 'floral') return 'package3'
  return 'package1'
}

export function formatINR(val?: number | null): string {
  if (val === undefined || val === null || isNaN(val)) return '0'
  return Math.round(val).toLocaleString('en-IN')
}

function escapeHtml(str?: string | null): string {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function numberBelowThousand(n: number): string {
  const units = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
  let str = ''
  if (n >= 100) {
    str += units[Math.floor(n / 100)] + ' Hundred '
    n %= 100
  }
  if (n >= 20) {
    str += tens[Math.floor(n / 10)] + (n % 10 > 0 ? ' ' + units[n % 10] : '')
  } else if (n > 0) {
    str += units[n]
  }
  return str.trim()
}

export function numberToWordsINR(amount: number): string {
  const rounded = Math.round(Math.abs(amount))
  if (rounded === 0) return 'Rupees Zero Only'
  let rem = rounded
  let words = ''

  const crore = Math.floor(rem / 10000000)
  if (crore > 0) {
    words += numberBelowThousand(crore) + ' Crore '
    rem %= 10000000
  }
  const lakh = Math.floor(rem / 100000)
  if (lakh > 0) {
    words += numberBelowThousand(lakh) + ' Lakh '
    rem %= 100000
  }
  const thousand = Math.floor(rem / 1000)
  if (thousand > 0) {
    words += numberBelowThousand(thousand) + ' Thousand '
    rem %= 1000
  }
  if (rem > 0) {
    words += numberBelowThousand(rem)
  }
  return words.trim()
}

// In-memory cache for loaded raw templates
const templateCache: Record<string, string> = {}

/**
 * Loads the raw HTML template string from disk (Node) or via fetch (Browser).
 */
export async function getRawTemplateHtml(key: 'package1' | 'package2' | 'package3'): Promise<string> {
  if (templateCache[key]) {
    return templateCache[key]
  }

  const fileNameMap = {
    package1: 'Package_1.html',
    package2: 'Package_2.html',
    package3: 'Package_3.html',
  }
  const fileName = fileNameMap[key]

  if (typeof window === 'undefined') {
    const fs = await import('fs')
    const path = await import('path')
    const filePath = path.join(process.cwd(), 'public', 'templates', 'quotations', fileName)
    const content = fs.readFileSync(filePath, 'utf8')
    templateCache[key] = content
    return content
  }

  const res = await fetch(`/templates/quotations/${fileName}`)
  if (!res.ok) {
    throw new Error(`Failed to fetch quotation template ${fileName}`)
  }
  const content = await res.text()
  templateCache[key] = content
  return content
}

/**
 * Pre-seeds template cache (e.g. from bundled string or client pre-fetch)
 */
export function seedTemplateCache(key: 'package1' | 'package2' | 'package3', html: string) {
  templateCache[key] = html
}

export interface QuotationRenderData {
  quotationNumber?: string
  templateId?: QuotationTemplateId
  clientName?: string
  clientPhone?: string
  clientEmail?: string
  eventType?: string
  eventDate?: string | Date
  place?: string
  validUntil?: string | Date
  lineItems?: Array<{ name?: string; description?: string; qty?: number; rate?: number; amount?: number }>
  addons?: Array<{ name?: string; description?: string; amount?: number }>
  subtotal?: number
  taxAmount?: number
  taxRate?: number
  grandTotal?: number
  termsAndConditions?: string
}

/**
 * Renders a complete, standalone, print-ready HTML quotation string based on the selected package template.
 */
export async function renderQuotationHtml(data: QuotationRenderData): Promise<string> {
  const packageKey = normalizeTemplateKey(data.templateId)
  const rawHtml = await getRawTemplateHtml(packageKey)

  const items = data.lineItems && data.lineItems.length > 0 ? data.lineItems : []
  const addons = data.addons && data.addons.length > 0 ? data.addons : []

  const subtotal = data.subtotal ?? items.reduce((sum, it) => sum + (it.amount ?? (it.qty || 1) * (it.rate || 0)), 0)
  const taxRate = data.taxRate ?? 18
  const taxAmount = data.taxAmount ?? Math.round(subtotal * (taxRate / 100))
  const addonsTotal = addons.reduce((sum, a) => sum + (a.amount || 0), 0)
  const grandTotal = data.grandTotal ?? (subtotal + taxAmount + addonsTotal)

  const formattedEventDate = data.eventDate ? format(new Date(data.eventDate), 'dd MMM yyyy') : ''
  const formattedValidUntil = data.validUntil ? format(new Date(data.validUntil), 'dd MMM yyyy') : ''

  if (packageKey === 'package1') {
    return renderPackage1(rawHtml, {
      ...data,
      subtotal,
      taxRate,
      taxAmount,
      grandTotal,
      formattedEventDate,
      formattedValidUntil,
      items,
    })
  } else if (packageKey === 'package2') {
    return renderPackage2(rawHtml, {
      ...data,
      subtotal,
      taxRate,
      taxAmount,
      grandTotal,
      formattedEventDate,
      formattedValidUntil,
      items,
    })
  } else {
    return renderPackage3(rawHtml, {
      ...data,
      subtotal,
      taxRate,
      taxAmount,
      grandTotal,
      formattedEventDate,
      formattedValidUntil,
      items,
      addons,
    })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PACKAGE 1 RENDERER
// ─────────────────────────────────────────────────────────────────────────────
function renderPackage1(rawHtml: string, d: any): string {
  // 1. Table rows
  const rowsHtml = d.items
    .map((it: any) => {
      const title = escapeHtml(it.name || it.description || 'Deliverable Item')
      const qty = it.qty || 1
      const rate = it.rate ?? 0
      const amt = it.amount ?? qty * rate
      return `        <tr><td>${title}</td><td class="qty">${qty}</td><td>${formatINR(rate)}</td><td>${formatINR(amt)}</td></tr>`
    })
    .join('\n')

  // 2. Totals block
  const halfTaxRate = (d.taxRate / 2).toFixed(1).replace(/\.0$/, '')
  const halfTaxAmt = Math.round(d.taxAmount / 2)
  let totalsHtml = `      <div class="r"><span>SUBTOTAL</span><span>Rs. ${formatINR(d.subtotal)}</span></div>`
  if (d.taxAmount > 0) {
    totalsHtml += `\n      <div class="r"><span>CGST (${halfTaxRate}%)</span><span>Rs. ${formatINR(halfTaxAmt)}</span></div>`
    totalsHtml += `\n      <div class="r"><span>SGST (${halfTaxRate}%)</span><span>Rs. ${formatINR(halfTaxAmt)}</span></div>`
  }

  // 3. Client metadata row (rendered above table inside .content if client or quote exists)
  let clientMetaHtml = ''
  if (d.clientName || d.quotationNumber) {
    clientMetaHtml = `    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:12pt;font-size:9pt;color:#3d2c21;">
      <div>
        ${d.clientName ? `<strong style="font-size:9.5pt;">Client:</strong> ${escapeHtml(d.clientName)}${d.eventType ? ` (${escapeHtml(d.eventType)})` : ''}` : ''}
      </div>
      <div style="text-align:right;">
        ${d.quotationNumber ? `<strong>Quote:</strong> ${escapeHtml(d.quotationNumber)}` : ''}
        ${d.formattedValidUntil ? `<span style="margin-left:8pt;color:#6b574a;font-size:8.5pt;">Valid: ${escapeHtml(d.formattedValidUntil)}</span>` : ''}
      </div>
    </div>\n`
  }

  let html = rawHtml

  // Inject client metadata before <table class="items">
  html = html.replace(
    /(<div class="content" data-slot="line-item-content">[\s\S]*?)(<!-- SAMPLE DATA[\s\S]*?-->\s*)?(<table class="items">)/,
    `$1${clientMetaHtml}    $3`
  )

  // Replace tbody rows
  html = html.replace(
    /(<tbody data-slot="rows">)[\s\S]*?(<\/tbody>)/,
    `$1\n${rowsHtml}\n      $2`
  )

  // Replace totals
  html = html.replace(
    /(<div class="totals" data-slot="totals">)[\s\S]*?(<\/div>\s*<\/div>)/,
    `$1\n${totalsHtml}\n    </div>\n  </div>`
  )

  // Replace grand total in price
  html = html.replace(
    /(<span data-slot="grand-total">)[\s\S]*?(<\/span>)/,
    `$1${formatINR(d.grandTotal)}$2`
  )

  return html
}

// ─────────────────────────────────────────────────────────────────────────────
// PACKAGE 2 RENDERER
// ─────────────────────────────────────────────────────────────────────────────
function renderPackage2(rawHtml: string, d: any): string {
  let html = rawHtml

  // Place
  html = html.replace(
    /(data-slot="place">)[\s\S]*?(<\/div>)/,
    `$1${escapeHtml(d.place || 'Chennai')}$2`
  )

  // Date
  html = html.replace(
    /(data-slot="date">)[\s\S]*?(<\/div>)/,
    `$1${escapeHtml(d.formattedEventDate || format(new Date(), 'dd MMM yyyy'))}$2`
  )

  // Quotation No + Valid Until
  const validUntilStr = d.formattedValidUntil ? `<br><span style="font-size:8pt;color:#555">Valid: ${escapeHtml(d.formattedValidUntil)}</span>` : ''
  html = html.replace(
    /(data-slot="quotation-no">)[\s\S]*?(<\/div>)/,
    `$1Quotation No: ${escapeHtml(d.quotationNumber || 'ZS-Q-2026-001')}${validUntilStr}$2`
  )

  // Prepared For:
  let prepHtml = ''
  if (d.clientName) {
    const extra = d.eventType ? ` (${escapeHtml(d.eventType)})` : ''
    prepHtml = `<b>Prepared For:</b> ${escapeHtml(d.clientName)}${extra}`
  }
  html = html.replace(
    /(<p class="prep" data-slot="prepared-for">)[\s\S]*?(<\/p>)/,
    `$1${prepHtml}$2`
  )

  // Table rows
  const rowsHtml = d.items
    .map((it: any) => {
      const title = escapeHtml(it.name || it.description || 'Deliverable Item')
      const qty = it.qty || 1
      const rate = it.rate ?? 0
      const amt = it.amount ?? qty * rate
      return `        <tr><td>${title}</td><td class="qty">${qty}</td><td>${formatINR(rate)}</td><td>${formatINR(amt)}</td></tr>`
    })
    .join('\n')

  html = html.replace(
    /(<tbody data-slot="rows">)[\s\S]*?(<\/tbody>)/,
    `$1\n${rowsHtml}\n      $2`
  )

  // Totals block
  const halfTaxRate = (d.taxRate / 2).toFixed(1).replace(/\.0$/, '')
  const halfTaxAmt = Math.round(d.taxAmount / 2)
  let totalsHtml = `      <div class="r"><span>Subtotal</span><span>Rs. ${formatINR(d.subtotal)}</span></div>`
  if (d.taxAmount > 0) {
    totalsHtml += `\n      <div class="r"><span>CGST (${halfTaxRate}%)</span><span>Rs. ${formatINR(halfTaxAmt)}</span></div>`
    totalsHtml += `\n      <div class="r"><span>SGST (${halfTaxRate}%)</span><span>Rs. ${formatINR(halfTaxAmt)}</span></div>`
  }
  totalsHtml += `\n      <div class="r gt"><span>GRAND TOTAL</span><span>Rs. ${formatINR(d.grandTotal)}</span></div>`

  html = html.replace(
    /(<div class="totals" data-slot="totals">)[\s\S]*?(<\/div>\s*<\/div>)/,
    `$1\n${totalsHtml}\n    </div>\n  </div>`
  )

  return html
}

// ─────────────────────────────────────────────────────────────────────────────
// PACKAGE 3 RENDERER
// ─────────────────────────────────────────────────────────────────────────────
function renderPackage3(rawHtml: string, d: any): string {
  let html = rawHtml

  // Heading: e.g. "09 NOV 2026 - IHM SCHOOL - WEDDING & RECEPTION"
  // Never print dangling dash!
  const headingParts: string[] = []
  if (d.formattedEventDate) {
    headingParts.push(d.formattedEventDate.toUpperCase())
  }
  const eventDetails: string[] = []
  if (d.clientName) {
    eventDetails.push(d.clientName.toUpperCase())
  }
  if (d.eventType) {
    eventDetails.push(d.eventType.toUpperCase())
  }
  if (eventDetails.length > 0) {
    headingParts.push(eventDetails.join(' - '))
  }
  const headingText = headingParts.join(' - ')
  html = html.replace(
    /(data-slot="event-heading">)[\s\S]*?(<\/div>)/,
    `$1${escapeHtml(headingText)}$2`
  )

  // Table rows
  const rowsHtml = d.items
    .map((it: any) => {
      const title = escapeHtml(it.name || it.description || 'Deliverable Item')
      const qty = it.qty || 1
      const rate = it.rate ?? 0
      const amt = it.amount ?? qty * rate
      return `        <tr><td>${title}</td><td class="qty">${qty}</td><td>${formatINR(rate)}</td><td>${formatINR(amt)}</td></tr>`
    })
    .join('\n')

  html = html.replace(
    /(<tbody data-slot="rows">)[\s\S]*?(<\/tbody>)/,
    `$1\n${rowsHtml}\n      $2`
  )

  // Package Price block
  const words = `(${numberToWordsINR(d.grandTotal)} Rupees only)`
  const gstLine = d.taxAmount > 0 ? `<div class="gst" data-slot="gst-note">Incl. ${d.taxRate}% GST: Rs. ${formatINR(d.taxAmount)}</div>` : ''

  const pkgPriceHtml = `    <div class="pkg" data-slot="package-price">
      <div class="price-col amt"><span class="d">-</span><span class="rs">Rs.</span><span class="v" data-slot="grand-total">${formatINR(d.grandTotal)}</span></div>
      <div class="words" data-slot="amount-in-words">${escapeHtml(words)}</div>
      ${gstLine}
    </div>`

  html = html.replace(
    /<div class="pkg" data-slot="package-price">[\s\S]*?<\/div>\s*(?=<!-- ADD ONS|<div class="addons")/i,
    pkgPriceHtml + '\n\n    '
  )

  // ADD ONS block: hide this whole block if there are none!
  const addonsRegex = /\s*<!-- ADD ONS: hide this whole block when there are none -->\s*<div class="addons" data-slot="addons">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/
  if (d.addons && d.addons.length > 0) {
    const addonRows = d.addons
      .map((a: any) => {
        const title = escapeHtml(a.name || a.description || 'Add-on Deliverable')
        const amt = a.amount ?? 0
        return `        <div class="row"><span>${title}</span><span class="price-col"><span class="d">-</span><span class="rs">Rs.</span><span class="v">${formatINR(amt)}</span></span></div>`
      })
      .join('\n')

    const addonsBlock = `\n\n    <!-- ADD ONS: hide this whole block when there are none -->
    <div class="addons" data-slot="addons">
      <h3>ADD ONS</h3>
      <div data-slot="addon-rows">
${addonRows}
      </div>
    </div>`

    html = html.replace(addonsRegex, addonsBlock)
  } else {
    // Completely remove the addons block when there are none
    html = html.replace(addonsRegex, '')
  }

  return html
}

/**
 * htmlTemplateEngine.ts
 *
 * Renders a Quotation into one of the 3 HTML templates using DOM parsing.
 * Server-side: uses linkedom. Browser-side: uses DOMParser.
 * Never modifies CSS, fonts, positions or static text in the templates.
 * Only fills elements with data-slot="..." attributes.
 */

import type { Quotation } from '@/types'
import { format } from 'date-fns'
import { numberToWordsINR } from '@/lib/payroll/calculator'

// ─── helpers ─────────────────────────────────────────────────────────────────

/** HTML-escape user-supplied text */
function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Format a number with Indian grouping, no symbol, no decimals */
function inr(amount: number): string {
  return Math.round(amount).toLocaleString('en-IN')
}

/** "Rs. X,XX,XXX" */
function rsInr(amount: number): string {
  return `Rs. ${inr(amount)}`
}

/** Format a date as "09 Nov 2026" */
function fmtDate(d: Date | string | undefined | null): string {
  if (!d) return ''
  try {
    const date = typeof d === 'string' ? new Date(d) : d
    return format(date, 'dd MMM yyyy')
  } catch {
    return ''
  }
}

/** Format a date as "09 NOV 2026" (uppercase) */
function fmtDateUpper(d: Date | string | undefined | null): string {
  return fmtDate(d).toUpperCase()
}

export function normalizeTemplateKey(id?: string): 'package1' | 'package2' | 'package3' {
  if (id === 'package2' || id === 'production') return 'package2'
  if (id === 'package3' || id === 'floral') return 'package3'
  return 'package1'
}

// ─── financial calculations ───────────────────────────────────────────────────

interface Totals {
  subtotal: number
  cgst: number
  sgst: number
  grandTotal: number
}

function calcTotals(q: Quotation): Totals {
  const subtotal = (q.lineItems ?? []).reduce(
    (s, item) => s + (item.qty ?? 0) * (item.rate ?? 0),
    0
  )
  const gstEnabled = q.gstEnabled ?? false
  const taxRate = gstEnabled ? 0.09 : 0
  const cgst = subtotal * taxRate
  const sgst = subtotal * taxRate
  const grandTotal = subtotal + cgst + sgst
  return { subtotal, cgst, sgst, grandTotal }
}

// ─── row builders ────────────────────────────────────────────────────────────

function buildRowsHtml(q: Quotation): string {
  const items = q.lineItems ?? []
  if (items.length === 0) return ''
  return items
    .map((item) => {
      const qty = item.qty ?? 1
      const rate = item.rate ?? 0
      const amount = item.amount ?? qty * rate
      return `<tr><td>${esc(item.description ?? '')}</td><td class="qty">${qty}</td><td>${inr(rate)}</td><td>${inr(amount)}</td></tr>`
    })
    .join('')
}

function buildTotalsHtml(totals: Totals, q: Quotation, includeGrandTotal = false): string {
  const rows: string[] = []
  rows.push(`<div class="r"><span>SUBTOTAL</span><span>${rsInr(totals.subtotal)}</span></div>`)
  if (q.gstEnabled) {
    rows.push(`<div class="r"><span>CGST (9%)</span><span>${rsInr(totals.cgst)}</span></div>`)
    rows.push(`<div class="r"><span>SGST (9%)</span><span>${rsInr(totals.sgst)}</span></div>`)
  }
  if (includeGrandTotal) {
    rows.push(
      `<div class="r gt"><span>GRAND TOTAL</span><span>${rsInr(totals.grandTotal)}</span></div>`
    )
  }
  return rows.join('')
}

// ─── DOM-based slot filler ────────────────────────────────────────────────────

// Use a loose type so the same code works with both linkedom and browser DOM
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDoc = any

function setText(doc: AnyDoc, slot: string, value: string): void {
  const el = doc.querySelector(`[data-slot="${slot}"]`)
  if (!el) return
  el.textContent = value
}

function setHtml(doc: AnyDoc, slot: string, html: string): void {
  const el = doc.querySelector(`[data-slot="${slot}"]`)
  if (!el) return
  el.innerHTML = html
}

function removeSlot(doc: AnyDoc, slot: string): void {
  const el = doc.querySelector(`[data-slot="${slot}"]`)
  if (el) el.parentNode?.removeChild(el)
}

// ─── per-template filling ─────────────────────────────────────────────────────

function fillPackage1(doc: AnyDoc, q: Quotation): void {
  const totals = calcTotals(q)
  setHtml(doc, 'rows', buildRowsHtml(q))
  setHtml(doc, 'totals', buildTotalsHtml(totals, q, false))
  setText(doc, 'grand-total', inr(totals.grandTotal))
}

function fillPackage2(doc: AnyDoc, q: Quotation): void {
  const totals = calcTotals(q)

  // Place / Date / Quotation No
  setText(doc, 'place', q.place ?? '')
  setText(doc, 'date', fmtDate(q.eventDate))
  setText(doc, 'quotation-no', q.quotationNumber ? `Quotation No: ${q.quotationNumber}` : '')

  // "Prepared For:" — only render when client name is non-empty
  const clientName = (q.clientName ?? '').trim()
  const eventType = (q.eventType ?? '').trim()
  if (clientName) {
    const prepText = eventType ? `${clientName} (${eventType})` : clientName
    const el = doc.querySelector('[data-slot="prepared-for"]')
    if (el) {
      el.innerHTML = `<b>Prepared For:</b> ${esc(prepText)}`
    }
  } else {
    removeSlot(doc, 'prepared-for')
  }

  setHtml(doc, 'rows', buildRowsHtml(q))
  // Package 2 totals block includes Grand Total row
  setHtml(doc, 'totals', buildTotalsHtml(totals, q, true))
}

function fillPackage3(doc: AnyDoc, q: Quotation): void {
  const totals = calcTotals(q)

  // Event heading: "09 NOV 2026 - EVENT NAME" — no dangling dash
  const dateStr = fmtDateUpper(q.eventDate)
  const eventName = (q.eventType ?? '').trim().toUpperCase()
  let heading = dateStr
  if (eventName) heading += ` - ${eventName}`
  setText(doc, 'event-heading', heading)

  // Line item rows
  setHtml(doc, 'rows', buildRowsHtml(q))

  // Grand total (the number only, inside "Rs." span)
  setText(doc, 'grand-total', inr(totals.grandTotal))

  // Amount in words
  const words = numberToWordsINR(totals.grandTotal)
  setText(doc, 'amount-in-words', words ? `(${words})` : '')

  // GST note
  if (q.gstEnabled && totals.cgst > 0) {
    setText(doc, 'gst-note', `Incl. 18% GST: Rs. ${inr(totals.cgst + totals.sgst)}`)
  } else {
    setText(doc, 'gst-note', '')
  }

  // Add-ons
  const addons = (q.addons ?? []).filter((a) => (a.description ?? '').trim() !== '')
  if (addons.length > 0) {
    const addonRowsHtml = addons
      .map(
        (a) =>
          `<div class="row"><span>${esc(a.description ?? '')}</span><span class="price-col"><span class="d">-</span><span class="rs">Rs.</span><span class="v">${inr(a.amount ?? 0)}</span></span></div>`
      )
      .join('')
    setHtml(doc, 'addon-rows', addonRowsHtml)
  } else {
    removeSlot(doc, 'addons')
  }
}

// ─── template loader ──────────────────────────────────────────────────────────

async function loadTemplate(templateKey: 'package1' | 'package2' | 'package3'): Promise<string> {
  const fileMap: Record<string, string> = {
    package1: 'Package_1.html',
    package2: 'Package_2.html',
    package3: 'Package_3.html',
  }
  const fileName = fileMap[templateKey]

  if (typeof window === 'undefined') {
    // Server-side: read from filesystem
    const path = await import('path')
    const fs = await import('fs')
    const filePath = path.join(process.cwd(), 'public', 'templates', 'quotations', fileName)
    return fs.readFileSync(filePath, 'utf-8')
  } else {
    // Client-side: fetch from public URL
    const res = await fetch(`/templates/quotations/${fileName}`)
    if (!res.ok) throw new Error(`Failed to load template: ${fileName}`)
    return res.text()
  }
}

// ─── main export ─────────────────────────────────────────────────────────────

/**
 * Renders a Quotation into the matching HTML template.
 * Uses linkedom on the server and DOMParser in the browser.
 * Returns the full serialized HTML string.
 */
export async function renderQuotationHtml(q: Quotation): Promise<string> {
  const templateKey = normalizeTemplateKey(q.templateId)
  const templateHtml = await loadTemplate(templateKey)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let doc: any
  let serialize: () => string

  if (typeof window === 'undefined') {
    // Server-side: linkedom
    const { parseHTML } = await import('linkedom')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parsed = parseHTML(templateHtml) as any
    doc = parsed.document
    serialize = () => `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`
  } else {
    // Browser-side: native DOMParser
    const parser = new DOMParser()
    doc = parser.parseFromString(templateHtml, 'text/html')
    serialize = () => `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`
  }

  // Fill slots based on template
  if (templateKey === 'package1') fillPackage1(doc, q)
  else if (templateKey === 'package2') fillPackage2(doc, q)
  else fillPackage3(doc, q)

  return serialize()
}

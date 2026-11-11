import {
  collection,
  query,
  orderBy,
  where,
  onSnapshot,
  getDoc,
  doc,
  setDoc,
  updateDoc,
  deleteField,
  runTransaction,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import type {
  Invoice,
  InvoiceStatus,
  InvoicePaymentTerms,
  InvoiceLineItem,
  InvoicePaymentEntry,
  InvoicePaymentMode,
} from '@/types'
import { isAllowedByTestMode } from '@/lib/utils/testMode'
import { recordPayment } from '@/lib/firebase/queries/clients'

export const INDIAN_STATES: string[] = [
  'Tamil Nadu',
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Delhi',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jammu and Kashmir',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Ladakh',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Puducherry',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
]

export interface InvoiceFilters {
  status?: InvoiceStatus | 'all'
  search?: string
}

function toDateSafe(val: unknown, fallback?: Date): Date {
  if (!val) return fallback ?? new Date()
  if (val instanceof Timestamp) return val.toDate()
  if (val instanceof Date) return val
  if (typeof val === 'object' && val !== null && 'toDate' in val && typeof (val as { toDate: () => Date }).toDate === 'function') {
    return (val as { toDate: () => Date }).toDate()
  }
  const d = new Date(String(val))
  return Number.isNaN(d.getTime()) ? (fallback ?? new Date()) : d
}

function parsePaymentMode(val: unknown): InvoicePaymentMode {
  const s = String(val || '').toLowerCase()
  if (s === 'cash') return 'cash'
  if (s === 'upi' || s === 'gpay') return 'upi'
  return 'bank'
}

export function mapClientPaymentsToInvoicePayments(
  clientPayments: Array<{
    paymentId: string
    amount: number
    date: Date
    method: string
    transactionId?: string
    instalment?: string
  }>
): InvoicePaymentEntry[] {
  return clientPayments.slice(0, 3).map((p) => ({
    id: p.paymentId,
    amount: Number(p.amount) || 0,
    date: p.date instanceof Date ? p.date : new Date(p.date),
    mode: parsePaymentMode(p.method),
    reference: p.transactionId || p.instalment || '',
  }))
}

export interface InvoiceComputedTotals {
  subtotal: number
  discountAmount: number
  taxableAmount: number
  gstSplit: 'cgst_sgst' | 'igst'
  cgst: number
  sgst: number
  igst: number
  totalAmount: number
  amountPaid: number
  balanceDue: number
  derivedStatus: InvoiceStatus
}

export function computeInvoiceTotals(params: {
  lineItems: InvoiceLineItem[]
  discountType: 'overall' | 'perLine'
  discountValue: number
  gstEnabled: boolean
  gstRate: number
  clientState: string
  payments: InvoicePaymentEntry[]
  currentStatus: InvoiceStatus
  dueDate: Date
}): InvoiceComputedTotals {
  const {
    lineItems,
    discountType,
    discountValue,
    gstEnabled,
    gstRate,
    clientState,
    payments,
    currentStatus,
    dueDate,
  } = params

  const rawSubtotal = lineItems.reduce(
    (sum, item) => sum + (Number(item.qty) || 0) * (Number(item.rate) || 0),
    0
  )

  const lineDiscountSum = lineItems.reduce(
    (sum, item) => sum + Math.max(0, Number(item.discount) || 0),
    0
  )

  const discountAmount =
    discountType === 'perLine'
      ? Math.min(rawSubtotal, lineDiscountSum)
      : Math.min(rawSubtotal, Math.max(0, Number(discountValue) || 0))

  const taxableAmount = Math.max(0, rawSubtotal - discountAmount)

  const isTamilNadu = (clientState || 'Tamil Nadu').trim().toLowerCase() === 'tamil nadu'
  const gstSplit: 'cgst_sgst' | 'igst' = isTamilNadu ? 'cgst_sgst' : 'igst'

  const effectiveRate = gstEnabled ? Math.max(0, Number(gstRate) || 0) : 0
  const totalTax = Math.round((taxableAmount * effectiveRate) / 100)

  let cgst = 0
  let sgst = 0
  let igst = 0

  if (gstEnabled && totalTax > 0) {
    if (gstSplit === 'cgst_sgst') {
      cgst = Math.round(totalTax / 2)
      sgst = totalTax - cgst
    } else {
      igst = totalTax
    }
  }

  const totalAmount = taxableAmount + cgst + sgst
  const amountPaid = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
  const balanceDue = Math.max(0, totalAmount - amountPaid)

  let derivedStatus: InvoiceStatus = currentStatus
  if (totalAmount > 0 && balanceDue <= 0) {
    derivedStatus = 'paid'
  } else if (amountPaid > 0 && balanceDue > 0) {
    derivedStatus = 'partiallyPaid'
  } else {
    derivedStatus = currentStatus === 'paid' || currentStatus === 'partiallyPaid' ? 'sent' : currentStatus
  }

  // Surface overdue when sent/partial and past due date
  if (
    balanceDue > 0 &&
    derivedStatus !== 'draft' &&
    dueDate instanceof Date &&
    dueDate.getTime() < new Date().setHours(0, 0, 0, 0)
  ) {
    derivedStatus = 'overdue'
  }

  return {
    subtotal: rawSubtotal,
    discountAmount,
    taxableAmount,
    gstSplit,
    cgst,
    sgst,
    igst,
    totalAmount,
    amountPaid,
    balanceDue,
    derivedStatus,
  }
}

function parseInvoiceDoc(id: string, data: Record<string, unknown>): Invoice {
  const rawItems = Array.isArray(data.lineItems) ? data.lineItems : []
  const lineItems: InvoiceLineItem[] = rawItems.map((raw, idx) => {
    const r = (raw || {}) as Record<string, unknown>
    const qty = Number(r.qty ?? 1)
    const rate = Number(r.rate ?? 0)
    const discount = Number(r.discount ?? 0)
    return {
      id: String(r.id || `item-${idx}`),
      description: String(r.description || ''),
      subDescription: r.subDescription ? String(r.subDescription) : undefined,
      sacCode: r.sacCode ? String(r.sacCode) : undefined,
      qty,
      rate,
      discount,
      amount: Number(r.amount ?? Math.max(0, qty * rate - discount)),
    }
  })

  const rawPayments = Array.isArray(data.payments) ? data.payments : []
  const payments: InvoicePaymentEntry[] = rawPayments.slice(0, 3).map((raw, idx) => {
    const r = (raw || {}) as Record<string, unknown>
    return {
      id: String(r.id || `pay-${idx}`),
      amount: Number(r.amount || 0),
      date: toDateSafe(r.date),
      mode: parsePaymentMode(r.mode),
      reference: r.reference ? String(r.reference) : undefined,
    }
  })

  return {
    invoiceId: id,
    invoiceNumber: String(data.invoiceNumber || `ZS-INV-${id.slice(0, 6).toUpperCase()}`),
    studioId: (data.studioId as Invoice['studioId']) || 'studio-zoom',
    clientId: data.clientId ? String(data.clientId) : undefined,
    projectId: data.projectId ? String(data.projectId) : undefined,
    invoiceDate: toDateSafe(data.invoiceDate),
    dueDate: toDateSafe(data.dueDate),
    paymentTerms: (data.paymentTerms as InvoicePaymentTerms) || 'dueOnReceipt',
    eventName: String(data.eventName || ''),
    eventDate: data.eventDate ? toDateSafe(data.eventDate) : undefined,
    eventVenue: data.eventVenue ? String(data.eventVenue) : undefined,
    clientName: String(data.clientName || 'Untitled Client'),
    clientPhone: data.clientPhone ? String(data.clientPhone) : undefined,
    clientEmail: data.clientEmail ? String(data.clientEmail) : undefined,
    clientAddress: data.clientAddress ? String(data.clientAddress) : undefined,
    clientGstin: data.clientGstin ? String(data.clientGstin) : undefined,
    clientState: String(data.clientState || 'Tamil Nadu'),
    lineItems,
    discountType: (data.discountType as Invoice['discountType']) || 'overall',
    discountValue: Number(data.discountValue || 0),
    discountAmount: Number(data.discountAmount || 0),
    subtotal: Number(data.subtotal || 0),
    taxableAmount: Number(data.taxableAmount || 0),
    gstEnabled: Boolean(data.gstEnabled),
    gstRate: Number(data.gstRate ?? 18),
    gstSplit: (data.gstSplit as Invoice['gstSplit']) || 'cgst_sgst',
    cgst: Number(data.cgst || 0),
    sgst: Number(data.sgst || 0),
    igst: Number(data.igst || 0),
    totalAmount: Number(data.totalAmount || 0),
    payments,
    amountPaid: Number(data.amountPaid || 0),
    balanceDue: Number(data.balanceDue || 0),
    status: (data.status as InvoiceStatus) || 'draft',
    termsAndConditions: data.termsAndConditions ? String(data.termsAndConditions) : undefined,
    thankYouNote: data.thankYouNote ? String(data.thankYouNote) : undefined,
    isDeleted: Boolean(data.isDeleted),
    createdBy: String(data.createdBy || ''),
    createdAt: toDateSafe(data.createdAt),
    updatedAt: data.updatedAt ? toDateSafe(data.updatedAt) : undefined,
  }
}

/** Real-time subscription to all active invoices */
export function subscribeToInvoices(
  filters: InvoiceFilters = {},
  callback: (invoices: Invoice[]) => void
): () => void {
  const q = query(collection(db, 'invoices'), orderBy('createdAt', 'desc'))

  return onSnapshot(
    q,
    (snap) => {
      const records = snap.docs
        .map((d) => parseInvoiceDoc(d.id, d.data() as Record<string, unknown>))
        .filter((item) => !item.isDeleted && isAllowedByTestMode(item.clientName))
        .filter((item) => {
          if (filters.status && filters.status !== 'all') {
            if (item.status !== filters.status) return false
          }
          if (filters.search && filters.search.trim()) {
            const term = filters.search.toLowerCase().trim()
            const matchName = item.clientName.toLowerCase().includes(term)
            const matchNum = item.invoiceNumber.toLowerCase().includes(term)
            const matchEvent = item.eventName.toLowerCase().includes(term)
            const matchPhone = (item.clientPhone || '').toLowerCase().includes(term)
            if (!matchName && !matchNum && !matchEvent && !matchPhone) return false
          }
          return true
        })

      callback(records)
    },
    (err) => {
      console.error('[subscribeToInvoices error]:', err)
      callback([])
    }
  )
}

/** Real-time subscription to invoices linked to a specific client/booking */
export function subscribeToClientInvoices(
  clientId: string,
  callback: (invoices: Invoice[]) => void
): () => void {
  if (!clientId) {
    callback([])
    return () => {}
  }

  const q = query(collection(db, 'invoices'), where('clientId', '==', clientId))

  return onSnapshot(
    q,
    (snap) => {
      const records = snap.docs
        .map((d) => parseInvoiceDoc(d.id, d.data() as Record<string, unknown>))
        .filter((item) => !item.isDeleted)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

      callback(records)
    },
    (err) => {
      console.error('[subscribeToClientInvoices error]:', err)
      callback([])
    }
  )
}

/** Fetch a single invoice by ID */
export async function getInvoiceById(invoiceId: string): Promise<Invoice | null> {
  try {
    const snap = await getDoc(doc(db, 'invoices', invoiceId))
    if (!snap.exists()) return null
    const data = snap.data() as Record<string, unknown>
    if (data.isDeleted) return null
    return parseInvoiceDoc(snap.id, data)
  } catch (err) {
    console.error('[getInvoiceById error]:', err)
    return null
  }
}

/** Generate the next invoice number atomically using studioSettings/config */
export async function getNextInvoiceNumber(): Promise<string> {
  const currentYear = new Date().getFullYear()
  const configRef = doc(db, 'studioSettings', 'config')
  const numConfigRef = doc(db, 'studioSettings', 'numberingConfig')

  try {
    let nextNum = 1
    let prefix = 'ZS-INV-'

    await runTransaction(db, async (txn) => {
      const [configSnap, numSnap] = await Promise.all([txn.get(configRef), txn.get(numConfigRef)])

      if (numSnap.exists()) {
        const numData = numSnap.data()
        prefix = (numData.invoicePrefix as string) || 'ZS-INV-'
        if (typeof numData.invoiceStartNumber === 'number' && !configSnap.exists()) {
          nextNum = numData.invoiceStartNumber
        }
      }

      if (configSnap.exists()) {
        const cur = configSnap.data().currentInvoiceNumber
        nextNum = typeof cur === 'number' && cur > 0 ? cur + 1 : nextNum
        txn.update(configRef, {
          currentInvoiceNumber: nextNum,
          updatedAt: serverTimestamp(),
        })
      } else {
        txn.set(
          configRef,
          {
            activeStudioId: 'studio-zoom',
            currentInvoiceNumber: nextNum,
            currentQuotationNumber: 1,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        )
      }
    })

    const cleanPrefix = prefix.endsWith('-') ? prefix : `${prefix}-`
    const padded = String(nextNum).padStart(3, '0')
    return `${cleanPrefix}${currentYear}-${padded}`
  } catch (err) {
    console.warn('[getNextInvoiceNumber transaction fallback]:', err)
    const randomSuffix = Math.floor(100 + Math.random() * 900)
    return `ZS-INV-${currentYear}-${randomSuffix}`
  }
}

function serializePayments(payments: InvoicePaymentEntry[]): Array<Record<string, unknown>> {
  return payments.slice(0, 3).map((p) => ({
    id: p.id,
    amount: Number(p.amount) || 0,
    date: Timestamp.fromDate(p.date instanceof Date ? p.date : new Date(p.date)),
    mode: p.mode,
    reference: p.reference || '',
  }))
}

function serializeLineItems(items: InvoiceLineItem[]): Array<Record<string, unknown>> {
  return items.map((item) => ({
    id: item.id,
    description: item.description,
    subDescription: item.subDescription || '',
    sacCode: item.sacCode || '',
    qty: Number(item.qty) || 0,
    rate: Number(item.rate) || 0,
    discount: Number(item.discount) || 0,
    amount: Number(item.amount) || 0,
  }))
}

function omitUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key] = value
    }
  }
  return result
}

/** Create a new invoice and optionally link invoiceNumber to the associated client */
export async function createInvoice(
  data: Omit<Invoice, 'invoiceId' | 'createdAt' | 'invoiceNumber'> & {
    invoiceNumber?: string
  }
): Promise<string> {
  const invoiceNumber = data.invoiceNumber || (await getNextInvoiceNumber())
  const newDocRef = doc(collection(db, 'invoices'))

  const payload = omitUndefined({
    ...data,
    invoiceNumber,
    clientId: data.clientId || '',
    projectId: data.projectId || '',
    lineItems: serializeLineItems(data.lineItems),
    payments: serializePayments(data.payments),
    invoiceDate: Timestamp.fromDate(data.invoiceDate),
    dueDate: Timestamp.fromDate(data.dueDate),
    eventDate: data.eventDate ? Timestamp.fromDate(data.eventDate) : null,
    isDeleted: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  await setDoc(newDocRef, payload)

  if (data.clientId) {
    try {
      await updateDoc(doc(db, 'clients', data.clientId), {
        invoiceNumber,
        updatedAt: serverTimestamp(),
      })
    } catch (err) {
      console.warn('[createInvoice] Could not sync invoiceNumber to client:', err)
    }
  }

  return newDocRef.id
}

/** Update an existing invoice */
export async function updateInvoice(
  invoiceId: string,
  updates: Partial<Omit<Invoice, 'invoiceId' | 'createdAt'>>
): Promise<void> {
  const docRef = doc(db, 'invoices', invoiceId)
  const rawPayload: Record<string, unknown> = {
    ...updates,
    updatedAt: serverTimestamp(),
  }

  if (updates.lineItems) {
    rawPayload.lineItems = serializeLineItems(updates.lineItems)
  }
  if (updates.payments) {
    rawPayload.payments = serializePayments(updates.payments)
  }
  if (updates.invoiceDate) {
    rawPayload.invoiceDate = Timestamp.fromDate(updates.invoiceDate)
  }
  if (updates.dueDate) {
    rawPayload.dueDate = Timestamp.fromDate(updates.dueDate)
  }
  if (updates.eventDate) {
    rawPayload.eventDate = Timestamp.fromDate(updates.eventDate)
  } else if (updates.eventDate === undefined && 'eventDate' in updates) {
    rawPayload.eventDate = null
  }

  const payload: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(rawPayload)) {
    payload[key] = value === undefined ? deleteField() : value
  }

  await updateDoc(docRef, payload)
}

/** Record an advance payment on an invoice (blocks overpayment, enforces max 3 payments, syncs client payment) */
export async function recordInvoicePayment(
  invoiceId: string,
  entry: Omit<InvoicePaymentEntry, 'id'>,
  recordedBy: string,
  recordedByName?: string
): Promise<void> {
  const invoice = await getInvoiceById(invoiceId)
  if (!invoice) throw new Error('Invoice not found')

  if (invoice.payments.length >= 3) {
    throw new Error('Maximum of 3 advance payments reached for this invoice.')
  }

  const amt = Number(entry.amount) || 0
  if (amt <= 0) {
    throw new Error('Payment amount must be greater than zero.')
  }

  const currentPaid = invoice.payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
  if (currentPaid + amt > invoice.totalAmount) {
    const remaining = Math.max(0, invoice.totalAmount - currentPaid)
    throw new Error(`Payment exceeds remaining invoice balance of ₹${remaining.toLocaleString('en-IN')}.`)
  }

  const newEntry: InvoicePaymentEntry = {
    id: `pay-${Date.now()}`,
    amount: amt,
    date: entry.date,
    mode: entry.mode,
    reference: entry.reference?.trim() || '',
  }

  const updatedPayments = [...invoice.payments, newEntry]
  const newAmountPaid = currentPaid + amt
  const newBalanceDue = Math.max(0, invoice.totalAmount - newAmountPaid)
  const newStatus: InvoiceStatus =
    newBalanceDue <= 0 ? 'paid' : newAmountPaid > 0 ? 'partiallyPaid' : invoice.status

  await updateInvoice(invoiceId, {
    payments: updatedPayments,
    amountPaid: newAmountPaid,
    balanceDue: newBalanceDue,
    status: newStatus,
  })

  // Also record into the client's payments subcollection if linked to a project/client
  if (invoice.clientId) {
    const clientMethod: 'cash' | 'gpay' | 'bankTransfer' =
      entry.mode === 'cash' ? 'cash' : entry.mode === 'upi' ? 'gpay' : 'bankTransfer'
    const ordinal =
      updatedPayments.length === 1
        ? '1st Instalment'
        : updatedPayments.length === 2
          ? '2nd Instalment'
          : '3rd Instalment'
    await recordPayment(
      invoice.clientId,
      {
        instalment: newBalanceDue <= 0 ? 'Final Settlement' : ordinal,
        amount: amt,
        date: entry.date,
        method: clientMethod,
        transactionId: entry.reference?.trim() || invoice.invoiceNumber,
      },
      recordedBy,
      recordedByName
    )
  }
}

/** Soft delete an invoice */
export async function deleteInvoice(invoiceId: string): Promise<void> {
  await updateDoc(doc(db, 'invoices', invoiceId), {
    isDeleted: true,
    updatedAt: serverTimestamp(),
  })
}


import {
  collection,
  query,
  orderBy,
  onSnapshot,
  getDoc,
  doc,
  setDoc,
  updateDoc,
  runTransaction,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import type { Quotation, QuotationStatus } from '@/types'
import { isAllowedByTestMode } from '@/lib/utils/testMode'

export interface QuotationFilters {
  status?: QuotationStatus | 'all'
  search?: string
}

function parseQuotationDoc(id: string, data: Record<string, unknown>): Quotation {
  return {
    quotationId: id,
    quotationNumber: String(data.quotationNumber || `ZS-Q-${id.slice(0, 6)}`),
    templateId: (data.templateId as Quotation['templateId']) || 'production',
    clientId: data.clientId ? String(data.clientId) : undefined,
    clientName: String(data.clientName || 'Untitled Client'),
    contact: String(data.contact || ''),
    email: data.email ? String(data.email) : undefined,
    place: data.place ? String(data.place) : undefined,
    eventType: String(data.eventType || 'Event'),
    eventDate: data.eventDate instanceof Timestamp ? data.eventDate.toDate() : (data.eventDate ? new Date(String(data.eventDate)) : undefined),
    validityDate: data.validityDate instanceof Timestamp ? data.validityDate.toDate() : (data.validityDate ? new Date(String(data.validityDate)) : new Date(Date.now() + 15 * 86400000)),
    lineItems: Array.isArray(data.lineItems) ? data.lineItems : [],
    addons: Array.isArray(data.addons) ? data.addons : [],
    subtotal: Number(data.subtotal || 0),
    gstEnabled: Boolean(data.gstEnabled),
    gstRate: Number(data.gstRate || 18),
    cgst: Number(data.cgst || 0),
    sgst: Number(data.sgst || 0),
    grandTotal: Number(data.grandTotal || 0),
    status: (data.status as QuotationStatus) || 'draft',
    termsAndConditions: data.termsAndConditions ? String(data.termsAndConditions) : undefined,
    notes: data.notes ? String(data.notes) : undefined,
    isDeleted: Boolean(data.isDeleted),
    createdBy: String(data.createdBy || ''),
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : (data.createdAt ? new Date(String(data.createdAt)) : new Date()),
    updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : (data.updatedAt ? new Date(String(data.updatedAt)) : undefined),
  }
}

/** Real-time subscription to quotations with soft-delete filter */
export function subscribeToQuotations(
  filters: QuotationFilters = {},
  callback: (quotations: Quotation[]) => void
): () => void {
  const q = query(collection(db, 'quotations'), orderBy('createdAt', 'desc'))

  return onSnapshot(
    q,
    (snap) => {
      const records = snap.docs
        .map((d) => parseQuotationDoc(d.id, d.data()))
        .filter((item) => !item.isDeleted && isAllowedByTestMode(item.clientName))
        .filter((item) => {
          if (filters.status && filters.status !== 'all') {
            if (item.status !== filters.status) return false
          }
          if (filters.search && filters.search.trim()) {
            const term = filters.search.toLowerCase().trim()
            const matchName = item.clientName.toLowerCase().includes(term)
            const matchNum = item.quotationNumber.toLowerCase().includes(term)
            const matchEvent = item.eventType.toLowerCase().includes(term)
            const matchContact = item.contact.toLowerCase().includes(term)
            if (!matchName && !matchNum && !matchEvent && !matchContact) return false
          }
          return true
        })

      callback(records)
    },
    (err) => {
      console.error('[subscribeToQuotations error]:', err)
      callback([])
    }
  )
}

/** Fetch a single quotation by ID */
export async function getQuotationById(quotationId: string): Promise<Quotation | null> {
  try {
    const docRef = doc(db, 'quotations', quotationId)
    const snap = await getDoc(docRef)
    if (!snap.exists()) return null
    const data = snap.data()
    if (data.isDeleted) return null
    return parseQuotationDoc(snap.id, data)
  } catch (err) {
    console.error('[getQuotationById error]:', err)
    return null
  }
}

/** Generate the next quotation number atomically using studioSettings/config */
export async function getNextQuotationNumber(): Promise<string> {
  const currentYear = new Date().getFullYear()
  const configRef = doc(db, 'studioSettings', 'config')
  const numConfigRef = doc(db, 'studioSettings', 'numberingConfig')

  try {
    let nextNum = 1
    let prefix = 'ZS-Q'

    await runTransaction(db, async (txn) => {
      const [configSnap, numSnap] = await Promise.all([txn.get(configRef), txn.get(numConfigRef)])

      if (numSnap.exists()) {
        const numData = numSnap.data()
        prefix = numData.quotationPrefix || 'ZS-Q'
        if (numData.quotationStartNumber && !configSnap.exists()) {
          nextNum = numData.quotationStartNumber
        }
      }

      if (configSnap.exists()) {
        const cur = configSnap.data().currentQuotationNumber
        nextNum = typeof cur === 'number' && cur > 0 ? cur + 1 : nextNum
        txn.update(configRef, {
          currentQuotationNumber: nextNum,
          updatedAt: serverTimestamp(),
        })
      } else {
        txn.set(
          configRef,
          {
            activeStudioId: 'studio-zoom',
            currentInvoiceNumber: 1,
            currentQuotationNumber: nextNum,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        )
      }
    })

    const padded = String(nextNum).padStart(3, '0')
    return `${prefix}-${currentYear}-${padded}`
  } catch (err) {
    console.warn('[getNextQuotationNumber transaction fallback]:', err)
    const randomSuffix = Math.floor(100 + Math.random() * 900)
    return `ZS-Q-${currentYear}-${randomSuffix}`
  }
}

/** Create a new quotation */
export async function createQuotation(
  data: Omit<Quotation, 'quotationId' | 'createdAt' | 'quotationNumber'> & {
    quotationNumber?: string
  }
): Promise<string> {
  const quotationNumber = data.quotationNumber || (await getNextQuotationNumber())
  const colRef = collection(db, 'quotations')
  const newDocRef = doc(colRef)

  const payload = {
    ...data,
    quotationNumber,
    isDeleted: false,
    eventDate: data.eventDate ? Timestamp.fromDate(data.eventDate) : null,
    validityDate: Timestamp.fromDate(data.validityDate || new Date(Date.now() + 15 * 86400000)),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }

  await setDoc(newDocRef, payload)
  return newDocRef.id
}

/** Update an existing quotation */
export async function updateQuotation(
  quotationId: string,
  updates: Partial<Omit<Quotation, 'quotationId' | 'createdAt'>>
): Promise<void> {
  const docRef = doc(db, 'quotations', quotationId)
  const payload: Record<string, unknown> = {
    ...updates,
    updatedAt: serverTimestamp(),
  }

  if (updates.eventDate) {
    payload.eventDate = Timestamp.fromDate(updates.eventDate)
  }
  if (updates.validityDate) {
    payload.validityDate = Timestamp.fromDate(updates.validityDate)
  }

  await updateDoc(docRef, payload)
}

/** Soft delete a quotation */
export async function deleteQuotation(quotationId: string): Promise<void> {
  const docRef = doc(db, 'quotations', quotationId)
  await updateDoc(docRef, {
    isDeleted: true,
    updatedAt: serverTimestamp(),
  })
}


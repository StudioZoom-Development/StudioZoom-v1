import {
  collection,
  query,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  getDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import type { Expense, ExpenseCategory } from '@/types'

export interface CreateExpenseInput {
  date: Date
  category: ExpenseCategory
  amount: number
  method: string
  code?: string
  vendor?: string
  note?: string
  description?: string
  projectId?: string
  projectName?: string
  source?: string
  createdBy?: string
}

function parseDate(val: unknown, fallback: Date = new Date()): Date {
  if (!val) return fallback
  if (val instanceof Date && !isNaN(val.getTime())) return val
  if (typeof (val as { toDate?: () => Date }).toDate === 'function') {
    const d = (val as { toDate: () => Date }).toDate()
    if (!isNaN(d.getTime())) return d
  }
  if (typeof val === 'object' && val !== null) {
    if ('seconds' in val && typeof (val as { seconds: number }).seconds === 'number') {
      const d = new Date((val as { seconds: number }).seconds * 1000)
      if (!isNaN(d.getTime())) return d
    }
    if ('_seconds' in val && typeof (val as { _seconds: number })._seconds === 'number') {
      const d = new Date((val as { _seconds: number })._seconds * 1000)
      if (!isNaN(d.getTime())) return d
    }
  }
  const parsed = new Date(val as string | number)
  return !isNaN(parsed.getTime()) ? parsed : fallback
}

function mapDocToExpense(
  id: string,
  data: Record<string, unknown>,
  hasPendingWrites: boolean = false
): Expense {
  const codeVal = typeof data.code === 'string' && data.code.trim()
    ? data.code.trim()
    : `EXP-${id.slice(-4).toUpperCase()}`

  const expDate = parseDate(data.date)
  // If pending local write, fallback is current time (just created).
  // Otherwise for existing records without createdAt, fallback to expDate.
  const fallbackCreated = hasPendingWrites ? new Date() : expDate

  return {
    expenseId:   id,
    code:        codeVal,
    date:        expDate,
    category:    (data.category as ExpenseCategory) || 'misc',
    amount:      Number(data.amount) || 0,
    method:      String(data.method || 'GPay'),
    vendor:      typeof data.vendor === 'string' ? data.vendor : '',
    note:        typeof data.note === 'string' ? data.note : '',
    description: typeof data.description === 'string' ? data.description : (typeof data.note === 'string' ? data.note : ''),
    projectId:   typeof data.projectId === 'string' ? data.projectId : undefined,
    projectName: typeof data.projectName === 'string' ? data.projectName : undefined,
    source:      typeof data.source === 'string' ? data.source : 'manual',
    createdBy:   typeof data.createdBy === 'string' ? data.createdBy : 'admin',
    createdAt:   parseDate(data.createdAt, fallbackCreated),
    isDeleted:   Boolean(data.isDeleted),
  }
}

/**
 * Real-time subscription to all expenses.
 * Filters out soft-deleted records.
 * Returns unsubscribe function.
 */
export function subscribeToExpenses(
  callback: (expenses: Expense[]) => void
): () => void {
  const q = query(collection(db, 'expenses'))

  return onSnapshot(
    q,
    { includeMetadataChanges: true },
    snap => {
      const list: Expense[] = snap.docs
        .map(d => mapDocToExpense(d.id, d.data() as Record<string, unknown>, d.metadata.hasPendingWrites))
        .filter(e => !e.isDeleted)
        // Sort descending: newest created first (createdAt descending), tie-breaking by transaction date
        .sort((a, b) => {
          const timeA = a.createdAt instanceof Date && !isNaN(a.createdAt.getTime()) ? a.createdAt.getTime() : a.date.getTime()
          const timeB = b.createdAt instanceof Date && !isNaN(b.createdAt.getTime()) ? b.createdAt.getTime() : b.date.getTime()
          if (timeB !== timeA) return timeB - timeA
          return b.date.getTime() - a.date.getTime()
        })

      callback(list)
    },
    err => {
      console.error('[expenses] subscribeToExpenses error:', err)
      callback([])
    }
  )
}

/**
 * Create a new expense document in Firestore.
 */
export async function createExpense(data: CreateExpenseInput): Promise<string> {
  const expenseDocRef = doc(collection(db, 'expenses'))
  const expenseId = expenseDocRef.id
  const readableExpCode = data.code?.trim() || `EXP-${Math.floor(1000 + Math.random() * 9000)}`

  await setDoc(expenseDocRef, {
    expenseId,
    code: readableExpCode,
    date: Timestamp.fromDate(data.date),
    category: data.category,
    amount: Number(data.amount) || 0,
    method: data.method,
    vendor: data.vendor || '',
    note: data.note || '',
    description: data.description || data.note || '',
    projectId: data.projectId || '',
    projectName: data.projectName || '',
    source: data.source || 'manual',
    createdBy: data.createdBy || 'admin',
    createdAt: serverTimestamp(),
    isDeleted: false,
  })

  return expenseId
}

/**
 * Soft delete an expense document.
 */
export async function deleteExpense(expenseId: string): Promise<void> {
  const ref = doc(db, 'expenses', expenseId)
  await updateDoc(ref, {
    isDeleted: true,
    updatedAt: serverTimestamp(),
  })
}

/**
 * Fetch single expense by ID.
 */
export async function getExpenseById(expenseId: string): Promise<Expense | null> {
  const snap = await getDoc(doc(db, 'expenses', expenseId))
  if (!snap.exists()) return null
  const data = snap.data() as Record<string, unknown>
  if (data.isDeleted) return null
  return mapDocToExpense(snap.id, data)
}

/**
 * Update an existing expense document.
 */
export async function updateExpense(
  expenseId: string,
  data: Partial<CreateExpenseInput>
): Promise<void> {
  const ref = doc(db, 'expenses', expenseId)
  const payload: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  }

  if (data.date !== undefined) payload.date = Timestamp.fromDate(data.date)
  if (data.category !== undefined) payload.category = data.category
  if (data.amount !== undefined) payload.amount = Number(data.amount) || 0
  if (data.method !== undefined) payload.method = data.method
  if (data.vendor !== undefined) payload.vendor = data.vendor
  if (data.code !== undefined) payload.code = data.code
  if (data.source !== undefined) payload.source = data.source
  if (data.description !== undefined) payload.description = data.description
  if (data.note !== undefined) {
    payload.note = data.note
    if (data.description === undefined) {
      payload.description = data.note
    }
  }
  if (data.projectId !== undefined) payload.projectId = data.projectId
  if (data.projectName !== undefined) payload.projectName = data.projectName

  await updateDoc(ref, payload)
}

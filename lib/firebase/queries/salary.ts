import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import type { Salary, SalaryAdvanceEntry } from '@/types'
import { format } from 'date-fns'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseAdvanceEntry(entry: unknown): SalaryAdvanceEntry | undefined {
  if (!entry) return undefined
  if (typeof entry === 'number') {
    return { amount: entry, date: '' }
  }
  if (typeof entry === 'object') {
    const obj = entry as Record<string, unknown>
    const amount = Number(obj.amount) || 0
    if (amount <= 0 && !obj.date) return undefined

    let dateStr = ''
    if (obj.date instanceof Timestamp) {
      dateStr = obj.date.toDate().toISOString().split('T')[0]
    } else if (obj.date instanceof Date) {
      dateStr = obj.date.toISOString().split('T')[0]
    } else if (typeof obj.date === 'string') {
      dateStr = obj.date
    }

    return { amount, date: dateStr }
  }
  return undefined
}

function mapDocToSalary(id: string, data: Record<string, unknown>): Salary {
  const advance1 = parseAdvanceEntry(data.advance1)
  const advance2 = parseAdvanceEntry(data.advance2)
  const advance3 = parseAdvanceEntry(data.advance3)

  const totalAdvances =
    (advance1?.amount || 0) + (advance2?.amount || 0) + (advance3?.amount || 0)
  const baseSalary =
    data.baseSalary !== undefined ? Number(data.baseSalary) : undefined
  const salaryPending =
    baseSalary !== undefined ? baseSalary - totalAdvances : undefined

  return {
    salaryId: id,
    staffUid: data.staffUid as string,
    year: Number(data.year),
    month: Number(data.month),
    baseSalary,
    advance1,
    advance2,
    advance3,
    totalAdvances,
    salaryPending,
    createdAt:
      data.createdAt instanceof Timestamp ? data.createdAt.toDate() : undefined,
    updatedAt:
      data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : undefined,
  }
}

// ─── Queries ──────────────────────────────────────────────────────────────────

/**
 * Real-time subscription to all salary documents for a specific year and month.
 * Returns a map of staffUid -> Salary.
 */
export function subscribeMonthlySalaries(
  year: number,
  month: number,
  callback: (records: Record<string, Salary>) => void
): () => void {
  const q = query(
    collection(db, 'salaries'),
    where('year', '==', year),
    where('month', '==', month)
  )

  return onSnapshot(
    q,
    snap => {
      const records: Record<string, Salary> = {}
      for (const d of snap.docs) {
        const salary = mapDocToSalary(d.id, d.data() as Record<string, unknown>)
        records[salary.staffUid] = salary
      }
      callback(records)
    },
    err => {
      console.error('[salary] subscribeMonthlySalaries error:', err)
      callback({})
    }
  )
}

/**
 * Fetch a single staff member's salary record for a specific year and month.
 */
export async function getStaffSalaryRecord(
  staffUid: string,
  year: number,
  month: number
): Promise<Salary | null> {
  try {
    const docId = `${staffUid}_${year}_${month}`
    const snap = await getDoc(doc(db, 'salaries', docId))
    if (!snap.exists()) return null
    return mapDocToSalary(snap.id, snap.data() as Record<string, unknown>)
  } catch (err) {
    console.error('[salary] getStaffSalaryRecord error:', err)
    return null
  }
}

// ─── Mutations ────────────────────────────────────────────────────────────────

/**
 * Save/Upsert salary advances for a staff member for a specific month/year.
 * Stores raw advance entries.
 */
export async function saveSalaryAdvances(params: {
  staffUid: string
  year: number
  month: number
  baseSalary?: number
  advance1?: SalaryAdvanceEntry
  advance2?: SalaryAdvanceEntry
  advance3?: SalaryAdvanceEntry
}): Promise<void> {
  const { staffUid, year, month, baseSalary, advance1, advance2, advance3 } =
    params
  const docId = `${staffUid}_${year}_${month}`
  const docRef = doc(db, 'salaries', docId)

  const payload: Record<string, unknown> = {
    salaryId: docId,
    staffUid,
    year,
    month,
    updatedAt: serverTimestamp(),
  }

  if (baseSalary !== undefined) {
    payload.baseSalary = baseSalary
  }

  const defaultDate = `${year}-${String(month).padStart(2, '0')}-01`
  const today = new Date()
  const todayStr = format(today, 'yyyy-MM-dd')
  const fallbackDate = (today.getFullYear() === year && today.getMonth() + 1 === month) ? todayStr : defaultDate

  if (advance1 && advance1.amount > 0) {
    payload.advance1 = {
      amount: advance1.amount,
      date: advance1.date || fallbackDate,
    }
  } else {
    payload.advance1 = null
  }

  if (advance2 && advance2.amount > 0) {
    payload.advance2 = {
      amount: advance2.amount,
      date: advance2.date || fallbackDate,
    }
  } else {
    payload.advance2 = null
  }

  if (advance3 && advance3.amount > 0) {
    payload.advance3 = {
      amount: advance3.amount,
      date: advance3.date || fallbackDate,
    }
  } else {
    payload.advance3 = null
  }

  // Pre-check for creation
  const snap = await getDoc(docRef)
  if (!snap.exists()) {
    payload.createdAt = serverTimestamp()
  }

  await setDoc(docRef, payload, { merge: true })
}

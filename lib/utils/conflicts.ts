import { collection, query, where, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { format } from 'date-fns'

// ─── STAFF ─────────────────────────────────────────────────────────────────

/** Returns UIDs of all staff already confirmed on a given date */
export async function getBookedStaffOnDate(eventDate: Date): Promise<string[]> {
  const dateStr = format(eventDate, 'yyyy-MM-dd')  // "YYYY-MM-DD" string equality
  const snap = await getDocs(query(
    collection(db, 'staffAssignments'),
    where('eventDate', '==', dateStr),
    where('status', '==', 'confirmed')
  ))
  return snap.docs.map(d => d.data().staffUid as string)
}

/** Returns true if a specific staff member is free on a given date */
export async function isStaffAvailableOnDate(
  staffUid: string,
  eventDate: Date
): Promise<boolean> {
  const booked = await getBookedStaffOnDate(eventDate)
  return !booked.includes(staffUid)
}

/**
 * Work board availability — derived from open work item count.
 * Never stored as a flag to prevent drift.
 *
 * 0 active           → 'free'
 * 1–2 active         → 'occupied'
 * 3+ OR any overdue  → 'overloaded'
 */
export async function getStaffWorkloadStatus(
  staffUid: string
): Promise<'free' | 'occupied' | 'overloaded'> {
  const snap = await getDocs(query(
    collection(db, 'workItems'),
    where('assignedToUid', '==', staffUid),
    where('status', '!=', 'done')
  ))
  const activeCount = snap.size
  const hasOverdue  = snap.docs.some(d => {
    const due = d.data().dueDate?.toDate()
    return due && due < new Date()
  })
  if (activeCount === 0)              return 'free'
  if (activeCount >= 3 || hasOverdue) return 'overloaded'
  return 'occupied'
}

// ─── EQUIPMENT ─────────────────────────────────────────────────────────────

/**
 * Returns current checkout info if equipment is out, null if available.
 * Source of truth for equipment availability — never trust equipment.status alone.
 */
export async function getActiveCheckout(
  itemId: string
): Promise<{ staffName: string; staffUid: string; dueBack: Date } | null> {
  const snap = await getDocs(query(
    collection(db, 'checkouts'),
    where('itemId', '==', itemId),
    where('status', '==', 'out')
  ))
  if (snap.empty) return null
  const d = snap.docs[0].data()
  return {
    staffName: d.staffName as string,
    staffUid:  d.staffUid  as string,
    dueBack:   d.dueBack.toDate(),
  }
}

/** Returns all equipment IDs that are currently available (not out, not service) */
export async function getAvailableEquipmentIds(
  category?: string
): Promise<string[]> {
  const constraints = [
    where('status', '==', 'available'),
    ...(category ? [where('category', '==', category)] : [])
  ]
  const snap = await getDocs(query(collection(db, 'equipment'), ...constraints))
  return snap.docs.map(d => d.id)
}

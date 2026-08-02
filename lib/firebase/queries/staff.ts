import {
  collection, query, where, onSnapshot,
  doc, getDoc, updateDoc, setDoc, getDocs,
  serverTimestamp, Timestamp
} from 'firebase/firestore'
import { db } from '@/lib/firebase/config'

export interface StaffMember {
  uid:         string
  name:        string
  email:       string
  contact?:    string
  jobTitle?:   string
  role:        'admin' | 'manager' | 'staff'
  joinDate?:   Date
  exitDate?:   Date
  baseSalary?: number
  isActive:    boolean
  photoURL?:   string | null
  createdAt?:  Date
  updatedAt?:  Date
}

export interface NewStaffInput {
  name:       string
  email:      string
  contact:    string
  jobTitle:   string
  role:       'staff' | 'manager'
  joinDate:   string
  baseSalary: number
}

/** Real-time list — staff + managers, alphabetical */
export function subscribeToStaff(callback: (staff: StaffMember[]) => void): () => void {
  const q = query(
    collection(db, 'users'),
    where('role', 'in', ['staff', 'manager'])
  )
  return onSnapshot(q, snap => {
    const list = snap.docs.map(d => {
      const data = d.data()
      return {
        ...data,
        uid: d.id,
        joinDate: data.joinDate instanceof Timestamp ? data.joinDate.toDate() : data.joinDate ? new Date(data.joinDate) : undefined,
        createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : data.createdAt ? new Date(data.createdAt) : undefined,
        updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : data.updatedAt ? new Date(data.updatedAt) : undefined,
      } as StaffMember
    })
    // In-memory sort by name (alphabetical)
    list.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    callback(list)
  })
}

/** Single staff by UID */
export async function getStaffMember(uid: string): Promise<StaffMember | null> {
  const snap = await getDoc(doc(db, 'users', uid))
  if (!snap.exists()) return null
  const data = snap.data()
  return {
    ...data,
    uid: snap.id,
    joinDate: data.joinDate instanceof Timestamp ? data.joinDate.toDate() : data.joinDate ? new Date(data.joinDate) : undefined,
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : data.createdAt ? new Date(data.createdAt) : undefined,
    updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : data.updatedAt ? new Date(data.updatedAt) : undefined,
  } as StaffMember
}

/** Update profile fields */
export async function updateStaffProfile(
  uid: string,
  updates: { name?: string; contact?: string; email?: string; jobTitle?: string; joinDate?: string; baseSalary?: number }
): Promise<void> {
  const payload: Record<string, unknown> = { updatedAt: serverTimestamp() }
  if (updates.name)       payload.name       = updates.name
  if (updates.contact)    payload.contact    = updates.contact
  if (updates.email)      payload.email      = updates.email
  if (updates.jobTitle)   payload.jobTitle   = updates.jobTitle
  if (updates.baseSalary !== undefined) payload.baseSalary = updates.baseSalary
  if (updates.joinDate)   payload.joinDate   = Timestamp.fromDate(new Date(updates.joinDate))
  await updateDoc(doc(db, 'users', uid), payload)
}

/** Soft deactivate / reactivate */
export async function deactivateStaff(uid: string): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { isActive: false, updatedAt: serverTimestamp() })
}
export async function reactivateStaff(uid: string): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { isActive: true, updatedAt: serverTimestamp() })
}

/** Add staff — writes Firestore only (Auth user creation requires Admin SDK/Cloud Function) */
export async function addStaffMember(data: NewStaffInput): Promise<string> {
  const tempUid = `staff_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  await setDoc(doc(db, 'users', tempUid), {
    uid:        tempUid,
    name:       data.name,
    email:      data.email,
    contact:    data.contact.startsWith('+91') ? data.contact : `+91 ${data.contact.trim()}`,
    jobTitle:   data.jobTitle,
    role:       data.role,
    joinDate:   data.joinDate ? Timestamp.fromDate(new Date(data.joinDate)) : serverTimestamp(),
    baseSalary: data.baseSalary,
    isActive:   true,
    photoURL:   null,
    createdAt:  serverTimestamp(),
    updatedAt:  serverTimestamp(),
  })
  return tempUid
}

/** Attendance summary for detail page — direct getDoc via ID pattern */
export async function getAttendanceSummary(
  uid: string, year: number, month: number
): Promise<{ present: number; late: number; absent: number; totalMinutes: number } | null> {
  try {
    const snap = await getDoc(doc(db, 'attendance', `${uid}_${year}_${month}`))
    if (!snap.exists()) return null
    return snap.data().summary as { present: number; late: number; absent: number; totalMinutes: number }
  } catch (err) {
    console.error('Failed to get attendance summary:', err)
    return null
  }
}

/** Payslip history for detail page */
export async function getPayslipHistory(uid: string): Promise<Array<{
  payslipId: string; payslipNumber: string; month: number; year: number; netPay: number
}>> {
  try {
    const q = query(collection(db, 'payslips'), where('staffUid', '==', uid))
    const snap = await getDocs(q)
    const list = snap.docs.map(d => ({
      payslipId:     d.id,
      payslipNumber: d.data().payslipNumber ?? '',
      month:         d.data().month as number,
      year:          d.data().year as number,
      netPay:        d.data().netPay as number,
    }))
    list.sort((a, b) => b.year - a.year || b.month - a.month)
    return list
  } catch (err) {
    console.error('Failed to get payslip history:', err)
    return []
  }
}

/** Work history for detail page — via staffAssignments */
export async function getWorkHistory(uid: string): Promise<Array<{
  projectId: string; eventName: string; eventDate: string; role: string; stage: string
}>> {
  try {
    const q = query(
      collection(db, 'staffAssignments'),
      where('staffUid', '==', uid)
    )
    const snap = await getDocs(q)
    const list = await Promise.all(
      snap.docs.map(async d => {
        const a = d.data()
        let eventName = '—'
        let stage = '—'
        if (a.projectId) {
          try {
            const proj = await getDoc(doc(db, 'projects', a.projectId))
            if (proj.exists()) {
              const p = proj.data()
              eventName = p?.eventName ?? '—'
              stage = p?.stage ?? '—'
            }
          } catch {
            // fallback if project not found
          }
        }
        return {
          projectId: a.projectId ?? '',
          eventName,
          eventDate: a.eventDate as string,    // "YYYY-MM-DD" string
          role:      a.role as string,
          stage,
        }
      })
    )
    list.sort((a, b) => (b.eventDate || '').localeCompare(a.eventDate || ''))
    return list.slice(0, 20)
  } catch (err) {
    console.error('Failed to get work history:', err)
    return []
  }
}

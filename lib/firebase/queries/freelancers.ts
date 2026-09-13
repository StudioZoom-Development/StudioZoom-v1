import {
  collection, query, where, onSnapshot,
  doc, getDoc, updateDoc, setDoc, getDocs,
  writeBatch, arrayUnion, arrayRemove, deleteField,
  serverTimestamp, Timestamp
} from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { Freelancer, FreelancerPayout, Project } from '@/types'
import { isAllowedByTestMode } from '@/lib/utils/testMode'

/** Real-time subscription to all freelancers */
export function subscribeToFreelancers(
  callback: (freelancers: Freelancer[]) => void
): () => void {
  const q = query(collection(db, 'freelancers'))
  return onSnapshot(q, snap => {
    const list = snap.docs
      .map(d => {
        const data = d.data()
        return {
          ...data,
          freelancerId: d.id,
          createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : data.createdAt ? new Date(data.createdAt) : undefined,
          updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : data.updatedAt ? new Date(data.updatedAt) : undefined,
        } as Freelancer
      })
      .filter(f => !f.isDeleted && isAllowedByTestMode(f.createdAt))
    // Sort alphabetically by name
    list.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    callback(list)
  }, err => {
    console.error('Error in subscribeToFreelancers:', err)
  })
}

/** Get single freelancer by ID */
export async function getFreelancerById(freelancerId: string): Promise<Freelancer | null> {
  try {
    const snap = await getDoc(doc(db, 'freelancers', freelancerId))
    if (!snap.exists()) return null
    const data = snap.data()
    return {
      ...data,
      freelancerId: snap.id,
      createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : data.createdAt ? new Date(data.createdAt) : undefined,
      updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : data.updatedAt ? new Date(data.updatedAt) : undefined,
    } as Freelancer
  } catch (err) {
    console.error('Failed to get freelancer:', err)
    return null
  }
}

export interface NewFreelancerInput {
  name:     string
  skill:    Freelancer['skill']
  dayRate:  number
  contact:  string
  notes?:   string
}

/** Add a new freelancer */
export async function addFreelancer(data: NewFreelancerInput): Promise<string> {
  const freelancerId = `fl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  const formattedContact = data.contact.trim().startsWith('+91')
    ? data.contact.trim()
    : `+91 ${data.contact.trim()}`

  await setDoc(doc(db, 'freelancers', freelancerId), {
    freelancerId,
    name:      data.name.trim(),
    skill:     data.skill,
    dayRate:   Number(data.dayRate) || 0,
    contact:   formattedContact,
    notes:     data.notes?.trim() || '',
    isActive:  true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  return freelancerId
}

/** Update freelancer profile */
export async function updateFreelancer(
  freelancerId: string,
  updates: Partial<{
    name:     string
    skill:    Freelancer['skill']
    dayRate:  number
    contact:  string
    notes:    string
    isActive: boolean
  }>
): Promise<void> {
  const payload: Record<string, unknown> = { updatedAt: serverTimestamp() }
  if (updates.name !== undefined)     payload.name     = updates.name.trim()
  if (updates.skill !== undefined)    payload.skill    = updates.skill
  if (updates.dayRate !== undefined)  payload.dayRate  = Number(updates.dayRate) || 0
  if (updates.contact !== undefined)  payload.contact  = updates.contact.trim()
  if (updates.notes !== undefined)    payload.notes    = updates.notes.trim()
  if (updates.isActive !== undefined) payload.isActive = updates.isActive

  await updateDoc(doc(db, 'freelancers', freelancerId), payload)
}

/** Get payout history for a single freelancer, with optional year filter */
export async function getFreelancerPayouts(
  freelancerId: string,
  year?: number
): Promise<FreelancerPayout[]> {
  try {
    const q = query(
      collection(db, 'freelancerPayouts'),
      where('freelancerId', '==', freelancerId)
    )
    const snap = await getDocs(q)
    let list = snap.docs.map(d => {
      const data = d.data()
      return {
        ...data,
        payoutId: d.id,
        paidDate: data.paidDate instanceof Timestamp ? data.paidDate.toDate() : data.paidDate ? new Date(data.paidDate) : new Date(),
        createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : data.createdAt ? new Date(data.createdAt) : new Date(),
      } as FreelancerPayout
    })

    if (year) {
      list = list.filter(p => p.paidDate.getFullYear() === year)
    }

    list.sort((a, b) => b.paidDate.getTime() - a.paidDate.getTime())
    return list
  } catch (err) {
    console.error('Failed to get freelancer payouts:', err)
    return []
  }
}

/** Get all freelancer payouts (for computing lastEngaged across all freelancers) */
export async function getAllFreelancerPayouts(): Promise<FreelancerPayout[]> {
  try {
    const snap = await getDocs(collection(db, 'freelancerPayouts'))
    return snap.docs.map(d => {
      const data = d.data()
      return {
        ...data,
        payoutId: d.id,
        paidDate: data.paidDate instanceof Timestamp ? data.paidDate.toDate() : data.paidDate ? new Date(data.paidDate) : new Date(),
      } as FreelancerPayout
    })
  } catch (err) {
    console.error('Failed to get all freelancer payouts:', err)
    return []
  }
}

/** Get projects assigned to a freelancer */
export async function getFreelancerProjects(freelancerId: string): Promise<Project[]> {
  try {
    const q = query(
      collection(db, 'projects'),
      where('freelancerIds', 'array-contains', freelancerId)
    )
    const snap = await getDocs(q)
    const list = snap.docs
      .map(d => {
        const data = d.data()
        return {
          ...data,
          projectId: d.id,
          eventDate: data.eventDate instanceof Timestamp ? data.eventDate.toDate() : data.eventDate ? new Date(data.eventDate) : new Date(),
          createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : data.createdAt ? new Date(data.createdAt) : new Date(),
          updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : data.updatedAt ? new Date(data.updatedAt) : new Date(),
        } as Project
      })
      .filter(p => !p.isDeleted)

    list.sort((a, b) => a.eventDate.getTime() - b.eventDate.getTime())
    return list
  } catch (err) {
    console.error('Failed to get freelancer projects:', err)
    return []
  }
}

export interface AssignFreelancerInput {
  role?:    string
  days?:    number
  dayRate?: number
}

/** Assign a freelancer to a project with role, days, and project-specific day rate */
export async function assignFreelancerToProject(
  projectId: string,
  freelancerId: string,
  assignment?: AssignFreelancerInput,
  clientId?: string
): Promise<void> {
  const projRef = doc(db, 'projects', projectId)
  const payload: Record<string, unknown> = {
    freelancerIds: arrayUnion(freelancerId),
    updatedAt: serverTimestamp(),
  }

  if (assignment) {
    payload[`freelancerAssignments.${freelancerId}`] = {
      role: assignment.role || 'Photographer',
      days: Number(assignment.days) || 1,
      dayRate: Number(assignment.dayRate) || 0,
    }
    payload[`freelancerRates.${freelancerId}`] = Number(assignment.dayRate) || 0
  }

  await updateDoc(projRef, payload)

  // Also sync to client document if available
  let targetClientId = clientId
  if (!targetClientId) {
    try {
      const snap = await getDoc(projRef)
      if (snap.exists()) {
        targetClientId = snap.data()?.clientId
      }
    } catch {
      // ignore
    }
  }

  if (targetClientId) {
    try {
      await updateDoc(doc(db, 'clients', targetClientId), {
        freelancerIds: arrayUnion(freelancerId),
        updatedAt: serverTimestamp(),
      })
    } catch (err) {
      console.warn('Could not sync freelancer to client document:', err)
    }
  }
}

/** Unassign a freelancer from a project */
export async function unassignFreelancerFromProject(
  projectId: string,
  freelancerId: string,
  clientId?: string
): Promise<void> {
  const projRef = doc(db, 'projects', projectId)
  const payload: Record<string, unknown> = {
    freelancerIds: arrayRemove(freelancerId),
    [`freelancerAssignments.${freelancerId}`]: deleteField(),
    [`freelancerRates.${freelancerId}`]: deleteField(),
    updatedAt: serverTimestamp(),
  }

  await updateDoc(projRef, payload)

  let targetClientId = clientId
  if (!targetClientId) {
    try {
      const snap = await getDoc(projRef)
      if (snap.exists()) {
        targetClientId = snap.data()?.clientId
      }
    } catch {
      // ignore
    }
  }

  if (targetClientId) {
    try {
      await updateDoc(doc(db, 'clients', targetClientId), {
        freelancerIds: arrayRemove(freelancerId),
        updatedAt: serverTimestamp(),
      })
    } catch (err) {
      console.warn('Could not sync freelancer removal to client document:', err)
    }
  }
}

export interface RecordPayoutInput {
  freelancerId:   string
  freelancerName: string
  projectId:      string
  eventName:      string
  days:           number
  dayRate:        number
  amount:         number
  paidDate:       Date
  method:         'cash' | 'gpay' | 'bankTransfer'
  recordedBy:     string
}

/**
 * Record a freelancer payout and auto-post to `/expenses` in an atomic batch.
 * FR-08.3 requirement: Payout auto-posts to Expenses under "Freelancer" category.
 */
export async function recordPayout(data: RecordPayoutInput): Promise<{ payoutId: string; expenseId: string }> {
  const batch = writeBatch(db)

  const payoutId = `payout_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  const expenseDocRef = doc(collection(db, 'expenses'))
  const expenseId = expenseDocRef.id
  const readableExpCode = `EXP-${Math.floor(1000 + Math.random() * 9000)}`

  // 1. Create Payout doc
  const payoutRef = doc(db, 'freelancerPayouts', payoutId)
  batch.set(payoutRef, {
    payoutId,
    freelancerId:    data.freelancerId,
    freelancerName:  data.freelancerName,
    projectId:       data.projectId,
    eventName:       data.eventName,
    days:            Number(data.days) || 1,
    dayRate:         Number(data.dayRate) || 0,
    amount:          Number(data.amount) || 0,
    paidDate:        Timestamp.fromDate(data.paidDate),
    method:          data.method,
    postedExpenseId: readableExpCode, // e.g. EXP-0214
    expenseDocId:    expenseId,
    recordedBy:      data.recordedBy,
    createdAt:       serverTimestamp(),
  })

  // 2. Auto-post to Expenses doc
  batch.set(expenseDocRef, {
    expenseId,
    code:       readableExpCode,
    date:       Timestamp.fromDate(data.paidDate),
    category:   'freelancer',
    amount:     Number(data.amount) || 0,
    method:     data.method,
    vendor:     data.freelancerName,
    projectId:  data.projectId,
    source:     'freelancerPayout',
    note:       `Freelancer payout: ${data.freelancerName} · ${data.days} days`,
    createdBy:  data.recordedBy,
    createdAt:  serverTimestamp(),
  })

  await batch.commit()
  return { payoutId, expenseId: readableExpCode }
}

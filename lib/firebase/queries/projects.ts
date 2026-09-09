import {
  collection, query, where,
  onSnapshot, getDoc, getDocs, doc, writeBatch, updateDoc, arrayUnion, arrayRemove,
  serverTimestamp, Timestamp
} from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { Project, ProjectStage, StaffAssignment, EventDateEntry } from '@/types'

const STAGE_ORDER: ProjectStage[] = [
  'booked',
  'planning',
  'preProduction',
  'eventDay',
  'postProduction',
  'delivered'
]

function parseFirestoreDate(val: unknown, fallback: Date = new Date()): Date {
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

function parseEventDates(raw: unknown): EventDateEntry[] | undefined {
  if (!Array.isArray(raw)) return undefined
  return raw.map((item, idx) => ({
    id: item.id || `day-${idx}`,
    label: item.label || `Event Day ${idx + 1}`,
    location: item.location || '',
    startTime: item.startTime || '',
    endTime: item.endTime || '',
    date: parseFirestoreDate(item.date),
  }))
}

function mapDocToProject(id: string, data: Record<string, any>): Project {
  return {
    ...data,
    projectId: id,
    eventDate: parseFirestoreDate(data.eventDate),
    createdAt: parseFirestoreDate(data.createdAt),
    updatedAt: parseFirestoreDate(data.updatedAt),
    eventDates: parseEventDates(data.eventDates),
  } as Project
}

/** Get single project by ID */
export async function getProjectById(projectId: string): Promise<Project | null> {
  const snap = await getDoc(doc(db, 'projects', projectId))
  if (!snap.exists()) return null
  return mapDocToProject(snap.id, snap.data())
}

/** Get project linked to a client by clientId */
export async function getProjectByClientId(clientId: string): Promise<Project | null> {
  const q = query(
    collection(db, 'projects'),
    where('clientId', '==', clientId)
  )
  const snap = await getDocs(q)
  if (snap.empty) return null
  return mapDocToProject(snap.docs[0].id, snap.docs[0].data())
}

/** Real-time subscription to project by ID */
export function subscribeToProject(
  projectId: string,
  callback: (project: Project | null) => void
): () => void {
  return onSnapshot(doc(db, 'projects', projectId), snap => {
    if (!snap.exists()) {
      callback(null)
      return
    }
    callback(mapDocToProject(snap.id, snap.data()))
  })
}

/** Real-time subscription to team staff assignments for a project */
export function subscribeToProjectStaffAssignments(
  projectId: string,
  callback: (assignments: StaffAssignment[]) => void
): () => void {
  const q = query(
    collection(db, 'staffAssignments'),
    where('projectId', '==', projectId)
  )
  return onSnapshot(q, snap => {
    const list = snap.docs.map(d => ({
      ...d.data(),
      assignmentId: d.id,
      createdAt: d.data().createdAt instanceof Timestamp ? d.data().createdAt.toDate() : new Date(),
    } as StaffAssignment))
    callback(list)
  })
}

/** Real-time subscription to all staff assignments */
export function subscribeToAllStaffAssignments(
  callback: (assignments: StaffAssignment[]) => void
): () => void {
  const q = query(collection(db, 'staffAssignments'))
  return onSnapshot(q, snap => {
    const list = snap.docs.map(d => ({
      ...d.data(),
      assignmentId: d.id,
      createdAt: d.data().createdAt instanceof Timestamp ? d.data().createdAt.toDate() : new Date(),
    } as StaffAssignment))
    callback(list)
  }, err => {
    console.error('subscribeToAllStaffAssignments error:', err)
  })
}

/** Advance project stage to next stage in order */
export async function advanceProjectStage(
  projectId: string,
  currentStage: ProjectStage
): Promise<ProjectStage> {
  const idx = STAGE_ORDER.indexOf(currentStage)
  if (idx === -1 || idx >= STAGE_ORDER.length - 1) return currentStage

  const nextStage = STAGE_ORDER[idx + 1]
  const batch = writeBatch(db)
  batch.update(doc(db, 'projects', projectId), {
    stage: nextStage,
    updatedAt: serverTimestamp(),
  })
  await batch.commit()
  return nextStage
}

/** Update project stage with optional override reason and sync client doc */
export async function updateProjectStage(
  projectId: string,
  newStage: ProjectStage,
  clientId?: string,
  override?: { by: string; reason: string }
): Promise<void> {
  const batch = writeBatch(db)
  const projectRef = doc(db, 'projects', projectId)

  const updateData: Record<string, unknown> = {
    stage: newStage,
    updatedAt: serverTimestamp(),
  }

  if (newStage === 'delivered') {
    updateData.status = 'completed'
  }

  if (override && override.reason.trim()) {
    updateData.override = {
      by: override.by,
      reason: override.reason.trim(),
      at: new Date(),
    }
  }

  batch.update(projectRef, updateData)

  if (clientId) {
    const clientRef = doc(db, 'clients', clientId)
    const clientUpdate: Record<string, unknown> = {
      stage: newStage,
      updatedAt: serverTimestamp(),
    }
    if (newStage === 'delivered') {
      clientUpdate.status = 'booked'
    }
    batch.update(clientRef, clientUpdate)
  }

  await batch.commit()
}

/** Toggle or update stage exit gates for a project */
export async function updateProjectStageGates(
  projectId: string,
  stage: string,
  gates: Record<string, boolean>
): Promise<void> {
  const projectRef = doc(db, 'projects', projectId)
  await updateDoc(projectRef, {
    [`stageGates.${stage}`]: gates,
    updatedAt: serverTimestamp(),
  })
}

/** Toggle or update photo or video track milestone */
export async function updateTrackMilestone(
  projectId: string,
  track: 'photo' | 'video',
  milestone: string,
  done: boolean
): Promise<void> {
  const projectRef = doc(db, 'projects', projectId)
  await updateDoc(projectRef, {
    [`${track}Milestones.${milestone}`]: done,
    updatedAt: serverTimestamp(),
  })
}

/** Assign a staff member to a project */
export async function assignStaffToProject(
  projectId: string,
  staffUid: string,
  clientId?: string
): Promise<void> {
  const batch = writeBatch(db)
  const projectRef = doc(db, 'projects', projectId)
  batch.update(projectRef, {
    staffUids: arrayUnion(staffUid),
    updatedAt: serverTimestamp(),
  })
  if (clientId) {
    const clientRef = doc(db, 'clients', clientId)
    batch.update(clientRef, {
      staffUids: arrayUnion(staffUid),
      updatedAt: serverTimestamp(),
    })
  }
  await batch.commit()
}

/** Remove a staff member from a project */
export async function removeStaffFromProject(
  projectId: string,
  staffUid: string,
  clientId?: string
): Promise<void> {
  const batch = writeBatch(db)
  const projectRef = doc(db, 'projects', projectId)
  batch.update(projectRef, {
    staffUids: arrayRemove(staffUid),
    updatedAt: serverTimestamp(),
  })
  if (clientId) {
    const clientRef = doc(db, 'clients', clientId)
    batch.update(clientRef, {
      staffUids: arrayRemove(staffUid),
      updatedAt: serverTimestamp(),
    })
  }
  await batch.commit()
}

/** Real-time subscription to all active projects */
export function subscribeToProjects(
  callback: (projects: Project[]) => void
): () => void {
  const q = query(collection(db, 'projects'))
  return onSnapshot(q, snap => {
    const list = snap.docs
      .map(d => mapDocToProject(d.id, d.data()))
      .filter(p => !p.isDeleted && p.status !== 'cancelled')

    list.sort((a, b) => a.eventDate.getTime() - b.eventDate.getTime())
    callback(list)
  }, err => {
    console.error('subscribeToProjects error:', err)
  })
}

/** Get active projects (non-deleted, not delivered/cancelled) */
export async function getActiveProjects(): Promise<Project[]> {
  try {
    const snap = await getDocs(collection(db, 'projects'))
    const list = snap.docs
      .map(d => mapDocToProject(d.id, d.data()))
      .filter(p => !p.isDeleted && p.status !== 'cancelled')

    list.sort((a, b) => a.eventDate.getTime() - b.eventDate.getTime())
    return list
  } catch (err) {
    console.error('Failed to get active projects:', err)
    return []
  }
}


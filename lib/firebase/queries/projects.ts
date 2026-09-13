import {
  collection, query, where,
  onSnapshot, getDoc, getDocs, doc, writeBatch, updateDoc, arrayUnion, arrayRemove,
  serverTimestamp, Timestamp
} from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import {
  Project,
  ProjectStage,
  StaffAssignment,
  EventDateEntry,
  RecurringSchedule,
  PostProductionData,
  PostProdRequirements,
  PostProdStageStatus,
  PostProdTrackStatus,
  PostProdStageData,
  ClientReviewEntry,
} from '@/types'
import { isAllowedByTestMode } from '@/lib/utils/testMode'
import { completeAllWorkItemsForProject } from './workItems'

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

function parseRecurringSchedule(raw: unknown): RecurringSchedule | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  return {
    frequency: (r.frequency as 'weekly' | 'biweekly' | 'monthly') || 'weekly',
    startDate: parseFirestoreDate(r.startDate),
    endDate: parseFirestoreDate(r.endDate),
    totalSessions: Number(r.totalSessions) || 1,
    perSessionRate: Number(r.perSessionRate) || 0,
    paymentType: (r.paymentType as 'perSession' | 'custom') || 'perSession',
    sessionStartTime: (r.sessionStartTime as string) || '09:00',
    sessionEndTime: (r.sessionEndTime as string) || '18:00',
  }
}

function parseStageCompletedAt(raw: unknown): Partial<Record<ProjectStage, Date>> | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const res: Partial<Record<ProjectStage, Date>> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v) {
      res[k as ProjectStage] = parseFirestoreDate(v)
    }
  }
  return Object.keys(res).length > 0 ? res : undefined
}

function parseClientReviewHistory(raw: unknown): ClientReviewEntry[] {
  if (!Array.isArray(raw)) return []
  return raw.map(item => ({
    decision: (item.decision === 'approved' ? 'approved' : 'notApproved') as 'approved' | 'notApproved',
    reviewedAt: parseFirestoreDate(item.reviewedAt),
    reviewedBy: String(item.reviewedBy || ''),
    notes: item.notes ? String(item.notes) : undefined,
  }))
}

function parseStageData(raw: unknown): PostProdStageData | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  return {
    status: (r.status as PostProdStageStatus) || 'pending',
    startDate: r.startDate ? parseFirestoreDate(r.startDate) : undefined,
    dueDate: r.dueDate ? parseFirestoreDate(r.dueDate) : undefined,
  }
}

function parsePostProduction(raw: unknown): PostProductionData | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const data = raw as Record<string, unknown>
  const result: PostProductionData = {
    isConfigured: Boolean(data.isConfigured),
    configuredAt: data.configuredAt ? parseFirestoreDate(data.configuredAt) : undefined,
    configuredBy: data.configuredBy ? String(data.configuredBy) : undefined,
  }

  if (data.photoTrack && typeof data.photoTrack === 'object') {
    const pt = data.photoTrack as Record<string, unknown>
    const cr = (pt.clientReview as Record<string, unknown>) || {}
    const asgn = (pt.assignment as Record<string, unknown>) || {}
    result.photoTrack = {
      status: (pt.status as PostProdTrackStatus) || 'notStarted',
      assignment: {
        staffUid: String(asgn.staffUid || ''),
        staffName: String(asgn.staffName || ''),
        freelancerId: asgn.freelancerId ? String(asgn.freelancerId) : undefined,
        freelancerName: asgn.freelancerName ? String(asgn.freelancerName) : undefined,
      },
      selectedPhotos: Boolean(pt.selectedPhotos),
      rawDelivered: Boolean(pt.rawDelivered),
      designing: parseStageData(pt.designing) || { status: 'pending' },
      clientReview: {
        status: (cr.status as PostProdStageStatus) || 'pending',
        required: cr.required !== undefined ? Boolean(cr.required) : true,
        history: parseClientReviewHistory(cr.history),
      },
    }
  }

  if (data.albumTrack && typeof data.albumTrack === 'object') {
    const at = data.albumTrack as Record<string, unknown>
    const cr = (at.clientReview as Record<string, unknown>) || {}
    const asgn = (at.assignment as Record<string, unknown>) || {}
    result.albumTrack = {
      status: (at.status as PostProdTrackStatus) || 'notStarted',
      assignment: {
        staffUid: String(asgn.staffUid || ''),
        staffName: String(asgn.staffName || ''),
        freelancerId: asgn.freelancerId ? String(asgn.freelancerId) : undefined,
        freelancerName: asgn.freelancerName ? String(asgn.freelancerName) : undefined,
      },
      albumDesigning: parseStageData(at.albumDesigning) || { status: 'pending' },
      clientReview: {
        status: (cr.status as PostProdStageStatus) || 'pending',
        required: cr.required !== undefined ? Boolean(cr.required) : true,
        history: parseClientReviewHistory(cr.history),
      },
      creatingAlbum: parseStageData(at.creatingAlbum) || { status: 'pending' },
      delivered: Boolean(at.delivered),
    }
  }

  if (data.videoTrack && typeof data.videoTrack === 'object') {
    const vt = data.videoTrack as Record<string, unknown>
    const cr = (vt.clientReview as Record<string, unknown>) || {}
    const asgn = (vt.assignment as Record<string, unknown>) || {}
    result.videoTrack = {
      status: (vt.status as PostProdTrackStatus) || 'notStarted',
      assignment: {
        staffUid: String(asgn.staffUid || ''),
        staffName: String(asgn.staffName || ''),
        freelancerId: asgn.freelancerId ? String(asgn.freelancerId) : undefined,
        freelancerName: asgn.freelancerName ? String(asgn.freelancerName) : undefined,
      },
      selectedVideo: Boolean(vt.selectedVideo),
      rawVideoDelivered: Boolean(vt.rawVideoDelivered),
      highlights: parseStageData(vt.highlights) || { status: 'pending' },
      clientReview: {
        status: (cr.status as PostProdStageStatus) || 'pending',
        required: cr.required !== undefined ? Boolean(cr.required) : true,
        history: parseClientReviewHistory(cr.history),
      },
    }
  }

  if (data.fullVideoTrack && typeof data.fullVideoTrack === 'object') {
    const fvt = data.fullVideoTrack as Record<string, unknown>
    const cr = (fvt.clientReview as Record<string, unknown>) || {}
    const asgn = (fvt.assignment as Record<string, unknown>) || {}
    result.fullVideoTrack = {
      status: (fvt.status as PostProdTrackStatus) || 'notStarted',
      assignment: {
        staffUid: String(asgn.staffUid || ''),
        staffName: String(asgn.staffName || ''),
        freelancerId: asgn.freelancerId ? String(asgn.freelancerId) : undefined,
        freelancerName: asgn.freelancerName ? String(asgn.freelancerName) : undefined,
      },
      fullVideoEditing: parseStageData(fvt.fullVideoEditing) || { status: 'pending' },
      clientReview: {
        status: (cr.status as PostProdStageStatus) || 'pending',
        required: cr.required !== undefined ? Boolean(cr.required) : true,
        history: parseClientReviewHistory(cr.history),
      },
      delivered: Boolean(fvt.delivered),
    }
  }

  return result
}

function mapDocToProject(id: string, data: Record<string, unknown>): Project {
  return {
    ...data,
    projectId: id,
    eventDate: parseFirestoreDate(data.eventDate),
    createdAt: parseFirestoreDate(data.createdAt),
    updatedAt: parseFirestoreDate(data.updatedAt),
    eventDates: parseEventDates(data.eventDates),
    recurringSchedule: parseRecurringSchedule(data.recurringSchedule),
    stageCompletedAt: parseStageCompletedAt(data.stageCompletedAt),
    postProdRequirements: data.postProdRequirements as PostProdRequirements | undefined,
    postProduction: parsePostProduction(data.postProduction),
  } as unknown as Project
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
    const list = snap.docs
      .map(d => ({
        ...d.data(),
        assignmentId: d.id,
        createdAt: d.data().createdAt instanceof Timestamp ? d.data().createdAt.toDate() : new Date(),
      } as StaffAssignment))
      .filter(a => isAllowedByTestMode(a.createdAt))
    callback(list)
  })
}

/** Real-time subscription to all staff assignments */
export function subscribeToAllStaffAssignments(
  callback: (assignments: StaffAssignment[]) => void
): () => void {
  const q = query(collection(db, 'staffAssignments'))
  return onSnapshot(q, snap => {
    const list = snap.docs
      .map(d => ({
        ...d.data(),
        assignmentId: d.id,
        createdAt: d.data().createdAt instanceof Timestamp ? d.data().createdAt.toDate() : new Date(),
      } as StaffAssignment))
      .filter(a => isAllowedByTestMode(a.createdAt))
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

/** Update project stage with optional override reason, completedStage timestamp, and sync client doc */
export async function updateProjectStage(
  projectId: string,
  newStage: ProjectStage,
  clientId?: string,
  override?: { by: string; reason: string },
  completedStage?: ProjectStage
): Promise<void> {
  const batch = writeBatch(db)
  const projectRef = doc(db, 'projects', projectId)

  const updateData: Record<string, unknown> = {
    stage: newStage,
    updatedAt: serverTimestamp(),
  }

  if (completedStage) {
    updateData[`stageCompletedAt.${completedStage}`] = serverTimestamp()
  }

  if (newStage === 'delivered' && completedStage === 'delivered') {
    updateData.status = 'completed'
    updateData['stageCompletedAt.delivered'] = serverTimestamp()
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
    const clientSnap = await getDoc(clientRef)

    if (clientSnap.exists()) {
      const clientData = clientSnap.data()
      const isClientRecurring = clientData.bookingType === 'recurring' || Boolean(clientData.recurringSchedule) || Boolean(clientData.projectIds?.length)

      if (isClientRecurring && Array.isArray(clientData.projectIds) && clientData.projectIds.length > 1) {
        const projsQuery = query(collection(db, 'projects'), where('clientId', '==', clientId))
        const projsSnap = await getDocs(projsQuery)
        const siblingProjs = projsSnap.docs.map(d => ({
          id: d.id,
          sessionIndex: d.data().sessionIndex as number | undefined,
          stage: (d.id === projectId ? newStage : d.data().stage) as ProjectStage,
          status: (d.id === projectId && newStage === 'delivered' && completedStage === 'delivered') ? 'completed' : d.data().status,
          eventDate: d.data().eventDate,
        }))

        siblingProjs.sort((a, b) => (a.sessionIndex ?? 0) - (b.sessionIndex ?? 0))

        const nextPending = siblingProjs.find(p => p.stage !== 'delivered' && p.status !== 'completed')
        const allCompleted = siblingProjs.every(p => p.stage === 'delivered' || p.status === 'completed')

        const clientUpdate: Record<string, unknown> = {
          updatedAt: serverTimestamp(),
        }

        if (allCompleted) {
          clientUpdate.stage = 'delivered'
        } else if (nextPending) {
          clientUpdate.stage = nextPending.stage || 'booked'
          if (nextPending.eventDate) {
            clientUpdate.eventDate = nextPending.eventDate
          }
        }

        batch.update(clientRef, clientUpdate)
      } else {
        const clientUpdate: Record<string, unknown> = {
          stage: newStage,
          updatedAt: serverTimestamp(),
        }
        if (newStage === 'delivered') {
          clientUpdate.status = 'booked'
        }
        batch.update(clientRef, clientUpdate)
      }
    }
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

/** Toggle or update a specific session's track milestone in recurring events */
export async function updateSessionTrackMilestone(
  projectId: string,
  sessionIdx: number,
  track: 'photo' | 'video',
  milestone: string,
  done: boolean
): Promise<void> {
  const projectRef = doc(db, 'projects', projectId)
  await updateDoc(projectRef, {
    [`sessionMilestones.${sessionIdx}.${track}Milestones.${milestone}`]: done,
    updatedAt: serverTimestamp(),
  })
}

/** Update a specific session's delivery status in recurring events */
export async function updateSessionDelivery(
  projectId: string,
  sessionIdx: number,
  delivered: boolean
): Promise<void> {
  const projectRef = doc(db, 'projects', projectId)
  await updateDoc(projectRef, {
    [`sessionMilestones.${sessionIdx}.delivered`]: delivered,
    [`sessionMilestones.${sessionIdx}.deliveredAt`]: delivered ? serverTimestamp() : null,
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
      .filter(p => !p.isDeleted && p.status !== 'cancelled' && isAllowedByTestMode(p.createdAt))

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
      .filter(p => !p.isDeleted && p.status !== 'cancelled' && isAllowedByTestMode(p.createdAt))

    list.sort((a, b) => a.eventDate.getTime() - b.eventDate.getTime())
    return list
  } catch (err) {
    console.error('Failed to get active projects:', err)
    return []
  }
}

/** Soft-delete a project and all its associated work items and assignments */
export async function softDeleteProject(projectId: string, deletedBy: string): Promise<void> {
  const batch = writeBatch(db)
  const projRef = doc(db, 'projects', projectId)
  const projSnap = await getDoc(projRef)

  batch.update(projRef, {
    isDeleted: true,
    deletedBy,
    deletedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  if (projSnap.exists()) {
    const data = projSnap.data()
    if (data.clientId) {
      batch.update(doc(db, 'clients', data.clientId), {
        isDeleted: true,
        deletedBy,
        deletedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    }
  }

  // Soft-delete related work items
  const wSnap = await getDocs(query(collection(db, 'workItems'), where('projectId', '==', projectId)))
  wSnap.forEach(d => {
    batch.update(d.ref, {
      isDeleted: true,
      deletedBy,
      deletedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  })

  // Soft-delete related staff assignments
  const aSnap = await getDocs(query(collection(db, 'staffAssignments'), where('projectId', '==', projectId)))
  aSnap.forEach(d => {
    batch.update(d.ref, {
      isDeleted: true,
      deletedBy,
      deletedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  })

  await batch.commit()
}

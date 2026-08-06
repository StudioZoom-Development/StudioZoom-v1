import {
  collection, query, where,
  onSnapshot, getDoc, getDocs, doc, writeBatch,
  serverTimestamp, Timestamp
} from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { Project, ProjectStage, StaffAssignment } from '@/types'

const STAGE_ORDER: ProjectStage[] = [
  'booked',
  'planning',
  'preProduction',
  'eventDay',
  'postProduction',
  'delivered'
]

/** Get single project by ID */
export async function getProjectById(projectId: string): Promise<Project | null> {
  const snap = await getDoc(doc(db, 'projects', projectId))
  if (!snap.exists()) return null
  const data = snap.data()
  return {
    ...data,
    projectId: snap.id,
    eventDate: data.eventDate instanceof Timestamp ? data.eventDate.toDate() : data.eventDate ? new Date(data.eventDate) : new Date(),
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : data.createdAt ? new Date(data.createdAt) : new Date(),
    updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : data.updatedAt ? new Date(data.updatedAt) : new Date(),
  } as Project
}

/** Get project linked to a client by clientId */
export async function getProjectByClientId(clientId: string): Promise<Project | null> {
  const q = query(
    collection(db, 'projects'),
    where('clientId', '==', clientId)
  )
  const snap = await getDocs(q)
  if (snap.empty) return null
  const docSnap = snap.docs[0]
  const data = docSnap.data()
  return {
    ...data,
    projectId: docSnap.id,
    eventDate: data.eventDate instanceof Timestamp ? data.eventDate.toDate() : data.eventDate ? new Date(data.eventDate) : new Date(),
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : data.createdAt ? new Date(data.createdAt) : new Date(),
    updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : data.updatedAt ? new Date(data.updatedAt) : new Date(),
  } as Project
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
    const data = snap.data()
    callback({
      ...data,
      projectId: snap.id,
      eventDate: data.eventDate instanceof Timestamp ? data.eventDate.toDate() : data.eventDate ? new Date(data.eventDate) : new Date(),
      createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : data.createdAt ? new Date(data.createdAt) : new Date(),
      updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : data.updatedAt ? new Date(data.updatedAt) : new Date(),
    } as Project)
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

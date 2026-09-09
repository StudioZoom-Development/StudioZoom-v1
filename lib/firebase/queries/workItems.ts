import {
  collection, query, onSnapshot,
  addDoc, updateDoc, doc,
  serverTimestamp, Timestamp
} from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { WorkItem, WorkItemStatus, WorkItemPriority, WorkItemType, WorkTrack } from '@/types'

function docToWorkItem(d: { id: string; data: () => Record<string, unknown> }): WorkItem {
  const data = d.data()
  return {
    ...data,
    workItemId:   d.id,
    eventDate:    data.eventDate   instanceof Timestamp ? data.eventDate.toDate()   : data.eventDate   ? new Date(data.eventDate as string)   : new Date(),
    startDate:    data.startDate   instanceof Timestamp ? data.startDate.toDate()   : data.startDate   ? new Date(data.startDate as string)   : undefined,
    dueDate:      data.dueDate     instanceof Timestamp ? data.dueDate.toDate()     : data.dueDate     ? new Date(data.dueDate as string)     : undefined,
    createdAt:    data.createdAt   instanceof Timestamp ? data.createdAt.toDate()   : data.createdAt   ? new Date(data.createdAt as string)   : new Date(),
    updatedAt:    data.updatedAt   instanceof Timestamp ? data.updatedAt.toDate()   : data.updatedAt   ? new Date(data.updatedAt as string)   : undefined,
  } as WorkItem
}

/** Real-time subscription to all non-deleted work items */
export function subscribeToWorkItems(
  callback: (items: WorkItem[]) => void
): () => void {
  const q = query(collection(db, 'workItems'))
  return onSnapshot(q, snap => {
    const list = snap.docs
      .map(d => docToWorkItem(d))
      .filter(w => !w.isDeleted)
      .sort((a, b) => {
        const timeA = a.createdAt instanceof Date && !isNaN(a.createdAt.getTime()) ? a.createdAt.getTime() : 0
        const timeB = b.createdAt instanceof Date && !isNaN(b.createdAt.getTime()) ? b.createdAt.getTime() : 0
        return timeB - timeA
      })
    callback(list)
  }, err => {
    console.error('subscribeToWorkItems error:', err)
  })
}

export interface CreateWorkItemData {
  projectId:        string
  clientId:         string
  eventDate:        Date
  eventName:        string
  clientName?:      string
  type:             WorkItemType
  track:            WorkTrack
  assignedToUid:    string
  assignedToName:   string
  isFreelancer?:    boolean
  status:           WorkItemStatus
  priority?:        WorkItemPriority
  estimatedHours?:  number
  progressPercent?: number
  startDate?:       Date
  dueDate?:         Date
  notes?:           string
  createdBy:        string
}

/** Create a new work item — strips undefined values (Firestore rejects them) */
export async function createWorkItem(data: CreateWorkItemData): Promise<string> {
  // Build the Firestore document — omit any undefined optional fields
  const doc_data: Record<string, unknown> = {
    projectId:       data.projectId,
    clientId:        data.clientId,
    eventDate:       data.eventDate,
    eventName:       data.eventName,
    type:            data.type,
    track:           data.track,
    assignedToUid:   data.assignedToUid,
    assignedToName:  data.assignedToName,
    status:          data.status          ?? 'todo',
    priority:        data.priority         ?? 'medium',
    progressPercent: data.progressPercent  ?? 0,
    isDeleted:       false,
    createdAt:       serverTimestamp(),
    updatedAt:       serverTimestamp(),
  }

  // Only include optional fields when they have a value
  if (data.isFreelancer !== undefined) doc_data.isFreelancer = data.isFreelancer
  if (data.clientName)      doc_data.clientName      = data.clientName
  if (data.startDate)       doc_data.startDate       = data.startDate
  if (data.dueDate)         doc_data.dueDate         = data.dueDate
  if (data.notes)           doc_data.notes           = data.notes
  if (data.estimatedHours !== undefined) doc_data.estimatedHours = data.estimatedHours

  const ref = await addDoc(collection(db, 'workItems'), doc_data)
  return ref.id
}

/** Update work item status (and auto-set progress) */
export async function updateWorkItemStatus(
  workItemId: string,
  status:     WorkItemStatus
): Promise<void> {
  const progressMap: Record<WorkItemStatus, number> = {
    pending:    0,
    todo:       0,
    inProgress: 50,
    review:     80,
    done:       100,
  }
  await updateDoc(doc(db, 'workItems', workItemId), {
    status,
    progressPercent: progressMap[status],
    updatedAt: serverTimestamp(),
  })
}

/** Update work item progress percent */
export async function updateWorkItemProgress(
  workItemId:      string,
  progressPercent: number
): Promise<void> {
  await updateDoc(doc(db, 'workItems', workItemId), {
    progressPercent,
    updatedAt: serverTimestamp(),
  })
}

/** Update work item assignee (supports staff or freelancer) */
export async function updateWorkItemAssignee(
  workItemId:      string,
  assignedToUid:   string,
  assignedToName:  string,
  isFreelancer:    boolean = false
): Promise<void> {
  await updateDoc(doc(db, 'workItems', workItemId), {
    assignedToUid,
    assignedToName,
    isFreelancer,
    updatedAt: serverTimestamp(),
  })
}

/** Soft-delete a work item */
export async function deleteWorkItem(workItemId: string): Promise<void> {
  await updateDoc(doc(db, 'workItems', workItemId), {
    isDeleted: true,
    updatedAt: serverTimestamp(),
  })
}

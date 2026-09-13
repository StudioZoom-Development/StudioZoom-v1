import {
  collection, query, onSnapshot, getDocs,
  addDoc, updateDoc, doc, setDoc,
  serverTimestamp, Timestamp
} from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import {
  WorkItem,
  WorkItemStatus,
  WorkItemPriority,
  WorkItemType,
  WorkTrack,
  PostProdTrackKey,
  PostProdStageKey,
  PostProdStageStatus,
  PostProductionData,
  Project,
} from '@/types'
import { isAllowedByTestMode } from '@/lib/utils/testMode'

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
      .filter(w => !w.isDeleted && isAllowedByTestMode(w.createdAt))
      .sort((a, b) => {
        const timeA = a.createdAt instanceof Date && !isNaN(a.createdAt.getTime()) ? a.createdAt.getTime() : 0
        const timeB = b.createdAt instanceof Date && !isNaN(b.createdAt.getTime()) ? b.createdAt.getTime() : 0
        return timeB - timeA
      })
    cleanupDuplicateWorkItems(list).catch(() => {})
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
  postProdTrackKey?: PostProdTrackKey
  postProdStageKey?: PostProdStageKey
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
  if (data.postProdTrackKey) doc_data.postProdTrackKey = data.postProdTrackKey
  if (data.postProdStageKey) doc_data.postProdStageKey = data.postProdStageKey

  const ref = await addDoc(collection(db, 'workItems'), doc_data)
  return ref.id
}

/** Update work item status (and auto-set progress & startDate) */
export async function updateWorkItemStatus(
  workItemId: string,
  status:     WorkItemStatus,
  hasExistingStartDate = false,
  fullItemFallback?: WorkItem
): Promise<void> {
  const progressMap: Record<WorkItemStatus, number> = {
    pending:    0,
    todo:       0,
    inProgress: 50,
    review:     80,
    done:       100,
  }
  const isSynthetic = workItemId.startsWith('assign-') || workItemId.startsWith('proj-')
  if (isSynthetic && fullItemFallback) {
    await saveWorkItemDetails({
      ...fullItemFallback,
      status,
      progressPercent: progressMap[status],
    })
    return
  }

  const payload: Record<string, unknown> = {
    status,
    progressPercent: progressMap[status],
    updatedAt: serverTimestamp(),
  }
  if (status === 'inProgress' && !hasExistingStartDate) {
    payload.startDate = serverTimestamp()
  }

  if (isSynthetic) {
    await setDoc(doc(db, 'workItems', workItemId), payload, { merge: true })
  } else {
    await updateDoc(doc(db, 'workItems', workItemId), payload)
  }
}

/** Soft-delete extra duplicate work items for the same project, assignee, and type */
export async function cleanupDuplicateWorkItems(items: WorkItem[]): Promise<void> {
  const seen = new Map<string, WorkItem>()
  const duplicatesToDelete: string[] = []

  for (const item of items) {
    if (item.isDeleted) continue
    const key = `${item.projectId}_${item.assignedToUid}_${item.type}_${item.postProdTrackKey || ''}_${item.postProdStageKey || ''}`
    if (!seen.has(key)) {
      seen.set(key, item)
    } else {
      const prev = seen.get(key)!
      const rank = (s: WorkItemStatus) => s === 'done' ? 4 : s === 'review' ? 3 : s === 'inProgress' ? 2 : 1
      if (rank(item.status) > rank(prev.status)) {
        if (!prev.workItemId.startsWith('proj-') && !prev.workItemId.startsWith('assign-')) {
          duplicatesToDelete.push(prev.workItemId)
        }
        seen.set(key, item)
      } else {
        if (!item.workItemId.startsWith('proj-') && !item.workItemId.startsWith('assign-')) {
          duplicatesToDelete.push(item.workItemId)
        }
      }
    }
  }

  for (const id of duplicatesToDelete) {
    updateDoc(doc(db, 'workItems', id), { isDeleted: true, updatedAt: serverTimestamp() }).catch(() => {})
  }
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

/** Save / update work item details */
export async function saveWorkItemDetails(
  item: WorkItem
): Promise<void> {
  const isSynthetic = item.workItemId.startsWith('assign-') || item.workItemId.startsWith('proj-')
  const payload: Record<string, unknown> = {
    projectId:       item.projectId,
    clientId:        item.clientId,
    eventDate:       item.eventDate,
    eventName:       item.eventName,
    type:            item.type,
    track:           item.track,
    assignedToUid:   item.assignedToUid,
    assignedToName:  item.assignedToName,
    isFreelancer:    item.isFreelancer ?? false,
    status:          item.status,
    priority:        item.priority ?? 'medium',
    progressPercent: item.progressPercent ?? 0,
    estimatedHours:  item.estimatedHours ?? 6,
    isDeleted:       false,
    updatedAt:       serverTimestamp(),
  }
  if (item.clientName) payload.clientName = item.clientName
  if (item.dueDate) payload.dueDate = item.dueDate
  if (item.startDate) payload.startDate = item.startDate
  if (item.notes !== undefined) payload.notes = item.notes
  if (item.postProdTrackKey) payload.postProdTrackKey = item.postProdTrackKey
  if (item.postProdStageKey) payload.postProdStageKey = item.postProdStageKey

  if (isSynthetic) {
    payload.createdAt = item.createdAt || serverTimestamp()
    await setDoc(doc(db, 'workItems', item.workItemId), payload, { merge: true })
  } else {
    await updateDoc(doc(db, 'workItems', item.workItemId), payload)
  }
}

/** Soft-delete a work item */
export async function deleteWorkItem(workItemId: string): Promise<void> {
  await updateDoc(doc(db, 'workItems', workItemId), {
    isDeleted: true,
    updatedAt: serverTimestamp(),
  })
}

/**
 * Synchronize work items in Firestore when a Post-Production track stage status changes.
 */
export async function syncWorkItemForTrackStage(
  projectId: string,
  trackKey: PostProdTrackKey,
  stageKey: string,
  stageStatus: PostProdStageStatus
): Promise<void> {
  if (projectId.startsWith('demo-')) return

  const statusMap: Record<PostProdStageStatus, { status: WorkItemStatus; progressPercent: number }> = {
    pending:       { status: 'pending', progressPercent: 0 },
    inProgress:    { status: 'inProgress', progressPercent: 50 },
    waitingClient: { status: 'review', progressPercent: 80 },
    approved:      { status: 'done', progressPercent: 100 },
    notApproved:   { status: 'pending', progressPercent: 0 },
    notRequired:   { status: 'pending', progressPercent: 0 },
    completed:     { status: 'done', progressPercent: 100 },
  }

  const mapped = statusMap[stageStatus] || { status: 'pending', progressPercent: 0 }

  try {
    const q = query(collection(db, 'workItems'))
    const snap = await getDocs(q)
    const matchingDocs = snap.docs.filter(d => {
      const data = d.data()
      return !data.isDeleted &&
        data.projectId === projectId &&
        data.postProdTrackKey === trackKey &&
        data.postProdStageKey === stageKey
    })

    for (const d of matchingDocs) {
      const updateData: Record<string, unknown> = {
        status: mapped.status,
        progressPercent: mapped.progressPercent,
        updatedAt: serverTimestamp(),
      }
      if (mapped.status === 'inProgress' && !d.data().startDate) {
        updateData.startDate = serverTimestamp()
      }
      await updateDoc(doc(db, 'workItems', d.id), updateData)
    }
  } catch (err) {
    console.warn('syncWorkItemForTrackStage error:', err)
  }
}

/**
 * Mark all work items for a specific post-production track as done.
 */
export async function completeWorkItemsForTrack(
  projectId: string,
  trackKey: PostProdTrackKey
): Promise<void> {
  if (projectId.startsWith('demo-')) return

  try {
    const q = query(collection(db, 'workItems'))
    const snap = await getDocs(q)
    const matchingDocs = snap.docs.filter(d => {
      const data = d.data()
      return !data.isDeleted &&
        data.projectId === projectId &&
        data.postProdTrackKey === trackKey &&
        data.status !== 'done'
    })

    for (const d of matchingDocs) {
      await updateDoc(doc(db, 'workItems', d.id), {
        status: 'done',
        progressPercent: 100,
        updatedAt: serverTimestamp(),
      })
    }
  } catch (err) {
    console.warn('completeWorkItemsForTrack error:', err)
  }
}

/**
 * Mark all work items for a project as done (e.g. when project moves to delivered).
 */
export async function completeAllWorkItemsForProject(
  projectId: string
): Promise<void> {
  if (projectId.startsWith('demo-')) return

  try {
    const q = query(collection(db, 'workItems'))
    const snap = await getDocs(q)
    const matchingDocs = snap.docs.filter(d => {
      const data = d.data()
      return !data.isDeleted &&
        data.projectId === projectId &&
        data.status !== 'done'
    })

    for (const d of matchingDocs) {
      await updateDoc(doc(db, 'workItems', d.id), {
        status: 'done',
        progressPercent: 100,
        updatedAt: serverTimestamp(),
      })
    }
  } catch (err) {
    console.warn('completeAllWorkItemsForProject error:', err)
  }
}

/**
 * Auto-generate Work Items for each active Post-Production track when setup is completed
 */
export async function createPostProdWorkItems(
  projectId: string,
  postProduction: PostProductionData,
  project: Project,
  createdBy: string
): Promise<string[]> {
  if (projectId.startsWith('demo-')) return []
  const itemIds: string[] = []

  // Photo Track -> photoDesigning
  if (postProduction.photoTrack) {
    const pt = postProduction.photoTrack
    const isFree = Boolean(pt.assignment.freelancerId)
    const assigneeUid = isFree ? (pt.assignment.freelancerId || '') : pt.assignment.staffUid
    const assigneeName = isFree ? (pt.assignment.freelancerName || '') : pt.assignment.staffName

    const id = await createWorkItem({
      projectId,
      clientId: project.clientId,
      eventDate: project.eventDate,
      eventName: project.eventName,
      clientName: project.clientName,
      type: 'photoDesigning',
      track: 'photo',
      assignedToUid: assigneeUid,
      assignedToName: assigneeName,
      isFreelancer: isFree,
      status: 'pending',
      priority: 'medium',
      dueDate: pt.designing.dueDate,
      postProdTrackKey: 'photoTrack',
      postProdStageKey: 'designing',
      createdBy,
    })
    itemIds.push(id)
  }

  // Album Track -> albumDesigning + albumCreating
  if (postProduction.albumTrack) {
    const at = postProduction.albumTrack
    const isFree = Boolean(at.assignment.freelancerId)
    const assigneeUid = isFree ? (at.assignment.freelancerId || '') : at.assignment.staffUid
    const assigneeName = isFree ? (at.assignment.freelancerName || '') : at.assignment.staffName

    const id1 = await createWorkItem({
      projectId,
      clientId: project.clientId,
      eventDate: project.eventDate,
      eventName: project.eventName,
      clientName: project.clientName,
      type: 'albumDesigning',
      track: 'photo',
      assignedToUid: assigneeUid,
      assignedToName: assigneeName,
      isFreelancer: isFree,
      status: 'pending',
      priority: 'medium',
      dueDate: at.albumDesigning.dueDate,
      postProdTrackKey: 'albumTrack',
      postProdStageKey: 'albumDesigning',
      createdBy,
    })
    itemIds.push(id1)

    const id2 = await createWorkItem({
      projectId,
      clientId: project.clientId,
      eventDate: project.eventDate,
      eventName: project.eventName,
      clientName: project.clientName,
      type: 'albumCreating',
      track: 'photo',
      assignedToUid: assigneeUid,
      assignedToName: assigneeName,
      isFreelancer: isFree,
      status: 'pending',
      priority: 'medium',
      dueDate: at.creatingAlbum.dueDate,
      postProdTrackKey: 'albumTrack',
      postProdStageKey: 'creatingAlbum',
      createdBy,
    })
    itemIds.push(id2)
  }

  // Video Track -> highlightsEditing
  if (postProduction.videoTrack) {
    const vt = postProduction.videoTrack
    const isFree = Boolean(vt.assignment.freelancerId)
    const assigneeUid = isFree ? (vt.assignment.freelancerId || '') : vt.assignment.staffUid
    const assigneeName = isFree ? (vt.assignment.freelancerName || '') : vt.assignment.staffName

    const id = await createWorkItem({
      projectId,
      clientId: project.clientId,
      eventDate: project.eventDate,
      eventName: project.eventName,
      clientName: project.clientName,
      type: 'highlightsEditing',
      track: 'video',
      assignedToUid: assigneeUid,
      assignedToName: assigneeName,
      isFreelancer: isFree,
      status: 'pending',
      priority: 'medium',
      dueDate: vt.highlights.dueDate,
      postProdTrackKey: 'videoTrack',
      postProdStageKey: 'highlights',
      createdBy,
    })
    itemIds.push(id)
  }

  // Full Video Track -> fullVideoEditing
  if (postProduction.fullVideoTrack) {
    const fvt = postProduction.fullVideoTrack
    const isFree = Boolean(fvt.assignment.freelancerId)
    const assigneeUid = isFree ? (fvt.assignment.freelancerId || '') : fvt.assignment.staffUid
    const assigneeName = isFree ? (fvt.assignment.freelancerName || '') : fvt.assignment.staffName

    const id = await createWorkItem({
      projectId,
      clientId: project.clientId,
      eventDate: project.eventDate,
      eventName: project.eventName,
      clientName: project.clientName,
      type: 'fullVideoEditing',
      track: 'video',
      assignedToUid: assigneeUid,
      assignedToName: assigneeName,
      isFreelancer: isFree,
      status: 'pending',
      priority: 'medium',
      dueDate: fvt.fullVideoEditing.dueDate,
      postProdTrackKey: 'fullVideoTrack',
      postProdStageKey: 'fullVideoEditing',
      createdBy,
    })
    itemIds.push(id)
  }

  return itemIds
}

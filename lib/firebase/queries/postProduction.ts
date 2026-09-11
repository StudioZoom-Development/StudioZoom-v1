import {
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
  arrayUnion,
  Timestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import {
  PostProdRequirements,
  PostProductionData,
  PostProdTrackKey,
  PostProdStageStatus,
  PostProdTrackStatus,
  ClientReviewEntry,
  PostProdPhotoTrack,
  PostProdAlbumTrack,
  PostProdVideoTrack,
  PostProdFullVideoTrack,
} from '@/types'
import {
  syncWorkItemForTrackStage,
  completeWorkItemsForTrack,
} from './workItems'

/**
 * Save Post-Production Requirements configured at the BOOKED stage
 */
export async function savePostProdRequirements(
  projectId: string,
  requirements: PostProdRequirements
): Promise<void> {
  const projectRef = doc(db, 'projects', projectId)
  await updateDoc(projectRef, {
    postProdRequirements: requirements,
    updatedAt: serverTimestamp(),
  })
}

/**
 * Helper to compute overall due date as max(stage due dates) + 1 day
 */
export function computeOverallDueDate(dates: (Date | undefined | null)[]): Date | null {
  const validDates = dates.filter((d): d is Date => d instanceof Date && !isNaN(d.getTime()))
  if (validDates.length === 0) return null

  const maxTime = Math.max(...validDates.map(d => d.getTime()))
  const result = new Date(maxTime)
  result.setDate(result.getDate() + 1)
  return result
}

/**
 * Check if a photo track is fully completed
 */
export function isPhotoTrackComplete(track: PostProdPhotoTrack): boolean {
  const clientOk = !track.clientReview.required ||
    track.clientReview.status === 'approved' ||
    track.clientReview.status === 'notRequired'
  return (
    track.selectedPhotos &&
    track.rawDelivered &&
    track.designing.status === 'completed' &&
    clientOk
  )
}

/**
 * Check if an album track is fully completed
 */
export function isAlbumTrackComplete(track: PostProdAlbumTrack): boolean {
  const clientOk = !track.clientReview.required ||
    track.clientReview.status === 'approved' ||
    track.clientReview.status === 'notRequired'
  return (
    track.albumDesigning.status === 'completed' &&
    clientOk &&
    track.creatingAlbum.status === 'completed' &&
    track.delivered
  )
}

/**
 * Check if a video highlights track is fully completed
 */
export function isVideoTrackComplete(track: PostProdVideoTrack): boolean {
  const clientOk = !track.clientReview.required ||
    track.clientReview.status === 'approved' ||
    track.clientReview.status === 'notRequired'
  return (
    track.selectedVideo &&
    track.rawVideoDelivered &&
    track.highlights.status === 'completed' &&
    clientOk
  )
}

/**
 * Check if a full video track is fully completed
 */
export function isFullVideoTrackComplete(track: PostProdFullVideoTrack): boolean {
  const clientOk = !track.clientReview.required ||
    track.clientReview.status === 'approved' ||
    track.clientReview.status === 'notRequired'
  return (
    track.fullVideoEditing.status === 'completed' &&
    clientOk &&
    track.delivered
  )
}

/**
 * Recursively remove any keys whose values are undefined
 * to prevent Firestore "Unsupported field value: undefined" errors.
 */
function cleanUndefined<T>(obj: T): T {
  if (obj === null || obj === undefined || typeof obj !== 'object') return obj
  if (obj instanceof Date) return obj
  if (Array.isArray(obj)) return obj.map(cleanUndefined) as unknown as T
  const cleaned: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (value !== undefined) {
      cleaned[key] = cleanUndefined(value)
    }
  }
  return cleaned as T
}

/**
 * Initialize Post-Production with required tracks upon setup completion
 */
export async function initializePostProduction(
  projectId: string,
  postProduction: PostProductionData
): Promise<void> {
  if (projectId.startsWith('demo-')) return
  const projectRef = doc(db, 'projects', projectId)
  const cleanedPostProduction = cleanUndefined(postProduction)
  await updateDoc(projectRef, {
    postProduction: {
      ...cleanedPostProduction,
      configuredAt: serverTimestamp(),
      isConfigured: true,
    },
    updatedAt: serverTimestamp(),
  })
}

/**
 * Update the status of a specific stage within a track.
 * If transitioning to inProgress and startDate is not set, records startDate.
 */
export async function updateTrackStageStatus(
  projectId: string,
  trackKey: PostProdTrackKey,
  stageKey: string,
  status: PostProdStageStatus,
  hasExistingStartDate = false
): Promise<void> {
  if (projectId.startsWith('demo-')) return
  const projectRef = doc(db, 'projects', projectId)
  const updates: Record<string, unknown> = {
    [`postProduction.${trackKey}.${stageKey}.status`]: status,
    updatedAt: serverTimestamp(),
  }

  if (status === 'inProgress' && !hasExistingStartDate) {
    updates[`postProduction.${trackKey}.${stageKey}.startDate`] = serverTimestamp()
  }

  // If stage transitions to waitingClient, sync the track clientReview status
  if (status === 'waitingClient') {
    updates[`postProduction.${trackKey}.clientReview.status`] = 'waitingClient'
  }

  // Update track status to inProgress if not already
  updates[`postProduction.${trackKey}.status`] = 'inProgress'

  await updateDoc(projectRef, updates)

  // Synchronize matching work items in real-time
  await syncWorkItemForTrackStage(projectId, trackKey, stageKey, status)

  // Recheck track completion
  await refreshTrackCompletionStatus(projectId, trackKey)
}

/**
 * Update a checkbox field in a track (e.g., selectedPhotos, rawDelivered, delivered)
 */
export async function updateTrackCheckbox(
  projectId: string,
  trackKey: PostProdTrackKey,
  field: string,
  value: boolean
): Promise<void> {
  if (projectId.startsWith('demo-')) return
  const projectRef = doc(db, 'projects', projectId)
  await updateDoc(projectRef, {
    [`postProduction.${trackKey}.${field}`]: value,
    updatedAt: serverTimestamp(),
  })

  await refreshTrackCompletionStatus(projectId, trackKey)
}

/**
 * Submit client review decision for a track.
 * If approved -> sets clientReview status to approved.
 * If not approved -> resets upstream work stage back to pending and records rejection.
 */
export async function submitClientReview(
  projectId: string,
  trackKey: PostProdTrackKey,
  decision: 'approved' | 'notApproved',
  reviewedBy: string,
  notes?: string
): Promise<void> {
  if (projectId.startsWith('demo-')) return
  const projectRef = doc(db, 'projects', projectId)
  const entry: ClientReviewEntry = {
    decision,
    reviewedAt: new Date(),
    reviewedBy,
    notes: notes || '',
  }

  const updates: Record<string, unknown> = {
    [`postProduction.${trackKey}.clientReview.status`]: decision,
    [`postProduction.${trackKey}.clientReview.history`]: arrayUnion({
      decision: entry.decision,
      reviewedAt: Timestamp.fromDate(entry.reviewedAt),
      reviewedBy: entry.reviewedBy,
      notes: entry.notes,
    }),
    updatedAt: serverTimestamp(),
  }

  let stageKey = ''
  if (trackKey === 'photoTrack') stageKey = 'designing'
  else if (trackKey === 'albumTrack') stageKey = 'albumDesigning'
  else if (trackKey === 'videoTrack') stageKey = 'highlights'
  else if (trackKey === 'fullVideoTrack') stageKey = 'fullVideoEditing'

  if (decision === 'notApproved') {
    // Reset upstream stage back to pending
    if (stageKey) {
      updates[`postProduction.${trackKey}.${stageKey}.status`] = 'pending'
      await syncWorkItemForTrackStage(projectId, trackKey, stageKey, 'pending')
    }
    updates[`postProduction.${trackKey}.status`] = 'inProgress'
  } else if (decision === 'approved') {
    // Mark upstream stage completed
    if (stageKey) {
      updates[`postProduction.${trackKey}.${stageKey}.status`] = 'completed'
      await syncWorkItemForTrackStage(projectId, trackKey, stageKey, 'completed')
    }
  }

  await updateDoc(projectRef, updates)
  await refreshTrackCompletionStatus(projectId, trackKey)
}

/**
 * Update staff / freelancer assignment for a track
 */
export async function updateTrackAssignment(
  projectId: string,
  trackKey: PostProdTrackKey,
  staffUid: string,
  staffName: string,
  freelancerId?: string,
  freelancerName?: string
): Promise<void> {
  if (projectId.startsWith('demo-')) return
  const projectRef = doc(db, 'projects', projectId)
  await updateDoc(projectRef, {
    [`postProduction.${trackKey}.assignment`]: {
      staffUid,
      staffName,
      freelancerId: freelancerId || '',
      freelancerName: freelancerName || '',
    },
    updatedAt: serverTimestamp(),
  })
}

/**
 * Update due date for a specific stage within a track
 */
export async function updateStageDueDate(
  projectId: string,
  trackKey: PostProdTrackKey,
  stageKey: string,
  dueDate: Date
): Promise<void> {
  if (projectId.startsWith('demo-')) return
  const projectRef = doc(db, 'projects', projectId)
  await updateDoc(projectRef, {
    [`postProduction.${trackKey}.${stageKey}.dueDate`]: dueDate,
    updatedAt: serverTimestamp(),
  })
}

/**
 * Internal helper to re-evaluate track completion status and write to Firestore
 */
async function refreshTrackCompletionStatus(
  projectId: string,
  trackKey: PostProdTrackKey
): Promise<void> {
  if (projectId.startsWith('demo-')) return
  const projectRef = doc(db, 'projects', projectId)
  const snap = await getDoc(projectRef)
  if (!snap.exists()) return

  const data = snap.data()
  const postProd = data.postProduction as PostProductionData | undefined
  if (!postProd) return

  let isComplete = false
  if (trackKey === 'photoTrack' && postProd.photoTrack) {
    isComplete = isPhotoTrackComplete(postProd.photoTrack)
  } else if (trackKey === 'albumTrack' && postProd.albumTrack) {
    isComplete = isAlbumTrackComplete(postProd.albumTrack)
  } else if (trackKey === 'videoTrack' && postProd.videoTrack) {
    isComplete = isVideoTrackComplete(postProd.videoTrack)
  } else if (trackKey === 'fullVideoTrack' && postProd.fullVideoTrack) {
    isComplete = isFullVideoTrackComplete(postProd.fullVideoTrack)
  }

  const currentStatus = postProd[trackKey]?.status
  const newStatus: PostProdTrackStatus = isComplete ? 'completed' : (currentStatus === 'completed' ? 'inProgress' : (currentStatus || 'notStarted'))

  if (newStatus !== currentStatus) {
    await updateDoc(projectRef, {
      [`postProduction.${trackKey}.status`]: newStatus,
      updatedAt: serverTimestamp(),
    })
    if (newStatus === 'completed') {
      await completeWorkItemsForTrack(projectId, trackKey)
    }
  }
}

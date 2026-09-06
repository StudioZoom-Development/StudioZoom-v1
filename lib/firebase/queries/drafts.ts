import {
  collection, query, orderBy,
  onSnapshot, getDoc, getDocs, doc, setDoc, deleteDoc,
  serverTimestamp, Timestamp
} from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { BookingDraft } from '@/types'
import { BookingWizardState } from '@/app/(app)/clients/new/bookingReducer'

// In-memory fallback
let MEMORY_DRAFTS: BookingDraft[] = []

/** Real-time subscription to booking drafts */
export function subscribeToDrafts(
  callback: (drafts: BookingDraft[]) => void
): () => void {
  const q = query(collection(db, 'bookingDrafts'), orderBy('updatedAt', 'desc'))

  return onSnapshot(q, snap => {
    const list = snap.docs.map(d => {
      const data = d.data()
      return {
        ...data,
        draftId: d.id,
        createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : data.createdAt ? new Date(data.createdAt) : new Date(),
        updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : data.updatedAt ? new Date(data.updatedAt) : new Date(),
      } as BookingDraft
    })
    MEMORY_DRAFTS = list
    callback(list)
  }, error => {
    console.warn('subscribeToDrafts error, using fallback:', error)
    callback(MEMORY_DRAFTS)
  })
}

/** Get single draft by ID */
export async function getDraftById(draftId: string): Promise<BookingDraft | null> {
  const mem = MEMORY_DRAFTS.find(d => d.draftId === draftId)
  if (mem) return mem

  try {
    const snap = await getDoc(doc(db, 'bookingDrafts', draftId))
    if (!snap.exists()) return null
    const data = snap.data()
    return {
      ...data,
      draftId: snap.id,
      createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : data.createdAt ? new Date(data.createdAt) : new Date(),
      updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : data.updatedAt ? new Date(data.updatedAt) : new Date(),
    } as BookingDraft
  } catch (err) {
    console.warn('Failed to fetch draft by id:', err)
    return null
  }
}

/** Save or update a booking draft */
export async function saveBookingDraft(
  state: BookingWizardState,
  currentStep: number,
  draftId?: string,
  userId?: string
): Promise<string> {
  const targetId = draftId || doc(collection(db, 'bookingDrafts')).id
  const draftRef = doc(db, 'bookingDrafts', targetId)

  const clientName = state.clientName.trim() || 'Untitled Client'
  const eventName = state.eventName.trim() || state.clientName.trim() || 'Untitled Event'
  const name = `${clientName}${state.eventName ? ` · ${state.eventName}` : ''}`

  const payload: BookingDraft = {
    draftId:     targetId,
    name,
    clientName,
    eventName,
    eventType:   state.eventType || 'wedding',
    totalAmount: state.totalAmount || 0,
    currentStep,
    state,
    createdBy:   userId || 'system',
    createdAt:   new Date(),
    updatedAt:   new Date(),
  }

  // Update in-memory
  const existingIdx = MEMORY_DRAFTS.findIndex(d => d.draftId === targetId)
  if (existingIdx >= 0) {
    MEMORY_DRAFTS[existingIdx] = payload
  } else {
    MEMORY_DRAFTS = [payload, ...MEMORY_DRAFTS]
  }

  // Persist to Firestore
  try {
    await setDoc(draftRef, {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true })
  } catch (err) {
    console.warn('Failed to write draft to firestore:', err)
  }

  return targetId
}

/** Delete a draft */
export async function deleteBookingDraft(draftId: string): Promise<void> {
  MEMORY_DRAFTS = MEMORY_DRAFTS.filter(d => d.draftId !== draftId)
  try {
    await deleteDoc(doc(db, 'bookingDrafts', draftId))
  } catch (err) {
    console.warn('Failed to delete draft:', err)
  }
}

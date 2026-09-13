import {
  collection, query, orderBy,
  onSnapshot, getDoc, doc, setDoc, deleteDoc,
  serverTimestamp, Timestamp
} from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { BookingDraft } from '@/types'
import { BookingWizardState } from '@/app/(app)/clients/new/bookingReducer'

const LOCAL_STORAGE_KEY = 'studio_zoom_booking_drafts'

function readLocalDrafts(): BookingDraft[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map((d: Record<string, unknown>) => ({
      ...d,
      createdAt: d.createdAt ? new Date(d.createdAt as string | number | Date) : new Date(),
      updatedAt: d.updatedAt ? new Date(d.updatedAt as string | number | Date) : new Date(),
    })) as BookingDraft[]
  } catch {
    return []
  }
}

function writeLocalDrafts(drafts: BookingDraft[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(drafts))
  } catch (err) {
    console.warn('Failed to save booking drafts to localStorage:', err)
  }
}

// In-memory fallback (initialized from localStorage if in browser)
let MEMORY_DRAFTS: BookingDraft[] = []

/** Real-time subscription to booking drafts */
export function subscribeToDrafts(
  callback: (drafts: BookingDraft[]) => void
): () => void {
  // Prime memory from localStorage immediately so UI never starts empty on page load/refresh
  if (MEMORY_DRAFTS.length === 0) {
    MEMORY_DRAFTS = readLocalDrafts()
  }
  if (MEMORY_DRAFTS.length > 0) {
    callback(MEMORY_DRAFTS)
  }

  const q = query(collection(db, 'bookingDrafts'), orderBy('updatedAt', 'desc'))

  return onSnapshot(q, snap => {
    const firestoreList = snap.docs.map(d => {
      const data = d.data()
      return {
        ...data,
        draftId: d.id,
        createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : data.createdAt ? new Date(data.createdAt) : new Date(),
        updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : data.updatedAt ? new Date(data.updatedAt) : new Date(),
      } as BookingDraft
    })

    // Merge Firestore drafts with local-only drafts so unsynced drafts are preserved
    const localDrafts = readLocalDrafts()
    const mergedMap = new Map<string, BookingDraft>()

    for (const d of localDrafts) {
      mergedMap.set(d.draftId, d)
    }
    for (const d of firestoreList) {
      mergedMap.set(d.draftId, d)
    }

    const merged = Array.from(mergedMap.values()).sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )

    MEMORY_DRAFTS = merged
    writeLocalDrafts(merged)
    callback(merged)
  }, error => {
    console.warn('subscribeToDrafts Firestore error, using local/memory fallback:', error)
    const fallback = MEMORY_DRAFTS.length > 0 ? MEMORY_DRAFTS : readLocalDrafts()
    callback(fallback)
  })
}

/** Get single draft by ID */
export async function getDraftById(draftId: string): Promise<BookingDraft | null> {
  const mem = MEMORY_DRAFTS.find(d => d.draftId === draftId)
  if (mem) return mem

  const localList = readLocalDrafts()
  const localMatch = localList.find(d => d.draftId === draftId)
  if (localMatch) return localMatch

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
    console.warn('Failed to fetch draft by id from firestore:', err)
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

  const now = new Date()
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
    createdAt:   now,
    updatedAt:   now,
  }

  // 1. Update in-memory
  const existingIdx = MEMORY_DRAFTS.findIndex(d => d.draftId === targetId)
  if (existingIdx >= 0) {
    MEMORY_DRAFTS[existingIdx] = payload
  } else {
    MEMORY_DRAFTS = [payload, ...MEMORY_DRAFTS]
  }

  // 2. Persist immediately to localStorage so page refresh will NEVER lose the draft
  writeLocalDrafts(MEMORY_DRAFTS)

  // 3. Persist to Firestore (remote sync)
  try {
    await setDoc(draftRef, {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true })
  } catch (err) {
    console.warn('Failed to write draft to firestore (saved locally to browser storage):', err)
  }

  return targetId
}

/** Delete a draft */
export async function deleteBookingDraft(draftId: string): Promise<void> {
  MEMORY_DRAFTS = MEMORY_DRAFTS.filter(d => d.draftId !== draftId)
  writeLocalDrafts(MEMORY_DRAFTS)
  try {
    await deleteDoc(doc(db, 'bookingDrafts', draftId))
  } catch (err) {
    console.warn('Failed to delete draft from firestore:', err)
  }
}

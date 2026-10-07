import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import type { EventTypeOption } from '@/types'

export const DEFAULT_EVENT_TYPES: EventTypeOption[] = [
  { id: 'wedding',     label: 'Wedding',               isSystem: true, isActive: true },
  { id: 'reception',   label: 'Reception',             isSystem: true, isActive: true },
  { id: 'preWedding',  label: 'Pre-Wedding',           isSystem: true, isActive: true },
  { id: 'engagement',  label: 'Engagement',            isSystem: true, isActive: true },
  { id: 'birthday',    label: 'Birthday',              isSystem: true, isActive: true },
  { id: 'babyShower',  label: 'Baby Shower',           isSystem: true, isActive: true },
  { id: 'puberty',     label: 'Puberty / Half Saree',  isSystem: true, isActive: true },
  { id: 'corporate',   label: 'Corporate',             isSystem: true, isActive: true },
  { id: 'schoolEvent', label: 'School Event',          isSystem: true, isActive: true },
  { id: 'portrait',    label: 'Portrait',              isSystem: true, isActive: true },
  { id: 'studio',      label: 'Studio Shoot',          isSystem: true, isActive: true },
  { id: 'other',       label: 'Other',                 isSystem: true, isActive: true },
]

interface StoredEventType {
  id: string
  label: string
  isSystem?: boolean
  isActive: boolean
  isDeleted?: boolean
  createdAt?: string | Timestamp | Date
  updatedAt?: string | Timestamp | Date
}

interface EventTypesConfigDoc {
  eventTypes?: StoredEventType[]
  updatedAt?: Timestamp
}

/**
 * Real-time subscription to event types stored in /studioSettings/eventTypesConfig.
 * Merges system defaults with custom types created in Settings.
 */
export function subscribeToEventTypes(
  callback: (eventTypes: EventTypeOption[]) => void
): () => void {
  const docRef = doc(db, 'studioSettings', 'eventTypesConfig')

  return onSnapshot(
    docRef,
    (snapshot) => {
      if (!snapshot.exists()) {
        callback(DEFAULT_EVENT_TYPES)
        return
      }

      const data = snapshot.data() as EventTypesConfigDoc
      const rawStored = data.eventTypes || []

      // Map stored items
      const storedMap = new Map<string, StoredEventType>()
      for (const item of rawStored) {
        if (!item.isDeleted) {
          storedMap.set(item.id, item)
        }
      }

      // Merge defaults with stored customizations
      const result: EventTypeOption[] = []

      // 1. Process default items (updating isActive if user toggled them in config)
      for (const def of DEFAULT_EVENT_TYPES) {
        const stored = storedMap.get(def.id)
        if (stored) {
          result.push({
            id: def.id,
            label: stored.label || def.label,
            isSystem: true,
            isActive: stored.isActive !== undefined ? stored.isActive : true,
          })
          storedMap.delete(def.id)
        } else {
          result.push({ ...def })
        }
      }

      // 2. Add custom event types
      const customItems: EventTypeOption[] = []
      for (const [id, item] of storedMap.entries()) {
        customItems.push({
          id,
          label: String(item.label || ''),
          isSystem: false,
          isActive: item.isActive !== undefined ? item.isActive : true,
          createdAt: item.createdAt instanceof Timestamp
            ? item.createdAt.toDate()
            : item.createdAt
            ? new Date(item.createdAt as string)
            : undefined,
          updatedAt: item.updatedAt instanceof Timestamp
            ? item.updatedAt.toDate()
            : item.updatedAt
            ? new Date(item.updatedAt as string)
            : undefined,
        })
      }

      // Sort custom items alphabetically and append before "other"
      customItems.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))

      // Move "other" to the very end if present
      const withoutOther = result.filter(r => r.id !== 'other')
      const otherItem = result.find(r => r.id === 'other') || { id: 'other', label: 'Other', isSystem: true, isActive: true }

      const finalMerged = [...withoutOther, ...customItems, otherItem]
      callback(finalMerged)
    },
    (err) => {
      console.warn('⚠️ [subscribeToEventTypes] Subscription error, using defaults:', err)
      callback(DEFAULT_EVENT_TYPES)
    }
  )
}

/**
 * Save or update a custom event type in /studioSettings/eventTypesConfig.
 */
export async function saveEventType(params: {
  id?: string
  label: string
  isActive?: boolean
}): Promise<string> {
  const labelClean = params.label.trim()
  if (!labelClean) {
    throw new Error('Event type name is required.')
  }

  const docRef = doc(db, 'studioSettings', 'eventTypesConfig')
  const snap = await getDoc(docRef)

  let list: StoredEventType[] = []
  if (snap.exists()) {
    const data = snap.data() as EventTypesConfigDoc
    list = data.eventTypes || []
  }

  const existingId = params.id
  let targetId = existingId

  if (targetId) {
    // Update existing item
    const idx = list.findIndex(item => item.id === targetId)
    if (idx !== -1) {
      list[idx] = {
        ...list[idx],
        label: labelClean,
        isActive: params.isActive !== undefined ? params.isActive : list[idx].isActive,
        isDeleted: false,
        updatedAt: new Date().toISOString(),
      }
    } else {
      list.push({
        id: targetId,
        label: labelClean,
        isActive: params.isActive !== undefined ? params.isActive : true,
        isSystem: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    }
  } else {
    // Generate new unique ID
    const slugBase = labelClean
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'custom'
    targetId = `custom_${slugBase}_${Date.now().toString().slice(-4)}`

    list.push({
      id: targetId,
      label: labelClean,
      isActive: params.isActive !== undefined ? params.isActive : true,
      isSystem: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
  }

  await setDoc(
    docRef,
    {
      eventTypes: list,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  )

  return targetId
}

/**
 * Soft delete or remove a custom event type from /studioSettings/eventTypesConfig.
 */
export async function deleteEventType(eventTypeId: string): Promise<void> {
  const isBuiltIn = DEFAULT_EVENT_TYPES.some(d => d.id === eventTypeId)
  if (isBuiltIn) {
    throw new Error('Built-in system event types cannot be deleted. You can toggle them inactive instead.')
  }

  const docRef = doc(db, 'studioSettings', 'eventTypesConfig')
  const snap = await getDoc(docRef)
  if (!snap.exists()) return

  const data = snap.data() as EventTypesConfigDoc
  const list = data.eventTypes || []

  const updatedList = list.map(item => {
    if (item.id === eventTypeId) {
      return { ...item, isDeleted: true, updatedAt: new Date().toISOString() }
    }
    return item
  })

  await setDoc(
    docRef,
    {
      eventTypes: updatedList,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  )
}

/**
 * Toggle active status of an event type.
 */
export async function toggleEventTypeStatus(eventTypeId: string, isActive: boolean): Promise<void> {
  const docRef = doc(db, 'studioSettings', 'eventTypesConfig')
  const snap = await getDoc(docRef)

  let list: StoredEventType[] = []
  if (snap.exists()) {
    const data = snap.data() as EventTypesConfigDoc
    list = data.eventTypes || []
  }

  const idx = list.findIndex(item => item.id === eventTypeId)
  if (idx !== -1) {
    list[idx] = {
      ...list[idx],
      isActive,
      updatedAt: new Date().toISOString(),
    }
  } else {
    // If it's a default event type not yet in the config doc, add it
    const def = DEFAULT_EVENT_TYPES.find(d => d.id === eventTypeId)
    list.push({
      id: eventTypeId,
      label: def?.label || eventTypeId,
      isSystem: Boolean(def?.isSystem),
      isActive,
      updatedAt: new Date().toISOString(),
    })
  }

  await setDoc(
    docRef,
    {
      eventTypes: list,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  )
}

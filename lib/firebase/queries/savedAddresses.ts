import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import type { SavedAddress } from '@/types'

interface StoredAddress {
  id: string
  name: string
  address: string
  isDeleted?: boolean
  createdAt?: string | Timestamp | Date
  updatedAt?: string | Timestamp | Date
}

interface AddressConfigDoc {
  addresses?: StoredAddress[]
  updatedAt?: Timestamp
}

// ─── Subscriptions ────────────────────────────────────────────────────────────

/**
 * Real-time subscription to active (non-deleted) saved addresses in /studioSettings/addressConfig,
 * ordered alphabetically by name.
 */
export function subscribeToSavedAddresses(
  callback: (addresses: SavedAddress[]) => void
): () => void {
  const docRef = doc(db, 'studioSettings', 'addressConfig')

  return onSnapshot(
    docRef,
    snapshot => {
      if (!snapshot.exists()) {
        callback([])
        return
      }

      const data = snapshot.data() as AddressConfigDoc
      const rawList = data.addresses || []

      const activeAddresses: SavedAddress[] = rawList
        .filter(item => !item.isDeleted)
        .map(item => ({
          id: item.id,
          name: String(item.name || ''),
          address: String(item.address || ''),
          isDeleted: Boolean(item.isDeleted),
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
        }))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))

      callback(activeAddresses)
    },
    err => {
      console.error('[savedAddresses] subscribeToSavedAddresses error:', err)
      callback([])
    }
  )
}

// ─── Mutations ────────────────────────────────────────────────────────────────

/**
 * Save or update a saved address inside /studioSettings/addressConfig.
 * Generates a unique address ID if not provided.
 */
export async function saveSavedAddress(params: {
  id?: string
  name: string
  address: string
}): Promise<string> {
  const trimmedName = params.name.trim()
  const trimmedAddress = params.address.trim()

  if (!trimmedName) throw new Error('Name is required')
  if (!trimmedAddress) throw new Error('Address is required')

  const docRef = doc(db, 'studioSettings', 'addressConfig')
  const snap = await getDoc(docRef)
  const currentData = snap.exists() ? (snap.data() as AddressConfigDoc) : {}
  const addresses: StoredAddress[] = [...(currentData.addresses || [])]

  let targetId = params.id
  const nowIso = new Date().toISOString()

  if (targetId) {
    const idx = addresses.findIndex(a => a.id === targetId)
    if (idx >= 0) {
      addresses[idx] = {
        ...addresses[idx],
        name: trimmedName,
        address: trimmedAddress,
        isDeleted: false,
        updatedAt: nowIso,
      }
    } else {
      addresses.push({
        id: targetId,
        name: trimmedName,
        address: trimmedAddress,
        isDeleted: false,
        createdAt: nowIso,
        updatedAt: nowIso,
      })
    }
  } else {
    targetId = `addr_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
    addresses.push({
      id: targetId,
      name: trimmedName,
      address: trimmedAddress,
      isDeleted: false,
      createdAt: nowIso,
      updatedAt: nowIso,
    })
  }

  await setDoc(
    docRef,
    {
      addresses,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  )

  return targetId
}

/**
 * Soft delete a saved address by setting isDeleted: true inside /studioSettings/addressConfig.
 */
export async function deleteSavedAddress(id: string): Promise<void> {
  if (!id) return

  const docRef = doc(db, 'studioSettings', 'addressConfig')
  const snap = await getDoc(docRef)
  if (!snap.exists()) return

  const currentData = snap.data() as AddressConfigDoc
  const addresses: StoredAddress[] = (currentData.addresses || []).map(a => {
    if (a.id === id) {
      return {
        ...a,
        isDeleted: true,
        updatedAt: new Date().toISOString(),
      }
    }
    return a
  })

  await setDoc(
    docRef,
    {
      addresses,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  )
}

import {
  collection, query, orderBy,
  onSnapshot, getDoc, doc, writeBatch,
  serverTimestamp, Timestamp
} from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { Client } from '@/types'

export interface ClientFilters {
  status?:        string
  eventType?:     string
  paymentStatus?: string
}

/** Real-time subscription — returns unsubscribe function */
export function subscribeToClients(
  filters: ClientFilters,
  callback: (clients: Client[]) => void
): () => void {
  const q = query(collection(db, 'clients'), orderBy('createdAt', 'desc'))

  return onSnapshot(q, snap => {
    let clients = snap.docs
      .map(d => {
        const data = d.data()
        return {
          ...data,
          clientId:  d.id,
          eventDate: data.eventDate instanceof Timestamp
            ? data.eventDate.toDate()
            : data.eventDate ? new Date(data.eventDate) : new Date(),
          createdAt: data.createdAt instanceof Timestamp
            ? data.createdAt.toDate()
            : data.createdAt ? new Date(data.createdAt) : new Date(),
        } as Client
      })
      .filter(c => !c.isDeleted)  // exclude soft-deleted

    if (filters.eventType) {
      clients = clients.filter(c => c.eventType === filters.eventType)
    }
    if (filters.paymentStatus) {
      clients = clients.filter(c => c.paymentStatus === filters.paymentStatus)
    }
    if (filters.status) {
      clients = clients.filter(c => c.status === filters.status)
    }

    callback(clients)
  }, error => {
    console.error('Error in subscribeToClients:', error)
  })
}

/** Single client by ID */
export async function getClientById(clientId: string): Promise<Client | null> {
  const snap = await getDoc(doc(db, 'clients', clientId))
  if (!snap.exists()) return null
  const data = snap.data()
  return {
    ...data,
    clientId: snap.id,
    eventDate: data.eventDate instanceof Timestamp ? data.eventDate.toDate() : data.eventDate ? new Date(data.eventDate) : new Date(),
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : data.createdAt ? new Date(data.createdAt) : new Date(),
  } as Client
}

/** Soft delete — isDeleted: true, never hard-delete */
export async function softDeleteClient(clientId: string, deletedBy: string): Promise<void> {
  const batch = writeBatch(db)
  batch.update(doc(db, 'clients', clientId), {
    isDeleted:  true,
    deletedBy,
    deletedAt:  serverTimestamp(),
    updatedAt:  serverTimestamp(),
  })
  await batch.commit()
}

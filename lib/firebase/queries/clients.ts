import {
  collection, query, where, orderBy,
  onSnapshot, getDoc, doc, writeBatch,
  serverTimestamp, QueryConstraint, Timestamp
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
  const constraints: QueryConstraint[] = [orderBy('createdAt', 'desc')]

  if (filters.eventType)     constraints.push(where('eventType',     '==', filters.eventType))
  if (filters.paymentStatus) constraints.push(where('paymentStatus', '==', filters.paymentStatus))
  if (filters.status)        constraints.push(where('status',        '==', filters.status))

  const q = query(collection(db, 'clients'), ...constraints)

  return onSnapshot(q, snap => {
    callback(
      snap.docs
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
    )
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

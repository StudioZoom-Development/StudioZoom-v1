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

/** Real-time payments subcollection for a client */
export function subscribeToPayments(
  clientId: string,
  callback: (payments: Array<{
    paymentId: string; instalment: string
    amount: number; date: Date; method: string; recordedBy: string; recordedByName?: string
  }>) => void
): () => void {
  const q = query(
    collection(db, 'clients', clientId, 'payments'),
    orderBy('date', 'asc')
  )
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({
      paymentId:      d.id,
      instalment:     d.data().instalment as string,
      amount:         d.data().amount     as number,
      method:         d.data().method     as string,
      recordedBy:     d.data().recordedBy as string,
      recordedByName: (d.data().recordedByName as string) ?? (d.data().recordedBy as string),
      date: d.data().date instanceof Timestamp
        ? d.data().date.toDate()
        : d.data().date ? new Date(d.data().date) : new Date(),
    })))
  })
}

/** Record a new payment — batch updates payment subcollection + client.balanceDue */
export async function recordPayment(
  clientId: string,
  payment: { instalment: string; amount: number; date: Date; method: string },
  recordedBy: string,
  recordedByName?: string
): Promise<void> {
  const clientSnap = await getDoc(doc(db, 'clients', clientId))
  if (!clientSnap.exists()) throw new Error('Client not found')
  const data = clientSnap.data()

  const total = Number(data.totalAmount) || 0
  const balance = Number(data.balanceDue) ?? total
  const currentPaid = Math.max(0, total - balance)
  const newPaid     = currentPaid + payment.amount
  const newBalance  = Math.max(0, total - newPaid)
  const newStatus   = newBalance === 0 ? 'paid'
    : newPaid > 0 ? 'partial' : 'unpaid'

  const batch = writeBatch(db)

  // Write payment doc
  const payRef = doc(collection(db, 'clients', clientId, 'payments'))
  batch.set(payRef, {
    paymentId:      payRef.id,
    instalment:     payment.instalment,
    amount:         payment.amount,
    date:           Timestamp.fromDate(payment.date),
    method:         payment.method,
    recordedBy,
    recordedByName: recordedByName ?? recordedBy,
    createdAt:      serverTimestamp(),
  })

  // Update client balanceDue + paymentStatus in same batch
  batch.update(doc(db, 'clients', clientId), {
    balanceDue:    newBalance,
    paymentStatus: newStatus,
    updatedAt:     serverTimestamp(),
  })

  await batch.commit()
}

/** Atomic new booking — client + payment + project + settings counter */
export async function createBooking(data: {
  eventName: string; eventType: string; eventDate: Date; location: string
  clientName: string; contact: string; email: string
  packageType: string; totalAmount: number
  advanceAmount: number; advanceDate: Date; paymentMethod: string
  status: 'booked' | 'inquiry'
  createdBy: string
}): Promise<string> {
  // Read invoice counter from settings (check numberingConfig doc first, then config doc)
  let nextNum = 1
  let prefix = 'ZS-INV-'
  const numSnap = await getDoc(doc(db, 'studioSettings', 'numberingConfig'))
  if (numSnap.exists()) {
    const numData = numSnap.data()
    nextNum = numData.invoiceStartNumber ?? 1
    prefix  = numData.invoicePrefix ?? 'ZS-INV-'
  } else {
    const settSnap = await getDoc(doc(db, 'studioSettings', 'config'))
    if (settSnap.exists()) {
      const settings = settSnap.data()
      nextNum = settings.invoiceStartNumber ?? 1
      prefix  = settings.invoicePrefix ?? 'ZS-INV-'
    }
  }

  const year      = new Date().getFullYear()
  const invoiceNo = `${prefix}${year}-${String(nextNum).padStart(3, '0')}`

  const balanceDue    = Math.max(0, data.totalAmount - data.advanceAmount)
  const paymentStatus = balanceDue <= 0 ? 'paid'
    : data.advanceAmount > 0 ? 'partial' : 'unpaid'

  const batch      = writeBatch(db)
  const clientRef  = doc(collection(db, 'clients'))
  const projectRef = doc(collection(db, 'projects'))

  const formattedContact = data.contact.trim().startsWith('+91')
    ? data.contact.trim()
    : `+91${data.contact.trim()}`

  // Write 1: Client
  batch.set(clientRef, {
    clientId:      clientRef.id,
    projectId:     projectRef.id,
    name:          data.clientName,
    contact:       formattedContact,
    email:         data.email,
    eventName:     data.eventName,
    eventType:     data.eventType,
    eventDate:     Timestamp.fromDate(data.eventDate),
    location:      data.location,
    packageType:   data.packageType,
    totalAmount:   data.totalAmount,
    balanceDue,
    paymentStatus,
    invoiceNumber: invoiceNo,
    status:        data.status,
    isDeleted:     false,
    createdBy:     data.createdBy,
    createdAt:     serverTimestamp(),
    updatedAt:     serverTimestamp(),
  })

  // Write 2: First payment (only if advance > 0)
  if (data.advanceAmount > 0) {
    const payRef = doc(collection(db, 'clients', clientRef.id, 'payments'))
    batch.set(payRef, {
      paymentId:  payRef.id,
      instalment: '1st',
      amount:     data.advanceAmount,
      date:       Timestamp.fromDate(data.advanceDate),
      method:     data.paymentMethod,
      recordedBy: data.createdBy,
      createdAt:  serverTimestamp(),
    })
  }

  // Write 3: Project — denormalized fields from client
  batch.set(projectRef, {
    projectId:     projectRef.id,
    clientId:      clientRef.id,
    eventDate:     Timestamp.fromDate(data.eventDate),   // DENORMALIZED
    eventName:     data.eventName,                       // DENORMALIZED
    clientName:    data.clientName,                      // DENORMALIZED
    clientContact: formattedContact,                     // DENORMALIZED
    eventType:     data.eventType,                       // DENORMALIZED
    packageType:   data.packageType,                     // DENORMALIZED
    stage:         'booked',
    status:        'upcoming',
    staffUids:     [],
    freelancerIds: [],
    milestones:    data.advanceAmount > 0
      ? { depositPaid: Timestamp.fromDate(data.advanceDate) }
      : {},
    createdBy:     data.createdBy,
    createdAt:     serverTimestamp(),
    updatedAt:     serverTimestamp(),
  })

  // Write 4: Increment invoice counter
  if (data.status === 'booked') {
    if (numSnap.exists()) {
      batch.update(doc(db, 'studioSettings', 'numberingConfig'), {
        invoiceStartNumber: nextNum + 1,
      })
    } else {
      batch.set(doc(db, 'studioSettings', 'config'), {
        invoiceStartNumber: nextNum + 1,
      }, { merge: true })
    }
  }

  await batch.commit()
  return clientRef.id
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

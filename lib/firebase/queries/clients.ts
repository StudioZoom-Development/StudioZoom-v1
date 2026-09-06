import {
  collection, query, orderBy,
  onSnapshot, getDoc, doc, writeBatch,
  serverTimestamp, Timestamp
} from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { Client, EventDateEntry } from '@/types'

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
          stage:     data.stage || (data.status === 'inquiry' ? 'inquiry' : 'booked'),
          customEventType: data.customEventType || '',
          startTime: data.startTime || '',
          endTime:   data.endTime || '',
          eventDate: data.eventDate instanceof Timestamp
            ? data.eventDate.toDate()
            : data.eventDate ? new Date(data.eventDate) : new Date(),
          createdAt: data.createdAt instanceof Timestamp
            ? data.createdAt.toDate()
            : data.createdAt ? new Date(data.createdAt) : new Date(),
          eventDates: Array.isArray(data.eventDates)
            ? data.eventDates.map((ed: Partial<EventDateEntry>) => ({
                ...ed,
                date: ed.date instanceof Timestamp
                  ? ed.date.toDate()
                  : ed.date ? new Date(ed.date) : new Date(),
                startTime: ed.startTime || '',
                endTime:   ed.endTime || '',
              }))
            : [],
          recurringSchedule: data.recurringSchedule
            ? {
                ...data.recurringSchedule,
                startDate: data.recurringSchedule.startDate instanceof Timestamp
                  ? data.recurringSchedule.startDate.toDate()
                  : new Date(data.recurringSchedule.startDate),
                endDate: data.recurringSchedule.endDate instanceof Timestamp
                  ? data.recurringSchedule.endDate.toDate()
                  : new Date(data.recurringSchedule.endDate),
              }
            : undefined,
        } as Client
      })
      .filter(c => !c.isDeleted && c.status !== 'inquiry')  // exclude soft-deleted and draft inquiries

    if (filters.eventType) {
      clients = clients.filter(c => c.eventType === filters.eventType)
    }
    if (filters.paymentStatus) {
      const now = new Date()
      if (filters.paymentStatus === 'overdue') {
        clients = clients.filter(c => c.paymentStatus === 'overdue' || ((c.balanceDue ?? 0) > 0 && c.eventDate instanceof Date && c.eventDate < now))
      } else if (filters.paymentStatus === 'unpaid') {
        clients = clients.filter(c => c.paymentStatus === 'unpaid' || ((c.balanceDue ?? 0) > 0 && ((c.totalAmount ?? 0) === 0 || (c.balanceDue ?? 0) >= (c.totalAmount ?? 0))))
      } else if (filters.paymentStatus === 'paid') {
        clients = clients.filter(c => c.paymentStatus === 'paid' || (c.balanceDue ?? 0) === 0)
      } else if (filters.paymentStatus === 'partial') {
        clients = clients.filter(c => c.paymentStatus === 'partial' || ((c.balanceDue ?? 0) > 0 && (c.balanceDue ?? 0) < (c.totalAmount ?? 0)))
      } else {
        clients = clients.filter(c => c.paymentStatus === filters.paymentStatus)
      }
    }
    if (filters.status) {
      clients = clients.filter(c => (c.stage || c.status) === filters.status)
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
    stage: data.stage || (data.status === 'inquiry' ? 'inquiry' : 'booked'),
    customEventType: data.customEventType || '',
    startTime: data.startTime || '',
    endTime:   data.endTime || '',
    eventDate: data.eventDate instanceof Timestamp ? data.eventDate.toDate() : data.eventDate ? new Date(data.eventDate) : new Date(),
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : data.createdAt ? new Date(data.createdAt) : new Date(),
    eventDates: Array.isArray(data.eventDates)
      ? data.eventDates.map((ed: Partial<EventDateEntry>) => ({
          ...ed,
          date: ed.date instanceof Timestamp
            ? ed.date.toDate()
            : ed.date ? new Date(ed.date) : new Date(),
          startTime: ed.startTime || '',
          endTime:   ed.endTime || '',
        }))
      : [],
    recurringSchedule: data.recurringSchedule
      ? {
          ...data.recurringSchedule,
          startDate: data.recurringSchedule.startDate instanceof Timestamp
            ? data.recurringSchedule.startDate.toDate()
            : new Date(data.recurringSchedule.startDate),
          endDate: data.recurringSchedule.endDate instanceof Timestamp
            ? data.recurringSchedule.endDate.toDate()
            : new Date(data.recurringSchedule.endDate),
        }
      : undefined,
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
  const client = clientSnap.data()

  const currentBalance = Number(client.balanceDue) ?? Number(client.totalAmount)
  const newBalance    = Math.max(0, currentBalance - payment.amount)
  const newPaid       = (Number(client.totalAmount) || 0) - newBalance
  const newStatus     = newBalance <= 0 ? 'paid'
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
  eventName: string; eventType: string; customEventType?: string; eventDate: Date; location: string
  startTime?: string; endTime?: string
  clientName: string; contact: string; email: string
  packageType: string; totalAmount: number
  advanceAmount: number; advanceDate: Date; paymentMethod: string
  status: 'booked' | 'inquiry'
  createdBy: string
  notes?: string
  bookingType?: 'oneTime' | 'multiDate' | 'recurring'
  eventDates?: Array<{ id: string; date: Date | string; label: string; location?: string; startTime?: string; endTime?: string }>
  recurringSchedule?: { frequency: string; startDate: Date | string; endDate: Date | string; totalSessions: number; perSessionRate: number; paymentType?: 'perSession' | 'custom'; sessionStartTime?: string; sessionEndTime?: string }
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

  const formattedEventDates = data.eventDates && data.eventDates.length > 0
    ? data.eventDates.map(ed => ({
        id: ed.id,
        label: ed.label,
        date: Timestamp.fromDate(new Date(ed.date)),
        location: ed.location || '',
        startTime: ed.startTime || '09:00',
        endTime:   ed.endTime || '18:00',
      }))
    : []

  const formattedRecurringSchedule = data.recurringSchedule
    ? {
        frequency:        data.recurringSchedule.frequency,
        startDate:        Timestamp.fromDate(new Date(data.recurringSchedule.startDate)),
        endDate:          Timestamp.fromDate(new Date(data.recurringSchedule.endDate)),
        totalSessions:    data.recurringSchedule.totalSessions,
        perSessionRate:   data.recurringSchedule.perSessionRate,
        paymentType:      data.recurringSchedule.paymentType || 'perSession',
        sessionStartTime: data.recurringSchedule.sessionStartTime || '09:00',
        sessionEndTime:   data.recurringSchedule.sessionEndTime || '18:00',
      }
    : null

  const clientDocData = {
    clientId:          clientRef.id,
    projectId:         projectRef.id,
    name:              data.clientName,
    contact:           formattedContact,
    email:             data.email,
    eventName:         data.eventName,
    eventType:         data.eventType,
    customEventType:   data.customEventType || '',
    eventDate:         Timestamp.fromDate(data.eventDate),
    startTime:         data.startTime || '09:00',
    endTime:           data.endTime || '18:00',
    location:          data.location,
    notes:             data.notes || '',
    bookingType:       data.bookingType || 'oneTime',
    eventDates:        formattedEventDates,
    ...(formattedRecurringSchedule ? { recurringSchedule: formattedRecurringSchedule } : {}),
    packageType:       data.packageType,
    totalAmount:       data.totalAmount,
    balanceDue,
    paymentStatus,
    invoiceNumber:     invoiceNo,
    status:            data.status,
    isDeleted:         false,
    createdBy:         data.createdBy,
    createdAt:         serverTimestamp(),
    updatedAt:         serverTimestamp(),
  }

  // Write 1: Client
  batch.set(clientRef, clientDocData)

  // Write 2: First payment (only if advance > 0)
  let paymentDocData: Record<string, unknown> | null = null
  if (data.advanceAmount > 0) {
    const payRef = doc(collection(db, 'clients', clientRef.id, 'payments'))
    paymentDocData = {
      paymentId:  payRef.id,
      instalment: '1st',
      amount:     data.advanceAmount,
      date:       Timestamp.fromDate(data.advanceDate),
      method:     data.paymentMethod,
      recordedBy: data.createdBy,
      createdAt:  serverTimestamp(),
    }
    batch.set(payRef, paymentDocData)
  }

  const projectDocData = {
    projectId:         projectRef.id,
    clientId:          clientRef.id,
    eventDate:         Timestamp.fromDate(data.eventDate),   // DENORMALIZED
    startTime:         data.startTime || '09:00',            // DENORMALIZED
    endTime:           data.endTime || '18:00',              // DENORMALIZED
    eventName:         data.eventName,                       // DENORMALIZED
    clientName:        data.clientName,                      // DENORMALIZED
    clientContact:     formattedContact,                     // DENORMALIZED
    eventType:         data.eventType,                       // DENORMALIZED
    customEventType:   data.customEventType || '',           // DENORMALIZED
    notes:             data.notes || '',                     // DENORMALIZED
    bookingType:       data.bookingType || 'oneTime',        // DENORMALIZED
    eventDates:        formattedEventDates,                  // DENORMALIZED
    ...(formattedRecurringSchedule ? { recurringSchedule: formattedRecurringSchedule } : {}),
    packageType:       data.packageType,                     // DENORMALIZED
    stage:             'booked',
    status:            'upcoming',
    staffUids:         [],
    freelancerIds:     [],
    milestones:        data.advanceAmount > 0
      ? { depositPaid: Timestamp.fromDate(data.advanceDate) }
      : {},
    createdBy:         data.createdBy,
    createdAt:         serverTimestamp(),
    updatedAt:         serverTimestamp(),
  }

  // Write 3: Project — denormalized fields from client
  batch.set(projectRef, projectDocData)

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

  console.group('🔥 [createBooking] Firestore Batch Payload')
  console.log('Incoming Data:', data)
  console.log('Client Document (/clients/' + clientRef.id + '):', clientDocData)
  if (paymentDocData) {
    console.log('Payment Document (/clients/' + clientRef.id + '/payments):', paymentDocData)
  }
  console.log('Project Document (/projects/' + projectRef.id + '):', projectDocData)
  console.log('Invoice Number Generated:', invoiceNo)
  console.groupEnd()

  await batch.commit()

  console.log('✅ [createBooking] Successfully committed batch. Created clientId:', clientRef.id)
  return clientRef.id
}

/** Update client details — updates client and syncs denormalized project fields */
export async function updateClient(
  clientId: string,
  updates: {
    name?: string
    contact?: string
    email?: string
    eventName?: string
    eventType?: string
    customEventType?: string
    startTime?: string
    endTime?: string
    eventDate?: Date
    location?: string
    notes?: string
    packageType?: string
    totalAmount?: number
    status?: 'booked' | 'inquiry'
    bookingType?: 'oneTime' | 'multiDate' | 'recurring'
    eventDates?: Array<{ id: string; date: Date | string; label: string; location?: string; startTime?: string; endTime?: string }>
    recurringSchedule?: { frequency: string; startDate: Date | string; endDate: Date | string; totalSessions: number; perSessionRate: number; paymentType?: 'perSession' | 'custom'; sessionStartTime?: string; sessionEndTime?: string }
  },
  updatedBy: string
): Promise<void> {
  const clientRef = doc(db, 'clients', clientId)
  const clientSnap = await getDoc(clientRef)
  if (!clientSnap.exists()) throw new Error('Client not found')
  const clientData = clientSnap.data()

  const batch = writeBatch(db)

  const clientUpdates: Record<string, unknown> = {
    updatedBy,
    updatedAt: serverTimestamp(),
  }

  if (updates.name !== undefined) clientUpdates.name = updates.name.trim()
  if (updates.contact !== undefined) {
    const trimmed = updates.contact.trim()
    clientUpdates.contact = trimmed.startsWith('+91') ? trimmed : `+91${trimmed}`
  }
  if (updates.email !== undefined) clientUpdates.email = updates.email.trim()
  if (updates.eventName !== undefined) clientUpdates.eventName = updates.eventName.trim()
  if (updates.eventType !== undefined) clientUpdates.eventType = updates.eventType
  if (updates.customEventType !== undefined) clientUpdates.customEventType = updates.customEventType.trim()
  if (updates.startTime !== undefined) clientUpdates.startTime = updates.startTime
  if (updates.endTime !== undefined) clientUpdates.endTime = updates.endTime
  if (updates.location !== undefined) clientUpdates.location = updates.location.trim()
  if (updates.notes !== undefined) clientUpdates.notes = updates.notes.trim()
  if (updates.packageType !== undefined) clientUpdates.packageType = updates.packageType
  if (updates.status !== undefined) clientUpdates.status = updates.status
  if (updates.bookingType !== undefined) clientUpdates.bookingType = updates.bookingType

  if (updates.eventDate !== undefined) {
    clientUpdates.eventDate = Timestamp.fromDate(updates.eventDate)
  }

  if (updates.eventDates !== undefined) {
    clientUpdates.eventDates = updates.eventDates.map(ed => ({
      id: ed.id,
      label: ed.label,
      date: Timestamp.fromDate(new Date(ed.date)),
      location: ed.location || '',
      startTime: ed.startTime || '09:00',
      endTime:   ed.endTime || '18:00',
    }))
  }

  if (updates.recurringSchedule !== undefined) {
    clientUpdates.recurringSchedule = updates.recurringSchedule ? {
      frequency:        updates.recurringSchedule.frequency,
      startDate:        Timestamp.fromDate(new Date(updates.recurringSchedule.startDate)),
      endDate:          Timestamp.fromDate(new Date(updates.recurringSchedule.endDate)),
      totalSessions:    updates.recurringSchedule.totalSessions,
      perSessionRate:   updates.recurringSchedule.perSessionRate,
      paymentType:      updates.recurringSchedule.paymentType || 'perSession',
      sessionStartTime: updates.recurringSchedule.sessionStartTime || '09:00',
      sessionEndTime:   updates.recurringSchedule.sessionEndTime || '18:00',
    } : null
  }

  if (updates.totalAmount !== undefined) {
    clientUpdates.totalAmount = updates.totalAmount
    // Calculate new balance due using current advance / payments
    const total = updates.totalAmount
    const currentTotal = Number(clientData.totalAmount) || 0
    const currentBalance = Number(clientData.balanceDue) ?? currentTotal
    const advancePaid = Math.max(0, currentTotal - currentBalance)
    const newBalance = Math.max(0, total - advancePaid)
    clientUpdates.balanceDue = newBalance
    clientUpdates.paymentStatus = newBalance <= 0 ? 'paid' : advancePaid > 0 ? 'partial' : 'unpaid'
  }

  batch.update(clientRef, clientUpdates)

  // Sync with project if projectId is linked
  const projectId = clientData.projectId
  if (projectId) {
    const projectRef = doc(db, 'projects', projectId)
    const projectSnap = await getDoc(projectRef)
    if (projectSnap.exists()) {
      const projectUpdates: Record<string, unknown> = {
        updatedBy,
        updatedAt: serverTimestamp(),
      }
      if (clientUpdates.eventName) projectUpdates.eventName = clientUpdates.eventName
      if (clientUpdates.name) projectUpdates.clientName = clientUpdates.name
      if (clientUpdates.contact) projectUpdates.clientContact = clientUpdates.contact
      if (clientUpdates.eventType) projectUpdates.eventType = clientUpdates.eventType
      if (clientUpdates.customEventType !== undefined) projectUpdates.customEventType = clientUpdates.customEventType
      if (clientUpdates.startTime !== undefined) projectUpdates.startTime = clientUpdates.startTime
      if (clientUpdates.endTime !== undefined) projectUpdates.endTime = clientUpdates.endTime
      if (clientUpdates.packageType) projectUpdates.packageType = clientUpdates.packageType
      if (clientUpdates.eventDate) projectUpdates.eventDate = clientUpdates.eventDate
      if (clientUpdates.eventDates) projectUpdates.eventDates = clientUpdates.eventDates
      if (clientUpdates.bookingType) projectUpdates.bookingType = clientUpdates.bookingType
      if (clientUpdates.notes) projectUpdates.notes = clientUpdates.notes
      if (clientUpdates.recurringSchedule !== undefined) projectUpdates.recurringSchedule = clientUpdates.recurringSchedule

      batch.update(projectRef, projectUpdates)
    }
  }

  await batch.commit()
}

/** Soft delete — isDeleted: true, never hard-delete */
export async function softDeleteClient(clientId: string, deletedBy: string): Promise<void> {
  const batch = writeBatch(db)
  const clientRef = doc(db, 'clients', clientId)
  const clientSnap = await getDoc(clientRef)
  
  batch.update(clientRef, {
    isDeleted:  true,
    deletedBy,
    deletedAt:  serverTimestamp(),
    updatedAt:  serverTimestamp(),
  })

  if (clientSnap.exists()) {
    const data = clientSnap.data()
    if (data.projectId) {
      batch.update(doc(db, 'projects', data.projectId), {
        isDeleted:  true,
        deletedBy,
        deletedAt:  serverTimestamp(),
        updatedAt:  serverTimestamp(),
      })
    }
  }

  await batch.commit()
}

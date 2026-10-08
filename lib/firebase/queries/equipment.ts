import {
  collection,
  query,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  getDoc,
  serverTimestamp,
  Timestamp,
  addDoc,
  writeBatch,
  where,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import type {
  Equipment,
  EquipmentCategory,
  EquipmentCondition,
  EquipmentStatus,
  EquipmentKit,
  EquipmentStatusLog,
  Checkout,
  CheckoutStatus,
} from '@/types'

export interface CreateEquipmentInput {
  itemCode?: string
  name: string
  category: EquipmentCategory
  brand: string
  model: string
  serialNumber: string
  purchaseDate?: Date
  purchasePrice: number
  vendor?: string
  warrantyExpiry?: Date
  condition: EquipmentCondition
  location: string
  photoUrl?: string
  status?: EquipmentStatus
  notes?: string
  kitId?: string
  parentItemId?: string
}

export interface UpdateEquipmentInput {
  itemCode?: string
  name?: string
  category?: EquipmentCategory
  brand?: string
  model?: string
  serialNumber?: string
  purchaseDate?: Date
  purchasePrice?: number
  vendor?: string
  warrantyExpiry?: Date
  condition?: EquipmentCondition
  location?: string
  photoUrl?: string
  status?: EquipmentStatus
  notes?: string
  kitId?: string
  parentItemId?: string
  assignedToUid?: string
  assignedToName?: string
  currentCheckoutId?: string
  dueBackDate?: Date
  nextMaintenanceDate?: Date
}

function parseDate(val: unknown, fallback?: Date): Date | undefined {
  if (!val) return fallback
  if (val instanceof Date && !isNaN(val.getTime())) return val
  if (typeof (val as { toDate?: () => Date }).toDate === 'function') {
    const d = (val as { toDate: () => Date }).toDate()
    if (!isNaN(d.getTime())) return d
  }
  if (typeof val === 'object' && val !== null) {
    if ('seconds' in val && typeof (val as { seconds: number }).seconds === 'number') {
      const d = new Date((val as { seconds: number }).seconds * 1000)
      if (!isNaN(d.getTime())) return d
    }
  }
  const parsed = new Date(val as string | number)
  return !isNaN(parsed.getTime()) ? parsed : fallback
}

function mapDocToEquipment(
  id: string,
  data: Record<string, unknown>
): Equipment {
  const itemCode = typeof data.itemCode === 'string' && data.itemCode.trim()
    ? data.itemCode.trim()
    : `EQ-${id.slice(-4).toUpperCase()}`

  return {
    itemId: id,
    itemCode,
    name: typeof data.name === 'string' ? data.name : '',
    category: (data.category as EquipmentCategory) || 'other',
    brand: typeof data.brand === 'string' ? data.brand : '',
    model: typeof data.model === 'string' ? data.model : '',
    serialNumber: typeof data.serialNumber === 'string' ? data.serialNumber : '',
    purchaseDate: parseDate(data.purchaseDate),
    purchasePrice: typeof data.purchasePrice === 'number' ? data.purchasePrice : 0,
    vendor: typeof data.vendor === 'string' ? data.vendor : undefined,
    warrantyExpiry: parseDate(data.warrantyExpiry),
    condition: (data.condition as EquipmentCondition) || 'good',
    location: typeof data.location === 'string' ? data.location : '',
    photoUrl: typeof data.photoUrl === 'string' ? data.photoUrl : undefined,
    status: (data.status as EquipmentStatus) || 'available',
    assignedToUid: typeof data.assignedToUid === 'string' ? data.assignedToUid : undefined,
    assignedToName: typeof data.assignedToName === 'string' ? data.assignedToName : undefined,
    currentCheckoutId: typeof data.currentCheckoutId === 'string' ? data.currentCheckoutId : undefined,
    dueBackDate: parseDate(data.dueBackDate),
    lastUsedDate: parseDate(data.lastUsedDate),
    nextMaintenanceDate: parseDate(data.nextMaintenanceDate),
    notes: typeof data.notes === 'string' ? data.notes : undefined,
    qrCode: typeof data.qrCode === 'string' ? data.qrCode : itemCode,
    barcode: typeof data.barcode === 'string' ? data.barcode : itemCode,
    kitId: typeof data.kitId === 'string' ? data.kitId : undefined,
    parentItemId: typeof data.parentItemId === 'string' ? data.parentItemId : undefined,
    retiredReason: typeof data.retiredReason === 'string' ? data.retiredReason : undefined,
    retiredAt: parseDate(data.retiredAt),
    isDeleted: Boolean(data.isDeleted),
    createdAt: parseDate(data.createdAt, new Date()) as Date,
    updatedAt: parseDate(data.updatedAt),
  }
}

/**
 * Real-time subscription to all active equipment items.
 * Soft-deleted documents are filtered out.
 */
export function subscribeEquipment(
  onUpdate: (items: Equipment[]) => void,
  onError?: (err: Error) => void
): () => void {
  const colRef = collection(db, 'equipment')
  const q = query(colRef)

  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs
        .map((d) => mapDocToEquipment(d.id, d.data() as Record<string, unknown>))
        .filter((item) => !item.isDeleted)

      items.sort((a, b) => a.itemCode.localeCompare(b.itemCode, undefined, { numeric: true }))
      onUpdate(items)
    },
    (err) => {
      console.error('[subscribeEquipment] Error listening to equipment:', err)
      if (onError) onError(err)
    }
  )
}

/**
 * Real-time subscription to a single equipment item by ID.
 */
export function subscribeEquipmentById(
  itemId: string,
  onUpdate: (item: Equipment | null) => void,
  onError?: (err: Error) => void
): () => void {
  const docRef = doc(db, 'equipment', itemId)
  return onSnapshot(
    docRef,
    (snap) => {
      if (!snap.exists()) {
        onUpdate(null)
        return
      }
      const data = snap.data() as Record<string, unknown>
      if (data.isDeleted) {
        onUpdate(null)
        return
      }
      onUpdate(mapDocToEquipment(snap.id, data))
    },
    (err) => {
      console.error(`[subscribeEquipmentById] Error:`, err)
      if (onError) onError(err)
    }
  )
}

/**
 * Generate a clean standard code for equipment:
 * CAM-001, LEN-001, LGT-001, FLH-001, DRN-001, GIM-001, TRP-001, EQ-001
 */
export function getCategoryPrefix(cat: EquipmentCategory): string {
  switch (cat) {
    case 'camera':
    case 'cameraBody':
      return 'CAM'
    case 'lens':
      return 'LEN'
    case 'camcorder':
      return 'CMC'
    case 'light':
      return 'LGT'
    case 'flash':
      return 'FLH'
    case 'drone':
      return 'DRN'
    case 'gimbal':
      return 'GIM'
    case 'tripod':
      return 'TRP'
    case 'backdrop':
      return 'BKP'
    case 'sdCard':
    case 'memoryCard':
      return 'SD'
    case 'battery':
      return 'BAT'
    case 'charger':
      return 'CHG'
    case 'wire':
      return 'WIR'
    default: {
      if (typeof cat === 'string' && cat.trim().length >= 3) {
        const clean = cat.replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase()
        if (clean.length === 3) return clean
      }
      return 'EQ'
    }
  }
}

export function generateSuggestedCode(
  category: EquipmentCategory,
  existingItems: Equipment[]
): string {
  const prefix = getCategoryPrefix(category)
  const matches = existingItems
    .filter((e) => e.itemCode.startsWith(`${prefix}-`))
    .map((e) => {
      const numPart = e.itemCode.replace(`${prefix}-`, '')
      const n = parseInt(numPart, 10)
      return isNaN(n) ? 0 : n
    })
  const nextNum = matches.length > 0 ? Math.max(...matches) + 1 : 1
  return `${prefix}-${String(nextNum).padStart(3, '0')}`
}

/**
 * Create a new equipment item with audit logging.
 */
export async function createEquipment(
  input: CreateEquipmentInput,
  user?: { uid: string; displayName?: string }
): Promise<string> {
  const colRef = collection(db, 'equipment')
  const newDocRef = doc(colRef)
  const itemId = newDocRef.id

  const itemCode = input.itemCode?.trim() || `EQ-${itemId.slice(-4).toUpperCase()}`
  const initialStatus: EquipmentStatus = input.status || 'available'

  const docPayload = {
    itemId,
    itemCode,
    name: input.name.trim(),
    category: input.category,
    brand: input.brand.trim(),
    model: input.model.trim(),
    serialNumber: input.serialNumber.trim(),
    purchaseDate: input.purchaseDate ? Timestamp.fromDate(input.purchaseDate) : null,
    purchasePrice: Number(input.purchasePrice) || 0,
    vendor: input.vendor?.trim() || null,
    warrantyExpiry: input.warrantyExpiry ? Timestamp.fromDate(input.warrantyExpiry) : null,
    condition: input.condition,
    location: input.location.trim(),
    photoUrl: input.photoUrl?.trim() || null,
    status: initialStatus,
    notes: input.notes?.trim() || null,
    qrCode: itemCode,
    barcode: itemCode,
    kitId: input.kitId || null,
    parentItemId: input.parentItemId || null,
    isDeleted: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }

  await setDoc(newDocRef, docPayload)

  // Status log
  if (user) {
    try {
      const logsCol = collection(db, 'equipment', itemId, 'statusLogs')
      await addDoc(logsCol, {
        itemId,
        fromStatus: 'none',
        toStatus: initialStatus,
        changedByUid: user.uid,
        changedByName: user.displayName || 'User',
        reason: 'Initial creation',
        timestamp: serverTimestamp(),
      })
    } catch (logErr) {
      console.warn('[createEquipment] Status log writing warning:', logErr)
    }
  }

  return itemId
}

/**
 * Update an existing equipment item.
 */
export async function updateEquipment(
  itemId: string,
  input: UpdateEquipmentInput,
  user?: { uid: string; displayName?: string },
  reason?: string
): Promise<void> {
  const docRef = doc(db, 'equipment', itemId)
  const snap = await getDoc(docRef)

  const prev = snap.exists() ? (snap.data() as Record<string, unknown>) : {}
  const prevStatus = (prev.status as EquipmentStatus) || 'available'

  const payload: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  }

  if (!snap.exists()) {
    payload.itemId = itemId
    payload.itemCode = input.itemCode?.trim() || `EQ-${itemId.replace(/^eq_/, '').toUpperCase()}`
    payload.createdAt = serverTimestamp()
    payload.isDeleted = false
  }

  if (input.itemCode !== undefined) payload.itemCode = input.itemCode.trim()
  if (input.name !== undefined) payload.name = input.name.trim()
  if (input.category !== undefined) payload.category = input.category
  if (input.brand !== undefined) payload.brand = input.brand.trim()
  if (input.model !== undefined) payload.model = input.model.trim()
  if (input.serialNumber !== undefined) payload.serialNumber = input.serialNumber.trim()
  if (input.purchaseDate !== undefined) {
    payload.purchaseDate = input.purchaseDate ? Timestamp.fromDate(input.purchaseDate) : null
  }
  if (input.purchasePrice !== undefined) payload.purchasePrice = Number(input.purchasePrice) || 0
  if (input.vendor !== undefined) payload.vendor = input.vendor.trim() || null
  if (input.warrantyExpiry !== undefined) {
    payload.warrantyExpiry = input.warrantyExpiry ? Timestamp.fromDate(input.warrantyExpiry) : null
  }
  if (input.condition !== undefined) payload.condition = input.condition
  if (input.location !== undefined) payload.location = input.location.trim()
  if (input.photoUrl !== undefined) payload.photoUrl = input.photoUrl.trim() || null
  if (input.status !== undefined) payload.status = input.status
  if (input.notes !== undefined) payload.notes = input.notes.trim() || null
  if (input.kitId !== undefined) payload.kitId = input.kitId || null
  if (input.parentItemId !== undefined) payload.parentItemId = input.parentItemId || null
  if (input.assignedToUid !== undefined) payload.assignedToUid = input.assignedToUid || null
  if (input.assignedToName !== undefined) payload.assignedToName = input.assignedToName || null
  if (input.currentCheckoutId !== undefined) payload.currentCheckoutId = input.currentCheckoutId || null
  if (input.dueBackDate !== undefined) {
    payload.dueBackDate = input.dueBackDate ? Timestamp.fromDate(input.dueBackDate) : null
  }
  if (input.nextMaintenanceDate !== undefined) {
    payload.nextMaintenanceDate = input.nextMaintenanceDate ? Timestamp.fromDate(input.nextMaintenanceDate) : null
  }

  await setDoc(docRef, payload, { merge: true })

  // Audit status changes
  if (input.status && input.status !== prevStatus && user) {
    try {
      const logsCol = collection(db, 'equipment', itemId, 'statusLogs')
      await addDoc(logsCol, {
        itemId,
        fromStatus: prevStatus,
        toStatus: input.status,
        changedByUid: user.uid,
        changedByName: user.displayName || 'User',
        reason: reason || 'Status updated',
        timestamp: serverTimestamp(),
      })
    } catch (logErr) {
      console.warn('[updateEquipment] Status log writing warning:', logErr)
    }
  }
}

/**
 * Retire / Dispose equipment (e.g. Sold, Lost, Damaged beyond repair, Retired).
 */
export async function retireEquipment(
  itemId: string,
  reason: string,
  user?: { uid: string; displayName?: string }
): Promise<void> {
  await updateEquipment(
    itemId,
    { status: 'retired' },
    user,
    `Retired: ${reason}`
  )

  const docRef = doc(db, 'equipment', itemId)
  await updateDoc(docRef, {
    retiredReason: reason,
    retiredAt: serverTimestamp(),
  })
}

/**
 * Soft delete an equipment item.
 */
export async function deleteEquipment(itemId: string): Promise<void> {
  const docRef = doc(db, 'equipment', itemId)
  await updateDoc(docRef, {
    isDeleted: true,
    deletedAt: serverTimestamp(),
  })
}

/**
 * Subscribe to Equipment Status History Logs.
 */
export function subscribeStatusLogs(
  itemId: string,
  onUpdate: (logs: EquipmentStatusLog[]) => void,
  onError?: (err: Error) => void
): () => void {
  const logsCol = collection(db, 'equipment', itemId, 'statusLogs')
  return onSnapshot(
    logsCol,
    (snap) => {
      const logs: EquipmentStatusLog[] = snap.docs.map((d) => {
        const data = d.data()
        return {
          logId: d.id,
          itemId: data.itemId || itemId,
          fromStatus: data.fromStatus || 'none',
          toStatus: data.toStatus || 'available',
          changedByUid: data.changedByUid || '',
          changedByName: data.changedByName || 'System',
          reason: data.reason || '',
          timestamp: parseDate(data.timestamp, new Date()) as Date,
        }
      })
      logs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      onUpdate(logs)
    },
    (err) => {
      console.error('[subscribeStatusLogs] Error:', err)
      if (onError) onError(err)
    }
  )
}

/**
 * Subscribe to Equipment Kits / Bundles.
 */
export function subscribeEquipmentKits(
  onUpdate: (kits: EquipmentKit[]) => void,
  onError?: (err: Error) => void
): () => void {
  const colRef = collection(db, 'equipmentKits')
  return onSnapshot(
    colRef,
    (snap) => {
      const kits: EquipmentKit[] = snap.docs
        .map((d) => {
          const data = d.data()
          return {
            kitId: d.id,
            name: data.name || '',
            description: data.description || '',
            itemIds: Array.isArray(data.itemIds) ? data.itemIds : [],
            isDeleted: Boolean(data.isDeleted),
            createdAt: parseDate(data.createdAt, new Date()) as Date,
            updatedAt: parseDate(data.updatedAt),
          }
        })
        .filter((k) => !k.isDeleted)

      onUpdate(kits)
    },
    (err) => {
      console.error('[subscribeEquipmentKits] Error:', err)
      if (onError) onError(err)
    }
  )
}

export async function createEquipmentKit(input: {
  name: string
  description?: string
  itemIds: string[]
}): Promise<string> {
  const colRef = collection(db, 'equipmentKits')
  const newDoc = doc(colRef)
  await setDoc(newDoc, {
    kitId: newDoc.id,
    name: input.name.trim(),
    description: input.description?.trim() || null,
    itemIds: input.itemIds,
    isDeleted: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return newDoc.id
}

/**
 * ─── CHECKOUTS QUERIES & BATCH MUTATIONS ────────────────────────────────────
 */

function mapDocToCheckout(id: string, data: Record<string, unknown>): Checkout {
  return {
    checkoutId: id,
    itemId: typeof data.itemId === 'string' ? data.itemId : '',
    itemCode: typeof data.itemCode === 'string' ? data.itemCode : '',
    itemName: typeof data.itemName === 'string' ? data.itemName : '',
    staffUid: typeof data.staffUid === 'string' ? data.staffUid : '',
    staffName: typeof data.staffName === 'string' ? data.staffName : '',
    projectId: typeof data.projectId === 'string' ? data.projectId : '',
    eventName: typeof data.eventName === 'string' ? data.eventName : '',
    eventDate: parseDate(data.eventDate, new Date()) as Date,
    checkedOutAt: parseDate(data.checkedOutAt, new Date()) as Date,
    checkedOutBy: typeof data.checkedOutBy === 'string' ? data.checkedOutBy : '',
    dueBack: parseDate(data.dueBack, new Date()) as Date,
    checkedInAt: parseDate(data.checkedInAt),
    returnCondition: typeof data.returnCondition === 'string' ? data.returnCondition : undefined,
    notes: typeof data.notes === 'string' ? data.notes : undefined,
    status: (data.status as CheckoutStatus) || 'out',
  }
}

/**
 * Subscribe to all checkouts (history + active)
 */
export function subscribeCheckouts(
  onUpdate: (checkouts: Checkout[]) => void,
  onError?: (err: Error) => void
): () => void {
  const colRef = collection(db, 'checkouts')
  const q = query(colRef)

  return onSnapshot(
    q,
    (snap) => {
      const checkouts = snap.docs.map((d) =>
        mapDocToCheckout(d.id, d.data() as Record<string, unknown>)
      )
      checkouts.sort((a, b) => b.checkedOutAt.getTime() - a.checkedOutAt.getTime())
      onUpdate(checkouts)
    },
    (err) => {
      console.error('[subscribeCheckouts] Error:', err)
      if (onError) onError(err)
    }
  )
}

/**
 * Subscribe to active checkouts ('out')
 */
export function subscribeActiveCheckouts(
  onUpdate: (checkouts: Checkout[]) => void,
  onError?: (err: Error) => void
): () => void {
  const colRef = collection(db, 'checkouts')
  const q = query(colRef, where('status', 'in', ['out', 'active', 'overdue']))

  return onSnapshot(
    q,
    (snap) => {
      const checkouts = snap.docs.map((d) =>
        mapDocToCheckout(d.id, d.data() as Record<string, unknown>)
      )
      checkouts.sort((a, b) => a.dueBack.getTime() - b.dueBack.getTime())
      onUpdate(checkouts)
    },
    (err) => {
      console.error('[subscribeActiveCheckouts] Error:', err)
      if (onError) onError(err)
    }
  )
}

export interface CheckoutBatchInput {
  items: Equipment[]
  staffUid: string
  staffName: string
  projectId: string
  eventName: string
  eventDate: Date
  dueBack: Date
  checkedOutByUid: string
  checkedOutByName: string
  notes?: string
}

/**
 * Checkout multiple equipment items in an atomic batch.
 */
export async function checkoutEquipmentBatch(input: CheckoutBatchInput): Promise<string[]> {
  if (input.items.length === 0) return []

  const batch = writeBatch(db)
  const checkoutIds: string[] = []

  for (const item of input.items) {
    const checkoutRef = doc(collection(db, 'checkouts'))
    checkoutIds.push(checkoutRef.id)

    batch.set(checkoutRef, {
      checkoutId: checkoutRef.id,
      itemId: item.itemId,
      itemCode: item.itemCode,
      itemName: item.name,
      staffUid: input.staffUid,
      staffName: input.staffName,
      projectId: input.projectId,
      eventName: input.eventName,
      eventDate: Timestamp.fromDate(input.eventDate),
      checkedOutAt: serverTimestamp(),
      checkedOutBy: input.checkedOutByName,
      dueBack: Timestamp.fromDate(input.dueBack),
      checkedInAt: null,
      returnCondition: null,
      notes: input.notes?.trim() || null,
      status: 'out',
      createdAt: serverTimestamp(),
    })

    const eqRef = doc(db, 'equipment', item.itemId)
    batch.update(eqRef, {
      status: 'out',
      assignedToUid: input.staffUid,
      assignedToName: input.staffName,
      currentCheckoutId: checkoutRef.id,
      dueBackDate: Timestamp.fromDate(input.dueBack),
      lastUsedDate: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })

    // Status log
    const logRef = doc(collection(db, 'equipment', item.itemId, 'statusLogs'))
    batch.set(logRef, {
      itemId: item.itemId,
      fromStatus: 'available',
      toStatus: 'out',
      changedByUid: input.checkedOutByUid,
      changedByName: input.checkedOutByName,
      reason: `Checked out to ${input.staffName} for ${input.eventName}`,
      timestamp: serverTimestamp(),
    })
  }

  await batch.commit()
  return checkoutIds
}

export interface CheckinBatchInput {
  checkouts: Checkout[]
  returnCondition?: EquipmentCondition
  notes?: string
  checkedInByUid: string
  checkedInByName: string
}

/**
 * Check in equipment in an atomic batch.
 */
export async function checkinEquipmentBatch(input: CheckinBatchInput): Promise<void> {
  if (input.checkouts.length === 0) return

  const batch = writeBatch(db)

  for (const co of input.checkouts) {
    const coRef = doc(db, 'checkouts', co.checkoutId)
    batch.update(coRef, {
      status: 'returned',
      checkedInAt: serverTimestamp(),
      returnCondition: input.returnCondition || 'good',
      notes: input.notes
        ? `${co.notes ? `${co.notes} | ` : ''}Check-in: ${input.notes.trim()}`
        : co.notes || null,
      updatedAt: serverTimestamp(),
    })

    const eqRef = doc(db, 'equipment', co.itemId)
    const eqUpdate: Record<string, unknown> = {
      status: 'available',
      assignedToUid: null,
      assignedToName: null,
      currentCheckoutId: null,
      dueBackDate: null,
      updatedAt: serverTimestamp(),
    }
    if (input.returnCondition) {
      eqUpdate.condition = input.returnCondition
    }
    batch.update(eqRef, eqUpdate)

    // Status log
    const logRef = doc(collection(db, 'equipment', co.itemId, 'statusLogs'))
    batch.set(logRef, {
      itemId: co.itemId,
      fromStatus: 'out',
      toStatus: 'available',
      changedByUid: input.checkedInByUid,
      changedByName: input.checkedInByName,
      reason: `Checked in by ${co.staffName || 'staff'}${input.notes ? ` (${input.notes.trim()})` : ''}`,
      timestamp: serverTimestamp(),
    })
  }

  await batch.commit()
}

/**
 * Real-time subscription to custom equipment categories saved in /studioSettings/equipmentCategories
 */
export function subscribeCustomEquipmentCategories(
  callback: (categories: { key: string; label: string; icon?: string }[]) => void
): () => void {
  const docRef = doc(db, 'studioSettings', 'equipmentCategories')
  return onSnapshot(
    docRef,
    (snap) => {
      if (snap.exists()) {
        const data = snap.data()
        callback(data?.categories || [])
      } else {
        callback([])
      }
    },
    (err) => {
      console.warn('⚠️ [subscribeCustomEquipmentCategories] error (non-fatal):', err)
      callback([])
    }
  )
}

/**
 * Save a custom category into /studioSettings/equipmentCategories in Cloud Firestore
 */
export async function saveCustomEquipmentCategoryToFirestore(newCat: {
  key: string
  label: string
  icon?: string
}): Promise<void> {
  const docRef = doc(db, 'studioSettings', 'equipmentCategories')
  try {
    const snap = await getDoc(docRef)
    const existing: { key: string; label: string; icon?: string }[] = snap.exists()
      ? snap.data()?.categories || []
      : []

    if (!existing.some((c) => c.key === newCat.key || c.label.toLowerCase() === newCat.label.toLowerCase())) {
      existing.push(newCat)
      await setDoc(docRef, { categories: existing, updatedAt: serverTimestamp() }, { merge: true })
    }
  } catch (err) {
    console.warn('⚠️ [saveCustomEquipmentCategoryToFirestore] Could not save to Firestore (non-fatal):', err)
  }
}


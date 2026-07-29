import {
  collection, query, orderBy,
  onSnapshot, getDoc, doc, writeBatch, setDoc, updateDoc,
  serverTimestamp, Timestamp
} from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { Lead } from '@/types'

export interface LeadFilters {
  source?: string
  status?: string
}

export interface PackageOption {
  id: string
  name: string
  defaultPrice: number
}

export const PACKAGE_OPTIONS: PackageOption[] = [
  { id: 'gold', name: 'Gold', defaultPrice: 280000 },
  { id: 'silver', name: 'Silver', defaultPrice: 160000 },
  { id: 'platinum', name: 'Platinum', defaultPrice: 450000 },
  { id: 'other', name: 'Other', defaultPrice: 0 },
]

export const MOCK_LEADS: Lead[] = [
  {
    leadId:            'lead-1',
    name:              'Janani & Hari',
    contact:           '+91 98844 32109',
    eventType:         'Wedding',
    tentativeDate:     '2026-11-20',
    interestedPackage: 'Gold · ₹2,80,000',
    source:            'Referral — Aishwarya & Naveen',
    status:            'inquiry',
    notes:             'Wedding at Kanchipuram, Nov 20–21. Wants candid + traditional mix.',
    createdAt:         new Date('2026-07-19'),
  },
  {
    leadId:            'lead-2',
    name:              'Suresh Kumar',
    contact:           '+91 97100 54321',
    eventType:         'Corporate',
    tentativeDate:     '2026-09-15',
    interestedPackage: 'Silver · ₹1,60,000',
    source:            'Online',
    status:            'inquiry',
    notes:             'Annual corporate gala dinner photography.',
    createdAt:         new Date('2026-07-20'),
  },
  {
    leadId:            'lead-3',
    name:              'Pavithra & Dinesh',
    contact:           '+91 94440 12345',
    eventType:         'Engagement',
    tentativeDate:     '2026-08-30',
    interestedPackage: 'Gold · ₹2,80,000',
    source:            'Walk-in',
    status:            'inquiry',
    notes:             'Half day event shoot with 2 photographers.',
    createdAt:         new Date('2026-07-21'),
  },
  {
    leadId:            'lead-4',
    name:              'Revathi Studio Shoot',
    contact:           '+91 98400 98765',
    eventType:         'Portrait',
    tentativeDate:     '2026-08-10',
    interestedPackage: 'Silver · ₹1,60,000',
    source:            'Online',
    status:            'inquiry',
    notes:             'Personal branding session in studio.',
    createdAt:         new Date('2026-07-22'),
  },
  {
    leadId:            'lead-5',
    name:              'Manoj & Keerthana',
    contact:           '+91 99620 45678',
    eventType:         'Pre-Wedding',
    tentativeDate:     '2026-10-05',
    interestedPackage: 'Platinum · ₹4,50,000',
    source:            'Referral — Vignesh',
    status:            'inquiry',
    notes:             'Outdoor pre-wedding shoot at Mahabalipuram.',
    createdAt:         new Date('2026-07-23'),
  },
]

// In-memory store initialized with MOCK_LEADS to ensure instant persistence
let MEMORY_LEADS: Lead[] = [...MOCK_LEADS]

/** Real-time subscription — returns unsubscribe function */
export function subscribeToLeads(
  filters: LeadFilters,
  callback: (leads: Lead[]) => void
): () => void {
  const q = query(collection(db, 'leads'), orderBy('createdAt', 'desc'))

  return onSnapshot(q, snap => {
    let firestoreLeads: Lead[] = []

    if (!snap.empty) {
      firestoreLeads = snap.docs
        .map(d => {
          const data = d.data()
          return {
            ...data,
            leadId: d.id,
            eventDate: data.eventDate instanceof Timestamp
              ? data.eventDate.toDate()
              : data.eventDate ? new Date(data.eventDate) : undefined,
            createdAt: data.createdAt instanceof Timestamp
              ? data.createdAt.toDate()
              : data.createdAt ? new Date(data.createdAt) : new Date(),
            updatedAt: data.updatedAt instanceof Timestamp
              ? data.updatedAt.toDate()
              : data.updatedAt ? new Date(data.updatedAt) : new Date(),
          } as Lead
        })
        .filter(l => !l.isDeleted)
    }

    // Merge Firestore docs with MEMORY_LEADS (Firestore docs take precedence for matching IDs)
    const map = new Map<string, Lead>()
    MEMORY_LEADS.forEach(l => { if (!l.isDeleted) map.set(l.leadId, l) })
    firestoreLeads.forEach(l => { if (!l.isDeleted) map.set(l.leadId, l) })

    let combinedLeads = Array.from(map.values())

    // Sort by createdAt desc
    combinedLeads.sort((a, b) => {
      const tA = a.createdAt instanceof Date ? a.createdAt.getTime() : 0
      const tB = b.createdAt instanceof Date ? b.createdAt.getTime() : 0
      return tB - tA
    })

    if (filters.source && filters.source !== 'All') {
      const targetSource = filters.source.toLowerCase()
      combinedLeads = combinedLeads.filter(l => {
        const s = (l.source || '').toLowerCase()
        if (targetSource === 'walkin' || targetSource === 'walk-in') {
          return s.includes('walk-in') || s.includes('walkin')
        }
        return s.includes(targetSource)
      })
    }

    if (filters.status) {
      combinedLeads = combinedLeads.filter(l => l.status === filters.status)
    }

    callback(combinedLeads)
  }, error => {
    console.warn('Error/offline in subscribeToLeads, using memory cache:', error)
    let memoryFiltered = MEMORY_LEADS.filter(l => !l.isDeleted)

    if (filters.source && filters.source !== 'All') {
      const targetSource = filters.source.toLowerCase()
      memoryFiltered = memoryFiltered.filter(l => {
        const s = (l.source || '').toLowerCase()
        if (targetSource === 'walkin' || targetSource === 'walk-in') {
          return s.includes('walk-in') || s.includes('walkin')
        }
        return s.includes(targetSource)
      })
    }

    callback(memoryFiltered)
  })
}

/** Get single lead by ID */
export async function getLeadById(leadId: string): Promise<Lead | null> {
  const memoryMatch = MEMORY_LEADS.find(l => l.leadId === leadId && !l.isDeleted)
  if (memoryMatch) return memoryMatch

  try {
    const snap = await getDoc(doc(db, 'leads', leadId))
    if (!snap.exists()) return null
    const data = snap.data()
    const result = {
      ...data,
      leadId: snap.id,
      eventDate: data.eventDate instanceof Timestamp ? data.eventDate.toDate() : data.eventDate ? new Date(data.eventDate) : undefined,
      createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : data.createdAt ? new Date(data.createdAt) : new Date(),
    } as Lead
    return result
  } catch (err) {
    console.warn('Firestore fetch failed for lead by id:', err)
    return null
  }
}

/** Create a new lead */
export async function createLead(leadData: Partial<Lead>, userId?: string): Promise<string> {
  // Pre-generate doc reference so ID is 100% identical in memory and Firestore
  const newRef = doc(collection(db, 'leads'))
  const leadId = newRef.id

  const payload: Lead = {
    ...leadData,
    leadId,
    name:              leadData.name || 'New Lead',
    eventType:         leadData.eventType || 'Wedding',
    status:            leadData.status || 'inquiry',
    interestedPackage: leadData.interestedPackage || '',
    isDeleted:         false,
    createdBy:         userId || 'system',
    createdAt:         new Date(),
    updatedAt:         new Date(),
  }

  // Instantly update memory store
  MEMORY_LEADS = [payload, ...MEMORY_LEADS]

  // Persist to Firestore asynchronously
  try {
    await setDoc(newRef, {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  } catch (err) {
    console.warn('Firestore create write fallback:', err)
  }

  return leadId
}

/** Update an existing lead */
export async function updateLead(leadId: string, leadData: Partial<Lead>): Promise<void> {
  // Instantly update memory store in place
  let found = false
  MEMORY_LEADS = MEMORY_LEADS.map(l => {
    if (l.leadId === leadId) {
      found = true
      return { ...l, ...leadData, updatedAt: new Date() }
    }
    return l
  })

  if (!found) {
    // If not found in memory, add it
    const newLead: Lead = {
      leadId,
      name: leadData.name || 'Lead',
      eventType: leadData.eventType || 'Wedding',
      status: leadData.status || 'inquiry',
      interestedPackage: leadData.interestedPackage || '',
      isDeleted: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...leadData,
    }
    MEMORY_LEADS = [newLead, ...MEMORY_LEADS]
  }

  // Persist to Firestore
  try {
    const ref = doc(db, 'leads', leadId)
    await updateDoc(ref, {
      ...leadData,
      updatedAt: serverTimestamp(),
    })
  } catch (err) {
    console.warn('Firestore update write fallback:', err)
  }
}

/** Soft delete lead */
export async function softDeleteLead(leadId: string, deletedBy: string): Promise<void> {
  MEMORY_LEADS = MEMORY_LEADS.map(l => {
    if (l.leadId === leadId) {
      return { ...l, isDeleted: true, updatedAt: new Date() }
    }
    return l
  })

  try {
    const batch = writeBatch(db)
    batch.update(doc(db, 'leads', leadId), {
      isDeleted:  true,
      deletedBy,
      deletedAt:  serverTimestamp(),
      updatedAt:  serverTimestamp(),
    })
    await batch.commit()
  } catch (err) {
    console.warn('Firestore soft delete fallback:', err)
  }
}

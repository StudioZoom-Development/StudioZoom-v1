import {
  doc, updateDoc, onSnapshot,
  collection, query, orderBy,
  serverTimestamp
} from 'firebase/firestore'
import { db } from '@/lib/firebase/config'

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface PackageLineItem {
  description: string
  qty:         number
  rate:        number
  amount:      number
}

export interface PackageTemplate {
  id:        string
  name:      string
  price:     number
  iconBg:    string
  iconFg:    string
  items:     string
  lineItems: PackageLineItem[]
}

export interface StudioSettings {
  studioName:          string
  phone:               string
  address:             string
  city:                string
  email:               string
  gstin:               string
  upiId:               string
  bankIfsc:            string
  logoUrl?:            string
  signatureUrl?:       string
  defaultTerms:        string
  gstEnabled:          boolean
  invoicePrefix:       string
  quotationPrefix:     string
  invoiceStartNumber:  number
  activeStudioId?:     string   // 'studio-zoom' | 'studio-zoom-productions'
  packages?:           PackageTemplate[]
}

export interface UserRow {
  uid:      string
  name:     string
  email:    string
  role:     string
  isActive: boolean
}

// ─────────────────────────────────────────────
// Settings — /studioSettings/config
// ─────────────────────────────────────────────

/** Real-time settings subscription */
export function subscribeToSettings(
  callback: (settings: StudioSettings | null) => void
): () => void {
  return onSnapshot(doc(db, 'studioSettings', 'config'), snap => {
    callback(snap.exists() ? (snap.data() as StudioSettings) : null)
  })
}

/** Save branding fields (no bankIfsc / defaultTerms) */
export async function saveBranding(updates: {
  phone?:          string
  address?:        string
  city?:           string
  email?:          string
  gstin?:          string
  upiId?:          string
  activeStudioId?: string
}): Promise<void> {
  await updateDoc(doc(db, 'studioSettings', 'config'), {
    ...updates,
    updatedAt: serverTimestamp(),
  })
}

/** Save GST & numbering settings */
export async function saveGstSettings(data: {
  gstEnabled:          boolean
  invoicePrefix:       string
  quotationPrefix:     string
  invoiceStartNumber:  number
}): Promise<void> {
  await updateDoc(doc(db, 'studioSettings', 'config'), {
    ...data,
    updatedAt: serverTimestamp(),
  })
}

/** Save full packages array */
export async function savePackages(packages: PackageTemplate[]): Promise<void> {
  await updateDoc(doc(db, 'studioSettings', 'config'), {
    packages,
    updatedAt: serverTimestamp(),
  })
}

// ─────────────────────────────────────────────
// Users — /users (ALL roles — access control view)
// ─────────────────────────────────────────────

/** Real-time users subscription — ALL roles, alphabetical */
export function subscribeToAllUsers(
  callback: (users: UserRow[]) => void
): () => void {
  const q = query(collection(db, 'users'), orderBy('name', 'asc'))
  return onSnapshot(q, snap => {
    callback(
      snap.docs.map(d => ({
        uid:      d.id,
        name:     (d.data().name     as string) ?? '',
        email:    (d.data().email    as string) ?? '',
        role:     (d.data().role     as string) ?? 'staff',
        isActive: (d.data().isActive as boolean) ?? true,
      }))
    )
  })
}

/** Deactivate any user */
export async function deactivateUser(uid: string): Promise<void> {
  await updateDoc(doc(db, 'users', uid), {
    isActive:  false,
    updatedAt: serverTimestamp(),
  })
}

/** Change a user's role */
export async function changeUserRole(
  uid: string,
  newRole: 'admin' | 'manager' | 'staff'
): Promise<void> {
  await updateDoc(doc(db, 'users', uid), {
    role:      newRole,
    updatedAt: serverTimestamp(),
  })
}

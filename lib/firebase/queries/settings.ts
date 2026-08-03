import {
  doc, updateDoc, setDoc, onSnapshot,
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

export interface StudioBranding {
  phone:   string
  address: string
  city:    string
  email:   string
  gstin:   string
  upiId:   string
}

export interface StudioSettings {
  /** Per-studio branding — keyed by studio ID (camelCase) */
  studioZoom?:      StudioBranding
  studioZoomProds?: StudioBranding
  /** Which studio is the active default for new documents */
  activeStudioId?:  string
  gstEnabled:          boolean
  invoicePrefix:       string
  quotationPrefix:     string
  invoiceStartNumber:  number
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

/** Save branding for a specific studio — creates doc if needed */
export async function saveBranding(
  studioId: 'studio-zoom' | 'studio-zoom-productions',
  data: StudioBranding
): Promise<void> {
  // Map studio ID to the Firestore field key
  const fieldKey = studioId === 'studio-zoom' ? 'studioZoom' : 'studioZoomProds'
  await setDoc(doc(db, 'studioSettings', 'config'), {
    [fieldKey]:      data,
    activeStudioId:  studioId,
    updatedAt:       serverTimestamp(),
  }, { merge: true })
}

/** Save numbering settings — creates doc if it doesn't exist yet */
export async function saveGstSettings(data: {
  gstEnabled:          boolean
  invoicePrefix:       string
  quotationPrefix:     string
  invoiceStartNumber:  number
}): Promise<void> {
  await setDoc(doc(db, 'studioSettings', 'config'), {
    ...data,
    updatedAt: serverTimestamp(),
  }, { merge: true })
}

/** Save full packages array — creates doc if it doesn't exist yet */
export async function savePackages(packages: PackageTemplate[]): Promise<void> {
  await setDoc(doc(db, 'studioSettings', 'config'), {
    packages,
    updatedAt: serverTimestamp(),
  }, { merge: true })
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

/** Update editable user profile fields */
export async function updateUser(
  uid: string,
  updates: { name?: string; role?: 'admin' | 'manager' | 'staff'; jobTitle?: string; contact?: string }
): Promise<void> {
  await updateDoc(doc(db, 'users', uid), {
    ...updates,
    updatedAt: serverTimestamp(),
  })
}

import {
  doc, setDoc, onSnapshot,
  collection, query, orderBy,
  serverTimestamp
} from 'firebase/firestore'
import { db } from '@/lib/firebase/config'

// ─────────────────────────────────────────────
// Shared types
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

// ─────────────────────────────────────────────
// Document types — one interface per Firestore doc
// ─────────────────────────────────────────────

/** /studioSettings/brandConfig — per-studio contact & identity details */
export interface BrandConfig {
  studioZoom?:      StudioBranding
  studioZoomProds?: StudioBranding
  updatedAt?:       unknown
}

/** /studioSettings/numberingConfig — invoice/quotation numbering + GST toggle */
export interface NumberingConfig {
  gstEnabled:           boolean
  invoicePrefix:        string
  quotationPrefix:      string
  invoiceStartNumber:   number
  quotationStartNumber: number
  updatedAt?:           unknown
}

/** /studioSettings/packageConfig — service package templates */
export interface PackageConfig {
  packages:   PackageTemplate[]
  updatedAt?: unknown
}

/**
 * /studioSettings/config — active runtime state.
 * Tracks which studio is active and the live counters for sequential numbering.
 */
export interface ActiveConfig {
  activeStudioId:         string   // 'studio-zoom' | 'studio-zoom-productions'
  currentInvoiceNumber:   number   // incremented on each new invoice
  currentQuotationNumber: number   // incremented on each new quotation
  updatedAt?:             unknown
}

// Keep StudioSettings as a convenience aggregate for pages that want everything
export interface StudioSettings {
  brand?:      BrandConfig
  numbering?:  NumberingConfig
  packages?:   PackageConfig
  active?:     ActiveConfig
}

export interface UserRow {
  uid:      string
  name:     string
  email:    string
  role:     string
  isActive: boolean
}

// ─────────────────────────────────────────────
// Subscriptions — one per Firestore document
// ─────────────────────────────────────────────

/** Real-time subscription to /studioSettings/brandConfig */
export function subscribeToBrandConfig(
  callback: (data: BrandConfig | null) => void
): () => void {
  return onSnapshot(doc(db, 'studioSettings', 'brandConfig'), snap => {
    callback(snap.exists() ? (snap.data() as BrandConfig) : null)
  })
}

/** Real-time subscription to /studioSettings/numberingConfig */
export function subscribeToNumberingConfig(
  callback: (data: NumberingConfig | null) => void
): () => void {
  return onSnapshot(doc(db, 'studioSettings', 'numberingConfig'), snap => {
    callback(snap.exists() ? (snap.data() as NumberingConfig) : null)
  })
}

/** Real-time subscription to /studioSettings/packageConfig */
export function subscribeToPackageConfig(
  callback: (data: PackageConfig | null) => void
): () => void {
  return onSnapshot(doc(db, 'studioSettings', 'packageConfig'), snap => {
    callback(snap.exists() ? (snap.data() as PackageConfig) : null)
  })
}

/** Real-time subscription to /studioSettings/config (active runtime state) */
export function subscribeToActiveConfig(
  callback: (data: ActiveConfig | null) => void
): () => void {
  return onSnapshot(doc(db, 'studioSettings', 'config'), snap => {
    callback(snap.exists() ? (snap.data() as ActiveConfig) : null)
  })
}

/**
 * @deprecated — use the individual subscribe* functions instead.
 * Kept only for backward-compat during migration.
 */
export function subscribeToSettings(
  callback: (settings: StudioSettings | null) => void
): () => void {
  return subscribeToActiveConfig(active => {
    callback(active ? { active } : null)
  })
}

// ─────────────────────────────────────────────
// Writes — one function per Firestore document
// ─────────────────────────────────────────────

/** Save branding for a specific studio to /studioSettings/brandConfig */
export async function saveBranding(
  studioId: 'studio-zoom' | 'studio-zoom-productions',
  data: StudioBranding
): Promise<void> {
  const fieldKey = studioId === 'studio-zoom' ? 'studioZoom' : 'studioZoomProds'
  await setDoc(doc(db, 'studioSettings', 'brandConfig'), {
    [fieldKey]: data,
    updatedAt:  serverTimestamp(),
  }, { merge: true })
}

/** Save numbering + GST settings to /studioSettings/numberingConfig */
export async function saveNumberingConfig(data: Omit<NumberingConfig, 'updatedAt'>): Promise<void> {
  await setDoc(doc(db, 'studioSettings', 'numberingConfig'), {
    ...data,
    updatedAt: serverTimestamp(),
  }, { merge: true })
}

/** Save full packages array to /studioSettings/packageConfig */
export async function savePackages(packages: PackageTemplate[]): Promise<void> {
  await setDoc(doc(db, 'studioSettings', 'packageConfig'), {
    packages,
    updatedAt: serverTimestamp(),
  }, { merge: true })
}

/** Update active runtime config (active studio, counters) to /studioSettings/config */
export async function saveActiveConfig(updates: Partial<Omit<ActiveConfig, 'updatedAt'>>): Promise<void> {
  await setDoc(doc(db, 'studioSettings', 'config'), {
    ...updates,
    updatedAt: serverTimestamp(),
  }, { merge: true })
}

// ─────────────────────────────────────────────
// Legacy aliases — remove once all callers migrated
// ─────────────────────────────────────────────

/** @deprecated Use saveNumberingConfig instead */
export async function saveGstSettings(data: {
  gstEnabled:          boolean
  invoicePrefix:       string
  quotationPrefix:     string
  invoiceStartNumber:  number
}): Promise<void> {
  await saveNumberingConfig({
    ...data,
    quotationStartNumber: 1,
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
      snap.docs
        .filter(d => !d.data().isDeleted)
        .map(d => ({
          uid:      d.id,
          name:     (d.data().name     as string) ?? '',
          email:    (d.data().email    as string) ?? '',
          role:     (d.data().role     as string) ?? 'staff',
          isActive: (d.data().isActive as boolean) ?? true,
        }))
    )
  })
}

/** @deprecated — deactivation now goes through /api/admin/deactivate-user */
export async function deactivateUser(): Promise<void> {
  throw new Error('Use POST /api/admin/deactivate-user instead')
}

/** Change a user\'s role */
export async function changeUserRole(
  uid: string,
  newRole: 'admin' | 'manager' | 'staff'
): Promise<void> {
  const { updateDoc } = await import('firebase/firestore')
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
  const { updateDoc } = await import('firebase/firestore')
  await updateDoc(doc(db, 'users', uid), {
    ...updates,
    updatedAt: serverTimestamp(),
  })
}

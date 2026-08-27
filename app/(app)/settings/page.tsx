'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input }  from '@/components/ui/input'
import { ConfirmModal } from '@/components/shared/ConfirmModal'
import { PhoneNumberInput } from '@/components/shared/PhoneNumberInput'
import { useUIStore } from '@/store/uiStore'
import { useRole } from '@/hooks/useAuth'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  StudioBranding,
  PackageTemplate,
  PackageLineItem,
  UserRow,
  subscribeToBrandConfig,
  subscribeToNumberingConfig,
  subscribeToPackageConfig,
  subscribeToActiveConfig,
  subscribeToAllUsers,
  saveBranding,
  saveNumberingConfig,
  savePackages,
  saveActiveConfig,
  updateUser,
  deleteUserDoc,
} from '@/lib/firebase/queries/settings'

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

type Page = 'Studio branding' | 'Packages' | 'Numbering' | 'User management'

const NAV_ITEMS: Array<{ label: Page; icon: string }> = [
  { label: 'Studio branding', icon: 'ti-aperture'   },
  { label: 'Packages',        icon: 'ti-package'    },
  { label: 'Numbering',       icon: 'ti-percentage' },
  { label: 'User management', icon: 'ti-users'      },
]

// Hardcoded studio entities — not from Firestore
const STUDIOS = [
  {
    id:      'studio-zoom',
    name:    'Studio Zoom',
    tagline: 'Weddings & events',
    gstin:   '33ABCDE1234F1Z5',
  },
  {
    id:      'studio-zoom-productions',
    name:    'Studio Zoom Productions',
    tagline: 'Films & corporate AV',
    gstin:   '33ABCDE1234F2Z4',
  },
]

const BRAND_FIELDS: Array<{ key: keyof BrandForm; label: string }> = [
  { key: 'phone',   label: 'Phone'   },
  { key: 'address', label: 'Address' },
  { key: 'city',    label: 'City'    },
  { key: 'email',   label: 'Email'   },
  { key: 'upiId',   label: 'UPI ID'  },
  { key: 'gstin',   label: 'GSTIN'   },
]

const PKG_COLOURS: Record<string, { bg: string; fg: string }> = {
  Platinum: { bg: 'var(--color-primary-muted)',   fg: 'var(--color-primary)'   },
  Gold:     { bg: 'var(--color-secondary-muted)', fg: 'var(--color-secondary)' },
  Silver:   { bg: 'var(--color-accent-muted)',    fg: 'var(--color-accent)'    },
}

const ROLE_STYLE: Record<string, { bg: string; fg: string }> = {
  admin:   { bg: 'var(--color-primary-muted)',  fg: 'var(--color-primary)'          },
  manager: { bg: 'var(--color-accent-muted)',   fg: 'var(--color-accent)'           },
  staff:   { bg: 'var(--color-surface-overlay)',fg: 'var(--color-foreground-muted)' },
}

// ─────────────────────────────────────────────
// Sub-types
// ─────────────────────────────────────────────

interface BrandForm {
  phone:   string
  address: string
  city:    string
  email:   string
  gstin:   string
  upiId:   string
}

const EMPTY_BRAND: BrandForm = { phone: '', address: '', city: '', email: '', gstin: '', upiId: '' }

function getInitials(name: string): string {
  if (!name) return '??'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// ─────────────────────────────────────────────
// Package Modal
// ─────────────────────────────────────────────

interface PackageModalProps {
  pkg:      PackageTemplate | null   // null = new
  onSave:   (p: PackageTemplate) => void
  onClose:  () => void
}

function PackageModal({ pkg, onSave, onClose }: PackageModalProps) {
  const [name,  setName]  = useState(pkg?.name  ?? '')
  const [price, setPrice] = useState(pkg ? String(pkg.price) : '')
  const [items, setItems] = useState(pkg?.items ?? '')
  const [lineItems, setLineItems] = useState<PackageLineItem[]>(
    pkg?.lineItems ?? [{ description: '', qty: 1, rate: 0, amount: 0 }]
  )

  const calcTotal = (lis: PackageLineItem[]) => lis.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)

  const updateLine = (i: number, field: keyof PackageLineItem, val: string | number) => {
    const updated = lineItems.map((li, idx) => {
      if (idx !== i) return li
      const next = { ...li, [field]: val }
      if (field === 'qty' || field === 'rate') {
        next.amount = Number(next.qty) * Number(next.rate)
      }
      return next
    })
    setLineItems(updated)
    if (updated.length > 0) {
      setPrice(String(calcTotal(updated)))
    }
  }

  const addLine = () => {
    const updated = [...lineItems, { description: '', qty: 1, rate: 0, amount: 0 }]
    setLineItems(updated)
    if (updated.length > 0) {
      setPrice(String(calcTotal(updated)))
    }
  }

  const removeLine = (i: number) => {
    const updated = lineItems.filter((_, idx) => idx !== i)
    setLineItems(updated)
    if (updated.length > 0) {
      setPrice(String(calcTotal(updated)))
    }
  }

  const handleSave = () => {
    const colours = PKG_COLOURS[name] ?? { bg: 'var(--color-surface-raised)', fg: 'var(--color-foreground-muted)' }
    const calculatedPrice = lineItems.length > 0 ? calcTotal(lineItems) : Number(price.replace(/[^0-9]/g, ''))
    onSave({
      id:       pkg?.id ?? 'pkg_' + Date.now(),
      name,
      price:    calculatedPrice,
      iconBg:   colours.bg,
      iconFg:   colours.fg,
      items,
      lineItems,
    })
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--font-inter)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '480px', background: 'var(--color-surface-overlay)',
          border: '0.5px solid var(--color-border)',
          borderRadius: '16px', padding: '24px',
          display: 'flex', flexDirection: 'column', gap: '16px',
        }}
      >
        <div style={{ fontSize: 'var(--text-lg)', fontWeight: 600 }}>
          {pkg ? 'Edit package' : 'Add package'}
        </div>

        {/* Name */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>Name</label>
          <Input value={name} onChange={e => setName(e.target.value)} className="h-9" placeholder="e.g. Platinum" />
        </div>

        {/* Price */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>Price (₹)</label>
          <Input value={price} onChange={e => setPrice(e.target.value)} className="h-9" placeholder="450000" />
        </div>

        {/* Description */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>Description</label>
          <Input value={items} onChange={e => setItems(e.target.value)} className="h-9" placeholder="Short summary line" />
        </div>

        {/* Line items */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>Line items</label>
          {/* Header */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 60px 80px 80px 28px',
            gap: '6px', fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)',
            paddingBottom: '4px', borderBottom: '0.5px solid var(--color-border)',
          }}>
            <span>Description</span><span>Qty</span><span>Rate</span><span>Amount</span><span />
          </div>
          {lineItems.map((li, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 60px 80px 80px 28px', gap: '6px', alignItems: 'center' }}>
              <Input value={li.description} onChange={e => updateLine(i, 'description', e.target.value)} className="h-8 text-xs" />
              <Input value={String(li.qty)} onChange={e => updateLine(i, 'qty', Number(e.target.value))} className="h-8 text-xs" type="number" />
              <Input value={String(li.rate)} onChange={e => updateLine(i, 'rate', Number(e.target.value))} className="h-8 text-xs" type="number" />
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)', paddingLeft: '4px' }}>
                ₹{li.amount.toLocaleString('en-IN')}
              </div>
              <span
                onClick={() => removeLine(i)}
                style={{ cursor: 'pointer', color: 'var(--color-danger)', fontSize: '16px', display: 'flex', alignItems: 'center' }}
              >
                <i className="ti ti-x" />
              </span>
            </div>
          ))}
          <span
            onClick={addLine}
            style={{ fontSize: 'var(--text-xs)', color: 'var(--color-accent)', cursor: 'pointer', fontWeight: 500, width: 'fit-content' }}
          >
            + Add line
          </span>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', borderTop: '0.5px solid var(--color-border)', paddingTop: '16px' }}>
          <button
            onClick={onClose}
            style={{
              height: '36px', padding: '0 16px', borderRadius: '8px', cursor: 'pointer',
              background: 'transparent', border: '0.5px solid var(--color-border)',
              color: 'var(--color-foreground)', fontSize: 'var(--text-sm)', fontFamily: 'var(--font-inter)',
            }}
          >
            Cancel
          </button>
          <Button className="h-9 font-medium" onClick={handleSave}>Save package</Button>
        </div>
      </div>
    </div>
  )
}



// ─────────────────────────────────────────────
// Edit User Modal — updates /users/{uid} in Firestore
// ─────────────────────────────────────────────

interface EditUserModalProps { user: UserRow; onClose: () => void }

function EditUserModal({ user, onClose }: EditUserModalProps) {
  const [name,     setName]     = useState(user.name)
  const [role,     setRole]     = useState<'admin' | 'manager' | 'staff'>(user.role as 'admin' | 'manager' | 'staff')
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')

  const handleSave = async () => {
    if (!name) { setError('Name is required'); return }
    setSaving(true); setError('')
    try {
      await updateUser(user.uid, { name, role })
      onClose()
    } catch { setError('Failed to save. Please try again.') }
    finally { setSaving(false) }
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 50,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--font-inter)',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '420px', background: 'var(--color-surface-overlay)',
        border: '0.5px solid var(--color-border)',
        borderRadius: '16px', padding: '24px',
        display: 'flex', flexDirection: 'column', gap: '14px',
      }}>
        <div style={{ fontSize: 'var(--text-lg)', fontWeight: 600 }}>Edit user</div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>{user.email}</div>

        {error && (
          <div style={{
            fontSize: 'var(--text-xs)', color: 'var(--color-danger)',
            background: 'var(--color-danger-muted)', borderRadius: '8px', padding: '8px 12px',
          }}>{error}</div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>Full name</label>
          <Input value={name} onChange={e => setName(e.target.value)} className="h-9" />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>Role</label>
          <select
            value={role}
            onChange={e => setRole(e.target.value as 'admin' | 'manager' | 'staff')}
            style={{
              height: '36px', padding: '0 12px', borderRadius: '8px',
              background: 'var(--color-surface-raised)', border: '0.5px solid var(--color-border)',
              color: 'var(--color-foreground)', fontSize: 'var(--text-sm)', fontFamily: 'var(--font-inter)',
              outline: 'none', width: '100%',
            }}
          >
            <option value="admin">Admin</option>
            <option value="manager">Manager</option>
            <option value="staff">Staff</option>
          </select>
        </div>

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', borderTop: '0.5px solid var(--color-border)', paddingTop: '16px' }}>
          <button onClick={onClose} style={{
            height: '36px', padding: '0 16px', borderRadius: '8px', cursor: 'pointer',
            background: 'transparent', border: '0.5px solid var(--color-border)',
            color: 'var(--color-foreground)', fontSize: 'var(--text-sm)', fontFamily: 'var(--font-inter)',
          }}>Cancel</button>
          <Button className="h-9 font-medium" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// Reset Password Modal — calls /api/admin/reset-password
// ─────────────────────────────────────────────

interface ResetPasswordModalProps { user: UserRow; onClose: () => void }

function ResetPasswordModal({ user, onClose }: ResetPasswordModalProps) {
  const [loading, setLoading] = useState(false)
  const [link,    setLink]    = useState('')
  const [sent,    setSent]    = useState(false)
  const [copied,  setCopied]  = useState(false)
  const [error,   setError]   = useState('')

  const handleGenerate = async () => {
    setLoading(true); setError('')
    try {
      const res  = await fetch('/api/admin/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ email: user.email }),
      })
      const data = await res.json() as { link?: string; sent?: boolean; error?: string }
      if (!res.ok) { setError(data.error ?? 'Failed to send reset link'); return }
      if (data.link && (data.link.startsWith('http://') || data.link.startsWith('https://'))) {
        setLink(data.link)
      } else {
        setSent(true)
      }
    } catch { setError('Network error. Please try again.') }
    finally { setLoading(false) }
  }

  const handleCopy = async () => {
    if (!link) return
    await navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 50,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--font-inter)',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '460px', background: 'var(--color-surface-overlay)',
        border: '0.5px solid var(--color-border)',
        borderRadius: '16px', padding: '24px',
        display: 'flex', flexDirection: 'column', gap: '16px',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ fontSize: 'var(--text-lg)', fontWeight: 600 }}>Reset password</div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>
            Send a password reset email to <strong>{user.name}</strong> ({user.email})
          </div>
        </div>

        {error && (
          <div style={{
            fontSize: 'var(--text-xs)', color: 'var(--color-danger)',
            background: 'var(--color-danger-muted)', borderRadius: '8px', padding: '8px 12px',
          }}>{error}</div>
        )}

        {sent ? (
          <div style={{
            display: 'flex', flexDirection: 'column', gap: '10px',
            background: 'var(--color-success-muted)', border: '0.5px solid var(--color-success)',
            borderRadius: '12px', padding: '16px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-success)', fontWeight: 600, fontSize: 'var(--text-sm)' }}>
              <i className="ti ti-circle-check" style={{ fontSize: '18px' }} />
              Password Reset Email Sent!
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)', lineHeight: 1.5 }}>
              An official password reset email has been sent directly to <strong>{user.email}</strong>. The user can click the link in their inbox to set a new password.
            </div>
          </div>
        ) : link ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>Reset link (one-time use)</label>
            <div style={{
              background: 'var(--color-surface-raised)', border: '0.5px solid var(--color-border)',
              borderRadius: '8px', padding: '10px 12px',
              fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)',
              wordBreak: 'break-all', lineHeight: 1.6,
            }}>{link}</div>
            <button
              onClick={handleCopy}
              style={{
                height: '34px', padding: '0 14px', borderRadius: '8px', cursor: 'pointer',
                background: copied ? 'var(--color-success-muted)' : 'var(--color-accent-muted)',
                border: 'none',
                color: copied ? 'var(--color-success)' : 'var(--color-accent)',
                fontSize: 'var(--text-xs)', fontWeight: 600, fontFamily: 'var(--font-inter)',
                display: 'flex', alignItems: 'center', gap: '6px', width: 'fit-content',
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              <i className={`ti ${copied ? 'ti-check' : 'ti-copy'}`} style={{ fontSize: '14px' }} />
              {copied ? 'Copied to clipboard' : 'Copy link'}
            </button>
          </div>
        ) : (
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-foreground-muted)' }}>
            Click below to send an official password reset email to the user&apos;s inbox.
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', borderTop: '0.5px solid var(--color-border)', paddingTop: '16px' }}>
          <button onClick={onClose} style={{
            height: '36px', padding: '0 16px', borderRadius: '8px', cursor: 'pointer',
            background: 'transparent', border: '0.5px solid var(--color-border)',
            color: 'var(--color-foreground)', fontSize: 'var(--text-sm)', fontFamily: 'var(--font-inter)',
          }}>{sent || link ? 'Done' : 'Close'}</button>
          {!sent && !link && (
            <Button className="h-9 font-medium" onClick={handleGenerate} disabled={loading}>
              {loading ? 'Sending…' : 'Send reset email'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// Main Settings Page
// ─────────────────────────────────────────────

export default function SettingsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab')
  const { isAdmin } = useRole()
  useUIStore() // keep store subscribed for sidebar theme sync

  const [prevTabParam, setPrevTabParam] = useState<string | null>(tabParam)
  const [page, setPage] = useState<Page>(() => {
    if (tabParam === 'users' || tabParam === 'user-management') return 'User management'
    if (tabParam === 'packages') return 'Packages'
    if (tabParam === 'numbering') return 'Numbering'
    if (tabParam === 'branding') return 'Studio branding'
    return 'Studio branding'
  })

  // Synchronize state during render pass if URL tab parameter changes
  if (tabParam !== prevTabParam) {
    setPrevTabParam(tabParam)
    if (tabParam === 'users' || tabParam === 'user-management') setPage('User management')
    else if (tabParam === 'packages') setPage('Packages')
    else if (tabParam === 'numbering') setPage('Numbering')
    else if (tabParam === 'branding') setPage('Studio branding')
  }
  const [users, setUsers] = useState<UserRow[]>([])
  const [mobileTab, setMobileTab] = useState<Page | null>(null)

  // Studio selector
  const [selectedStudio, setSelectedStudio] = useState<'studio-zoom' | 'studio-zoom-productions'>('studio-zoom')

  // Per-studio branding data — one entry per studio
  const [brandData, setBrandData] = useState<Record<string, BrandForm>>({
    'studio-zoom':             { ...EMPTY_BRAND },
    'studio-zoom-productions': { ...EMPTY_BRAND },
  })
  // Edit mode toggle
  const [brandEditMode, setBrandEditMode] = useState(false)
  const [brandSaving,   setBrandSaving]   = useState(false)
  const [brandSaved,    setBrandSaved]    = useState(false)
  const [brandError,    setBrandError]    = useState('')

  // Packages
  const [packages,      setPackages]      = useState<PackageTemplate[]>([])
  const [editPkg,       setEditPkg]       = useState<PackageTemplate | null | 'new'>('new')
  const [showPkgModal,  setShowPkgModal]  = useState(false)
  const [pkgSaving,     setPkgSaving]     = useState(false)
  const [draggedIndex,  setDraggedIndex]  = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  // GST
  const [gstEnabled,       setGstEnabled]       = useState(false)
  const [invoicePrefix,    setInvoicePrefix]    = useState('')
  const [quotationPrefix,  setQuotationPrefix]  = useState('')
  const [nextNumber,       setNextNumber]       = useState('')
  const [gstSaving,        setGstSaving]        = useState(false)
  const [gstSaved,         setGstSaved]         = useState(false)

  // User management
  const [editUser,       setEditUser]       = useState<UserRow | null>(null)
  const [resetUser,         setResetUser]         = useState<UserRow | null>(null)
  const [deleteUid,        setDeleteUid]        = useState<string | null>(null)
  const [deleteLoading,    setDeleteLoading]    = useState(false)

  // Guard: admin only
  useEffect(() => {
    if (isAdmin === false) router.replace('/dashboard')
  }, [isAdmin, router])

  // Real-time subscriptions — one per Firestore document

  // brandConfig
  useEffect(() => {
    return subscribeToBrandConfig(b => {
      if (!b) return
      setBrandData(prev => ({
        ...prev,
        'studio-zoom': {
          phone:   b.studioZoom?.phone   ?? '',
          address: b.studioZoom?.address ?? '',
          city:    b.studioZoom?.city    ?? '',
          email:   b.studioZoom?.email   ?? '',
          gstin:   b.studioZoom?.gstin   ?? '',
          upiId:   b.studioZoom?.upiId   ?? '',
        },
        'studio-zoom-productions': {
          phone:   b.studioZoomProds?.phone   ?? '',
          address: b.studioZoomProds?.address ?? '',
          city:    b.studioZoomProds?.city    ?? '',
          email:   b.studioZoomProds?.email   ?? '',
          gstin:   b.studioZoomProds?.gstin   ?? '',
          upiId:   b.studioZoomProds?.upiId   ?? '',
        },
      }))
    })
  }, [])

  // numberingConfig
  useEffect(() => {
    return subscribeToNumberingConfig(n => {
      if (!n) return
      setGstEnabled(n.gstEnabled ?? false)
      setInvoicePrefix(n.invoicePrefix ?? 'ZS-INV-')
      setQuotationPrefix(n.quotationPrefix ?? 'ZS-Q-')
      setNextNumber(String(n.invoiceStartNumber ?? 1).padStart(4, '0'))
    })
  }, [])

  // packageConfig
  useEffect(() => {
    return subscribeToPackageConfig(p => {
      setPackages(p?.packages ?? [])
    })
  }, [])

  // config (active state)
  useEffect(() => {
    return subscribeToActiveConfig(a => {
      if (!a) return
      if (a.activeStudioId) setSelectedStudio(a.activeStudioId as 'studio-zoom' | 'studio-zoom-productions')
    })
  }, [])

  // Users — load when User management tab is active
  useEffect(() => {
    if (page === 'User management') {
      return subscribeToAllUsers(setUsers)
    }
  }, [page])

  // ── Branding save
  const handleSaveBranding = async () => {
    const current = brandData[selectedStudio] ?? EMPTY_BRAND
    const phoneVal = (current.phone || '').trim()

    if (phoneVal.length !== 10 || !/^\d{10}$/.test(phoneVal)) {
      setBrandError('Phone number must be exactly 10 digits')
      return
    }

    setBrandError('')
    setBrandSaving(true)
    try {
      await saveBranding(selectedStudio, current as StudioBranding)
      // Also update activeStudioId in /config
      await saveActiveConfig({ activeStudioId: selectedStudio })
      setBrandSaved(true)
      setBrandEditMode(false)
      setTimeout(() => setBrandSaved(false), 2000)
    } catch (err) {
      console.error('Failed to save branding:', err)
      setBrandError('Failed to save branding settings. Please try again.')
    } finally {
      setBrandSaving(false)
    }
  }

  // ── Package drag & drop reorder
  const handleDragStart = (index: number) => {
    setDraggedIndex(index)
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (dragOverIndex !== index) {
      setDragOverIndex(index)
    }
  }

  const handleDrop = async (dropIndex: number) => {
    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null)
      setDragOverIndex(null)
      return
    }

    const updated = [...packages]
    const [movedItem] = updated.splice(draggedIndex, 1)
    updated.splice(dropIndex, 0, movedItem)

    setPackages(updated)
    setDraggedIndex(null)
    setDragOverIndex(null)
    setPkgSaving(true)
    try {
      await savePackages(updated)
    } catch (err) {
      console.error('Failed to save reordered packages:', err)
    } finally {
      setPkgSaving(false)
    }
  }

  // ── Package save
  const handlePkgSave = async (pkg: PackageTemplate) => {
    const updated = editPkg === 'new'
      ? [...packages, pkg]
      : packages.map(p => p.id === pkg.id ? pkg : p)
    setPackages(updated)
    setShowPkgModal(false)
    setPkgSaving(true)
    try {
      await savePackages(updated)
    } catch (err) {
      console.error('Failed to save packages:', err)
    } finally {
      setPkgSaving(false)
    }
  }

  // ── Numbering save
  const handleSaveGst = async () => {
    setGstSaving(true)
    try {
      await saveNumberingConfig({
        gstEnabled,
        invoicePrefix,
        quotationPrefix,
        invoiceStartNumber:   Number(nextNumber.replace(/^0+/, '') || '1'),
        quotationStartNumber: 1,
      })
      setGstSaved(true)
      setTimeout(() => setGstSaved(false), 2000)
    } catch (err) {
      console.error('Failed to save numbering settings:', err)
    } finally {
      setGstSaving(false)
    }
  }

  // ── Deactivate / Soft delete user
  const handleDeleteConfirm = async () => {
    if (!deleteUid) return
    setDeleteLoading(true)
    try {
      const res = await fetch('/api/admin/delete-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: deleteUid }),
      })
      if (!res.ok) {
        const d = await res.json() as { error?: string }
        console.warn('API delete-user returned error, attempting client-side fallback:', d.error)
        await deleteUserDoc(deleteUid)
      }
    } catch (err) {
      console.warn('API delete-user error, attempting client-side soft delete:', err)
      try {
        await deleteUserDoc(deleteUid)
      } catch (clientErr) {
        console.error('Failed to delete user via client fallback:', clientErr)
      }
    } finally {
      setDeleteLoading(false)
      setDeleteUid(null)
    }
  }

  const deletingUser = users.find(u => u.uid === deleteUid)

  const renderDetailContent = () => (
    <>
      {/* ═══════════════════════════════════════
          A — STUDIO BRANDING
      ═══════════════════════════════════════ */}
      {page === 'Studio branding' && (
        <div style={{
          background: 'var(--color-surface)', border: '0.5px solid var(--color-border)',
          borderRadius: '12px', padding: '24px',
          display: 'flex', flexDirection: 'column', gap: '20px',
        }}>
          {/* ── Studio identity selector */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px',
            borderBottom: '0.5px solid var(--color-border)', paddingBottom: '20px' }}>
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>Studio identity</div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>
              Select which studio this document set belongs to · appears on quotations, invoices and payslips
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" style={{ paddingBottom: '4px' }}>
              {STUDIOS.map(studio => {
                const isSelected = selectedStudio === studio.id
                return (
                  <div
                    key={studio.id}
                    onClick={() => {
                      setSelectedStudio(studio.id as 'studio-zoom' | 'studio-zoom-productions')
                      setBrandEditMode(false) // exit edit mode when switching studio
                    }}
                    style={{
                      border: isSelected
                        ? '1.5px solid var(--color-primary)'
                        : '0.5px solid var(--color-border)',
                      borderRadius: '12px',
                      padding: '16px 18px',
                      cursor: 'pointer',
                      background: isSelected
                        ? 'var(--color-primary-muted)'
                        : 'var(--color-surface-raised)',
                      display: 'flex', alignItems: 'center', gap: '14px',
                      transition: 'border-color 0.15s, background 0.15s',
                    }}
                  >
                    {/* Studio logo */}
                    <div style={{
                      width: '52px', height: '40px', borderRadius: '8px', flexShrink: 0,
                      background: 'linear-gradient(135deg, var(--color-primary) 0%, #8b3a72 100%)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      overflow: 'hidden',
                    }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/logo.png" alt={studio.name} style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '4px' }} />
                    </div>

                    {/* Studio name + tagline */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 'var(--text-base)', fontWeight: 700 }}>
                        {studio.name}
                      </div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)', marginTop: '2px' }}>
                        {studio.tagline}
                      </div>
                    </div>

                    {/* Radio indicator */}
                    <div style={{
                      width: '20px', height: '20px', borderRadius: '50%', flexShrink: 0,
                      background:  isSelected ? 'var(--color-primary)' : 'transparent',
                      border:      isSelected ? 'none' : '1.5px solid var(--color-foreground-subtle)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'background 0.15s, border 0.15s',
                    }}>
                      {isSelected && (
                        <i className="ti ti-check" style={{ fontSize: '12px', color: '#ffffff' }} />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

          {/* ── Branding fields header with edit toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>
              {STUDIOS.find(s => s.id === selectedStudio)?.name} details
            </div>
            {!brandEditMode ? (
              <span
                onClick={() => { setBrandEditMode(true); setBrandError('') }}
                title="Edit details"
                style={{
                  width: '30px', height: '30px', borderRadius: '8px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', color: 'var(--color-accent)',
                  background: 'transparent', transition: 'background 0.12s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-accent-muted)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <i className="ti ti-pencil" style={{ fontSize: '16px' }} />
              </span>
            ) : (
              <span
                onClick={() => { setBrandEditMode(false); setBrandError('') }}
                title="Cancel editing"
                style={{
                  width: '30px', height: '30px', borderRadius: '8px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', color: 'var(--color-foreground-muted)',
                  background: 'transparent', transition: 'background 0.12s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-raised)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <i className="ti ti-x" style={{ fontSize: '16px' }} />
              </span>
            )}
          </div>

          {brandError && (
            <div style={{
              fontSize: 'var(--text-xs)', color: 'var(--color-danger)',
              background: 'var(--color-danger-muted)', borderRadius: '8px', padding: '8px 12px',
            }}>
              {brandError}
            </div>
          )}

          {/* ── 6 branding fields — responsive grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {BRAND_FIELDS.map(f => {
              const val = (brandData[selectedStudio] ?? EMPTY_BRAND)[f.key]
              return (
                <div key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>{f.label}</label>
                  {brandEditMode ? (
                    f.key === 'phone' ? (
                      <PhoneNumberInput
                        value={val}
                        onChange={nextVal => {
                          if (brandError) setBrandError('')
                          setBrandData(prev => ({
                            ...prev,
                            [selectedStudio]: { ...(prev[selectedStudio] ?? EMPTY_BRAND), phone: nextVal },
                          }))
                        }}
                        error={brandError}
                      />
                    ) : (
                      <Input
                        value={val}
                        onChange={e => setBrandData(prev => ({
                          ...prev,
                          [selectedStudio]: { ...(prev[selectedStudio] ?? EMPTY_BRAND), [f.key]: e.target.value },
                        }))}
                        className="h-9"
                      />
                    )
                  ) : (
                    <div style={{
                      height: '36px', padding: '0 12px',
                      display: 'flex', alignItems: 'center',
                      background: 'var(--color-surface-raised)',
                      border: '0.5px solid var(--color-border)',
                      borderRadius: '8px',
                      fontSize: 'var(--text-sm)',
                      color: val ? 'var(--color-foreground)' : 'var(--color-foreground-subtle)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {val || '—'}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* ── Save — only in edit mode */}
          {brandEditMode && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '0.5px solid var(--color-border)', paddingTop: '16px' }}>
              <Button className="h-9 font-medium" onClick={handleSaveBranding} disabled={brandSaving}>
                {brandSaving ? 'Saving…' : brandSaved ? 'Saved ✓' : 'Save changes'}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════
          B — PACKAGES
      ═══════════════════════════════════════ */}
      {page === 'Packages' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              className="h-9 font-medium"
              onClick={() => { setEditPkg('new'); setShowPkgModal(true) }}
              disabled={pkgSaving}
            >
              + Add package
            </Button>
          </div>

          {packages.map((p, index) => {
            const colour = PKG_COLOURS[p.name] ?? { bg: 'var(--color-surface-raised)', fg: 'var(--color-foreground-muted)' }
            const displayPrice = p.lineItems && p.lineItems.length > 0
              ? p.lineItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
              : p.price

            const isDragging = draggedIndex === index
            const isDragOver = dragOverIndex === index

            return (
              <div
                key={p.id}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={e => handleDragOver(e, index)}
                onDrop={() => handleDrop(index)}
                onDragEnd={() => { setDraggedIndex(null); setDragOverIndex(null) }}
                className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-4"
                style={{
                  background: 'var(--color-surface)',
                  border: isDragOver
                    ? '1.5px solid var(--color-primary)'
                    : '0.5px solid var(--color-border)',
                  opacity: isDragging ? 0.4 : 1,
                  borderRadius: '12px',
                  transition: 'border-color 0.15s, opacity 0.15s',
                  cursor: 'grab',
                }}
                onMouseEnter={e => {
                  if (!isDragOver) e.currentTarget.style.borderColor = 'var(--color-border-strong)'
                }}
                onMouseLeave={e => {
                  if (!isDragOver) e.currentTarget.style.borderColor = 'var(--color-border)'
                }}
              >
                {/* Top drag & icon row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {/* Drag handle */}
                  <i className="ti ti-grip-vertical" style={{ fontSize: '16px', color: 'var(--color-foreground-subtle)', cursor: 'grab' }} />

                  {/* Package icon */}
                  <div style={{
                    width: '40px', height: '40px', borderRadius: '10px', flexShrink: 0,
                    background: colour.bg, color: colour.fg,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <i className="ti ti-package" style={{ fontSize: '20px' }} />
                  </div>
                </div>

                {/* Name + description */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                  <div style={{ fontSize: 'var(--text-base)', fontWeight: 600 }}>{p.name}</div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>{p.items}</div>
                </div>

                {/* Price + Edit row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
                  <div style={{ fontSize: 'var(--text-lg)', fontWeight: 700 }}>
                    ₹{displayPrice.toLocaleString('en-IN')}
                  </div>

                  <span
                    onClick={e => {
                      e.stopPropagation()
                      setEditPkg(p)
                      setShowPkgModal(true)
                    }}
                    style={{ fontSize: 'var(--text-xs)', color: 'var(--color-accent)', cursor: 'pointer', fontWeight: 500 }}
                  >
                    Edit
                  </span>
                </div>
              </div>
            )
          })}

          {packages.length === 0 && (
            <div style={{
              background: 'var(--color-surface)', border: '0.5px solid var(--color-border)',
              borderRadius: '12px', padding: '40px',
              textAlign: 'center', color: 'var(--color-foreground-muted)', fontSize: 'var(--text-sm)',
            }}>
              No packages yet. Click &quot;+ Add package&quot; to create your first one.
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════
          C — NUMBERING
      ═══════════════════════════════════════ */}
      {page === 'Numbering' && (
        <div style={{
          background: 'var(--color-surface)', border: '0.5px solid var(--color-border)',
          borderRadius: '12px', padding: '24px',
          display: 'flex', flexDirection: 'column', gap: '18px',
        }}>
          {/* Responsive grid — Invoice prefix / Quotation prefix / Next number */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>Invoice prefix</label>
              <Input value={invoicePrefix} onChange={e => setInvoicePrefix(e.target.value)} className="h-9" placeholder="ZS-INV-" />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>Quotation prefix</label>
              <Input value={quotationPrefix} onChange={e => setQuotationPrefix(e.target.value)} className="h-9" placeholder="ZS-Q-" />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>Next number</label>
              <Input value={nextNumber} onChange={e => setNextNumber(e.target.value)} className="h-9" placeholder="0048" />
            </div>
          </div>

          {/* Save */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '0.5px solid var(--color-border)', paddingTop: '16px' }}>
            <Button className="h-9 font-medium" onClick={handleSaveGst} disabled={gstSaving}>
              {gstSaving ? 'Saving…' : gstSaved ? 'Saved ✓' : 'Save changes'}
            </Button>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════
          D — USER MANAGEMENT
      ═══════════════════════════════════════ */}
      {page === 'User management' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button className="h-9 font-medium" onClick={() => router.push('/settings/users/new')}>
              + Add user
            </Button>
          </div>

          <div className="overflow-x-auto" style={{
            background: 'var(--color-surface)', border: '0.5px solid var(--color-border)',
            borderRadius: '12px',
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)', minWidth: '600px' }}>
              <thead>
                <tr style={{ background: 'var(--color-surface-raised)' }}>
                  {['USER', 'EMAIL', 'ROLE', 'STATUS', ''].map((h, i) => (
                    <th
                      key={i}
                      style={{
                        padding: '0 16px', height: '38px', textAlign: 'left',
                        fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: '0.04em',
                        color: 'var(--color-foreground-subtle)',
                        borderBottom: '0.5px solid var(--color-border-strong)',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr
                    key={u.uid}
                    style={{ cursor: 'default', transition: 'background 0.1s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-raised)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    {/* USER */}
                    <td style={{ padding: '0 16px', height: '48px', borderBottom: '0.5px solid var(--color-border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                          width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
                          background: 'var(--color-primary-muted)', color: 'var(--color-primary)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '10px', fontWeight: 700,
                        }}>
                          {getInitials(u.name)}
                        </div>
                        <span style={{ fontWeight: 600 }}>{u.name}</span>
                      </div>
                    </td>

                    {/* EMAIL */}
                    <td style={{
                      padding: '0 16px', height: '48px', borderBottom: '0.5px solid var(--color-border)',
                      color: 'var(--color-foreground-muted)',
                    }}>
                      {u.email}
                    </td>

                    {/* ROLE — inline badge span, NOT <Badge> component */}
                    <td style={{ padding: '0 16px', height: '48px', borderBottom: '0.5px solid var(--color-border)' }}>
                      <span style={{
                        fontSize: 'var(--text-xs)', fontWeight: 600,
                        padding: '2px 8px', borderRadius: '10px',
                        background: ROLE_STYLE[u.role]?.bg ?? 'var(--color-surface-overlay)',
                        color:      ROLE_STYLE[u.role]?.fg ?? 'var(--color-foreground-muted)',
                      }}>
                        {u.role.charAt(0).toUpperCase() + u.role.slice(1)}
                      </span>
                    </td>

                    {/* STATUS */}
                    <td style={{ padding: '0 16px', height: '48px', borderBottom: '0.5px solid var(--color-border)' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>
                        <span style={{
                          width: '7px', height: '7px', borderRadius: '50%',
                          background: u.isActive ? 'var(--color-success)' : 'var(--color-foreground-subtle)',
                          flexShrink: 0,
                        }} />
                        {u.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>

                    {/* ACTIONS */}
                    <td style={{ padding: '0 16px', height: '48px', borderBottom: '0.5px solid var(--color-border)', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end', alignItems: 'center' }}>
                        {/* Edit */}
                        <span
                          onClick={() => setEditUser(u)}
                          title="Edit profile"
                          style={{
                            width: '30px', height: '30px', borderRadius: '8px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', color: 'var(--color-accent)',
                            background: 'transparent', transition: 'background 0.12s',
                          }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-accent-muted)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <i className="ti ti-pencil" style={{ fontSize: '16px' }} />
                        </span>

                        {/* Reset password */}
                        <span
                          onClick={() => setResetUser(u)}
                          title="Reset password"
                          style={{
                            width: '30px', height: '30px', borderRadius: '8px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', color: 'var(--color-foreground-muted)',
                            background: 'transparent', transition: 'background 0.12s',
                          }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-raised)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <i className="ti ti-key" style={{ fontSize: '16px' }} />
                        </span>

                        {/* Delete */}
                        <span
                          onClick={() => setDeleteUid(u.uid)}
                          title="Delete user"
                          style={{
                            width: '30px', height: '30px', borderRadius: '8px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', color: 'var(--color-danger)',
                            background: 'transparent', transition: 'background 0.12s',
                          }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-danger-muted)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <i className="ti ti-trash" style={{ fontSize: '16px' }} />
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )

  return (
    <div style={{
      maxWidth: '1100px', margin: '0 auto', padding: '16px',
      fontFamily: 'var(--font-inter)', color: 'var(--color-foreground)',
      width: '100%', boxSizing: 'border-box',
    }}>
      {/* ── DESKTOP VIEW (1025px+) — Side-by-side 2-column layout */}
      <div className="hidden lg:flex" style={{ gap: '20px', alignItems: 'flex-start' }}>
        {/* Left sub-nav */}
        <div style={{ width: '200px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {NAV_ITEMS.map(item => (
            <div
              key={item.label}
              onClick={() => setPage(item.label)}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                height: '38px', padding: '0 12px', borderRadius: '8px', cursor: 'pointer',
                background: page === item.label ? 'var(--color-primary-muted)' : 'transparent',
                color:      page === item.label ? 'var(--color-primary)' : 'var(--color-foreground-muted)',
                fontSize: 'var(--text-sm)', fontWeight: 500,
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              <i className={`ti ${item.icon}`} style={{ fontSize: '17px' }} />
              {item.label}
            </div>
          ))}
        </div>

        {/* Right detail panel */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {renderDetailContent()}
        </div>
      </div>

      {/* ── MOBILE & TABLET VIEW (< 1025px) — Responsive Drill-in Navigation */}
      <div className="lg:hidden" style={{ width: '100%' }}>
        {mobileTab === null ? (
          /* Initial View: Full-width Sub-nav Cards List */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{
              fontSize: 'var(--text-xs)', fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '0.08em',
              color: 'var(--color-foreground-subtle)', marginBottom: '4px',
            }}>
              Studio Settings
            </div>
            {NAV_ITEMS.map(item => (
              <div
                key={item.label}
                onClick={() => {
                  setPage(item.label)
                  setMobileTab(item.label)
                }}
                style={{
                  background: 'var(--color-surface)',
                  border: '0.5px solid var(--color-border)',
                  borderRadius: '12px',
                  padding: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
              >
                <div style={{
                  width: '40px', height: '40px', borderRadius: '10px', flexShrink: 0,
                  background: 'var(--color-surface-raised)',
                  color: 'var(--color-primary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <i className={`ti ${item.icon}`} style={{ fontSize: '20px' }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--color-foreground)' }}>
                    {item.label}
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)', marginTop: '2px' }}>
                    {item.label === 'Studio branding' && 'Studio identity, logo, GSTIN, address & contact details'}
                    {item.label === 'Packages' && 'Service package templates & line items'}
                    {item.label === 'Numbering' && 'Invoice & quotation prefix numbers'}
                    {item.label === 'User management' && 'Manage staff accounts, roles & permissions'}
                  </div>
                </div>
                <i className="ti ti-chevron-right" style={{ fontSize: '18px', color: 'var(--color-foreground-subtle)', flexShrink: 0 }} />
              </div>
            ))}
          </div>
        ) : (
          /* Detail View: Sticky Back Header + Section Content */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              paddingBottom: '8px', borderBottom: '0.5px solid var(--color-border)',
            }}>
              <button
                onClick={() => setMobileTab(null)}
                style={{
                  background: 'var(--color-surface-raised)',
                  border: '0.5px solid var(--color-border)',
                  borderRadius: '8px',
                  padding: '6px 14px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                  color: 'var(--color-foreground)',
                  fontSize: 'var(--text-sm)',
                  fontWeight: 600,
                  fontFamily: 'var(--font-inter)',
                }}
              >
                <i className="ti ti-arrow-left" style={{ fontSize: '16px' }} />
                Back to Settings
              </button>
              <div style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--color-foreground)' }}>
                {mobileTab}
              </div>
            </div>

            {/* Section Detail Content */}
            <div style={{ width: '100%', minWidth: 0 }}>
              {renderDetailContent()}
            </div>
          </div>
        )}
      </div>

      {/* ── Modals */}
      {showPkgModal && (
        <PackageModal
          pkg={editPkg === 'new' ? null : editPkg}
          onSave={handlePkgSave}
          onClose={() => setShowPkgModal(false)}
        />
      )}

      {editUser && (
        <EditUserModal user={editUser} onClose={() => setEditUser(null)} />
      )}

      {resetUser && (
        <ResetPasswordModal user={resetUser} onClose={() => setResetUser(null)} />
      )}

      <ConfirmModal
        open={!!deleteUid}
        title="Delete user?"
        description={`${deletingUser?.name ?? 'This user'} will be permanently disabled and removed from Studio Zoom. This cannot be undone from the app.`}
        confirmLabel="Delete"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteUid(null)}
        loading={deleteLoading}
      />
    </div>
  )
}

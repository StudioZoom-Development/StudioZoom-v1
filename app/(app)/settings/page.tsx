'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input }  from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { ConfirmModal } from '@/components/shared/ConfirmModal'
import { useUIStore } from '@/store/uiStore'
import { useRole } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'
import {
  StudioSettings,
  PackageTemplate,
  PackageLineItem,
  UserRow,
  subscribeToSettings,
  subscribeToAllUsers,
  saveBranding,
  saveGstSettings,
  savePackages,
  deactivateUser,
} from '@/lib/firebase/queries/settings'

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

type Page = 'Studio branding' | 'Packages' | 'GST & numbering' | 'User management' | 'Theme'

const NAV_ITEMS: Array<{ label: Page; icon: string }> = [
  { label: 'Studio branding', icon: 'ti-aperture'   },
  { label: 'Packages',        icon: 'ti-package'    },
  { label: 'GST & numbering', icon: 'ti-percentage' },
  { label: 'User management', icon: 'ti-users'      },
  { label: 'Theme',           icon: 'ti-palette'    },
]

const BRAND_FIELDS: Array<{ key: keyof BrandForm; label: string }> = [
  { key: 'studioName', label: 'Studio name' },
  { key: 'phone',      label: 'Phone'       },
  { key: 'address',    label: 'Address'     },
  { key: 'city',       label: 'City'        },
  { key: 'email',      label: 'Email'       },
  { key: 'gstin',      label: 'GSTIN'       },
  { key: 'upiId',      label: 'UPI ID'      },
  { key: 'bankIfsc',   label: 'Bank · IFSC' },
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

const SWATCHES = ['#c6539f', '#eca82f', '#213bdb', '#4caf50', '#ef5350', '#181d19']

// ─────────────────────────────────────────────
// Sub-types
// ─────────────────────────────────────────────

interface BrandForm {
  studioName:   string
  phone:        string
  address:      string
  city:         string
  email:        string
  gstin:        string
  upiId:        string
  bankIfsc:     string
  defaultTerms: string
}

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
  }

  const addLine = () => setLineItems(prev => [...prev, { description: '', qty: 1, rate: 0, amount: 0 }])
  const removeLine = (i: number) => setLineItems(prev => prev.filter((_, idx) => idx !== i))

  const handleSave = () => {
    const colours = PKG_COLOURS[name] ?? { bg: 'var(--color-surface-raised)', fg: 'var(--color-foreground-muted)' }
    onSave({
      id:       pkg?.id ?? 'pkg_' + Date.now(),
      name,
      price:    Number(price.replace(/[^0-9]/g, '')),
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
// Create User Modal
// ─────────────────────────────────────────────

interface CreateUserModalProps {
  onClose: () => void
}

function CreateUserModal({ onClose }: CreateUserModalProps) {
  const [name,  setName]  = useState('')
  const [email, setEmail] = useState('')
  const [role,  setRole]  = useState<'admin' | 'manager' | 'staff'>('staff')
  const [saving, setSaving] = useState(false)

  const handleCreate = async () => {
    if (!name || !email) return
    setSaving(true)
    try {
      const { setDoc, doc, serverTimestamp: sT } = await import('firebase/firestore')
      const { db: dbInst } = await import('@/lib/firebase/config')
      const tempUid = 'user_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)
      await setDoc(doc(dbInst, 'users', tempUid), {
        uid: tempUid, name, email, role,
        isActive: true, jobTitle: role === 'manager' ? 'Manager' : 'Staff',
        createdAt: sT(), updatedAt: sT(),
      })
      onClose()
    } catch (err) {
      console.error('Failed to create user:', err)
    } finally {
      setSaving(false)
    }
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
          width: '400px', background: 'var(--color-surface-overlay)',
          border: '0.5px solid var(--color-border)',
          borderRadius: '16px', padding: '24px',
          display: 'flex', flexDirection: 'column', gap: '16px',
        }}
      >
        <div style={{ fontSize: 'var(--text-lg)', fontWeight: 600 }}>Create user</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>Full name</label>
          <Input value={name} onChange={e => setName(e.target.value)} className="h-9" placeholder="e.g. Sathish Kumar" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>Email</label>
          <Input value={email} onChange={e => setEmail(e.target.value)} className="h-9" placeholder="user@studiozoom.in" type="email" />
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
          <Button className="h-9 font-medium" onClick={handleCreate} disabled={saving}>
            {saving ? 'Creating…' : 'Create user'}
          </Button>
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
  const { isAdmin } = useRole()
  const { theme, toggleTheme } = useUIStore()

  const [page,     setPage]     = useState<Page>('Studio branding')
  const [settings, setSettings] = useState<StudioSettings | null>(null)
  const [users,    setUsers]    = useState<UserRow[]>([])

  // Branding form
  const [brandForm, setBrandForm] = useState<BrandForm>({
    studioName: '', phone: '', address: '', city: '',
    email: '', gstin: '', upiId: '', bankIfsc: '', defaultTerms: '',
  })
  const [brandSaving, setBrandSaving] = useState(false)
  const [brandSaved,  setBrandSaved]  = useState(false)

  // Packages
  const [packages,     setPackages]     = useState<PackageTemplate[]>([])
  const [editPkg,      setEditPkg]      = useState<PackageTemplate | null | 'new'>('new')
  const [showPkgModal, setShowPkgModal] = useState(false)
  const [pkgSaving,    setPkgSaving]    = useState(false)

  // GST
  const [gstEnabled,       setGstEnabled]       = useState(false)
  const [invoicePrefix,    setInvoicePrefix]    = useState('')
  const [quotationPrefix,  setQuotationPrefix]  = useState('')
  const [nextNumber,       setNextNumber]       = useState('')
  const [gstSaving,        setGstSaving]        = useState(false)
  const [gstSaved,         setGstSaved]         = useState(false)

  // User management
  const [showCreateUser,  setShowCreateUser]  = useState(false)
  const [deactivateUid,   setDeactivateUid]   = useState<string | null>(null)
  const [deactivateLoading, setDeactivateLoading] = useState(false)

  // Guard: admin only
  useEffect(() => {
    if (isAdmin === false) router.replace('/dashboard')
  }, [isAdmin, router])

  // Real-time settings subscription
  useEffect(() => {
    return subscribeToSettings(s => {
      if (!s) return
      setSettings(s)
      setBrandForm({
        studioName:   s.studioName   ?? '',
        phone:        s.phone        ?? '',
        address:      s.address      ?? '',
        city:         s.city         ?? '',
        email:        s.email        ?? '',
        gstin:        s.gstin        ?? '',
        upiId:        s.upiId        ?? '',
        bankIfsc:     s.bankIfsc     ?? '',
        defaultTerms: s.defaultTerms ?? '',
      })
      setPackages(s.packages ?? [])
      setGstEnabled(s.gstEnabled ?? false)
      setInvoicePrefix(s.invoicePrefix ?? 'ZS-INV-')
      setQuotationPrefix(s.quotationPrefix ?? 'ZS-Q-')
      setNextNumber(String(s.invoiceStartNumber ?? 1).padStart(4, '0'))
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
    setBrandSaving(true)
    try {
      await saveBranding({ ...brandForm })
      setBrandSaved(true)
      setTimeout(() => setBrandSaved(false), 2000)
    } catch (err) {
      console.error('Failed to save branding:', err)
    } finally {
      setBrandSaving(false)
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

  // ── GST save
  const handleSaveGst = async () => {
    setGstSaving(true)
    try {
      await saveGstSettings({
        gstEnabled,
        invoicePrefix,
        quotationPrefix,
        invoiceStartNumber: Number(nextNumber.replace(/^0+/, '') || '1'),
      })
      setGstSaved(true)
      setTimeout(() => setGstSaved(false), 2000)
    } catch (err) {
      console.error('Failed to save GST settings:', err)
    } finally {
      setGstSaving(false)
    }
  }

  // ── Deactivate user
  const handleDeactivateConfirm = async () => {
    if (!deactivateUid) return
    setDeactivateLoading(true)
    try {
      await deactivateUser(deactivateUid)
    } catch (err) {
      console.error('Failed to deactivate user:', err)
    } finally {
      setDeactivateLoading(false)
      setDeactivateUid(null)
    }
  }

  // ── Theme toggle (only if switching)
  const handleThemeCard = useCallback((t: 'dark' | 'light') => {
    if (t !== theme) toggleTheme()
  }, [theme, toggleTheme])

  const deactivatingUser = users.find(u => u.uid === deactivateUid)

  return (
    <div style={{
      maxWidth: '1100px', margin: '0 auto', padding: '24px',
      display: 'flex', gap: '20px', alignItems: 'start',
      fontFamily: 'var(--font-inter)', color: 'var(--color-foreground)',
    }}>

      {/* ── Left nav */}
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

      {/* ── Content panel */}
      <div style={{ flex: 1, minWidth: 0 }}>

        {/* ═══════════════════════════════════════
            A — STUDIO BRANDING
        ═══════════════════════════════════════ */}
        {page === 'Studio branding' && (
          <div style={{
            background: 'var(--color-surface)', border: '0.5px solid var(--color-border)',
            borderRadius: '12px', padding: '24px',
            display: 'flex', flexDirection: 'column', gap: '20px',
          }}>
            {/* Logo section */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '16px',
              borderBottom: '0.5px solid var(--color-border)', paddingBottom: '20px',
            }}>
              <div style={{
                width: '64px', height: '64px', borderRadius: '16px', flexShrink: 0,
                background: 'linear-gradient(135deg,var(--color-primary) 0%,#8b3a72 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {settings?.logoUrl
                  ? <img src={settings.logoUrl} alt="Logo" style={{ width: '100%', height: '100%', borderRadius: '16px', objectFit: 'contain' }} />
                  : <i className="ti ti-aperture" style={{ fontSize: '36px', color: '#ffffff' }} />
                }
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ fontSize: 'var(--text-lg)', fontWeight: 600 }}>Studio logo</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>
                  Used on quotations, invoices and payslips · PNG or SVG, min 240px
                </div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                  <Button variant="outline" className="h-8 text-xs">Upload</Button>
                  <Button variant="ghost"   className="h-8 text-xs">Remove</Button>
                </div>
              </div>
            </div>

            {/* 8 branding fields — 2-col grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              {BRAND_FIELDS.map(f => (
                <div key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>{f.label}</label>
                  <Input
                    value={brandForm[f.key]}
                    onChange={e => setBrandForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                    className="h-9"
                  />
                </div>
              ))}
            </div>

            {/* Default T&C */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>Default terms &amp; conditions</label>
              <textarea
                rows={3}
                value={brandForm.defaultTerms}
                onChange={e => setBrandForm(prev => ({ ...prev, defaultTerms: e.target.value }))}
                style={{
                  fontFamily: 'var(--font-inter)',
                  background: 'var(--color-surface-raised)',
                  border: '0.5px solid var(--color-border)',
                  borderRadius: '8px', padding: '10px 12px',
                  fontSize: 'var(--text-sm)', color: 'var(--color-foreground)',
                  outline: 'none', resize: 'vertical', lineHeight: 1.5,
                  width: '100%', boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Save */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '0.5px solid var(--color-border)', paddingTop: '16px' }}>
              <Button className="h-9 font-medium" onClick={handleSaveBranding} disabled={brandSaving}>
                {brandSaving ? 'Saving…' : brandSaved ? 'Saved ✓' : 'Save changes'}
              </Button>
            </div>
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

            {packages.map(p => {
              const colour = PKG_COLOURS[p.name] ?? { bg: 'var(--color-surface-raised)', fg: 'var(--color-foreground-muted)' }
              return (
                <div
                  key={p.id}
                  style={{
                    background: 'var(--color-surface)', border: '0.5px solid var(--color-border)',
                    borderRadius: '12px', padding: '16px 20px',
                    display: 'flex', alignItems: 'center', gap: '16px',
                    transition: 'border-color 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--color-border-strong)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--color-border)')}
                >
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

                  {/* Name + description */}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <div style={{ fontSize: 'var(--text-base)', fontWeight: 600 }}>{p.name}</div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>{p.items}</div>
                  </div>

                  {/* Price */}
                  <div style={{ fontSize: 'var(--text-lg)', fontWeight: 700 }}>
                    ₹{p.price.toLocaleString('en-IN')}
                  </div>

                  {/* Edit */}
                  <span
                    onClick={() => { setEditPkg(p); setShowPkgModal(true) }}
                    style={{ fontSize: 'var(--text-xs)', color: 'var(--color-accent)', cursor: 'pointer', fontWeight: 500 }}
                  >
                    Edit
                  </span>
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
            C — GST & NUMBERING
        ═══════════════════════════════════════ */}
        {page === 'GST & numbering' && (
          <div style={{
            background: 'var(--color-surface)', border: '0.5px solid var(--color-border)',
            borderRadius: '12px', padding: '24px',
            display: 'flex', flexDirection: 'column', gap: '18px',
          }}>
            {/* GST toggle row */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              borderBottom: '0.5px solid var(--color-border)', paddingBottom: '16px',
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <div style={{ fontSize: 'var(--text-base)', fontWeight: 600 }}>Charge GST on documents</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>
                  CGST 9% + SGST 9% added to quotations and invoices
                </div>
              </div>
              <Switch checked={gstEnabled} onCheckedChange={setGstEnabled} />
            </div>

            {/* 3-col grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px' }}>
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
              <Button className="h-9 font-medium" onClick={() => setShowCreateUser(true)}>
                + Create user
              </Button>
            </div>

            <div style={{
              background: 'var(--color-surface)', border: '0.5px solid var(--color-border)',
              borderRadius: '12px', overflow: 'hidden',
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
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

                      {/* DEACTIVATE */}
                      <td style={{ padding: '0 16px', height: '48px', borderBottom: '0.5px solid var(--color-border)', textAlign: 'right' }}>
                        {u.isActive && (
                          <span
                            onClick={() => setDeactivateUid(u.uid)}
                            style={{ fontSize: 'var(--text-xs)', color: 'var(--color-danger)', cursor: 'pointer', fontWeight: 500 }}
                          >
                            Deactivate
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════
            E — THEME
        ═══════════════════════════════════════ */}
        {page === 'Theme' && (
          <div style={{
            background: 'var(--color-surface)', border: '0.5px solid var(--color-border)',
            borderRadius: '12px', padding: '24px',
            display: 'flex', flexDirection: 'column', gap: '18px',
          }}>
            {/* Header */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <div style={{ fontSize: 'var(--text-base)', fontWeight: 600 }}>Appearance</div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>
                Dark is the studio default — built for editing rooms. Toggle from the sidebar anytime.
              </div>
            </div>

            {/* Theme cards — 2-col grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>

              {/* DARK card — intentional #000000 hardcode: it's a preview of the dark bg */}
              <div
                onClick={() => handleThemeCard('dark')}
                style={{
                  border: theme === 'dark' ? '2px solid var(--color-primary)' : '0.5px solid var(--color-border)',
                  borderRadius: '12px', padding: '14px',
                  display: 'flex', flexDirection: 'column', gap: '10px',
                  cursor: 'pointer', background: '#000000',
                  transition: 'border-color 0.15s',
                }}
              >
                <div style={{
                  height: '52px', borderRadius: '8px', background: '#181d19',
                  border: '0.5px solid #2a302b',
                  display: 'flex', alignItems: 'center', gap: '6px', padding: '0 10px',
                }}>
                  <span style={{ width: '22px', height: '22px', borderRadius: '6px', background: '#c6539f', flexShrink: 0 }} />
                  <span style={{ flex: 1, height: '6px', borderRadius: '3px', background: '#2a302b' }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="ti ti-moon" style={{ fontSize: '15px', color: '#c6539f' }} />
                  <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: '#f3f2e7' }}>Dark · default</span>
                </div>
              </div>

              {/* LIGHT card — intentional #ffffff hardcode: preview of light bg */}
              <div
                onClick={() => handleThemeCard('light')}
                style={{
                  border: theme === 'light' ? '2px solid var(--color-primary)' : '0.5px solid var(--color-border)',
                  borderRadius: '12px', padding: '14px',
                  display: 'flex', flexDirection: 'column', gap: '10px',
                  cursor: 'pointer', background: '#ffffff',
                  transition: 'border-color 0.15s',
                }}
              >
                <div style={{
                  height: '52px', borderRadius: '8px', background: '#efefeb',
                  border: '0.5px solid #d8d8d0',
                  display: 'flex', alignItems: 'center', gap: '6px', padding: '0 10px',
                }}>
                  <span style={{ width: '22px', height: '22px', borderRadius: '6px', background: '#c6539f', flexShrink: 0 }} />
                  <span style={{ flex: 1, height: '6px', borderRadius: '3px', background: '#d8d8d0' }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="ti ti-sun" style={{ fontSize: '15px', color: '#c6539f' }} />
                  <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: '#151810' }}>Light</span>
                </div>
              </div>
            </div>

            {/* Brand palette swatches */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '0.5px solid var(--color-border)', paddingTop: '16px' }}>
              <div style={{
                fontSize: 'var(--text-xs)', fontWeight: 600, textTransform: 'uppercase',
                letterSpacing: '0.04em', color: 'var(--color-foreground-subtle)',
              }}>
                Brand palette
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {SWATCHES.map(s => (
                  <div key={s} style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center' }}>
                    <div style={{
                      width: '44px', height: '44px', borderRadius: '10px',
                      background: s, border: '0.5px solid var(--color-border)',
                    }} />
                    <span style={{ fontSize: '9px', color: 'var(--color-foreground-subtle)', fontVariantNumeric: 'tabular-nums' }}>
                      {s}
                    </span>
                  </div>
                ))}
              </div>
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

      {showCreateUser && (
        <CreateUserModal onClose={() => setShowCreateUser(false)} />
      )}

      <ConfirmModal
        open={!!deactivateUid}
        title="Deactivate user?"
        description={`${deactivatingUser?.name ?? 'This user'} will lose access to Studio Zoom. You can reactivate them later from the Staff page.`}
        confirmLabel="Deactivate"
        onConfirm={handleDeactivateConfirm}
        onCancel={() => setDeactivateUid(null)}
        loading={deactivateLoading}
      />
    </div>
  )
}

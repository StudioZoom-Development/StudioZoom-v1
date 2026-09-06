'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/shared/Badge'
import { ConfirmModal } from '@/components/shared/ConfirmModal'
import { getLeadById, createLead, updateLead, softDeleteLead } from '@/lib/firebase/queries/leads'
import { useAuthStore } from '@/store/authStore'
import { Lead } from '@/types'
import { PhoneNumberInput, parsePhoneNumber } from './PhoneNumberInput'
import { DateField } from './DateField'
import { PackageSelector, parsePackageName, getDefaultPrice } from './PackageSelector'

const SELECT_STYLE: React.CSSProperties = {
  fontFamily: 'var(--font-inter)',
  height: '36px',
  width: '100%',
  background: 'var(--color-surface-raised)',
  border: '0.5px solid var(--color-border)',
  borderRadius: '8px',
  padding: '0 10px',
  fontSize: 'var(--text-sm)',
  color: 'var(--color-foreground)',
  outline: 'none',
  cursor: 'pointer',
}

interface LeadFormProps {
  mode: 'create' | 'edit'
  leadId?: string
}

export function LeadForm({ mode, leadId }: LeadFormProps) {
  const router = useRouter()
  const appUser = useAuthStore(s => s.appUser)

  const [loading, setLoading] = useState(mode === 'edit')
  const [saving, setSaving] = useState(false)
  const [dropping, setDropping] = useState(false)
  const [confirmDropOpen, setConfirmDropOpen] = useState(false)

  // Form Fields
  const [name, setName] = useState('')
  const [contact, setContact] = useState('')
  const [eventType, setEventType] = useState('Wedding')
  const [customEventType, setCustomEventType] = useState('')
  const [source, setSource] = useState('Walk-in')
  const [sourceDetail, setSourceDetail] = useState('')
  const [tentativeDate, setTentativeDate] = useState('')
  const [interestedPackage, setInterestedPackage] = useState('Gold')
  const [packageAmount, setPackageAmount] = useState<number>(280000)
  const [notes, setNotes] = useState('')

  // Validation Error states
  const [phoneError, setPhoneError] = useState<string | undefined>()
  const [packageError, setPackageError] = useState<string | undefined>()

  // Load existing lead data in edit mode
  useEffect(() => {
    if (mode === 'edit' && leadId) {
      getLeadById(leadId).then(lead => {
        if (lead) {
          setName(lead.name || '')
          setContact(lead.contact || '')
          setNotes(lead.notes || '')
          setTentativeDate(lead.tentativeDate || '')
          const rawPkg = lead.interestedPackage || ''
          const normPkg = parsePackageName(rawPkg)
          setInterestedPackage(normPkg)
          setPackageAmount(
            lead.packageAmount !== undefined && lead.packageAmount !== null
              ? lead.packageAmount
              : (lead.budget || getDefaultPrice(normPkg))
          )

          // Parse Event Type without prefix duplication
          const rawEventType = lead.eventType || 'Wedding'
          if (['Wedding', 'Prewedding', 'Engagement', 'Birthday'].includes(rawEventType)) {
            setEventType(rawEventType)
            setCustomEventType('')
          } else {
            setEventType('Other')
            setCustomEventType(rawEventType.replace(/^(Other)\s*[—–-]?\s*/i, ''))
          }

          // Parse Source without prefix duplication (e.g. "Other — Shalin")
          const rawSource = lead.source || 'Walk-in'
          if (rawSource.startsWith('Referral')) {
            setSource('Referral')
            setSourceDetail(rawSource.replace(/^Referral\s*[—–-]?\s*/i, ''))
          } else if (rawSource.startsWith('Other')) {
            setSource('Other')
            setSourceDetail(rawSource.replace(/^Other\s*[—–-]?\s*/i, ''))
          } else if (['Walk-in', 'Online'].includes(rawSource)) {
            setSource(rawSource)
            setSourceDetail('')
          } else {
            setSource('Other')
            setSourceDetail(rawSource)
          }
        }
        setLoading(false)
      })
    }
  }, [mode, leadId])

  // Handle Event Type Change & Conditional Reset
  const handleEventTypeChange = (val: string) => {
    setEventType(val)
    if (val !== 'Other') {
      setCustomEventType('')
    }
  }

  // Handle Source Change & Conditional Reset
  const handleSourceChange = (val: string) => {
    setSource(val)
    if (val !== 'Referral' && val !== 'Other') {
      setSourceDetail('')
    }
  }

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (saving || !name.trim()) return

    // Contact validation check
    let hasError = false
    if (contact) {
      const parsed = parsePhoneNumber(contact)
      if (parsed.number.length > 0 && parsed.number.length < 10) {
        setPhoneError('Enter a valid 10-digit mobile number')
        hasError = true
      } else {
        setPhoneError(undefined)
      }
    }

    if (interestedPackage === 'Other' && (!packageAmount || Number(packageAmount) <= 0)) {
      setPackageError('Enter a valid package amount for Other')
      hasError = true
    } else {
      setPackageError(undefined)
    }

    if (hasError) return

    setSaving(true)

    // Build clean values without accumulating duplicate prefixes
    const eventDetailClean = customEventType.replace(/^(Other)\s*[—–-]?\s*/i, '').trim()
    const finalEventType = eventType === 'Other' ? (eventDetailClean ? `Other — ${eventDetailClean}` : 'Other') : eventType

    const srcDetailClean = sourceDetail.replace(/^(Other|Referral)\s*[—–-]?\s*/i, '').trim()
    let finalSource = source
    if (source === 'Referral' || source === 'Other') {
      finalSource = srcDetailClean ? `${source} — ${srcDetailClean}` : source
    }

    const payload: Partial<Lead> = {
      name: name.trim(),
      contact: contact.trim(),
      eventType: finalEventType,
      source: finalSource,
      tentativeDate: tentativeDate.trim(),
      interestedPackage: interestedPackage.trim(),
      packageAmount: Number(packageAmount) || 0,
      budget: Number(packageAmount) || 0,
      notes: notes.trim(),
      status: 'inquiry',
    }

    try {
      if (mode === 'edit' && leadId) {
        await updateLead(leadId, payload)
      } else {
        await createLead(payload, appUser?.uid)
      }
      router.push('/leads')
    } catch (err) {
      console.error('Failed to save lead:', err)
      setSaving(false)
    }
  }

  const handleConfirmDrop = async () => {
    setDropping(true)
    try {
      if (mode === 'edit' && leadId && appUser?.uid) {
        await softDeleteLead(leadId, appUser.uid)
      }
      setConfirmDropOpen(false)
      router.push('/leads')
    } catch (err) {
      console.error('Failed to drop lead:', err)
    } finally {
      setDropping(false)
    }
  }

  if (loading) {
    return (
      <div style={{ color: 'var(--color-foreground-muted)', padding: '40px', textAlign: 'center', fontFamily: 'var(--font-inter)' }}>
        Loading lead details...
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '640px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px', fontFamily: 'var(--font-inter)' }}>
      {/* ── Page Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span
          onClick={() => router.push('/leads')}
          style={{ cursor: 'pointer', color: 'var(--color-foreground-muted)', display: 'flex' }}
        >
          <i className="ti ti-arrow-left" style={{ fontSize: '20px' }} />
        </span>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {/* Dynamic heading: Lead name in edit mode, "New Lead" in create mode */}
          <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
            {mode === 'edit' ? (name || 'Lead Details') : 'New Lead'}
          </div>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-foreground-muted)' }}>
            Inquiry · no advance yet — not a project
          </div>
        </div>

        <Badge variant="inquiry" />
      </div>

      {/* ── Details Form Container ── */}
      <form
        onSubmit={handleSubmit}
        style={{
          background: 'var(--color-surface)',
          border: '0.5px solid var(--color-border)',
          borderRadius: '12px',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          {/* Full name */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>Full name</label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Janani Krishnan"
              required
            />
          </div>

          {/* Contact */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>Contact</label>
            <PhoneNumberInput
              value={contact}
              onChange={val => {
                setContact(val)
                setPhoneError(undefined)
              }}
              error={phoneError}
            />
          </div>

          {/* Event type */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>Event type</label>
            <select
              value={eventType}
              onChange={e => handleEventTypeChange(e.target.value)}
              style={SELECT_STYLE}
            >
              <option value="Wedding">Wedding</option>
              <option value="Prewedding">Prewedding</option>
              <option value="Engagement">Engagement</option>
              <option value="Birthday">Birthday</option>
              <option value="Other">Other</option>
            </select>

            {eventType === 'Other' && (
              <Input
                value={customEventType}
                onChange={e => setCustomEventType(e.target.value)}
                placeholder="Specify custom event type"
                style={{ marginTop: '4px' }}
              />
            )}
          </div>

          {/* Source */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>Source</label>
            <select
              value={source}
              onChange={e => handleSourceChange(e.target.value)}
              style={SELECT_STYLE}
            >
              <option value="Walk-in">Walk-in</option>
              <option value="Online">Online</option>
              <option value="Referral">Referral</option>
              <option value="Other">Other</option>
            </select>

            {(source === 'Referral' || source === 'Other') && (
              <Input
                value={sourceDetail}
                onChange={e => setSourceDetail(e.target.value)}
                placeholder="Referral / source details"
                style={{ marginTop: '4px' }}
              />
            )}
          </div>

          {/* Tentative date */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>Tentative date</label>
            <DateField
              value={tentativeDate}
              onChange={setTentativeDate}

            />
          </div>

          {/* Interested Package selector */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>Interested package</label>
            <PackageSelector
              packageName={interestedPackage}
              packageAmount={packageAmount}
              onChange={(pkgName, amount) => {
                setInterestedPackage(pkgName)
                setPackageAmount(amount)
                setPackageError(undefined)
              }}
              error={packageError}
            />
          </div>
        </div>

        {/* Enquiry notes */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>Enquiry notes</label>
          <textarea
            rows={3}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Wedding details, candid mix, budget details..."
            style={{
              fontFamily: 'var(--font-inter)',
              background: 'var(--color-surface-raised)',
              border: '0.5px solid var(--color-border)',
              borderRadius: '8px',
              padding: '10px 12px',
              fontSize: 'var(--text-sm)',
              color: 'var(--color-foreground)',
              outline: 'none',
              resize: 'vertical',
              lineHeight: '1.5',
            }}
          />
        </div>

        {/* Action bar */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderTop: '0.5px solid var(--color-border)',
            paddingTop: '14px',
          }}
        >
          {/* BUG 2 FIX: Triggers ConfirmModal */}
          <span
            onClick={() => setConfirmDropOpen(true)}
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--color-danger)',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            Drop lead
          </span>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            {/* BUG 3 & BUG 4 FIX: Disabled lock on saving */}
            <Button
              type="submit"
              variant="outline"
              className="h-9"
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save'}
            </Button>

            {/* Convert to booking button */}
            <span
              onClick={() => {
                if (leadId) {
                  router.push(`/clients/new?leadId=${leadId}`)
                }
              }}
              style={{
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                color: '#ffffff',
                cursor: leadId ? 'pointer' : 'default',
                padding: '0 16px',
                height: '36px',
                borderRadius: '8px',
                background: 'var(--color-primary)',
                whiteSpace: 'nowrap',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                userSelect: 'none',
                opacity: leadId ? 1 : 0.6,
                transition: 'opacity 0.15s ease',
              }}
            >
              Convert to booking →
            </span>
          </div>
        </div>
      </form>

      {/* BUG 2 FIX: Confirmation dialog before dropping a lead */}
      <ConfirmModal
        open={confirmDropOpen}
        title={`Drop ${name ? `"${name}"` : 'this lead'}?`}
        description="Are you sure you want to drop this lead inquiry? This action cannot be undone."
        confirmLabel="Drop lead"
        onConfirm={handleConfirmDrop}
        onCancel={() => setConfirmDropOpen(false)}
        loading={dropping}
      />
    </div>
  )
}

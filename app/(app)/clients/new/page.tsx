'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuthStore } from '@/store/authStore'
import { createBooking } from '@/lib/firebase/queries/clients'
import { subscribeToPackageConfig, PackageTemplate } from '@/lib/firebase/queries/settings'

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

export default function NewBookingPage() {
  const router = useRouter()
  const appUser = useAuthStore(s => s.appUser)

  const [packages, setPackages] = useState<PackageTemplate[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Form State
  const [eventName, setEventName] = useState('')
  const [eventType, setEventType] = useState('wedding')
  const [eventDate, setEventDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [location, setLocation] = useState('')

  const [clientName, setClientName] = useState('')
  const [contact, setContact] = useState('')
  const [email, setEmail] = useState('')

  const [selectedPackageId, setSelectedPackageId] = useState('')
  const [packageType, setPackageType] = useState('Platinum')
  const [totalAmount, setTotalAmount] = useState('450000')
  const [advanceAmount, setAdvanceAmount] = useState('150000')
  const [advanceDate, setAdvanceDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [paymentMethod, setPaymentMethod] = useState<'gpay' | 'cash' | 'bankTransfer' | 'cheque'>('gpay')

  useEffect(() => {
    const unsub = subscribeToPackageConfig(config => {
      if (config?.packages?.length) {
        setPackages(config.packages)
      }
    })
    return () => unsub()
  }, [])

  const handlePackageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value
    setSelectedPackageId(val)

    if (val === 'custom') {
      setPackageType('Custom')
      return
    }

    const pkg = packages.find(p => p.id === val)
    if (pkg) {
      setPackageType(pkg.name)
      setTotalAmount(String(pkg.price))
    }
  }

  const validateBaseFields = (): boolean => {
    if (!eventName.trim()) {
      setError('Please enter an event name')
      return false
    }
    if (!clientName.trim()) {
      setError('Please enter client full name')
      return false
    }
    if (!contact.trim()) {
      setError('Please enter a contact number')
      return false
    }
    return true
  }

  const handleSaveAsLead = async () => {
    if (!validateBaseFields()) return

    setSaving(true)
    setError('')

    try {
      const tot = parseFloat(totalAmount) || 0
      const newId = await createBooking({
        eventName: eventName.trim(),
        eventType,
        eventDate: new Date(eventDate),
        location: location.trim(),
        clientName: clientName.trim(),
        contact: contact.trim(),
        email: email.trim(),
        packageType,
        totalAmount: tot,
        advanceAmount: 0,
        advanceDate: new Date(),
        paymentMethod: 'gpay',
        status: 'inquiry',
        createdBy: appUser?.uid || 'system',
      })

      router.push(`/clients/${newId}`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save lead'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  const handleCreateBooking = async () => {
    if (!validateBaseFields()) return

    const adv = parseFloat(advanceAmount)
    if (isNaN(adv) || adv <= 0) {
      setError('Booking requires an advance payment greater than ₹0. Use "Save as lead" if no payment collected yet.')
      return
    }

    setSaving(true)
    setError('')

    try {
      const tot = parseFloat(totalAmount) || 0
      const newId = await createBooking({
        eventName: eventName.trim(),
        eventType,
        eventDate: new Date(eventDate),
        location: location.trim(),
        clientName: clientName.trim(),
        contact: contact.trim(),
        email: email.trim(),
        packageType,
        totalAmount: tot,
        advanceAmount: adv,
        advanceDate: new Date(advanceDate),
        paymentMethod,
        status: 'booked',
        createdBy: appUser?.uid || 'system',
      })

      router.push(`/clients/${newId}`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create booking'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      maxWidth: '640px',
      margin: '0 auto',
      paddingBottom: '32px',
      fontFamily: 'var(--font-inter)',
      display: 'flex',
      flexDirection: 'column',
      gap: '16px'
    }}>
      {/* HEADER */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span
          onClick={() => router.push('/clients')}
          style={{ cursor: 'pointer', color: 'var(--color-foreground-muted)', display: 'flex', alignItems: 'center' }}
        >
          <i className="ti ti-arrow-left" style={{ fontSize: '20px' }} />
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
            New booking
          </div>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-foreground-muted)' }}>
            Creates the client, event, and payment record in one step
          </div>
        </div>
      </div>

      {/* CARD */}
      <div style={{
        background: 'var(--color-surface)',
        border: '0.5px solid var(--color-border)',
        borderRadius: '12px',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px'
      }}>
        {error && (
          <div style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--color-danger)',
            background: 'var(--color-danger-muted)',
            borderRadius: '8px',
            padding: '10px 14px'
          }}>
            {error}
          </div>
        )}

        {/* SECTION 1: EVENT */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{
            fontSize: 'var(--text-xs)',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: 'var(--color-foreground-subtle)'
          }}>
            1 · Event
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>Event name</label>
            <Input
              placeholder="e.g. Karthik weds Priya"
              value={eventName}
              onChange={e => setEventName(e.target.value)}
              className="h-9"
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>Event type</label>
              <select
                style={SELECT_STYLE}
                value={eventType}
                onChange={e => setEventType(e.target.value)}
              >
                <option value="wedding">Wedding</option>
                <option value="preWedding">Pre-Wedding</option>
                <option value="engagement">Engagement</option>
                <option value="corporate">Corporate</option>
                <option value="portrait">Portrait</option>
                <option value="studio">Studio</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>Event date</label>
              <Input
                type="date"
                value={eventDate}
                onChange={e => setEventDate(e.target.value)}
                className="h-9"
              />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>Location</label>
            <Input
              placeholder="Venue, city"
              value={location}
              onChange={e => setLocation(e.target.value)}
              className="h-9"
            />
          </div>
        </div>

        {/* SECTION 2: CLIENT */}
        <div style={{
          borderTop: '0.5px solid var(--color-border)',
          paddingTop: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          <div style={{
            fontSize: 'var(--text-xs)',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: 'var(--color-foreground-subtle)'
          }}>
            2 · Client
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>Full name</label>
            <Input
              placeholder="Client full name"
              value={clientName}
              onChange={e => setClientName(e.target.value)}
              className="h-9"
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {/* Contact with fused +91 prefix */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>Contact</label>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <span style={{
                  height: '36px',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0 10px',
                  background: 'var(--color-surface-overlay)',
                  border: '0.5px solid var(--color-border)',
                  borderRight: 'none',
                  borderRadius: '8px 0 0 8px',
                  fontSize: 'var(--text-sm)',
                  color: 'var(--color-foreground-muted)'
                }}>
                  +91
                </span>
                <input
                  placeholder="98400 12345"
                  value={contact.replace(/^\+91/, '')}
                  onChange={e => setContact(e.target.value)}
                  style={{
                    fontFamily: 'var(--font-inter)',
                    flex: 1,
                    height: '36px',
                    background: 'var(--color-surface-raised)',
                    border: '0.5px solid var(--color-border)',
                    borderRadius: '0 8px 8px 0',
                    padding: '0 12px',
                    fontSize: 'var(--text-sm)',
                    color: 'var(--color-foreground)',
                    outline: 'none'
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>Email</label>
              <Input
                type="email"
                placeholder="name@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="h-9"
              />
            </div>
          </div>
        </div>

        {/* SECTION 3: PACKAGE & ADVANCE */}
        <div style={{
          borderTop: '0.5px solid var(--color-border)',
          paddingTop: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          <div style={{
            fontSize: 'var(--text-xs)',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: 'var(--color-foreground-subtle)'
          }}>
            3 · Package &amp; advance
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>Package</label>
              <select
                style={SELECT_STYLE}
                value={selectedPackageId}
                onChange={handlePackageChange}
              >
                <option value="">Select package</option>
                {packages.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} · ₹{p.price.toLocaleString('en-IN')}
                  </option>
                ))}
                <option value="custom">Custom</option>
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>Total amount</label>
              <Input
                type="number"
                placeholder="0"
                value={totalAmount}
                onChange={e => setTotalAmount(e.target.value)}
                className="h-9"
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>Advance paid</label>
              <Input
                type="number"
                placeholder="0"
                value={advanceAmount}
                onChange={e => setAdvanceAmount(e.target.value)}
                className="h-9"
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>Advance date</label>
              <Input
                type="date"
                value={advanceDate}
                onChange={e => setAdvanceDate(e.target.value)}
                className="h-9"
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>Method</label>
              <select
                style={SELECT_STYLE}
                value={paymentMethod}
                onChange={e => setPaymentMethod(e.target.value as 'gpay' | 'cash' | 'bankTransfer' | 'cheque')}
              >
                <option value="gpay">GPay</option>
                <option value="cash">Cash</option>
                <option value="bankTransfer">Bank Transfer</option>
                <option value="cheque">Cheque</option>
              </select>
            </div>
          </div>

          {/* WARNING BOX */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'var(--color-secondary-muted)',
            borderRadius: '8px',
            padding: '10px 12px'
          }}>
            <i className="ti ti-alert-triangle" style={{ fontSize: '16px', color: 'var(--color-secondary)', flexShrink: 0 }} />
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>
              Booking requires an advance greater than ₹0. Use &quot;Save as lead&quot; if no payment collected yet.
            </span>
          </div>
        </div>

        {/* FOOTER */}
        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '10px',
          borderTop: '0.5px solid var(--color-border)',
          paddingTop: '16px'
        }}>
          <Button
            variant="outline"
            className="h-9"
            onClick={handleSaveAsLead}
            disabled={saving}
          >
            Save as lead
          </Button>
          <Button
            className="h-9 font-medium"
            onClick={handleCreateBooking}
            disabled={saving}
          >
            {saving ? 'Creating…' : 'Create booking'}
          </Button>
        </div>
      </div>
    </div>
  )
}

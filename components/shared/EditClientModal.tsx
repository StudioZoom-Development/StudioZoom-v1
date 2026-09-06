'use client'

import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Client, EventType, BookingType } from '@/types'
import { updateClient } from '@/lib/firebase/queries/clients'
import { useAuthStore } from '@/store/authStore'

interface EditClientModalProps {
  open: boolean
  client: Client | null
  onClose: () => void
  onSuccess?: () => void
}

const EVENT_TYPES: Array<{ value: EventType; label: string }> = [
  { value: 'wedding', label: 'Wedding' },
  { value: 'reception', label: 'Reception' },
  { value: 'preWedding', label: 'Pre-Wedding' },
  { value: 'engagement', label: 'Engagement' },
  { value: 'birthday', label: 'Birthday' },
  { value: 'babyShower', label: 'Baby Shower' },
  { value: 'puberty', label: 'Puberty' },
  { value: 'corporate', label: 'Corporate' },
  { value: 'schoolEvent', label: 'School Event' },
  { value: 'portrait', label: 'Portrait' },
  { value: 'studio', label: 'Studio' },
  { value: 'other', label: 'Other' },
]

export function EditClientModal({ open, client, onClose, onSuccess }: EditClientModalProps) {
  const appUser = useAuthStore(s => s.appUser)

  const [name, setName] = useState('')
  const [contact, setContact] = useState('')
  const [email, setEmail] = useState('')
  const [eventName, setEventName] = useState('')
  const [eventType, setEventType] = useState<EventType>('wedding')
  const [customEventType, setCustomEventType] = useState('')
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('18:00')
  const [location, setLocation] = useState('')
  const [notes, setNotes] = useState('')
  const [packageType, setPackageType] = useState('')
  const [totalAmount, setTotalAmount] = useState('')
  const [status, setStatus] = useState<'booked' | 'inquiry'>('booked')
  const [bookingType, setBookingType] = useState<BookingType>('oneTime')
  const [eventDate, setEventDate] = useState('')
  const [eventDates, setEventDates] = useState<Array<{ id: string; label: string; date: string; location: string; startTime?: string; endTime?: string }>>([])

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!client) return
    setName(client.name || '')
    setContact(client.contact ? client.contact.replace(/^\+91/, '') : '')
    setEmail(client.email || '')
    setEventName(client.eventName || '')
    setEventType(client.eventType || 'wedding')
    setCustomEventType(client.customEventType || '')
    setStartTime(client.startTime || '09:00')
    setEndTime(client.endTime || '18:00')
    setLocation(client.location || '')
    setNotes(client.notes || '')
    setPackageType(client.packageType || '')
    setTotalAmount(client.totalAmount ? String(client.totalAmount) : '')
    setStatus(client.status || 'booked')
    setBookingType(client.bookingType || 'oneTime')
    setEventDate(client.eventDate ? format(new Date(client.eventDate), 'yyyy-MM-dd') : '')

    if (client.eventDates && client.eventDates.length > 0) {
      setEventDates(
        client.eventDates.map(ed => ({
          id: ed.id || Math.random().toString(36).substring(2, 9),
          label: ed.label || '',
          date: ed.date ? format(new Date(ed.date), 'yyyy-MM-dd') : '',
          location: ed.location || '',
          startTime: ed.startTime || '09:00',
          endTime: ed.endTime || '18:00',
        }))
      )
    } else {
      setEventDates([])
    }
    setError('')
  }, [client, open])

  if (!open || !client) return null

  const handleAddDate = () => {
    setEventDates(prev => [
      ...prev,
      {
        id: Math.random().toString(36).substring(2, 9),
        label: `Day ${prev.length + 1}`,
        date: eventDate || format(new Date(), 'yyyy-MM-dd'),
        location: location || '',
        startTime: '09:00',
        endTime: '18:00',
      },
    ])
  }

  const handleRemoveDate = (id: string) => {
    setEventDates(prev => prev.filter(d => d.id !== id))
  }

  const handleUpdateDate = (id: string, field: 'label' | 'date' | 'location' | 'startTime' | 'endTime', value: string) => {
    setEventDates(prev =>
      prev.map(d => (d.id === id ? { ...d, [field]: value } : d))
    )
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError('Client name is required')
      return
    }
    if (!contact.trim()) {
      setError('Contact number is required')
      return
    }
    if (!eventName.trim()) {
      setError('Event name is required')
      return
    }
    if (eventType === 'other' && !customEventType.trim()) {
      setError('Please specify other event type')
      return
    }

    setSaving(true)
    setError('')

    try {
      const parsedTotal = parseFloat(totalAmount) || 0
      const primaryEventDate = bookingType === 'multiDate' && eventDates.length > 0
        ? new Date(eventDates[0].date)
        : new Date(eventDate || new Date())

      await updateClient(
        client.clientId,
        {
          name,
          contact,
          email,
          eventName,
          eventType,
          customEventType: eventType === 'other' ? customEventType.trim() : '',
          startTime,
          endTime,
          location,
          notes,
          packageType,
          totalAmount: parsedTotal,
          status,
          bookingType,
          eventDate: primaryEventDate,
          eventDates: bookingType === 'multiDate' ? eventDates : [],
        },
        appUser?.uid || 'system'
      )

      if (onSuccess) onSuccess()
      onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update client'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--font-inter)',
        padding: '20px',
        overflowY: 'auto',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '720px',
          maxHeight: '90vh',
          background: 'var(--color-surface-overlay)',
          border: '0.5px solid var(--color-border)',
          borderRadius: '16px',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 50px rgba(0,0,0,0.4)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 24px',
          borderBottom: '0.5px solid var(--color-border)',
        }}>
          <div style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--color-foreground)' }}>
            Edit Client & Booking
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-foreground-muted)',
              cursor: 'pointer',
              fontSize: '18px',
            }}
          >
            <i className="ti ti-x" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSave} style={{ overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {error && (
            <div style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--color-danger)',
              background: 'var(--color-danger-muted)',
              borderRadius: '8px',
              padding: '8px 12px',
            }}>
              {error}
            </div>
          )}

          {/* Section: Client Details */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, textTransform: 'uppercase', color: 'var(--color-foreground-subtle)' }}>
              Client Information
            </span>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)', fontWeight: 500 }}>Name *</label>
                <Input value={name} onChange={e => setName(e.target.value)} className="h-9 mt-1" placeholder="Client Name" />
              </div>
              <div>
                <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)', fontWeight: 500 }}>Contact (+91) *</label>
                <Input value={contact} onChange={e => setContact(e.target.value)} className="h-9 mt-1" placeholder="9840012345" />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)', fontWeight: 500 }}>Email</label>
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)} className="h-9 mt-1" placeholder="client@example.com" />
              </div>
            </div>
          </div>

          {/* Section: Event Details */}
          <div style={{ borderTop: '0.5px solid var(--color-border)', paddingTop: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, textTransform: 'uppercase', color: 'var(--color-foreground-subtle)' }}>
              Event Details
            </span>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)', fontWeight: 500 }}>Event Name *</label>
                <Input value={eventName} onChange={e => setEventName(e.target.value)} className="h-9 mt-1" placeholder="e.g. Wedding Reception" />
              </div>
              <div>
                <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)', fontWeight: 500 }}>Event Type</label>
                <select
                  value={eventType}
                  onChange={e => setEventType(e.target.value as EventType)}
                  style={{
                    fontFamily: 'var(--font-inter)',
                    height: '36px',
                    width: '100%',
                    background: 'var(--color-surface-raised)',
                    border: '0.5px solid var(--color-border)',
                    borderRadius: '8px',
                    padding: '0 10px',
                    fontSize: 'var(--text-sm)',
                    color: 'var(--color-foreground)',
                    marginTop: '4px',
                    outline: 'none',
                    cursor: 'pointer',
                  }}
                >
                  {EVENT_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              {eventType === 'other' && (
                <div style={{ gridColumn: 'span 2' }}>
                  <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)', fontWeight: 500 }}>Specify Other Event Type *</label>
                  <Input value={customEventType} onChange={e => setCustomEventType(e.target.value)} className="h-9 mt-1" placeholder="e.g. Housewarming, Naming ceremony…" />
                </div>
              )}

              <div>
                <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)', fontWeight: 500 }}>Booking Format</label>
                <select
                  value={bookingType}
                  onChange={e => setBookingType(e.target.value as BookingType)}
                  style={{
                    fontFamily: 'var(--font-inter)',
                    height: '36px',
                    width: '100%',
                    background: 'var(--color-surface-raised)',
                    border: '0.5px solid var(--color-border)',
                    borderRadius: '8px',
                    padding: '0 10px',
                    fontSize: 'var(--text-sm)',
                    color: 'var(--color-foreground)',
                    marginTop: '4px',
                    outline: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <option value="oneTime">Single Day Event</option>
                  <option value="multiDate">Multi-Date Event</option>
                  <option value="recurring">Recurring Schedule</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)', fontWeight: 500 }}>Location</label>
                <Input value={location} onChange={e => setLocation(e.target.value)} className="h-9 mt-1" placeholder="City or Venue" />
              </div>
            </div>

            {/* Date & Timings Fields */}
            {bookingType === 'oneTime' ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)', fontWeight: 500 }}>Event Date</label>
                  <Input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} className="h-9 mt-1" />
                </div>
                <div>
                  <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)', fontWeight: 500 }}>Start Time</label>
                  <Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="h-9 mt-1" />
                </div>
                <div>
                  <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)', fontWeight: 500 }}>End Time</label>
                  <Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="h-9 mt-1" />
                </div>
              </div>
            ) : bookingType === 'multiDate' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)', fontWeight: 500 }}>
                    Event Dates & Schedule ({eventDates.length})
                  </label>
                  <button
                    type="button"
                    onClick={handleAddDate}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--color-primary)',
                      fontSize: 'var(--text-xs)',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <i className="ti ti-plus" /> Add Date
                  </button>
                </div>

                {eventDates.map((ed, idx) => (
                  <div
                    key={ed.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1.2fr 130px 96px 96px 1fr 32px',
                      gap: '8px',
                      alignItems: 'center',
                      background: 'var(--color-surface-raised)',
                      padding: '8px',
                      borderRadius: '8px',
                      border: '0.5px solid var(--color-border)',
                    }}
                  >
                    <Input
                      value={ed.label}
                      onChange={e => handleUpdateDate(ed.id, 'label', e.target.value)}
                      placeholder={`Event ${idx + 1}`}
                      className="h-8 text-xs"
                    />
                    <Input
                      type="date"
                      value={ed.date}
                      onChange={e => handleUpdateDate(ed.id, 'date', e.target.value)}
                      className="h-8 text-xs"
                    />
                    <Input
                      type="time"
                      value={ed.startTime || '09:00'}
                      onChange={e => handleUpdateDate(ed.id, 'startTime', e.target.value)}
                      className="h-8 text-xs"
                    />
                    <Input
                      type="time"
                      value={ed.endTime || '18:00'}
                      onChange={e => handleUpdateDate(ed.id, 'endTime', e.target.value)}
                      className="h-8 text-xs"
                    />
                    <Input
                      value={ed.location}
                      onChange={e => handleUpdateDate(ed.id, 'location', e.target.value)}
                      placeholder="Venue"
                      className="h-8 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveDate(ed.id)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--color-danger)',
                        cursor: 'pointer',
                        padding: '4px',
                      }}
                    >
                      <i className="ti ti-trash" style={{ fontSize: '15px' }} />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          {/* Section: Package & Status */}
          <div style={{ borderTop: '0.5px solid var(--color-border)', paddingTop: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, textTransform: 'uppercase', color: 'var(--color-foreground-subtle)' }}>
              Package & Commercials
            </span>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)', fontWeight: 500 }}>Package Name</label>
                <Input value={packageType} onChange={e => setPackageType(e.target.value)} className="h-9 mt-1" placeholder="e.g. Platinum" />
              </div>
              <div>
                <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)', fontWeight: 500 }}>Total Amount (₹)</label>
                <Input type="number" value={totalAmount} onChange={e => setTotalAmount(e.target.value)} className="h-9 mt-1" placeholder="0" />
              </div>
              <div>
                <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)', fontWeight: 500 }}>Status</label>
                <select
                  value={status}
                  onChange={e => setStatus(e.target.value as 'booked' | 'inquiry')}
                  style={{
                    fontFamily: 'var(--font-inter)',
                    height: '36px',
                    width: '100%',
                    background: 'var(--color-surface-raised)',
                    border: '0.5px solid var(--color-border)',
                    borderRadius: '8px',
                    padding: '0 10px',
                    fontSize: 'var(--text-sm)',
                    color: 'var(--color-foreground)',
                    marginTop: '4px',
                    outline: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <option value="booked">Booked</option>
                  <option value="inquiry">Inquiry / Lead</option>
                </select>
              </div>
            </div>
          </div>

          {/* Section: Notes */}
          <div style={{ borderTop: '0.5px solid var(--color-border)', paddingTop: '14px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)', fontWeight: 500 }}>Notes & Instructions</label>
            <textarea
              rows={3}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Add client requirements, shot preferences, or notes..."
              style={{
                fontFamily: 'var(--font-inter)',
                width: '100%',
                background: 'var(--color-surface-raised)',
                border: '0.5px solid var(--color-border)',
                borderRadius: '8px',
                padding: '8px 12px',
                fontSize: 'var(--text-sm)',
                color: 'var(--color-foreground)',
                outline: 'none',
                resize: 'vertical',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Footer Buttons */}
          <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px',
            borderTop: '0.5px solid var(--color-border)',
            paddingTop: '16px',
            marginTop: '8px',
          }}>
            <Button
              type="button"
              variant="outline"
              className="h-9"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="h-9 font-medium"
              disabled={saving}
            >
              {saving ? 'Saving changes…' : 'Save changes'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

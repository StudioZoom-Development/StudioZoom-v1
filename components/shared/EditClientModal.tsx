'use client'

import { useState, useMemo } from 'react'
import { format, addMonths } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DateField } from '@/components/shared/DateField'
import { TimeField } from '@/components/shared/TimeField'
import { Client, EventType, BookingType } from '@/types'
import { updateClient } from '@/lib/firebase/queries/clients'
import { computeRecurringSessionDates } from '@/lib/utils/dates'
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
  if (!open || !client) return null

  return (
    <EditClientModalInner
      key={client.clientId || 'edit-client-modal'}
      client={client}
      onClose={onClose}
      onSuccess={onSuccess}
    />
  )
}

function EditClientModalInner({
  client,
  onClose,
  onSuccess,
}: {
  client: Client
  onClose: () => void
  onSuccess?: () => void
}) {
  const appUser = useAuthStore(s => s.appUser)

  const [name, setName] = useState(client.name || '')
  const [contact, setContact] = useState(client.contact ? client.contact.replace(/^\+91/, '') : '')
  const [email, setEmail] = useState(client.email || '')
  const [eventName, setEventName] = useState(client.eventName || '')
  const [eventType, setEventType] = useState<EventType>(client.eventType || 'wedding')
  const [customEventType, setCustomEventType] = useState(client.customEventType || '')
  const [startTime, setStartTime] = useState(client.startTime || '09:00')
  const [endTime, setEndTime] = useState(client.endTime || '18:00')
  const [location, setLocation] = useState(client.location || '')
  const [notes, setNotes] = useState(client.notes || '')
  const [packageType, setPackageType] = useState(client.packageType || '')
  const [totalAmount, setTotalAmount] = useState(client.totalAmount ? String(client.totalAmount) : '')
  const [status, setStatus] = useState<'booked' | 'inquiry'>(client.status || 'booked')
  const [bookingType, setBookingType] = useState<BookingType>(client.bookingType || 'oneTime')
  const [eventDate, setEventDate] = useState(client.eventDate ? format(new Date(client.eventDate), 'yyyy-MM-dd') : '')
  const [eventDates, setEventDates] = useState<Array<{ id: string; label: string; date: string; location: string; startTime?: string; endTime?: string }>>(() => {
    if (client.eventDates && client.eventDates.length > 0) {
      return client.eventDates.map(ed => ({
        id: ed.id || Math.random().toString(36).substring(2, 9),
        label: ed.label || '',
        date: ed.date ? format(new Date(ed.date), 'yyyy-MM-dd') : '',
        location: ed.location || '',
        startTime: ed.startTime || '09:00',
        endTime: ed.endTime || '18:00',
      }))
    }
    return []
  })

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Recurring Schedule State
  const [frequency, setFrequency] = useState<'weekly' | 'biweekly' | 'monthly'>(
    client.recurringSchedule?.frequency || 'weekly'
  )
  const [recurringStartDate, setRecurringStartDate] = useState<string>(() => {
    if (client.recurringSchedule?.startDate) {
      return format(new Date(client.recurringSchedule.startDate), 'yyyy-MM-dd')
    }
    if (client.eventDate) {
      return format(new Date(client.eventDate), 'yyyy-MM-dd')
    }
    return format(new Date(), 'yyyy-MM-dd')
  })
  const [recurringEndDate, setRecurringEndDate] = useState<string>(() => {
    if (client.recurringSchedule?.endDate) {
      return format(new Date(client.recurringSchedule.endDate), 'yyyy-MM-dd')
    }
    return format(addMonths(new Date(), 3), 'yyyy-MM-dd')
  })
  const [totalSessions, setTotalSessions] = useState<number>(
    client.recurringSchedule?.totalSessions || 12
  )
  const [sessionStartTime, setSessionStartTime] = useState<string>(
    client.recurringSchedule?.sessionStartTime || client.startTime || '09:00'
  )
  const [sessionEndTime, setSessionEndTime] = useState<string>(
    client.recurringSchedule?.sessionEndTime || client.endTime || '18:00'
  )
  const [perSessionRate, setPerSessionRate] = useState<string>(
    client.recurringSchedule?.perSessionRate ? String(client.recurringSchedule.perSessionRate) : ''
  )
  const [paymentType, setPaymentType] = useState<'perSession' | 'custom'>(
    client.recurringSchedule?.paymentType || 'perSession'
  )

  const recurringPreviewSessions = useMemo(() => {
    if (bookingType !== 'recurring') return []
    return computeRecurringSessionDates(
      frequency,
      recurringStartDate,
      totalSessions,
      sessionStartTime,
      sessionEndTime
    )
  }, [bookingType, frequency, recurringStartDate, totalSessions, sessionStartTime, sessionEndTime])

  const handleBookingTypeChange = (newType: BookingType) => {
    setBookingType(newType)
    if (newType === 'multiDate' && eventDates.length === 0) {
      setEventDates([
        {
          id: Math.random().toString(36).substring(2, 9),
          label: 'Day 1',
          date: eventDate || format(new Date(), 'yyyy-MM-dd'),
          location: location || '',
          startTime: startTime || '09:00',
          endTime: endTime || '18:00',
        },
      ])
    }
  }

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
        : bookingType === 'recurring' && recurringStartDate
        ? new Date(recurringStartDate)
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
          startTime: bookingType === 'recurring' ? sessionStartTime : startTime,
          endTime: bookingType === 'recurring' ? sessionEndTime : endTime,
          location,
          notes,
          packageType,
          totalAmount: parsedTotal,
          status,
          bookingType,
          eventDate: primaryEventDate,
          eventDates: bookingType === 'multiDate' ? eventDates : [],
          recurringSchedule: bookingType === 'recurring' ? {
            frequency,
            startDate: new Date(recurringStartDate),
            endDate: new Date(recurringEndDate),
            totalSessions: Number(totalSessions) || 1,
            perSessionRate: parseFloat(perSessionRate) || 0,
            paymentType,
            sessionStartTime,
            sessionEndTime,
          } : undefined,
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
          maxWidth: '820px',
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
                  onChange={e => handleBookingTypeChange(e.target.value as BookingType)}
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
                  <DateField value={eventDate} onChange={val => setEventDate(val)} className="h-9 mt-1" />
                </div>
                <div>
                  <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)', fontWeight: 500 }}>Start Time</label>
                  <TimeField value={startTime} onChange={val => setStartTime(val)} className="h-9 mt-1" />
                </div>
                <div>
                  <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)', fontWeight: 500 }}>End Time</label>
                  <TimeField value={endTime} onChange={val => setEndTime(val)} className="h-9 mt-1" align="right" />
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

                {eventDates.length > 0 && (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1.1fr 140px 115px 115px 1fr 32px',
                    gap: '8px',
                    padding: '0 8px',
                    fontSize: '11px',
                    fontWeight: 600,
                    color: 'var(--color-foreground-subtle)',
                  }}>
                    <span>LABEL</span>
                    <span>DATE</span>
                    <span>START</span>
                    <span>END</span>
                    <span>VENUE / LOCATION</span>
                    <span></span>
                  </div>
                )}

                {eventDates.map((ed, idx) => (
                  <div
                    key={ed.id}
                    style={{
                      position: 'relative',
                      zIndex: eventDates.length - idx + 10,
                      display: 'grid',
                      gridTemplateColumns: '1.1fr 140px 115px 115px 1fr 32px',
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
                    <DateField
                      value={ed.date}
                      onChange={val => handleUpdateDate(ed.id, 'date', val)}
                      className="h-8 text-xs"
                    />
                    <TimeField
                      value={ed.startTime || '09:00'}
                      onChange={val => handleUpdateDate(ed.id, 'startTime', val)}
                      className="h-8 text-xs"
                    />
                    <TimeField
                      value={ed.endTime || '18:00'}
                      onChange={val => handleUpdateDate(ed.id, 'endTime', val)}
                      className="h-8 text-xs"
                      align="right"
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
            ) : bookingType === 'recurring' ? (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                background: 'var(--color-surface-raised)',
                padding: '14px',
                borderRadius: '10px',
                border: '0.5px solid var(--color-border)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <i className="ti ti-repeat" style={{ fontSize: '16px', color: 'var(--color-primary)' }} />
                  <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, textTransform: 'uppercase', color: 'var(--color-foreground)' }}>
                    Recurring Schedule &amp; Timings
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)', fontWeight: 500 }}>Frequency</label>
                    <select
                      value={frequency}
                      onChange={e => setFrequency(e.target.value as 'weekly' | 'biweekly' | 'monthly')}
                      style={{
                        height: '36px',
                        width: '100%',
                        background: 'var(--color-surface)',
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
                      <option value="weekly">Weekly</option>
                      <option value="biweekly">Bi-weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)', fontWeight: 500 }}>Start Date</label>
                    <DateField value={recurringStartDate} onChange={val => setRecurringStartDate(val)} className="h-9 mt-1" />
                  </div>

                  <div>
                    <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)', fontWeight: 500 }}>End Date</label>
                    <DateField value={recurringEndDate} onChange={val => setRecurringEndDate(val)} className="h-9 mt-1" align="right" />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)', fontWeight: 500 }}>Total Sessions</label>
                    <Input
                      type="number"
                      min="1"
                      placeholder="12"
                      value={totalSessions > 0 ? String(totalSessions) : ''}
                      onChange={e => setTotalSessions(parseInt(e.target.value) || 0)}
                      className="h-9 mt-1"
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)', fontWeight: 500 }}>Session Start Time</label>
                    <TimeField value={sessionStartTime} onChange={val => setSessionStartTime(val)} className="h-9 mt-1" />
                  </div>

                  <div>
                    <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)', fontWeight: 500 }}>Session End Time</label>
                    <TimeField value={sessionEndTime} onChange={val => setSessionEndTime(val)} className="h-9 mt-1" align="right" />
                  </div>
                </div>

                {/* Per Session Rate & Payment Type */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)', fontWeight: 500 }}>Per-Session Rate (₹)</label>
                    <Input
                      type="number"
                      min="0"
                      placeholder="e.g. 5000"
                      value={perSessionRate}
                      onChange={e => {
                        setPerSessionRate(e.target.value)
                        const rate = parseFloat(e.target.value) || 0
                        if (paymentType === 'perSession' && rate > 0) {
                          setTotalAmount(String(rate * (totalSessions || 1)))
                        }
                      }}
                      className="h-9 mt-1"
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)', fontWeight: 500 }}>Payment Type</label>
                    <select
                      value={paymentType}
                      onChange={e => setPaymentType(e.target.value as 'perSession' | 'custom')}
                      style={{
                        height: '36px',
                        width: '100%',
                        background: 'var(--color-surface)',
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
                      <option value="perSession">Per Session Billing</option>
                      <option value="custom">Fixed Contract Amount</option>
                    </select>
                  </div>
                </div>

                {/* Scheduled Sessions Preview */}
                {recurringPreviewSessions.length > 0 && (
                  <div style={{
                    marginTop: '4px',
                    padding: '10px 12px',
                    background: 'var(--color-surface)',
                    border: '0.5px solid var(--color-border)',
                    borderRadius: '8px',
                    maxHeight: '140px',
                    overflowY: 'auto',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-foreground-subtle)', textTransform: 'uppercase' }}>
                        Scheduled Sessions ({recurringPreviewSessions.length})
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--color-primary)', fontWeight: 600 }}>
                        {frequency === 'weekly' ? 'Every week' : frequency === 'biweekly' ? 'Every 2 weeks' : 'Every month'}
                      </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '6px' }}>
                      {recurringPreviewSessions.map(s => (
                        <div key={s.sessionNumber} style={{
                          padding: '6px 8px',
                          background: 'var(--color-surface-raised)',
                          borderRadius: '6px',
                          border: '0.5px solid var(--color-border)',
                          fontSize: 'var(--text-xs)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '2px',
                        }}>
                          <span style={{ fontWeight: 600, color: 'var(--color-foreground)' }}>
                            {s.label} · {s.displayDate}
                          </span>
                          <span style={{ color: 'var(--color-foreground-subtle)', fontSize: '10px' }}>
                            {s.dayOfWeek} · {s.startTime} - {s.endTime}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
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

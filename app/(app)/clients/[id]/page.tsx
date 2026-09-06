'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/shared/Badge'
import { useAuthStore } from '@/store/authStore'
import {
  getClientById,
  subscribeToPayments,
  recordPayment,
  softDeleteClient,
} from '@/lib/firebase/queries/clients'
import {
  getProjectById,
  getProjectByClientId,
  subscribeToProject,
  subscribeToProjectStaffAssignments,
  advanceProjectStage
} from '@/lib/firebase/queries/projects'
import { checkStageGate, GateResult } from '@/lib/utils/gates'
import { ConfirmModal } from '@/components/shared/ConfirmModal'
import { EditClientModal } from '@/components/shared/EditClientModal'
import { Skeleton } from '@/components/shared/LoadingSkeleton'
import type { Client, Project, ProjectStage, StaffAssignment, EventDateEntry } from '@/types'

interface PaymentItem {
  paymentId: string
  instalment: string
  amount: number
  date: Date
  method: string
  recordedBy: string
  recordedByName?: string
}

const STAGE_ORDER: ProjectStage[] = [
  'booked', 'planning', 'preProduction', 'eventDay', 'postProduction', 'delivered'
]

const STAGE_LABELS: Record<ProjectStage, string> = {
  booked: 'Booked',
  planning: 'Planning',
  preProduction: 'Pre-Prod',
  eventDay: 'Event Day',
  postProduction: 'Post-Prod',
  delivered: 'Delivered',
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  wedding: 'Wedding',
  reception: 'Reception',
  preWedding: 'Pre-Wedding',
  engagement: 'Engagement',
  birthday: 'Birthday',
  babyShower: 'Baby Shower',
  puberty: 'Puberty',
  corporate: 'Corporate',
  schoolEvent: 'School Event',
  portrait: 'Portrait',
  studio: 'Studio',
  other: 'Other',
}

const NEXT_STAGE_LABEL: Record<string, string> = {
  booked: 'Planning',
  planning: 'Pre-Prod',
  preProduction: 'Event Day',
  eventDay: 'Post-Prod',
  postProduction: 'Delivered',
  delivered: 'Delivered',
}

function getInitials(name: string): string {
  if (!name) return 'SP'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function ClientDetailSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Back button + top row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Skeleton width="80px" height="32px" radius="8px" />
          <Skeleton width="220px" height="28px" radius="6px" />
          <Skeleton width="75px" height="22px" radius="12px" />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Skeleton width="90px" height="36px" radius="8px" />
          <Skeleton width="130px" height="36px" radius="8px" />
        </div>
      </div>

      {/* Stage Tracker bar */}
      <div style={{
        background: 'var(--color-surface)',
        border: '0.5px solid var(--color-border)',
        borderRadius: '12px',
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '8px',
      }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
            <Skeleton width="22px" height="22px" radius="50%" />
            <Skeleton width="60px" height="14px" radius="4px" />
            {i < 5 && <div style={{ flex: 1, height: '2px', background: 'var(--color-border)', margin: '0 4px' }} />}
          </div>
        ))}
      </div>

      {/* 4 Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{
            background: 'var(--color-surface)',
            border: '0.5px solid var(--color-border)',
            borderRadius: '12px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}>
            <Skeleton width="70px" height="12px" radius="4px" />
            <Skeleton width="110px" height="22px" radius="6px" />
          </div>
        ))}
      </div>

      {/* Main Grid: Left cards (2) + Right card (1) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{
            background: 'var(--color-surface)',
            border: '0.5px solid var(--color-border)',
            borderRadius: '12px',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}>
            <Skeleton width="120px" height="18px" radius="4px" />
            <Skeleton width="100%" height="14px" radius="4px" />
            <Skeleton width="90%" height="14px" radius="4px" />
            <Skeleton width="75%" height="14px" radius="4px" />
          </div>
          <div style={{
            background: 'var(--color-surface)',
            border: '0.5px solid var(--color-border)',
            borderRadius: '12px',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}>
            <Skeleton width="140px" height="18px" radius="4px" />
            <Skeleton width="100%" height="14px" radius="4px" />
            <Skeleton width="80%" height="14px" radius="4px" />
          </div>
        </div>

        <div style={{
          background: 'var(--color-surface)',
          border: '0.5px solid var(--color-border)',
          borderRadius: '12px',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}>
          <Skeleton width="160px" height="18px" radius="4px" />
          <Skeleton width="100%" height="55px" radius="8px" />
          <Skeleton width="100%" height="55px" radius="8px" />
          <Skeleton width="100%" height="55px" radius="8px" />
        </div>
      </div>
    </div>
  )
}

export default function ClientDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params?.id as string
  const appUser = useAuthStore(s => s.appUser)

  const [client, setClient] = useState<Client | null>(null)
  const [project, setProject] = useState<Project | null>(null)
  const [payments, setPayments] = useState<PaymentItem[]>([])
  const [assignments, setAssignments] = useState<StaffAssignment[]>([])
  const [gate, setGate] = useState<GateResult | null>(null)
  const [tab, setTab] = useState<'Overview' | 'Timeline' | 'Documents'>('Overview')
  const [loading, setLoading] = useState(true)

  // Record payment modal state
  const [recordPaymentOpen, setRecordPaymentOpen] = useState(false)
  const [instalment, setInstalment] = useState<'1st' | '2nd' | '3rd'>('2nd')
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentDate, setPaymentDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'gpay' | 'bankTransfer' | 'cheque'>('gpay')
  const [submittingPayment, setSubmittingPayment] = useState(false)
  const [paymentError, setPaymentError] = useState('')
  const [advancingStage, setAdvancingStage] = useState(false)

  // Edit and Delete modal state
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!id) return

    let isMounted = true

    async function loadData() {
      try {
        const c = await getClientById(id)
        if (!isMounted) return

        if (c) {
          setClient(c)
          setLoading(false)

          // Fetch project and gates in background non-blockingly
          const projId = c.projectId
          if (projId) {
            getProjectById(projId).then(p => {
              if (isMounted && p) {
                setProject(p)
                checkStageGate(p.projectId, p.stage).then(g => {
                  if (isMounted) setGate(g)
                })
              }
            })
          } else {
            getProjectByClientId(c.clientId).then(p => {
              if (isMounted && p) {
                setProject(p)
                checkStageGate(p.projectId, p.stage).then(g => {
                  if (isMounted) setGate(g)
                })
              }
            })
          }
        } else {
          // Check if id is a projectId
          const p = await getProjectById(id)
          if (isMounted && p) {
            setProject(p)
            checkStageGate(p.projectId, p.stage).then(g => {
              if (isMounted) setGate(g)
            })
            if (p.clientId) {
              const clientDoc = await getClientById(p.clientId)
              if (isMounted) {
                setClient(clientDoc)
                setLoading(false)
              }
            } else {
              setLoading(false)
            }
          } else {
            setLoading(false)
          }
        }
      } catch (err) {
        console.error('Failed to load client details:', err)
        if (isMounted) setLoading(false)
      }
    }

    loadData()

    return () => {
      isMounted = false
    }
  }, [id])

  // Real-time Payments
  useEffect(() => {
    if (!client?.clientId) return

    const unsubPayments = subscribeToPayments(client.clientId, data => {
      setPayments(data)
    })

    return () => {
      unsubPayments()
    }
  }, [client?.clientId])

  // Real-time listener for project if project exists
  useEffect(() => {
    if (!project?.projectId) return

    const unsubProj = subscribeToProject(project.projectId, p => {
      if (p) {
        setProject(p)
        checkStageGate(p.projectId, p.stage).then(setGate)
      }
    })

    const unsubStaff = subscribeToProjectStaffAssignments(project.projectId, list => {
      setAssignments(list)
    })

    return () => {
      unsubProj()
      unsubStaff()
    }
  }, [project?.projectId])

  if (loading) {
    return <ClientDetailSkeleton />
  }

  if (!client) {
    return (
      <div style={{
        color: 'var(--color-foreground-muted)',
        padding: '60px',
        textAlign: 'center',
        fontFamily: 'var(--font-inter)'
      }}>
        <i className="ti ti-alert-triangle" style={{ fontSize: '32px', marginBottom: '12px', display: 'inline-block', color: 'var(--color-danger)' }} />
        <div>Client not found.</div>
        <Button variant="outline" className="mt-4" onClick={() => router.push('/clients')}>
          Back to Clients
        </Button>
      </div>
    )
  }

  const currentStage: ProjectStage = project?.stage || (client.status === 'booked' ? 'booked' : 'booked')
  const currentStageIdx = STAGE_ORDER.indexOf(currentStage)

  const advancePaid = payments.reduce((acc, p) => acc + p.amount, 0)
  const totalAmount = client.totalAmount || 0
  const balanceDue = Math.max(0, totalAmount - advancePaid)
  const percentCollected = totalAmount > 0 ? Math.min(100, Math.round((advancePaid / totalAmount) * 100)) : 0

  const handleRecordPaymentSubmit = async () => {
    const amt = parseFloat(paymentAmount)
    if (isNaN(amt) || amt <= 0) {
      setPaymentError('Please enter a valid payment amount')
      return
    }

    setSubmittingPayment(true)
    setPaymentError('')

    try {
      await recordPayment(
        client.clientId,
        {
          instalment,
          amount: amt,
          date: new Date(paymentDate),
          method: paymentMethod,
        },
        appUser?.uid || 'system',
        appUser?.name || 'Staff'
      )

      // Refresh client data
      const updatedClient = await getClientById(client.clientId)
      if (updatedClient) setClient(updatedClient)

      setRecordPaymentOpen(false)
      setPaymentAmount('')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to record payment'
      setPaymentError(msg)
    } finally {
      setSubmittingPayment(false)
    }
  }

  const handleAdvanceStage = async () => {
    if (!project || !gate?.canAdvance) return

    setAdvancingStage(true)
    try {
      const next = await advanceProjectStage(project.projectId, project.stage)
      setProject(prev => prev ? { ...prev, stage: next } : null)
      const updatedGate = await checkStageGate(project.projectId, next)
      setGate(updatedGate)
    } catch (err) {
      console.error('Error advancing stage:', err)
    } finally {
      setAdvancingStage(false)
    }
  }

  const handleDeleteClient = async () => {
    if (!client || !appUser) return
    setDeleting(true)
    try {
      await softDeleteClient(client.clientId, appUser.uid)
      router.push('/clients')
    } catch (err) {
      console.error('Failed to delete client:', err)
      setDeleting(false)
    }
  }

  const handleEditSuccess = async () => {
    const updated = await getClientById(client.clientId)
    if (updated) setClient(updated)
    if (project?.projectId) {
      const p = await getProjectById(project.projectId)
      if (p) setProject(p)
    }
  }

  const teamChips = assignments.map(a => {
    const displayName = a.staffName || a.staffUid
    return {
      uid: a.assignmentId,
      name: displayName,
      role: a.role ? a.role.charAt(0).toUpperCase() + a.role.slice(1) : 'Crew',
      initials: getInitials(displayName)
    }
  })

  const pendingGateCount = gate?.reasons.length || 0
  const eventTypeDisplay = client.eventType === 'other' && client.customEventType
    ? `Other (${client.customEventType})`
    : EVENT_TYPE_LABELS[client.eventType] || client.eventType || 'Event'

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
      fontFamily: 'var(--font-inter)',
      maxWidth: '1280px',
      margin: '0 auto',
      paddingBottom: '32px'
    }}>
      {/* HEADER */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span
            onClick={() => router.push('/clients')}
            style={{ cursor: 'pointer', color: 'var(--color-foreground-muted)', display: 'flex', alignItems: 'center' }}
          >
            <i className="ti ti-arrow-left" style={{ fontSize: '20px' }} />
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
                {client.eventName}
              </span>
              {client.bookingType === 'multiDate' && client.eventDates && client.eventDates.length > 0 && (
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '20px',
                  background: 'var(--color-accent-muted)',
                  color: 'var(--color-accent)',
                  border: '0.5px solid var(--color-accent)',
                }}>
                  <i className="ti ti-calendar-event" style={{ fontSize: '13px' }} />
                  {client.eventDates.length} Days
                </span>
              )}
              {client.bookingType === 'recurring' && client.recurringSchedule && (
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '20px',
                  background: 'var(--color-purple-muted)',
                  color: 'var(--color-purple)',
                  border: '0.5px solid var(--color-purple)',
                }}>
                  <i className="ti ti-repeat" style={{ fontSize: '13px' }} />
                  {client.recurringSchedule.frequency} · {client.recurringSchedule.totalSessions} Sessions
                </span>
              )}
            </div>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-foreground-muted)' }}>
              {eventTypeDisplay}
              {client.bookingType === 'multiDate' && client.eventDates && client.eventDates.length > 0
                ? ` · Multi-Date (${client.eventDates.length} Events) · ${format(new Date(client.eventDates[0].date), 'd MMM yyyy')} – ${format(new Date(client.eventDates[client.eventDates.length - 1].date), 'd MMM yyyy')}`
                : ` · ${format(client.eventDate, 'd MMM yyyy')}${client.startTime ? ` (${client.startTime} – ${client.endTime || ''})` : ''}`}
              {client.location ? ` · ${client.location}` : ''}
            </div>
          </div>

          {/* Stage badge */}
          <div style={{ marginLeft: '4px' }}>
            <Badge variant={currentStage} />
          </div>
        </div>

        {/* Action Buttons: Edit & Delete */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Button
            variant="outline"
            className="h-9 gap-1.5 text-xs font-medium"
            onClick={() => setEditOpen(true)}
          >
            <i className="ti ti-pencil" style={{ fontSize: '14px' }} />
            Edit
          </Button>

          <Button
            variant="outline"
            className="h-9 gap-1.5 text-xs font-medium"
            style={{ color: 'var(--color-danger)' }}
            onClick={() => setDeleteOpen(true)}
          >
            <i className="ti ti-trash" style={{ fontSize: '14px' }} />
            Delete
          </Button>
        </div>
      </div>

      {/* BODY GRID: 65% / 35% */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '65fr 35fr',
        gap: '16px',
        alignItems: 'start'
      }}>
        {/* LEFT PANEL: TAB CARD */}
        <div style={{
          background: 'var(--color-surface)',
          border: '0.5px solid var(--color-border)',
          borderRadius: '12px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}>
          {/* TAB BAR */}
          <div style={{
            display: 'flex',
            borderBottom: '0.5px solid var(--color-border)',
            padding: '0 12px'
          }}>
            {(['Overview', 'Timeline', 'Documents'] as const).map(t => (
              <div
                key={t}
                onClick={() => setTab(t)}
                style={{
                  padding: '12px 16px',
                  cursor: 'pointer',
                  fontSize: 'var(--text-sm)',
                  fontWeight: tab === t ? 600 : 500,
                  color: tab === t ? 'var(--color-primary)' : 'var(--color-foreground-muted)',
                  borderBottom: tab === t ? '2px solid var(--color-primary)' : '2px solid transparent',
                  transition: 'all 0.2s ease'
                }}
              >
                {t}
              </div>
            ))}
          </div>

          {/* TAB 1: OVERVIEW CONTENT */}
          {tab === 'Overview' && (
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* EVENT SECTION */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  color: 'var(--color-foreground-subtle)'
                }}>
                  {client.bookingType === 'multiDate' ? 'Event Schedule (Day by Day)' : 'Event Details'}
                </div>

                {/* MULTI-DATE EVENT CARDS (ONE BY ONE) */}
                {client.bookingType === 'multiDate' && client.eventDates && client.eventDates.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {client.eventDates.map((ed: EventDateEntry, idx: number) => {
                      const eventD = new Date(ed.date)
                      return (
                        <div
                          key={ed.id || idx}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '14px 16px',
                            borderRadius: '10px',
                            background: 'var(--color-surface-raised)',
                            border: '0.5px solid var(--color-border)',
                            gap: '16px',
                          }}
                        >
                          {/* Day Badge & Details */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: 1, minWidth: 0 }}>
                            <div style={{
                              width: '44px',
                              height: '44px',
                              borderRadius: '10px',
                              background: 'var(--color-accent-muted)',
                              color: 'var(--color-accent)',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 700,
                              fontSize: '10px',
                              lineHeight: 1.1,
                              border: '0.5px solid var(--color-border-strong)',
                              flexShrink: 0
                            }}>
                              <span>DAY</span>
                              <span style={{ fontSize: '15px' }}>{String(idx + 1).padStart(2, '0')}</span>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-foreground)' }}>
                                  {ed.label || `Event ${idx + 1}`}
                                </span>
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                  <i className="ti ti-calendar" style={{ fontSize: '14px', color: 'var(--color-primary)' }} />
                                  <strong style={{ color: 'var(--color-foreground)', fontWeight: 500 }}>
                                    {format(eventD, 'EEE, d MMM yyyy')}
                                  </strong>
                                </span>
                                {(ed.startTime || ed.endTime) && (
                                  <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    <i className="ti ti-clock" style={{ fontSize: '14px', color: 'var(--color-secondary)' }} />
                                    <span>{ed.startTime || '09:00'} – {ed.endTime || '18:00'}</span>
                                  </span>
                                )}
                                <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                  <i className="ti ti-map-pin" style={{ fontSize: '14px', color: 'var(--color-accent)' }} />
                                  <span>{ed.location || client.location || 'Venue TBA'}</span>
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : client.bookingType === 'recurring' && client.recurringSchedule ? (
                  /* RECURRING SCHEDULE CARD */
                  <div style={{
                    padding: '16px',
                    borderRadius: '10px',
                    background: 'var(--color-surface-raised)',
                    border: '0.5px solid var(--color-border)',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: '14px',
                  }}>
                    <div>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>Frequency</span>
                      <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, textTransform: 'capitalize' }}>
                        {client.recurringSchedule.frequency}
                      </div>
                    </div>
                    <div>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>Period</span>
                      <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>
                        {format(new Date(client.recurringSchedule.startDate), 'd MMM yyyy')} → {format(new Date(client.recurringSchedule.endDate), 'd MMM yyyy')}
                      </div>
                    </div>
                    <div>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>Total Sessions</span>
                      <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-primary)' }}>
                        {client.recurringSchedule.totalSessions} sessions
                      </div>
                    </div>
                    <div>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>Session Timing</span>
                      <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>
                        {client.recurringSchedule.sessionStartTime || '09:00'} – {client.recurringSchedule.sessionEndTime || '18:00'}
                      </div>
                    </div>
                  </div>
                ) : (
                  /* SINGLE EVENT 4-FIELD GRID */
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 24px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>Event name</span>
                      <span style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>{client.eventName}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>Type</span>
                      <span style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>
                        {eventTypeDisplay}
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>Date &amp; Timing</span>
                      <span style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>
                        {format(client.eventDate, 'd MMM yyyy')}
                        {client.startTime ? ` (${client.startTime} – ${client.endTime || ''})` : ''}
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>Location</span>
                      <span style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>{client.location || '—'}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* CLIENT SECTION */}
              <div style={{
                borderTop: '0.5px solid var(--color-border)',
                paddingTop: '16px',
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
                  Client
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 24px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>Client</span>
                    <span style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>{client.name}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>Contact</span>
                    <span style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>{client.contact}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', gridColumn: 'span 2' }}>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>Email</span>
                    <span style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>{client.email || '—'}</span>
                  </div>
                </div>
              </div>

              {/* TEAM SECTION */}
              <div style={{
                borderTop: '0.5px solid var(--color-border)',
                paddingTop: '16px',
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
                  Team
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {teamChips.length === 0 ? (
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)', fontStyle: 'italic' }}>
                      No team members assigned yet.
                    </div>
                  ) : (
                    teamChips.map(tm => (
                      <div
                        key={tm.uid}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          background: 'var(--color-surface-raised)',
                          border: '0.5px solid var(--color-border)',
                          borderRadius: '20px',
                          padding: '4px 12px 4px 4px'
                        }}
                      >
                        <div style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          background: 'var(--color-primary-muted)',
                          color: 'var(--color-primary)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '10px',
                          fontWeight: 700
                        }}>
                          {tm.initials}
                        </div>
                        <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600 }}>{tm.name}</span>
                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>{tm.role}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* NOTES SECTION */}
              <div style={{
                borderTop: '0.5px solid var(--color-border)',
                paddingTop: '16px',
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
                  Notes
                </div>
                {client.notes ? (
                  <div style={{
                    background: 'var(--color-surface-raised)',
                    border: '0.5px solid var(--color-border)',
                    borderRadius: '8px',
                    padding: '12px',
                    fontSize: 'var(--text-sm)',
                    color: 'var(--color-foreground-muted)',
                    lineHeight: 1.5,
                    whiteSpace: 'pre-wrap'
                  }}>
                    {client.notes}
                  </div>
                ) : (
                  <div style={{
                    fontSize: 'var(--text-xs)',
                    color: 'var(--color-foreground-subtle)',
                    fontStyle: 'italic'
                  }}>
                    No notes recorded for this booking.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB CONTENT: TIMELINE */}
          {tab === 'Timeline' && (
            <div style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {/* STAGE DOT ROW */}
              <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                {STAGE_ORDER.map((stg, i) => {
                  const done = i < currentStageIdx
                  const active = i === currentStageIdx

                  const dotBg = done ? 'var(--color-success-muted)' : active ? 'var(--color-primary-muted)' : 'var(--color-surface-raised)'
                  const dotBorder = done ? 'var(--color-success)' : active ? 'var(--color-primary)' : 'var(--color-border-strong)'
                  const iconName = done ? 'ti-check' : active ? 'ti-player-play' : 'ti-point'
                  const iconColor = done ? 'var(--color-success)' : active ? 'var(--color-primary)' : 'var(--color-foreground-subtle)'
                  const lineColor = i < currentStageIdx ? 'var(--color-success)' : 'var(--color-border-strong)'
                  const labelColor = done || active ? 'var(--color-foreground)' : 'var(--color-foreground-subtle)'
                  let dateText = '—'
                  if (done) {
                    if (stg === 'booked' && client.createdAt) {
                      dateText = `${format(client.createdAt, 'd MMM')} · Booked`
                    } else if (project?.milestones && (project.milestones as Record<string, Date>)[stg]) {
                      dateText = `${format((project.milestones as Record<string, Date>)[stg], 'd MMM')} · Done`
                    } else {
                      dateText = 'Completed'
                    }
                  } else if (active) {
                    dateText = 'In progress'
                  }

                  return (
                    <div
                      key={stg}
                      style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '8px',
                        position: 'relative'
                      }}
                    >
                      {/* Connector Line (except last item) */}
                      {i < STAGE_ORDER.length - 1 && (
                        <div style={{
                          position: 'absolute',
                          top: '11px',
                          left: '50%',
                          width: '100%',
                          height: '2px',
                          background: lineColor,
                          zIndex: 0
                        }} />
                      )}

                      {/* Dot */}
                      <div style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        background: dotBg,
                        border: `2px solid ${dotBorder}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        position: 'relative',
                        zIndex: 1
                      }}>
                        <i className={`ti ${iconName}`} style={{ fontSize: '12px', color: iconColor }} />
                      </div>

                      {/* Label + Date */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px' }}>
                        <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: labelColor }}>
                          {STAGE_LABELS[stg]}
                        </span>
                        <span style={{ fontSize: '10px', color: 'var(--color-foreground-subtle)' }}>
                          {dateText}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* ACTIVE STAGE NOTE */}
              <div style={{
                background: 'var(--color-primary-muted)',
                border: '0.5px solid var(--color-border)',
                borderRadius: '8px',
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}>
                <span style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: 'var(--color-primary)',
                  flexShrink: 0,
                  animation: 'szPulse 1.6s ease-in-out infinite'
                }} />
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-foreground)' }}>
                  <strong>{STAGE_LABELS[currentStage]}</strong> stage in progress
                  {gate && gate.reasons.length > 0
                    ? ` — ${gate.reasons.join(', ')}`
                    : ' — Ready to advance to next stage'}
                </span>
              </div>
            </div>
          )}

          {/* TAB CONTENT: DOCUMENTS */}
          {tab === 'Documents' && (
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {client.invoiceNumber ? (
                /* INVOICE DOC CARD */
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                  background: 'var(--color-surface-raised)',
                  border: '0.5px solid var(--color-border)',
                  borderRadius: '10px',
                  padding: '14px 16px'
                }}>
                  <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '10px',
                    background: 'var(--color-primary-muted)',
                    color: 'var(--color-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <i className="ti ti-receipt-tax" style={{ fontSize: '20px' }} />
                  </div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1px' }}>
                    <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>
                      Invoice {client.invoiceNumber}
                    </span>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>
                      {client.paymentStatus === 'paid' ? 'Fully paid' : client.paymentStatus === 'partial' ? 'Partially paid' : 'Unpaid'} · ₹{advancePaid.toLocaleString('en-IN')} of ₹{totalAmount.toLocaleString('en-IN')}
                    </span>
                  </div>
                  <button
                    onClick={() => router.push('/erp/invoices')}
                    style={{
                      cursor: 'pointer',
                      fontFamily: 'var(--font-inter)',
                      background: 'transparent',
                      border: '0.5px solid var(--color-border-strong)',
                      color: 'var(--color-foreground)',
                      borderRadius: '8px',
                      height: '30px',
                      padding: '0 12px',
                      fontSize: 'var(--text-xs)',
                      fontWeight: 500
                    }}
                  >
                    View
                  </button>
                </div>
              ) : (
                <div style={{
                  padding: '24px',
                  textAlign: 'center',
                  fontSize: 'var(--text-sm)',
                  color: 'var(--color-foreground-subtle)'
                }}>
                  No documents generated for this booking yet.
                </div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT PANEL: PAYMENT CARD & STAGE GATE CARD */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* PAYMENT CARD */}
          <div style={{
            background: 'var(--color-surface)',
            border: '0.5px solid var(--color-border)',
            borderRadius: '12px',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            {/* PACKAGE TOTAL */}
            <div style={{
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: 'var(--color-foreground-subtle)'
            }}>
              Package total
            </div>

            <div style={{ fontSize: 'var(--text-4xl)', fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1 }}>
              ₹{totalAmount.toLocaleString('en-IN')}
            </div>

            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)', marginTop: '-8px' }}>
              {client.packageType || 'Custom'} package · GST included
            </div>

            {/* PAID & BALANCE ROWS */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              borderTop: '0.5px solid var(--color-border)',
              paddingTop: '14px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)' }}>
                <span style={{ color: 'var(--color-foreground-muted)' }}>Advance paid</span>
                <span style={{ fontWeight: 600, color: 'var(--color-success)' }}>
                  ₹{advancePaid.toLocaleString('en-IN')}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)' }}>
                <span style={{ color: 'var(--color-foreground-muted)' }}>Balance due</span>
                <span style={{ fontWeight: 600, color: balanceDue > 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>
                  ₹{balanceDue.toLocaleString('en-IN')}
                </span>
              </div>
            </div>

            {/* PROGRESS BAR */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{
                height: '6px',
                borderRadius: '3px',
                background: 'var(--color-surface-raised)',
                overflow: 'hidden'
              }}>
                <div style={{
                  height: '100%',
                  borderRadius: '3px',
                  background: 'var(--color-success)',
                  width: `${percentCollected}%`,
                  transition: 'width 0.3s ease'
                }} />
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>
                {percentCollected}% collected {balanceDue > 0 ? `· Balance ₹${balanceDue.toLocaleString('en-IN')}` : '· Fully paid'}
              </div>
            </div>

            {/* PAYMENT HISTORY */}
            <div style={{
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: 'var(--color-foreground-subtle)',
              borderTop: '0.5px solid var(--color-border)',
              paddingTop: '14px'
            }}>
              Payment history
            </div>

            {payments.length === 0 ? (
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)', fontStyle: 'italic' }}>
                No payments recorded yet.
              </div>
            ) : (
              payments.map(p => (
                <div key={p.paymentId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                    <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>
                      ₹{p.amount.toLocaleString('en-IN')}
                    </span>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>
                      {format(p.date, 'd MMM yyyy')} · by {p.recordedByName || p.recordedBy}
                    </span>
                  </div>
                  <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-accent)' }}>
                    {p.method}
                  </span>
                </div>
              ))
            )}

            {/* RECORD PAYMENT BUTTON */}
            <Button
              className="h-11 w-full font-medium"
              onClick={() => setRecordPaymentOpen(true)}
            >
              Record payment
            </Button>
          </div>

          {/* STAGE GATE CARD */}
          <div style={{
            background: 'var(--color-surface)',
            border: '0.5px solid var(--color-border)',
            borderRadius: '12px',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px'
          }}>
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>Advance to next stage</div>

            {/* GATE ITEMS */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {gate?.canAdvance ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--text-sm)', color: 'var(--color-success)' }}>
                  <i className="ti ti-circle-check" style={{ fontSize: '16px', color: 'var(--color-success)' }} />
                  All requirements met for {STAGE_LABELS[currentStage]}
                </div>
              ) : (
                gate?.reasons.map((reason, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--text-sm)', color: 'var(--color-foreground-muted)' }}>
                    <i className="ti ti-circle" style={{ fontSize: '16px', color: 'var(--color-foreground-subtle)' }} />
                    {reason}
                  </div>
                ))
              )}
            </div>

            {/* ADVANCE BUTTON */}
            <button
              disabled={!gate?.canAdvance || advancingStage}
              onClick={handleAdvanceStage}
              style={{
                cursor: gate?.canAdvance && !advancingStage ? 'pointer' : 'default',
                fontFamily: 'var(--font-inter)',
                width: '100%',
                height: '40px',
                borderRadius: '8px',
                border: 'none',
                fontSize: 'var(--text-sm)',
                fontWeight: 600,
                background: gate?.canAdvance ? 'var(--color-primary)' : 'var(--color-surface-raised)',
                color: gate?.canAdvance ? '#ffffff' : 'var(--color-foreground-subtle)',
                transition: 'background 0.15s, opacity 0.15s',
                opacity: advancingStage ? 0.7 : 1,
              }}
            >
              {advancingStage
                ? 'Advancing…'
                : gate?.canAdvance
                ? `Advance to ${NEXT_STAGE_LABEL[currentStage]}`
                : `Advance to ${NEXT_STAGE_LABEL[currentStage]} · ${pendingGateCount} gate${pendingGateCount > 1 ? 's' : ''} pending`}
            </button>
          </div>
        </div>
      </div>

      {/* RECORD PAYMENT MODAL */}
      {recordPaymentOpen && (
        <div
          onClick={() => setRecordPaymentOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            background: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'var(--font-inter)',
            padding: '16px',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '420px',
              background: 'var(--color-surface-overlay)',
              border: '0.5px solid var(--color-border)',
              borderRadius: '12px',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--color-foreground)' }}>
                Record payment
              </div>
              <button
                type="button"
                onClick={() => setRecordPaymentOpen(false)}
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

            {paymentError && (
              <div style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--color-danger)',
                background: 'var(--color-danger-muted)',
                borderRadius: '8px',
                padding: '8px 12px'
              }}>
                {paymentError}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)', fontWeight: 500 }}>
                  Instalment
                </label>
                <select
                  value={instalment}
                  onChange={e => setInstalment(e.target.value as '1st' | '2nd' | '3rd')}
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
                    outline: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <option value="1st">1st Instalment</option>
                  <option value="2nd">2nd Instalment</option>
                  <option value="3rd">3rd Instalment</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)', fontWeight: 500 }}>
                  Amount
                </label>
                <Input
                  type="number"
                  placeholder="₹0"
                  value={paymentAmount}
                  onChange={e => setPaymentAmount(e.target.value)}
                  className="h-9"
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)', fontWeight: 500 }}>
                  Date
                </label>
                <Input
                  type="date"
                  value={paymentDate}
                  onChange={e => setPaymentDate(e.target.value)}
                  className="h-9"
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)', fontWeight: 500 }}>
                  Method
                </label>
                <select
                  value={paymentMethod}
                  onChange={e => setPaymentMethod(e.target.value as 'cash' | 'gpay' | 'bankTransfer' | 'cheque')}
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
                    outline: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <option value="gpay">GPay</option>
                  <option value="cash">Cash</option>
                  <option value="bankTransfer">Bank Transfer</option>
                  <option value="cheque">Cheque</option>
                </select>
              </div>
            </div>

            <div style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px',
              borderTop: '0.5px solid var(--color-border)',
              paddingTop: '16px',
              marginTop: '4px'
            }}>
              <Button
                variant="outline"
                className="h-9"
                onClick={() => setRecordPaymentOpen(false)}
              >
                Cancel
              </Button>
              <Button
                className="h-9 font-medium"
                onClick={handleRecordPaymentSubmit}
                disabled={submittingPayment}
              >
                {submittingPayment ? 'Recording…' : 'Record'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT CLIENT MODAL */}
      <EditClientModal
        open={editOpen}
        client={client}
        onClose={() => setEditOpen(false)}
        onSuccess={handleEditSuccess}
      />

      {/* DELETE CLIENT CONFIRM MODAL */}
      <ConfirmModal
        open={deleteOpen}
        title={`Delete booking "${client.eventName || client.name}"?`}
        description="This will remove the client and their booking details from your active dashboard. This action can be reversed by an administrator."
        confirmLabel="Delete booking"
        onConfirm={handleDeleteClient}
        onCancel={() => setDeleteOpen(false)}
        loading={deleting}
      />
    </div>
  )
}

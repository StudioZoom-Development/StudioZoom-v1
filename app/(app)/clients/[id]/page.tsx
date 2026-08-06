'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/shared/Badge'
import { useAuthStore } from '@/store/authStore'
import { Client } from '@/types'
import {
  getClientById,
  subscribeToPayments,
  recordPayment
} from '@/lib/firebase/queries/clients'
import {
  getProjectByClientId,
  subscribeToProject,
  subscribeToProjectStaffAssignments,
  advanceProjectStage
} from '@/lib/firebase/queries/projects'
import { checkStageGate, GateResult } from '@/lib/utils/gates'
import type { Project, ProjectStage, StaffAssignment } from '@/types'

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

  useEffect(() => {
    if (!id) return

    // 1. Fetch Client
    getClientById(id).then(c => {
      setClient(c)
      setLoading(false)

      if (c) {
        // 2. Fetch linked Project
        getProjectByClientId(c.clientId).then(p => {
          setProject(p)
          if (p) {
            checkStageGate(p.projectId, p.stage).then(setGate)
          }
        })
      }
    })

    // 3. Real-time Payments
    const unsubPayments = subscribeToPayments(id, data => {
      setPayments(data)
    })

    return () => {
      unsubPayments()
    }
  }, [id])

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
    return (
      <div style={{
        color: 'var(--color-foreground-muted)',
        padding: '60px',
        textAlign: 'center',
        fontFamily: 'var(--font-inter)'
      }}>
        <i className="ti ti-loader-2 ti-spin" style={{ fontSize: '32px', marginBottom: '12px', display: 'inline-block' }} />
        <div>Loading client details…</div>
      </div>
    )
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

  // Sample default team chips if none assigned yet
  const defaultTeamChips = [
    { uid: 's1', name: 'Siva P', role: 'Lead Photo', initials: 'SP' },
    { uid: 's2', name: 'Ramesh D', role: 'Video', initials: 'RD' },
    { uid: 's3', name: 'Deepak S', role: 'Drone', initials: 'DS' },
    { uid: 's4', name: 'Guna (FL)', role: 'Candid', initials: 'GU' },
  ]

  const teamChips = assignments.length > 0
    ? assignments.map(a => ({
        uid: a.assignmentId,
        name: a.staffUid,
        role: a.role.charAt(0).toUpperCase() + a.role.slice(1),
        initials: getInitials(a.staffUid)
      }))
    : defaultTeamChips

  const pendingGateCount = gate?.reasons.length || 0

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
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span
          onClick={() => router.push('/clients')}
          style={{ cursor: 'pointer', color: 'var(--color-foreground-muted)', display: 'flex', alignItems: 'center' }}
        >
          <i className="ti ti-arrow-left" style={{ fontSize: '20px' }} />
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
            {client.eventName}
          </div>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-foreground-muted)' }}>
            {client.eventType ? client.eventType.charAt(0).toUpperCase() + client.eventType.slice(1) : 'Event'} · {format(client.eventDate, 'd MMM yyyy')} · {client.location}
          </div>
        </div>

        {/* Stage badge */}
        <div style={{ marginLeft: '4px' }}>
          <Badge variant={currentStage} />
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
                  cursor: 'pointer',
                  padding: '14px 16px',
                  fontSize: 'var(--text-sm)',
                  fontWeight: 600,
                  color: tab === t ? 'var(--color-foreground)' : 'var(--color-foreground-muted)',
                  borderBottom: tab === t ? '2px solid var(--color-primary)' : '2px solid transparent',
                  transition: 'color 0.15s, border-color 0.15s',
                }}
              >
                {t}
              </div>
            ))}
          </div>

          {/* TAB CONTENT: OVERVIEW */}
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
                  Event
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 24px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>Event name</span>
                    <span style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>{client.eventName}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>Type</span>
                    <span style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>
                      {client.eventType === 'wedding' ? 'Wedding (2-day)' : client.eventType}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>Date</span>
                    <span style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>{format(client.eventDate, 'd MMM yyyy')}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>Location</span>
                    <span style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>{client.location}</span>
                  </div>
                </div>
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
                    <span style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>{client.email}</span>
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
                  {teamChips.map(tm => (
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
                  ))}
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
                <div style={{
                  background: 'var(--color-surface-raised)',
                  border: '0.5px solid var(--color-border)',
                  borderRadius: '8px',
                  padding: '12px',
                  fontSize: 'var(--text-sm)',
                  color: 'var(--color-foreground-muted)',
                  lineHeight: 1.5
                }}>
                  {client.notes || 'Muhurtham 6:15–7:30 AM. Client wants candid-heavy coverage, drone for the wedding entry. Album selection to be done with the couple at the studio.'}
                </div>
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
                  const dateText = done ? '12 May · Naresh' : active ? 'In progress' : '—'

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
                  <strong>{STAGE_LABELS[currentStage]}</strong> in progress — venue walkthrough pending, shot list 60% done
                </span>
              </div>
            </div>
          )}

          {/* TAB CONTENT: DOCUMENTS */}
          {tab === 'Documents' && (
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* QUOTATION DOC CARD */}
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
                  background: 'var(--color-accent-muted)',
                  color: 'var(--color-accent)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <i className="ti ti-file-text" style={{ fontSize: '20px' }} />
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1px' }}>
                  <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>Quotation ZS-Q-0042</span>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>
                    Accepted · 12 May 2026 · ₹{totalAmount.toLocaleString('en-IN')}
                  </span>
                </div>
                <button style={{
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
                }}>
                  View
                </button>
                <button style={{
                  cursor: 'pointer',
                  fontFamily: 'var(--font-inter)',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--color-accent)',
                  borderRadius: '8px',
                  height: '30px',
                  padding: '0 8px',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  <i className="ti ti-download" style={{ fontSize: '14px' }} /> PDF
                </button>
              </div>

              {/* INVOICE DOC CARD */}
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
                    Invoice {client.invoiceNumber || 'ZS-INV-0038'}
                  </span>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>
                    Partially paid · ₹{advancePaid.toLocaleString('en-IN')} of ₹{totalAmount.toLocaleString('en-IN')}
                  </span>
                </div>
                <button style={{
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
                }}>
                  View
                </button>
                <button style={{
                  cursor: 'pointer',
                  fontFamily: 'var(--font-inter)',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--color-accent)',
                  borderRadius: '8px',
                  height: '30px',
                  padding: '0 8px',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  <i className="ti ti-download" style={{ fontSize: '14px' }} /> PDF
                </button>
              </div>
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
              {client.packageType || 'Platinum'} package · GST included
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
                {percentCollected}% collected · next instalment due 30 Jul
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
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--text-sm)', color: 'var(--color-foreground-muted)' }}>
                    <i className="ti ti-circle-check" style={{ fontSize: '16px', color: 'var(--color-success)' }} />
                    Shot list approved
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--text-sm)', color: 'var(--color-foreground-muted)' }}>
                    <i className="ti ti-circle-check" style={{ fontSize: '16px', color: 'var(--color-success)' }} />
                    Team assigned
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--text-sm)', color: 'var(--color-foreground-muted)' }}>
                    <i className="ti ti-circle-check" style={{ fontSize: '16px', color: 'var(--color-success)' }} />
                    Venue walkthrough done
                  </div>
                </>
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
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'var(--font-inter)'
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '420px',
              background: 'var(--color-surface-overlay)',
              border: '0.5px solid var(--color-border)',
              borderRadius: '16px',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px'
            }}
          >
            <div style={{ fontSize: 'var(--text-lg)', fontWeight: 600 }}>Record payment</div>

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
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>Instalment</label>
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
                    outline: 'none'
                  }}
                >
                  <option value="1st">1st Instalment</option>
                  <option value="2nd">2nd Instalment</option>
                  <option value="3rd">3rd Instalment</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>Amount</label>
                <Input
                  type="number"
                  placeholder="₹0"
                  value={paymentAmount}
                  onChange={e => setPaymentAmount(e.target.value)}
                  className="h-9"
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>Date</label>
                <Input
                  type="date"
                  value={paymentDate}
                  onChange={e => setPaymentDate(e.target.value)}
                  className="h-9"
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>Method</label>
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
                    outline: 'none'
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
    </div>
  )
}

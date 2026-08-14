'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/shared/LoadingSkeleton'
import { useAuthStore } from '@/store/authStore'
import { Freelancer, FreelancerPayout, Project } from '@/types'
import {
  getFreelancerById,
  updateFreelancer,
  getFreelancerPayouts,
  getFreelancerProjects,
  assignFreelancerToProject,
  recordPayout,
} from '@/lib/firebase/queries/freelancers'
import { getActiveProjects } from '@/lib/firebase/queries/projects'

function getInitials(name: string): string {
  if (!name) return 'FL'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function getEventIcon(eventType?: string): string {
  switch (eventType) {
    case 'wedding':
      return 'ti-heart'
    case 'preWedding':
    case 'engagement':
      return 'ti-camera'
    case 'corporate':
      return 'ti-building'
    default:
      return 'ti-camera'
  }
}

interface ConflictInfo {
  p1: Project
  p2: Project
  formattedDate: string
  message: string
}

function detectDoubleBooking(projects: Project[]): ConflictInfo | null {
  if (projects.length < 2) return null
  for (let i = 0; i < projects.length; i++) {
    for (let j = i + 1; j < projects.length; j++) {
      const p1 = projects[i]
      const p2 = projects[j]
      const d1 = format(p1.eventDate, 'yyyy-MM-dd')
      const d2 = format(p2.eventDate, 'yyyy-MM-dd')
      if (d1 === d2) {
        return {
          p1,
          p2,
          formattedDate: format(p1.eventDate, 'd MMM yyyy'),
          message: `Double-booking: ${p1.eventName} (${format(p1.eventDate, 'd MMM')}) overlaps ${p2.eventName} (${format(p2.eventDate, 'd MMM')}). Resolve before Pre-Prod.`,
        }
      }
    }
  }
  return null
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default function FreelancerDetailPage({ params }: PageProps) {
  const resolvedParams = use(params)
  const freelancerId = resolvedParams.id
  const router = useRouter()
  const appUser = useAuthStore(s => s.appUser)

  const [freelancer, setFreelancer] = useState<Freelancer | null>(null)
  const [payouts, setPayouts] = useState<FreelancerPayout[]>([])
  const [assignedProjects, setAssignedProjects] = useState<Project[]>([])
  const [allActiveProjects, setAllActiveProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedYear, setSelectedYear] = useState('2026')

  // Profile Form State
  const [profileForm, setProfileForm] = useState({
    name: '',
    skill: '',
    dayRate: '',
    contact: '',
    notes: '',
  })
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileSuccessMsg, setProfileSuccessMsg] = useState('')

  // Assign Modal State
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [assignProjectId, setAssignProjectId] = useState('')
  const [assignRole, setAssignRole] = useState('Photographer')
  const [assignDays, setAssignDays] = useState('1')
  const [assigning, setAssigning] = useState(false)
  const [assignError, setAssignError] = useState('')

  // Payout Modal State
  const [showPayoutModal, setShowPayoutModal] = useState(false)
  const [payoutProjectId, setPayoutProjectId] = useState('')
  const [payoutDays, setPayoutDays] = useState('1')
  const [payoutDayRate, setPayoutDayRate] = useState('')
  const [payoutDate, setPayoutDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [payoutMethod, setPayoutMethod] = useState<'gpay' | 'cash' | 'bankTransfer'>('gpay')
  const [recordingPayout, setRecordingPayout] = useState(false)
  const [payoutError, setPayoutError] = useState('')

  // Load Freelancer & Related Data
  useEffect(() => {
    async function loadData() {
      setLoading(true)
      try {
        const [fl, flPayouts, flProjects, actProjects] = await Promise.all([
          getFreelancerById(freelancerId),
          getFreelancerPayouts(freelancerId),
          getFreelancerProjects(freelancerId),
          getActiveProjects(),
        ])

        if (fl) {
          setFreelancer(fl)
          setProfileForm({
            name: fl.name || '',
            skill: fl.skill ? fl.skill.charAt(0).toUpperCase() + fl.skill.slice(1) : '',
            dayRate: String(fl.dayRate || 0),
            contact: fl.contact || '',
            notes: fl.notes || '',
          })
          setPayoutDayRate(String(fl.dayRate || 6000))
        }
        setPayouts(flPayouts)
        setAssignedProjects(flProjects)
        setAllActiveProjects(actProjects)
        if (flProjects.length > 0) {
          setPayoutProjectId(flProjects[0].projectId)
        } else if (actProjects.length > 0) {
          setPayoutProjectId(actProjects[0].projectId)
        }
        if (actProjects.length > 0) {
          setAssignProjectId(actProjects[0].projectId)
        }
      } catch (err) {
        console.error('Failed to load freelancer details:', err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [freelancerId])

  // Double Booking Detection
  const conflictInfo = detectDoubleBooking(assignedProjects)

  // Summary Metrics (Year-filtered)
  let filteredPayouts = payouts
  if (selectedYear !== 'all') {
    const yr = parseInt(selectedYear, 10)
    filteredPayouts = payouts.filter(p => p.paidDate.getFullYear() === yr)
  }
  const summaryMetrics = {
    engagements: filteredPayouts.length,
    totalPaid: filteredPayouts.reduce((acc, p) => acc + (p.amount || 0), 0),
  }

  // Toggle Active Status
  const handleToggleActive = async (newActive: boolean) => {
    if (!freelancer) return
    setFreelancer(prev => prev ? { ...prev, isActive: newActive } : null)
    try {
      await updateFreelancer(freelancerId, { isActive: newActive })
    } catch (err) {
      console.error('Failed to toggle active state:', err)
    }
  }

  // Save Profile Details
  const handleSaveProfile = async () => {
    setSavingProfile(true)
    setProfileSuccessMsg('')
    try {
      const skillClean = profileForm.skill.toLowerCase().trim() as Freelancer['skill']
      const validSkill = ['photographer', 'videographer', 'editor', 'designer', 'other'].includes(skillClean)
        ? skillClean
        : 'other'

      await updateFreelancer(freelancerId, {
        name: profileForm.name.trim(),
        skill: validSkill,
        dayRate: Number(profileForm.dayRate) || 0,
        contact: profileForm.contact.trim(),
        notes: profileForm.notes.trim(),
      })
      setFreelancer(prev => prev ? {
        ...prev,
        name: profileForm.name.trim(),
        skill: validSkill,
        dayRate: Number(profileForm.dayRate) || 0,
        contact: profileForm.contact.trim(),
        notes: profileForm.notes.trim(),
      } : null)
      setProfileSuccessMsg('Profile saved successfully!')
      setTimeout(() => setProfileSuccessMsg(''), 3000)
    } catch (err) {
      console.error('Failed to update freelancer profile:', err)
    } finally {
      setSavingProfile(false)
    }
  }

  // Assign to Project Confirm
  const handleAssignConfirm = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!assignProjectId) {
      setAssignError('Please select a project')
      return
    }
    setAssigning(true)
    setAssignError('')
    try {
      await assignFreelancerToProject(assignProjectId, freelancerId)
      // Refresh assignments
      const updatedProjects = await getFreelancerProjects(freelancerId)
      setAssignedProjects(updatedProjects)
      setShowAssignModal(false)
    } catch (err: unknown) {
      console.error('Failed to assign freelancer:', err)
      setAssignError(err instanceof Error ? err.message : 'Failed to assign freelancer')
    } finally {
      setAssigning(false)
    }
  }

  // Record Payout Confirm
  const handleRecordPayoutConfirm = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!payoutProjectId) {
      setPayoutError('Please select a project')
      return
    }
    const daysNum = Number(payoutDays) || 1
    const rateNum = Number(payoutDayRate) || (freelancer?.dayRate || 0)
    const amountNum = daysNum * rateNum

    const proj = allActiveProjects.find(p => p.projectId === payoutProjectId) || assignedProjects.find(p => p.projectId === payoutProjectId)
    const eventName = proj?.eventName || 'Event Project'

    setRecordingPayout(true)
    setPayoutError('')
    try {
      await recordPayout({
        freelancerId,
        freelancerName: freelancer?.name || 'Freelancer',
        projectId: payoutProjectId,
        eventName,
        days: daysNum,
        dayRate: rateNum,
        amount: amountNum,
        paidDate: new Date(payoutDate),
        method: payoutMethod,
        recordedBy: appUser?.uid || 'admin',
      })

      // Refresh payouts list
      const updatedPayouts = await getFreelancerPayouts(freelancerId)
      setPayouts(updatedPayouts)
      setShowPayoutModal(false)
    } catch (err: unknown) {
      console.error('Failed to record payout:', err)
      setPayoutError(err instanceof Error ? err.message : 'Failed to record payout')
    } finally {
      setRecordingPayout(false)
    }
  }

  if (loading) {
    return (
      <div style={{ padding: '24px', maxWidth: '1280px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <Skeleton height="48px" width="320px" radius="8px" />
        <div style={{ display: 'grid', gridTemplateColumns: '38fr 62fr', gap: '16px' }}>
          <Skeleton height="400px" radius="12px" />
          <Skeleton height="400px" radius="12px" />
        </div>
      </div>
    )
  }

  if (!freelancer) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-foreground-muted)', fontFamily: 'var(--font-inter)' }}>
        <i className="ti ti-alert-circle" style={{ fontSize: '32px', display: 'block', marginBottom: '12px' }} />
        Freelancer not found.
        <div style={{ marginTop: '16px' }}>
          <Button onClick={() => router.push('/hrms/freelancers')}>Return to Freelancers</Button>
        </div>
      </div>
    )
  }

  const activeSinceYear = freelancer.createdAt ? freelancer.createdAt.getFullYear() : '2023'
  const skillDisplay = freelancer.skill ? freelancer.skill.charAt(0).toUpperCase() + freelancer.skill.slice(1) : 'Freelancer'

  return (
    <div style={{
      padding: '24px',
      maxWidth: '1280px',
      margin: '0 auto',
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
      fontFamily: 'var(--font-inter)',
      paddingBottom: '40px',
    }}>
      {/* HEADER */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span
          onClick={() => router.push('/hrms/freelancers')}
          style={{
            cursor: 'pointer',
            color: 'var(--color-foreground-muted)',
            display: 'flex',
            alignItems: 'center',
            transition: 'color 0.15s ease',
          }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--color-foreground)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--color-foreground-muted)'}
        >
          <i className="ti ti-arrow-left" style={{ fontSize: '20px' }} />
        </span>

        {/* 44px Avatar (secondary-muted / secondary) */}
        <div style={{
          width: '44px',
          height: '44px',
          borderRadius: '50%',
          background: 'var(--color-secondary-muted)',
          color: 'var(--color-secondary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 'var(--text-sm)',
          fontWeight: 700,
          flexShrink: 0,
        }}>
          {getInitials(freelancer.name)}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <div style={{
            fontSize: 'var(--text-2xl)',
            fontWeight: 700,
            letterSpacing: '-0.02em',
            lineHeight: 1.2,
            color: 'var(--color-foreground)',
          }}>
            {freelancer.name}
          </div>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-foreground-muted)' }}>
            {skillDisplay} · ₹{(freelancer.dayRate || 0).toLocaleString('en-IN')}/day · Active since {activeSinceYear}
          </div>
        </div>

        <div style={{ flex: 1 }} />

        <Button
          className="h-9 font-medium"
          onClick={() => {
            setAssignError('')
            setShowAssignModal(true)
          }}
        >
          Assign to project
        </Button>
      </div>

      {/* 38 / 62 GRID */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '38fr 62fr',
        gap: '16px',
        alignItems: 'start',
      }}>
        {/* LEFT COLUMN */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Card 1: Profile */}
          <div style={{
            background: 'var(--color-surface)',
            border: '0.5px solid var(--color-border)',
            borderRadius: '12px',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: 'var(--color-foreground-subtle)',
              }}>
                Profile
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>
                  Active
                </span>
                <Switch
                  checked={freelancer.isActive !== false}
                  onCheckedChange={handleToggleActive}
                />
              </div>
            </div>

            {profileSuccessMsg && (
              <div style={{
                background: 'var(--color-success-muted)',
                color: 'var(--color-success)',
                padding: '6px 10px',
                borderRadius: '6px',
                fontSize: 'var(--text-xs)',
              }}>
                {profileSuccessMsg}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>
                Full name
              </label>
              <Input
                value={profileForm.name}
                onChange={e => setProfileForm(p => ({ ...p, name: e.target.value }))}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>
                Skill
              </label>
              <Input
                value={profileForm.skill}
                onChange={e => setProfileForm(p => ({ ...p, skill: e.target.value }))}
                placeholder="Photographer, Videographer, etc."
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>
                Day rate (₹)
              </label>
              <Input
                type="number"
                value={profileForm.dayRate}
                onChange={e => setProfileForm(p => ({ ...p, dayRate: e.target.value }))}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>
                Contact
              </label>
              <Input
                value={profileForm.contact}
                onChange={e => setProfileForm(p => ({ ...p, contact: e.target.value }))}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>
                Notes
              </label>
              <textarea
                rows={2}
                value={profileForm.notes}
                onChange={e => setProfileForm(p => ({ ...p, notes: e.target.value }))}
                placeholder="Freelancer notes..."
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
                  lineHeight: 1.5,
                }}
              />
            </div>

            <Button
              variant="outline"
              className="h-9 w-full"
              onClick={handleSaveProfile}
              disabled={savingProfile}
            >
              {savingProfile ? 'Saving...' : 'Save profile'}
            </Button>
          </div>

          {/* Card 2: Summary */}
          <div style={{
            background: 'var(--color-surface)',
            border: '0.5px solid var(--color-border)',
            borderRadius: '12px',
            padding: '16px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: 'var(--color-foreground-subtle)',
              }}>
                Summary
              </div>
              <select
                value={selectedYear}
                onChange={e => setSelectedYear(e.target.value)}
                style={{
                  fontFamily: 'var(--font-inter)',
                  height: '28px',
                  background: 'var(--color-surface-raised)',
                  border: '0.5px solid var(--color-border)',
                  borderRadius: '6px',
                  padding: '0 8px',
                  fontSize: 'var(--text-xs)',
                  color: 'var(--color-foreground-muted)',
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value="2026">2026</option>
                <option value="2025">2025</option>
                <option value="all">All time</option>
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
                background: 'var(--color-surface-raised)',
                border: '0.5px solid var(--color-border)',
                borderRadius: '10px',
                padding: '12px',
              }}>
                <span style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, lineHeight: 1.2, color: 'var(--color-foreground)' }}>
                  {summaryMetrics.engagements}
                </span>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>
                  Engagements · {selectedYear === 'all' ? 'All time' : selectedYear}
                </span>
              </div>

              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
                background: 'var(--color-surface-raised)',
                border: '0.5px solid var(--color-border)',
                borderRadius: '10px',
                padding: '12px',
              }}>
                <span style={{
                  fontSize: 'var(--text-2xl)',
                  fontWeight: 700,
                  lineHeight: 1.2,
                  color: 'var(--color-primary)',
                }}>
                  ₹{summaryMetrics.totalPaid.toLocaleString('en-IN')}
                </span>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>
                  Total paid · {selectedYear === 'all' ? 'All time' : selectedYear}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Card 1: Current & Upcoming Assignments */}
          <div style={{
            background: 'var(--color-surface)',
            border: '0.5px solid var(--color-border)',
            borderRadius: '12px',
            padding: '16px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}>
            <div style={{
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: 'var(--color-foreground-subtle)',
            }}>
              Current &amp; upcoming assignments
            </div>

            {/* Double-booking Warning */}
            {conflictInfo && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                background: 'var(--color-danger-muted)',
                border: '0.5px solid var(--color-danger)',
                borderRadius: '8px',
                padding: '10px 12px',
              }}>
                <i className="ti ti-alert-triangle" style={{ fontSize: '16px', color: 'var(--color-danger)', flexShrink: 0 }} />
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground)', lineHeight: 1.4 }}>
                  Double-booking: <b>{conflictInfo.p1.eventName}</b> ({format(conflictInfo.p1.eventDate, 'd MMM')}) overlaps <b>{conflictInfo.p2.eventName}</b> ({format(conflictInfo.p2.eventDate, 'd MMM')}). Resolve before Pre-Prod.
                </span>
              </div>
            )}

            {/* Assignments List */}
            {assignedProjects.length === 0 ? (
              <div style={{
                padding: '24px 0',
                textAlign: 'center',
                color: 'var(--color-foreground-muted)',
                fontSize: 'var(--text-sm)',
              }}>
                No upcoming assignments for this freelancer.
              </div>
            ) : (
              assignedProjects.map(proj => {
                const isConflicted = conflictInfo && (
                  conflictInfo.p1.projectId === proj.projectId || conflictInfo.p2.projectId === proj.projectId
                )
                const formattedDate = format(proj.eventDate, 'd MMM yyyy')
                const icon = getEventIcon(proj.eventType)

                return (
                  <div
                    key={proj.projectId}
                    onClick={() => router.push(`/clients/${proj.clientId || proj.projectId}`)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      background: 'var(--color-surface-raised)',
                      border: `0.5px solid ${isConflicted ? 'var(--color-danger)' : 'var(--color-border)'}`,
                      borderRadius: '10px',
                      padding: '12px 14px',
                      cursor: 'pointer',
                      transition: 'border-color 0.15s ease',
                    }}
                    onMouseEnter={e => {
                      if (!isConflicted) e.currentTarget.style.borderColor = 'var(--color-border-strong)'
                    }}
                    onMouseLeave={e => {
                      if (!isConflicted) e.currentTarget.style.borderColor = 'var(--color-border)'
                    }}
                  >
                    <div style={{
                      width: '34px',
                      height: '34px',
                      borderRadius: '9px',
                      background: 'var(--color-primary-muted)',
                      color: 'var(--color-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <i className={`ti ${icon}`} style={{ fontSize: '17px' }} />
                    </div>

                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1px' }}>
                      <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-foreground)' }}>
                        {proj.eventName}
                      </span>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>
                        {skillDisplay} · {formattedDate}
                      </span>
                    </div>

                    <span style={{
                      fontSize: 'var(--text-xs)',
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: '10px',
                      background: 'var(--color-secondary-muted)',
                      color: 'var(--color-secondary)',
                    }}>
                      1 day
                    </span>
                  </div>
                )
              })
            )}
          </div>

          {/* Card 2: Payout History */}
          <div style={{
            background: 'var(--color-surface)',
            border: '0.5px solid var(--color-border)',
            borderRadius: '12px',
            overflow: 'hidden',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 20px 8px',
            }}>
              <div style={{
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: 'var(--color-foreground-subtle)',
              }}>
                Payout history · auto-posts to Expenses under &quot;Freelancer&quot;
              </div>

              <Button
                variant="outline"
                className="h-7 text-xs font-medium"
                onClick={() => {
                  setPayoutError('')
                  setShowPayoutModal(true)
                }}
              >
                ＋ Record payout
              </Button>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
              <thead>
                <tr>
                  <th style={{
                    textAlign: 'left',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: 'var(--color-foreground-subtle)',
                    padding: '8px 20px',
                    borderBottom: '0.5px solid var(--color-border-strong)',
                  }}>
                    Project
                  </th>
                  <th style={{
                    textAlign: 'right',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: 'var(--color-foreground-subtle)',
                    padding: '8px 12px',
                    borderBottom: '0.5px solid var(--color-border-strong)',
                  }}>
                    Days × rate
                  </th>
                  <th style={{
                    textAlign: 'right',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: 'var(--color-foreground-subtle)',
                    padding: '8px 12px',
                    borderBottom: '0.5px solid var(--color-border-strong)',
                  }}>
                    Amount
                  </th>
                  <th style={{
                    textAlign: 'left',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: 'var(--color-foreground-subtle)',
                    padding: '8px 12px',
                    borderBottom: '0.5px solid var(--color-border-strong)',
                  }}>
                    Paid
                  </th>
                  <th style={{
                    textAlign: 'right',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: 'var(--color-foreground-subtle)',
                    padding: '8px 20px',
                    borderBottom: '0.5px solid var(--color-border-strong)',
                  }}>
                    Expense
                  </th>
                </tr>
              </thead>
              <tbody>
                {payouts.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{
                      padding: '24px 20px',
                      textAlign: 'center',
                      color: 'var(--color-foreground-muted)',
                      fontSize: 'var(--text-sm)',
                    }}>
                      No payouts recorded yet.
                    </td>
                  </tr>
                ) : (
                  payouts.map(p => (
                    <tr
                      key={p.payoutId}
                      style={{ transition: 'background 0.15s ease' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-raised)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={{
                        padding: '0 20px',
                        height: '44px',
                        borderBottom: '0.5px solid var(--color-border)',
                        fontWeight: 600,
                        color: 'var(--color-foreground)',
                      }}>
                        {p.eventName || 'Event Project'}
                      </td>
                      <td style={{
                        padding: '0 12px',
                        height: '44px',
                        borderBottom: '0.5px solid var(--color-border)',
                        textAlign: 'right',
                        color: 'var(--color-foreground-muted)',
                      }}>
                        {p.days} × ₹{(p.dayRate || 0).toLocaleString('en-IN')}
                      </td>
                      <td style={{
                        padding: '0 12px',
                        height: '44px',
                        borderBottom: '0.5px solid var(--color-border)',
                        textAlign: 'right',
                        fontWeight: 700,
                        color: 'var(--color-foreground)',
                      }}>
                        ₹{(p.amount || 0).toLocaleString('en-IN')}
                      </td>
                      <td style={{
                        padding: '0 12px',
                        height: '44px',
                        borderBottom: '0.5px solid var(--color-border)',
                        color: 'var(--color-foreground-muted)',
                      }}>
                        {format(p.paidDate, 'd MMM yyyy')}
                      </td>
                      <td style={{
                        padding: '0 20px',
                        height: '44px',
                        borderBottom: '0.5px solid var(--color-border)',
                        textAlign: 'right',
                      }}>
                        <span
                          onClick={() => router.push(`/erp/expenses?id=${p.postedExpenseId}`)}
                          style={{
                            fontSize: 'var(--text-xs)',
                            fontWeight: 600,
                            padding: '3px 8px',
                            borderRadius: '8px',
                            background: 'var(--color-accent-muted)',
                            color: 'var(--color-accent)',
                            cursor: 'pointer',
                          }}
                        >
                          {p.postedExpenseId || 'EXP-0000'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ASSIGN TO PROJECT MODAL */}
      {showAssignModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.7)',
          zIndex: 50,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px',
        }}>
          <div style={{
            background: 'var(--color-surface-overlay)',
            border: '0.5px solid var(--color-border)',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '480px',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, margin: 0, color: 'var(--color-foreground)' }}>
                Assign to Project
              </h3>
              <button
                type="button"
                onClick={() => setShowAssignModal(false)}
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

            {assignError && (
              <div style={{
                background: 'var(--color-danger-muted)',
                color: 'var(--color-danger)',
                padding: '8px 12px',
                borderRadius: '6px',
                fontSize: 'var(--text-xs)',
              }}>
                {assignError}
              </div>
            )}

            <form onSubmit={handleAssignConfirm} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Project Select */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)', fontWeight: 500 }}>
                  Select Project *
                </label>
                <select
                  value={assignProjectId}
                  onChange={e => setAssignProjectId(e.target.value)}
                  required
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
                  {allActiveProjects.map(p => (
                    <option key={p.projectId} value={p.projectId}>
                      {p.eventName} ({format(p.eventDate, 'd MMM yyyy')})
                    </option>
                  ))}
                </select>
              </div>

              {/* Role Select */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)', fontWeight: 500 }}>
                  Assigned Role *
                </label>
                <select
                  value={assignRole}
                  onChange={e => setAssignRole(e.target.value)}
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
                  <option value="Photographer">Photographer</option>
                  <option value="Videographer">Videographer</option>
                  <option value="Editor">Editor</option>
                  <option value="Designer">Designer</option>
                  <option value="Second shooter">Second shooter</option>
                  <option value="Drone">Drone Operator</option>
                </select>
              </div>

              {/* Days */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)', fontWeight: 500 }}>
                  Number of Days
                </label>
                <Input
                  type="number"
                  min="1"
                  value={assignDays}
                  onChange={e => setAssignDays(e.target.value)}
                />
              </div>

              {/* Modal Footer */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowAssignModal(false)}
                  disabled={assigning}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={assigning}>
                  {assigning ? 'Assigning...' : 'Assign to project'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RECORD PAYOUT MODAL */}
      {showPayoutModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.7)',
          zIndex: 50,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px',
        }}>
          <div style={{
            background: 'var(--color-surface-overlay)',
            border: '0.5px solid var(--color-border)',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '480px',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, margin: 0, color: 'var(--color-foreground)' }}>
                  Record Payout
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>
                  Auto-posts to Expenses under &quot;Freelancer&quot; category
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPayoutModal(false)}
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

            {payoutError && (
              <div style={{
                background: 'var(--color-danger-muted)',
                color: 'var(--color-danger)',
                padding: '8px 12px',
                borderRadius: '6px',
                fontSize: 'var(--text-xs)',
              }}>
                {payoutError}
              </div>
            )}

            <form onSubmit={handleRecordPayoutConfirm} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Project Select */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)', fontWeight: 500 }}>
                  Project *
                </label>
                <select
                  value={payoutProjectId}
                  onChange={e => setPayoutProjectId(e.target.value)}
                  required
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
                  {allActiveProjects.map(p => (
                    <option key={p.projectId} value={p.projectId}>
                      {p.eventName} ({format(p.eventDate, 'd MMM yyyy')})
                    </option>
                  ))}
                </select>
              </div>

              {/* Days Worked & Rate Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)', fontWeight: 500 }}>
                    Days worked *
                  </label>
                  <Input
                    type="number"
                    min="1"
                    required
                    value={payoutDays}
                    onChange={e => setPayoutDays(e.target.value)}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)', fontWeight: 500 }}>
                    Day rate (₹) *
                  </label>
                  <Input
                    type="number"
                    min="0"
                    required
                    value={payoutDayRate}
                    onChange={e => setPayoutDayRate(e.target.value)}
                  />
                </div>
              </div>

              {/* Calculated Total Amount Box */}
              <div style={{
                background: 'var(--color-surface-raised)',
                border: '0.5px solid var(--color-border)',
                borderRadius: '8px',
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>
                  Total Payout Amount:
                </span>
                <span style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--color-primary)' }}>
                  ₹{((Number(payoutDays) || 1) * (Number(payoutDayRate) || 0)).toLocaleString('en-IN')}
                </span>
              </div>

              {/* Paid Date */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)', fontWeight: 500 }}>
                  Paid Date *
                </label>
                <Input
                  type="date"
                  required
                  value={payoutDate}
                  onChange={e => setPayoutDate(e.target.value)}
                />
              </div>

              {/* Payment Method */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)', fontWeight: 500 }}>
                  Payment Method *
                </label>
                <select
                  value={payoutMethod}
                  onChange={e => setPayoutMethod(e.target.value as 'gpay' | 'cash' | 'bankTransfer')}
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
                  <option value="gpay">GPay / UPI</option>
                  <option value="cash">Cash</option>
                  <option value="bankTransfer">Bank Transfer (NEFT/IMPS)</option>
                </select>
              </div>

              {/* Modal Footer */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowPayoutModal(false)}
                  disabled={recordingPayout}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={recordingPayout}>
                  {recordingPayout ? 'Recording...' : 'Record payout'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

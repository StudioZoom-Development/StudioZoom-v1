'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { format, parseISO, isValid } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LoadingSkeleton } from '@/components/shared/LoadingSkeleton'
import {
  StaffMember,
  getStaffMember,
  updateStaffProfile,
  getAttendanceSummary,
  getPayslipHistory,
  getWorkHistory
} from '@/lib/firebase/queries/staff'

const ROLE_ICONS: Record<string, string> = {
  photographer: 'ti-camera',
  videographer: 'ti-video',
  editor:       'ti-wand',
  designer:     'ti-pencil',
  drone:        'ti-drone',
  assistant:    'ti-user',
  lead_photo:   'ti-camera',
  lead_video:   'ti-video'
}

const ROLE_LABELS: Record<string, string> = {
  photographer: 'Photographer',
  videographer: 'Videographer',
  editor:       'Editor',
  designer:     'Designer',
  drone:        'Drone Operator',
  assistant:    'Assistant',
  lead_photo:   'Lead Photo',
  lead_video:   'Lead Video'
}

const STAGE_LABELS: Record<string, string> = {
  booked:          'Booked',
  planning:        'Planning',
  preProduction:   'Pre-Prod',
  eventDay:        'Event Day',
  postProduction:  'Post-Prod',
  delivered:       'Delivered',
}

const BADGE_STYLES: Record<string, { bg: string; fg: string }> = {
  booked:          { bg: 'var(--color-accent-muted)',    fg: 'var(--color-accent)' },
  planning:        { bg: 'var(--color-primary-muted)',   fg: 'var(--color-primary)' },
  preProduction:   { bg: 'var(--color-secondary-muted)', fg: 'var(--color-secondary)' },
  eventDay:        { bg: 'var(--color-danger-muted)',    fg: 'var(--color-danger)' },
  postProduction:  { bg: 'var(--color-purple-muted)',    fg: 'var(--color-purple)' },
  delivered:       { bg: 'var(--color-success-muted)',   fg: 'var(--color-success)' },
}



function getInitials(name: string): string {
  if (!name) return 'SP'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function formatEventDate(dateStr: string): string {
  if (!dateStr) return '—'
  try {
    const parsed = parseISO(dateStr)
    if (isValid(parsed)) return format(parsed, 'd MMM')
    return dateStr
  } catch {
    return dateStr
  }
}

export default function StaffDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const uid = resolvedParams.id
  const router = useRouter()

  const [staff, setStaff] = useState<StaffMember | null>(null)
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  // Profile Form State
  const [form, setForm] = useState({
    name: '',
    contact: '',
    email: '',
    jobTitle: '',
    joinDate: '',
    baseSalary: ''
  })

  // Tabs State
  const [activeTab, setActiveTab] = useState<'attendance' | 'payslips' | 'workHistory'>('attendance')
  
  // Tab Data States
  const [attData, setAttData] = useState<{ present: number; late: number; absent: number; totalMinutes: number } | null>(null)
  const [payData, setPayData] = useState<Array<{ payslipId: string; payslipNumber: string; month: number; year: number; netPay: number }>>([])
  const [workData, setWorkData] = useState<Array<{ projectId: string; eventName: string; eventDate: string; role: string; stage: string }>>([])
  
  const [loadingPay, setLoadingPay] = useState(false)
  const [loadingWork, setLoadingWork] = useState(false)

  useEffect(() => {
    getStaffMember(uid).then(data => {
      if (data) {
        setStaff(data)
        setForm({
          name:       data.name || '',
          contact:    data.contact || '',
          email:      data.email || '',
          jobTitle:   data.jobTitle || '',
          joinDate:   data.joinDate ? format(data.joinDate, 'd MMM yyyy') : '',
          baseSalary: data.baseSalary !== undefined ? '₹' + data.baseSalary.toLocaleString('en-IN') : ''
        })
      }
      setLoading(false)
    })
  }, [uid])

  // Load attendance summary on mount
  useEffect(() => {
    const now = new Date()
    getAttendanceSummary(uid, now.getFullYear(), now.getMonth() + 1).then(res => {
      setAttData(res)
    })
  }, [uid])

  const handleTabClick = (tab: typeof activeTab) => {
    setActiveTab(tab)
    if (tab === 'payslips' && payData.length === 0) {
      setLoadingPay(true)
      getPayslipHistory(uid).then(res => {
        setPayData(res)
        setLoadingPay(false)
      })
    }
    if (tab === 'workHistory' && workData.length === 0) {
      setLoadingWork(true)
      getWorkHistory(uid).then(res => {
        setWorkData(res)
        setLoadingWork(false)
      })
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const rawSalary = Number(form.baseSalary.replace(/[^0-9]/g, ''))
      await updateStaffProfile(uid, {
        name: form.name,
        contact: form.contact,
        email: form.email,
        jobTitle: form.jobTitle,
        baseSalary: isNaN(rawSalary) ? undefined : rawSalary,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      console.error('Failed to update staff profile:', err)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div style={{ padding: '24px', maxWidth: '1280px', margin: '0 auto' }}>
        <LoadingSkeleton lines={6} height="32px" gap="16px" />
      </div>
    )
  }

  if (!staff) {
    return (
      <div style={{ padding: '24px', maxWidth: '1280px', margin: '0 auto', color: 'var(--color-foreground-muted)' }}>
        Staff member not found.
      </div>
    )
  }

  const initials = getInitials(staff.name)
  const formattedJoined = staff.joinDate ? format(staff.joinDate, 'd MMM yyyy') : '12 Mar 2022'
  const roleText = staff.jobTitle || (staff.role === 'manager' ? 'Manager' : 'Photographer')
  const statusText = staff.isActive ? 'Active' : 'Inactive'

  return (
    <div style={{ padding: '24px', maxWidth: '1280px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span
          onClick={() => router.back()}
          style={{ cursor: 'pointer', color: 'var(--color-foreground-muted)', display: 'flex' }}
        >
          <i className="ti ti-arrow-left" style={{ fontSize: '20px' }} />
        </span>

        {/* 44px Avatar */}
        <div style={{
          width: '44px',
          height: '44px',
          borderRadius: '50%',
          background: 'var(--color-primary-muted)',
          color: 'var(--color-primary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 'var(--text-sm)',
          fontWeight: 700,
          flexShrink: 0
        }}>
          {initials}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <div style={{
            fontSize: 'var(--text-2xl)',
            fontWeight: 700,
            letterSpacing: '-0.02em',
            lineHeight: 1.2,
            color: 'var(--color-foreground)'
          }}>
            {staff.name}
          </div>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-foreground-muted)' }}>
            {roleText} · joined {formattedJoined} · {statusText}
          </div>
        </div>
      </div>

      {/* Main Grid 38fr / 62fr */}
      <div style={{ display: 'grid', gridTemplateColumns: '38fr 62fr', gap: '16px', alignItems: 'start' }}>
        
        {/* Left Card — Profile */}
        <div style={{
          background: 'var(--color-surface)',
          border: '0.5px solid var(--color-border)',
          borderRadius: '12px',
          padding: '20px',
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
            PROFILE
          </div>

          {/* Full Name */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>
              Full name
            </label>
            <Input
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              className="h-9"
            />
          </div>

          {/* Contact */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>
              Contact
            </label>
            <Input
              value={form.contact}
              onChange={e => setForm({ ...form, contact: e.target.value })}
              className="h-9"
            />
          </div>

          {/* Email */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>
              Email
            </label>
            <Input
              value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })}
              className="h-9"
            />
          </div>

          {/* Role */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>
              Role
            </label>
            <Input
              value={form.jobTitle}
              onChange={e => setForm({ ...form, jobTitle: e.target.value })}
              className="h-9"
            />
          </div>

          {/* Join Date */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>
              Join date
            </label>
            <Input
              value={form.joinDate}
              onChange={e => setForm({ ...form, joinDate: e.target.value })}
              className="h-9"
            />
          </div>

          {/* Base Salary */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>
              Base salary
            </label>
            <Input
              value={form.baseSalary}
              onChange={e => setForm({ ...form, baseSalary: e.target.value })}
              className="h-9"
            />
          </div>

          {/* Save Button */}
          <Button
            className="h-9 font-medium w-full"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save profile'}
          </Button>
        </div>

        {/* Right Card — Tabs Container */}
        <div style={{
          background: 'var(--color-surface)',
          border: '0.5px solid var(--color-border)',
          borderRadius: '12px',
          overflow: 'hidden'
        }}>
          {/* Tabs Navigation Header */}
          <div style={{ display: 'flex', borderBottom: '0.5px solid var(--color-border)', padding: '0 12px' }}>
            {[
              { id: 'attendance', label: 'Attendance' },
              { id: 'payslips', label: 'Payslips' },
              { id: 'workHistory', label: 'Work history' }
            ].map(tab => (
              <div
                key={tab.id}
                onClick={() => handleTabClick(tab.id as typeof activeTab)}
                style={{
                  cursor: 'pointer',
                  padding: '12px 14px',
                  fontSize: 'var(--text-sm)',
                  fontWeight: 600,
                  color: activeTab === tab.id ? 'var(--color-primary)' : 'var(--color-foreground-muted)',
                  borderBottom: activeTab === tab.id ? '2px solid var(--color-primary)' : '2px solid transparent',
                  transition: 'color 0.15s, border-color 0.15s'
                }}
              >
                {tab.label}
              </div>
            ))}
          </div>

          {/* Tab 1: Attendance */}
          {activeTab === 'attendance' && (
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                
                {/* Present */}
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '2px',
                  background: 'var(--color-surface-raised)',
                  border: '0.5px solid var(--color-border)',
                  borderRadius: '10px',
                  padding: '12px 4px'
                }}>
                  <span style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: 'var(--color-success)' }}>
                    {attData?.present ?? 17}
                  </span>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>
                    Present · Jul
                  </span>
                </div>

                {/* Late */}
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '2px',
                  background: 'var(--color-surface-raised)',
                  border: '0.5px solid var(--color-border)',
                  borderRadius: '10px',
                  padding: '12px 4px'
                }}>
                  <span style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: 'var(--color-secondary)' }}>
                    {attData?.late ?? 1}
                  </span>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>
                    Late
                  </span>
                </div>

                {/* Absent */}
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '2px',
                  background: 'var(--color-surface-raised)',
                  border: '0.5px solid var(--color-border)',
                  borderRadius: '10px',
                  padding: '12px 4px'
                }}>
                  <span style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: 'var(--color-danger)' }}>
                    {attData?.absent ?? 0}
                  </span>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>
                    Absent
                  </span>
                </div>

                {/* Hours */}
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '2px',
                  background: 'var(--color-surface-raised)',
                  border: '0.5px solid var(--color-border)',
                  borderRadius: '10px',
                  padding: '12px 4px'
                }}>
                  <span style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: 'var(--color-foreground)' }}>
                    {Math.floor((attData?.totalMinutes ?? 9600) / 60)}h
                  </span>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>
                    Hours
                  </span>
                </div>
              </div>

              <div>
                <span
                  onClick={() => router.push(`/hrms/attendance?staff=${uid}`)}
                  style={{
                    fontSize: 'var(--text-xs)',
                    color: 'var(--color-accent)',
                    cursor: 'pointer',
                    fontWeight: 500
                  }}
                >
                  Open attendance grid →
                </span>
              </div>
            </div>
          )}

          {/* Tab 2: Payslips */}
          {activeTab === 'payslips' && (
            <div style={{ padding: '12px 20px 20px', display: 'flex', flexDirection: 'column' }}>
              {loadingPay ? (
                <div style={{ padding: '12px 0' }}>
                  <LoadingSkeleton lines={4} height="24px" gap="12px" />
                </div>
              ) : payData.length === 0 ? (
                <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--color-foreground-muted)', fontSize: 'var(--text-sm)' }}>
                  No payslips found for this staff member.
                </div>
              ) : (
                payData.map(p => {
                  const dateObj = new Date(p.year, p.month - 1)
                  const monthLabel = format(dateObj, 'MMMM yyyy')
                  const formattedPay = '₹' + p.netPay.toLocaleString('en-IN')

                  return (
                    <div
                      key={p.payslipId}
                      onClick={() => router.push(`/hrms/payslips/${p.payslipId}`)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '11px 6px',
                        borderBottom: '0.5px solid var(--color-border)',
                        cursor: 'pointer',
                        borderRadius: '6px'
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-raised)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <i className="ti ti-file-invoice" style={{ fontSize: '17px', color: 'var(--color-foreground-subtle)' }} />
                      <span style={{ flex: 1, fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-foreground)' }}>
                        {monthLabel}
                      </span>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)', marginRight: '16px' }}>
                        {p.payslipNumber}
                      </span>
                      <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--color-foreground)' }}>
                        {formattedPay}
                      </span>
                    </div>
                  )
                })
              )}
            </div>
          )}

          {/* Tab 3: Work history */}
          {activeTab === 'workHistory' && (
            <div style={{ padding: '12px 20px 20px', display: 'flex', flexDirection: 'column' }}>
              {loadingWork ? (
                <div style={{ padding: '12px 0' }}>
                  <LoadingSkeleton lines={4} height="24px" gap="12px" />
                </div>
              ) : workData.length === 0 ? (
                <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--color-foreground-muted)', fontSize: 'var(--text-sm)' }}>
                  No work history recorded for this staff member.
                </div>
              ) : (
                workData.map((w, i) => {
                  const icon = ROLE_ICONS[w.role] ?? 'ti-camera'
                  const roleLabel = ROLE_LABELS[w.role] ?? w.role
                  const formattedDate = formatEventDate(w.eventDate)
                  const stageStyle = BADGE_STYLES[w.stage] ?? { bg: 'var(--color-surface-raised)', fg: 'var(--color-foreground-muted)' }
                  const stageLabel = STAGE_LABELS[w.stage] ?? w.stage

                  return (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '11px 6px',
                        borderBottom: '0.5px solid var(--color-border)'
                      }}
                    >
                      <i className={`ti ${icon}`} style={{ fontSize: '17px', color: 'var(--color-foreground-subtle)' }} />
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-foreground)' }}>
                          {w.eventName}
                        </span>
                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>
                          {roleLabel} · {formattedDate}
                        </span>
                      </div>

                      {/* Inline Stage Badge (span with Badge tokens, not <Badge> component) */}
                      <span style={{
                        fontSize: 'var(--text-xs)',
                        fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: '10px',
                        background: stageStyle.bg,
                        color: stageStyle.fg
                      }}>
                        {stageLabel}
                      </span>
                    </div>
                  )
                })
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

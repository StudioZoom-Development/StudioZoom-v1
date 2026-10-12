'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { format, parseISO, isValid } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LoadingSkeleton } from '@/components/shared/LoadingSkeleton'
import { Badge } from '@/components/shared/Badge'
import { useRole } from '@/hooks/useAuth'
import { useBackSwipe } from '@/hooks/useMobileGestures'

import {
  StaffMember,
  StaffAttendanceSummary,
  getStaffMember,
  updateStaffProfile,
  getAttendanceSummary,
  getPayslipHistory,
  getWorkHistory
} from '@/lib/firebase/queries/staff'

const ROLE_ICONS: Record<string, string> = {
  photographer: 'ti-camera',
  photography:  'ti-camera',
  videographer: 'ti-video',
  videography:  'ti-video',
  editor:       'ti-wand',
  photoEditing: 'ti-camera',
  videoEditing: 'ti-video',
  albumDesign:  'ti-book',
  highlights:   'ti-sparkles',
  fullFilm:     'ti-film',
  designer:     'ti-pencil',
  drone:        'ti-drone',
  assistant:    'ti-user',
  lead_photo:   'ti-camera',
  lead_video:   'ti-video',
  staff:        'ti-user-check',
}

const ROLE_LABELS: Record<string, string> = {
  photographer: 'Photographer',
  photography:  'Photographer',
  videographer: 'Videographer',
  videography:  'Videographer',
  editor:       'Editor',
  photoEditing: 'Photo Editor',
  videoEditing: 'Video Editor',
  albumDesign:  'Album Designer',
  highlights:   'Highlights Editor',
  fullFilm:     'Full Film Editor',
  designer:     'Designer',
  drone:        'Drone Operator',
  assistant:    'Assistant',
  lead_photo:   'Lead Photo',
  lead_video:   'Lead Video',
  staff:        'Staff Member',
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
    if (isValid(parsed)) return format(parsed, 'd MMM yyyy')
    const d = new Date(dateStr)
    if (isValid(d)) return format(d, 'd MMM yyyy')
    return dateStr
  } catch {
    return dateStr
  }
}

type TabType = 'profile' | 'attendance' | 'payslips' | 'workHistory'

export default function StaffDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const uid = resolvedParams.id
  const router = useRouter()
  const { backSwipeHandlers } = useBackSwipe()

  const { isAdmin, isManager } = useRole()
  const canViewHours = isAdmin || isManager

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

  // Tabs State (On mobile: 'profile' | 'attendance' | 'payslips' | 'workHistory')
  const [activeTab, setActiveTab] = useState<TabType>('profile')
  const desktopTab = activeTab === 'profile' ? 'attendance' : activeTab
  
  // Tab Data States
  const [attDate, setAttDate] = useState<Date>(() => new Date())
  const [attData, setAttData] = useState<StaffAttendanceSummary | null>(null)
  const [loadingAtt, setLoadingAtt] = useState<boolean>(true)
  const [payData, setPayData] = useState<Array<{ payslipId: string; payslipNumber: string; month: number; year: number; netPay: number }>>([])
  const [workData, setWorkData] = useState<Array<{ projectId: string; eventName: string; eventDate: string; role: string; stage: string }>>([])
  
  const [loadingPay,  setLoadingPay]  = useState(false)
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

  // Load attendance summary whenever uid or attDate changes
  useEffect(() => {
    if (!uid) return
    let active = true
    getAttendanceSummary(uid, attDate.getFullYear(), attDate.getMonth() + 1)
      .then(data => {
        if (!active) return
        setAttData(data)
        setLoadingAtt(false)
      })
      .catch(() => {
        if (!active) return
        setLoadingAtt(false)
      })
    return () => {
      active = false
    }
  }, [uid, attDate])

  // Handle Tab Switch
  const handleTabClick = (tab: TabType) => {
    setActiveTab(tab)
    if (tab === 'payslips' && payData.length === 0 && !loadingPay) {
      setLoadingPay(true)
      getPayslipHistory(uid)
        .then(data => setPayData(data))
        .finally(() => setLoadingPay(false))
    }
    if (tab === 'workHistory' && workData.length === 0 && !loadingWork) {
      setLoadingWork(true)
      getWorkHistory(uid)
        .then(data => setWorkData(data))
        .finally(() => setLoadingWork(false))
    }
  }

  // Handle Save Profile
  const handleSave = async () => {
    setSaving(true)
    try {
      let parsedSalary: number | undefined
      if (form.baseSalary) {
        const cleaned = form.baseSalary.replace(/[^0-9.]/g, '')
        const num = parseFloat(cleaned)
        if (!isNaN(num)) parsedSalary = num
      }

      await updateStaffProfile(uid, {
        name:       form.name,
        contact:    form.contact,
        email:      form.email,
        jobTitle:   form.jobTitle,
        baseSalary: parsedSalary
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
      <div className="p-3.5 sm:p-6 md:p-6 w-full max-w-[1280px] mx-auto flex flex-col gap-4">
        <LoadingSkeleton lines={2} height="36px" gap="12px" />
        <div className="flex flex-col md:grid md:grid-cols-[38fr_62fr] gap-4">
          <LoadingSkeleton lines={6} height="36px" gap="10px" />
          <LoadingSkeleton lines={4} height="50px" gap="10px" />
        </div>
      </div>
    )
  }

  if (!staff) {
    return (
      <div className="p-3.5 sm:p-6 md:p-6 w-full max-w-[1280px] mx-auto flex flex-col items-center justify-center min-h-[400px] gap-4">
        <div style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--color-foreground)' }}>
          Staff member not found.
        </div>
        <Button onClick={() => router.push('/hrms/staff')}>
          Back to staff list
        </Button>
      </div>
    )
  }

  const initials = getInitials(staff.name)
  const formattedJoined = staff.joinDate ? format(staff.joinDate, 'd MMM yyyy') : '12 Mar 2022'
  const roleText = staff.jobTitle || (staff.role === 'manager' ? 'Manager' : 'Photographer')
  const statusText = staff.isActive ? 'Active' : 'Inactive'

  return (
    <div
      className="p-3.5 sm:p-6 md:p-6 w-full max-w-[1280px] mx-auto flex flex-col gap-4 sm:gap-5 pb-24 md:pb-6"
      {...backSwipeHandlers}
    >
      {/* Scoped CSS Rule: Enforces exact desktop 38fr 62fr side-by-side grid without relying on arbitrary tailwind classes */}
      <style>{`
        .staff-detail-grid {
          display: flex;
          flex-direction: column;
          gap: 16px;
          width: 100%;
        }
        @media (min-width: 768px) {
          .staff-detail-grid {
            display: grid !important;
            grid-template-columns: 38fr 62fr !important;
            gap: 16px !important;
            align-items: start !important;
          }
        }
        .att-summary-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 10px;
        }
        @media (min-width: 640px) {
          .att-summary-grid {
            grid-template-columns: repeat(4, 1fr) !important;
          }
        }
      `}</style>
      
      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
          <button
            type="button"
            onClick={() => router.push('/hrms/staff')}
            className="hidden md:flex"
            style={{
              background: 'transparent',
              border: 'none',
              padding: '6px',
              margin: '-6px 0 -6px -6px',
              cursor: 'pointer',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-foreground-muted)',
              borderRadius: '8px'
            }}
            title="Back to staff list"
          >
            <i className="ti ti-arrow-left" style={{ fontSize: '20px' }} />
          </button>

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

          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
            <div style={{
              fontSize: 'var(--text-2xl)',
              fontWeight: 700,
              letterSpacing: '-0.02em',
              lineHeight: 1.2,
              color: 'var(--color-foreground)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}>
              {staff.name}
            </div>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-foreground-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {roleText} · joined {formattedJoined} · {statusText}
            </div>
          </div>
        </div>

        <Badge
          variant={staff.isActive ? 'active' : 'service'}
          label={staff.isActive ? 'Active' : 'Inactive'}
        />
      </div>

      {/* Mobile Tab Bar (< 768px): Allows clean 1-tap switching on mobile */}
      <div className="flex md:hidden items-center gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {[
          { id: 'profile' as const, label: 'Profile', icon: 'ti-user' },
          { id: 'attendance' as const, label: 'Attendance', icon: 'ti-calendar-check' },
          { id: 'payslips' as const, label: 'Payslips', icon: 'ti-file-invoice' },
          { id: 'workHistory' as const, label: 'Work history', icon: 'ti-briefcase' },
        ].map(t => {
          const isSelected = activeTab === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => handleTabClick(t.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: '20px',
                fontSize: 'var(--text-xs)',
                fontWeight: isSelected ? 600 : 500,
                background: isSelected ? 'var(--color-primary)' : 'var(--color-surface-raised)',
                color: isSelected ? '#ffffff' : 'var(--color-foreground-muted)',
                border: isSelected ? 'none' : '0.5px solid var(--color-border)',
                whiteSpace: 'nowrap',
                cursor: 'pointer',
                transition: 'background 0.15s, color 0.15s',
                minHeight: '36px',
              }}
            >
              <i className={`ti ${t.icon}`} style={{ fontSize: '13px' }} />
              <span>{t.label}</span>
            </button>
          )
        })}
      </div>

      {/* Main Grid: 38% / 62% on Desktop, Single Selected Tab on Mobile */}
      <div className="staff-detail-grid">
        
        {/* Left Card: Profile Form (Always visible on desktop; on mobile visible when activeTab === 'profile') */}
        <div className={activeTab === 'profile' ? 'w-full' : 'hidden md:block w-full'}>
          <div style={{
            background: 'var(--color-surface)',
            border: '0.5px solid var(--color-border)',
            borderRadius: '12px',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            boxSizing: 'border-box',
            width: '100%'
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

            {/* Job title */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>
                Job title
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
              className="h-9 font-medium w-full mt-1"
              style={{ minHeight: '40px' }}
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save profile'}
            </Button>
          </div>
        </div>

        {/* Right Card: Tabs Container (Always visible on desktop; on mobile visible when activeTab !== 'profile') */}
        <div className={activeTab !== 'profile' ? 'w-full' : 'hidden md:block w-full'}>
          <div style={{
            background: 'var(--color-surface)',
            border: '0.5px solid var(--color-border)',
            borderRadius: '12px',
            overflow: 'hidden',
            width: '100%',
            boxSizing: 'border-box'
          }}>
            {/* Desktop Tabs Header (Hidden on Mobile) */}
            <div className="hidden md:flex border-b border-[var(--color-border)] px-3">
              {[
                { id: 'attendance', label: 'Attendance' },
                { id: 'payslips', label: 'Payslips' },
                { id: 'workHistory', label: 'Work history' }
              ].map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleTabClick(tab.id as typeof activeTab)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    borderBottom: desktopTab === tab.id ? '2px solid var(--color-primary)' : '2px solid transparent',
                    cursor: 'pointer',
                    padding: '12px 14px',
                    fontSize: 'var(--text-sm)',
                    fontWeight: 600,
                    color: desktopTab === tab.id ? 'var(--color-primary)' : 'var(--color-foreground-muted)',
                    transition: 'color 0.15s, border-color 0.15s',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab 1: Attendance */}
            {desktopTab === 'attendance' && (
              <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {/* Month Navigator */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    background: 'var(--color-surface-raised)',
                    border: '0.5px solid var(--color-border)',
                    borderRadius: '8px',
                    padding: '2px 4px'
                  }}>
                    <button
                      type="button"
                      onClick={() => {
                        setLoadingAtt(true)
                        setAttDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))
                      }}
                      style={{
                        width: '28px',
                        height: '28px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'transparent',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        color: 'var(--color-foreground-muted)'
                      }}
                      title="Previous month"
                    >
                      <i className="ti ti-chevron-left" style={{ fontSize: '15px' }} />
                    </button>
                    <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, padding: '0 8px', color: 'var(--color-foreground)', minWidth: '95px', textAlign: 'center' }}>
                      {format(attDate, 'MMMM yyyy')}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setLoadingAtt(true)
                        setAttDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))
                      }}
                      style={{
                        width: '28px',
                        height: '28px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'transparent',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        color: 'var(--color-foreground-muted)'
                      }}
                      title="Next month"
                    >
                      <i className="ti ti-chevron-right" style={{ fontSize: '15px' }} />
                    </button>
                  </div>
                </div>

                <div className="att-summary-grid">
                  {/* Present */}
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '2px',
                    background: 'var(--color-surface-raised)',
                    border: '0.5px solid var(--color-border)',
                    borderRadius: '10px',
                    padding: '12px 6px'
                  }}>
                    <span style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: 'var(--color-success)' }}>
                      {loadingAtt ? '—' : (attData?.present ?? 0)}
                    </span>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>
                      Present · {format(attDate, 'MMM')}
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
                    padding: '12px 6px'
                  }}>
                    <span style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: 'var(--color-secondary)' }}>
                      {loadingAtt ? '—' : (attData?.late ?? 0)}
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
                    padding: '12px 6px'
                  }}>
                    <span style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: 'var(--color-danger)' }}>
                      {loadingAtt ? '—' : (attData?.absent ?? 0)}
                    </span>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>
                      Absent
                    </span>
                  </div>

                  {/* Hours — only shown in admin/manager login */}
                  {canViewHours && (
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '2px',
                      background: 'var(--color-surface-raised)',
                      border: '0.5px solid var(--color-border)',
                      borderRadius: '10px',
                      padding: '12px 6px'
                    }}>
                      <span style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: 'var(--color-foreground)' }}>
                        {loadingAtt ? '—' : (attData?.hoursLabel ?? `${Math.floor((attData?.totalMinutes ?? 0) / 60)}h`)}
                      </span>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>
                        Hours
                      </span>
                    </div>
                  )}
                </div>

                <div>
                  <button
                    type="button"
                    onClick={() => router.push(`/hrms/attendance?staff=${uid}&month=${attDate.getMonth() + 1}&year=${attDate.getFullYear()}`)}
                    style={{
                      fontSize: 'var(--text-xs)',
                      color: 'var(--color-accent)',
                      cursor: 'pointer',
                      fontWeight: 500,
                      background: 'transparent',
                      border: 'none',
                      padding: '8px 0',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      minHeight: '40px'
                    }}
                  >
                    <span>Open attendance grid</span>
                    <i className="ti ti-arrow-right" style={{ fontSize: '13px' }} />
                  </button>
                </div>
              </div>
            )}

            {/* Tab 2: Payslips */}
            {desktopTab === 'payslips' && (
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
                          padding: '12px 8px',
                          borderBottom: '0.5px solid var(--color-border)',
                          cursor: 'pointer',
                          borderRadius: '6px',
                          minHeight: '44px'
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-raised)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <i className="ti ti-file-invoice" style={{ fontSize: '18px', color: 'var(--color-foreground-subtle)', flexShrink: 0 }} />
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                          <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-foreground)' }}>
                            {monthLabel}
                          </span>
                          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>
                            {p.payslipNumber}
                          </span>
                        </div>
                        <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--color-foreground)', flexShrink: 0 }}>
                          {formattedPay}
                        </span>
                        <i className="ti ti-chevron-right" style={{ fontSize: '14px', color: 'var(--color-foreground-subtle)', flexShrink: 0 }} />
                      </div>
                    )
                  })
                )}
              </div>
            )}

            {/* Tab 3: Work history */}
            {desktopTab === 'workHistory' && (
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
                          padding: '12px 8px',
                          borderBottom: '0.5px solid var(--color-border)',
                          minHeight: '44px'
                        }}
                      >
                        <i className={`ti ${icon}`} style={{ fontSize: '18px', color: 'var(--color-foreground-subtle)', flexShrink: 0 }} />
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                          <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {w.eventName}
                          </span>
                          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>
                            {roleLabel} · {formattedDate}
                          </span>
                        </div>

                        {/* Inline Stage Badge */}
                        <span style={{
                          fontSize: 'var(--text-xs)',
                          fontWeight: 600,
                          padding: '3px 8px',
                          borderRadius: '10px',
                          background: stageStyle.bg,
                          color: stageStyle.fg,
                          flexShrink: 0
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

    </div>
  )
}

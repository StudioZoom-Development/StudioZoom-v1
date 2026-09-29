'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/shared/EmptyState'
import { TableRowSkeleton } from '@/components/shared/LoadingSkeleton'
import { Freelancer, FreelancerPayout } from '@/types'
import {
  subscribeToFreelancers,
  getAllFreelancerPayouts,
  addFreelancer,
} from '@/lib/firebase/queries/freelancers'
import { useUIStore } from '@/store/uiStore'
import { useBackSwipe } from '@/hooks/useMobileGestures'

function getInitials(name: string): string {
  if (!name) return 'FL'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

const SKILL_COLORS: Record<string, { bg: string; fg: string }> = {
  photographer: { bg: 'var(--color-accent-muted)', fg: 'var(--color-accent)' },
  videographer: { bg: 'var(--color-secondary-muted)', fg: 'var(--color-secondary)' },
  editor:       { bg: 'var(--color-purple-muted)', fg: 'var(--color-purple)' },
  designer:     { bg: 'var(--color-primary-muted)', fg: 'var(--color-primary)' },
  other:        { bg: 'var(--color-surface-raised)', fg: 'var(--color-foreground-muted)' },
}

const SKILL_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'photographer', label: 'Photographer' },
  { key: 'videographer', label: 'Videographer' },
  { key: 'editor', label: 'Editor' },
  { key: 'designer', label: 'Designer' },
  { key: 'other', label: 'Others' },
]

export default function FreelancersListPage() {
  const router = useRouter()
  const { backSwipeHandlers } = useBackSwipe()
  const testDatasetMode = useUIStore(s => s.testDatasetMode)
  const testModeCutoff = useUIStore(s => s.testModeCutoff)
  const [freelancers, setFreelancers] = useState<Freelancer[]>([])
  const [payouts, setPayouts] = useState<FreelancerPayout[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [skillFilter, setSkillFilter] = useState('all')

  // Modal State
  const [showAddModal, setShowAddModal] = useState(() => {
    if (typeof window === 'undefined') return false
    return new URLSearchParams(window.location.search).get('action') === 'new'
  })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [formData, setFormData] = useState<{
    name: string
    skill: Freelancer['skill']
    dayRate: string
    contact: string
    notes: string
  }>({
    name: '',
    skill: 'photographer',
    dayRate: '6000',
    contact: '',
    notes: '',
  })

  // Subscribe to real-time freelancers
  useEffect(() => {
    const unsub = subscribeToFreelancers(data => {
      setFreelancers(data)
      setLoading(false)
    })
    return () => unsub()
  }, [testDatasetMode, testModeCutoff])

  // Load payouts to derive lastEngaged dates
  useEffect(() => {
    getAllFreelancerPayouts().then(setPayouts)
  }, [])

  // Map of freelancerId -> latest payout date
  const lastEngagedMap = useMemo(() => {
    const map = new Map<string, Date>()
    for (const p of payouts) {
      const existing = map.get(p.freelancerId)
      if (!existing || p.paidDate.getTime() > existing.getTime()) {
        map.set(p.freelancerId, p.paidDate)
      }
    }
    return map
  }, [payouts])

  // Filter logic
  const filteredFreelancers = useMemo(() => {
    return freelancers.filter(f => {
      const skillLower = (f.skill || '').toLowerCase()
      const matchesSkill =
        skillFilter === 'all' ||
        (skillFilter === 'other'
          ? skillLower === 'other' || !['photographer', 'videographer', 'editor', 'designer'].includes(skillLower)
          : skillLower === skillFilter.toLowerCase())
      const q = searchQuery.toLowerCase().trim()
      const matchesSearch = !q ||
        f.name?.toLowerCase().includes(q) ||
        f.contact?.toLowerCase().includes(q) ||
        f.skill?.toLowerCase().includes(q)
      return matchesSkill && matchesSearch
    })
  }, [freelancers, skillFilter, searchQuery])

  const handleOpenAddModal = () => {
    setFormData({
      name: '',
      skill: 'photographer',
      dayRate: '6000',
      contact: '',
      notes: '',
    })
    setFormError('')
    setShowAddModal(true)
  }

  const handleCreateFreelancer = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim()) {
      setFormError('Please enter freelancer full name')
      return
    }
    if (!formData.contact.trim()) {
      setFormError('Please enter contact number')
      return
    }

    setSaving(true)
    setFormError('')
    try {
      await addFreelancer({
        name: formData.name.trim(),
        skill: formData.skill,
        dayRate: Number(formData.dayRate) || 0,
        contact: formData.contact.trim(),
        notes: formData.notes.trim(),
      })
      setShowAddModal(false)
    } catch (err: unknown) {
      console.error('Failed to add freelancer:', err)
      setFormError(err instanceof Error ? err.message : 'Failed to add freelancer')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="p-3.5 sm:p-6 md:p-8 max-w-[1280px] mx-auto flex flex-col gap-4"
      style={{
        fontFamily: 'var(--font-inter)',
      }}
    >
      {/* Desktop Top Bar (≥768px): Invariant */}
      <div className="hidden md:flex items-center gap-2.5 flex-wrap">
        {/* Search */}
        <div style={{ position: 'relative' }}>
          <i
            className="ti ti-search"
            style={{
              fontSize: '15px',
              color: 'var(--color-foreground-subtle)',
              position: 'absolute',
              left: '10px',
              top: '50%',
              transform: 'translateY(-50%)',
              pointerEvents: 'none',
            }}
          />
          <input
            placeholder="Search by name"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              fontFamily: 'var(--font-inter)',
              width: '200px',
              boxSizing: 'border-box',
              height: '36px',
              background: 'var(--color-surface-raised)',
              border: '0.5px solid var(--color-border)',
              borderRadius: '8px',
              padding: '0 12px 0 30px',
              fontSize: 'var(--text-sm)',
              color: 'var(--color-foreground)',
              outline: 'none',
            }}
          />
        </div>

        {/* Skill Filter Chips */}
        {SKILL_FILTERS.map(f => {
          const isActive = skillFilter === f.key
          return (
            <span
              key={f.key}
              onClick={() => setSkillFilter(f.key)}
              style={{
                cursor: 'pointer',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                padding: '6px 12px',
                borderRadius: '16px',
                background: isActive ? 'var(--color-primary-muted)' : 'var(--color-surface)',
                color: isActive ? 'var(--color-primary)' : 'var(--color-foreground-muted)',
                border: `0.5px solid ${isActive ? 'var(--color-primary)' : 'var(--color-border)'}`,
                transition: 'all 0.15s ease',
                userSelect: 'none',
              }}
            >
              {f.label}
            </span>
          )
        })}

        <div style={{ flex: 1 }} />

        {/* Add Freelancer Button */}
        <Button className="h-9 font-medium" onClick={handleOpenAddModal}>
          ＋ Add freelancer
        </Button>
      </div>

      {/* Mobile Top Bar (<768px): Touch-optimized */}
      <div className="flex md:hidden flex-col gap-2.5">
        {/* Row 1: Search + Add Button */}
        <div className="flex items-center gap-2">
          <div style={{ position: 'relative', flex: 1 }}>
            <i
              className="ti ti-search"
              style={{
                fontSize: '15px',
                color: 'var(--color-foreground-subtle)',
                position: 'absolute',
                left: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                pointerEvents: 'none',
              }}
            />
            <input
              placeholder="Search freelancers..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                fontFamily: 'var(--font-inter)',
                width: '100%',
                boxSizing: 'border-box',
                height: '38px',
                background: 'var(--color-surface-raised)',
                border: '0.5px solid var(--color-border)',
                borderRadius: '10px',
                padding: '0 12px 0 32px',
                fontSize: 'var(--text-sm)',
                color: 'var(--color-foreground)',
                outline: 'none',
              }}
            />
          </div>

          <Button
            className="h-[38px] px-3.5 text-xs font-semibold shrink-0"
            onClick={handleOpenAddModal}
          >
            ＋ Add
          </Button>
        </div>

        {/* Row 2: Horizontal Scrolling Filter Chips */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            overflowX: 'auto',
            scrollbarWidth: 'none',
            WebkitOverflowScrolling: 'touch',
            paddingBottom: '2px',
          }}
        >
          {SKILL_FILTERS.map(f => {
            const isActive = skillFilter === f.key
            return (
              <span
                key={f.key}
                onClick={() => setSkillFilter(f.key)}
                style={{
                  cursor: 'pointer',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  padding: '6px 14px',
                  borderRadius: '16px',
                  background: isActive ? 'var(--color-primary-muted)' : 'var(--color-surface)',
                  color: isActive ? 'var(--color-primary)' : 'var(--color-foreground-muted)',
                  border: `0.5px solid ${isActive ? 'var(--color-primary)' : 'var(--color-border)'}`,
                  transition: 'all 0.15s ease',
                  userSelect: 'none',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                {f.label}
              </span>
            )
          })}
        </div>
      </div>

      {/* Freelancers Table Container (Desktop Invariance) */}
      <div
        className="hidden md:block"
        style={{
          background: 'var(--color-surface)',
          border: '0.5px solid var(--color-border)',
          borderRadius: '12px',
          overflow: 'hidden',
        }}
      >
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
                padding: '12px 16px',
                borderBottom: '0.5px solid var(--color-border-strong)',
              }}>
                Freelancer
              </th>
              <th style={{
                textAlign: 'left',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: 'var(--color-foreground-subtle)',
                padding: '12px 16px',
                borderBottom: '0.5px solid var(--color-border-strong)',
              }}>
                Skill
              </th>
              <th style={{
                textAlign: 'right',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: 'var(--color-foreground-subtle)',
                padding: '12px 16px',
                borderBottom: '0.5px solid var(--color-border-strong)',
              }}>
                Day rate
              </th>
              <th style={{
                textAlign: 'left',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: 'var(--color-foreground-subtle)',
                padding: '12px 16px',
                borderBottom: '0.5px solid var(--color-border-strong)',
              }}>
                Contact
              </th>
              <th style={{
                textAlign: 'left',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: 'var(--color-foreground-subtle)',
                padding: '12px 16px',
                borderBottom: '0.5px solid var(--color-border-strong)',
              }}>
                Last engaged
              </th>
              <th style={{
                textAlign: 'left',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: 'var(--color-foreground-subtle)',
                padding: '12px 16px',
                borderBottom: '0.5px solid var(--color-border-strong)',
              }}>
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableRowSkeleton rows={5} cols={6} />
            ) : filteredFreelancers.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '32px 0' }}>
                  <EmptyState
                    title="No freelancers found"
                    description={searchQuery || skillFilter !== 'all' ? 'Try adjusting your search or skill filter.' : 'Add your first freelancer to get started.'}
                  />
                </td>
              </tr>
            ) : (
              filteredFreelancers.map(f => {
                const skillLower = (f.skill || 'other').toLowerCase()
                const skillStyle = SKILL_COLORS[skillLower] || SKILL_COLORS.other
                const skillLabel = f.skill ? f.skill.charAt(0).toUpperCase() + f.skill.slice(1) : 'Other'
                const lastDate = lastEngagedMap.get(f.freelancerId)
                const formattedLast = lastDate ? format(lastDate, 'd MMM yyyy') : '—'
                const isItemActive = f.isActive !== false

                return (
                  <tr
                    key={f.freelancerId}
                    onClick={() => router.push(`/hrms/freelancers/${f.freelancerId}`)}
                    style={{
                      cursor: 'pointer',
                      transition: 'background 0.15s ease',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-raised)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    {/* Freelancer Name + Avatar */}
                    <td style={{
                      padding: '0 16px',
                      height: '48px',
                      borderBottom: '0.5px solid var(--color-border)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '50%',
                          background: 'var(--color-secondary-muted)',
                          color: 'var(--color-secondary)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '10px',
                          fontWeight: 700,
                          flexShrink: 0,
                        }}>
                          {getInitials(f.name)}
                        </div>
                        <span style={{ fontWeight: 600, color: 'var(--color-foreground)' }}>
                          {f.name}
                        </span>
                      </div>
                    </td>

                    {/* Skill Pill */}
                    <td style={{
                      padding: '0 16px',
                      height: '48px',
                      borderBottom: '0.5px solid var(--color-border)',
                    }}>
                      <span style={{
                        fontSize: 'var(--text-xs)',
                        fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: '10px',
                        background: skillStyle.bg,
                        color: skillStyle.fg,
                        display: 'inline-block',
                      }}>
                        {skillLabel}
                      </span>
                    </td>

                    {/* Day Rate */}
                    <td style={{
                      padding: '0 16px',
                      height: '48px',
                      borderBottom: '0.5px solid var(--color-border)',
                      textAlign: 'right',
                      fontWeight: 600,
                      color: 'var(--color-foreground)',
                    }}>
                      ₹{(f.dayRate || 0).toLocaleString('en-IN')}
                    </td>

                    {/* Contact */}
                    <td style={{
                      padding: '0 16px',
                      height: '48px',
                      borderBottom: '0.5px solid var(--color-border)',
                      color: 'var(--color-foreground-muted)',
                    }}>
                      {f.contact || '—'}
                    </td>

                    {/* Last Engaged */}
                    <td style={{
                      padding: '0 16px',
                      height: '48px',
                      borderBottom: '0.5px solid var(--color-border)',
                      color: 'var(--color-foreground-muted)',
                    }}>
                      {formattedLast}
                    </td>

                    {/* Status Dot */}
                    <td style={{
                      padding: '0 16px',
                      height: '48px',
                      borderBottom: '0.5px solid var(--color-border)',
                    }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: 'var(--text-xs)',
                        color: 'var(--color-foreground-muted)',
                      }}>
                        <span style={{
                          width: '7px',
                          height: '7px',
                          borderRadius: '50%',
                          background: isItemActive ? 'var(--color-success)' : 'var(--color-foreground-subtle)',
                        }} />
                        {isItemActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Card List (Compact Cards & Touch Gestures) */}
      <div className="flex flex-col md:hidden gap-3 pb-24" {...backSwipeHandlers}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {[1, 2, 3, 4].map(i => (
              <div
                key={i}
                style={{
                  height: '110px',
                  background: 'var(--color-surface)',
                  borderRadius: '12px',
                  border: '0.5px solid var(--color-border)',
                }}
              />
            ))}
          </div>
        ) : filteredFreelancers.length === 0 ? (
          <div style={{
            background: 'var(--color-surface)',
            borderRadius: '12px',
            border: '0.5px solid var(--color-border)',
            padding: '32px 16px',
          }}>
            <EmptyState
              title="No freelancers found"
              description={searchQuery || skillFilter !== 'all' ? 'Try adjusting your search or skill filter.' : 'Add your first freelancer to get started.'}
            />
          </div>
        ) : (
          filteredFreelancers.map(f => {
            const skillLower = (f.skill || 'other').toLowerCase()
            const skillStyle = SKILL_COLORS[skillLower] || SKILL_COLORS.other
            const skillLabel = f.skill ? f.skill.charAt(0).toUpperCase() + f.skill.slice(1) : 'Other'
            const lastDate = lastEngagedMap.get(f.freelancerId)
            const formattedLast = lastDate ? format(lastDate, 'd MMM yyyy') : '—'
            const isItemActive = f.isActive !== false

            return (
              <div
                key={f.freelancerId}
                onClick={() => router.push(`/hrms/freelancers/${f.freelancerId}`)}
                style={{
                  background: 'var(--color-surface)',
                  border: '0.5px solid var(--color-border)',
                  borderRadius: '12px',
                  padding: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  cursor: 'pointer',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                }}
              >
                {/* Header: Avatar, Name, Skill, Status Dot */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      background: 'var(--color-secondary-muted)',
                      color: 'var(--color-secondary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '11px',
                      fontWeight: 700,
                      flexShrink: 0,
                    }}>
                      {getInitials(f.name)}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--color-foreground)' }}>
                        {f.name}
                      </div>
                      <div style={{ marginTop: '2px' }}>
                        <span style={{
                          fontSize: '10px',
                          fontWeight: 600,
                          padding: '1px 6px',
                          borderRadius: '8px',
                          background: skillStyle.bg,
                          color: skillStyle.fg,
                          display: 'inline-block',
                        }}>
                          {skillLabel}
                        </span>
                      </div>
                    </div>
                  </div>

                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    fontSize: 'var(--text-xs)',
                    color: 'var(--color-foreground-muted)',
                    padding: '4px 8px',
                    borderRadius: '12px',
                    background: 'var(--color-surface-raised)',
                  }}>
                    <span style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: isItemActive ? 'var(--color-success)' : 'var(--color-foreground-subtle)',
                    }} />
                    {isItemActive ? 'Active' : 'Inactive'}
                  </span>
                </div>

                {/* Details Pill Row */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'var(--color-surface-raised)',
                  borderRadius: '8px',
                  padding: '8px 12px',
                  fontSize: 'var(--text-xs)',
                }}>
                  <div>
                    <span style={{ color: 'var(--color-foreground-subtle)', marginRight: '6px' }}>Day rate:</span>
                    <span style={{ color: 'var(--color-foreground)', fontWeight: 600 }}>
                      ₹{(f.dayRate || 0).toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--color-foreground-subtle)', marginRight: '6px' }}>Last engaged:</span>
                    <span style={{ color: 'var(--color-foreground-muted)' }}>{formattedLast}</span>
                  </div>
                </div>

                {/* Footer Actions */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderTop: '0.5px solid var(--color-border)',
                    paddingTop: '8px',
                  }}
                  onClick={e => e.stopPropagation()}
                >
                  {f.contact ? (
                    <a
                      href={`tel:${f.contact}`}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        color: 'var(--color-primary)',
                        fontSize: 'var(--text-xs)',
                        fontWeight: 600,
                        textDecoration: 'none',
                      }}
                    >
                      <i className="ti ti-phone" style={{ fontSize: '14px' }} />
                      <span>{f.contact}</span>
                    </a>
                  ) : (
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>No contact</span>
                  )}

                  <button
                    onClick={() => router.push(`/hrms/freelancers/${f.freelancerId}`)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--color-accent)',
                      fontSize: 'var(--text-xs)',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '4px 0',
                    }}
                  >
                    <span>Details</span>
                    <i className="ti ti-chevron-right" style={{ fontSize: '12px' }} />
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Add Freelancer Modal Overlay */}
      {showAddModal && (
        <div
          onClick={() => setShowAddModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--color-surface-overlay)',
              border: '0.5px solid var(--color-border)',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '480px',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, margin: 0, color: 'var(--color-foreground)' }}>
                Add Freelancer
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-foreground-muted)',
                  cursor: 'pointer',
                  fontSize: '18px',
                  padding: '4px',
                }}
              >
                <i className="ti ti-x" />
              </button>
            </div>

            {formError && (
              <div style={{
                background: 'var(--color-danger-muted)',
                color: 'var(--color-danger)',
                padding: '8px 12px',
                borderRadius: '6px',
                fontSize: 'var(--text-xs)',
              }}>
                {formError}
              </div>
            )}

            <form onSubmit={handleCreateFreelancer} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Full Name */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)', fontWeight: 500 }}>
                  Full name *
                </label>
                <Input
                  required
                  placeholder="e.g. Guna V"
                  value={formData.name}
                  onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
                />
              </div>

              {/* Skill */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)', fontWeight: 500 }}>
                  Skill *
                </label>
                <select
                  value={formData.skill}
                  onChange={e => setFormData(p => ({ ...p, skill: e.target.value as Freelancer['skill'] }))}
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
                  <option value="photographer">Photographer</option>
                  <option value="videographer">Videographer</option>
                  <option value="editor">Editor</option>
                  <option value="designer">Designer</option>
                  <option value="other">Other</option>
                </select>
              </div>

              {/* Day Rate */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)', fontWeight: 500 }}>
                  Day rate (₹) *
                </label>
                <Input
                  type="number"
                  required
                  min="0"
                  placeholder="6000"
                  value={formData.dayRate}
                  onChange={e => setFormData(p => ({ ...p, dayRate: e.target.value }))}
                />
              </div>

              {/* Contact */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)', fontWeight: 500 }}>
                  Contact *
                </label>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  background: 'var(--color-surface-raised)',
                  border: '0.5px solid var(--color-border)',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  height: '36px',
                }}>
                  <div style={{
                    padding: '0 10px',
                    fontSize: 'var(--text-sm)',
                    color: 'var(--color-foreground-muted)',
                    background: 'var(--color-surface)',
                    borderRight: '0.5px solid var(--color-border)',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                  }}>
                    +91
                  </div>
                  <input
                    type="tel"
                    required
                    placeholder="98411 20345"
                    value={formData.contact.replace(/^\+91\s*/, '')}
                    onChange={e => setFormData(p => ({ ...p, contact: e.target.value }))}
                    style={{
                      fontFamily: 'var(--font-inter)',
                      flex: 1,
                      height: '100%',
                      background: 'transparent',
                      border: 'none',
                      padding: '0 10px',
                      fontSize: 'var(--text-sm)',
                      color: 'var(--color-foreground)',
                      outline: 'none',
                    }}
                  />
                </div>
              </div>

              {/* Notes */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)', fontWeight: 500 }}>
                  Notes (optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Strong candid work. Own Sony kit."
                  value={formData.notes}
                  onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))}
                  style={{
                    fontFamily: 'var(--font-inter)',
                    background: 'var(--color-surface-raised)',
                    border: '0.5px solid var(--color-border)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    fontSize: 'var(--text-sm)',
                    color: 'var(--color-foreground)',
                    outline: 'none',
                    resize: 'vertical',
                    lineHeight: 1.5,
                  }}
                />
              </div>

              {/* Modal Footer */}
              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2.5 mt-3">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full sm:w-auto h-10 sm:h-9"
                  onClick={() => setShowAddModal(false)}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="w-full sm:w-auto h-10 sm:h-9 font-medium"
                  disabled={saving}
                >
                  {saving ? 'Adding...' : 'Add freelancer'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

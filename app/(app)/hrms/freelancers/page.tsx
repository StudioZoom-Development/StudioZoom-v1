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
]

import { useRolePermissions } from '@/hooks/useRole'

export default function FreelancersListPage() {
  const router = useRouter()
  const { isAdminOrManager } = useRolePermissions()
  const [freelancers, setFreelancers] = useState<Freelancer[]>([])
  const [payouts, setPayouts] = useState<FreelancerPayout[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [skillFilter, setSkillFilter] = useState('all')

  // Modal State
  const [showAddModal, setShowAddModal] = useState(false)
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
  }, [])

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
      const matchesSkill = skillFilter === 'all' || f.skill.toLowerCase() === skillFilter.toLowerCase()
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
    <div style={{
      padding: '24px',
      maxWidth: '1280px',
      margin: '0 auto',
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
      fontFamily: 'var(--font-inter)',
    }}>
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 w-full">
        {/* Search */}
        <div className="relative w-full sm:w-auto">
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
            className="w-full sm:w-[200px]"
            style={{
              fontFamily: 'var(--font-inter)',
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
        <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
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
        </div>

        <div className="hidden sm:block sm:flex-1" />

        {/* Add Freelancer Button */}
        <Button className="h-9 font-medium w-full sm:w-auto" onClick={handleOpenAddModal}>
          ＋ Add freelancer
        </Button>
      </div>

      {/* Freelancers Table Container */}
      <div style={{
        background: 'var(--color-surface)',
        border: '0.5px solid var(--color-border)',
        borderRadius: '12px',
        overflow: 'hidden',
      }}>
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', width: '100%' }}>
          <table style={{ width: '100%', minWidth: isAdminOrManager ? '640px' : '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
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
      </div>

      {/* Add Freelancer Modal Overlay */}
      {showAddModal && (
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
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowAddModal(false)}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
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

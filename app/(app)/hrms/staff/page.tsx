'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { ConfirmModal } from '@/components/shared/ConfirmModal'
import { EmptyState } from '@/components/shared/EmptyState'
import { TableRowSkeleton } from '@/components/shared/LoadingSkeleton'
import { Badge } from '@/components/shared/Badge'
import {
  StaffMember,
  subscribeToStaff,
  deactivateStaff,
  reactivateStaff,
} from '@/lib/firebase/queries/staff'
import { useUIStore } from '@/store/uiStore'
import { useBackSwipe } from '@/hooks/useMobileGestures'

function getInitials(name: string): string {
  if (!name) return 'SP'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export default function StaffListPage() {
  const router = useRouter()
  const { backSwipeHandlers } = useBackSwipe()
  const testDatasetMode = useUIStore(s => s.testDatasetMode)
  const testModeCutoff = useUIStore(s => s.testModeCutoff)
  const [staffList, setStaffList] = useState<StaffMember[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')

  // Deactivate modal state
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null)
  const [deactivating, setDeactivating] = useState(false)

  useEffect(() => {
    const unsub = subscribeToStaff((data) => {
      setStaffList(data)
      setLoading(false)
    })
    return () => unsub()
  }, [testDatasetMode, testModeCutoff])

  const totalCount = staffList.length
  const activeCount = staffList.filter(s => s.isActive).length
  const inactiveCount = totalCount - activeCount

  const filteredStaff = staffList.filter(member => {
    if (statusFilter === 'active' && !member.isActive) return false
    if (statusFilter === 'inactive' && member.isActive) return false
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    const nameMatch = member.name?.toLowerCase().includes(q)
    const titleMatch = member.jobTitle?.toLowerCase().includes(q)
    const emailMatch = member.email?.toLowerCase().includes(q)
    return Boolean(nameMatch || titleMatch || emailMatch)
  })

  const handleDeactivateConfirm = async () => {
    if (!selectedStaff) return
    setDeactivating(true)
    try {
      if (selectedStaff.isActive) {
        await deactivateStaff(selectedStaff.uid)
      } else {
        await reactivateStaff(selectedStaff.uid)
      }
      setSelectedStaff(null)
    } catch (err) {
      console.error('Failed to toggle staff active status:', err)
    } finally {
      setDeactivating(false)
    }
  }

  return (
    <div className="p-3.5 sm:p-6 md:p-6 w-full max-w-[1280px] mx-auto flex flex-col gap-4 sm:gap-5 pb-24 md:pb-6">
      
      {/* Desktop Top Bar (≥ 768px) */}
      <div className="hidden md:flex items-center gap-2.5">
        <div style={{ position: 'relative' }}>
          <i className="ti ti-search" style={{
            fontSize: '15px',
            color: 'var(--color-foreground-subtle)',
            position: 'absolute',
            left: '10px',
            top: '50%',
            transform: 'translateY(-50%)',
            pointerEvents: 'none'
          }} />
          <input
            placeholder="Search staff"
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
              outline: 'none'
            }}
          />
        </div>
        <div style={{ flex: 1 }} />
        <Button className="h-9 font-medium" onClick={() => router.push('/settings/users/new')}>
          ＋ Add staff
        </Button>
      </div>

      {/* Mobile Header & Controls (< 768px) */}
      <div className="flex md:hidden flex-col gap-3">
        {/* Title Row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <h1 style={{
              fontSize: 'var(--text-xl)',
              fontWeight: 700,
              letterSpacing: '-0.02em',
              color: 'var(--color-foreground)',
              margin: 0
            }}>
              Staff
            </h1>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '2px 8px',
              borderRadius: '12px',
              background: 'var(--color-success-muted)',
              color: 'var(--color-success)',
              fontSize: 'var(--text-xs)',
              fontWeight: 600
            }}>
              {activeCount} Active
            </span>
          </div>
          <Button
            className="h-9 font-medium text-xs px-3"
            onClick={() => router.push('/settings/users/new')}
          >
            ＋ Add staff
          </Button>
        </div>

        {/* Mobile Search Bar */}
        <div style={{ position: 'relative', width: '100%' }}>
          <i className="ti ti-search" style={{
            fontSize: '15px',
            color: 'var(--color-foreground-subtle)',
            position: 'absolute',
            left: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            pointerEvents: 'none'
          }} />
          <input
            placeholder="Search by name, role or email…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              fontFamily: 'var(--font-inter)',
              width: '100%',
              boxSizing: 'border-box',
              height: '40px',
              background: 'var(--color-surface-raised)',
              border: '0.5px solid var(--color-border)',
              borderRadius: '10px',
              padding: '0 36px 0 36px',
              fontSize: 'var(--text-sm)',
              color: 'var(--color-foreground)',
              outline: 'none'
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{
                position: 'absolute',
                right: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'transparent',
                border: 'none',
                color: 'var(--color-foreground-muted)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '4px'
              }}
            >
              <i className="ti ti-x" style={{ fontSize: '14px' }} />
            </button>
          )}
        </div>

        {/* Status Filter Chips */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
          {[
            { id: 'all' as const, label: `All (${totalCount})` },
            { id: 'active' as const, label: `Active (${activeCount})` },
            { id: 'inactive' as const, label: `Inactive (${inactiveCount})` }
          ].map(f => {
            const isSelected = statusFilter === f.id
            return (
              <button
                key={f.id}
                onClick={() => setStatusFilter(f.id)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '20px',
                  fontSize: 'var(--text-xs)',
                  fontWeight: isSelected ? 600 : 500,
                  background: isSelected ? 'var(--color-primary)' : 'var(--color-surface-raised)',
                  color: isSelected ? '#ffffff' : 'var(--color-foreground-muted)',
                  border: isSelected ? 'none' : '0.5px solid var(--color-border)',
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                  transition: 'background 0.15s, color 0.15s'
                }}
              >
                {f.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Staff Table Container (Desktop Invariance ≥ 768px) */}
      <div
        className="hidden md:block"
        style={{
          background: 'var(--color-surface)',
          border: '0.5px solid var(--color-border)',
          borderRadius: '12px',
          overflow: 'hidden'
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
                borderBottom: '0.5px solid var(--color-border-strong)'
              }}>
                STAFF
              </th>
              <th style={{
                textAlign: 'left',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: 'var(--color-foreground-subtle)',
                padding: '12px 16px',
                borderBottom: '0.5px solid var(--color-border-strong)'
              }}>
                JOB TITLE
              </th>
              <th style={{
                textAlign: 'left',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: 'var(--color-foreground-subtle)',
                padding: '12px 16px',
                borderBottom: '0.5px solid var(--color-border-strong)'
              }}>
                JOIN DATE
              </th>
              <th style={{
                textAlign: 'right',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: 'var(--color-foreground-subtle)',
                padding: '12px 16px',
                borderBottom: '0.5px solid var(--color-border-strong)'
              }}>
                BASE SALARY
              </th>
              <th style={{
                textAlign: 'left',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: 'var(--color-foreground-subtle)',
                padding: '12px 16px',
                borderBottom: '0.5px solid var(--color-border-strong)'
              }}>
                STATUS
              </th>
              <th style={{
                borderBottom: '0.5px solid var(--color-border-strong)',
                padding: '12px 16px'
              }} />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableRowSkeleton rows={6} cols={6} />
            ) : filteredStaff.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <EmptyState
                    icon="ti-id-badge-2"
                    title={searchQuery ? 'No matching staff members' : 'No staff members found'}
                    description={searchQuery ? 'Try adjusting your search query.' : 'Get started by adding your first staff member.'}
                    action={!searchQuery ? { label: '＋ Add staff', onClick: () => router.push('/settings/users/new') } : undefined}
                  />
                </td>
              </tr>
            ) : (
              filteredStaff.map((member) => {
                const initials = getInitials(member.name)
                const formattedDate = member.joinDate ? format(member.joinDate, 'd MMM yyyy') : '—'
                const formattedSalary = member.baseSalary !== undefined
                  ? '₹' + member.baseSalary.toLocaleString('en-IN')
                  : '—'

                return (
                  <tr
                    key={member.uid}
                    style={{ cursor: 'pointer' }}
                    onClick={() => router.push(`/hrms/staff/${member.uid}`)}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-raised)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    {/* STAFF Column */}
                    <td style={{ padding: '0 16px', height: '48px', borderBottom: '0.5px solid var(--color-border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '50%',
                          background: 'var(--color-primary-muted)',
                          color: 'var(--color-primary)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '10px',
                          fontWeight: 700,
                          flexShrink: 0
                        }}>
                          {initials}
                        </div>
                        <span style={{ fontWeight: 600, color: 'var(--color-foreground)' }}>
                          {member.name}
                        </span>
                      </div>
                    </td>

                    {/* ROLE Column */}
                    <td style={{ padding: '0 16px', height: '48px', borderBottom: '0.5px solid var(--color-border)', color: 'var(--color-foreground-muted)' }}>
                      {member.jobTitle || (member.role === 'manager' ? 'Manager' : 'Staff')}
                    </td>

                    {/* JOIN DATE Column */}
                    <td style={{ padding: '0 16px', height: '48px', borderBottom: '0.5px solid var(--color-border)', color: 'var(--color-foreground-muted)' }}>
                      {formattedDate}
                    </td>

                    {/* BASE SALARY Column */}
                    <td style={{ padding: '0 16px', height: '48px', borderBottom: '0.5px solid var(--color-border)', textAlign: 'right', fontWeight: 600, color: 'var(--color-foreground)' }}>
                      {formattedSalary}
                    </td>

                    {/* STATUS Column */}
                    <td style={{ padding: '0 16px', height: '48px', borderBottom: '0.5px solid var(--color-border)' }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: 'var(--text-xs)',
                        color: 'var(--color-foreground-muted)'
                      }}>
                        <span style={{
                          width: '7px',
                          height: '7px',
                          borderRadius: '50%',
                          background: member.isActive ? 'var(--color-success)' : 'var(--color-foreground-subtle)'
                        }} />
                        {member.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>

                    {/* DEACTIVATE Column */}
                    <td
                      style={{ padding: '0 16px', height: '48px', borderBottom: '0.5px solid var(--color-border)', textAlign: 'right' }}
                      onClick={e => e.stopPropagation()}
                    >
                      <span
                        onClick={() => setSelectedStaff(member)}
                        style={{
                          fontSize: 'var(--text-xs)',
                          color: member.isActive ? 'var(--color-danger)' : 'var(--color-success)',
                          cursor: 'pointer',
                          fontWeight: 500
                        }}
                      >
                        {member.isActive ? 'Deactivate' : 'Reactivate'}
                      </span>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Card List (< 768px) */}
      <div className="flex flex-col md:hidden gap-3" {...backSwipeHandlers}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {[1, 2, 3, 4].map(i => (
              <div key={i} style={{
                height: '130px',
                background: 'var(--color-surface)',
                borderRadius: '12px',
                border: '0.5px solid var(--color-border)',
              }} />
            ))}
          </div>
        ) : filteredStaff.length === 0 ? (
          <div style={{
            background: 'var(--color-surface)',
            borderRadius: '12px',
            border: '0.5px solid var(--color-border)',
            padding: '32px 16px',
          }}>
            <EmptyState
              icon="ti-id-badge-2"
              title={searchQuery || statusFilter !== 'all' ? 'No matching staff members' : 'No staff members found'}
              description={searchQuery || statusFilter !== 'all' ? 'Try adjusting your search query or status filter.' : 'Get started by adding your first staff member.'}
              action={searchQuery || statusFilter !== 'all'
                ? { label: 'Reset filters', onClick: () => { setSearchQuery(''); setStatusFilter('all') } }
                : { label: '＋ Add staff', onClick: () => router.push('/settings/users/new') }}
            />
          </div>
        ) : (
          filteredStaff.map(member => {
            const initials = getInitials(member.name)
            const formattedDate = member.joinDate ? format(member.joinDate, 'd MMM yyyy') : '—'
            const formattedSalary = member.baseSalary !== undefined
              ? '₹' + member.baseSalary.toLocaleString('en-IN')
              : '—'
            const roleDisplay = member.jobTitle || (member.role === 'manager' ? 'Manager' : 'Staff')

            return (
              <div
                key={member.uid}
                onClick={() => router.push(`/hrms/staff/${member.uid}`)}
                style={{
                  background: 'var(--color-surface)',
                  border: '0.5px solid var(--color-border)',
                  borderLeft: member.isActive ? '3.5px solid var(--color-success)' : '3.5px solid var(--color-foreground-subtle)',
                  borderRadius: '12px',
                  padding: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  cursor: 'pointer',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
                }}
              >
                {/* Header: Avatar, Name, Role, Status Pill */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                    <div style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '50%',
                      background: 'var(--color-primary-muted)',
                      color: 'var(--color-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '11px',
                      fontWeight: 700,
                      flexShrink: 0,
                    }}>
                      {initials}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{
                        fontWeight: 600,
                        fontSize: 'var(--text-sm)',
                        color: 'var(--color-foreground)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {member.name}
                      </div>
                      <div style={{
                        fontSize: 'var(--text-xs)',
                        color: 'var(--color-foreground-muted)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}>
                        <i className="ti ti-briefcase" style={{ fontSize: '11px' }} />
                        <span>{roleDisplay}</span>
                      </div>
                    </div>
                  </div>

                  <Badge
                    variant={member.isActive ? 'active' : 'service'}
                    label={member.isActive ? 'Active' : 'Inactive'}
                  />
                </div>

                {/* Optional Contact Quick Links */}
                {(member.contact || member.email) && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      flexWrap: 'wrap'
                    }}
                    onClick={e => e.stopPropagation()}
                  >
                    {member.contact && (
                      <a
                        href={`tel:${member.contact}`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: 'var(--text-xs)',
                          color: 'var(--color-accent)',
                          background: 'var(--color-surface-raised)',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          textDecoration: 'none'
                        }}
                      >
                        <i className="ti ti-phone" style={{ fontSize: '11px' }} />
                        <span>{member.contact}</span>
                      </a>
                    )}
                    {member.email && (
                      <a
                        href={`mailto:${member.email}`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: 'var(--text-xs)',
                          color: 'var(--color-foreground-muted)',
                          background: 'var(--color-surface-raised)',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          textDecoration: 'none',
                          maxWidth: '180px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        <i className="ti ti-mail" style={{ fontSize: '11px' }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{member.email}</span>
                      </a>
                    )}
                  </div>
                )}

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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <i className="ti ti-calendar" style={{ fontSize: '12px', color: 'var(--color-foreground-subtle)' }} />
                    <span style={{ color: 'var(--color-foreground-subtle)' }}>Joined:</span>
                    <span style={{ color: 'var(--color-foreground)', fontWeight: 500 }}>{formattedDate}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <span style={{ color: 'var(--color-foreground-subtle)' }}>Base:</span>
                    <span style={{ color: 'var(--color-foreground)', fontWeight: 600 }}>{formattedSalary}</span>
                  </div>
                </div>

                {/* Card Action Footer */}
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
                  <button
                    onClick={() => router.push(`/hrms/staff/${member.uid}`)}
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
                      padding: '8px 4px',
                      minHeight: '40px'
                    }}
                  >
                    <span>View Profile</span>
                    <i className="ti ti-chevron-right" style={{ fontSize: '12px' }} />
                  </button>

                  <button
                    onClick={() => setSelectedStaff(member)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: member.isActive ? 'var(--color-danger)' : 'var(--color-success)',
                      fontSize: 'var(--text-xs)',
                      fontWeight: 600,
                      cursor: 'pointer',
                      padding: '8px 12px',
                      minHeight: '40px'
                    }}
                  >
                    {member.isActive ? 'Deactivate' : 'Reactivate'}
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>

      <ConfirmModal
        open={Boolean(selectedStaff)}
        title={selectedStaff?.isActive ? `Deactivate ${selectedStaff?.name}?` : `Reactivate ${selectedStaff?.name}?`}
        description={selectedStaff?.isActive
          ? 'Deactivating this staff member will mark them as inactive in the system. Their historical attendance and payslip records will remain preserved.'
          : 'Reactivating this staff member will mark them as active again in the system.'}
        confirmLabel={selectedStaff?.isActive ? 'Deactivate' : 'Reactivate'}
        onConfirm={handleDeactivateConfirm}
        onCancel={() => setSelectedStaff(null)}
        loading={deactivating}
      />
    </div>
  )
}


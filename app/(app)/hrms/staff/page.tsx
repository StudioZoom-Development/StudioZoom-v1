'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { ConfirmModal } from '@/components/shared/ConfirmModal'
import { EmptyState } from '@/components/shared/EmptyState'
import { TableRowSkeleton } from '@/components/shared/LoadingSkeleton'
import {
  StaffMember,
  subscribeToStaff,
  deactivateStaff,
  reactivateStaff,
} from '@/lib/firebase/queries/staff'

import { useRolePermissions } from '@/hooks/useRole'

function getInitials(name: string): string {
  if (!name) return 'SP'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export default function StaffListPage() {
  const router = useRouter()
  const { isAdminOrManager } = useRolePermissions()
  const [staffList, setStaffList] = useState<StaffMember[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  // Deactivate modal state
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null)
  const [deactivating, setDeactivating] = useState(false)

  useEffect(() => {
    const unsub = subscribeToStaff((data) => {
      setStaffList(data)
      setLoading(false)
    })
    return () => unsub()
  }, [])

  const filteredStaff = staffList.filter(member => {
    const q = searchQuery.toLowerCase()
    const nameMatch = member.name?.toLowerCase().includes(q)
    const titleMatch = member.jobTitle?.toLowerCase().includes(q)
    const emailMatch = member.email?.toLowerCase().includes(q)
    return nameMatch || titleMatch || emailMatch
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
    <div style={{ padding: '24px', maxWidth: '1280px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 w-full">
        <div className="relative w-full sm:w-auto">
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
              outline: 'none'
            }}
          />
        </div>
        <div className="hidden sm:block sm:flex-1" />
        <Button className="h-9 font-medium w-full sm:w-auto" onClick={() => router.push('/settings/users/new')}>
          ＋ Add staff
        </Button>
      </div>

      {/* Staff Table Container */}
      <div style={{
        background: 'var(--color-surface)',
        border: '0.5px solid var(--color-border)',
        borderRadius: '12px',
        overflow: 'hidden'
      }}>
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', width: '100%' }}>
          <table style={{ width: '100%', minWidth: isAdminOrManager ? '600px' : '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
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
                ROLE
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
          </tbody>
        </table>
        </div>
      </div>

      {/* Deactivate/Reactivate Confirmation Modal */}
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

'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ConfirmModal } from '@/components/shared/ConfirmModal'
import { EmptyState } from '@/components/shared/EmptyState'
import { TableRowSkeleton } from '@/components/shared/LoadingSkeleton'
import {
  StaffMember,
  subscribeToStaff,
  deactivateStaff,
  reactivateStaff,
  addStaffMember,
  NewStaffInput
} from '@/lib/firebase/queries/staff'

const JOB_TITLE_OPTIONS = [
  'Photographer',
  'Videographer',
  'Editor',
  'Designer',
  'Drone Operator',
  'Assistant',
  'Other'
]

function getInitials(name: string): string {
  if (!name) return 'SP'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

const SELECT_STYLE: React.CSSProperties = {
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
}

export default function StaffListPage() {
  const router = useRouter()
  const [staffList, setStaffList] = useState<StaffMember[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  // Add staff modal state
  const [showAddModal, setShowAddModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState<NewStaffInput>({
    name: '',
    email: '',
    contact: '',
    jobTitle: 'Photographer',
    role: 'staff',
    joinDate: new Date().toISOString().split('T')[0],
    baseSalary: 28000
  })

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

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim() || !formData.email.trim()) return
    setSaving(true)
    try {
      await addStaffMember(formData)
      setShowAddModal(false)
      setFormData({
        name: '',
        email: '',
        contact: '',
        jobTitle: 'Photographer',
        role: 'staff',
        joinDate: new Date().toISOString().split('T')[0],
        baseSalary: 28000
      })
    } catch (err) {
      console.error('Failed to add staff:', err)
    } finally {
      setSaving(false)
    }
  }

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
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
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
        <Button className="h-9 font-medium" onClick={() => setShowAddModal(true)}>
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
                    action={!searchQuery ? { label: '＋ Add staff', onClick: () => setShowAddModal(true) } : undefined}
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

      {/* Add Staff Modal */}
      {showAddModal && (
        <div
          onClick={() => setShowAddModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '520px',
              background: 'var(--color-surface-overlay)',
              border: '0.5px solid var(--color-border)',
              borderRadius: '16px',
              padding: '28px',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px'
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--color-foreground)' }}>
                Add staff member
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>
                Creates a new team member record
              </div>
            </div>

            {/* Form Fields */}
            <form onSubmit={handleAddSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              {/* Full Name */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>
                  Full name
                </label>
                <Input
                  required
                  placeholder="e.g. Siva Prakash"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="h-9"
                />
              </div>

              {/* Email + Contact (2-col grid) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>
                    Email
                  </label>
                  <Input
                    required
                    type="email"
                    placeholder="siva@studiozoom.in"
                    value={formData.email}
                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                    className="h-9"
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>
                    Contact
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{
                      height: '36px',
                      display: 'flex',
                      alignItems: 'center',
                      padding: '0 10px',
                      background: 'var(--color-surface-overlay)',
                      border: '0.5px solid var(--color-border)',
                      borderRight: 'none',
                      borderRadius: '8px 0 0 8px',
                      fontSize: 'var(--text-sm)',
                      color: 'var(--color-foreground-muted)',
                      boxSizing: 'border-box'
                    }}>
                      +91
                    </span>
                    <input
                      placeholder="98400 11223"
                      value={formData.contact}
                      onChange={e => setFormData({ ...formData, contact: e.target.value })}
                      style={{
                        fontFamily: 'var(--font-inter)',
                        flex: 1,
                        height: '36px',
                        background: 'var(--color-surface-raised)',
                        border: '0.5px solid var(--color-border)',
                        borderRadius: '0 8px 8px 0',
                        padding: '0 12px',
                        fontSize: 'var(--text-sm)',
                        color: 'var(--color-foreground)',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Job title + App role (2-col grid) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>
                    Job title
                  </label>
                  <select
                    value={formData.jobTitle}
                    onChange={e => setFormData({ ...formData, jobTitle: e.target.value })}
                    style={SELECT_STYLE}
                  >
                    {JOB_TITLE_OPTIONS.map(opt => (
                      <option key={opt} value={opt} style={{ background: 'var(--color-surface-raised)', color: 'var(--color-foreground)' }}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>
                    App role
                  </label>
                  <select
                    value={formData.role}
                    onChange={e => setFormData({ ...formData, role: e.target.value as 'staff' | 'manager' })}
                    style={SELECT_STYLE}
                  >
                    <option value="staff" style={{ background: 'var(--color-surface-raised)', color: 'var(--color-foreground)' }}>Staff</option>
                    <option value="manager" style={{ background: 'var(--color-surface-raised)', color: 'var(--color-foreground)' }}>Manager</option>
                  </select>
                </div>
              </div>

              {/* Join date + Base salary (2-col grid) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>
                    Join date
                  </label>
                  <Input
                    type="date"
                    value={formData.joinDate}
                    onChange={e => setFormData({ ...formData, joinDate: e.target.value })}
                    className="h-9"
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>
                    Base salary
                  </label>
                  <Input
                    type="number"
                    placeholder="28000"
                    value={formData.baseSalary || ''}
                    onChange={e => setFormData({ ...formData, baseSalary: Number(e.target.value) })}
                    className="h-9"
                  />
                </div>
              </div>

              {/* Footer Actions */}
              <div style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '10px',
                borderTop: '0.5px solid var(--color-border)',
                paddingTop: '16px',
                marginTop: '4px'
              }}>
                <Button type="button" variant="outline" className="h-9" onClick={() => setShowAddModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" className="h-9 font-medium" disabled={saving}>
                  {saving ? 'Adding…' : 'Add staff →'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

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

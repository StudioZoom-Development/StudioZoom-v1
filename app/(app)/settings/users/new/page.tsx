'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input }  from '@/components/ui/input'
import { ConfirmModal } from '@/components/shared/ConfirmModal'
import { PhoneNumberInput } from '@/components/shared/PhoneNumberInput'
import { DateField } from '@/components/shared/DateField'
import { useRole } from '@/hooks/useAuth'

const JOB_TITLE_OPTIONS = [
  'Photographer',
  'Videographer',
  'Editor',
  'Designer',
  'Drone Operator',
  'Assistant',
  'Manager',
  'Studio Admin',
  'Others',
]

export default function NewUserPage() {
  const router = useRouter()
  const { isAdmin } = useRole()

  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')
  const [showCreateConfirm, setShowCreateConfirm] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)

  const [form, setForm] = useState({
    name:       '',
    email:      '',
    password:   '',
    role:       'staff' as 'admin' | 'manager' | 'staff',
    jobTitle:   'Photographer',
    contact:    '',
    joinDate:   new Date().toISOString().split('T')[0],
    baseSalary: '28000',
  })

  const [customJobTitle, setCustomJobTitle] = useState('')

  // Guard: admin only
  if (isAdmin === false) {
    router.replace('/dashboard')
    return null
  }

  const isOthersSelected = form.jobTitle === 'Others' || form.jobTitle === 'Other'

  // Triggered when clicking "Create user & staff member"
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!form.name.trim() || !form.email.trim() || !form.password) {
      setError('Please fill in all required fields (Name, Email, Password).')
      return
    }

    if (form.password.length < 8) {
      setError('Password must be at least 8 characters long.')
      return
    }

    if (isOthersSelected && !customJobTitle.trim()) {
      setError('Please specify the custom job title.')
      return
    }

    // Show confirmation popup before actual creation
    setShowCreateConfirm(true)
  }

  // Executed after user confirms creation in the modal
  const executeCreateUser = async () => {
    setShowCreateConfirm(false)
    setError('')
    setSaving(true)

    const finalJobTitle = isOthersSelected ? customJobTitle.trim() : form.jobTitle

    try {
      const res = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          name:       form.name.trim(),
          email:      form.email.trim(),
          password:   form.password,
          role:       form.role,
          jobTitle:   finalJobTitle,
          contact:    form.contact.trim() || undefined,
          joinDate:   form.joinDate || undefined,
          baseSalary: form.baseSalary ? Number(form.baseSalary.replace(/[^0-9]/g, '')) : undefined,
        }),
      })

      const data = await res.json() as { uid?: string; error?: string }
      if (!res.ok) {
        setError(data.error ?? 'Failed to create user')
        return
      }

      // Success -> navigate back to settings user management tab
      router.push('/settings?tab=users')
    } catch (err) {
      console.error('Failed to create user:', err)
      setError('Network error. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      maxWidth: '680px',
      margin: '0 auto',
      padding: '24px',
      display: 'flex',
      flexDirection: 'column',
      gap: '24px',
      fontFamily: 'var(--font-inter)',
      color: 'var(--color-foreground)',
    }}>
      
      {/* Header */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <span
          onClick={() => setShowCancelConfirm(true)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: 'var(--text-sm)',
            color: 'var(--color-foreground-muted)',
            cursor: 'pointer',
            width: 'fit-content',
          }}
        >
          <i className="ti ti-arrow-left" style={{ fontSize: '16px' }} />
          Back to User Management
        </span>
        <div style={{
          fontSize: 'var(--text-2xl)',
          fontWeight: 700,
          letterSpacing: '-0.02em',
          color: 'var(--color-foreground)',
        }}>
          Add new user & staff member
        </div>
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-foreground-muted)' }}>
          Creates a Firebase Auth account and initializes their HR profile in a single step.
        </div>
      </div>

      {error && (
        <div style={{
          fontSize: 'var(--text-sm)',
          color: 'var(--color-danger)',
          background: 'var(--color-danger-muted)',
          borderRadius: '10px',
          padding: '12px 16px',
          border: '0.5px solid var(--color-danger)',
        }}>
          {error}
        </div>
      )}

      <form onSubmit={handleFormSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        
        {/* CARD 1: LOGIN & SYSTEM ACCESS */}
        <div style={{
          background: 'var(--color-surface)',
          border: '0.5px solid var(--color-border)',
          borderRadius: '12px',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}>
          <div style={{
            fontSize: 'var(--text-xs)',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: 'var(--color-primary)',
          }}>
            System Access & Login Credentials
          </div>

          {/* Full Name */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>
              Full name <span style={{ color: 'var(--color-danger)' }}>*</span>
            </label>
            <Input
              placeholder="e.g. Siva Prakash"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              className="h-9"
              required
            />
          </div>

          {/* Email & Password */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>
                Email address <span style={{ color: 'var(--color-danger)' }}>*</span>
              </label>
              <Input
                type="email"
                placeholder="siva@studiozoom.in"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                className="h-9"
                required
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>
                Password <span style={{ color: 'var(--color-danger)' }}>*</span>
              </label>
              <Input
                type="password"
                placeholder="Min 8 characters"
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
                className="h-9"
                required
              />
            </div>
          </div>

          {/* App Role */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>App Role</label>
            <div style={{ display: 'flex', gap: '10px' }}>
              {[
                { value: 'staff',   label: 'Staff',   desc: 'Standard HR & Event access' },
                { value: 'manager', label: 'Manager', desc: 'Manage events & equipment' },
                { value: 'admin',   label: 'Admin',   desc: 'Full system access & settings' },
              ].map(r => {
                const isSelected = form.role === r.value
                return (
                  <div
                    key={r.value}
                    onClick={() => setForm({ ...form, role: r.value as typeof form.role })}
                    style={{
                      flex: 1,
                      padding: '12px',
                      borderRadius: '10px',
                      cursor: 'pointer',
                      border: isSelected ? '1.5px solid var(--color-primary)' : '0.5px solid var(--color-border)',
                      background: isSelected ? 'var(--color-primary-muted)' : 'var(--color-surface-raised)',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>{r.label}</div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)', marginTop: '2px' }}>
                      {r.desc}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* CARD 2: HR & PERSONAL DETAILS */}
        <div style={{
          background: 'var(--color-surface)',
          border: '0.5px solid var(--color-border)',
          borderRadius: '12px',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}>
          <div style={{
            fontSize: 'var(--text-xs)',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: 'var(--color-accent)',
          }}>
            Personal & HR Details
          </div>

          {/* Job Title & Contact */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>Job Title</label>
              <select
                value={form.jobTitle}
                onChange={e => {
                  const val = e.target.value
                  setForm({ ...form, jobTitle: val })
                  if (val !== 'Others' && val !== 'Other') {
                    setCustomJobTitle('')
                  }
                }}
                style={{
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
                {JOB_TITLE_OPTIONS.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>

              {/* Custom Job Title text input when "Others" is selected */}
              {isOthersSelected && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
                  <Input
                    placeholder="Specify custom job title *"
                    value={customJobTitle}
                    onChange={e => setCustomJobTitle(e.target.value)}
                    className="h-9"
                    required
                  />
                </div>
              )}
            </div>

            {/* Common Contact Phone Component */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>Contact Phone</label>
              <PhoneNumberInput
                value={form.contact}
                onChange={val => setForm({ ...form, contact: val })}
              />
            </div>
          </div>

          {/* Join Date Picker & Base Salary */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>Join Date</label>
              <DateField
                value={form.joinDate}
                onChange={val => setForm({ ...form, joinDate: val })}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>Base Salary (₹)</label>
              <Input
                type="number"
                placeholder="28000"
                value={form.baseSalary}
                onChange={e => setForm({ ...form, baseSalary: e.target.value })}
                className="h-9"
              />
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
          <button
            type="button"
            onClick={() => setShowCancelConfirm(true)}
            style={{
              height: '36px',
              padding: '0 16px',
              borderRadius: '8px',
              border: '0.5px solid var(--color-border)',
              background: 'transparent',
              color: 'var(--color-foreground)',
              fontSize: 'var(--text-sm)',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>

          <Button type="submit" className="h-9 px-6 font-medium" disabled={saving}>
            {saving ? 'Creating user…' : 'Create user & staff member'}
          </Button>
        </div>

      </form>

      {/* Confirmation Modal: Create User */}
      <ConfirmModal
        open={showCreateConfirm}
        title="Create user & staff member?"
        description="Please check all the entered information before creating the user. Do you want to continue?"
        confirmLabel="Create"
        cancelLabel="No"
        variant="primary"
        onConfirm={executeCreateUser}
        onCancel={() => setShowCreateConfirm(false)}
        loading={saving}
      />

      {/* Confirmation Modal: Cancel / Discard */}
      <ConfirmModal
        open={showCancelConfirm}
        title="Discard changes?"
        description="All the entered data will be discarded. Are you sure you want to cancel?"
        confirmLabel="Yes, discard"
        cancelLabel="No, stay here"
        variant="danger"
        onConfirm={() => router.push('/settings?tab=users')}
        onCancel={() => setShowCancelConfirm(false)}
      />
    </div>
  )
}

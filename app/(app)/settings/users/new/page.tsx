'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input }  from '@/components/ui/input'
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
  'Other'
]

export default function NewUserPage() {
  const router = useRouter()
  const { isAdmin } = useRole()

  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

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

  // Guard: admin only
  if (isAdmin === false) {
    router.replace('/dashboard')
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
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

    setSaving(true)
    try {
      const res = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:       form.name.trim(),
          email:      form.email.trim(),
          password:   form.password,
          role:       form.role,
          jobTitle:   form.jobTitle,
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

      // Success -> navigate back to settings user management
      router.push('/settings')
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
          onClick={() => router.push('/settings')}
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
          Back to Settings
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

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        
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
                onChange={e => setForm({ ...form, jobTitle: e.target.value })}
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
                }}
              >
                {JOB_TITLE_OPTIONS.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>Contact Phone</label>
              <Input
                placeholder="+91 98400 11223"
                value={form.contact}
                onChange={e => setForm({ ...form, contact: e.target.value })}
                className="h-9"
              />
            </div>
          </div>

          {/* Join Date & Base Salary */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>Join Date</label>
              <Input
                type="date"
                value={form.joinDate}
                onChange={e => setForm({ ...form, joinDate: e.target.value })}
                className="h-9"
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
            onClick={() => router.push('/settings')}
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
    </div>
  )
}

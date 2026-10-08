'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DateField } from '@/components/shared/DateField'
import { useRole } from '@/hooks/useAuth'
import { useAuthStore } from '@/store/authStore'
import { createExpense, subscribeToExpenseCategories } from '@/lib/firebase/queries/expenses'
import { subscribeToClients } from '@/lib/firebase/queries/clients'
import type { Client, ExpenseCategory, CustomExpenseCategory } from '@/types'

const CATEGORY_OPTIONS: Array<{ label: string; value: ExpenseCategory }> = [
  { label: 'Equipment',     value: 'equipment' },
  { label: 'Freelancer',    value: 'freelancer' },
  { label: 'Travel',        value: 'travel' },
  { label: 'Studio rent',   value: 'studioRent' },
  { label: 'Utilities',     value: 'utilities' },
  { label: 'Props & sets',  value: 'propsSets' },
  { label: 'Marketing',     value: 'marketing' },
  { label: 'Salaries',      value: 'salaries' },
  { label: 'Misc',          value: 'misc' },
]

const METHOD_OPTIONS = [
  'GPay',
  'Cash',
  'Bank Transfer',
  'Card',
  'UPI',
  'Cheque',
]

export default function AddExpensePage() {
  const router = useRouter()
  const { isAdmin } = useRole()
  const authLoading = useAuthStore(s => s.loading)

  const [dateStr, setDateStr] = useState<string>(() => format(new Date(), 'yyyy-MM-dd'))
  const [category, setCategory] = useState<ExpenseCategory>('equipment')
  const [amountStr, setAmountStr] = useState<string>('')
  const [method, setMethod] = useState<string>('GPay')
  const [vendor, setVendor] = useState<string>('')
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')
  const [description, setDescription] = useState<string>('')
  const [note, setNote] = useState<string>('')
  const [generatedCode] = useState<string>(() => `EXP-${Math.floor(1000 + Math.random() * 9000)}`)

  const [clients, setClients] = useState<Client[]>([])
  const [customCategories, setCustomCategories] = useState<CustomExpenseCategory[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>('')

  // Dynamic category options combining standard and active custom categories
  const categoryOptions = useMemo(() => {
    const list: Array<{ label: string; value: ExpenseCategory }> = [...CATEGORY_OPTIONS]
    for (const c of customCategories) {
      list.push({ label: c.label, value: c.key as ExpenseCategory })
    }
    return list
  }, [customCategories])

  // Deduplicate project options so each project name appears exactly once
  const uniqueProjectOptions = useMemo(() => {
    const seen = new Set<string>()
    const list: Array<{ id: string; label: string }> = []

    for (const c of clients) {
      const name = (c.name || '').trim()
      const event = (c.eventName || '').trim()
      const id = c.clientId || c.projectId || ''
      const label = name || event || 'Client'
      if (!seen.has(label.toLowerCase())) {
        seen.add(label.toLowerCase())
        list.push({ id, label })
      }
    }
    return list.sort((a, b) => a.label.localeCompare(b.label))
  }, [clients])

  // Fetch client, project, and custom categories options
  useEffect(() => {
    const unsubClients = subscribeToClients({}, data => {
      setClients(data)
    })
    const unsubCats = subscribeToExpenseCategories(cats => {
      setCustomCategories(cats)
    })
    return () => {
      unsubClients()
      unsubCats()
    }
  }, [])

  // Admin access guard
  if (!authLoading && !isAdmin) {
    return (
      <div style={{ padding: '40px', maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
        <div
          style={{
            background: 'var(--color-surface)',
            border: '0.5px solid var(--color-border)',
            borderRadius: '12px',
            padding: '32px',
          }}
        >
          <i
            className="ti ti-lock"
            style={{ fontSize: '36px', color: 'var(--color-danger)', marginBottom: '12px', display: 'inline-block' }}
          />
          <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 600, marginBottom: '8px' }}>
            Access Restricted
          </h2>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-foreground-muted)', marginBottom: '20px' }}>
            The Add Expense form is restricted strictly to studio administrators.
          </p>
          <Button onClick={() => router.push('/dashboard')}>Go to Dashboard</Button>
        </div>
      </div>
    )
  }

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Strip non-digit chars
    const cleaned = e.target.value.replace(/[^0-9]/g, '')
    setAmountStr(cleaned)
    if (error) setError('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const numAmount = parseInt(amountStr, 10)
    if (isNaN(numAmount) || numAmount <= 0) {
      setError('Please enter a valid expense amount greater than 0.')
      return
    }

    setSaving(true)
    try {
      // Resolve selected project details
      let chosenProjectName = ''
      if (selectedProjectId) {
        const found = clients.find(c => c.clientId === selectedProjectId || c.projectId === selectedProjectId)
        if (found) {
          chosenProjectName = found.name || found.eventName || ''
        }
      }

      const parsedDate = dateStr ? new Date(`${dateStr}T12:00:00`) : new Date()

      await createExpense({
        code: generatedCode,
        date: parsedDate,
        category,
        amount: numAmount,
        method,
        vendor: vendor.trim(),
        description: description.trim() || note.trim(),
        note: note.trim(),
        projectId: selectedProjectId || undefined,
        projectName: chosenProjectName || undefined,
        source: category === 'salaries' ? 'salary' : category === 'freelancer' ? 'freelancerPayout' : 'manual',
        createdBy: 'admin',
      })

      router.push('/erp/expenses')
    } catch (err) {
      console.error('Failed to create expense:', err)
      setError('Failed to save expense. Please try again.')
      setSaving(false)
    }
  }

  return (
    <div
      style={{
        maxWidth: '580px',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        padding: '8px 0 32px',
      }}
    >
      {/* Header with Back Arrow & Serial Badge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            type="button"
            onClick={() => router.push('/erp/expenses')}
            style={{
              cursor: 'pointer',
              color: 'var(--color-foreground-muted)',
              display: 'flex',
              alignItems: 'center',
              background: 'none',
              border: 'none',
              padding: '4px',
              borderRadius: '6px',
              transition: 'color 0.15s ease',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-foreground)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-foreground-muted)')}
          >
            <i className="ti ti-arrow-left" style={{ fontSize: '20px' }} />
          </button>
          <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, letterSpacing: '-0.02em' }}>
            Add expense
          </div>
        </div>

        {/* Assigned Serial Number Preview */}
        <div
          style={{
            fontFamily: 'monospace',
            fontWeight: 700,
            fontSize: 'var(--text-xs)',
            background: 'var(--color-surface-raised)',
            border: '0.5px solid var(--color-border)',
            padding: '4px 10px',
            borderRadius: '6px',
            color: 'var(--color-foreground)',
          }}
        >
          Serial: #{generatedCode}
        </div>
      </div>

      {/* Form Card */}
      <form
        onSubmit={handleSubmit}
        style={{
          background: 'var(--color-surface)',
          border: '0.5px solid var(--color-border)',
          borderRadius: '12px',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        }}
      >
        {error && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: '8px',
              background: 'var(--color-danger-muted)',
              color: 'var(--color-danger)',
              fontSize: 'var(--text-sm)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <i className="ti ti-alert-circle" style={{ fontSize: '16px' }} />
            {error}
          </div>
        )}

        {/* Responsive Grid: 1 col on mobile (<768px), 2 cols on desktop */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Date */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--color-foreground)' }}>
              Date
            </label>
            <DateField value={dateStr} onChange={setDateStr} />
          </div>

          {/* Category */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--color-foreground)' }}>
              Category
            </label>
            <select
              value={category}
              onChange={e => setCategory(e.target.value as ExpenseCategory)}
              style={{
                fontFamily: 'var(--font-inter)',
                height: '36px',
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
              {categoryOptions.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Amount */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--color-foreground)' }}>
              Amount
            </label>
            <Input
              type="text"
              inputMode="numeric"
              placeholder="₹0"
              value={amountStr ? `₹${parseInt(amountStr, 10).toLocaleString('en-IN')}` : ''}
              onChange={handleAmountChange}
              required
            />
          </div>

          {/* Method */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--color-foreground)' }}>
              Method
            </label>
            <select
              value={method}
              onChange={e => setMethod(e.target.value)}
              style={{
                fontFamily: 'var(--font-inter)',
                height: '36px',
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
              {METHOD_OPTIONS.map(m => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          {/* Vendor */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--color-foreground)' }}>
              Vendor
            </label>
            <Input
              type="text"
              placeholder="Vendor or payee name"
              value={vendor}
              onChange={e => setVendor(e.target.value)}
            />
          </div>

          {/* Project · optional (fetched from clients) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--color-foreground)' }}>
              Project{' '}
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>
                · optional
              </span>
            </label>
            <select
              value={selectedProjectId}
              onChange={e => setSelectedProjectId(e.target.value)}
              style={{
                fontFamily: 'var(--font-inter)',
                height: '36px',
                background: 'var(--color-surface-raised)',
                border: '0.5px solid var(--color-border)',
                borderRadius: '8px',
                padding: '0 10px',
                fontSize: 'var(--text-sm)',
                color: selectedProjectId ? 'var(--color-foreground)' : 'var(--color-foreground-muted)',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="">—</option>
              {uniqueProjectOptions.map(p => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Description */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--color-foreground)' }}>
            Description
          </label>
          <Input
            type="text"
            placeholder="Expense title or description"
            value={description}
            onChange={e => setDescription(e.target.value)}
          />
        </div>

        {/* Note */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--color-foreground)' }}>
            Notes & Details
          </label>
          <textarea
            rows={2}
            placeholder="Additional notes or payment breakdown..."
            value={note}
            onChange={e => setNote(e.target.value)}
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
            }}
          />
        </div>

        {/* Notice for salaries and payouts */}
        {(category === 'salaries' || category === 'freelancer') && (
          <div
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--color-purple)',
              background: 'var(--color-purple-muted)',
              padding: '8px 12px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <i className="ti ti-bolt" />
            <span>
              This payout will be permanently linked and recorded with serial number <b>#{generatedCode}</b> in all reports.
            </span>
          </div>
        )}

        {/* Buttons */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px',
            borderTop: '0.5px solid var(--color-border)',
            paddingTop: '14px',
          }}
        >
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push('/erp/expenses')}
            disabled={saving}
            style={{ height: '36px' }}
          >
            Cancel
          </Button>

          <Button
            type="submit"
            disabled={saving}
            style={{ height: '36px', fontWeight: 500 }}
          >
            {saving ? 'Saving...' : 'Save expense'}
          </Button>
        </div>
      </form>
    </div>
  )
}

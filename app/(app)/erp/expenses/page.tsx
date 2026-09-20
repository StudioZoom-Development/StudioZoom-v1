'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/shared/Badge'
import { EmptyState } from '@/components/shared/EmptyState'
import { TableRowSkeleton } from '@/components/shared/LoadingSkeleton'
import { ConfirmModal } from '@/components/shared/ConfirmModal'
import { useRole } from '@/hooks/useAuth'
import { useAuthStore } from '@/store/authStore'
import {
  subscribeToExpenses,
  deleteExpense,
} from '@/lib/firebase/queries/expenses'
import { subscribeToClients } from '@/lib/firebase/queries/clients'
import type { Expense, Client } from '@/types'

// Normalized Category display mapping
const CATEGORY_DISPLAY_MAP: Record<string, { label: string; badgeKey: string }> = {
  equipment:   { label: 'Equipment',     badgeKey: 'equipment' },
  freelancer:  { label: 'Freelancer',    badgeKey: 'freelancer' },
  travel:      { label: 'Travel',        badgeKey: 'travel' },
  studioRent:  { label: 'Studio rent',   badgeKey: 'studioRent' },
  rent:        { label: 'Studio rent',   badgeKey: 'studioRent' },
  utilities:   { label: 'Utilities',     badgeKey: 'utilities' },
  propsSets:   { label: 'Props & sets',  badgeKey: 'propsSets' },
  props:       { label: 'Props & sets',  badgeKey: 'propsSets' },
  marketing:   { label: 'Marketing',     badgeKey: 'marketing' },
  misc:        { label: 'Misc',          badgeKey: 'misc' },
  salaries:    { label: 'Salaries',      badgeKey: 'salaries' },
}

function resolveCategory(cat: string): { label: string; badgeKey: string } {
  const lower = (cat || '').toLowerCase().trim()
  if (lower === 'props & sets' || lower === 'props&sets') return CATEGORY_DISPLAY_MAP.propsSets
  if (lower === 'studio rent' || lower === 'studiorent') return CATEGORY_DISPLAY_MAP.studioRent
  return CATEGORY_DISPLAY_MAP[cat] || {
    label: cat ? cat.charAt(0).toUpperCase() + cat.slice(1) : 'Misc',
    badgeKey: cat || 'misc',
  }
}

function isAutoPayoutSource(source: string): boolean {
  const s = (source || '').toLowerCase()
  return s.includes('payout') || s === 'autopayout' || s === 'freelancerpayout'
}

export default function ExpensesPage() {
  const router = useRouter()
  const { isAdmin } = useRole()
  const authLoading = useAuthStore(s => s.loading)

  const [expenses, setExpenses] = useState<Expense[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)

  // Delete modal state
  const [expenseToDelete, setExpenseToDelete] = useState<Expense | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Filters
  const [selectedCategory, setSelectedCategory] = useState<string>('All')
  const [selectedSource, setSelectedSource] = useState<string>('All')
  const [selectedProject, setSelectedProject] = useState<string>('All')

  // Subscribe to real-time expenses and clients purely from DB
  useEffect(() => {
    const unsubExpenses = subscribeToExpenses(data => {
      setExpenses(data)
      setLoading(false)
    })

    const unsubClients = subscribeToClients({}, data => {
      setClients(data)
    })

    return () => {
      unsubExpenses()
      unsubClients()
    }
  }, [])

  // Map of client/project ID to display name
  const clientsMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of clients) {
      const displayName = c.name || c.eventName || 'Unnamed Client'
      if (c.clientId) map.set(c.clientId, displayName)
      if (c.projectId) map.set(c.projectId, displayName)
    }
    return map
  }, [clients])

  // Resolve project name for any expense
  const getProjectName = useCallback((e: Expense): string => {
    if (e.projectName && e.projectName.trim()) return e.projectName
    if (e.projectId && clientsMap.has(e.projectId)) {
      return clientsMap.get(e.projectId)!
    }
    return ''
  }, [clientsMap])

  // Determine projects dynamically available in the grid
  // Requirement: "Project - Should filter out if it is available in the Grid"
  const availableGridProjects = useMemo(() => {
    const projectsSet = new Set<string>()
    for (const e of expenses) {
      const proj = getProjectName(e)
      if (proj && proj !== '—') {
        projectsSet.add(proj)
      }
    }
    return Array.from(projectsSet).sort((a, b) => a.localeCompare(b))
  }, [expenses, getProjectName])

  // Apply filters to expenses
  const filteredExpenses = useMemo(() => {
    return expenses.filter(e => {
      // Category filter
      if (selectedCategory !== 'All') {
        const catInfo = resolveCategory(e.category)
        if (catInfo.label.toLowerCase() !== selectedCategory.toLowerCase()) {
          return false
        }
      }

      // Source filter
      if (selectedSource !== 'All') {
        const isAuto = isAutoPayoutSource(e.source)
        if (selectedSource === 'Manual' && isAuto) return false
        if (selectedSource === 'Auto Payout' && !isAuto) return false
      }

      // Project filter
      if (selectedProject !== 'All') {
        const proj = getProjectName(e)
        if (proj !== selectedProject) return false
      }

      return true
    })
  }, [expenses, selectedCategory, selectedSource, selectedProject, getProjectName])

  // Compute Total and Category breakdown chips
  const { totalAmount, categoryBreakdown, currentMonthLabel } = useMemo(() => {
    let total = 0
    const catSums: Record<string, number> = {}

    // Determine current/most relevant month for the summary
    let targetMonthDate = new Date()
    if (expenses.length > 0) {
      targetMonthDate = expenses[0].date
    }
    const monthStr = format(targetMonthDate, 'MMMM').toUpperCase()

    for (const e of filteredExpenses) {
      total += e.amount || 0
      const cat = resolveCategory(e.category).label
      catSums[cat] = (catSums[cat] || 0) + (e.amount || 0)
    }

    // Sort category chips by spend amount descending
    const chips = Object.entries(catSums)
      .sort(([, a], [, b]) => b - a)
      .map(([label, amt]) => ({
        label,
        amt: `₹${amt.toLocaleString('en-IN')}`,
      }))

    return {
      totalAmount: `₹${total.toLocaleString('en-IN')}`,
      categoryBreakdown: chips,
      currentMonthLabel: monthStr,
    }
  }, [filteredExpenses, expenses])

  // CSV Export handler
  const handleExportCSV = () => {
    if (!filteredExpenses.length) return

    const headers = ['Date', 'Category', 'Description', 'Vendor', 'Amount', 'Project', 'Source']
    const rows = filteredExpenses.map(e => [
      format(e.date, 'dd MMM yyyy'),
      `"${resolveCategory(e.category).label}"`,
      `"${(e.description || e.note || '').replace(/"/g, '""')}"`,
      `"${(e.vendor || '').replace(/"/g, '""')}"`,
      e.amount || 0,
      `"${(getProjectName(e) || '').replace(/"/g, '""')}"`,
      isAutoPayoutSource(e.source) ? 'Auto payout' : 'Manual',
    ])

    // Prepend UTF-8 BOM so Excel opens non-ASCII characters and empty cells cleanly
    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `expenses_${currentMonthLabel.toLowerCase()}_${new Date().getFullYear()}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  // Admin access restriction guard
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
            The Expenses module is restricted strictly to studio administrators.
          </p>
          <Button onClick={() => router.push('/dashboard')}>Go to Dashboard</Button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '1280px', margin: '0 auto' }}>
      {/* Summary Header Card */}
      <div
        style={{
          background: 'var(--color-surface)',
          border: '0.5px solid var(--color-border)',
          borderRadius: '12px',
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          flexWrap: 'wrap',
        }}
      >
        {/* Left Total */}
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: '130px' }}>
          <span
            style={{
              fontSize: 'var(--text-xs)',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: 'var(--color-foreground-subtle)',
              fontWeight: 600,
            }}
          >
            TOTAL · {currentMonthLabel}
          </span>
          <span style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--color-foreground)' }}>
            {totalAmount}
          </span>
        </div>

        {/* Vertical Divider */}
        <div style={{ width: '1px', height: '36px', background: 'var(--color-border)' }} />

        {/* Category breakdown chips */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', flex: 1, alignItems: 'center' }}>
          {categoryBreakdown.map((c, i) => (
            <span
              key={i}
              style={{
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                padding: '4px 10px',
                borderRadius: '10px',
                background: 'var(--color-surface-raised)',
                border: '0.5px solid var(--color-border)',
                color: 'var(--color-foreground-muted)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              {c.label} <b style={{ color: 'var(--color-foreground)' }}>{c.amt}</b>
            </span>
          ))}
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Button
            variant="outline"
            onClick={handleExportCSV}
            disabled={filteredExpenses.length === 0}
            style={{ height: '36px', fontSize: 'var(--text-xs)', gap: '6px' }}
          >
            <i className="ti ti-download" style={{ fontSize: '14px' }} />
            Export CSV
          </Button>

          <Button
            onClick={() => router.push('/erp/expenses/new')}
            style={{ height: '36px', fontWeight: 500, gap: '6px' }}
          >
            <i className="ti ti-plus" style={{ fontSize: '14px' }} />
            Add expense
          </Button>
        </div>
      </div>

      {/* Filter Row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        {/* Category Filter */}
        <select
          value={selectedCategory}
          onChange={e => setSelectedCategory(e.target.value)}
          style={{
            fontFamily: 'var(--font-inter)',
            height: '36px',
            background: 'var(--color-surface-raised)',
            border: '0.5px solid var(--color-border)',
            borderRadius: '8px',
            padding: '0 12px',
            fontSize: 'var(--text-sm)',
            color: selectedCategory === 'All' ? 'var(--color-foreground-muted)' : 'var(--color-foreground)',
            outline: 'none',
            cursor: 'pointer',
          }}
        >
          <option value="All">Category · All</option>
          <option value="Equipment">Equipment</option>
          <option value="Freelancer">Freelancer</option>
          <option value="Travel">Travel</option>
          <option value="Studio rent">Studio rent</option>
          <option value="Utilities">Utilities</option>
          <option value="Props & sets">Props & sets</option>
          <option value="Marketing">Marketing</option>
          <option value="Misc">Misc</option>
        </select>

        {/* Source Filter */}
        <select
          value={selectedSource}
          onChange={e => setSelectedSource(e.target.value)}
          style={{
            fontFamily: 'var(--font-inter)',
            height: '36px',
            background: 'var(--color-surface-raised)',
            border: '0.5px solid var(--color-border)',
            borderRadius: '8px',
            padding: '0 12px',
            fontSize: 'var(--text-sm)',
            color: selectedSource === 'All' ? 'var(--color-foreground-muted)' : 'var(--color-foreground)',
            outline: 'none',
            cursor: 'pointer',
          }}
        >
          <option value="All">Source · All</option>
          <option value="Manual">Manual</option>
          <option value="Auto Payout">Auto Payout</option>
        </select>

        {/* Project Filter (filtered to only available in grid) */}
        <select
          value={selectedProject}
          onChange={e => setSelectedProject(e.target.value)}
          style={{
            fontFamily: 'var(--font-inter)',
            height: '36px',
            background: 'var(--color-surface-raised)',
            border: '0.5px solid var(--color-border)',
            borderRadius: '8px',
            padding: '0 12px',
            fontSize: 'var(--text-sm)',
            color: selectedProject === 'All' ? 'var(--color-foreground-muted)' : 'var(--color-foreground)',
            outline: 'none',
            cursor: 'pointer',
            maxWidth: '220px',
          }}
        >
          <option value="All">Project · All</option>
          {availableGridProjects.map(proj => (
            <option key={proj} value={proj}>
              {proj}
            </option>
          ))}
        </select>
      </div>

      {/* Expenses Table */}
      <div
        style={{
          background: 'var(--color-surface)',
          border: '0.5px solid var(--color-border)',
          borderRadius: '12px',
          overflow: 'hidden',
        }}
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
            <thead>
              <tr>
                <th
                  style={{
                    textAlign: 'left',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: 'var(--color-foreground-subtle)',
                    padding: '12px 16px',
                    borderBottom: '0.5px solid var(--color-border-strong)',
                  }}
                >
                  Date
                </th>
                <th
                  style={{
                    textAlign: 'left',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: 'var(--color-foreground-subtle)',
                    padding: '12px 16px',
                    borderBottom: '0.5px solid var(--color-border-strong)',
                  }}
                >
                  Category
                </th>
                <th
                  style={{
                    textAlign: 'left',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: 'var(--color-foreground-subtle)',
                    padding: '12px 16px',
                    borderBottom: '0.5px solid var(--color-border-strong)',
                  }}
                >
                  Description
                </th>
                <th
                  style={{
                    textAlign: 'left',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: 'var(--color-foreground-subtle)',
                    padding: '12px 16px',
                    borderBottom: '0.5px solid var(--color-border-strong)',
                  }}
                >
                  Vendor
                </th>
                <th
                  style={{
                    textAlign: 'right',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: 'var(--color-foreground-subtle)',
                    padding: '12px 16px',
                    borderBottom: '0.5px solid var(--color-border-strong)',
                  }}
                >
                  Amount
                </th>
                <th
                  style={{
                    textAlign: 'left',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: 'var(--color-foreground-subtle)',
                    padding: '12px 16px',
                    borderBottom: '0.5px solid var(--color-border-strong)',
                  }}
                >
                  Project
                </th>
                <th
                  style={{
                    textAlign: 'left',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: 'var(--color-foreground-subtle)',
                    padding: '12px 16px',
                    borderBottom: '0.5px solid var(--color-border-strong)',
                  }}
                >
                  Source
                </th>
                <th
                  style={{
                    textAlign: 'right',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: 'var(--color-foreground-subtle)',
                    padding: '12px 16px',
                    borderBottom: '0.5px solid var(--color-border-strong)',
                    width: '80px',
                  }}
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableRowSkeleton rows={5} cols={8} />
              ) : filteredExpenses.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '32px 16px' }}>
                    <EmptyState
                      icon="ti-wallet"
                      title="No expenses found"
                      description={
                        selectedCategory !== 'All' || selectedSource !== 'All' || selectedProject !== 'All'
                          ? 'Try adjusting your filters to see more results.'
                          : 'No expenses have been recorded yet.'
                      }
                    />
                  </td>
                </tr>
              ) : (
                filteredExpenses.map(e => {
                  const catInfo = resolveCategory(e.category)
                  const projectName = getProjectName(e)
                  const isAuto = isAutoPayoutSource(e.source)

                  return (
                    <tr
                      key={e.expenseId}
                      style={{
                        height: '46px',
                        cursor: 'default',
                        transition: 'background 0.15s ease',
                      }}
                      onMouseEnter={ev => (ev.currentTarget.style.background = 'var(--color-surface-raised)')}
                      onMouseLeave={ev => (ev.currentTarget.style.background = 'transparent')}
                    >
                      {/* Date */}
                      <td
                        style={{
                          padding: '0 16px',
                          borderBottom: '0.5px solid var(--color-border)',
                          color: 'var(--color-foreground-muted)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {format(e.date, 'd MMM')}
                      </td>

                      {/* Category */}
                      <td style={{ padding: '0 16px', borderBottom: '0.5px solid var(--color-border)' }}>
                        <Badge variant={catInfo.badgeKey} label={catInfo.label} />
                      </td>

                      {/* Description */}
                      <td
                        style={{
                          padding: '0 16px',
                          borderBottom: '0.5px solid var(--color-border)',
                          fontWeight: 500,
                          color: 'var(--color-foreground)',
                        }}
                      >
                        {e.description || e.note || '—'}
                      </td>

                      {/* Vendor */}
                      <td
                        style={{
                          padding: '0 16px',
                          borderBottom: '0.5px solid var(--color-border)',
                          color: 'var(--color-foreground-muted)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {e.vendor || '—'}
                      </td>

                      {/* Amount */}
                      <td
                        style={{
                          padding: '0 16px',
                          borderBottom: '0.5px solid var(--color-border)',
                          textAlign: 'right',
                          fontWeight: 700,
                          color: 'var(--color-foreground)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        ₹{Number(e.amount || 0).toLocaleString('en-IN')}
                      </td>

                      {/* Project */}
                      <td
                        style={{
                          padding: '0 16px',
                          borderBottom: '0.5px solid var(--color-border)',
                          color: projectName ? 'var(--color-foreground)' : 'var(--color-foreground-muted)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {projectName || '—'}
                      </td>

                      {/* Source */}
                      <td
                        style={{
                          padding: '0 16px',
                          borderBottom: '0.5px solid var(--color-border)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {isAuto ? (
                          <span
                            style={{
                              fontSize: 'var(--text-xs)',
                              color: 'var(--color-foreground-subtle)',
                              fontStyle: 'italic',
                            }}
                          >
                            Auto payout
                          </span>
                        ) : (
                          <span
                            style={{
                              fontSize: 'var(--text-xs)',
                              color: 'var(--color-foreground-muted)',
                            }}
                          >
                            Manual
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td
                        style={{
                          padding: '0 16px',
                          borderBottom: '0.5px solid var(--color-border)',
                          textAlign: 'right',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <div
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            justifyContent: 'flex-end',
                          }}
                        >
                          <button
                            type="button"
                            title="Edit expense"
                            onClick={ev => {
                              ev.stopPropagation()
                              router.push(`/erp/expenses/edit/${e.expenseId}`)
                            }}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              cursor: 'pointer',
                              color: 'var(--color-foreground-muted)',
                              padding: '6px',
                              borderRadius: '6px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'color 0.15s, background 0.15s',
                            }}
                            onMouseEnter={el => {
                              el.currentTarget.style.color = 'var(--color-primary)'
                              el.currentTarget.style.background = 'var(--color-surface-overlay)'
                            }}
                            onMouseLeave={el => {
                              el.currentTarget.style.color = 'var(--color-foreground-muted)'
                              el.currentTarget.style.background = 'transparent'
                            }}
                          >
                            <i className="ti ti-edit" style={{ fontSize: '16px' }} />
                          </button>

                          <button
                            type="button"
                            title="Delete expense"
                            onClick={ev => {
                              ev.stopPropagation()
                              setExpenseToDelete(e)
                            }}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              cursor: 'pointer',
                              color: 'var(--color-foreground-muted)',
                              padding: '6px',
                              borderRadius: '6px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'color 0.15s, background 0.15s',
                            }}
                            onMouseEnter={el => {
                              el.currentTarget.style.color = 'var(--color-danger)'
                              el.currentTarget.style.background = 'var(--color-danger-muted)'
                            }}
                            onMouseLeave={el => {
                              el.currentTarget.style.color = 'var(--color-foreground-muted)'
                              el.currentTarget.style.background = 'transparent'
                            }}
                          >
                            <i className="ti ti-trash" style={{ fontSize: '16px' }} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <ConfirmModal
        open={!!expenseToDelete}
        title="Delete Expense"
        description={`Are you sure you want to delete this expense of ₹${Number(expenseToDelete?.amount || 0).toLocaleString('en-IN')}${expenseToDelete?.vendor ? ` for ${expenseToDelete.vendor}` : ''}? This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        loading={isDeleting}
        onConfirm={async () => {
          if (!expenseToDelete) return
          setIsDeleting(true)
          try {
            await deleteExpense(expenseToDelete.expenseId)
            setExpenseToDelete(null)
          } catch (err) {
            console.error('Failed to delete expense:', err)
          } finally {
            setIsDeleting(false)
          }
        }}
        onCancel={() => setExpenseToDelete(null)}
      />
    </div>
  )
}

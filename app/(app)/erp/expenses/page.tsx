'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  format,
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  addDays,
  subDays,
  addWeeks,
  subWeeks,
  addMonths,
  subMonths,
  addYears,
  subYears,
  isWithinInterval,
} from 'date-fns'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/shared/Badge'
import { EmptyState } from '@/components/shared/EmptyState'
import { TableRowSkeleton } from '@/components/shared/LoadingSkeleton'
import { ConfirmModal } from '@/components/shared/ConfirmModal'
import { DateField } from '@/components/shared/DateField'
import { useRole } from '@/hooks/useAuth'
import { useAuthStore } from '@/store/authStore'
import {
  subscribeToExpenses,
  deleteExpense,
} from '@/lib/firebase/queries/expenses'
import { subscribeToClients } from '@/lib/firebase/queries/clients'
import type { Expense, Client } from '@/types'

// Normalized Category display mapping
const CATEGORY_DISPLAY_MAP: Record<string, { label: string; badgeKey: string; colorVar: string }> = {
  equipment:   { label: 'Equipment',     badgeKey: 'equipment',   colorVar: 'var(--color-accent)' },
  freelancer:  { label: 'Freelancer',    badgeKey: 'freelancer',  colorVar: 'var(--color-secondary)' },
  travel:      { label: 'Travel',        badgeKey: 'travel',      colorVar: 'var(--color-purple)' },
  studioRent:  { label: 'Studio rent',   badgeKey: 'studioRent',  colorVar: 'var(--color-primary)' },
  rent:        { label: 'Studio rent',   badgeKey: 'studioRent',  colorVar: 'var(--color-primary)' },
  utilities:   { label: 'Utilities',     badgeKey: 'utilities',   colorVar: 'var(--color-foreground-muted)' },
  propsSets:   { label: 'Props & sets',  badgeKey: 'propsSets',   colorVar: 'var(--color-success)' },
  props:       { label: 'Props & sets',  badgeKey: 'propsSets',   colorVar: 'var(--color-success)' },
  marketing:   { label: 'Marketing',     badgeKey: 'marketing',   colorVar: 'var(--color-secondary)' },
  misc:        { label: 'Misc',          badgeKey: 'misc',        colorVar: 'var(--color-foreground-subtle)' },
  salaries:    { label: 'Salaries',      badgeKey: 'salaries',    colorVar: 'var(--color-primary)' },
}

function resolveCategory(cat: string): { label: string; badgeKey: string; colorVar: string } {
  const lower = (cat || '').toLowerCase().trim()
  if (lower === 'props & sets' || lower === 'props&sets') return CATEGORY_DISPLAY_MAP.propsSets
  if (lower === 'studio rent' || lower === 'studiorent') return CATEGORY_DISPLAY_MAP.studioRent
  return CATEGORY_DISPLAY_MAP[cat] || {
    label: cat ? cat.charAt(0).toUpperCase() + cat.slice(1) : 'Misc',
    badgeKey: cat || 'misc',
    colorVar: 'var(--color-foreground-subtle)',
  }
}

// Check if expense is an auto payout (salary, freelancer payout, automated deduction)
function getAutoPayoutMeta(e: Expense): { isAuto: boolean; typeLabel: string } {
  const s = (e.source || '').toLowerCase()
  const cat = (e.category || '').toLowerCase()
  const note = (e.note || e.description || '').toLowerCase()

  if (s.includes('salary') || cat === 'salaries' || note.includes('salary')) {
    return { isAuto: true, typeLabel: 'Salary Payout' }
  }
  if (s.includes('freelancer') || (cat === 'freelancer' && s.includes('payout')) || note.includes('freelancer payout')) {
    return { isAuto: true, typeLabel: 'Freelancer Payout' }
  }
  if (s.includes('payout') || s === 'autopayout') {
    return { isAuto: true, typeLabel: 'Auto Payout' }
  }
  return { isAuto: false, typeLabel: 'Manual' }
}

// Fallback to guarantee a clean EXP serial number
function getExpenseCode(e: Expense): string {
  if (e.code && e.code.trim()) return e.code.trim()
  if (e.expenseId) return `EXP-${e.expenseId.slice(-4).toUpperCase()}`
  return 'EXP-0000'
}

type PeriodView = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom'
type SortField = 'createdAt' | 'date' | 'amount' | 'code' | 'vendor' | 'category'
type SortOrder = 'asc' | 'desc'

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

  // Period View state
  const [periodView, setPeriodView] = useState<PeriodView>('monthly')
  const [currentDate, setCurrentDate] = useState<Date>(new Date())
  const [customStartDate, setCustomStartDate] = useState<string>(() => format(subMonths(new Date(), 1), 'yyyy-MM-dd'))
  const [customEndDate, setCustomEndDate] = useState<string>(() => format(new Date(), 'yyyy-MM-dd'))

  // Filter state
  const [keyword, setKeyword] = useState<string>('')
  const [selectedCategory, setSelectedCategory] = useState<string>('All')
  const [selectedMethod, setSelectedMethod] = useState<string>('All')
  const [selectedSource, setSelectedSource] = useState<string>('All')
  const [selectedProject, setSelectedProject] = useState<string>('All')
  const [minAmount, setMinAmount] = useState<string>('')
  const [maxAmount, setMaxAmount] = useState<string>('')
  const [showFilters, setShowFilters] = useState<boolean>(true)

  // Sort state: Default to newest added expense first (createdAt descending)
  const [sortField, setSortField] = useState<SortField>('createdAt')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')

  // Pagination state
  const [currentPage, setCurrentPage] = useState<number>(1)
  const [pageSize, setPageSize] = useState<number>(10)

  // Hover state for interactive charts
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null)
  const [hoveredBarIndex, setHoveredBarIndex] = useState<number | null>(null)

  // Subscribe to real-time expenses and clients
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

  // Projects available dynamically in records
  const availableProjects = useMemo(() => {
    const set = new Set<string>()
    for (const e of expenses) {
      const p = getProjectName(e)
      if (p && p !== '—') set.add(p)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [expenses, getProjectName])

  // Available Payment Methods
  const availableMethods = useMemo(() => {
    const set = new Set<string>(['GPay', 'Cash', 'Bank Transfer', 'Card', 'UPI', 'Cheque'])
    for (const e of expenses) {
      if (e.method && e.method.trim()) set.add(e.method.trim())
    }
    return Array.from(set)
  }, [expenses])

  // Period Navigation handlers
  const handlePrevPeriod = () => {
    setCurrentPage(1)
    if (periodView === 'daily') setCurrentDate(d => subDays(d, 1))
    else if (periodView === 'weekly') setCurrentDate(d => subWeeks(d, 1))
    else if (periodView === 'monthly') setCurrentDate(d => subMonths(d, 1))
    else if (periodView === 'yearly') setCurrentDate(d => subYears(d, 1))
  }

  const handleNextPeriod = () => {
    setCurrentPage(1)
    if (periodView === 'daily') setCurrentDate(d => addDays(d, 1))
    else if (periodView === 'weekly') setCurrentDate(d => addWeeks(d, 1))
    else if (periodView === 'monthly') setCurrentDate(d => addMonths(d, 1))
    else if (periodView === 'yearly') setCurrentDate(d => addYears(d, 1))
  }

  const handleTodayPeriod = () => {
    setCurrentPage(1)
    setCurrentDate(new Date())
  }

  // Active period date range interval and label
  const { periodInterval, periodLabel } = useMemo(() => {
    if (periodView === 'daily') {
      return {
        periodInterval: { start: startOfDay(currentDate), end: endOfDay(currentDate) },
        periodLabel: format(currentDate, 'EEEE, d MMMM yyyy'),
      }
    }
    if (periodView === 'weekly') {
      const start = startOfWeek(currentDate, { weekStartsOn: 1 })
      const end = endOfWeek(currentDate, { weekStartsOn: 1 })
      return {
        periodInterval: { start, end },
        periodLabel: `${format(start, 'd MMM')} – ${format(end, 'd MMM yyyy')}`,
      }
    }
    if (periodView === 'yearly') {
      const start = startOfYear(currentDate)
      const end = endOfYear(currentDate)
      return {
        periodInterval: { start, end },
        periodLabel: format(currentDate, 'yyyy'),
      }
    }
    if (periodView === 'custom') {
      const start = customStartDate ? startOfDay(new Date(`${customStartDate}T00:00:00`)) : new Date(0)
      const end = customEndDate ? endOfDay(new Date(`${customEndDate}T23:59:59`)) : new Date()
      return {
        periodInterval: { start, end },
        periodLabel: `${format(start, 'd MMM yyyy')} – ${format(end, 'd MMM yyyy')}`,
      }
    }
    // Monthly (default)
    const start = startOfMonth(currentDate)
    const end = endOfMonth(currentDate)
    return {
      periodInterval: { start, end },
      periodLabel: format(currentDate, 'MMMM yyyy'),
    }
  }, [periodView, currentDate, customStartDate, customEndDate])

  // Filter expenses strictly by the active period interval
  const periodExpenses = useMemo(() => {
    return expenses.filter(e => {
      try {
        return isWithinInterval(e.date, periodInterval)
      } catch {
        return false
      }
    })
  }, [expenses, periodInterval])

  // Apply search and advanced filters on top of period expenses
  const filteredExpenses = useMemo(() => {
    const q = keyword.trim().toLowerCase()
    const minVal = minAmount ? parseFloat(minAmount) : null
    const maxVal = maxAmount ? parseFloat(maxAmount) : null

    return periodExpenses.filter(e => {
      // Keyword search
      if (q) {
        const code = getExpenseCode(e).toLowerCase()
        const desc = (e.description || '').toLowerCase()
        const note = (e.note || '').toLowerCase()
        const vendor = (e.vendor || '').toLowerCase()
        const method = (e.method || '').toLowerCase()
        const proj = getProjectName(e).toLowerCase()
        const cat = resolveCategory(e.category).label.toLowerCase()

        const matches =
          code.includes(q) ||
          desc.includes(q) ||
          note.includes(q) ||
          vendor.includes(q) ||
          method.includes(q) ||
          proj.includes(q) ||
          cat.includes(q)
        if (!matches) return false
      }

      // Category filter
      if (selectedCategory !== 'All') {
        const catInfo = resolveCategory(e.category)
        if (catInfo.label.toLowerCase() !== selectedCategory.toLowerCase()) {
          return false
        }
      }

      // Payment Method filter
      if (selectedMethod !== 'All') {
        if ((e.method || '').toLowerCase() !== selectedMethod.toLowerCase()) {
          return false
        }
      }

      // Source filter
      if (selectedSource !== 'All') {
        const autoMeta = getAutoPayoutMeta(e)
        if (selectedSource === 'Manual' && autoMeta.isAuto) return false
        if (selectedSource === 'Auto Payout' && !autoMeta.isAuto) return false
        if (selectedSource === 'Salary' && autoMeta.typeLabel !== 'Salary Payout') return false
        if (selectedSource === 'Freelancer Payout' && autoMeta.typeLabel !== 'Freelancer Payout') return false
      }

      // Project filter
      if (selectedProject !== 'All') {
        const proj = getProjectName(e)
        if (proj !== selectedProject) return false
      }

      // Amount Range
      const amt = e.amount || 0
      if (minVal !== null && !isNaN(minVal) && amt < minVal) return false
      if (maxVal !== null && !isNaN(maxVal) && amt > maxVal) return false

      return true
    })
  }, [periodExpenses, keyword, selectedCategory, selectedMethod, selectedSource, selectedProject, minAmount, maxAmount, getProjectName])

  // Sorting
  const sortedExpenses = useMemo(() => {
    return [...filteredExpenses].sort((a, b) => {
      let comp = 0
      if (sortField === 'createdAt') {
        const timeA = a.createdAt instanceof Date && !isNaN(a.createdAt.getTime()) ? a.createdAt.getTime() : a.date.getTime()
        const timeB = b.createdAt instanceof Date && !isNaN(b.createdAt.getTime()) ? b.createdAt.getTime() : b.date.getTime()
        if (timeA !== timeB) {
          comp = timeA - timeB
        } else {
          comp = a.date.getTime() - b.date.getTime()
        }
      } else if (sortField === 'date') {
        const dateDiff = a.date.getTime() - b.date.getTime()
        if (dateDiff !== 0) {
          comp = dateDiff
        } else {
          // Tiebreaker on identical dates: newest created expense first
          const timeA = a.createdAt instanceof Date && !isNaN(a.createdAt.getTime()) ? a.createdAt.getTime() : 0
          const timeB = b.createdAt instanceof Date && !isNaN(b.createdAt.getTime()) ? b.createdAt.getTime() : 0
          comp = timeA - timeB
        }
      } else if (sortField === 'amount') {
        comp = (a.amount || 0) - (b.amount || 0)
      } else if (sortField === 'code') {
        comp = getExpenseCode(a).localeCompare(getExpenseCode(b))
      } else if (sortField === 'vendor') {
        comp = (a.vendor || '').localeCompare(b.vendor || '')
      } else if (sortField === 'category') {
        comp = resolveCategory(a.category).label.localeCompare(resolveCategory(b.category).label)
      }
      return sortOrder === 'asc' ? comp : -comp
    })
  }, [filteredExpenses, sortField, sortOrder])

  // Pagination slicing with safe bounds to prevent out-of-range pages when filters change
  const totalPages = Math.max(1, Math.ceil(sortedExpenses.length / pageSize))
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages)
  const paginatedExpenses = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize
    return sortedExpenses.slice(start, start + pageSize)
  }, [sortedExpenses, safeCurrentPage, pageSize])

  // Toggle column sorting
  const handleSortToggle = (field: SortField) => {
    setCurrentPage(1)
    if (sortField === field) {
      setSortOrder(o => (o === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortOrder('desc')
    }
  }

  // Dashboard Metrics & Category breakdown
  const {
    totalSpend,
    totalTransactions,
    avgExpense,
    autoPayoutsTotal,
    autoPayoutsCount,
    categoryBreakdown,
    topCategory,
  } = useMemo(() => {
    let spend = 0
    let autoTotal = 0
    let autoCount = 0
    const catSums: Record<string, { label: string; amount: number; colorVar: string; count: number }> = {}

    for (const e of periodExpenses) {
      const amt = e.amount || 0
      spend += amt

      const autoMeta = getAutoPayoutMeta(e)
      if (autoMeta.isAuto) {
        autoTotal += amt
        autoCount += 1
      }

      const catInfo = resolveCategory(e.category)
      if (!catSums[catInfo.label]) {
        catSums[catInfo.label] = {
          label: catInfo.label,
          amount: 0,
          colorVar: catInfo.colorVar,
          count: 0,
        }
      }
      catSums[catInfo.label].amount += amt
      catSums[catInfo.label].count += 1
    }

    const categoriesList = Object.values(catSums)
      .sort((a, b) => b.amount - a.amount)
      .map(c => ({
        ...c,
        percent: spend > 0 ? Math.round((c.amount / spend) * 100) : 0,
      }))

    return {
      totalSpend: spend,
      totalTransactions: periodExpenses.length,
      avgExpense: periodExpenses.length > 0 ? Math.round(spend / periodExpenses.length) : 0,
      autoPayoutsTotal: autoTotal,
      autoPayoutsCount: autoCount,
      categoryBreakdown: categoriesList,
      topCategory: categoriesList[0] || null,
    }
  }, [periodExpenses])

  // SVG Trend Bar Chart Data
  const trendData = useMemo(() => {
    if (periodView === 'yearly') {
      // 12 months of the selected year
      const year = currentDate.getFullYear()
      const months = Array.from({ length: 12 }, (_, i) => ({
        label: format(new Date(year, i, 1), 'MMM'),
        fullLabel: format(new Date(year, i, 1), 'MMMM yyyy'),
        amount: 0,
        count: 0,
      }))

      for (const e of periodExpenses) {
        const m = e.date.getMonth()
        months[m].amount += e.amount || 0
        months[m].count += 1
      }
      return months
    }

    if (periodView === 'weekly') {
      // 7 days of the selected week
      const start = startOfWeek(currentDate, { weekStartsOn: 1 })
      const days = Array.from({ length: 7 }, (_, i) => {
        const d = addDays(start, i)
        return {
          label: format(d, 'EEE'),
          fullLabel: format(d, 'd MMM yyyy'),
          amount: 0,
          count: 0,
        }
      })

      for (const e of periodExpenses) {
        const dayIdx = (e.date.getDay() + 6) % 7 // Monday = 0
        if (days[dayIdx]) {
          days[dayIdx].amount += e.amount || 0
          days[dayIdx].count += 1
        }
      }
      return days
    }

    if (periodView === 'daily') {
      // 7 days ending with currentDate
      const days = Array.from({ length: 7 }, (_, i) => {
        const d = subDays(currentDate, 6 - i)
        return {
          label: format(d, 'd MMM'),
          fullLabel: format(d, 'EEEE, d MMM yyyy'),
          amount: 0,
          count: 0,
        }
      })

      for (const e of expenses) {
        const dayStr = format(e.date, 'yyyy-MM-dd')
        const idx = days.findIndex(
          d => format(new Date(d.fullLabel), 'yyyy-MM-dd') === dayStr
        )
        if (idx !== -1) {
          days[idx].amount += e.amount || 0
          days[idx].count += 1
        }
      }
      return days
    }

    // Monthly view default: 4 weeks of the month
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const buckets = [
      { label: 'Days 1-7', fullLabel: '1st - 7th', amount: 0, count: 0 },
      { label: 'Days 8-14', fullLabel: '8th - 14th', amount: 0, count: 0 },
      { label: 'Days 15-21', fullLabel: '15th - 21st', amount: 0, count: 0 },
      { label: `Days 22-${daysInMonth}`, fullLabel: `22nd - ${daysInMonth}th`, amount: 0, count: 0 },
    ]

    for (const e of periodExpenses) {
      const d = e.date.getDate()
      const idx = d <= 7 ? 0 : d <= 14 ? 1 : d <= 21 ? 2 : 3
      buckets[idx].amount += e.amount || 0
      buckets[idx].count += 1
    }
    return buckets
  }, [periodView, currentDate, periodExpenses, expenses])

  // CSV Export handler with UTF-8 BOM and explicit Expense Serial Numbers
  const handleExportCSV = () => {
    if (!filteredExpenses.length) return

    const headers = [
      'Serial No (Code)',
      'Date',
      'Category',
      'Description / Note',
      'Vendor',
      'Amount (INR)',
      'Payment Method',
      'Project',
      'Source / Payout Type',
      'Auto Payout Noted',
    ]

    const rows = filteredExpenses.map(e => {
      const code = getExpenseCode(e)
      const autoMeta = getAutoPayoutMeta(e)
      const descNote = (e.description || e.note || '').trim()
      // Guarantee auto payouts note the serial number explicitly
      const fullNote = autoMeta.isAuto ? `[${code}] ${descNote}` : descNote

      return [
        `"${code}"`,
        format(e.date, 'yyyy-MM-dd'),
        `"${resolveCategory(e.category).label}"`,
        `"${fullNote.replace(/"/g, '""')}"`,
        `"${(e.vendor || '').replace(/"/g, '""')}"`,
        e.amount || 0,
        `"${(e.method || 'GPay').replace(/"/g, '""')}"`,
        `"${(getProjectName(e) || '').replace(/"/g, '""')}"`,
        `"${autoMeta.typeLabel}"`,
        autoMeta.isAuto ? 'YES' : 'NO',
      ]
    })

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `expenses_${periodView}_${format(new Date(), 'yyyyMMdd_HHmm')}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  // Clear all filters
  const handleClearFilters = () => {
    setKeyword('')
    setSelectedCategory('All')
    setSelectedMethod('All')
    setSelectedSource('All')
    setSelectedProject('All')
    setMinAmount('')
    setMaxAmount('')
    setCurrentPage(1)
  }

  const hasActiveFilters =
    Boolean(keyword.trim()) ||
    selectedCategory !== 'All' ||
    selectedMethod !== 'All' ||
    selectedSource !== 'All' ||
    selectedProject !== 'All' ||
    Boolean(minAmount) ||
    Boolean(maxAmount)

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
            The Expenses module is restricted strictly to studio administrators.
          </p>
          <Button onClick={() => router.push('/dashboard')}>Go to Dashboard</Button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', maxWidth: '1280px', margin: '0 auto', paddingBottom: '32px' }}>
      
      {/* ─── TOP BAR: TITLE, PERIOD VIEWS & PRIMARY ACTIONS ─────────────────── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ flex: 1, minWidth: '220px' }}>
          <h1 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }} className="md:!text-2xl">
            Expenses & Payouts
          </h1>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)', marginTop: '2px' }}>
            Track expenditures, vendor payments, salary deductions, and auto freelancer payouts with serial tracking.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }} className="w-full md:!w-auto">
          <Button
            variant="outline"
            onClick={handleExportCSV}
            disabled={filteredExpenses.length === 0}
            style={{ height: '36px', fontSize: 'var(--text-xs)', gap: '6px' }}
            className="flex-1 md:!flex-none"
          >
            <i className="ti ti-download" style={{ fontSize: '14px' }} />
            Export CSV
          </Button>

          <Button
            onClick={() => router.push('/erp/expenses/new')}
            style={{ height: '36px', fontWeight: 600, gap: '6px' }}
            className="flex-1 md:!flex-none"
          >
            <i className="ti ti-plus" style={{ fontSize: '14px' }} />
            Add expense
          </Button>
        </div>
      </div>

      {/* ─── PERIOD SELECTOR & NAVIGATION TRAY ────────────────────────────── */}
      <div
        style={{
          background: 'var(--color-surface)',
          border: '0.5px solid var(--color-border)',
          borderRadius: '12px',
          padding: '10px 14px',
          display: 'flex',
          gap: '12px',
        }}
        className="flex-col md:!flex-row md:!items-center md:!justify-between"
      >
        {/* Period Switcher Tabs */}
        <div
          style={{
            maxWidth: '100%',
            overflowX: 'auto',
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'none',
          }}
          className="w-full md:!w-auto"
        >
          <div
            style={{
              display: 'flex',
              background: 'var(--color-surface-raised)',
              borderRadius: '8px',
              padding: '3px',
              border: '0.5px solid var(--color-border)',
              whiteSpace: 'nowrap',
            }}
            className="w-full md:!w-auto"
          >
            {(['daily', 'weekly', 'monthly', 'yearly', 'custom'] as PeriodView[]).map(view => {
              const active = periodView === view
              return (
                <button
                  key={view}
                  type="button"
                  onClick={() => {
                    setPeriodView(view)
                    setCurrentPage(1)
                  }}
                  style={{
                    background: active ? 'var(--color-surface)' : 'transparent',
                    color: active ? 'var(--color-foreground)' : 'var(--color-foreground-muted)',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '6px 12px',
                    fontSize: 'var(--text-xs)',
                    fontWeight: active ? 600 : 500,
                    cursor: 'pointer',
                    textTransform: 'capitalize',
                    boxShadow: active ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                  className="flex-1 md:!flex-none text-center"
                >
                  {view}
                </button>
              )
            })}
          </div>
        </div>

        {/* Date Navigator Controls */}
        {periodView !== 'custom' ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
            }}
            className="w-full md:!w-auto md:!justify-end"
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }} className="flex-1 md:!flex-none">
              <button
                type="button"
                onClick={handlePrevPeriod}
                title="Previous period"
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '6px',
                  border: '0.5px solid var(--color-border)',
                  background: 'var(--color-surface-raised)',
                  color: 'var(--color-foreground)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <i className="ti ti-chevron-left" style={{ fontSize: '15px' }} />
              </button>

              <span
                style={{
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  color: 'var(--color-foreground)',
                  padding: '0 4px',
                  minWidth: '120px',
                  textAlign: 'center',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
                className="md:!text-sm md:!min-w-[140px]"
              >
                {periodLabel}
              </span>

              <button
                type="button"
                onClick={handleNextPeriod}
                title="Next period"
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '6px',
                  border: '0.5px solid var(--color-border)',
                  background: 'var(--color-surface-raised)',
                  color: 'var(--color-foreground)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <i className="ti ti-chevron-right" style={{ fontSize: '15px' }} />
              </button>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleTodayPeriod}
              style={{ height: '32px', fontSize: 'var(--text-xs)', padding: '0 12px', flexShrink: 0 }}
            >
              Today
            </Button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }} className="w-full md:!w-auto">
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>From:</span>
            <div style={{ flex: 1, minWidth: '120px' }}>
              <DateField
                value={customStartDate}
                onChange={v => {
                  setCustomStartDate(v)
                  setCurrentPage(1)
                }}
              />
            </div>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>To:</span>
            <div style={{ flex: 1, minWidth: '120px' }}>
              <DateField
                value={customEndDate}
                onChange={v => {
                  setCustomEndDate(v)
                  setCurrentPage(1)
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* ─── DASHBOARD SUMMARY METRIC CARDS (4-GRID) ───────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Card 1: Total Spend */}
        <div
          className="p-3 md:p-4"
          style={{
            background: 'var(--color-surface)',
            border: '0.5px solid var(--color-border)',
            borderRadius: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-foreground-subtle)', textTransform: 'uppercase' }}>
              Total Spend
            </span>
            <span
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '8px',
                background: 'var(--color-primary-muted)',
                color: 'var(--color-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <i className="ti ti-wallet" style={{ fontSize: '15px' }} />
            </span>
          </div>
          <div className="text-xl md:!text-3xl" style={{ fontWeight: 700, color: 'var(--color-foreground)' }}>
            ₹{totalSpend.toLocaleString('en-IN')}
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>
            <b>{totalTransactions}</b> records in {periodLabel}
          </div>
        </div>

        {/* Card 2: Auto Payouts & Salaries (Special Focus) */}
        <div
          className="p-3 md:p-4"
          style={{
            background: 'var(--color-surface)',
            border: '0.5px solid var(--color-border)',
            borderRadius: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-foreground-subtle)', textTransform: 'uppercase' }}>
              Auto Payouts
            </span>
            <span
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '8px',
                background: 'var(--color-purple-muted)',
                color: 'var(--color-purple)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <i className="ti ti-bolt" style={{ fontSize: '15px' }} />
            </span>
          </div>
          <div className="text-xl md:!text-3xl" style={{ fontWeight: 700, color: 'var(--color-purple)' }}>
            ₹{autoPayoutsTotal.toLocaleString('en-IN')}
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ padding: '1px 6px', borderRadius: '4px', background: 'var(--color-surface-raised)', fontWeight: 600 }}>
              {autoPayoutsCount} payouts
            </span>
            <span className="hidden sm:inline">noted with EXP serials</span>
          </div>
        </div>

        {/* Card 3: Average / Transaction */}
        <div
          className="p-3 md:p-4"
          style={{
            background: 'var(--color-surface)',
            border: '0.5px solid var(--color-border)',
            borderRadius: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-foreground-subtle)', textTransform: 'uppercase' }}>
              Avg. Per Expense
            </span>
            <span
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '8px',
                background: 'var(--color-accent-muted)',
                color: 'var(--color-accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <i className="ti ti-calculator" style={{ fontSize: '15px' }} />
            </span>
          </div>
          <div className="text-xl md:!text-3xl" style={{ fontWeight: 700, color: 'var(--color-foreground)' }}>
            ₹{avgExpense.toLocaleString('en-IN')}
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>
            Mean spend per item
          </div>
        </div>

        {/* Card 4: Top Category */}
        <div
          className="p-3 md:p-4"
          style={{
            background: 'var(--color-surface)',
            border: '0.5px solid var(--color-border)',
            borderRadius: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-foreground-subtle)', textTransform: 'uppercase' }}>
              Top Category
            </span>
            <span
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '8px',
                background: 'var(--color-secondary-muted)',
                color: 'var(--color-secondary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <i className="ti ti-chart-pie" style={{ fontSize: '15px' }} />
            </span>
          </div>
          <div className="text-lg md:!text-2xl" style={{ fontWeight: 700, color: 'var(--color-foreground)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {topCategory ? topCategory.label : 'None'}
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {topCategory ? `₹${topCategory.amount.toLocaleString('en-IN')} (${topCategory.percent}%)` : 'No transactions'}
          </div>
        </div>
      </div>

      {/* ─── CHARTS SECTION: DONUT (CATEGORY) & BARS (TREND) ──────────────── */}
      <div
        className="grid grid-cols-1 md:grid-cols-2 gap-3.5"
      >
        {/* CHART 1: Category Donut Chart */}
        <div
          style={{
            background: 'var(--color-surface)',
            border: '0.5px solid var(--color-border)',
            borderRadius: '12px',
            padding: '18px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-foreground)' }}>
                Category Breakdown
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>
                Spending distribution across studio categories
              </div>
            </div>
            <i className="ti ti-chart-donut" style={{ fontSize: '18px', color: 'var(--color-foreground-muted)' }} />
          </div>

          {categoryBreakdown.length === 0 ? (
            <div style={{ padding: '36px 0', textAlign: 'center', color: 'var(--color-foreground-muted)', fontSize: 'var(--text-xs)' }}>
              No expense data recorded in this period
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
              {/* Circular SVG Donut */}
              <div
                style={{ position: 'relative', width: '140px', height: '140px', flexShrink: 0, margin: '0 auto' }}
                onMouseLeave={() => setHoveredCategory(null)}
              >
                <svg
                  width="140"
                  height="140"
                  viewBox="0 0 140 140"
                  style={{ overflow: 'visible' }}
                  onMouseLeave={() => setHoveredCategory(null)}
                >
                  {(() => {
                    const radius = 50
                    const circumference = 2 * Math.PI * radius
                    let offsetAccum = 0

                    return categoryBreakdown.map((cat, i) => {
                      const fraction = totalSpend > 0 ? cat.amount / totalSpend : 0
                      const dashLength = Math.max(0, fraction * circumference)
                      const currentOffset = offsetAccum
                      offsetAccum += dashLength

                      const isHovered = hoveredCategory === cat.label

                      return (
                        <circle
                          key={cat.label || i}
                          cx="70"
                          cy="70"
                          r={radius}
                          fill="transparent"
                          stroke={cat.colorVar}
                          strokeWidth="19"
                          strokeDasharray={`${dashLength} ${circumference - dashLength}`}
                          strokeDashoffset={-currentOffset}
                          style={{
                            transformOrigin: '70px 70px',
                            transform: isHovered ? 'rotate(-90deg) scale(1.05)' : 'rotate(-90deg) scale(1)',
                            transition: 'transform 0.18s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.18s ease',
                            cursor: 'pointer',
                            opacity: hoveredCategory ? (isHovered ? 1 : 0.35) : 1,
                          }}
                          onMouseEnter={() => setHoveredCategory(cat.label)}
                          onClick={() => {
                            setSelectedCategory(cat.label)
                            setCurrentPage(1)
                          }}
                        >
                          <title>{`${cat.label}: ₹${cat.amount.toLocaleString('en-IN')} (${cat.percent}%)`}</title>
                        </circle>
                      )
                    })
                  })()}
                </svg>

                {/* Center text in donut */}
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    pointerEvents: 'none',
                    textAlign: 'center',
                    padding: '0 8px',
                  }}
                >
                  {(() => {
                    const hoveredCatObj = categoryBreakdown.find((c) => c.label === hoveredCategory)
                    return (
                      <>
                        <span
                          style={{
                            fontSize: '11px',
                            color: hoveredCatObj ? 'var(--color-primary)' : 'var(--color-foreground-muted)',
                            fontWeight: 600,
                            maxWidth: '90px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {hoveredCatObj ? `${hoveredCatObj.label} (${hoveredCatObj.percent}%)` : 'Total Spend'}
                        </span>
                        <span
                          style={{
                            fontSize: 'var(--text-sm)',
                            fontWeight: 700,
                            color: 'var(--color-foreground)',
                            marginTop: '1px',
                          }}
                        >
                          ₹{(hoveredCatObj ? hoveredCatObj.amount : totalSpend).toLocaleString('en-IN')}
                        </span>
                      </>
                    )
                  })()}
                </div>
              </div>

              {/* Legend list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, minWidth: '150px' }}>
                {categoryBreakdown.slice(0, 5).map((cat, i) => (
                  <div
                    key={i}
                    onClick={() => {
                      setSelectedCategory(cat.label)
                      setCurrentPage(1)
                    }}
                    onMouseEnter={() => setHoveredCategory(cat.label)}
                    onMouseLeave={() => setHoveredCategory(null)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: 'var(--text-xs)',
                      cursor: 'pointer',
                      padding: '4px 6px',
                      borderRadius: '6px',
                      background: hoveredCategory === cat.label ? 'var(--color-surface-raised)' : 'transparent',
                      transition: 'background 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span
                        style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          background: cat.colorVar,
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ color: 'var(--color-foreground)' }}>{cat.label}</span>
                    </div>
                    <span style={{ fontWeight: 600, color: 'var(--color-foreground-muted)' }}>
                      {cat.percent}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* CHART 2: Spending Trend Bar Chart */}
        <div
          style={{
            background: 'var(--color-surface)',
            border: '0.5px solid var(--color-border)',
            borderRadius: '12px',
            padding: '18px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-foreground)' }}>
                Spending Trend
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>
                Chronological spend breakdown for {periodLabel}
              </div>
            </div>
            <i className="ti ti-chart-bar" style={{ fontSize: '18px', color: 'var(--color-foreground-muted)' }} />
          </div>

          {trendData.length === 0 || totalSpend === 0 ? (
            <div style={{ padding: '36px 0', textAlign: 'center', color: 'var(--color-foreground-muted)', fontSize: 'var(--text-xs)' }}>
              No chronological trend data recorded in this period
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {/* SVG Bar Chart */}
              <div style={{ width: '100%', height: '140px' }}>
                {(() => {
                  const maxTrendVal = Math.max(...trendData.map(t => t.amount), 1000)
                  const svgWidth = 440
                  const svgHeight = 130
                  const barAreaWidth = svgWidth - 50
                  const barAreaHeight = svgHeight - 24
                  const count = trendData.length
                  const slotWidth = barAreaWidth / count
                  const barWidth = Math.max(8, Math.min(28, slotWidth * 0.55))

                  return (
                    <svg width="100%" height="100%" viewBox={`0 0 ${svgWidth} ${svgHeight}`}>
                      {/* Grid horizontal guidelines */}
                      {[0.25, 0.5, 0.75, 1].map((pct, idx) => {
                        const y = barAreaHeight - pct * barAreaHeight + 8
                        return (
                          <line
                            key={idx}
                            x1="45"
                            y1={y}
                            x2={svgWidth}
                            y2={y}
                            stroke="var(--color-border)"
                            strokeWidth="0.5"
                            strokeDasharray="3 3"
                          />
                        )
                      })}

                      {/* Bars */}
                      {trendData.map((item, idx) => {
                        const barHeight = Math.max(3, (item.amount / maxTrendVal) * barAreaHeight)
                        const x = 45 + idx * slotWidth + (slotWidth - barWidth) / 2
                        const y = barAreaHeight - barHeight + 8
                        const isHovered = hoveredBarIndex === idx

                        return (
                          <g
                            key={idx}
                            onMouseEnter={() => setHoveredBarIndex(idx)}
                            onMouseLeave={() => setHoveredBarIndex(null)}
                            style={{ cursor: 'pointer' }}
                          >
                            <rect
                              x={x}
                              y={y}
                              width={barWidth}
                              height={barHeight}
                              rx="3"
                              ry="3"
                              fill={
                                isHovered
                                  ? 'var(--color-primary-hover)'
                                  : item.amount > 0
                                  ? 'var(--color-primary)'
                                  : 'var(--color-surface-raised)'
                              }
                              style={{ transition: 'all 0.15s ease' }}
                            />
                            {/* X-axis labels */}
                            <text
                              x={x + barWidth / 2}
                              y={svgHeight - 2}
                              textAnchor="middle"
                              fontSize="9"
                              fill="var(--color-foreground-subtle)"
                              fontFamily="var(--font-inter)"
                            >
                              {item.label}
                            </text>
                          </g>
                        )
                      })}
                    </svg>
                  )
                })()}
              </div>

              {/* Bar Tooltip or Active Summary Display */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: 'var(--text-xs)',
                  padding: '4px 8px',
                  background: 'var(--color-surface-raised)',
                  borderRadius: '6px',
                  border: '0.5px solid var(--color-border)',
                }}
              >
                {hoveredBarIndex !== null && trendData[hoveredBarIndex] ? (
                  <>
                    <span style={{ color: 'var(--color-foreground)' }}>
                      <b>{trendData[hoveredBarIndex].fullLabel}</b>
                    </span>
                    <span style={{ color: 'var(--color-primary)', fontWeight: 700 }}>
                      ₹{trendData[hoveredBarIndex].amount.toLocaleString('en-IN')} ({trendData[hoveredBarIndex].count} records)
                    </span>
                  </>
                ) : (
                  <>
                    <span style={{ color: 'var(--color-foreground-muted)' }}>
                      Hover over any bar to view details
                    </span>
                    <span style={{ color: 'var(--color-foreground)', fontWeight: 600 }}>
                      Peak: ₹{Math.max(...trendData.map(t => t.amount), 0).toLocaleString('en-IN')}
                    </span>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─── SEARCH & FILTER TOOLBAR ───────────────────────────────────────── */}
      <div
        style={{
          background: 'var(--color-surface)',
          border: '0.5px solid var(--color-border)',
          borderRadius: '12px',
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        {/* Row 1: Search + Quick Mobile Filter Toggle */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {/* Keyword Search Input */}
          <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
            <i
              className="ti ti-search"
              style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--color-foreground-muted)',
                fontSize: '15px',
              }}
            />
            <Input
              type="text"
              placeholder="Search serial # (EXP-...), vendor, note, description, client..."
              value={keyword}
              onChange={e => {
                setKeyword(e.target.value)
                setCurrentPage(1)
              }}
              style={{
                paddingLeft: '34px',
                paddingRight: keyword ? '32px' : '12px',
                height: '38px',
                fontSize: 'var(--text-xs)',
              }}
            />
            {keyword && (
              <button
                type="button"
                onClick={() => {
                  setKeyword('')
                  setCurrentPage(1)
                }}
                title="Clear search"
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-foreground-muted)',
                  cursor: 'pointer',
                  padding: '2px',
                }}
              >
                <i className="ti ti-x" style={{ fontSize: '13px' }} />
              </button>
            )}
          </div>

          {/* Quick Clear All Filters */}
          {hasActiveFilters && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearFilters}
              style={{ height: '38px', fontSize: 'var(--text-xs)', gap: '4px', borderColor: 'var(--color-secondary)', flexShrink: 0 }}
            >
              <i className="ti ti-filter-off" style={{ fontSize: '13px' }} />
              <span className="hidden sm:inline">Reset</span>
            </Button>
          )}

          {/* Filter Expand/Collapse Toggle (Desktop & Mobile) */}
          <div style={{ flexShrink: 0 }}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters(s => !s)}
              style={{
                height: '38px',
                fontSize: 'var(--text-xs)',
                gap: '4px',
                background: showFilters ? 'var(--color-primary-muted)' : 'var(--color-surface-raised)',
                borderColor: showFilters ? 'var(--color-primary)' : 'var(--color-border)',
                color: showFilters ? 'var(--color-primary)' : 'var(--color-foreground)',
              }}
            >
              <i className="ti ti-adjustments" style={{ fontSize: '14px' }} />
              <span>Filters{hasActiveFilters ? ' •' : ''}</span>
            </Button>
          </div>
        </div>

        {/* Row 2: Comprehensive Multi-field Filter Bar */}
        {showFilters && (
          <div
            className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-2"
            style={{
              alignItems: 'center',
              paddingTop: '10px',
              borderTop: '0.5px solid var(--color-border)',
            }}
          >
          {/* Category Filter */}
          <select
            value={selectedCategory}
            onChange={e => {
              setSelectedCategory(e.target.value)
              setCurrentPage(1)
            }}
            style={{
              fontFamily: 'var(--font-inter)',
              height: '36px',
              background: 'var(--color-surface-raised)',
              border: '0.5px solid var(--color-border)',
              borderRadius: '8px',
              padding: '0 8px',
              fontSize: 'var(--text-xs)',
              color: selectedCategory === 'All' ? 'var(--color-foreground-muted)' : 'var(--color-foreground)',
              outline: 'none',
              cursor: 'pointer',
              width: '100%',
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
            <option value="Salaries">Salaries</option>
            <option value="Misc">Misc</option>
          </select>

          {/* Payment Method Filter */}
          <select
            value={selectedMethod}
            onChange={e => {
              setSelectedMethod(e.target.value)
              setCurrentPage(1)
            }}
            style={{
              fontFamily: 'var(--font-inter)',
              height: '36px',
              background: 'var(--color-surface-raised)',
              border: '0.5px solid var(--color-border)',
              borderRadius: '8px',
              padding: '0 8px',
              fontSize: 'var(--text-xs)',
              color: selectedMethod === 'All' ? 'var(--color-foreground-muted)' : 'var(--color-foreground)',
              outline: 'none',
              cursor: 'pointer',
              width: '100%',
            }}
          >
            <option value="All">Method · All</option>
            {availableMethods.map(m => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          {/* Source Filter (Manual vs Auto Payouts vs Salary) */}
          <select
            value={selectedSource}
            onChange={e => {
              setSelectedSource(e.target.value)
              setCurrentPage(1)
            }}
            style={{
              fontFamily: 'var(--font-inter)',
              height: '36px',
              background: 'var(--color-surface-raised)',
              border: '0.5px solid var(--color-border)',
              borderRadius: '8px',
              padding: '0 8px',
              fontSize: 'var(--text-xs)',
              color: selectedSource === 'All' ? 'var(--color-foreground-muted)' : 'var(--color-foreground)',
              outline: 'none',
              cursor: 'pointer',
              width: '100%',
            }}
          >
            <option value="All">Source · All</option>
            <option value="Manual">Manual</option>
            <option value="Auto Payout">⚡ Auto Payouts</option>
            <option value="Salary">Salary Payouts</option>
            <option value="Freelancer Payout">Freelancer Payouts</option>
          </select>

          {/* Project Filter */}
          <select
            value={selectedProject}
            onChange={e => {
              setSelectedProject(e.target.value)
              setCurrentPage(1)
            }}
            style={{
              fontFamily: 'var(--font-inter)',
              height: '36px',
              background: 'var(--color-surface-raised)',
              border: '0.5px solid var(--color-border)',
              borderRadius: '8px',
              padding: '0 8px',
              fontSize: 'var(--text-xs)',
              color: selectedProject === 'All' ? 'var(--color-foreground-muted)' : 'var(--color-foreground)',
              outline: 'none',
              cursor: 'pointer',
              width: '100%',
            }}
          >
            <option value="All">Project · All</option>
            {availableProjects.map(p => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>

          {/* Min & Max Amount */}
          <div style={{ display: 'flex', gap: '6px' }} className="w-full">
            <div style={{ flex: 1, minWidth: 0 }}>
              <Input
                type="number"
                placeholder="Min ₹"
                value={minAmount}
                onChange={e => {
                  setMinAmount(e.target.value)
                  setCurrentPage(1)
                }}
                style={{ height: '36px', fontSize: 'var(--text-xs)', padding: '0 6px' }}
              />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Input
                type="number"
                placeholder="Max ₹"
                value={maxAmount}
                onChange={e => {
                  setMaxAmount(e.target.value)
                  setCurrentPage(1)
                }}
                style={{ height: '36px', fontSize: 'var(--text-xs)', padding: '0 6px' }}
              />
            </div>
          </div>

          {/* Sort By Selector */}
          <select
            value={`${sortField}_${sortOrder}`}
            onChange={e => {
              const [f, o] = e.target.value.split('_') as [SortField, SortOrder]
              setSortField(f)
              setSortOrder(o)
              setCurrentPage(1)
            }}
            style={{
              fontFamily: 'var(--font-inter)',
              height: '36px',
              background: 'var(--color-surface-raised)',
              border: '0.5px solid var(--color-border)',
              borderRadius: '8px',
              padding: '0 8px',
              fontSize: 'var(--text-xs)',
              color: 'var(--color-foreground)',
              outline: 'none',
              cursor: 'pointer',
              width: '100%',
            }}
          >
            <option value="createdAt_desc">Sort: Newest (Recent)</option>
            <option value="date_desc">Sort: Date (Newest)</option>
            <option value="date_asc">Sort: Date (Oldest)</option>
            <option value="amount_desc">Sort: Amount (High-Low)</option>
            <option value="amount_asc">Sort: Amount (Low-High)</option>
            <option value="code_asc">Sort: Serial (A-Z)</option>
            <option value="code_desc">Sort: Serial (Z-A)</option>
            <option value="vendor_asc">Sort: Vendor (A-Z)</option>
          </select>
        </div>
        )}
      </div>

      {/* ─── DESKTOP DATA TABLE (hidden md:block) ─────────────────────────── */}
      <div
        className="hidden md:block"
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
                {/* Code / Serial Header */}
                <th
                  onClick={() => handleSortToggle('code')}
                  style={{
                    textAlign: 'left',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: sortField === 'code' ? 'var(--color-primary)' : 'var(--color-foreground-subtle)',
                    padding: '12px 14px',
                    borderBottom: '0.5px solid var(--color-border-strong)',
                    cursor: 'pointer',
                    userSelect: 'none',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    Serial #
                    <i className={`ti ${sortField === 'code' ? (sortOrder === 'asc' ? 'ti-arrow-up' : 'ti-arrow-down') : 'ti-arrows-sort'}`} style={{ fontSize: '12px' }} />
                  </div>
                </th>

                {/* Date Header */}
                <th
                  onClick={() => handleSortToggle('date')}
                  style={{
                    textAlign: 'left',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: sortField === 'date' || sortField === 'createdAt' ? 'var(--color-primary)' : 'var(--color-foreground-subtle)',
                    padding: '12px 14px',
                    borderBottom: '0.5px solid var(--color-border-strong)',
                    cursor: 'pointer',
                    userSelect: 'none',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    Date
                    <i className={`ti ${sortField === 'date' ? (sortOrder === 'asc' ? 'ti-arrow-up' : 'ti-arrow-down') : sortField === 'createdAt' ? 'ti-arrow-down' : 'ti-arrows-sort'}`} style={{ fontSize: '12px' }} />
                  </div>
                </th>

                {/* Category Header */}
                <th
                  onClick={() => handleSortToggle('category')}
                  style={{
                    textAlign: 'left',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: sortField === 'category' ? 'var(--color-primary)' : 'var(--color-foreground-subtle)',
                    padding: '12px 14px',
                    borderBottom: '0.5px solid var(--color-border-strong)',
                    cursor: 'pointer',
                    userSelect: 'none',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    Category
                    <i className={`ti ${sortField === 'category' ? (sortOrder === 'asc' ? 'ti-arrow-up' : 'ti-arrow-down') : 'ti-arrows-sort'}`} style={{ fontSize: '12px' }} />
                  </div>
                </th>

                {/* Description Header */}
                <th
                  style={{
                    textAlign: 'left',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: 'var(--color-foreground-subtle)',
                    padding: '12px 14px',
                    borderBottom: '0.5px solid var(--color-border-strong)',
                  }}
                >
                  Description & Auto Note
                </th>

                {/* Vendor Header */}
                <th
                  onClick={() => handleSortToggle('vendor')}
                  style={{
                    textAlign: 'left',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: sortField === 'vendor' ? 'var(--color-primary)' : 'var(--color-foreground-subtle)',
                    padding: '12px 14px',
                    borderBottom: '0.5px solid var(--color-border-strong)',
                    cursor: 'pointer',
                    userSelect: 'none',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    Vendor
                    <i className={`ti ${sortField === 'vendor' ? (sortOrder === 'asc' ? 'ti-arrow-up' : 'ti-arrow-down') : 'ti-arrows-sort'}`} style={{ fontSize: '12px' }} />
                  </div>
                </th>

                {/* Amount Header */}
                <th
                  onClick={() => handleSortToggle('amount')}
                  style={{
                    textAlign: 'right',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: sortField === 'amount' ? 'var(--color-primary)' : 'var(--color-foreground-subtle)',
                    padding: '12px 14px',
                    borderBottom: '0.5px solid var(--color-border-strong)',
                    cursor: 'pointer',
                    userSelect: 'none',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end', width: '100%' }}>
                    Amount
                    <i className={`ti ${sortField === 'amount' ? (sortOrder === 'asc' ? 'ti-arrow-up' : 'ti-arrow-down') : 'ti-arrows-sort'}`} style={{ fontSize: '12px' }} />
                  </div>
                </th>

                {/* Method Header */}
                <th
                  style={{
                    textAlign: 'left',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: 'var(--color-foreground-subtle)',
                    padding: '12px 14px',
                    borderBottom: '0.5px solid var(--color-border-strong)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Method
                </th>

                {/* Project Header */}
                <th
                  style={{
                    textAlign: 'left',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: 'var(--color-foreground-subtle)',
                    padding: '12px 14px',
                    borderBottom: '0.5px solid var(--color-border-strong)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Project
                </th>

                {/* Actions Header */}
                <th
                  style={{
                    textAlign: 'right',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: 'var(--color-foreground-subtle)',
                    padding: '12px 14px',
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
                <TableRowSkeleton rows={pageSize} cols={9} />
              ) : paginatedExpenses.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ padding: '36px 16px' }}>
                    <EmptyState
                      icon="ti-wallet"
                      title="No expenses found"
                      description={
                        hasActiveFilters
                          ? 'Try adjusting your search query or filters to see more results.'
                          : 'No expenses have been recorded for this period yet.'
                      }
                    />
                  </td>
                </tr>
              ) : (
                paginatedExpenses.map(e => {
                  const catInfo = resolveCategory(e.category)
                  const projectName = getProjectName(e)
                  const code = getExpenseCode(e)
                  const autoMeta = getAutoPayoutMeta(e)

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
                      {/* Code / Serial Number */}
                      <td
                        style={{
                          padding: '0 14px',
                          borderBottom: '0.5px solid var(--color-border)',
                          whiteSpace: 'nowrap',
                          fontFamily: 'monospace',
                          fontSize: 'var(--text-xs)',
                          fontWeight: 700,
                          color: 'var(--color-foreground)',
                        }}
                      >
                        #{code}
                      </td>

                      {/* Date */}
                      <td
                        style={{
                          padding: '0 14px',
                          borderBottom: '0.5px solid var(--color-border)',
                          color: 'var(--color-foreground-muted)',
                          whiteSpace: 'nowrap',
                          fontSize: 'var(--text-xs)',
                        }}
                      >
                        {format(e.date, 'd MMM yyyy')}
                      </td>

                      {/* Category */}
                      <td style={{ padding: '0 14px', borderBottom: '0.5px solid var(--color-border)' }}>
                        <Badge variant={catInfo.badgeKey} label={catInfo.label} />
                      </td>

                      {/* Description & Auto Payout Tag */}
                      <td
                        style={{
                          padding: '0 14px',
                          borderBottom: '0.5px solid var(--color-border)',
                          color: 'var(--color-foreground)',
                          maxWidth: '260px',
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {e.description || e.note || '—'}
                          </span>
                          {autoMeta.isAuto && (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '10px',
                                fontWeight: 600,
                                color: 'var(--color-purple)',
                                background: 'var(--color-purple-muted)',
                                padding: '1px 6px',
                                borderRadius: '4px',
                                width: 'fit-content',
                              }}
                            >
                              <i className="ti ti-bolt" style={{ fontSize: '10px' }} />
                              {autoMeta.typeLabel} · {code}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Vendor */}
                      <td
                        style={{
                          padding: '0 14px',
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
                          padding: '0 14px',
                          borderBottom: '0.5px solid var(--color-border)',
                          textAlign: 'right',
                          fontWeight: 700,
                          color: 'var(--color-foreground)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        ₹{Number(e.amount || 0).toLocaleString('en-IN')}
                      </td>

                      {/* Payment Method */}
                      <td
                        style={{
                          padding: '0 14px',
                          borderBottom: '0.5px solid var(--color-border)',
                          whiteSpace: 'nowrap',
                          fontSize: 'var(--text-xs)',
                          color: 'var(--color-foreground-muted)',
                        }}
                      >
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: '6px',
                            background: 'var(--color-surface-raised)',
                            border: '0.5px solid var(--color-border)',
                          }}
                        >
                          {e.method || 'GPay'}
                        </span>
                      </td>

                      {/* Project */}
                      <td
                        style={{
                          padding: '0 14px',
                          borderBottom: '0.5px solid var(--color-border)',
                          color: projectName ? 'var(--color-foreground)' : 'var(--color-foreground-muted)',
                          whiteSpace: 'nowrap',
                          fontSize: 'var(--text-xs)',
                        }}
                      >
                        {projectName || '—'}
                      </td>

                      {/* Actions */}
                      <td
                        style={{
                          padding: '0 14px',
                          borderBottom: '0.5px solid var(--color-border)',
                          textAlign: 'right',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            aria-label="Edit expense"
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
                            <i className="ti ti-edit" style={{ fontSize: '15px' }} />
                          </button>

                          <button
                            type="button"
                            aria-label="Delete expense"
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
                            <i className="ti ti-trash" style={{ fontSize: '15px' }} />
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

      {/* ─── MOBILE COMPACT CARDS (block md:hidden) ────────────────────────── */}
      {/* AGENTS.md Section 15.2 Data Table Adaptations (Compact Cards) */}
      <div className="block md:hidden">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    background: 'var(--color-surface)',
                    border: '0.5px solid var(--color-border)',
                    borderRadius: '12px',
                    padding: '16px',
                    height: '110px',
                    opacity: 0.5,
                  }}
                />
              ))}
            </div>
          ) : paginatedExpenses.length === 0 ? (
            <div
              style={{
                background: 'var(--color-surface)',
                border: '0.5px solid var(--color-border)',
                borderRadius: '12px',
                padding: '32px 16px',
              }}
            >
              <EmptyState
                icon="ti-wallet"
                title="No expenses found"
                description={
                  hasActiveFilters
                    ? 'Try adjusting your search query or filters to see more results.'
                    : 'No expenses have been recorded for this period yet.'
                }
              />
            </div>
          ) : (
            paginatedExpenses.map(e => {
              const catInfo = resolveCategory(e.category)
              const projectName = getProjectName(e)
              const code = getExpenseCode(e)
              const autoMeta = getAutoPayoutMeta(e)

              return (
                <div
                  key={e.expenseId}
                  style={{
                    background: 'var(--color-surface)',
                    border: '0.5px solid var(--color-border)',
                    borderRadius: '12px',
                    padding: '14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '11px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                  }}
                >
                  {/* Header: Serial Number & Badges */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <span
                        style={{
                          fontFamily: 'monospace',
                          fontWeight: 700,
                          fontSize: 'var(--text-xs)',
                          color: 'var(--color-foreground)',
                          background: 'var(--color-surface-raised)',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          border: '0.5px solid var(--color-border)',
                          letterSpacing: '0.02em',
                        }}
                      >
                        #{code}
                      </span>
                      <Badge variant={catInfo.badgeKey} label={catInfo.label} />
                    </div>

                    {autoMeta.isAuto && (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '11px',
                          fontWeight: 600,
                          color: 'var(--color-purple)',
                          background: 'var(--color-purple-muted)',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          border: '0.5px solid var(--color-purple-muted)',
                        }}
                      >
                        <i className="ti ti-bolt" style={{ fontSize: '11px' }} />
                        {autoMeta.typeLabel}
                      </span>
                    )}
                  </div>

                  {/* Description & Vendor */}
                  <div>
                    <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-foreground)', lineHeight: 1.4, wordBreak: 'break-word' }}>
                      {e.description || e.note || '—'}
                    </div>
                    {e.vendor && (
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)', marginTop: '3px' }}>
                        Vendor: <b style={{ color: 'var(--color-foreground)', fontWeight: 600 }}>{e.vendor}</b>
                      </div>
                    )}
                  </div>

                  {/* Amount & Method Pill */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      background: 'var(--color-surface-raised)',
                      border: '0.5px solid var(--color-border)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>
                        Amount
                      </span>
                      <span
                        style={{
                          fontSize: '10px',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: 'var(--color-surface-overlay)',
                          border: '0.5px solid var(--color-border)',
                          color: 'var(--color-foreground-subtle)',
                          fontWeight: 600,
                        }}
                      >
                        {e.method || 'GPay'}
                      </span>
                    </div>
                    <span style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--color-foreground)' }}>
                      ₹{Number(e.amount || 0).toLocaleString('en-IN')}
                    </span>
                  </div>

                  {/* Metadata: Date & Project */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
                      <i className="ti ti-calendar" style={{ fontSize: '14px', color: 'var(--color-foreground-subtle)' }} />
                      <span>{format(e.date, 'd MMM yyyy')}</span>
                    </div>
                    {projectName ? (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px',
                          minWidth: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          color: 'var(--color-foreground)',
                        }}
                        title={projectName}
                      >
                        <i className="ti ti-folder" style={{ fontSize: '13px', color: 'var(--color-primary)', flexShrink: 0 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{projectName}</span>
                      </div>
                    ) : (
                      <span style={{ color: 'var(--color-foreground-subtle)' }}>—</span>
                    )}
                  </div>

                  {/* Card Action Footer: High-contrast, prominent Edit & Delete buttons */}
                  <div
                    style={{
                      display: 'flex',
                      gap: '10px',
                      borderTop: '0.5px solid var(--color-border)',
                      paddingTop: '12px',
                      marginTop: '4px',
                    }}
                  >
                    <button
                      type="button"
                      aria-label="Edit expense"
                      onClick={() => router.push(`/erp/expenses/edit/${e.expenseId}`)}
                      style={{
                        flex: 1,
                        height: '38px',
                        borderRadius: '8px',
                        background: 'var(--color-surface-raised)',
                        border: '0.5px solid var(--color-border-strong)',
                        color: 'var(--color-foreground)',
                        fontWeight: 600,
                        fontSize: 'var(--text-xs)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        cursor: 'pointer',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.12)',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <i className="ti ti-pencil" style={{ fontSize: '15px', color: 'var(--color-primary)' }} />
                      <span>Edit</span>
                    </button>

                    <button
                      type="button"
                      aria-label="Delete expense"
                      onClick={() => setExpenseToDelete(e)}
                      style={{
                        flex: 1,
                        height: '38px',
                        borderRadius: '8px',
                        background: 'var(--color-danger-muted)',
                        border: '0.5px solid var(--color-danger)',
                        color: 'var(--color-danger)',
                        fontWeight: 600,
                        fontSize: 'var(--text-xs)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        cursor: 'pointer',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.12)',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <i className="ti ti-trash" style={{ fontSize: '15px', color: 'var(--color-danger)' }} />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* ─── PAGINATION CONTROLS ───────────────────────────────────────────── */}
      {sortedExpenses.length > 0 && (
        <div
          style={{
            background: 'var(--color-surface)',
            border: '0.5px solid var(--color-border)',
            borderRadius: '12px',
            padding: '12px 16px',
            display: 'flex',
            gap: '12px',
          }}
          className="flex-col md:!flex-row md:!items-center md:!justify-between"
        >
          {/* Left on desktop, Top on mobile: Summary text & Rows Selector */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }} className="md:!w-auto md:!gap-4">
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>
              Showing <b>{Math.min(sortedExpenses.length, (safeCurrentPage - 1) * pageSize + 1)}</b>–<b>{Math.min(sortedExpenses.length, safeCurrentPage * pageSize)}</b> of <b>{sortedExpenses.length}</b> expenses
            </div>

            {/* Page Size Selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>Rows:</span>
              <select
                value={pageSize}
                onChange={e => {
                  setPageSize(Number(e.target.value))
                  setCurrentPage(1)
                }}
                style={{
                  fontFamily: 'var(--font-inter)',
                  height: '30px',
                  background: 'var(--color-surface-raised)',
                  border: '0.5px solid var(--color-border)',
                  borderRadius: '6px',
                  padding: '0 8px',
                  fontSize: 'var(--text-xs)',
                  color: 'var(--color-foreground)',
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </div>
          </div>

          {/* Right on desktop, Bottom on mobile: Navigation Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', width: '100%' }} className="md:!w-auto">
            <Button
              variant="outline"
              size="sm"
              disabled={safeCurrentPage <= 1}
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              style={{ flex: 1, maxWidth: '100px', height: '34px', padding: '0 12px', fontSize: 'var(--text-xs)', gap: '4px' }}
              className="md:!flex-none"
            >
              <i className="ti ti-chevron-left" />
              Prev
            </Button>

            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, padding: '0 8px', color: 'var(--color-foreground)', whiteSpace: 'nowrap' }}>
              Page {safeCurrentPage} of {totalPages}
            </span>

            <Button
              variant="outline"
              size="sm"
              disabled={safeCurrentPage >= totalPages}
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              style={{ flex: 1, maxWidth: '100px', height: '34px', padding: '0 12px', fontSize: 'var(--text-xs)', gap: '4px' }}
              className="md:!flex-none"
            >
              Next
              <i className="ti ti-chevron-right" />
            </Button>
          </div>
        </div>
      )}

      {/* ─── DELETE CONFIRMATION MODAL ─────────────────────────────────────── */}
      <ConfirmModal
        open={!!expenseToDelete}
        title="Delete Expense"
        description={`Are you sure you want to delete this expense of ₹${Number(expenseToDelete?.amount || 0).toLocaleString('en-IN')} (Serial #${getExpenseCode(expenseToDelete || ({} as Expense))})${expenseToDelete?.vendor ? ` for ${expenseToDelete.vendor}` : ''}? This action soft-deletes the record.`}
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

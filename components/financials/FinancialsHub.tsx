'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useRole } from '@/hooks/useAuth'
import { useAuthStore } from '@/store/authStore'
import {
  subscribeToExpenses,
  subscribeToExpenseCategories,
  createExpenseCategory,
  deleteExpenseCategory,
} from '@/lib/firebase/queries/expenses'
import { subscribeToClients } from '@/lib/firebase/queries/clients'
import {
  subscribeToBudgets,
  saveBudgetAmount,
  copyBudgetsFromPreviousMonth,
  subscribeToPayables,
  createPayable,
  markPayableAsPaid,
  deletePayable,
  subscribeToCashOpeningBalances,
  saveCashOpeningBalances,
  logInvoiceReminder,
  exportGstSummaryCSV,
  exportCashflowTransactionsCSV,
  exportBankInflowCSV,
  compileMonthlyFinancials,
  compileBudgetRows,
  compileProjectProfitability,
  subscribeToAllClientPayments,
  CATEGORY_META,
  type MonthlyFinancialSummary,
  type OutstandingReceivable,
  type BudgetVsActualRow,
  type ProjectProfitabilitySummary,
  type ForecastScenario,
  type ClientPaymentRecord,
  type FinancialLineItem,
  type BankPositionSummary,
} from '@/lib/firebase/queries/financials'
import {
  subscribeToBankAccounts,
  createBankAccount,
  updateBankAccount,
  deleteBankAccount,
  seedDefaultBankAccountsIfEmpty,
} from '@/lib/firebase/queries/bankAccounts'
import type { Expense, Client, Budget, AccountPayable, ExpenseCategory, CashOpeningBalances, CustomExpenseCategory, BankAccount } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LoadingSkeleton } from '@/components/shared/LoadingSkeleton'
import { RecordPaymentModal } from '@/components/shared/RecordPaymentModal'

import { Badge } from '@/components/shared/Badge'

interface FinancialsHubProps {
  initialTab?: 'cashflow' | 'accounts' | 'profitability' | 'executive'
}

// Currency formatters for Indian Rupee
function formatINR(val: number): string {
  const abs = Math.abs(val)
  const formatted = '₹' + abs.toLocaleString('en-IN')
  return val < 0 ? `−${formatted}` : formatted
}

function formatCompactINR(val: number): string {
  const abs = Math.abs(val)
  let str = ''
  if (abs >= 10000000) {
    str = (abs / 10000000).toFixed(1) + 'Cr'
  } else if (abs >= 100000) {
    str = (abs / 100000).toFixed(1) + 'L'
  } else if (abs >= 1000) {
    str = (abs / 1000).toFixed(1) + 'k'
  } else {
    str = abs.toLocaleString('en-IN')
  }
  return (val < 0 ? '−₹' : '₹') + str
}

export function FinancialsHub({ initialTab = 'cashflow' }: FinancialsHubProps) {
  const searchParams = useSearchParams()
  const { isAdmin } = useRole()
  const isAuthLoading = useAuthStore((s) => s.loading)
  const appUser = useAuthStore((s) => s.appUser)

  // Active view tab: 'cashflow' | 'accounts' | 'profitability' | 'executive'
  const [activeTab, setActiveTab] = useState<'cashflow' | 'accounts' | 'profitability' | 'executive'>(() => {
    const tabParam = searchParams?.get('tab')
    if (tabParam === 'accounts' || tabParam === 'cashflow' || tabParam === 'profitability' || tabParam === 'executive') {
      return tabParam
    }
    return initialTab
  })

  // Real-time collections
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [payables, setPayables] = useState<AccountPayable[]>([])
  const [loading, setLoading] = useState(true)

  // Selected month for drill-down & budget inspection (defaults to current month)
  const [selectedMonthKey, setSelectedMonthKey] = useState<string>(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })

  // Chart view toggle: historical vs forecast
  const [cashflowViewMode, setCashflowViewMode] = useState<'historical' | 'forecast'>('historical')

  // Accounts sub-tab: Receivables (money owed to us) vs Payables (money we owe) vs Bank Accounts
  const [accountsSubTab, setAccountsSubTab] = useState<'receivables' | 'payables' | 'bankAccounts'>('receivables')
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [drillBankFilter, setDrillBankFilter] = useState<string>('all')
  const [bankLedgerFilter, setBankLedgerFilter] = useState<string>('all')
  const [bankLedgerSearch, setBankLedgerSearch] = useState<string>('')
  const [bankLedgerPage, setBankLedgerPage] = useState<number>(1)
  const [bankLedgerPageSize, setBankLedgerPageSize] = useState<number>(10)
  const [isAddBankAccountOpen, setIsAddBankAccountOpen] = useState(false)
  const [editingBankAccount, setEditingBankAccount] = useState<BankAccount | null>(null)
  const [bankModalName, setBankModalName] = useState('')
  const [bankModalNickname, setBankModalNickname] = useState('')
  const [bankModalHolder, setBankModalHolder] = useState('')
  const [bankModalMasked, setBankModalMasked] = useState('')
  const [bankModalUpi, setBankModalUpi] = useState('')
  const [bankModalIfsc, setBankModalIfsc] = useState('')
  const [bankModalOpening, setBankModalOpening] = useState('')
  const [bankModalIsDefault, setBankModalIsDefault] = useState(false)
  const [savingBankAccount, setSavingBankAccount] = useState(false)
  const [bankModalError, setBankModalError] = useState<string | null>(null)

  // Drill-down filter & search
  const [drillSearch, setDrillSearch] = useState('')
  const [drillTypeFilter, setDrillTypeFilter] = useState<'all' | 'income' | 'expense'>('all')

  // Receivables search, aging filter & pagination
  const [receivableSearch, setReceivableSearch] = useState('')
  const [agingFilter, setAgingFilter] = useState<'all' | 'current' | '31-60' | '60+' | 'overdue'>('all')
  const [receivablePage, setReceivablePage] = useState<number>(1)
  const [receivablePageSize, setReceivablePageSize] = useState<number>(10)

  // Payables search, filter & pagination
  const [payableSearch, setPayableSearch] = useState('')
  const [payableStatusFilter, setPayableStatusFilter] = useState<'all' | 'pending' | 'overdue' | 'paid'>('all')
  const [payablePage, setPayablePage] = useState<number>(1)
  const [payablePageSize, setPayablePageSize] = useState<number>(10)

  // Project profitability search, sort & pagination
  const [profitabilitySearch, setProfitabilitySearch] = useState('')
  const [profitabilitySort, setProfitabilitySort] = useState<'revenue' | 'profit' | 'margin'>('revenue')
  const [profitabilityPage, setProfitabilityPage] = useState<number>(1)
  const [profitabilityPageSize, setProfitabilityPageSize] = useState<number>(10)

  // Modals & Dialogs State
  const [customCategories, setCustomCategories] = useState<CustomExpenseCategory[]>([])
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false)
  const [newCatLabel, setNewCatLabel] = useState('')
  const [newCatIcon, setNewCatIcon] = useState('ti-tag')
  const [newCatDefaultBudget, setNewCatDefaultBudget] = useState('25000')
  const [creatingCategory, setCreatingCategory] = useState(false)
  const [copyingBudgets, setCopyingBudgets] = useState(false)

  const [editingBudgetCategory, setEditingBudgetCategory] = useState<string | null>(null)
  const [editingBudgetAmount, setEditingBudgetAmount] = useState<string>('')
  const [savingBudget, setSavingBudget] = useState(false)
  const [budgetSuccessMsg, setBudgetSuccessMsg] = useState<string | null>(null)

  // Record payment directly from receivable row
  const [paymentTarget, setPaymentTarget] = useState<OutstandingReceivable | null>(null)

  // Reminder modal state
  const [reminderTarget, setReminderTarget] = useState<OutstandingReceivable | null>(null)
  const [reminderTone, setReminderTone] = useState<'polite' | 'due' | 'final'>('polite')
  const [copiedReminder, setCopiedReminder] = useState(false)

  // Add Payable modal state
  const [isAddPayableOpen, setIsAddPayableOpen] = useState(false)
  const [newPayableVendor, setNewPayableVendor] = useState('')
  const [newPayableCategory, setNewPayableCategory] = useState<ExpenseCategory>('equipment')
  const [newPayableBillNo, setNewPayableBillNo] = useState('')
  const [newPayableAmount, setNewPayableAmount] = useState('')
  const [newPayableDueDate, setNewPayableDueDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 7)
    return d.toISOString().split('T')[0]
  })
  const [newPayableProject, setNewPayableProject] = useState('')
  const [newPayableNote, setNewPayableNote] = useState('')
  const [newPayableGstin, setNewPayableGstin] = useState('')
  const [newPayableGstRate, setNewPayableGstRate] = useState<number>(18)
  const [newPayableGstAmount, setNewPayableGstAmount] = useState('')
  const [savingPayable, setSavingPayable] = useState(false)

  // Settle Payable modal state
  const [settlingPayable, setSettlingPayable] = useState<AccountPayable | null>(null)
  const [settlementMethod, setSettlementMethod] = useState<'bankTransfer' | 'cash' | 'gpay'>('bankTransfer')
  const [settlingAction, setSettlingAction] = useState(false)

  // Category expense drill-down modal
  const [drillCategory, setDrillCategory] = useState<BudgetVsActualRow | null>(null)

  // Project cost drill-down modal
  const [drillProject, setDrillProject] = useState<ProjectProfitabilitySummary | null>(null)

  // Opening Balances & Cash Baseline
  const [openingBalances, setOpeningBalances] = useState<CashOpeningBalances | null>(null)
  const [isOpeningBalancesModalOpen, setIsOpeningBalancesModalOpen] = useState(false)
  const [baselineBank, setBaselineBank] = useState('')
  const [baselineCash, setBaselineCash] = useState('')
  const [baselineUPI, setBaselineUPI] = useState('')
  const [baselineDate, setBaselineDate] = useState(() => new Date().toISOString().split('T')[0])
  const [savingBaseline, setSavingBaseline] = useState(false)

  // Forecast scenario sensitivity: 'expected' (85%) | 'optimistic' (100%) | 'conservative' (65%)
  const [forecastScenario, setForecastScenario] = useState<ForecastScenario>('expected')

  // GST Summary & GSTR Filing modal
  const [isGstModalOpen, setIsGstModalOpen] = useState(false)

  // P&L Detailed breakdown modal
  const [isPnlBreakdownModalOpen, setIsPnlBreakdownModalOpen] = useState(false)

  // Real-time client payment documents across all clients (via collectionGroup)
  const [clientPayments, setClientPayments] = useState<ClientPaymentRecord[]>([])

  // Period / Year filter: 'FY-YYYY' | 'last6Months' | 'all'
  const [selectedPeriod, setSelectedPeriod] = useState<string>(() => {
    const d = new Date()
    const fy = (d.getMonth() + 1) >= 4 ? d.getFullYear() : d.getFullYear() - 1
    return `FY-${fy}`
  })

  // Full-width transactions ledger modal state
  const [isFullTransactionsModalOpen, setIsFullTransactionsModalOpen] = useState(false)
  const [fullLedgerScope, setFullLedgerScope] = useState<'month' | 'period'>('month')
  const [fullLedgerSearch, setFullLedgerSearch] = useState('')
  const [fullLedgerTypeFilter, setFullLedgerTypeFilter] = useState<'all' | 'income' | 'expense'>('all')
  const [fullLedgerMethodFilter, setFullLedgerMethodFilter] = useState<string>('all')
  const [cashflowLayoutMode, setCashflowLayoutMode] = useState<'split' | 'fullLedger'>('split')
  const [isModalFullscreen, setIsModalFullscreen] = useState(false)

  // Real-time subscriptions
  useEffect(() => {
    let mounted = true

    const unsubExpenses = subscribeToExpenses((items) => {
      if (mounted) setExpenses(items)
    })

    const unsubClients = subscribeToClients({}, (items) => {
      if (mounted) setClients(items)
    })

    const unsubBudgets = subscribeToBudgets((items) => {
      if (mounted) setBudgets(items)
    })

    const unsubPayables = subscribeToPayables((items) => {
      if (mounted) {
        setPayables(items)
        setLoading(false)
      }
    })

    const unsubOpeningBalances = subscribeToCashOpeningBalances((data) => {
      if (mounted) setOpeningBalances(data)
    })

    const unsubPayments = subscribeToAllClientPayments((items) => {
      if (mounted) setClientPayments(items)
    })

    const unsubCustomCategories = subscribeToExpenseCategories((items) => {
      if (mounted) setCustomCategories(items)
    })

    const unsubBankAccounts = subscribeToBankAccounts((items) => {
      if (mounted) setBankAccounts(items)
    })

    seedDefaultBankAccountsIfEmpty(appUser?.uid || 'admin').catch((err) => {
      console.warn('[BankAccounts] Auto-seed warning:', err)
    })

    return () => {
      mounted = false
      unsubExpenses()
      unsubClients()
      unsubBudgets()
      unsubPayables()
      unsubOpeningBalances()
      unsubPayments()
      unsubCustomCategories()
      unsubBankAccounts()
    }
  }, [])

  // Aggregate monthly financials & advanced analytics
  const {
    monthlyMap,
    last6Months,
    allAvailableMonths,
    availableYears,
    outstandingReceivables,
    receivablesAgingSummary,
    payablesSummary,
    cashPosition,
    cashflowForecast,
    categoryOutflowBreakdown,
    pnlStatement,
    gstSummary,
  } = useMemo(() => {
    return compileMonthlyFinancials(
      expenses,
      clients,
      payables,
      openingBalances,
      forecastScenario,
      selectedMonthKey,
      clientPayments,
      bankAccounts
    )
  }, [expenses, clients, payables, openingBalances, forecastScenario, selectedMonthKey, clientPayments, bankAccounts])

  // Dynamic date helpers for Indian Financial Years (April to March)
  const now = useMemo(() => new Date(), [])
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1
  const currentFyStart = currentMonth >= 4 ? currentYear : currentYear - 1

  // Dynamic list of all available FY start years based on actual data + current & previous years
  const allFyStarts = useMemo(() => {
    const fySet = new Set<number>()
    fySet.add(currentFyStart)
    fySet.add(currentFyStart - 1)
    for (const p of clientPayments) {
      if (p.date && !isNaN(p.date.getTime())) {
        const fy = (p.date.getMonth() + 1) >= 4 ? p.date.getFullYear() : p.date.getFullYear() - 1
        fySet.add(fy)
      }
    }
    for (const e of expenses) {
      if (e.date) {
        const d = e.date instanceof Date ? e.date : new Date(e.date)
        if (!isNaN(d.getTime())) {
          const fy = (d.getMonth() + 1) >= 4 ? d.getFullYear() : d.getFullYear() - 1
          fySet.add(fy)
        }
      }
    }
    for (const c of clients) {
      if (c.eventDate) {
        const d = new Date(c.eventDate)
        if (!isNaN(d.getTime())) {
          const fy = (d.getMonth() + 1) >= 4 ? d.getFullYear() : d.getFullYear() - 1
          fySet.add(fy)
        }
      }
    }
    return Array.from(fySet).sort((a, b) => b - a)
  }, [currentFyStart, clientPayments, expenses, clients])

  // Helper to format any period key into a human-readable label
  const getPeriodLabel = useCallback((periodKey: string): string => {
    if (periodKey.startsWith('FY-')) {
      const yr = parseInt(periodKey.replace('FY-', ''), 10)
      return `FY ${yr}–${String(yr + 1).slice(-2)}`
    }
    if (periodKey === 'currentFY') {
      return `FY ${currentFyStart}–${String(currentFyStart + 1).slice(-2)}`
    }
    if (periodKey === 'previousFY') {
      return `FY ${currentFyStart - 1}–${String(currentFyStart).slice(-2)}`
    }
    if (periodKey === 'last6Months') return 'Last 6 Months'
    if (periodKey === 'all') return 'All History'
    return periodKey
  }, [currentFyStart])

  // Months list dynamically adapted to the active period
  const displayedMonths: MonthlyFinancialSummary[] = useMemo(() => {
    let effective = selectedPeriod
    if (effective === 'currentFY') effective = `FY-${currentFyStart}`
    if (effective === 'previousFY') effective = `FY-${currentFyStart - 1}`

    if (effective.startsWith('FY-')) {
      const fyStart = parseInt(effective.replace('FY-', ''), 10)
      const keys: string[] = []
      for (let m = 4; m <= 12; m++) keys.push(`${fyStart}-${String(m).padStart(2, '0')}`)
      for (let m = 1; m <= 3; m++) keys.push(`${fyStart + 1}-${String(m).padStart(2, '0')}`)
      return keys.map((k) => {
        if (monthlyMap.has(k)) return monthlyMap.get(k)!
        const [yStr, mStr] = k.split('-')
        const y = parseInt(yStr, 10)
        const m = parseInt(mStr, 10)
        const d = new Date(y, m - 1, 1)
        return {
          monthKey: k,
          monthLabel: d.toLocaleString('en-US', { month: 'short' }),
          fullMonthLabel: d.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
          year: y,
          month: m,
          income: 0,
          incomeCount: 0,
          outflow: 0,
          outflowCount: 0,
          net: 0,
          marginPct: 0,
          mainOutflowType: 'None',
          lineItems: [],
        } as MonthlyFinancialSummary
      })
    }

    if (effective === 'last6Months') {
      return last6Months
    }

    if (effective === 'all') {
      return allAvailableMonths
    }

    const numYear = parseInt(effective, 10)
    if (!isNaN(numYear)) {
      const keys: string[] = []
      for (let m = 1; m <= 12; m++) keys.push(`${numYear}-${String(m).padStart(2, '0')}`)
      return keys.map((k) => monthlyMap.get(k)).filter(Boolean) as MonthlyFinancialSummary[]
    }

    return last6Months
  }, [selectedPeriod, currentFyStart, monthlyMap, last6Months, allAvailableMonths])

  // Handle switching period and picking an active month
  const handlePeriodChange = useCallback((newPeriod: string) => {
    setSelectedPeriod(newPeriod)
    let effective = newPeriod
    if (effective === 'currentFY') effective = `FY-${currentFyStart}`
    if (effective === 'previousFY') effective = `FY-${currentFyStart - 1}`

    if (effective.startsWith('FY-')) {
      const fyStart = parseInt(effective.replace('FY-', ''), 10)
      const keys: string[] = []
      for (let m = 4; m <= 12; m++) keys.push(`${fyStart}-${String(m).padStart(2, '0')}`)
      for (let m = 1; m <= 3; m++) keys.push(`${fyStart + 1}-${String(m).padStart(2, '0')}`)

      // If current selected month is inside this FY, preserve it
      if (keys.includes(selectedMonthKey)) {
        return
      }

      // Check if current calendar month is in this FY
      const currentMonthKey = `${currentYear}-${String(currentMonth).padStart(2, '0')}`
      if (keys.includes(currentMonthKey)) {
        setSelectedMonthKey(currentMonthKey)
        return
      }

      // Otherwise pick the latest active month or first month
      const activeMonth = keys.slice().reverse().find(k => {
        const mData = monthlyMap.get(k)
        return mData && (mData.income > 0 || mData.outflow > 0)
      }) || keys[0]
      setSelectedMonthKey(activeMonth)
    } else if (effective === 'last6Months') {
      const currentMonthKey = `${currentYear}-${String(currentMonth).padStart(2, '0')}`
      setSelectedMonthKey(currentMonthKey)
    } else if (effective === 'all') {
      // Keep selected month
    } else {
      const yr = parseInt(effective, 10)
      if (!isNaN(yr)) {
        const yrKeys: string[] = []
        for (let m = 1; m <= 12; m++) yrKeys.push(`${yr}-${String(m).padStart(2, '0')}`)
        const activeMonth = yrKeys.slice().reverse().find(k => {
          const mData = monthlyMap.get(k)
          return mData && (mData.income > 0 || mData.outflow > 0)
        }) || yrKeys[0]
        setSelectedMonthKey(activeMonth)
      }
    }
  }, [currentFyStart, currentYear, currentMonth, selectedMonthKey, monthlyMap])

  // Stepper to go to previous or next FY
  const handlePrevFY = useCallback(() => {
    let currentFy = currentFyStart
    if (selectedPeriod.startsWith('FY-')) {
      currentFy = parseInt(selectedPeriod.replace('FY-', ''), 10)
    } else if (selectedPeriod === 'previousFY') {
      currentFy = currentFyStart - 1
    }
    handlePeriodChange(`FY-${currentFy - 1}`)
  }, [currentFyStart, selectedPeriod, handlePeriodChange])

  const handleNextFY = useCallback(() => {
    let currentFy = currentFyStart
    if (selectedPeriod.startsWith('FY-')) {
      currentFy = parseInt(selectedPeriod.replace('FY-', ''), 10)
    } else if (selectedPeriod === 'previousFY') {
      currentFy = currentFyStart - 1
    }
    handlePeriodChange(`FY-${currentFy + 1}`)
  }, [currentFyStart, selectedPeriod, handlePeriodChange])

  // Stepper to go to previous or next month
  const handlePrevMonth = useCallback(() => {
    const idx = displayedMonths.findIndex(m => m.monthKey === selectedMonthKey)
    if (idx > 0) {
      setSelectedMonthKey(displayedMonths[idx - 1].monthKey)
    } else {
      const [yStr, mStr] = selectedMonthKey.split('-')
      const y = parseInt(yStr, 10)
      const m = parseInt(mStr, 10)
      const prevDate = new Date(y, m - 2, 1)
      const prevKey = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`
      const prevFy = (prevDate.getMonth() + 1) >= 4 ? prevDate.getFullYear() : prevDate.getFullYear() - 1
      setSelectedPeriod(`FY-${prevFy}`)
      setSelectedMonthKey(prevKey)
    }
  }, [displayedMonths, selectedMonthKey])

  const handleNextMonth = useCallback(() => {
    const idx = displayedMonths.findIndex(m => m.monthKey === selectedMonthKey)
    if (idx >= 0 && idx < displayedMonths.length - 1) {
      setSelectedMonthKey(displayedMonths[idx + 1].monthKey)
    } else {
      const [yStr, mStr] = selectedMonthKey.split('-')
      const y = parseInt(yStr, 10)
      const m = parseInt(mStr, 10)
      const nextDate = new Date(y, m, 1)
      const nextKey = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`
      const nextFy = (nextDate.getMonth() + 1) >= 4 ? nextDate.getFullYear() : nextDate.getFullYear() - 1
      setSelectedPeriod(`FY-${nextFy}`)
      setSelectedMonthKey(nextKey)
    }
  }, [displayedMonths, selectedMonthKey])

  // Current active month summary object
  const currentMonthSummary: MonthlyFinancialSummary = useMemo(() => {
    if (monthlyMap.has(selectedMonthKey)) {
      return monthlyMap.get(selectedMonthKey)!
    }
    if (last6Months.length > 0) {
      return last6Months[last6Months.length - 1]
    }
    const now = new Date()
    return {
      monthKey: selectedMonthKey,
      monthLabel: now.toLocaleString('en-US', { month: 'short' }),
      fullMonthLabel: now.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      income: 0,
      incomeCount: 0,
      outflow: 0,
      outflowCount: 0,
      net: 0,
      marginPct: 0,
      mainOutflowType: 'None',
      lineItems: [],
    }
  }, [monthlyMap, selectedMonthKey, last6Months])

  // Filtered drill-down line items
  const filteredLineItems = useMemo(() => {
    let list = currentMonthSummary.lineItems

    if (drillTypeFilter !== 'all') {
      list = list.filter((i) => i.type === drillTypeFilter)
    }

    if (drillBankFilter !== 'all') {
      list = list.filter((i) => i.bankAccountId === drillBankFilter)
    }

    if (drillSearch.trim()) {
      const q = drillSearch.toLowerCase().trim()
      list = list.filter(
        (i) =>
          i.label.toLowerCase().includes(q) ||
          i.meta.toLowerCase().includes(q) ||
          i.category.toLowerCase().includes(q) ||
          (i.bankAccountName && i.bankAccountName.toLowerCase().includes(q))
      )
    }

    return list
  }, [currentMonthSummary, drillTypeFilter, drillBankFilter, drillSearch])

  // Cross-client payments for bank ledger
  const bankLedgerPayments = useMemo(() => {
    let list = clientPayments

    if (bankLedgerFilter !== 'all') {
      list = list.filter(p => p.bankAccountId === bankLedgerFilter)
    }

    if (bankLedgerSearch.trim()) {
      const q = bankLedgerSearch.toLowerCase().trim()
      list = list.filter(p => {
        const client = clients.find(c => c.clientId === p.clientId)
        return (
          (client?.name && client.name.toLowerCase().includes(q)) ||
          (client?.eventName && client.eventName.toLowerCase().includes(q)) ||
          (p.bankAccountName && p.bankAccountName.toLowerCase().includes(q)) ||
          (p.transactionId && p.transactionId.toLowerCase().includes(q)) ||
          (p.instalment && p.instalment.toLowerCase().includes(q)) ||
          (p.method && p.method.toLowerCase().includes(q))
        )
      })
    }

    // Sort newest date first
    return [...list].sort((a, b) => {
      const da = a.date instanceof Date ? a.date.getTime() : 0
      const db = b.date instanceof Date ? b.date.getTime() : 0
      return db - da
    })
  }, [clientPayments, bankLedgerFilter, bankLedgerSearch, clients])

  const totalFilteredBankAmount = useMemo(() => {
    return bankLedgerPayments.reduce((acc, p) => acc + (p.amount || 0), 0)
  }, [bankLedgerPayments])

  const handleExportBankStatement = () => {
    const activeBank = bankAccounts.find(b => b.bankAccountId === bankLedgerFilter)
    const bankLabel = activeBank ? `${activeBank.nickname} (${activeBank.accountNumberMasked})` : 'All Accounts'
    const exportItems = bankLedgerPayments.map(p => {
      const c = clients.find(cl => cl.clientId === p.clientId)
      return {
        date: p.date,
        clientName: c?.name || 'Client',
        eventName: c?.eventName,
        instalment: p.instalment || 'Payment',
        amount: p.amount,
        method: p.method,
        bankAccountName: p.bankAccountName || activeBank?.nickname,
        transactionId: p.transactionId,
        recordedByName: p.recordedByName,
      }
    })
    exportBankInflowCSV(exportItems, bankLabel, currentMonthSummary.fullMonthLabel)
  }

  const handleOpenAddBankAccount = () => {
    setEditingBankAccount(null)
    setBankModalName('')
    setBankModalNickname('')
    setBankModalHolder('')
    setBankModalMasked('')
    setBankModalUpi('')
    setBankModalIfsc('')
    setBankModalOpening('')
    setBankModalIsDefault(bankAccounts.length === 0)
    setBankModalError(null)
    setIsAddBankAccountOpen(true)
  }

  const handleOpenEditBankAccount = (bankAccountId: string) => {
    const b = bankAccounts.find(acc => acc.bankAccountId === bankAccountId)
    if (!b) return
    setEditingBankAccount(b)
    setBankModalName(b.bankName)
    setBankModalNickname(b.nickname)
    setBankModalHolder(b.accountHolder)
    setBankModalMasked(b.accountNumberMasked)
    setBankModalUpi(b.upiId || '')
    setBankModalIfsc(b.ifsc || '')
    setBankModalOpening(b.openingBalance ? String(b.openingBalance) : '')
    setBankModalIsDefault(Boolean(b.isDefault))
    setBankModalError(null)
    setIsAddBankAccountOpen(true)
  }

  const handleSaveBankAccountSubmit = async () => {
    setBankModalError(null)
    if (!bankModalNickname.trim()) {
      setBankModalError('Please enter an account nickname')
      return
    }
    if (!bankModalName.trim()) {
      setBankModalError('Please enter the bank name')
      return
    }
    if (!bankModalHolder.trim()) {
      setBankModalError('Please enter the account holder name')
      return
    }

    setSavingBankAccount(true)
    try {
      if (editingBankAccount) {
        await updateBankAccount(
          editingBankAccount.bankAccountId,
          {
            bankName: bankModalName.trim(),
            nickname: bankModalNickname.trim(),
            accountHolder: bankModalHolder.trim(),
            accountNumberMasked: bankModalMasked.trim(),
            upiId: bankModalUpi.trim() || undefined,
            ifsc: bankModalIfsc.trim() || undefined,
            openingBalance: bankModalOpening ? parseFloat(bankModalOpening) : 0,
            isDefault: bankModalIsDefault,
          },
          appUser?.uid || 'admin'
        )
      } else {
        await createBankAccount(
          {
            bankName: bankModalName.trim(),
            nickname: bankModalNickname.trim(),
            accountHolder: bankModalHolder.trim(),
            accountNumberMasked: bankModalMasked.trim(),
            upiId: bankModalUpi.trim() || undefined,
            ifsc: bankModalIfsc.trim() || undefined,
            openingBalance: bankModalOpening ? parseFloat(bankModalOpening) : 0,
            isDefault: bankModalIsDefault,
            isActive: true,
          },
          appUser?.uid || 'admin'
        )
      }
      setIsAddBankAccountOpen(false)
      setEditingBankAccount(null)
    } catch (err) {
      console.error('Failed to save bank account:', err)
      setBankModalError('Failed to save bank account. Please try again.')
    } finally {
      setSavingBankAccount(false)
    }
  }

  const handleDeleteBankAccount = async (bankAccountId: string, nickname: string) => {
    if (!window.confirm(`Are you sure you want to remove ${nickname}? Historical payments will preserve this bank's name.`)) {
      return
    }
    try {
      await deleteBankAccount(bankAccountId, appUser?.uid || 'admin')
      if (bankLedgerFilter === bankAccountId) {
        setBankLedgerFilter('all')
      }
    } catch (err) {
      console.error('Failed to delete bank account:', err)
      alert('Failed to delete bank account. Please try again.')
    }
  }


  // Budget vs Actuals compilation for selected month
  const {
    rows: budgetRows,
    alerts: budgetAlerts,
    totalBudget,
    totalActual,
    totalVariance,
    nearLimitCount,
    overBudgetCount,
  } = useMemo(() => {
    return compileBudgetRows(
      expenses,
      budgets,
      currentMonthSummary.month,
      currentMonthSummary.year,
      customCategories
    )
  }, [expenses, budgets, currentMonthSummary.month, currentMonthSummary.year, customCategories])

  // Filtered outstanding receivables by aging bucket & search
  const filteredReceivables = useMemo(() => {
    let list = outstandingReceivables

    if (agingFilter === 'overdue') {
      list = list.filter((r) => r.isOverdue)
    } else if (agingFilter === 'current') {
      list = list.filter((r) => r.agingBucket === 'current')
    } else if (agingFilter === '31-60') {
      list = list.filter((r) => r.agingBucket === '31-60')
    } else if (agingFilter === '60+') {
      list = list.filter((r) => r.agingBucket === '60+')
    }

    if (receivableSearch.trim()) {
      const q = receivableSearch.toLowerCase().trim()
      list = list.filter(
        (r) =>
          r.clientName.toLowerCase().includes(q) ||
          r.eventName.toLowerCase().includes(q) ||
          r.invoiceNumber.toLowerCase().includes(q) ||
          r.clientPhone.includes(q)
      )
    }

    return list
  }, [outstandingReceivables, agingFilter, receivableSearch])

  // Filtered payables by status & search
  const filteredPayables = useMemo(() => {
    let list = payables

    if (payableStatusFilter === 'pending') {
      list = list.filter((p) => p.status === 'pending')
    } else if (payableStatusFilter === 'overdue') {
      list = list.filter((p) => p.status === 'overdue')
    } else if (payableStatusFilter === 'paid') {
      list = list.filter((p) => p.status === 'paid')
    }

    if (payableSearch.trim()) {
      const q = payableSearch.toLowerCase().trim()
      list = list.filter(
        (p) =>
          p.vendorName.toLowerCase().includes(q) ||
          (p.billNumber && p.billNumber.toLowerCase().includes(q)) ||
          p.category.toLowerCase().includes(q) ||
          (p.projectName && p.projectName.toLowerCase().includes(q))
      )
    }

    return list
  }, [payables, payableStatusFilter, payableSearch])

  // Reset pagination when search or filters change (storing previous render info per React docs)
  const [prevReceivableKey, setPrevReceivableKey] = useState('')
  const currentReceivableKey = `${agingFilter}|${receivableSearch}|${receivablePageSize}`
  if (prevReceivableKey !== currentReceivableKey) {
    setPrevReceivableKey(currentReceivableKey)
    setReceivablePage(1)
  }

  const [prevPayableKey, setPrevPayableKey] = useState('')
  const currentPayableKey = `${payableStatusFilter}|${payableSearch}|${payablePageSize}`
  if (prevPayableKey !== currentPayableKey) {
    setPrevPayableKey(currentPayableKey)
    setPayablePage(1)
  }

  // Receivables pagination & totals
  const totalReceivablePages = Math.max(1, Math.ceil(filteredReceivables.length / receivablePageSize))
  const safeReceivablePage = Math.min(receivablePage, totalReceivablePages)

  const paginatedReceivables = useMemo(() => {
    if (receivablePageSize >= 9999) return filteredReceivables
    const start = (safeReceivablePage - 1) * receivablePageSize
    return filteredReceivables.slice(start, start + receivablePageSize)
  }, [filteredReceivables, safeReceivablePage, receivablePageSize])

  const displayedReceivablesTotal = useMemo(() => {
    return filteredReceivables.reduce((acc, r) => acc + (r.balanceDue || 0), 0)
  }, [filteredReceivables])

  // Payables pagination & totals
  const totalPayablePages = Math.max(1, Math.ceil(filteredPayables.length / payablePageSize))
  const safePayablePage = Math.min(payablePage, totalPayablePages)

  const paginatedPayables = useMemo(() => {
    if (payablePageSize >= 9999) return filteredPayables
    const start = (safePayablePage - 1) * payablePageSize
    return filteredPayables.slice(start, start + payablePageSize)
  }, [filteredPayables, safePayablePage, payablePageSize])

  const displayedPayablesTotal = useMemo(() => {
    return filteredPayables.reduce((acc, p) => acc + (p.amount || 0), 0)
  }, [filteredPayables])

  // Bank Ledger pagination & totals
  const [prevBankLedgerKey, setPrevBankLedgerKey] = useState('')
  const currentBankLedgerKey = `${bankLedgerFilter}|${bankLedgerSearch}|${bankLedgerPageSize}`
  if (prevBankLedgerKey !== currentBankLedgerKey) {
    setPrevBankLedgerKey(currentBankLedgerKey)
    setBankLedgerPage(1)
  }

  const totalBankLedgerPages = Math.max(1, Math.ceil(bankLedgerPayments.length / bankLedgerPageSize))
  const safeBankLedgerPage = Math.min(bankLedgerPage, totalBankLedgerPages)

  const paginatedBankLedgerPayments = useMemo(() => {
    if (bankLedgerPageSize >= 9999) return bankLedgerPayments
    const start = (safeBankLedgerPage - 1) * bankLedgerPageSize
    return bankLedgerPayments.slice(start, start + bankLedgerPageSize)
  }, [bankLedgerPayments, safeBankLedgerPage, bankLedgerPageSize])

  // Project Profitability list
  const projectProfitabilityList = useMemo(() => {
    let list = compileProjectProfitability(clients, expenses)

    if (profitabilitySearch.trim()) {
      const q = profitabilitySearch.toLowerCase().trim()
      list = list.filter(
        (p) =>
          p.projectName.toLowerCase().includes(q) ||
          p.clientName.toLowerCase().includes(q) ||
          p.packageType.toLowerCase().includes(q)
      )
    }

    if (profitabilitySort === 'profit') {
      list.sort((a, b) => b.netProfit - a.netProfit)
    } else if (profitabilitySort === 'margin') {
      list.sort((a, b) => b.marginPct - a.marginPct)
    } else {
      list.sort((a, b) => b.revenue - a.revenue)
    }

    return list
  }, [clients, expenses, profitabilitySearch, profitabilitySort])

  const totalProfitabilityPages = Math.max(1, Math.ceil(projectProfitabilityList.length / profitabilityPageSize))
  const safeProfitabilityPage = Math.min(Math.max(1, profitabilityPage), totalProfitabilityPages)

  const paginatedProfitabilityList = useMemo(() => {
    if (profitabilityPageSize >= 9999) return projectProfitabilityList
    const start = (safeProfitabilityPage - 1) * profitabilityPageSize
    return projectProfitabilityList.slice(start, start + profitabilityPageSize)
  }, [projectProfitabilityList, safeProfitabilityPage, profitabilityPageSize])

  // Bar chart scale calculation based on active displayed months
  const maxChartBarValue = useMemo(() => {
    let max = 50000
    for (const m of displayedMonths) {
      if (m.income > max) max = m.income
      if (m.outflow > max) max = m.outflow
    }
    return max
  }, [displayedMonths])

  // Full ledger transactions list based on scope ('month' vs 'period')
  const fullLedgerLineItems = useMemo(() => {
    let sourceList: FinancialLineItem[] = []
    if (fullLedgerScope === 'month') {
      sourceList = currentMonthSummary.lineItems
    } else {
      const combined: FinancialLineItem[] = []
      for (const m of displayedMonths) {
        combined.push(...m.lineItems)
      }
      sourceList = combined.sort((a, b) => b.date.getTime() - a.date.getTime())
    }

    if (fullLedgerTypeFilter !== 'all') {
      sourceList = sourceList.filter((i) => i.type === fullLedgerTypeFilter)
    }

    if (fullLedgerMethodFilter !== 'all') {
      sourceList = sourceList.filter((i) => {
        const metaLower = (i.meta || '').toLowerCase()
        if (fullLedgerMethodFilter === 'cash') return metaLower.includes('cash')
        if (fullLedgerMethodFilter === 'upi') {
          return metaLower.includes('gpay') || metaLower.includes('upi') || metaLower.includes('phonepe')
        }
        if (fullLedgerMethodFilter === 'bank') {
          return metaLower.includes('bank') || metaLower.includes('neft') || metaLower.includes('rtgs') || metaLower.includes('transfer')
        }
        return true
      })
    }

    if (fullLedgerSearch.trim()) {
      const q = fullLedgerSearch.toLowerCase().trim()
      sourceList = sourceList.filter(
        (i) =>
          i.label.toLowerCase().includes(q) ||
          i.meta.toLowerCase().includes(q) ||
          i.category.toLowerCase().includes(q)
      )
    }

    return sourceList
  }, [fullLedgerScope, currentMonthSummary.lineItems, displayedMonths, fullLedgerTypeFilter, fullLedgerMethodFilter, fullLedgerSearch])

  // Summary stats for full ledger modal
  const fullLedgerStats = useMemo(() => {
    let inflow = 0
    let outflow = 0
    for (const item of fullLedgerLineItems) {
      if (item.type === 'income') inflow += item.amount
      else outflow += item.amount
    }
    return {
      inflow,
      outflow,
      net: inflow - outflow,
      count: fullLedgerLineItems.length,
    }
  }, [fullLedgerLineItems])

  // Forecast max scale
  const maxForecastBarValue = useMemo(() => {
    let max = 50000
    for (const m of cashflowForecast) {
      if (m.projectedInflow > max) max = m.projectedInflow
      if (m.projectedOutflow > max) max = m.projectedOutflow
    }
    return max
  }, [cashflowForecast])

  // Handlers
  const handleOpenBudgetEdit = (catKey: string, currentBudget: number) => {
    setEditingBudgetCategory(catKey)
    setEditingBudgetAmount(String(currentBudget))
  }

  const handleSaveBudget = async () => {
    if (!editingBudgetCategory) return
    const num = parseFloat(editingBudgetAmount.replace(/[^0-9.]/g, '')) || 0

    try {
      setSavingBudget(true)
      await saveBudgetAmount(
        editingBudgetCategory,
        num,
        currentMonthSummary.year,
        currentMonthSummary.month
      )
      setBudgetSuccessMsg(`Updated ${editingBudgetCategory} budget to ${formatINR(num)}`)
      setEditingBudgetCategory(null)
      setTimeout(() => setBudgetSuccessMsg(null), 4000)
    } catch (err) {
      console.error('Failed to save budget:', err)
      alert('Could not save budget. Check console or try again.')
    } finally {
      setSavingBudget(false)
    }
  }

  const handleCreateCategory = async () => {
    if (!newCatLabel.trim()) return
    try {
      setCreatingCategory(true)
      const budgetNum = parseFloat(newCatDefaultBudget.replace(/[^0-9.]/g, '')) || 25000
      await createExpenseCategory({
        label: newCatLabel.trim(),
        icon: newCatIcon,
        defaultBudget: budgetNum,
      })
      setNewCatLabel('')
      setNewCatIcon('ti-tag')
      setNewCatDefaultBudget('25000')
      setShowAddCategoryModal(false)
      setBudgetSuccessMsg(`Created category "${newCatLabel.trim()}" with ₹${budgetNum.toLocaleString('en-IN')} default budget`)
      setTimeout(() => setBudgetSuccessMsg(null), 4000)
    } catch (err) {
      console.error('Failed to create category:', err)
      alert('Could not create category. Please try again.')
    } finally {
      setCreatingCategory(false)
    }
  }

  const handleDeleteCustomCategory = async (id: string, name: string) => {
    if (confirm(`Are you sure you want to remove the category "${name}"? Existing recorded expenses under this category will remain intact.`)) {
      try {
        await deleteExpenseCategory(id)
        setBudgetSuccessMsg(`Removed category "${name}"`)
        setTimeout(() => setBudgetSuccessMsg(null), 4000)
      } catch (err) {
        console.error('Failed to delete category:', err)
        alert('Could not delete category.')
      }
    }
  }

  const handleCopyPreviousBudgets = async () => {
    const fromMonth = currentMonthSummary.month === 1 ? 12 : currentMonthSummary.month - 1
    const fromYear = currentMonthSummary.month === 1 ? currentMonthSummary.year - 1 : currentMonthSummary.year
    try {
      setCopyingBudgets(true)
      const count = await copyBudgetsFromPreviousMonth(
        fromYear,
        fromMonth,
        currentMonthSummary.year,
        currentMonthSummary.month,
        budgets,
        customCategories
      )
      setBudgetSuccessMsg(`Copied ${count} category budgets from ${fromMonth}/${fromYear}`)
      setTimeout(() => setBudgetSuccessMsg(null), 4000)
    } catch (err) {
      console.error('Failed to copy budgets:', err)
      alert('Failed to copy budgets. Check console or try again.')
    } finally {
      setCopyingBudgets(false)
    }
  }

  // Create new payable bill
  const handleCreatePayable = async () => {
    if (!newPayableVendor.trim() || !newPayableAmount) {
      alert('Please provide vendor name and amount.')
      return
    }

    try {
      setSavingPayable(true)
      const amt = parseFloat(newPayableAmount.replace(/[^0-9.]/g, '')) || 0
      const gstAmt = parseFloat(newPayableGstAmount.replace(/[^0-9.]/g, '')) || 0

      await createPayable({
        vendorName: newPayableVendor,
        vendorGstin: newPayableGstin,
        category: newPayableCategory,
        billNumber: newPayableBillNo,
        amount: amt,
        gstAmount: gstAmt,
        gstRate: newPayableGstRate,
        dueDate: new Date(newPayableDueDate),
        projectName: newPayableProject,
        note: newPayableNote,
        isDeleted: false,
      })

      setIsAddPayableOpen(false)
      setNewPayableVendor('')
      setNewPayableBillNo('')
      setNewPayableAmount('')
      setNewPayableProject('')
      setNewPayableNote('')
      setNewPayableGstin('')
      setNewPayableGstAmount('')
      setNewPayableGstRate(18)
      setBudgetSuccessMsg(`Created payable bill for ${newPayableVendor} (${formatINR(amt)})`)
      setTimeout(() => setBudgetSuccessMsg(null), 4000)
    } catch (err) {
      console.error('Failed to create payable:', err)
      alert('Could not create payable bill.')
    } finally {
      setSavingPayable(false)
    }
  }

  // Settle payable action with double-count prevention
  const handleSettlePayable = async () => {
    if (!settlingPayable) return

    try {
      setSettlingAction(true)
      await markPayableAsPaid(
        settlingPayable.payableId,
        settlementMethod,
        new Date(),
        {
          vendorName: settlingPayable.vendorName,
          category: settlingPayable.category,
          amount: settlingPayable.amount,
          projectId: settlingPayable.projectId,
          projectName: settlingPayable.projectName,
          billNumber: settlingPayable.billNumber,
          note: settlingPayable.note,
          vendorGstin: settlingPayable.vendorGstin,
          gstAmount: settlingPayable.gstAmount,
          gstRate: settlingPayable.gstRate,
          existingExpenseId: settlingPayable.expenseId,
        }
      )

      setSettlingPayable(null)
      setBudgetSuccessMsg(`Settled ${settlingPayable.vendorName} bill of ${formatINR(settlingPayable.amount)} and logged expense.`)
      setTimeout(() => setBudgetSuccessMsg(null), 4000)
    } catch (err) {
      console.error('Failed to settle payable:', err)
      alert('Could not settle payable.')
    } finally {
      setSettlingAction(false)
    }
  }

  // Save Opening Balances baseline
  const handleSaveOpeningBalances = async () => {
    try {
      setSavingBaseline(true)
      const bank = parseFloat(baselineBank.replace(/[^0-9.]/g, '')) || 0
      const cash = parseFloat(baselineCash.replace(/[^0-9.]/g, '')) || 0
      const upi = parseFloat(baselineUPI.replace(/[^0-9.]/g, '')) || 0

      let asOf: Date
      if (baselineDate) {
        const [y, m, d] = baselineDate.split('-').map(Number)
        asOf = new Date(y, m - 1, d, 23, 59, 59, 999)
      } else {
        asOf = new Date()
      }

      await saveCashOpeningBalances({
        cashInBank: bank,
        cashInHand: cash,
        cashInUPI: upi,
        asOfDate: asOf,
      })
      setIsOpeningBalancesModalOpen(false)
      setBudgetSuccessMsg('Cash position baseline updated successfully!')
      setTimeout(() => setBudgetSuccessMsg(null), 4000)
    } catch (err) {
      console.error('Failed to save baseline:', err)
      alert('Could not update cash baseline.')
    } finally {
      setSavingBaseline(false)
    }
  }

  // Reminder message templates
  const reminderMessageText = useMemo(() => {
    if (!reminderTarget) return ''
    const dueFormatted = reminderTarget.dueDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    const balFormatted = formatINR(reminderTarget.balanceDue)

    if (reminderTone === 'final') {
      return `Dear ${reminderTarget.clientName},\n\nThis is a FINAL NOTICE regarding the outstanding balance of ${balFormatted} for "${reminderTarget.eventName}" (Invoice ${reminderTarget.invoiceNumber}), which was due on ${dueFormatted}.\n\nPlease settle this account immediately via Bank Transfer / UPI or contact the Studio Zoom billing desk at your earliest convenience.\n\nThank you,\nStudio Zoom Accounts`
    } else if (reminderTone === 'due') {
      return `Hello ${reminderTarget.clientName},\n\nWe hope you're doing well! This is a reminder that an outstanding balance of ${balFormatted} for "${reminderTarget.eventName}" (Invoice ${reminderTarget.invoiceNumber}) is overdue since ${dueFormatted}.\n\nKindly share the transaction receipt once transferred so we can issue your final settlement receipt.\n\nWarm regards,\nStudio Zoom Accounts`
    } else {
      return `Hello ${reminderTarget.clientName},\n\nGreetings from Studio Zoom! This is a polite note regarding your booking for "${reminderTarget.eventName}". The pending balance is ${balFormatted} (Due: ${dueFormatted}).\n\nPlease let us know if you need our bank or UPI payment details. Thank you!\n\nBest regards,\nStudio Zoom Team`
    }
  }, [reminderTarget, reminderTone])

  const handleCopyReminder = () => {
    if (!reminderMessageText) return
    navigator.clipboard.writeText(reminderMessageText)
    setCopiedReminder(true)
    if (reminderTarget) {
      logInvoiceReminder(reminderTarget.clientId, 'clipboard', reminderTarget.clientName, reminderTarget.invoiceNumber)
    }
    setTimeout(() => setCopiedReminder(false), 3000)
  }

  const handleOpenWhatsApp = () => {
    if (!reminderTarget) return
    logInvoiceReminder(reminderTarget.clientId, 'whatsapp', reminderTarget.clientName, reminderTarget.invoiceNumber)
    const cleanPhone = reminderTarget.clientPhone.replace(/[^0-9]/g, '')
    const url = `https://wa.me/${cleanPhone.startsWith('91') ? cleanPhone : '91' + cleanPhone}?text=${encodeURIComponent(reminderMessageText)}`
    window.open(url, '_blank')
  }

  const handleOpenEmail = () => {
    if (!reminderTarget || !reminderTarget.clientEmail) return
    logInvoiceReminder(reminderTarget.clientId, 'email', reminderTarget.clientName, reminderTarget.invoiceNumber)
    const subject = encodeURIComponent(`Payment Reminder: Studio Zoom Invoice ${reminderTarget.invoiceNumber}`)
    const body = encodeURIComponent(reminderMessageText)
    window.location.href = `mailto:${reminderTarget.clientEmail}?subject=${subject}&body=${body}`
  }

  // Export CSV handler
  const handleExportCSV = useCallback(() => {
    const lines: string[] = []
    lines.push(`Studio Zoom - Complete Financial Audit & Ledger`)
    lines.push(`Exported: ${new Date().toLocaleString()}`)
    lines.push('')

    // 1. Month Summary & Cash Position
    lines.push('--- REALIZED CASH POSITION & RUNWAY ---')
    lines.push(`Cash In Hand,${cashPosition.cashInHand}`)
    lines.push(`Bank Balance,${cashPosition.cashInBank}`)
    lines.push(`UPI / Gateway,${cashPosition.cashInUPI}`)
    lines.push(`Total Available Liquid,${cashPosition.totalAvailable}`)
    lines.push(`Monthly Operating Outflow,${cashPosition.monthlyBurnRate}`)
    lines.push(`Cash Runway Months,${cashPosition.runwayMonths}`)
    lines.push('')

    // 2. Budget vs Actuals
    lines.push('--- BUDGET VS ACTUALS ---')
    lines.push('Category,Budget,Actual,Variance,Status')
    budgetRows.forEach((b) => {
      lines.push(`"${b.label}",${b.budget},${b.actual},${b.variance},"${b.statusLabel}"`)
    })
    lines.push('')

    // 3. Receivables Aging
    lines.push('--- RECEIVABLES AGING BREAKDOWN ---')
    lines.push('Client,Event,Invoice Number,Contact,Balance Due,Days Past Due,Aging Bucket,Due Date')
    outstandingReceivables.forEach((r) => {
      lines.push(`"${r.clientName}","${r.eventName}","${r.invoiceNumber}","${r.clientPhone}",${r.balanceDue},${r.daysPastDue},"${r.agingBucket}","${r.dueDate.toISOString().split('T')[0]}"`)
    })
    lines.push('')

    // 4. Accounts Payable
    lines.push('--- ACCOUNTS PAYABLE (MONEY WE OWE) ---')
    lines.push('Vendor,Category,Bill Number,Amount,Due Date,Status,Payment Method')
    payables.forEach((p) => {
      lines.push(`"${p.vendorName}","${p.category}","${p.billNumber}",${p.amount},"${p.dueDate.toISOString().split('T')[0]}","${p.status}","${p.paymentMethod || 'Unpaid'}"`)
    })
    lines.push('')

    // 5. Project Profitability
    lines.push('--- PROJECT-WISE PROFITABILITY LEDGER ---')
    lines.push('Project,Client,Revenue,Direct Costs,Net Profit,Margin %')
    projectProfitabilityList.forEach((p) => {
      lines.push(`"${p.projectName}","${p.clientName}",${p.revenue},${p.directExpenses},${p.netProfit},${p.marginPct}%`)
    })

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `StudioZoom_Financial_Suite_${currentMonthSummary.monthKey}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [cashPosition, budgetRows, outstandingReceivables, payables, projectProfitabilityList, currentMonthSummary.monthKey])

  // Loading state
  if (loading || isAuthLoading) {
    return (
      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '24px' }}>
        <LoadingSkeleton lines={6} />
      </div>
    )
  }

  // Access gate
  if (!isAdmin) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '60vh',
          padding: '24px',
          textAlign: 'center',
          fontFamily: 'var(--font-inter)',
        }}
      >
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: 'var(--color-danger-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '16px',
          }}
        >
          <i className="ti ti-shield-lock" style={{ fontSize: '32px', color: 'var(--color-danger)' }} />
        </div>
        <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, margin: '0 0 8px 0', color: 'var(--color-foreground)' }}>
          Administrator Access Required
        </h2>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-foreground-muted)', maxWidth: '440px', lineHeight: 1.6, margin: '0 0 24px 0' }}>
          Financial ledgers, payables, receivables aging, cashflow forecasts, and project profitability are strictly reserved for Studio Administrator accounts.
        </p>
        <Link href="/dashboard">
          <Button variant="outline" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
            <i className="ti ti-arrow-left" />
            Return to Dashboard
          </Button>
        </Link>
      </div>
    )
  }

  return (
    <div
      style={{
        width: '100%',
        maxWidth: '1280px',
        minWidth: 0,
        margin: '0 auto',
        padding: '20px 16px 40px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        fontFamily: 'var(--font-inter)',
        boxSizing: 'border-box',
        overflowX: 'hidden',
      }}
      className="financials-hub-root"
    >
      <style>{`
        .financials-hub-root {
          width: 100% !important;
          max-width: 1280px !important;
          min-width: 0 !important;
          box-sizing: border-box !important;
        }

        /* Desktop preservation rules (>= 768px) */
        @media (min-width: 768px) {
          .financials-mobile-cards {
            display: none !important;
          }
          .financials-desktop-table {
            display: block !important;
          }
          .cashflow-chart-drill-grid {
            display: grid !important;
            grid-template-columns: minmax(0, 1fr) 380px !important;
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            gap: 16px !important;
            align-items: stretch !important;
          }
          .cashflow-chart-drill-grid > div {
            min-width: 0 !important;
            max-width: 100% !important;
            box-sizing: border-box !important;
            height: 100% !important;
          }
          .cashflow-chart-drill-grid > div:last-child {
            max-height: 480px !important;
            overflow: hidden !important;
          }
          .cashflow-drilldown-list::-webkit-scrollbar {
            width: 5px;
          }
          .cashflow-drilldown-list::-webkit-scrollbar-track {
            background: transparent;
          }
          .cashflow-drilldown-list::-webkit-scrollbar-thumb {
            background: var(--color-border-strong);
            border-radius: 4px;
          }
          .cashflow-chart-drill-grid.cashflow-layout-full-ledger {
            grid-template-columns: minmax(0, 1fr) !important;
          }
          .accounts-tables-grid {
            display: grid !important;
            grid-template-columns: 55fr 45fr !important;
            align-items: start !important;
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
          }
          .accounts-tables-grid > div {
            min-width: 0 !important;
            max-width: 100% !important;
            box-sizing: border-box !important;
          }
          .financials-modal-grid-2 {
            grid-template-columns: 1fr 1fr !important;
          }
          .financials-modal-grid-3 {
            grid-template-columns: 1.2fr 0.8fr 1fr !important;
          }
          .financials-tab-switcher {
            display: inline-flex !important;
            width: auto !important;
          }
          .financials-tab-switcher button {
            flex: initial !important;
          }
          .financials-subnav-buttons {
            display: flex !important;
            width: auto !important;
          }
          .financials-subnav-actions {
            display: flex !important;
            width: auto !important;
          }
          .financials-header-actions {
            display: flex !important;
            width: auto !important;
          }
          .financials-ledger-filter-row {
            display: flex !important;
            flex-direction: row !important;
            width: auto !important;
          }
        }

        /* Mobile adaptation rules (< 768px) */
        @media (max-width: 767px) {
          .financials-desktop-table {
            display: none !important;
          }
          .financials-mobile-cards {
            display: flex !important;
            flex-direction: column !important;
            gap: 10px !important;
            padding: 12px 14px !important;
          }
          .cashflow-chart-drill-grid {
            display: grid !important;
            grid-template-columns: minmax(0, 1fr) !important;
            width: 100% !important;
            min-width: 0 !important;
          }
          .cashflow-chart-drill-grid > div:last-child {
            max-height: 420px !important;
            overflow: hidden !important;
          }
          .accounts-tables-grid {
            display: grid !important;
            grid-template-columns: minmax(0, 1fr) !important;
            width: 100% !important;
            min-width: 0 !important;
          }
          .financials-modal-grid-2,
          .financials-modal-grid-3 {
            grid-template-columns: 1fr !important;
          }
          .financials-tab-switcher {
            display: grid !important;
            grid-template-columns: 1fr 1fr !important;
            width: 100% !important;
            gap: 4px !important;
          }
          .financials-tab-switcher button {
            justify-content: center !important;
            padding: 8px 6px !important;
            font-size: 11px !important;
          }
          .financials-subnav-row {
            flex-direction: column !important;
            align-items: stretch !important;
            gap: 12px !important;
          }
          .financials-subnav-buttons {
            display: grid !important;
            grid-template-columns: 1fr 1fr !important;
            width: 100% !important;
            gap: 6px !important;
          }
          .financials-subnav-buttons button {
            justify-content: center !important;
            padding: 8px 6px !important;
            font-size: 11px !important;
          }
          .financials-subnav-actions {
            display: flex !important;
            flex-direction: column !important;
            width: 100% !important;
            gap: 6px !important;
          }
          .financials-subnav-actions button {
            width: 100% !important;
            justify-content: center !important;
          }
          .financials-header-actions {
            width: 100% !important;
            display: grid !important;
            grid-template-columns: 1fr 1fr 1fr !important;
            gap: 6px !important;
          }
          .financials-header-actions button {
            width: 100% !important;
            justify-content: center !important;
            padding: 0 4px !important;
            font-size: 11px !important;
          }
          .financials-modal-dialog {
            width: 100% !important;
            max-width: min(calc(100vw - 24px), 480px) !important;
            max-height: 90vh !important;
            overflow-y: auto !important;
            -webkit-overflow-scrolling: touch !important;
            padding: 16px !important;
          }
          .financials-modal-footer {
            flex-direction: column-reverse !important;
            gap: 8px !important;
          }
          .financials-modal-footer button {
            width: 100% !important;
            height: 38px !important;
          }
          .financials-search-box {
            width: 100% !important;
          }
          .financials-ledger-filter-row {
            width: 100% !important;
            display: flex !important;
            flex-direction: column !important;
            gap: 8px !important;
          }
          .financials-ledger-filter-row > div,
          .financials-ledger-filter-row > select {
            width: 100% !important;
          }
        }

        /* Full Ledger Modal Styles */
        .financials-full-ledger-modal {
          width: 96vw !important;
          max-width: 1350px !important;
          height: 92vh !important;
          max-height: 94vh !important;
          padding: 0 !important;
          overflow: hidden !important;
          display: flex !important;
          flex-direction: column !important;
          box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5) !important;
        }
        .financials-full-ledger-modal.is-fullscreen {
          width: 100vw !important;
          max-width: 100vw !important;
          height: 100vh !important;
          max-height: 100vh !important;
          border-radius: 0 !important;
          border: none !important;
        }
        @media (max-width: 767px) {
          .financials-full-ledger-modal {
            width: 100% !important;
            max-width: calc(100vw - 12px) !important;
            height: 94vh !important;
            max-height: 96vh !important;
          }
        }
      `}</style>

      {/* ─── HEADER BAR ────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>
            <Link href="/erp/equipment" style={{ color: 'inherit', textDecoration: 'none' }}>
              ERP
            </Link>
            <i className="ti ti-chevron-right" style={{ fontSize: '10px' }} />
            <span style={{ color: 'var(--color-foreground)', fontWeight: 600 }}>Accounts & Cashflow Suite</span>
          </div>

          {/* Action Buttons */}
          <div className="financials-header-actions" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Button
              variant="outline"
              onClick={() => setIsGstModalOpen(true)}
              style={{
                height: '34px',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                borderRadius: '8px',
              }}
            >
              <i className="ti ti-receipt-tax" style={{ fontSize: '14px', color: 'var(--color-primary)' }} />
              <span className="hidden sm:inline">GST Summary &amp; Filing</span>
              <span className="sm:hidden">GST</span>
            </Button>
            <Button
              variant="outline"
              onClick={handleExportCSV}
              style={{
                height: '34px',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                borderRadius: '8px',
              }}
            >
              <i className="ti ti-download" style={{ fontSize: '14px' }} />
              <span className="hidden sm:inline">Export</span> Full Audit CSV
            </Button>
          </div>
        </div>

        {/* Title, Subtitle and 4-Way Tab Switcher */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '16px',
          }}
        >
          <div>
            <h1
              style={{
                fontSize: 'clamp(1.4rem, 2.4vw, var(--text-2xl))',
                fontWeight: 700,
                letterSpacing: '-0.02em',
                color: 'var(--color-foreground)',
                margin: 0,
              }}
            >
              Studio Financial Suite
            </h1>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)', margin: '4px 0 0 0' }}>
              Cashflow forecasting & runway, receivables aging with 1-click reminders, accounts payable, and project profitability.
            </p>
          </div>

          {/* 4-Way Segmented View Switcher */}
          <div
            className="financials-tab-switcher"
            style={{
              display: 'inline-flex',
              background: 'var(--color-surface)',
              border: '0.5px solid var(--color-border)',
              borderRadius: '10px',
              padding: '3px',
              gap: '3px',
              flexWrap: 'wrap',
            }}
          >
            <button
              type="button"
              onClick={() => setActiveTab('cashflow')}
              style={{
                border: 'none',
                background: activeTab === 'cashflow' ? 'var(--color-primary)' : 'transparent',
                color: activeTab === 'cashflow' ? '#ffffff' : 'var(--color-foreground-muted)',
                fontWeight: activeTab === 'cashflow' ? 600 : 500,
                fontSize: 'var(--text-xs)',
                padding: '6px 12px',
                borderRadius: '7px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.15s ease',
              }}
            >
              <i className="ti ti-chart-bar" style={{ fontSize: '14px' }} />
              <span>Cashflow & Forecast</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('accounts')}
              style={{
                border: 'none',
                background: activeTab === 'accounts' ? 'var(--color-primary)' : 'transparent',
                color: activeTab === 'accounts' ? '#ffffff' : 'var(--color-foreground-muted)',
                fontWeight: activeTab === 'accounts' ? 600 : 500,
                fontSize: 'var(--text-xs)',
                padding: '6px 12px',
                borderRadius: '7px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.15s ease',
              }}
            >
              <i className="ti ti-scale" style={{ fontSize: '14px' }} />
              <span>Accounts & Budgets</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('profitability')}
              style={{
                border: 'none',
                background: activeTab === 'profitability' ? 'var(--color-primary)' : 'transparent',
                color: activeTab === 'profitability' ? '#ffffff' : 'var(--color-foreground-muted)',
                fontWeight: activeTab === 'profitability' ? 600 : 500,
                fontSize: 'var(--text-xs)',
                padding: '6px 12px',
                borderRadius: '7px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.15s ease',
              }}
            >
              <i className="ti ti-currency-rupee" style={{ fontSize: '14px' }} />
              <span>Project Profitability</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('executive')}
              style={{
                border: 'none',
                background: activeTab === 'executive' ? 'var(--color-primary)' : 'transparent',
                color: activeTab === 'executive' ? '#ffffff' : 'var(--color-foreground-muted)',
                fontWeight: activeTab === 'executive' ? 600 : 500,
                fontSize: 'var(--text-xs)',
                padding: '6px 12px',
                borderRadius: '7px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.15s ease',
              }}
            >
              <i className="ti ti-layout-grid" style={{ fontSize: '14px' }} />
              <span>Executive Command</span>
            </button>
          </div>
        </div>

        {/* Dynamic Period & Month Navigation Suite */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            background: 'var(--color-surface)',
            border: '0.5px solid var(--color-border)',
            borderRadius: '12px',
            padding: '12px 16px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
            width: '100%',
            maxWidth: '100%',
            minWidth: 0,
            boxSizing: 'border-box',
          }}
        >
          {/* Top Row: Dynamic FY Picker & Stepper + Active Month Stepper with Net Indicator */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              flexWrap: 'wrap',
            }}
          >
            {/* Left: Dynamic Financial Year Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <i className="ti ti-calendar" style={{ fontSize: '13px' }} />
                Financial Year:
              </span>

              {/* Dynamic FY Dropdown */}
              <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                <select
                  value={selectedPeriod}
                  onChange={(e) => handlePeriodChange(e.target.value)}
                  style={{
                    height: '30px',
                    padding: '0 28px 0 10px',
                    borderRadius: '6px',
                    background: 'var(--color-surface-raised)',
                    border: '0.5px solid var(--color-border)',
                    color: 'var(--color-foreground)',
                    fontSize: '12px',
                    fontWeight: 600,
                    outline: 'none',
                    cursor: 'pointer',
                    appearance: 'none',
                    WebkitAppearance: 'none',
                  }}
                >
                  {allFyStarts.map((fyStart) => {
                    const key = `FY-${fyStart}`
                    const label = `FY ${fyStart}–${String(fyStart + 1).slice(-2)}`
                    const isCurrent = fyStart === currentFyStart
                    return (
                      <option key={key} value={key}>
                        {label} {isCurrent ? '(Current FY)' : ''}
                      </option>
                    )
                  })}
                  <option value="last6Months">Last 6 Months (Rolling)</option>
                  <option value="all">All History (All Years)</option>
                </select>
                <i
                  className="ti ti-chevron-down"
                  style={{
                    position: 'absolute',
                    right: '8px',
                    pointerEvents: 'none',
                    fontSize: '11px',
                    color: 'var(--color-foreground-muted)',
                  }}
                />
              </div>

              {/* Quick Stepper for FY */}
              <div style={{ display: 'inline-flex', alignItems: 'center', border: '0.5px solid var(--color-border)', borderRadius: '6px', overflow: 'hidden' }}>
                <button
                  type="button"
                  onClick={handlePrevFY}
                  title="Previous Financial Year"
                  style={{
                    height: '28px',
                    width: '28px',
                    border: 'none',
                    background: 'var(--color-surface-raised)',
                    color: 'var(--color-foreground)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <i className="ti ti-chevron-left" style={{ fontSize: '12px' }} />
                </button>
                <button
                  type="button"
                  onClick={handleNextFY}
                  title="Next Financial Year"
                  style={{
                    height: '28px',
                    width: '28px',
                    border: 'none',
                    borderLeft: '0.5px solid var(--color-border)',
                    background: 'var(--color-surface-raised)',
                    color: 'var(--color-foreground)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <i className="ti ti-chevron-right" style={{ fontSize: '12px' }} />
                </button>
              </div>

              {/* Quick Preset Buttons */}
              <div
                style={{
                  display: 'inline-flex',
                  borderRadius: '6px',
                  border: '0.5px solid var(--color-border)',
                  background: 'var(--color-surface-raised)',
                  padding: '2px',
                  gap: '2px',
                }}
              >
                <button
                  type="button"
                  onClick={() => handlePeriodChange(`FY-${currentFyStart}`)}
                  style={{
                    border: 'none',
                    background: (selectedPeriod === `FY-${currentFyStart}` || selectedPeriod === 'currentFY') ? 'var(--color-primary)' : 'transparent',
                    color: (selectedPeriod === `FY-${currentFyStart}` || selectedPeriod === 'currentFY') ? '#ffffff' : 'var(--color-foreground-muted)',
                    fontSize: '11px',
                    fontWeight: (selectedPeriod === `FY-${currentFyStart}` || selectedPeriod === 'currentFY') ? 600 : 500,
                    padding: '3px 8px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  Current FY
                </button>
                <button
                  type="button"
                  onClick={() => handlePeriodChange('last6Months')}
                  style={{
                    border: 'none',
                    background: selectedPeriod === 'last6Months' ? 'var(--color-primary)' : 'transparent',
                    color: selectedPeriod === 'last6Months' ? '#ffffff' : 'var(--color-foreground-muted)',
                    fontSize: '11px',
                    fontWeight: selectedPeriod === 'last6Months' ? 600 : 500,
                    padding: '3px 8px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  Last 6M
                </button>
                <button
                  type="button"
                  onClick={() => handlePeriodChange('all')}
                  style={{
                    border: 'none',
                    background: selectedPeriod === 'all' ? 'var(--color-primary)' : 'transparent',
                    color: selectedPeriod === 'all' ? '#ffffff' : 'var(--color-foreground-muted)',
                    fontSize: '11px',
                    fontWeight: selectedPeriod === 'all' ? 600 : 500,
                    padding: '3px 8px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  All History
                </button>
              </div>
            </div>

            {/* Right: Active Month Stepper with Net Indicator */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'var(--color-surface-raised)',
                  padding: '2px 4px',
                  borderRadius: '8px',
                  border: '0.5px solid var(--color-border)',
                }}
              >
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  title="Previous Month"
                  style={{
                    height: '26px',
                    width: '26px',
                    border: 'none',
                    borderRadius: '5px',
                    background: 'transparent',
                    color: 'var(--color-foreground)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <i className="ti ti-chevron-left" style={{ fontSize: '13px' }} />
                </button>

                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-foreground)', padding: '0 6px', whiteSpace: 'nowrap' }}>
                  {currentMonthSummary.fullMonthLabel}
                </span>

                <button
                  type="button"
                  onClick={handleNextMonth}
                  title="Next Month"
                  style={{
                    height: '26px',
                    width: '26px',
                    border: 'none',
                    borderRadius: '5px',
                    background: 'transparent',
                    color: 'var(--color-foreground)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <i className="ti ti-chevron-right" style={{ fontSize: '13px' }} />
                </button>
              </div>

              {/* Net Status Badge */}
              <Badge
                variant={currentMonthSummary.net >= 0 ? 'paid' : 'overdue'}
                label={`Net ${formatCompactINR(currentMonthSummary.net)}`}
              />
            </div>
          </div>

          {/* Bottom Row: Streamlined 12-Month Rail (No wrap, fixed month chips) */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              overflowX: 'auto',
              WebkitOverflowScrolling: 'touch',
              padding: '4px',
              background: 'var(--color-surface-raised)',
              borderRadius: '8px',
              border: '0.5px solid var(--color-border)',
              width: '100%',
              maxWidth: '100%',
              minWidth: 0,
              boxSizing: 'border-box',
            }}
          >
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--color-foreground-subtle)',
                padding: '0 8px',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              Months:
            </span>
            {displayedMonths.map((m) => {
              const isSelected = m.monthKey === selectedMonthKey
              const hasActivity = m.income > 0 || m.outflow > 0
              const isSurplus = m.net >= 0

              return (
                <button
                  key={m.monthKey}
                  type="button"
                  onClick={() => setSelectedMonthKey(m.monthKey)}
                  title={`${m.fullMonthLabel} · In: ${formatINR(m.income)} | Out: ${formatINR(m.outflow)} | Net: ${formatINR(m.net)}`}
                  style={{
                    flex: '0 0 auto',
                    minWidth: '54px',
                    height: '32px',
                    border: isSelected ? '1px solid var(--color-primary)' : '0.5px solid var(--color-border)',
                    background: isSelected ? 'var(--color-primary)' : 'var(--color-surface)',
                    color: isSelected ? '#ffffff' : hasActivity ? 'var(--color-foreground)' : 'var(--color-foreground-subtle)',
                    borderRadius: '6px',
                    padding: '2px 6px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span style={{ fontSize: '11px', fontWeight: isSelected ? 700 : hasActivity ? 600 : 500 }}>
                    {m.monthLabel}
                  </span>
                  {hasActivity && (
                    <span
                      style={{
                        width: '5px',
                        height: '5px',
                        borderRadius: '50%',
                        background: isSelected
                          ? '#ffffff'
                          : isSurplus
                          ? 'var(--color-success)'
                          : 'var(--color-danger)',
                      }}
                    />
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Success Notification Banner */}
      {budgetSuccessMsg && (
        <div
          style={{
            padding: '10px 16px',
            borderRadius: '8px',
            background: 'var(--color-success-muted)',
            border: '0.5px solid var(--color-success)',
            color: 'var(--color-success)',
            fontSize: 'var(--text-xs)',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <i className="ti ti-check" />
          <span>{budgetSuccessMsg}</span>
        </div>
      )}

      {/* ─── TAB 1: CASHFLOW & FORECAST ────────────────────────────────────── */}
      {(activeTab === 'cashflow' || activeTab === 'executive') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box' }}>
          {/* Actual Cash Position, Burn Rate & Runway Strip */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '12px',
            }}
          >
            {/* Total Liquid Position */}
            <div
              style={{
                background: 'var(--color-surface)',
                border: '0.5px solid var(--color-border)',
                borderRadius: '12px',
                padding: '14px 18px',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-foreground-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Liquid Cash Position
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const totalBankBalance = cashPosition.bankAccountsBreakdown && cashPosition.bankAccountsBreakdown.length > 0
                      ? cashPosition.bankAccountsBreakdown.reduce((sum, b) => sum + b.balance, 0)
                      : (openingBalances ? openingBalances.cashInBank : 0)
                    setBaselineBank(String(totalBankBalance))
                    setBaselineCash(String(openingBalances ? openingBalances.cashInHand : 0))
                    setBaselineUPI(String(openingBalances ? openingBalances.cashInUPI : 0))
                    const d = openingBalances?.asOfDate
                      ? (openingBalances.asOfDate instanceof Date
                          ? openingBalances.asOfDate
                          : new Date(openingBalances.asOfDate))
                      : new Date()
                    const yyyy = d.getFullYear()
                    const mm = String(d.getMonth() + 1).padStart(2, '0')
                    const dd = String(d.getDate()).padStart(2, '0')
                    setBaselineDate(`${yyyy}-${mm}-${dd}`)
                    setIsOpeningBalancesModalOpen(true)
                  }}
                  style={{
                    border: '0.5px solid var(--color-border)',
                    background: 'var(--color-surface-raised)',
                    color: 'var(--color-primary)',
                    fontSize: '10px',
                    fontWeight: 600,
                    padding: '2px 6px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                  title="Configure actual bank, cash and UPI opening balances"
                >
                  <i className="ti ti-adjustments-horizontal" style={{ fontSize: '11px' }} />
                  {openingBalances ? 'Baseline Set' : 'Set Baseline'}
                </button>
              </div>
              <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--color-foreground)' }}>
                {formatINR(cashPosition.totalAvailable)}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'var(--color-foreground-subtle)', flexWrap: 'wrap' }}>
                {cashPosition.bankAccountsBreakdown && cashPosition.bankAccountsBreakdown.length > 0 ? (
                  <>
                    {cashPosition.bankAccountsBreakdown.map((b) => (
                      <span key={b.bankAccountId} style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                        <i className="ti ti-building-bank" style={{ fontSize: '11px', color: 'var(--color-primary)' }} />
                        <span style={{ color: 'var(--color-foreground)' }}>{b.nickname}:</span>
                        <span>{formatCompactINR(b.balance)}</span>
                      </span>
                    ))}
                    {cashPosition.cashInUPI > 0 && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                        <i className="ti ti-device-mobile" style={{ fontSize: '11px', color: 'var(--color-accent)' }} />
                        <span style={{ color: 'var(--color-foreground)' }}>UPI:</span>
                        <span>{formatCompactINR(cashPosition.cashInUPI)}</span>
                      </span>
                    )}
                    {cashPosition.cashInHand > 0 && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                        <i className="ti ti-cash" style={{ fontSize: '11px', color: 'var(--color-success)' }} />
                        <span style={{ color: 'var(--color-foreground)' }}>Cash:</span>
                        <span>{formatCompactINR(cashPosition.cashInHand)}</span>
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <span>Bank: {formatCompactINR(cashPosition.cashInBank)}</span>
                    <span>·</span>
                    <span>UPI: {formatCompactINR(cashPosition.cashInUPI)}</span>
                    <span>·</span>
                    <span>Cash: {formatCompactINR(cashPosition.cashInHand)}</span>
                  </>
                )}
              </div>
            </div>

            {/* Monthly Operating Outflow */}
            <div
              style={{
                background: 'var(--color-surface)',
                border: '0.5px solid var(--color-border)',
                borderRadius: '12px',
                padding: '14px 18px',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-foreground-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Monthly Operating Outflow
                </span>
                <i className="ti ti-trending-down" style={{ color: 'var(--color-secondary)', fontSize: '16px' }} />
              </div>
              <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--color-danger)' }}>
                {formatINR(cashPosition.monthlyBurnRate)}/mo
              </div>
              <div style={{ fontSize: '11px', color: 'var(--color-foreground-subtle)' }}>
                Avg outflow across last 3 realized months
              </div>
            </div>

            {/* Estimated Runway */}
            <div
              style={{
                background: 'var(--color-surface)',
                border: '0.5px solid var(--color-border)',
                borderRadius: '12px',
                padding: '14px 18px',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-foreground-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Operating Runway
                </span>
                <i className="ti ti-clock-hour-4" style={{ color: 'var(--color-success)', fontSize: '16px' }} />
              </div>
              <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: cashPosition.runwayMonths >= 3 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                {cashPosition.runwayMonths} Months
              </div>
              <div style={{ fontSize: '11px', color: 'var(--color-foreground-subtle)' }}>
                At current burn with zero additional revenue
              </div>
            </div>

            {/* Accounts Payable Exposure */}
            <div
              style={{
                background: 'var(--color-surface)',
                border: '0.5px solid var(--color-border)',
                borderRadius: '12px',
                padding: '14px 18px',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-foreground-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Pending Vendor Bills
                </span>
                <i className="ti ti-credit-card" style={{ color: 'var(--color-secondary)', fontSize: '16px' }} />
              </div>
              <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--color-secondary)' }}>
                {formatINR(payablesSummary.totalPayable)}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--color-foreground-subtle)' }}>
                {payablesSummary.overdueCount > 0 ? `${payablesSummary.overdueCount} bills overdue` : 'All bills within terms'}
              </div>
            </div>
          </div>

          {/* Cash-Basis Realized P&L Executive Banner */}
          <div
            style={{
              background: 'var(--color-surface)',
              border: '0.5px solid var(--color-border)',
              borderRadius: '12px',
              padding: '14px 18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: 'var(--color-primary-muted)',
                  color: 'var(--color-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <i className="ti ti-chart-arrows" style={{ fontSize: '16px' }} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-foreground)' }}>
                    {currentMonthSummary.fullMonthLabel} · Realized P&amp;L
                  </span>
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      padding: '1px 6px',
                      borderRadius: '4px',
                      background: 'var(--color-surface-raised)',
                      border: '0.5px solid var(--color-border)',
                      color: 'var(--color-foreground-muted)',
                    }}
                  >
                    Cash-Basis
                  </span>
                </div>
                <div style={{ fontSize: '10px', color: 'var(--color-foreground-subtle)' }}>
                  Realized customer receipts minus direct production costs (COGS) and fixed overheads (OpEx)
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
              <div>
                <span style={{ fontSize: '10px', color: 'var(--color-foreground-subtle)', display: 'block' }}>Revenue</span>
                <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--color-success)' }}>
                  {formatINR(pnlStatement.revenue)}
                </span>
              </div>
              <div style={{ width: '1px', height: '24px', background: 'var(--color-border)' }} />
              <div>
                <span style={{ fontSize: '10px', color: 'var(--color-foreground-subtle)', display: 'block' }}>COGS (Direct)</span>
                <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--color-secondary)' }}>
                  {formatINR(pnlStatement.cogs)}
                </span>
              </div>
              <div style={{ width: '1px', height: '24px', background: 'var(--color-border)' }} />
              <div>
                <span style={{ fontSize: '10px', color: 'var(--color-foreground-subtle)', display: 'block' }}>Gross Profit</span>
                <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: pnlStatement.grossProfit >= 0 ? 'var(--color-primary)' : 'var(--color-danger)' }}>
                  {formatINR(pnlStatement.grossProfit)} ({pnlStatement.grossMarginPct}%)
                </span>
              </div>
              <div style={{ width: '1px', height: '24px', background: 'var(--color-border)' }} />
              <div>
                <span style={{ fontSize: '10px', color: 'var(--color-foreground-subtle)', display: 'block' }}>Net Profit</span>
                <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: pnlStatement.netProfit >= 0 ? 'var(--color-primary)' : 'var(--color-danger)' }}>
                  {formatINR(pnlStatement.netProfit)} ({pnlStatement.netMarginPct}%)
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsPnlBreakdownModalOpen(true)}
                style={{ height: '30px', fontSize: '11px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}
              >
                <i className="ti ti-list-details" />
                P&amp;L Statement
              </Button>
            </div>
          </div>

          {/* Chart & Drill-down Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) 380px',
              gap: '16px',
              width: '100%',
              maxWidth: '100%',
              minWidth: 0,
              alignItems: 'stretch',
            }}
            className="cashflow-chart-drill-grid"
          >
            {/* Chart Container */}
            <div
              style={{
                background: 'var(--color-surface)',
                border: '0.5px solid var(--color-border)',
                borderRadius: '12px',
                padding: '18px 20px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '16px',
                minWidth: 0,
                width: '100%',
                maxWidth: '100%',
                height: '100%',
                overflow: 'hidden',
                boxSizing: 'border-box',
              }}
            >
              {/* Chart Controls */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, margin: 0, color: 'var(--color-foreground)' }}>
                      {cashflowViewMode === 'historical' ? 'Income vs Outflow · Realized Trajectory' : 'Cashflow Forecast · Next 3 Months'}
                    </h3>
                    {cashflowViewMode === 'historical' && displayedMonths.length > 12 && (
                      <span
                        style={{
                          fontSize: '11px',
                          color: 'var(--color-foreground-subtle)',
                          background: 'var(--color-surface-raised)',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          border: '0.5px solid var(--color-border)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <i className="ti ti-arrows-left-right" />
                        {displayedMonths.length} Months (Scrollable)
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)', margin: '2px 0 0 0' }}>
                    {cashflowViewMode === 'historical'
                      ? 'Click on any month to inspect line-item transactions.'
                      : 'Projected receipts from upcoming milestones minus scheduled vendor & operational burn.'}
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  {/* Historical vs Forecast Toggle */}
                  <div
                    style={{
                      display: 'inline-flex',
                      background: 'var(--color-surface-raised)',
                      border: '0.5px solid var(--color-border)',
                      borderRadius: '8px',
                      padding: '2px',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setCashflowViewMode('historical')}
                      style={{
                        border: 'none',
                        background: cashflowViewMode === 'historical' ? 'var(--color-surface)' : 'transparent',
                        color: cashflowViewMode === 'historical' ? 'var(--color-foreground)' : 'var(--color-foreground-subtle)',
                        fontSize: '11px',
                        fontWeight: 600,
                        padding: '4px 10px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                      }}
                    >
                      Past 6 Months
                    </button>
                    <button
                      type="button"
                      onClick={() => setCashflowViewMode('forecast')}
                      style={{
                        border: 'none',
                        background: cashflowViewMode === 'forecast' ? 'var(--color-surface)' : 'transparent',
                        color: cashflowViewMode === 'forecast' ? 'var(--color-foreground)' : 'var(--color-foreground-subtle)',
                        fontSize: '11px',
                        fontWeight: 600,
                        padding: '4px 10px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                      }}
                    >
                      3-Mo Forecast
                    </button>
                  </div>

                  {/* Scenario sensitivity pills (when forecast mode is active) */}
                  {cashflowViewMode === 'forecast' && (
                    <div
                      style={{
                        display: 'inline-flex',
                        background: 'var(--color-surface-raised)',
                        border: '0.5px solid var(--color-border)',
                        borderRadius: '8px',
                        padding: '2px',
                        gap: '2px',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setForecastScenario('expected')}
                        style={{
                          border: 'none',
                          background: forecastScenario === 'expected' ? 'var(--color-surface)' : 'transparent',
                          color: forecastScenario === 'expected' ? 'var(--color-primary)' : 'var(--color-foreground-subtle)',
                          fontSize: '10px',
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: '6px',
                          cursor: 'pointer',
                        }}
                        title="85% realization probability on pending receivables"
                      >
                        Expected (85%)
                      </button>
                      <button
                        type="button"
                        onClick={() => setForecastScenario('optimistic')}
                        style={{
                          border: 'none',
                          background: forecastScenario === 'optimistic' ? 'var(--color-surface)' : 'transparent',
                          color: forecastScenario === 'optimistic' ? 'var(--color-success)' : 'var(--color-foreground-subtle)',
                          fontSize: '10px',
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: '6px',
                          cursor: 'pointer',
                        }}
                        title="100% on-time client settlements"
                      >
                        Optimistic (100%)
                      </button>
                      <button
                        type="button"
                        onClick={() => setForecastScenario('conservative')}
                        style={{
                          border: 'none',
                          background: forecastScenario === 'conservative' ? 'var(--color-surface)' : 'transparent',
                          color: forecastScenario === 'conservative' ? 'var(--color-danger)' : 'var(--color-foreground-subtle)',
                          fontSize: '10px',
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: '6px',
                          cursor: 'pointer',
                        }}
                        title="65% realization with payment delays factored in"
                      >
                        Conservative (65%)
                      </button>
                    </div>
                  )}

                  {/* Legend */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: 'var(--color-primary)' }} />
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)', fontWeight: 500 }}>Inflow</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: 'var(--color-secondary)' }} />
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)', fontWeight: 500 }}>Outflow</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Chart Rendering */}
              {cashflowViewMode === 'historical' ? (
                <div
                  style={{
                    width: '100%',
                    maxWidth: '100%',
                    minWidth: 0,
                    overflowX: 'auto',
                    WebkitOverflowScrolling: 'touch',
                    paddingBottom: '6px',
                    boxSizing: 'border-box',
                  }}
                >
                  <div
                    style={{
                      minWidth: displayedMonths.length > 12 ? `${displayedMonths.length * 50}px` : '100%',
                      width: displayedMonths.length > 12 ? `${displayedMonths.length * 50}px` : '100%',
                    }}
                  >
                    {/* Historical Bar Chart */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'flex-end',
                        height: '210px',
                        borderBottom: '0.5px solid var(--color-border-strong)',
                        paddingTop: '20px',
                        gap: displayedMonths.length > 12 ? '4px' : '8px',
                      }}
                    >
                      {displayedMonths.map((m) => {
                        const isSelected = m.monthKey === selectedMonthKey
                        const incomeH = maxChartBarValue > 0 ? Math.round((m.income / maxChartBarValue) * 160) : 4
                        const outflowH = maxChartBarValue > 0 ? Math.round((m.outflow / maxChartBarValue) * 160) : 4

                        return (
                          <div
                            key={m.monthKey}
                            onClick={() => setSelectedMonthKey(m.monthKey)}
                            style={{
                              flex: 1,
                              minWidth: displayedMonths.length > 12 ? '44px' : 'auto',
                              display: 'flex',
                              alignItems: 'flex-end',
                              justifyContent: 'center',
                              gap: displayedMonths.length > 12 ? '3px' : '6px',
                              height: '100%',
                              cursor: 'pointer',
                              borderRadius: '8px 8px 0 0',
                              background: isSelected ? 'var(--color-surface-raised)' : 'transparent',
                              padding: '0 2px',
                              transition: 'all 0.15s ease',
                              borderTop: isSelected ? '0.5px solid var(--color-border-strong)' : '0.5px solid transparent',
                              borderLeft: isSelected ? '0.5px solid var(--color-border-strong)' : '0.5px solid transparent',
                              borderRight: isSelected ? '0.5px solid var(--color-border-strong)' : '0.5px solid transparent',
                              borderBottom: 'none',
                            }}
                            title={`${m.monthLabel} ${m.year}: Income ${formatINR(m.income)} | Outflow ${formatINR(m.outflow)} | Net ${formatINR(m.net)}`}
                          >
                            <div
                              style={{
                                width: displayedMonths.length > 12 ? '13px' : '18px',
                                borderRadius: '4px 4px 0 0',
                                background: 'var(--color-primary)',
                                height: `${Math.max(6, incomeH)}px`,
                                transition: 'height 0.3s ease',
                              }}
                            />
                            <div
                              style={{
                                width: displayedMonths.length > 12 ? '13px' : '18px',
                                borderRadius: '4px 4px 0 0',
                                background: 'var(--color-secondary)',
                                opacity: 0.9,
                                height: `${Math.max(6, outflowH)}px`,
                                transition: 'height 0.3s ease',
                              }}
                            />
                          </div>
                        )
                      })}
                    </div>

                    {/* X-Axis Labels */}
                    <div style={{ display: 'flex', gap: displayedMonths.length > 12 ? '4px' : '8px', paddingTop: '8px' }}>
                      {displayedMonths.map((m) => {
                        const isSelected = m.monthKey === selectedMonthKey
                        return (
                          <div
                            key={m.monthKey}
                            onClick={() => setSelectedMonthKey(m.monthKey)}
                            style={{
                              flex: 1,
                              minWidth: displayedMonths.length > 12 ? '44px' : 'auto',
                              textAlign: 'center',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '2px',
                              cursor: 'pointer',
                            }}
                          >
                            <span
                              style={{
                                fontSize: 'var(--text-xs)',
                                color: isSelected ? 'var(--color-foreground)' : 'var(--color-foreground-subtle)',
                                fontWeight: isSelected ? 700 : 500,
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {m.monthLabel}
                              {displayedMonths.length > 12 ? ` '${String(m.year).slice(-2)}` : ''}
                            </span>
                            <span
                              style={{
                                fontSize: '10px',
                                color: m.net >= 0 ? 'var(--color-success)' : 'var(--color-danger)',
                                fontWeight: 600,
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {m.net >= 0 ? `+${formatCompactINR(m.net)}` : formatCompactINR(m.net)}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {/* Forecast Bar Chart with Running Balance */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-end',
                      height: '210px',
                      borderBottom: '0.5px solid var(--color-border-strong)',
                      paddingTop: '20px',
                      gap: '24px',
                      justifyContent: 'space-around',
                    }}
                  >
                    {cashflowForecast.map((fm) => {
                      const inH = maxForecastBarValue > 0 ? Math.round((fm.projectedInflow / maxForecastBarValue) * 150) : 10
                      const outH = maxForecastBarValue > 0 ? Math.round((fm.projectedOutflow / maxForecastBarValue) * 150) : 10

                      return (
                        <div
                          key={fm.monthKey}
                          style={{
                            flex: 1,
                            maxWidth: '140px',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'flex-end',
                            height: '100%',
                            gap: '8px',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', height: '160px' }}>
                            {/* Forecast Inflow Bar */}
                            <div
                              style={{
                                width: '24px',
                                borderRadius: '4px 4px 0 0',
                                background: 'var(--color-primary)',
                                height: `${Math.max(8, inH)}px`,
                                border: '1px dashed var(--color-primary-hover)',
                              }}
                              title={`Projected Inflow: ${formatINR(fm.projectedInflow)}`}
                            />
                            {/* Forecast Outflow Bar */}
                            <div
                              style={{
                                width: '24px',
                                borderRadius: '4px 4px 0 0',
                                background: 'var(--color-secondary)',
                                height: `${Math.max(8, outH)}px`,
                                border: '1px dashed var(--color-secondary)',
                                opacity: 0.85,
                              }}
                              title={`Projected Outflow: ${formatINR(fm.projectedOutflow)}`}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Forecast Labels and Projected Closing Balances */}
                  <div style={{ display: 'flex', gap: '24px', justifyContent: 'space-around' }}>
                    {cashflowForecast.map((fm) => (
                      <div key={fm.monthKey} style={{ flex: 1, maxWidth: '140px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-foreground)' }}>
                          {fm.monthLabel}
                        </span>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: fm.projectedNet >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                          Net {fm.projectedNet >= 0 ? `+${formatCompactINR(fm.projectedNet)}` : formatCompactINR(fm.projectedNet)}
                        </span>
                        <span style={{ fontSize: '10px', color: 'var(--color-foreground-subtle)' }}>
                          Est. Close: <strong>{formatCompactINR(fm.projectedClosingBalance)}</strong>
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Outflow Category Breakdown Distribution Bar */}
              <div style={{ borderTop: '0.5px solid var(--color-border)', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-foreground-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Outflow Category Distribution
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--color-foreground-subtle)' }}>
                    Primary burn drivers
                  </span>
                </div>

                {/* Progress bar segments */}
                <div style={{ display: 'flex', height: '8px', borderRadius: '4px', overflow: 'hidden', gap: '2px' }}>
                  {categoryOutflowBreakdown.slice(0, 5).map((cat, idx) => {
                    const colors = [
                      'var(--color-primary)',
                      'var(--color-secondary)',
                      'var(--color-accent)',
                      'var(--color-purple)',
                      'var(--color-danger)',
                    ]
                    return (
                      <div
                        key={cat.category}
                        style={{
                          width: `${cat.percentage}%`,
                          background: colors[idx % colors.length],
                        }}
                        title={`${cat.label}: ${formatINR(cat.amount)} (${cat.percentage}%)`}
                      />
                    )
                  })}
                </div>

                {/* Category tags */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '11px' }}>
                  {categoryOutflowBreakdown.slice(0, 5).map((cat, idx) => {
                    const colors = [
                      'var(--color-primary)',
                      'var(--color-secondary)',
                      'var(--color-accent)',
                      'var(--color-purple)',
                      'var(--color-danger)',
                    ]
                    return (
                      <div key={cat.category} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: colors[idx % colors.length] }} />
                        <span style={{ color: 'var(--color-foreground-muted)' }}>{cat.label}:</span>
                        <strong style={{ color: 'var(--color-foreground)' }}>{cat.percentage}%</strong>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Month Line-Items Drill-Down Side Panel */}
            <div
              style={{
                background: 'var(--color-surface)',
                border: '0.5px solid var(--color-border)',
                borderRadius: '12px',
                padding: '18px 20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                height: '100%',
                maxHeight: '480px',
                minHeight: 0,
                minWidth: 0,
                width: '100%',
                maxWidth: '100%',
                boxSizing: 'border-box',
                overflow: 'hidden',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                <div>
                  <h4 style={{ fontSize: 'var(--text-base)', fontWeight: 600, margin: 0, color: 'var(--color-foreground)' }}>
                    Payment & Expense Records
                  </h4>
                  <span style={{ fontSize: '11px', color: 'var(--color-foreground-subtle)' }}>
                    {currentMonthSummary.fullMonthLabel} · {filteredLineItems.length} transactions
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {/* In/Out Filter */}
                  <div style={{ display: 'flex', gap: '2px', background: 'var(--color-surface-raised)', padding: '2px', borderRadius: '6px' }}>
                    <button
                      type="button"
                      onClick={() => setDrillTypeFilter('all')}
                      style={{
                        border: 'none',
                        background: drillTypeFilter === 'all' ? 'var(--color-surface)' : 'transparent',
                        color: drillTypeFilter === 'all' ? 'var(--color-foreground)' : 'var(--color-foreground-subtle)',
                        fontSize: '11px',
                        fontWeight: 600,
                        padding: '2px 6px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                      }}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      onClick={() => setDrillTypeFilter('income')}
                      style={{
                        border: 'none',
                        background: drillTypeFilter === 'income' ? 'var(--color-success-muted)' : 'transparent',
                        color: drillTypeFilter === 'income' ? 'var(--color-success)' : 'var(--color-foreground-subtle)',
                        fontSize: '11px',
                        fontWeight: 600,
                        padding: '2px 6px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                      }}
                    >
                      In
                    </button>
                    <button
                      type="button"
                      onClick={() => setDrillTypeFilter('expense')}
                      style={{
                        border: 'none',
                        background: drillTypeFilter === 'expense' ? 'var(--color-danger-muted)' : 'transparent',
                        color: drillTypeFilter === 'expense' ? 'var(--color-danger)' : 'var(--color-foreground-subtle)',
                        fontSize: '11px',
                        fontWeight: 600,
                        padding: '2px 6px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                      }}
                    >
                      Out
                    </button>
                  </div>

                  {/* Account / Ledger Filter */}
                  <select
                    value={drillBankFilter}
                    onChange={(e) => setDrillBankFilter(e.target.value)}
                    style={{
                      height: '24px',
                      background: 'var(--color-surface-raised)',
                      border: '0.5px solid var(--color-border)',
                      borderRadius: '6px',
                      padding: '0 8px',
                      fontSize: '11px',
                      color: 'var(--color-foreground)',
                      outline: 'none',
                      cursor: 'pointer',
                    }}
                    title="Filter transactions by deposit account or ledger"
                  >
                    <option value="all">All Accounts</option>
                    {bankAccounts.map((b) => (
                      <option key={b.bankAccountId} value={b.bankAccountId}>
                        {b.nickname}
                      </option>
                    ))}
                  </select>

                  {/* Export CSV Button */}
                  <button
                    type="button"
                    onClick={() => exportCashflowTransactionsCSV(filteredLineItems, currentMonthSummary.fullMonthLabel)}
                    style={{
                      border: '0.5px solid var(--color-border)',
                      background: 'var(--color-surface-raised)',
                      color: 'var(--color-foreground)',
                      fontSize: '11px',
                      fontWeight: 600,
                      padding: '4px 8px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      transition: 'all 0.15s ease',
                    }}
                    title="Export current month's transactions to CSV"
                  >
                    <i className="ti ti-download" style={{ fontSize: '13px' }} />
                    <span>CSV</span>
                  </button>

                  {/* Full View Button */}
                  <button
                    type="button"
                    onClick={() => {
                      setFullLedgerScope('month')
                      setIsFullTransactionsModalOpen(true)
                    }}
                    style={{
                      border: '0.5px solid var(--color-primary)',
                      background: 'var(--color-primary-muted)',
                      color: 'var(--color-primary)',
                      fontSize: '11px',
                      fontWeight: 600,
                      padding: '4px 8px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      transition: 'all 0.15s ease',
                    }}
                    title="View full-width ledger with all payment and expense details"
                  >
                    <i className="ti ti-arrows-maximize" style={{ fontSize: '12px' }} />
                    <span>Full Ledger</span>
                  </button>
                </div>
              </div>

              {/* Search Inside Drilldown */}
              <div style={{ position: 'relative' }}>
                <i
                  className="ti ti-search"
                  style={{
                    position: 'absolute',
                    left: '8px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    fontSize: '13px',
                    color: 'var(--color-foreground-subtle)',
                  }}
                />
                <input
                  type="text"
                  placeholder="Filter transactions..."
                  value={drillSearch}
                  onChange={(e) => setDrillSearch(e.target.value)}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    height: '30px',
                    padding: '0 8px 0 28px',
                    borderRadius: '6px',
                    background: 'var(--color-surface-raised)',
                    border: '0.5px solid var(--color-border)',
                    fontSize: '12px',
                    color: 'var(--color-foreground)',
                    outline: 'none',
                  }}
                />
              </div>

              {/* Transactions List */}
              <div
                className="cashflow-drilldown-list"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  overflowY: 'auto',
                  flex: 1,
                  minHeight: 0,
                  paddingRight: '6px',
                  WebkitOverflowScrolling: 'touch',
                  scrollbarWidth: 'thin',
                  scrollbarColor: 'var(--color-border-strong) transparent',
                }}
              >
                {filteredLineItems.length === 0 ? (
                  <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--color-foreground-subtle)', fontSize: 'var(--text-xs)' }}>
                    No recorded transactions for this filter.
                  </div>
                ) : (
                  filteredLineItems.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '8px 0',
                        borderBottom: '0.5px solid var(--color-border)',
                      }}
                    >
                      <div
                        style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '8px',
                          background: item.iconBg,
                          color: item.iconFg,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <i className={`ti ${item.icon}`} style={{ fontSize: '14px' }} />
                      </div>

                      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--color-foreground)' }}>
                          {item.label}
                        </span>
                        <span style={{ fontSize: '11px', color: 'var(--color-foreground-subtle)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {item.meta}
                        </span>
                      </div>

                      <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: item.amtColor, whiteSpace: 'nowrap', flexShrink: 0 }}>
                        {item.type === 'income' ? `+${formatINR(item.amount)}` : `−${formatINR(item.amount)}`}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB 2: ACCOUNTS, BUDGETS, AGING & PAYABLES ────────────────────── */}
      {(activeTab === 'accounts' || activeTab === 'executive') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box' }}>
          {/* Sub-navigation Switcher: Receivables vs Payables */}
          <div
            className="financials-subnav-row"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '0.5px solid var(--color-border)',
              paddingBottom: '8px',
              flexWrap: 'wrap',
              gap: '10px',
            }}
          >
            <div className="financials-subnav-buttons" style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setAccountsSubTab('receivables')}
                style={{
                  border: 'none',
                  background: accountsSubTab === 'receivables' ? 'var(--color-primary)' : 'var(--color-surface)',
                  color: accountsSubTab === 'receivables' ? '#ffffff' : 'var(--color-foreground-muted)',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  padding: '6px 14px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <i className="ti ti-arrow-down-left" />
                <span>Receivables (Money Owed to Us)</span>
                <span style={{ padding: '1px 6px', borderRadius: '10px', background: accountsSubTab === 'receivables' ? 'rgba(255,255,255,0.25)' : 'var(--color-surface-raised)', fontSize: '10px' }}>
                  {formatCompactINR(receivablesAgingSummary.totalBalanceDue)}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setAccountsSubTab('payables')}
                style={{
                  border: 'none',
                  background: accountsSubTab === 'payables' ? 'var(--color-primary)' : 'var(--color-surface)',
                  color: accountsSubTab === 'payables' ? '#ffffff' : 'var(--color-foreground-muted)',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  padding: '6px 14px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <i className="ti ti-arrow-up-right" />
                <span>Payables (Money We Owe)</span>
                <span style={{ padding: '1px 6px', borderRadius: '10px', background: accountsSubTab === 'payables' ? 'rgba(255,255,255,0.25)' : 'var(--color-surface-raised)', fontSize: '10px' }}>
                  {formatCompactINR(payablesSummary.totalPayable)}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setAccountsSubTab('bankAccounts')}
                style={{
                  border: 'none',
                  background: accountsSubTab === 'bankAccounts' ? 'var(--color-primary)' : 'var(--color-surface)',
                  color: accountsSubTab === 'bankAccounts' ? '#ffffff' : 'var(--color-foreground-muted)',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  padding: '6px 14px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.15s ease',
                }}
              >
                <i className="ti ti-building-bank" />
                <span>Bank Accounts & Ledgers</span>
                <span style={{ padding: '1px 6px', borderRadius: '10px', background: accountsSubTab === 'bankAccounts' ? 'rgba(255,255,255,0.25)' : 'var(--color-surface-raised)', fontSize: '10px' }}>
                  {bankAccounts.length}
                </span>
              </button>
            </div>

            {/* Quick Actions */}
            <div className="financials-subnav-actions" style={{ display: 'flex', gap: '8px' }}>
              {accountsSubTab === 'bankAccounts' && (
                <Button
                  onClick={handleOpenAddBankAccount}
                  style={{
                    height: '32px',
                    fontSize: '11px',
                    fontWeight: 600,
                    background: 'var(--color-primary)',
                    color: '#ffffff',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <i className="ti ti-plus" />
                  Add Bank Account
                </Button>
              )}
              {accountsSubTab === 'payables' && (
                <Button
                  onClick={() => setIsAddPayableOpen(true)}
                  style={{
                    height: '32px',
                    fontSize: '11px',
                    fontWeight: 600,
                    background: 'var(--color-primary)',
                    color: '#ffffff',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <i className="ti ti-plus" />
                  Add Payable Bill
                </Button>
              )}
            </div>
          </div>

          {/* Sub-tab view: Bank Accounts (full-width standalone without Budget Card) vs Receivables/Payables with Budget Grid */}
          {accountsSubTab === 'bankAccounts' ? (
            /* ── BANK ACCOUNTS & INFLOW LEDGERS (Full-Width, No Budget Card) ── */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* 1. BANK ACCOUNTS GRID */}
              <div>
                <div style={{ marginBottom: '12px' }}>
                  <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--color-foreground)', margin: 0 }}>
                    Studio Bank Accounts & Ledgers
                  </h3>
                  <span style={{ fontSize: '12px', color: 'var(--color-foreground-subtle)' }}>
                    Configured settlement accounts for client booking payments and cash custody
                  </span>
                </div>

                {bankAccounts.length === 0 ? (
                  <div
                    style={{
                      background: 'var(--color-surface)',
                      border: '0.5px solid var(--color-border)',
                      borderRadius: '12px',
                      padding: '40px 20px',
                      textAlign: 'center',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '12px',
                    }}
                  >
                    <div
                      style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '12px',
                        background: 'var(--color-surface-raised)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--color-foreground-subtle)',
                      }}
                    >
                      <i className="ti ti-building-bank" style={{ fontSize: '24px' }} />
                    </div>
                    <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-foreground-muted)' }}>
                      No bank accounts configured yet. Add your studio or family bank account to start tracking multi-account collections.
                    </span>
                    <Button
                      onClick={handleOpenAddBankAccount}
                      style={{ height: '34px', fontSize: '12px', background: 'var(--color-primary)', color: '#ffffff' }}
                    >
                      <i className="ti ti-plus" style={{ marginRight: '6px' }} />
                      Add First Bank Account
                    </Button>
                  </div>
                ) : (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                      gap: '14px',
                    }}
                  >
                    {bankAccounts.map((acc) => {
                      const breakdown = cashPosition.bankAccountsBreakdown?.find(
                        (b) => b.bankAccountId === acc.bankAccountId
                      )
                      const thisMonthInflow = breakdown?.monthCollections || 0
                      const totalBalance = breakdown?.balance || (acc.openingBalance || 0)
                      const isSelectedInLedger = bankLedgerFilter === acc.bankAccountId

                      return (
                        <div
                          key={acc.bankAccountId}
                          style={{
                            background: 'var(--color-surface)',
                            border: isSelectedInLedger
                              ? '1.5px solid var(--color-primary)'
                              : '0.5px solid var(--color-border)',
                            borderRadius: '12px',
                            padding: '16px',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            gap: '14px',
                            boxShadow: isSelectedInLedger ? '0 4px 16px rgba(198, 83, 159, 0.15)' : 'none',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <div>
                            {/* Top Bar: Icon, Nickname, Badges */}
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div
                                  style={{
                                    width: '38px',
                                    height: '38px',
                                    borderRadius: '10px',
                                    background: 'var(--color-primary-muted)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: 'var(--color-primary)',
                                    flexShrink: 0,
                                  }}
                                >
                                  <i className="ti ti-building-bank" style={{ fontSize: '20px' }} />
                                </div>
                                <div>
                                  <div style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--color-foreground)', lineHeight: 1.2 }}>
                                    {acc.nickname}
                                  </div>
                                  <div style={{ fontSize: '11px', color: 'var(--color-foreground-subtle)' }}>
                                    {acc.bankName} · {acc.accountNumberMasked}
                                  </div>
                                </div>
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                                {acc.isDefault && (
                                  <span
                                    style={{
                                      padding: '2px 8px',
                                      borderRadius: '10px',
                                      background: 'var(--color-primary-muted)',
                                      color: 'var(--color-primary)',
                                      fontSize: '10px',
                                      fontWeight: 600,
                                    }}
                                  >
                                    Default
                                  </span>
                                )}
                                <span
                                  style={{
                                    padding: '2px 8px',
                                    borderRadius: '10px',
                                    background: 'var(--color-success-muted)',
                                    color: 'var(--color-success)',
                                    fontSize: '10px',
                                    fontWeight: 600,
                                  }}
                                >
                                  Active
                                </span>
                              </div>
                            </div>

                            {/* Details */}
                            <div
                              style={{
                                marginTop: '12px',
                                padding: '10px',
                                borderRadius: '8px',
                                background: 'var(--color-surface-raised)',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '4px',
                                fontSize: '11px',
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: 'var(--color-foreground-subtle)' }}>Holder:</span>
                                <span style={{ fontWeight: 600, color: 'var(--color-foreground)' }}>{acc.accountHolder}</span>
                              </div>
                              {acc.ifsc && (
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                  <span style={{ color: 'var(--color-foreground-subtle)' }}>IFSC:</span>
                                  <span style={{ fontFamily: 'monospace', color: 'var(--color-foreground)' }}>{acc.ifsc}</span>
                                </div>
                              )}
                              {acc.upiId && (
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                  <span style={{ color: 'var(--color-foreground-subtle)' }}>UPI:</span>
                                  <span style={{ color: 'var(--color-foreground)' }}>{acc.upiId}</span>
                                </div>
                              )}
                            </div>

                            {/* KPI numbers */}
                            <div
                              style={{
                                marginTop: '12px',
                                display: 'grid',
                                gridTemplateColumns: '1fr 1fr',
                                gap: '8px',
                              }}
                            >
                              <div
                                style={{
                                  padding: '8px 10px',
                                  borderRadius: '8px',
                                  background: 'var(--color-surface-raised)',
                                  display: 'flex',
                                  flexDirection: 'column',
                                }}
                              >
                                <span style={{ fontSize: '10px', color: 'var(--color-foreground-subtle)', fontWeight: 500 }}>
                                  This Month
                                </span>
                                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-success)', marginTop: '2px' }}>
                                  +{formatINR(thisMonthInflow)}
                                </span>
                              </div>
                              <div
                                style={{
                                  padding: '8px 10px',
                                  borderRadius: '8px',
                                  background: 'var(--color-surface-raised)',
                                  display: 'flex',
                                  flexDirection: 'column',
                                }}
                              >
                                <span style={{ fontSize: '10px', color: 'var(--color-foreground-subtle)', fontWeight: 500 }}>
                                  Total Inflow
                                </span>
                                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-primary)', marginTop: '2px' }}>
                                  {formatINR(totalBalance)}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Card Actions */}
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              borderTop: '0.5px solid var(--color-border)',
                              paddingTop: '10px',
                              gap: '8px',
                            }}
                          >
                            <button
                              type="button"
                              onClick={() =>
                                setBankLedgerFilter(
                                  bankLedgerFilter === acc.bankAccountId ? 'all' : acc.bankAccountId
                                )
                              }
                              style={{
                                border: 'none',
                                background: 'transparent',
                                color: isSelectedInLedger ? 'var(--color-primary)' : 'var(--color-foreground-muted)',
                                fontSize: '11px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: 0,
                              }}
                            >
                              <i className={isSelectedInLedger ? "ti ti-filter-off" : "ti ti-filter"} />
                              {isSelectedInLedger ? 'Clear Filter' : 'Filter Ledger'}
                            </button>

                            <div style={{ display: 'flex', gap: '6px' }}>
                              <button
                                type="button"
                                onClick={() => handleOpenEditBankAccount(acc.bankAccountId)}
                                style={{
                                  border: '0.5px solid var(--color-border)',
                                  background: 'var(--color-surface-raised)',
                                  color: 'var(--color-foreground)',
                                  fontSize: '11px',
                                  padding: '4px 8px',
                                  borderRadius: '6px',
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                }}
                                title="Edit Account Details"
                              >
                                <i className="ti ti-edit" />
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteBankAccount(acc.bankAccountId, acc.nickname)}
                                style={{
                                  border: '0.5px solid var(--color-border)',
                                  background: 'var(--color-surface-raised)',
                                  color: 'var(--color-danger)',
                                  fontSize: '11px',
                                  padding: '4px 8px',
                                  borderRadius: '6px',
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                }}
                                title="Delete Account"
                              >
                                <i className="ti ti-trash" />
                              </button>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* 2. BANK COLLECTIONS & DEPOSIT INFLOW LEDGER */}
              <div
                style={{
                  background: 'var(--color-surface)',
                  border: '0.5px solid var(--color-border)',
                  borderRadius: '12px',
                  padding: '18px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '12px',
                  }}
                >
                  <div>
                    <h4 style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--color-foreground)', margin: 0 }}>
                      Bank Collections & Inflow Ledger
                    </h4>
                    <span style={{ fontSize: '11px', color: 'var(--color-foreground-subtle)' }}>
                      Client booking payments and installments attributed to each deposit account
                    </span>
                  </div>

                  {/* Filter & Action Controls */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    {/* Search */}
                    <div style={{ position: 'relative' }}>
                      <i
                        className="ti ti-search"
                        style={{
                          position: 'absolute',
                          left: '8px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          fontSize: '12px',
                          color: 'var(--color-foreground-subtle)',
                        }}
                      />
                      <Input
                        placeholder="Search client, ref..."
                        value={bankLedgerSearch}
                        onChange={(e) => setBankLedgerSearch(e.target.value)}
                        style={{
                          height: '30px',
                          width: '160px',
                          paddingLeft: '26px',
                          fontSize: '11px',
                        }}
                      />
                    </div>

                    {/* Account Filter Dropdown */}
                    <select
                      value={bankLedgerFilter}
                      onChange={(e) => setBankLedgerFilter(e.target.value)}
                      style={{
                        height: '30px',
                        background: 'var(--color-surface-raised)',
                        border: '0.5px solid var(--color-border)',
                        borderRadius: '6px',
                        padding: '0 8px',
                        fontSize: '11px',
                        color: 'var(--color-foreground)',
                        outline: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      <option value="all">All Accounts</option>
                      {bankAccounts.map((b) => (
                        <option key={b.bankAccountId} value={b.bankAccountId}>
                          {b.nickname}
                        </option>
                      ))}
                    </select>

                    {/* Page Size & Pagination in Header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--color-foreground-muted)' }}>
                        <span>Show</span>
                        <select
                          value={bankLedgerPageSize}
                          onChange={(e) => {
                            setBankLedgerPageSize(Number(e.target.value))
                            setBankLedgerPage(1)
                          }}
                          style={{
                            height: '30px',
                            background: 'var(--color-surface-raised)',
                            border: '0.5px solid var(--color-border)',
                            borderRadius: '6px',
                            padding: '0 6px',
                            fontSize: '11px',
                            color: 'var(--color-foreground)',
                            cursor: 'pointer',
                          }}
                        >
                          <option value={10}>10</option>
                          <option value={25}>25</option>
                          <option value={50}>50</option>
                          <option value={9999}>All</option>
                        </select>
                      </label>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <button
                          type="button"
                          onClick={() => setBankLedgerPage((p) => Math.max(1, p - 1))}
                          disabled={safeBankLedgerPage <= 1}
                          style={{
                            border: '0.5px solid var(--color-border)',
                            background: safeBankLedgerPage <= 1 ? 'transparent' : 'var(--color-surface-raised)',
                            color: safeBankLedgerPage <= 1 ? 'var(--color-foreground-subtle)' : 'var(--color-foreground)',
                            padding: '4px 8px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: safeBankLedgerPage <= 1 ? 'not-allowed' : 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '2px',
                            opacity: safeBankLedgerPage <= 1 ? 0.5 : 1,
                          }}
                        >
                          <i className="ti ti-chevron-left" /> Prev
                        </button>
                        <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-foreground-muted)', padding: '0 4px' }}>
                          {safeBankLedgerPage} / {totalBankLedgerPages}
                        </span>
                        <button
                          type="button"
                          onClick={() => setBankLedgerPage((p) => Math.min(totalBankLedgerPages, p + 1))}
                          disabled={safeBankLedgerPage >= totalBankLedgerPages}
                          style={{
                            border: '0.5px solid var(--color-border)',
                            background: safeBankLedgerPage >= totalBankLedgerPages ? 'transparent' : 'var(--color-surface-raised)',
                            color: safeBankLedgerPage >= totalBankLedgerPages ? 'var(--color-foreground-subtle)' : 'var(--color-foreground)',
                            padding: '4px 8px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: safeBankLedgerPage >= totalBankLedgerPages ? 'not-allowed' : 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '2px',
                            opacity: safeBankLedgerPage >= totalBankLedgerPages ? 0.5 : 1,
                          }}
                        >
                          Next <i className="ti ti-chevron-right" />
                        </button>
                      </div>
                    </div>

                    {/* Filter Count & Total Badge */}
                    <span
                      style={{
                        padding: '4px 10px',
                        borderRadius: '6px',
                        background: 'var(--color-surface-raised)',
                        fontSize: '11px',
                        color: 'var(--color-foreground-muted)',
                      }}
                    >
                      {bankLedgerPayments.length} entries ·{' '}
                      <strong style={{ color: 'var(--color-success)' }}>{formatINR(totalFilteredBankAmount)}</strong>
                    </span>

                    {/* Export Statement CSV */}
                    <button
                      type="button"
                      onClick={handleExportBankStatement}
                      style={{
                        border: '0.5px solid var(--color-border)',
                        background: 'var(--color-surface-raised)',
                        color: 'var(--color-foreground)',
                        fontSize: '11px',
                        fontWeight: 600,
                        padding: '6px 10px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                      title="Export statement of current filtered ledger"
                    >
                      <i className="ti ti-download" style={{ fontSize: '13px' }} />
                      <span>Export CSV</span>
                    </button>
                  </div>
                </div>

                {/* Desktop Table View */}
                <div className="hidden md:block" style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--text-xs)' }}>
                    <thead>
                      <tr style={{ borderBottom: '0.5px solid var(--color-border-strong)', color: 'var(--color-foreground-subtle)' }}>
                        <th style={{ padding: '8px 10px', fontWeight: 600 }}>Date</th>
                        <th style={{ padding: '8px 10px', fontWeight: 600 }}>Client & Project</th>
                        <th style={{ padding: '8px 10px', fontWeight: 600 }}>Instalment</th>
                        <th style={{ padding: '8px 10px', fontWeight: 600 }}>Method</th>
                        <th style={{ padding: '8px 10px', fontWeight: 600 }}>Deposit Account</th>
                        <th style={{ padding: '8px 10px', fontWeight: 600 }}>Txn / UTR Ref</th>
                        <th style={{ padding: '8px 10px', fontWeight: 600, textAlign: 'right' }}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedBankLedgerPayments.length === 0 ? (
                        <tr>
                          <td colSpan={7} style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--color-foreground-subtle)' }}>
                            No client payment records found matching the current filters.
                          </td>
                        </tr>
                      ) : (
                        paginatedBankLedgerPayments.map((p) => {
                          const dateFormatted =
                            p.date instanceof Date
                              ? p.date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                              : '—'
                          const c = clients.find((cl) => cl.clientId === p.clientId)

                          return (
                            <tr
                              key={p.paymentId}
                              style={{
                                borderBottom: '0.5px solid var(--color-border)',
                                transition: 'background 0.15s ease',
                              }}
                            >
                              <td style={{ padding: '10px', color: 'var(--color-foreground-muted)', whiteSpace: 'nowrap' }}>
                                {dateFormatted}
                              </td>
                              <td style={{ padding: '10px' }}>
                                <div style={{ fontWeight: 600, color: 'var(--color-foreground)' }}>
                                  {c?.name || 'Client'}
                                </div>
                                <div style={{ fontSize: '11px', color: 'var(--color-foreground-subtle)' }}>
                                  {c?.eventName || 'Booking'}
                                </div>
                              </td>
                              <td style={{ padding: '10px', color: 'var(--color-foreground)' }}>
                                {p.instalment || 'Payment'}
                              </td>
                              <td style={{ padding: '10px' }}>
                                <span
                                  style={{
                                    padding: '2px 8px',
                                    borderRadius: '4px',
                                    background: 'var(--color-surface-raised)',
                                    fontSize: '11px',
                                    color: 'var(--color-foreground-muted)',
                                  }}
                                >
                                  {p.method}
                                </span>
                              </td>
                              <td style={{ padding: '10px' }}>
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    padding: '2px 8px',
                                    borderRadius: '6px',
                                    background: 'var(--color-surface-raised)',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    color: 'var(--color-foreground)'
                                  }}
                                >
                                  <i className="ti ti-building-bank" style={{ color: 'var(--color-primary)' }} />
                                  {p.bankAccountName || 'Direct / Studio'}
                                </span>
                              </td>
                              <td style={{ padding: '10px', fontFamily: 'monospace', fontSize: '11px', color: 'var(--color-foreground-muted)' }}>
                                {p.transactionId || '—'}
                              </td>
                              <td style={{ padding: '10px', textAlign: 'right', fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--color-success)', whiteSpace: 'nowrap' }}>
                                +{formatINR(p.amount || 0)}
                              </td>
                            </tr>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Compact Cards View (< 768px) - Uses financials-mobile-cards to prevent desktop merging */}
                <div className="financials-mobile-cards">
                  {paginatedBankLedgerPayments.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '24px 12px', color: 'var(--color-foreground-subtle)', fontSize: '12px' }}>
                      No payment records found.
                    </div>
                  ) : (
                    paginatedBankLedgerPayments.map((p) => {
                      const dateFormatted =
                        p.date instanceof Date
                          ? p.date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
                          : '—'
                      const c = clients.find((cl) => cl.clientId === p.clientId)

                      return (
                        <div
                          key={p.paymentId}
                          style={{
                            background: 'var(--color-surface-raised)',
                            border: '0.5px solid var(--color-border)',
                            borderRadius: '8px',
                            padding: '10px 12px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '6px',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '11px', color: 'var(--color-foreground-subtle)' }}>
                              {dateFormatted} · {p.method}
                            </span>
                            <span style={{ fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--color-success)' }}>
                              +{formatINR(p.amount || 0)}
                            </span>
                          </div>
                          <div style={{ fontWeight: 600, fontSize: 'var(--text-xs)', color: 'var(--color-foreground)' }}>
                            {c?.name || 'Client'} {c?.eventName ? `(${c.eventName})` : ''}
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px' }}>
                            <span style={{ color: 'var(--color-foreground-subtle)' }}>{p.instalment || 'Payment'}</span>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                color: 'var(--color-primary)',
                                fontWeight: 600,
                              }}
                            >
                              <i className="ti ti-building-bank" />
                              {p.bankAccountName || 'Direct'}
                            </span>
                          </div>
                          {p.transactionId && (
                            <div style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--color-foreground-subtle)' }}>
                              Ref: {p.transactionId}
                            </div>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>

                {/* Pagination Footer Bar */}
                {bankLedgerPayments.length > 0 && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderTop: '0.5px solid var(--color-border)',
                      paddingTop: '12px',
                      flexWrap: 'wrap',
                      gap: '8px',
                      fontSize: '11px',
                      color: 'var(--color-foreground-subtle)',
                    }}
                  >
                    <div>
                      Showing{' '}
                      <strong style={{ color: 'var(--color-foreground)' }}>
                        {(safeBankLedgerPage - 1) * bankLedgerPageSize + 1}
                      </strong>
                      –
                      <strong style={{ color: 'var(--color-foreground)' }}>
                        {Math.min(safeBankLedgerPage * bankLedgerPageSize, bankLedgerPayments.length)}
                      </strong>{' '}
                      of <strong style={{ color: 'var(--color-foreground)' }}>{bankLedgerPayments.length}</strong> transactions
                    </div>

                    {totalBankLedgerPages > 1 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <button
                          type="button"
                          onClick={() => setBankLedgerPage((p) => Math.max(1, p - 1))}
                          disabled={safeBankLedgerPage <= 1}
                          style={{
                            border: '0.5px solid var(--color-border)',
                            background: safeBankLedgerPage <= 1 ? 'transparent' : 'var(--color-surface-raised)',
                            color: safeBankLedgerPage <= 1 ? 'var(--color-foreground-subtle)' : 'var(--color-foreground)',
                            padding: '4px 10px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: safeBankLedgerPage <= 1 ? 'not-allowed' : 'pointer',
                            opacity: safeBankLedgerPage <= 1 ? 0.5 : 1,
                          }}
                        >
                          &larr; Previous
                        </button>
                        <span style={{ fontWeight: 600, color: 'var(--color-foreground)' }}>
                          Page {safeBankLedgerPage} of {totalBankLedgerPages}
                        </span>
                        <button
                          type="button"
                          onClick={() => setBankLedgerPage((p) => Math.min(totalBankLedgerPages, p + 1))}
                          disabled={safeBankLedgerPage >= totalBankLedgerPages}
                          style={{
                            border: '0.5px solid var(--color-border)',
                            background: safeBankLedgerPage >= totalBankLedgerPages ? 'transparent' : 'var(--color-surface-raised)',
                            color: safeBankLedgerPage >= totalBankLedgerPages ? 'var(--color-foreground-subtle)' : 'var(--color-foreground)',
                            padding: '4px 10px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: safeBankLedgerPage >= totalBankLedgerPages ? 'not-allowed' : 'pointer',
                            opacity: safeBankLedgerPage >= totalBankLedgerPages ? 0.5 : 1,
                          }}
                        >
                          Next &rarr;
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Two-Column Grid: Budget vs Actuals & Receivables/Payables */
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr)',
                gap: '16px',
                width: '100%',
                maxWidth: '100%',
                minWidth: 0,
                boxSizing: 'border-box',
              }}
              className="accounts-tables-grid"
            >
            {/* 1. Budget vs Actuals Card */}
            <div
              style={{
                background: 'var(--color-surface)',
                border: '0.5px solid var(--color-border)',
                borderRadius: '12px',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div
                style={{
                  padding: '14px 18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderBottom: '0.5px solid var(--color-border)',
                  flexWrap: 'wrap',
                  gap: '8px',
                }}
              >
                <div>
                  <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 600, margin: 0, color: 'var(--color-foreground)' }}>
                    Budget vs Actuals · {currentMonthSummary.fullMonthLabel}
                  </h3>
                  <span style={{ fontSize: '11px', color: 'var(--color-foreground-subtle)' }}>
                    Spending limits vs realized burn
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={handleCopyPreviousBudgets}
                    disabled={copyingBudgets}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '5px 10px',
                      borderRadius: '6px',
                      background: 'var(--color-surface-raised)',
                      border: '0.5px solid var(--color-border)',
                      color: 'var(--color-foreground-muted)',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: copyingBudgets ? 'not-allowed' : 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                    title="Clone budget targets from previous month"
                  >
                    <i className={copyingBudgets ? 'ti ti-loader animate-spin' : 'ti ti-copy'} style={{ fontSize: '12px' }} />
                    <span>{copyingBudgets ? 'Copying...' : 'Copy Last Month'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowAddCategoryModal(true)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '5px 10px',
                      borderRadius: '6px',
                      background: 'var(--color-primary)',
                      border: 'none',
                      color: '#ffffff',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'opacity 0.15s ease',
                    }}
                  >
                    <i className="ti ti-plus" style={{ fontSize: '12px' }} />
                    <span>Add Category</span>
                  </button>

                  {overBudgetCount > 0 && (
                    <span style={{ fontSize: '11px', fontWeight: 600, padding: '3px 8px', borderRadius: '10px', background: 'var(--color-danger-muted)', color: 'var(--color-danger)' }}>
                      {overBudgetCount} over budget
                    </span>
                  )}
                  {nearLimitCount > 0 && (
                    <span style={{ fontSize: '11px', fontWeight: 600, padding: '3px 8px', borderRadius: '10px', background: 'var(--color-secondary-muted)', color: 'var(--color-secondary)' }}>
                      {nearLimitCount} near limit
                    </span>
                  )}
                  {overBudgetCount === 0 && nearLimitCount === 0 && (
                    <span style={{ fontSize: '11px', fontWeight: 600, padding: '3px 8px', borderRadius: '10px', background: 'var(--color-success-muted)', color: 'var(--color-success)' }}>
                      All on track
                    </span>
                  )}
                </div>
              </div>

              {/* Budget Alerts Banner for >= 85% or >= 100% */}
              {budgetAlerts.length > 0 && (
                <div
                  style={{
                    padding: '10px 18px',
                    background: 'var(--color-surface-raised)',
                    borderBottom: '0.5px solid var(--color-border)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 700, color: 'var(--color-foreground)' }}>
                    <i className="ti ti-alert-triangle" style={{ fontSize: '14px', color: 'var(--color-secondary)' }} />
                    <span>Budget Alerts &amp; Threshold Notifications ({budgetAlerts.length})</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {budgetAlerts.map((alert) => (
                      <span
                        key={alert.category}
                        style={{
                          fontSize: '11px',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          background: alert.severity === 'danger' ? 'var(--color-danger-muted)' : 'var(--color-secondary-muted)',
                          color: alert.severity === 'danger' ? 'var(--color-danger)' : 'var(--color-secondary)',
                          fontWeight: 600,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <span>{alert.label}:</span>
                        <span>{Math.round(alert.percentUsed)}%</span>
                        {alert.excessAmount > 0 && (
                          <span style={{ opacity: 0.9 }}>
                            (+{formatINR(alert.excessAmount)})
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Desktop Table View */}
              <div className="financials-desktop-table" style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-foreground-subtle)', padding: '10px 16px', borderBottom: '0.5px solid var(--color-border-strong)' }}>
                        Category
                      </th>
                      <th style={{ textAlign: 'right', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-foreground-subtle)', padding: '10px 12px', borderBottom: '0.5px solid var(--color-border-strong)' }}>
                        Budget
                      </th>
                      <th style={{ textAlign: 'right', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-foreground-subtle)', padding: '10px 12px', borderBottom: '0.5px solid var(--color-border-strong)' }}>
                        Actual
                      </th>
                      <th style={{ textAlign: 'right', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-foreground-subtle)', padding: '10px 12px', borderBottom: '0.5px solid var(--color-border-strong)' }}>
                        Variance
                      </th>
                      <th style={{ textAlign: 'left', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-foreground-subtle)', padding: '10px 16px', borderBottom: '0.5px solid var(--color-border-strong)' }}>
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {budgetRows.map((b) => (
                      <tr key={b.category} style={{ borderBottom: '0.5px solid var(--color-border)' }}>
                        <td style={{ padding: '10px 16px', fontWeight: 600, color: 'var(--color-foreground)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                            <button
                              type="button"
                              onClick={() => setDrillCategory(b)}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                padding: 0,
                                color: 'inherit',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                textAlign: 'left',
                              }}
                              title="Click to drill into expenses"
                            >
                              <i className={`ti ${b.icon}`} style={{ fontSize: '14px', color: 'var(--color-foreground-subtle)' }} />
                              <span style={{ textDecoration: 'underline', textDecorationStyle: 'dotted' }}>{b.label}</span>
                              {b.isCustom && (
                                <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '4px', background: 'var(--color-primary-muted)', color: 'var(--color-primary)', fontWeight: 600, letterSpacing: '0.02em' }}>
                                  Custom
                                </span>
                              )}
                            </button>
                            {b.isCustom && b.customCategoryId && (
                              <button
                                type="button"
                                onClick={() => handleDeleteCustomCategory(b.customCategoryId!, b.label)}
                                title={`Delete custom category "${b.label}"`}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  color: 'var(--color-danger)',
                                  cursor: 'pointer',
                                  padding: '2px 4px',
                                  fontSize: '13px',
                                  opacity: 0.65,
                                  transition: 'opacity 0.15s ease',
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                                onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.65')}
                              >
                                <i className="ti ti-trash" />
                              </button>
                            )}
                          </div>
                        </td>

                        <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--color-foreground-muted)' }}>
                          <span style={{ fontWeight: 500 }}>{formatINR(b.budget)}</span>
                          <button
                            type="button"
                            onClick={() => handleOpenBudgetEdit(b.category, b.budget)}
                            style={{
                              marginLeft: '6px',
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--color-accent)',
                              fontSize: '11px',
                              cursor: 'pointer',
                              fontWeight: 600,
                              textDecoration: 'underline',
                            }}
                          >
                            edit
                          </button>
                        </td>

                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: 'var(--color-foreground)' }}>
                          {formatINR(b.actual)}
                        </td>

                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: b.varColor }}>
                          {b.variance < 0 ? `−${formatINR(Math.abs(b.variance))}` : `+${formatINR(b.variance)}`}
                        </td>

                        <td style={{ padding: '10px 16px' }}>
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: 600,
                              padding: '2px 8px',
                              borderRadius: '8px',
                              background: b.badgeBg,
                              color: b.badgeFg,
                              display: 'inline-block',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {b.statusLabel} ({b.percentUsed}%)
                          </span>
                        </td>
                      </tr>
                    ))}

                    {/* Table Totals Row */}
                    <tr style={{ background: 'var(--color-surface-raised)' }}>
                      <td style={{ padding: '10px 16px', fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-foreground-subtle)' }}>
                        Total Budget vs Burn
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--color-foreground-muted)' }}>
                        {formatINR(totalBudget)}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--color-foreground)' }}>
                        {formatINR(totalActual)}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: totalVariance >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                        {totalVariance < 0 ? `−${formatINR(Math.abs(totalVariance))}` : `+${formatINR(totalVariance)}`}
                      </td>
                      <td style={{ padding: '10px 16px', fontSize: '11px', fontWeight: 600, color: 'var(--color-foreground-subtle)' }}>
                        {Math.round((totalActual / Math.max(1, totalBudget)) * 100)}% utilized
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Mobile Card Transformation View */}
              <div className="financials-mobile-cards">
                {budgetRows.map((b) => (
                  <div
                    key={b.category}
                    style={{
                      background: 'var(--color-surface-raised)',
                      border: '0.5px solid var(--color-border)',
                      borderRadius: '8px',
                      padding: '12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <i className={`ti ${b.icon}`} style={{ fontSize: '15px', color: 'var(--color-primary)' }} />
                        <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-foreground)' }}>
                          {b.label}
                        </span>
                        {b.isCustom && (
                          <span style={{ fontSize: '9px', padding: '1px 4px', borderRadius: '4px', background: 'var(--color-primary-muted)', color: 'var(--color-primary)', fontWeight: 600 }}>
                            Custom
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: '6px',
                            background: b.badgeBg,
                            color: b.badgeFg,
                          }}
                        >
                          {b.statusLabel} ({b.percentUsed}%)
                        </span>
                        {b.isCustom && b.customCategoryId && (
                          <button
                            type="button"
                            onClick={() => handleDeleteCustomCategory(b.customCategoryId!, b.label)}
                            title={`Delete custom category "${b.label}"`}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--color-danger)',
                              cursor: 'pointer',
                              padding: '2px',
                              fontSize: '13px',
                            }}
                          >
                            <i className="ti ti-trash" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px', textAlign: 'center', background: 'var(--color-surface)', padding: '6px', borderRadius: '6px' }}>
                      <div>
                        <div style={{ fontSize: '10px', color: 'var(--color-foreground-subtle)' }}>Budget</div>
                        <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600 }}>{formatINR(b.budget)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '10px', color: 'var(--color-foreground-subtle)' }}>Actual</div>
                        <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600 }}>{formatINR(b.actual)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '10px', color: 'var(--color-foreground-subtle)' }}>Variance</div>
                        <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: b.varColor }}>
                          {b.variance < 0 ? `−${formatINR(Math.abs(b.variance))}` : `+${formatINR(b.variance)}`}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <button
                        type="button"
                        onClick={() => setDrillCategory(b)}
                        style={{ background: 'transparent', border: 'none', color: 'var(--color-foreground-muted)', fontSize: '11px', cursor: 'pointer' }}
                      >
                        <i className="ti ti-list" /> View Expenses
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenBudgetEdit(b.category, b.budget)}
                        style={{ background: 'transparent', border: 'none', color: 'var(--color-accent)', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
                      >
                        <i className="ti ti-edit" /> Edit Budget
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 2. Receivables Aging OR Payables Card */}
            {accountsSubTab === 'receivables' ? (
              /* RECEIVABLES AGING CARD */
              <div
                style={{
                  background: 'var(--color-surface)',
                  border: '0.5px solid var(--color-border)',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                {/* Header & Aging Buckets Strip */}
                <div style={{ padding: '14px 18px', borderBottom: '0.5px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                    <div>
                      <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 600, margin: 0, color: 'var(--color-foreground)' }}>
                        Receivables Aging Ledger
                      </h3>
                      <span style={{ fontSize: '11px', color: 'var(--color-foreground-subtle)' }}>
                        Track overdue invoices and take direct settlement actions
                      </span>
                    </div>

                    {/* Search */}
                    <div className="financials-search-box" style={{ position: 'relative' }}>
                      <i className="ti ti-search" style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', fontSize: '12px', color: 'var(--color-foreground-subtle)' }} />
                      <input
                        type="text"
                        placeholder="Search client/invoice..."
                        value={receivableSearch}
                        onChange={(e) => setReceivableSearch(e.target.value)}
                        className="financials-search-box"
                        style={{
                          height: '28px',
                          padding: '0 8px 0 26px',
                          borderRadius: '6px',
                          background: 'var(--color-surface-raised)',
                          border: '0.5px solid var(--color-border)',
                          fontSize: '11px',
                          color: 'var(--color-foreground)',
                          outline: 'none',
                          width: '140px',
                        }}
                      />
                    </div>
                  </div>

                  {/* Aging Buckets Filter Pills */}
                  <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '2px' }}>
                    <button
                      type="button"
                      onClick={() => setAgingFilter('all')}
                      style={{
                        border: 'none',
                        background: agingFilter === 'all' ? 'var(--color-surface-raised)' : 'transparent',
                        color: agingFilter === 'all' ? 'var(--color-foreground)' : 'var(--color-foreground-subtle)',
                        fontSize: '11px',
                        fontWeight: 600,
                        padding: '3px 8px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      All ({outstandingReceivables.length})
                    </button>

                    <button
                      type="button"
                      onClick={() => setAgingFilter('current')}
                      style={{
                        border: 'none',
                        background: agingFilter === 'current' ? 'var(--color-success-muted)' : 'transparent',
                        color: agingFilter === 'current' ? 'var(--color-success)' : 'var(--color-foreground-subtle)',
                        fontSize: '11px',
                        fontWeight: 600,
                        padding: '3px 8px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      0-30d ({receivablesAgingSummary.current.count} · {formatCompactINR(receivablesAgingSummary.current.total)})
                    </button>

                    <button
                      type="button"
                      onClick={() => setAgingFilter('31-60')}
                      style={{
                        border: 'none',
                        background: agingFilter === '31-60' ? 'var(--color-secondary-muted)' : 'transparent',
                        color: agingFilter === '31-60' ? 'var(--color-secondary)' : 'var(--color-foreground-subtle)',
                        fontSize: '11px',
                        fontWeight: 600,
                        padding: '3px 8px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      31-60d ({receivablesAgingSummary.aging31to60.count} · {formatCompactINR(receivablesAgingSummary.aging31to60.total)})
                    </button>

                    <button
                      type="button"
                      onClick={() => setAgingFilter('60+')}
                      style={{
                        border: 'none',
                        background: agingFilter === '60+' ? 'var(--color-danger-muted)' : 'transparent',
                        color: agingFilter === '60+' ? 'var(--color-danger)' : 'var(--color-foreground-subtle)',
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '3px 8px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      60d+ Urgent ({receivablesAgingSummary.aging60plus.count} · {formatCompactINR(receivablesAgingSummary.aging60plus.total)})
                    </button>
                  </div>
                </div>

                {/* Desktop Receivables Table */}
                <div className="financials-desktop-table" style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '490px', flex: 1 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
                    <thead style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--color-surface)' }}>
                      <tr>
                        <th style={{ textAlign: 'left', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-foreground-subtle)', padding: '10px 14px', borderBottom: '0.5px solid var(--color-border-strong)' }}>
                          Client &amp; Event
                        </th>
                        <th style={{ textAlign: 'right', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-foreground-subtle)', padding: '10px 10px', borderBottom: '0.5px solid var(--color-border-strong)' }}>
                          Balance Due
                        </th>
                        <th style={{ textAlign: 'center', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-foreground-subtle)', padding: '10px 12px', borderBottom: '0.5px solid var(--color-border-strong)', whiteSpace: 'nowrap', width: '120px' }}>
                          Aging
                        </th>
                        <th style={{ textAlign: 'right', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-foreground-subtle)', padding: '10px 14px', borderBottom: '0.5px solid var(--color-border-strong)' }}>
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredReceivables.length === 0 ? (
                        <tr>
                          <td colSpan={4} style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--color-foreground-subtle)' }}>
                            No outstanding invoices in this aging bucket.
                          </td>
                        </tr>
                      ) : (
                        paginatedReceivables.map((r) => {
                          const isHighRisk = r.agingBucket === '60+'
                          const isMedium = r.agingBucket === '31-60'
                          const isReminderDateValid = Boolean(r.lastRemindedAt && !isNaN(r.lastRemindedAt.getTime()))

                          return (
                            <tr key={r.id} style={{ background: 'transparent', borderBottom: '0.5px solid var(--color-border)' }}>
                              <td style={{ padding: '8px 14px' }}>
                                <Link href={`/clients/${r.clientId}`} style={{ textDecoration: 'none', color: 'inherit', display: 'flex', flexDirection: 'column' }}>
                                  <span style={{ fontWeight: 600, color: 'var(--color-foreground)' }}>{r.clientName}</span>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px', flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '11px', color: 'var(--color-foreground-subtle)' }}>
                                      {r.invoiceNumber} · {r.eventName}
                                    </span>
                                    {r.reminderCount && r.reminderCount > 0 ? (
                                      <span
                                        style={{
                                          fontSize: '10px',
                                          padding: '1px 5px',
                                          borderRadius: '4px',
                                          background: 'var(--color-primary-muted)',
                                          color: 'var(--color-primary)',
                                          fontWeight: 600,
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '3px',
                                        }}
                                        title={isReminderDateValid ? `Last sent ${r.lastRemindedAt!.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} via ${r.lastReminderMethod || 'message'}` : undefined}
                                      >
                                        <i className="ti ti-bell-ringing" style={{ fontSize: '10px' }} />
                                        Reminded {r.reminderCount}x
                                        {isReminderDateValid && (
                                          <span style={{ opacity: 0.8, fontWeight: 400 }}>
                                            ({r.lastRemindedAt!.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })})
                                          </span>
                                        )}
                                      </span>
                                    ) : (
                                      <span style={{ fontSize: '10px', color: 'var(--color-foreground-subtle)' }}>
                                        · No reminder
                                      </span>
                                    )}
                                  </div>
                                </Link>
                              </td>

                              <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap', color: isHighRisk ? 'var(--color-danger)' : 'var(--color-foreground)' }}>
                                {formatINR(r.balanceDue)}
                              </td>

                              <td style={{ padding: '8px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                <Badge
                                   variant={isHighRisk ? 'overdue' : isMedium ? 'partial' : 'paid'}
                                   label={r.daysPastDue > 0 ? `${r.daysPastDue}d overdue` : 'Current'}
                                />
                              </td>

                              <td style={{ padding: '8px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                                  <button
                                    type="button"
                                    onClick={() => setPaymentTarget(r)}
                                    style={{
                                      border: 'none',
                                      background: 'var(--color-success)',
                                      color: '#ffffff',
                                      fontSize: '11px',
                                      fontWeight: 600,
                                      padding: '3px 8px',
                                      borderRadius: '5px',
                                      cursor: 'pointer',
                                    }}
                                    title="Record payment receipt"
                                  >
                                    Pay
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setReminderTarget(r)}
                                    style={{
                                      border: '0.5px solid var(--color-border)',
                                      background: 'var(--color-surface)',
                                      color: 'var(--color-foreground)',
                                      fontSize: '11px',
                                      fontWeight: 600,
                                      padding: '3px 8px',
                                      borderRadius: '5px',
                                      cursor: 'pointer',
                                    }}
                                    title="Send WhatsApp or Email reminder"
                                  >
                                    Remind
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )
                        })
                      )}

                      {/* Sticky Footer Total Row */}
                      <tr style={{ background: 'var(--color-surface-raised)', position: 'sticky', bottom: 0, zIndex: 1 }}>
                        <td style={{ padding: '8px 14px', fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-foreground-subtle)' }}>
                          {agingFilter !== 'all' || receivableSearch.trim() ? 'Filtered Total' : 'Total Receivables'}
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: 'var(--color-secondary)', fontSize: 'var(--text-sm)' }}>
                          {formatINR(displayedReceivablesTotal)}
                        </td>
                        <td colSpan={2} style={{ padding: '8px 14px', textAlign: 'right', fontSize: '11px', color: 'var(--color-foreground-subtle)' }}>
                          {filteredReceivables.length} accounts {agingFilter !== 'all' || receivableSearch.trim() ? 'matching' : 'pending'}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Receivables Pagination Bar */}
                <div
                  style={{
                    padding: '8px 14px',
                    borderTop: '0.5px solid var(--color-border)',
                    background: 'var(--color-surface)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '8px',
                    fontSize: 'var(--text-xs)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-foreground-muted)' }}>
                    <span>
                      Showing{' '}
                      <strong style={{ color: 'var(--color-foreground)' }}>
                        {filteredReceivables.length === 0 ? 0 : (safeReceivablePage - 1) * receivablePageSize + 1}
                      </strong>
                      –
                      <strong style={{ color: 'var(--color-foreground)' }}>
                        {Math.min(safeReceivablePage * receivablePageSize, filteredReceivables.length)}
                      </strong>{' '}
                      of{' '}
                      <strong style={{ color: 'var(--color-foreground)' }}>
                        {filteredReceivables.length}
                      </strong>
                    </span>
                    <span style={{ color: 'var(--color-border)' }}>|</span>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}>
                      Show:
                      <select
                        value={receivablePageSize}
                        onChange={(e) => {
                          setReceivablePageSize(Number(e.target.value))
                          setReceivablePage(1)
                        }}
                        style={{
                          height: '24px',
                          padding: '0 4px',
                          borderRadius: '4px',
                          background: 'var(--color-surface-raised)',
                          border: '0.5px solid var(--color-border)',
                          color: 'var(--color-foreground)',
                          fontSize: '11px',
                          fontWeight: 600,
                          outline: 'none',
                          cursor: 'pointer',
                        }}
                      >
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                        <option value={50}>50</option>
                        <option value={9999}>All</option>
                      </select>
                    </label>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button
                      type="button"
                      onClick={() => setReceivablePage((p) => Math.max(1, p - 1))}
                      disabled={safeReceivablePage <= 1}
                      style={{
                        border: '0.5px solid var(--color-border)',
                        background: safeReceivablePage <= 1 ? 'transparent' : 'var(--color-surface-raised)',
                        color: safeReceivablePage <= 1 ? 'var(--color-foreground-subtle)' : 'var(--color-foreground)',
                        padding: '3px 8px',
                        borderRadius: '5px',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: safeReceivablePage <= 1 ? 'not-allowed' : 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '2px',
                        opacity: safeReceivablePage <= 1 ? 0.5 : 1,
                      }}
                    >
                      <i className="ti ti-chevron-left" /> Prev
                    </button>

                    <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-foreground-muted)', padding: '0 4px' }}>
                      {safeReceivablePage} / {totalReceivablePages}
                    </span>

                    <button
                      type="button"
                      onClick={() => setReceivablePage((p) => Math.min(totalReceivablePages, p + 1))}
                      disabled={safeReceivablePage >= totalReceivablePages}
                      style={{
                        border: '0.5px solid var(--color-border)',
                        background: safeReceivablePage >= totalReceivablePages ? 'transparent' : 'var(--color-surface-raised)',
                        color: safeReceivablePage >= totalReceivablePages ? 'var(--color-foreground-subtle)' : 'var(--color-foreground)',
                        padding: '3px 8px',
                        borderRadius: '5px',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: safeReceivablePage >= totalReceivablePages ? 'not-allowed' : 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '2px',
                        opacity: safeReceivablePage >= totalReceivablePages ? 0.5 : 1,
                      }}
                    >
                      Next <i className="ti ti-chevron-right" />
                    </button>
                  </div>
                </div>

                {/* Mobile Receivables Cards */}
                <div className="financials-mobile-cards">
                  {paginatedReceivables.map((r) => {
                    const isReminderDateValid = Boolean(r.lastRemindedAt && !isNaN(r.lastRemindedAt.getTime()))
                    return (
                      <div
                        key={r.id}
                        style={{
                          background: r.agingBucket === '60+' ? 'var(--color-danger-muted)' : 'var(--color-surface-raised)',
                          border: `0.5px solid ${r.agingBucket === '60+' ? 'var(--color-danger)' : 'var(--color-border)'}`,
                          borderRadius: '8px',
                          padding: '12px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-foreground)' }}>
                            {r.clientName}
                          </span>
                          <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: r.agingBucket === '60+' ? 'var(--color-danger)' : 'var(--color-foreground)' }}>
                            {formatINR(r.balanceDue)}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: 'var(--color-foreground-subtle)' }}>
                          <span>{r.invoiceNumber} · {r.eventName}</span>
                          <Badge
                            variant={r.agingBucket === '60+' ? 'overdue' : r.agingBucket === '31-60' ? 'partial' : 'paid'}
                            label={r.daysPastDue > 0 ? `${r.daysPastDue}d overdue` : 'Current'}
                          />
                        </div>
                        {r.reminderCount && r.reminderCount > 0 ? (
                          <div style={{ fontSize: '10px', color: 'var(--color-primary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <i className="ti ti-bell-ringing" style={{ fontSize: '11px' }} />
                            Reminded {r.reminderCount}x
                            {isReminderDateValid && ` · ${r.lastRemindedAt!.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} via ${r.lastReminderMethod || 'message'}`}
                          </div>
                        ) : (
                          <div style={{ fontSize: '10px', color: 'var(--color-foreground-subtle)' }}>
                            No reminder sent yet
                          </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
                          <Button
                            size="sm"
                            onClick={() => setPaymentTarget(r)}
                            style={{ height: '28px', fontSize: '11px', background: 'var(--color-success)', color: '#ffffff' }}
                          >
                            Record Payment
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setReminderTarget(r)}
                            style={{ height: '28px', fontSize: '11px' }}
                          >
                            Send Reminder
                          </Button>
                        </div>
                      </div>
                    )
                  })}

                  {/* Mobile Pagination Controls */}
                  {totalReceivablePages > 1 && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderTop: '0.5px solid var(--color-border)', fontSize: '11px' }}>
                      <span style={{ color: 'var(--color-foreground-muted)' }}>
                        Page {safeReceivablePage} of {totalReceivablePages} ({filteredReceivables.length})
                      </span>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          type="button"
                          onClick={() => setReceivablePage((p) => Math.max(1, p - 1))}
                          disabled={safeReceivablePage <= 1}
                          style={{
                            padding: '4px 10px',
                            borderRadius: '5px',
                            border: '0.5px solid var(--color-border)',
                            background: 'var(--color-surface-raised)',
                            color: 'var(--color-foreground)',
                            cursor: safeReceivablePage <= 1 ? 'not-allowed' : 'pointer',
                            opacity: safeReceivablePage <= 1 ? 0.5 : 1,
                          }}
                        >
                          Prev
                        </button>
                        <button
                          type="button"
                          onClick={() => setReceivablePage((p) => Math.min(totalReceivablePages, p + 1))}
                          disabled={safeReceivablePage >= totalReceivablePages}
                          style={{
                            padding: '4px 10px',
                            borderRadius: '5px',
                            border: '0.5px solid var(--color-border)',
                            background: 'var(--color-surface-raised)',
                            color: 'var(--color-foreground)',
                            cursor: safeReceivablePage >= totalReceivablePages ? 'not-allowed' : 'pointer',
                            opacity: safeReceivablePage >= totalReceivablePages ? 0.5 : 1,
                          }}
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* ACCOUNTS PAYABLE (MONEY WE OWE) CARD */
              <div
                style={{
                  background: 'var(--color-surface)',
                  border: '0.5px solid var(--color-border)',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <div style={{ padding: '14px 18px', borderBottom: '0.5px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                  <div>
                    <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 600, margin: 0, color: 'var(--color-foreground)' }}>
                      Accounts Payable (Money We Owe)
                    </h3>
                    <span style={{ fontSize: '11px', color: 'var(--color-foreground-subtle)' }}>
                      Pending vendor bills, freelancer fees, and studio rent
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    {/* Search */}
                    <div style={{ position: 'relative' }}>
                      <i className="ti ti-search" style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', fontSize: '12px', color: 'var(--color-foreground-subtle)' }} />
                      <input
                        type="text"
                        placeholder="Search vendor/bill..."
                        value={payableSearch}
                        onChange={(e) => setPayableSearch(e.target.value)}
                        style={{
                          height: '28px',
                          padding: '0 8px 0 26px',
                          fontSize: '11px',
                          background: 'var(--color-surface-raised)',
                          border: '0.5px solid var(--color-border)',
                          borderRadius: '6px',
                          color: 'var(--color-foreground)',
                          outline: 'none',
                          width: '140px',
                        }}
                      />
                    </div>

                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button
                        type="button"
                        onClick={() => setPayableStatusFilter('all')}
                        style={{
                          border: 'none',
                          background: payableStatusFilter === 'all' ? 'var(--color-surface-raised)' : 'transparent',
                          color: payableStatusFilter === 'all' ? 'var(--color-foreground)' : 'var(--color-foreground-subtle)',
                          fontSize: '11px',
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: '4px',
                          cursor: 'pointer',
                        }}
                      >
                        All ({payables.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setPayableStatusFilter('pending')}
                        style={{
                          border: 'none',
                          background: payableStatusFilter === 'pending' ? 'var(--color-secondary-muted)' : 'transparent',
                          color: payableStatusFilter === 'pending' ? 'var(--color-secondary)' : 'var(--color-foreground-subtle)',
                          fontSize: '11px',
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: '4px',
                          cursor: 'pointer',
                        }}
                      >
                        Pending ({payablesSummary.pendingCount})
                      </button>
                      <button
                        type="button"
                        onClick={() => setPayableStatusFilter('overdue')}
                        style={{
                          border: 'none',
                          background: payableStatusFilter === 'overdue' ? 'var(--color-danger-muted)' : 'transparent',
                          color: payableStatusFilter === 'overdue' ? 'var(--color-danger)' : 'var(--color-foreground-subtle)',
                          fontSize: '11px',
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: '4px',
                          cursor: 'pointer',
                        }}
                      >
                        Overdue ({payablesSummary.overdueCount})
                      </button>
                    </div>
                  </div>
                </div>

                {/* Desktop Payables Table */}
                <div className="financials-desktop-table" style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '490px', flex: 1 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
                    <thead style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--color-surface)' }}>
                      <tr>
                        <th style={{ textAlign: 'left', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-foreground-subtle)', padding: '10px 14px', borderBottom: '0.5px solid var(--color-border-strong)' }}>
                          Vendor / Bill
                        </th>
                        <th style={{ textAlign: 'right', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-foreground-subtle)', padding: '10px 10px', borderBottom: '0.5px solid var(--color-border-strong)' }}>
                          Amount
                        </th>
                        <th style={{ textAlign: 'left', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-foreground-subtle)', padding: '10px 10px', borderBottom: '0.5px solid var(--color-border-strong)' }}>
                          Due Date
                        </th>
                        <th style={{ textAlign: 'right', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-foreground-subtle)', padding: '10px 14px', borderBottom: '0.5px solid var(--color-border-strong)' }}>
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPayables.length === 0 ? (
                        <tr>
                          <td colSpan={4} style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--color-foreground-subtle)' }}>
                            No payable bills found in this filter.
                          </td>
                        </tr>
                      ) : (
                        paginatedPayables.map((p) => {
                          const isPaid = p.status === 'paid'
                          const isOver = p.status === 'overdue'

                          return (
                            <tr key={p.payableId} style={{ background: 'transparent', borderBottom: '0.5px solid var(--color-border)' }}>
                              <td style={{ padding: '8px 14px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                  <span style={{ fontWeight: 600, color: 'var(--color-foreground)' }}>{p.vendorName}</span>
                                  <span style={{ fontSize: '11px', color: 'var(--color-foreground-subtle)' }}>
                                    {CATEGORY_META[p.category]?.label || p.category} · {p.billNumber || 'No Bill #'}
                                  </span>
                                </div>
                              </td>

                              <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: isPaid ? 'var(--color-foreground-muted)' : 'var(--color-danger)' }}>
                                {formatINR(p.amount)}
                              </td>

                              <td style={{ padding: '8px 10px', fontSize: 'var(--text-xs)', color: isOver ? 'var(--color-danger)' : 'var(--color-foreground-muted)', fontWeight: isOver ? 700 : 500 }}>
                                {isPaid ? 'Paid' : isOver ? `Overdue (${p.dueDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })})` : p.dueDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </td>

                              <td style={{ padding: '8px 14px', textAlign: 'right' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                                  {!isPaid ? (
                                    <button
                                      type="button"
                                      onClick={() => setSettlingPayable(p)}
                                      style={{
                                        border: 'none',
                                        background: 'var(--color-primary)',
                                        color: '#ffffff',
                                        fontSize: '11px',
                                        fontWeight: 600,
                                        padding: '3px 8px',
                                        borderRadius: '5px',
                                        cursor: 'pointer',
                                      }}
                                    >
                                      Mark Paid
                                    </button>
                                  ) : (
                                    <span style={{ fontSize: '11px', color: 'var(--color-success)', fontWeight: 600 }}>
                                      <i className="ti ti-check" /> Settled
                                    </span>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (confirm(`Remove bill from ${p.vendorName}?`)) {
                                        deletePayable(p.payableId)
                                      }
                                    }}
                                    title="Delete bill"
                                    style={{
                                      border: 'none',
                                      background: 'transparent',
                                      color: 'var(--color-foreground-subtle)',
                                      padding: '2px 4px',
                                      cursor: 'pointer',
                                    }}
                                  >
                                    <i className="ti ti-trash" style={{ fontSize: '12px' }} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )
                        })
                      )}

                      {/* Sticky Footer Total Row */}
                      <tr style={{ background: 'var(--color-surface-raised)', position: 'sticky', bottom: 0, zIndex: 1 }}>
                        <td style={{ padding: '8px 14px', fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-foreground-subtle)' }}>
                          {payableStatusFilter !== 'all' || payableSearch.trim() ? 'Filtered Payables' : 'Total Unsettled Payables'}
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: 'var(--color-danger)', fontSize: 'var(--text-sm)' }}>
                          {formatINR(displayedPayablesTotal)}
                        </td>
                        <td colSpan={2} style={{ padding: '8px 14px', textAlign: 'right', fontSize: '11px', color: 'var(--color-foreground-subtle)' }}>
                          {filteredPayables.length} bills {payableStatusFilter !== 'all' || payableSearch.trim() ? 'matching' : 'pending'}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Payables Pagination Bar */}
                <div
                  style={{
                    padding: '8px 14px',
                    borderTop: '0.5px solid var(--color-border)',
                    background: 'var(--color-surface)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '8px',
                    fontSize: 'var(--text-xs)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-foreground-muted)' }}>
                    <span>
                      Showing{' '}
                      <strong style={{ color: 'var(--color-foreground)' }}>
                        {filteredPayables.length === 0 ? 0 : (safePayablePage - 1) * payablePageSize + 1}
                      </strong>
                      –
                      <strong style={{ color: 'var(--color-foreground)' }}>
                        {Math.min(safePayablePage * payablePageSize, filteredPayables.length)}
                      </strong>{' '}
                      of{' '}
                      <strong style={{ color: 'var(--color-foreground)' }}>
                        {filteredPayables.length}
                      </strong>
                    </span>
                    <span style={{ color: 'var(--color-border)' }}>|</span>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}>
                      Show:
                      <select
                        value={payablePageSize}
                        onChange={(e) => {
                          setPayablePageSize(Number(e.target.value))
                          setPayablePage(1)
                        }}
                        style={{
                          height: '24px',
                          padding: '0 4px',
                          borderRadius: '4px',
                          background: 'var(--color-surface-raised)',
                          border: '0.5px solid var(--color-border)',
                          color: 'var(--color-foreground)',
                          fontSize: '11px',
                          fontWeight: 600,
                          outline: 'none',
                          cursor: 'pointer',
                        }}
                      >
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                        <option value={50}>50</option>
                        <option value={9999}>All</option>
                      </select>
                    </label>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button
                      type="button"
                      onClick={() => setPayablePage((p) => Math.max(1, p - 1))}
                      disabled={safePayablePage <= 1}
                      style={{
                        border: '0.5px solid var(--color-border)',
                        background: safePayablePage <= 1 ? 'transparent' : 'var(--color-surface-raised)',
                        color: safePayablePage <= 1 ? 'var(--color-foreground-subtle)' : 'var(--color-foreground)',
                        padding: '3px 8px',
                        borderRadius: '5px',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: safePayablePage <= 1 ? 'not-allowed' : 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '2px',
                        opacity: safePayablePage <= 1 ? 0.5 : 1,
                      }}
                    >
                      <i className="ti ti-chevron-left" /> Prev
                    </button>

                    <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-foreground-muted)', padding: '0 4px' }}>
                      {safePayablePage} / {totalPayablePages}
                    </span>

                    <button
                      type="button"
                      onClick={() => setPayablePage((p) => Math.min(totalPayablePages, p + 1))}
                      disabled={safePayablePage >= totalPayablePages}
                      style={{
                        border: '0.5px solid var(--color-border)',
                        background: safePayablePage >= totalPayablePages ? 'transparent' : 'var(--color-surface-raised)',
                        color: safePayablePage >= totalPayablePages ? 'var(--color-foreground-subtle)' : 'var(--color-foreground)',
                        padding: '3px 8px',
                        borderRadius: '5px',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: safePayablePage >= totalPayablePages ? 'not-allowed' : 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '2px',
                        opacity: safePayablePage >= totalPayablePages ? 0.5 : 1,
                      }}
                    >
                      Next <i className="ti ti-chevron-right" />
                    </button>
                  </div>
                </div>

                {/* Mobile Payables Cards */}
                <div className="financials-mobile-cards">
                  {paginatedPayables.map((p) => (
                    <div
                      key={p.payableId}
                      style={{
                        background: p.status === 'overdue' ? 'var(--color-danger-muted)' : 'var(--color-surface-raised)',
                        border: `0.5px solid ${p.status === 'overdue' ? 'var(--color-danger)' : 'var(--color-border)'}`,
                        borderRadius: '8px',
                        padding: '12px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-foreground)' }}>
                          {p.vendorName}
                        </span>
                        <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-danger)' }}>
                          {formatINR(p.amount)}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: 'var(--color-foreground-subtle)' }}>
                        <span>{CATEGORY_META[p.category]?.label || p.category}</span>
                        <span>Due: {p.dueDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                        {p.status !== 'paid' && (
                          <Button size="sm" onClick={() => setSettlingPayable(p)} style={{ height: '28px', fontSize: '11px', background: 'var(--color-primary)', color: '#ffffff' }}>
                            Mark as Paid
                          </Button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm(`Remove bill from ${p.vendorName}?`)) {
                              deletePayable(p.payableId)
                            }
                          }}
                          style={{
                            border: 'none',
                            background: 'transparent',
                            color: 'var(--color-foreground-subtle)',
                            padding: '4px',
                            cursor: 'pointer',
                          }}
                        >
                          <i className="ti ti-trash" style={{ fontSize: '13px' }} />
                        </button>
                      </div>
                    </div>
                  ))}

                  {/* Mobile Payables Pagination Controls */}
                  {totalPayablePages > 1 && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderTop: '0.5px solid var(--color-border)', fontSize: '11px' }}>
                      <span style={{ color: 'var(--color-foreground-muted)' }}>
                        Page {safePayablePage} of {totalPayablePages} ({filteredPayables.length})
                      </span>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          type="button"
                          onClick={() => setPayablePage((p) => Math.max(1, p - 1))}
                          disabled={safePayablePage <= 1}
                          style={{
                            padding: '4px 10px',
                            borderRadius: '5px',
                            border: '0.5px solid var(--color-border)',
                            background: 'var(--color-surface-raised)',
                            color: 'var(--color-foreground)',
                            cursor: safePayablePage <= 1 ? 'not-allowed' : 'pointer',
                            opacity: safePayablePage <= 1 ? 0.5 : 1,
                          }}
                        >
                          Prev
                        </button>
                        <button
                          type="button"
                          onClick={() => setPayablePage((p) => Math.min(totalPayablePages, p + 1))}
                          disabled={safePayablePage >= totalPayablePages}
                          style={{
                            padding: '4px 10px',
                            borderRadius: '5px',
                            border: '0.5px solid var(--color-border)',
                            background: 'var(--color-surface-raised)',
                            color: 'var(--color-foreground)',
                            cursor: safePayablePage >= totalPayablePages ? 'not-allowed' : 'pointer',
                            opacity: safePayablePage >= totalPayablePages ? 0.5 : 1,
                          }}
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    )}

      {/* ─── TAB 3: PROJECT-WISE PROFITABILITY LEDGER ──────────────────────── */}
      {(activeTab === 'profitability' || activeTab === 'executive') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div
            style={{
              background: 'var(--color-surface)',
              border: '0.5px solid var(--color-border)',
              borderRadius: '12px',
              padding: '16px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
            {/* Header with Search and Sort */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, margin: 0, color: 'var(--color-foreground)' }}>
                  Project Profitability Ledger
                </h3>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)', margin: '2px 0 0 0' }}>
                  Contracted revenue minus direct costs (gear rental, freelancers, transport) per booking.
                </p>
              </div>

              <div className="financials-ledger-filter-row" style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                {/* Search */}
                <div className="financials-search-box" style={{ position: 'relative' }}>
                  <i className="ti ti-search" style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', fontSize: '12px', color: 'var(--color-foreground-subtle)' }} />
                  <input
                    type="text"
                    placeholder="Search project / client..."
                    value={profitabilitySearch}
                    onChange={(e) => {
                      setProfitabilitySearch(e.target.value)
                      setProfitabilityPage(1)
                    }}
                    style={{
                      width: '100%',
                      height: '30px',
                      padding: '0 8px 0 28px',
                      borderRadius: '6px',
                      background: 'var(--color-surface-raised)',
                      border: '0.5px solid var(--color-border)',
                      fontSize: '11px',
                      color: 'var(--color-foreground)',
                      outline: 'none',
                    }}
                  />
                </div>

                {/* Sort */}
                <select
                  value={profitabilitySort}
                  onChange={(e) => {
                    setProfitabilitySort(e.target.value as 'revenue' | 'profit' | 'margin')
                    setProfitabilityPage(1)
                  }}
                  style={{
                    height: '30px',
                    padding: '0 8px',
                    borderRadius: '6px',
                    background: 'var(--color-surface-raised)',
                    border: '0.5px solid var(--color-border)',
                    fontSize: '11px',
                    color: 'var(--color-foreground)',
                    outline: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <option value="revenue">Sort by Revenue</option>
                  <option value="profit">Sort by Net Profit</option>
                  <option value="margin">Sort by Profit Margin %</option>
                </select>
              </div>
            </div>

            {/* Desktop Profitability Table */}
            <div className="financials-desktop-table" style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-foreground-subtle)', padding: '10px 14px', borderBottom: '0.5px solid var(--color-border-strong)' }}>
                      Project / Client
                    </th>
                    <th style={{ textAlign: 'right', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-foreground-subtle)', padding: '10px 12px', borderBottom: '0.5px solid var(--color-border-strong)' }}>
                      Revenue
                    </th>
                    <th style={{ textAlign: 'right', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-foreground-subtle)', padding: '10px 12px', borderBottom: '0.5px solid var(--color-border-strong)' }}>
                      Direct Costs
                    </th>
                    <th style={{ textAlign: 'right', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-foreground-subtle)', padding: '10px 12px', borderBottom: '0.5px solid var(--color-border-strong)' }}>
                      Net Profit
                    </th>
                    <th style={{ textAlign: 'center', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-foreground-subtle)', padding: '10px 14px', borderBottom: '0.5px solid var(--color-border-strong)' }}>
                      Margin Tier
                    </th>
                    <th style={{ textAlign: 'right', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-foreground-subtle)', padding: '10px 14px', borderBottom: '0.5px solid var(--color-border-strong)' }}>
                      Drill-down
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {projectProfitabilityList.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--color-foreground-subtle)' }}>
                        No project records found.
                      </td>
                    </tr>
                  ) : (
                    paginatedProfitabilityList.map((p) => {
                      let badgeBg = 'var(--color-success-muted)'
                      let badgeFg = 'var(--color-success)'
                      let badgeLabel = `${p.marginPct}% High`

                      if (p.marginTier === 'deficit') {
                        badgeBg = 'var(--color-danger-muted)'
                        badgeFg = 'var(--color-danger)'
                        badgeLabel = `${p.marginPct}% Loss`
                      } else if (p.marginTier === 'low') {
                        badgeBg = 'var(--color-secondary-muted)'
                        badgeFg = 'var(--color-secondary)'
                        badgeLabel = `${p.marginPct}% Thin`
                      } else if (p.marginTier === 'healthy') {
                        badgeBg = 'var(--color-accent-muted)'
                        badgeFg = 'var(--color-accent)'
                        badgeLabel = `${p.marginPct}% Healthy`
                      }

                      return (
                        <tr key={p.projectId} style={{ borderBottom: '0.5px solid var(--color-border)' }}>
                          <td style={{ padding: '10px 14px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span style={{ fontWeight: 600, color: 'var(--color-foreground)' }}>{p.projectName}</span>
                              <span style={{ fontSize: '11px', color: 'var(--color-foreground-subtle)' }}>
                                {p.clientName} · {p.packageType}
                              </span>
                            </div>
                          </td>

                          <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: 'var(--color-foreground)' }}>
                            {formatINR(p.revenue)}
                          </td>

                          <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: 'var(--color-danger)' }}>
                            {formatINR(p.directExpenses)}
                          </td>

                          <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: p.netProfit >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                            {formatINR(p.netProfit)}
                          </td>

                          <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                            <span
                              style={{
                                fontSize: '11px',
                                fontWeight: 700,
                                padding: '2px 8px',
                                borderRadius: '8px',
                                background: badgeBg,
                                color: badgeFg,
                                display: 'inline-block',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {badgeLabel}
                            </span>
                          </td>

                          <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                            <button
                              type="button"
                              onClick={() => setDrillProject(p)}
                              style={{
                                border: 'none',
                                background: 'transparent',
                                color: 'var(--color-accent)',
                                fontSize: '11px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                textDecoration: 'underline',
                              }}
                            >
                              Costs ({p.expenseItems.length})
                            </button>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile Responsive Profitability Cards */}
            <div className="financials-mobile-cards">
              {projectProfitabilityList.length === 0 ? (
                <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--color-foreground-subtle)', fontSize: 'var(--text-xs)' }}>
                  No project records found.
                </div>
              ) : (
                paginatedProfitabilityList.map((p) => {
                  let badgeBg = 'var(--color-success-muted)'
                  let badgeFg = 'var(--color-success)'
                  let badgeLabel = `${p.marginPct}% High`

                  if (p.marginTier === 'deficit') {
                    badgeBg = 'var(--color-danger-muted)'
                    badgeFg = 'var(--color-danger)'
                    badgeLabel = `${p.marginPct}% Loss`
                  } else if (p.marginTier === 'low') {
                    badgeBg = 'var(--color-secondary-muted)'
                    badgeFg = 'var(--color-secondary)'
                    badgeLabel = `${p.marginPct}% Thin`
                  } else if (p.marginTier === 'healthy') {
                    badgeBg = 'var(--color-accent-muted)'
                    badgeFg = 'var(--color-accent)'
                    badgeLabel = `${p.marginPct}% Healthy`
                  }

                  return (
                    <div
                      key={p.projectId}
                      style={{
                        background: 'var(--color-surface-raised)',
                        border: '0.5px solid var(--color-border)',
                        borderRadius: '8px',
                        padding: '12px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-foreground)' }}>
                            {p.projectName}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--color-foreground-subtle)' }}>
                            {p.clientName} · {p.packageType}
                          </div>
                        </div>
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: '6px',
                            background: badgeBg,
                            color: badgeFg,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {badgeLabel}
                        </span>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px', textAlign: 'center', background: 'var(--color-surface)', padding: '6px', borderRadius: '6px' }}>
                        <div>
                          <div style={{ fontSize: '10px', color: 'var(--color-foreground-subtle)' }}>Revenue</div>
                          <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600 }}>{formatINR(p.revenue)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '10px', color: 'var(--color-foreground-subtle)' }}>Direct Costs</div>
                          <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-danger)' }}>{formatINR(p.directExpenses)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '10px', color: 'var(--color-foreground-subtle)' }}>Net Profit</div>
                          <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: p.netProfit >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                            {formatINR(p.netProfit)}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
                        <button
                          type="button"
                          onClick={() => setDrillProject(p)}
                          style={{
                            border: '0.5px solid var(--color-border)',
                            background: 'var(--color-surface)',
                            color: 'var(--color-accent)',
                            fontSize: '11px',
                            fontWeight: 600,
                            padding: '4px 10px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                          }}
                        >
                          <i className="ti ti-list-details" /> View Costs ({p.expenseItems.length})
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {/* Project Profitability Pagination Controls */}
            {projectProfitabilityList.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '8px',
                  fontSize: 'var(--text-xs)',
                  paddingTop: '10px',
                  borderTop: '0.5px solid var(--color-border)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-foreground-muted)' }}>
                  <span>
                    Showing{' '}
                    <strong style={{ color: 'var(--color-foreground)' }}>
                      {projectProfitabilityList.length === 0 ? 0 : (safeProfitabilityPage - 1) * profitabilityPageSize + 1}
                    </strong>
                    –
                    <strong style={{ color: 'var(--color-foreground)' }}>
                      {Math.min(safeProfitabilityPage * profitabilityPageSize, projectProfitabilityList.length)}
                    </strong>{' '}
                    of{' '}
                    <strong style={{ color: 'var(--color-foreground)' }}>
                      {projectProfitabilityList.length}
                    </strong>
                  </span>
                  <span style={{ color: 'var(--color-border)' }}>|</span>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}>
                    Show:
                    <select
                      value={profitabilityPageSize}
                      onChange={(e) => {
                        setProfitabilityPageSize(Number(e.target.value))
                        setProfitabilityPage(1)
                      }}
                      style={{
                        height: '24px',
                        padding: '0 4px',
                        borderRadius: '4px',
                        background: 'var(--color-surface-raised)',
                        border: '0.5px solid var(--color-border)',
                        color: 'var(--color-foreground)',
                        fontSize: '11px',
                        fontWeight: 600,
                        outline: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                      <option value={9999}>All</option>
                    </select>
                  </label>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={() => setProfitabilityPage((p) => Math.max(1, p - 1))}
                    disabled={safeProfitabilityPage <= 1}
                    style={{
                      border: '0.5px solid var(--color-border)',
                      background: safeProfitabilityPage <= 1 ? 'transparent' : 'var(--color-surface-raised)',
                      color: safeProfitabilityPage <= 1 ? 'var(--color-foreground-subtle)' : 'var(--color-foreground)',
                      padding: '3px 8px',
                      borderRadius: '5px',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: safeProfitabilityPage <= 1 ? 'not-allowed' : 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '2px',
                    }}
                  >
                    <i className="ti ti-chevron-left" /> Prev
                  </button>

                  <span style={{ color: 'var(--color-foreground-muted)', fontSize: '11px', padding: '0 4px' }}>
                    Page {safeProfitabilityPage} of {totalProfitabilityPages}
                  </span>

                  <button
                    type="button"
                    onClick={() => setProfitabilityPage((p) => Math.min(totalProfitabilityPages, p + 1))}
                    disabled={safeProfitabilityPage >= totalProfitabilityPages}
                    style={{
                      border: '0.5px solid var(--color-border)',
                      background: safeProfitabilityPage >= totalProfitabilityPages ? 'transparent' : 'var(--color-surface-raised)',
                      color: safeProfitabilityPage >= totalProfitabilityPages ? 'var(--color-foreground-subtle)' : 'var(--color-foreground)',
                      padding: '3px 8px',
                      borderRadius: '5px',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: safeProfitabilityPage >= totalProfitabilityPages ? 'not-allowed' : 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '2px',
                    }}
                  >
                    Next <i className="ti ti-chevron-right" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── MODAL 1: RECORD PAYMENT DIALOG ─────────────────────────────────── */}
      {paymentTarget && (
        <RecordPaymentModal
          isOpen={true}
          clientId={paymentTarget.clientId}
          clientName={paymentTarget.clientName}
          totalAmount={paymentTarget.totalAmount}
          balanceDue={paymentTarget.balanceDue}
          onClose={() => setPaymentTarget(null)}
          onSuccess={() => {
            setPaymentTarget(null)
            setBudgetSuccessMsg(`Payment recorded successfully!`)
            setTimeout(() => setBudgetSuccessMsg(null), 4000)
          }}
        />
      )}

      {/* ─── MODAL 2: SEND REMINDER (WHATSAPP & EMAIL) ──────────────────────── */}
      {reminderTarget && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
          onClick={() => setReminderTarget(null)}
        >
          <div
            className="financials-modal-dialog"
            style={{
              width: '100%',
              maxWidth: '460px',
              background: 'var(--color-surface)',
              border: '0.5px solid var(--color-border)',
              borderRadius: '14px',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'var(--color-secondary-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <i className="ti ti-bell-ringing" style={{ fontSize: '16px', color: 'var(--color-secondary)' }} />
                </div>
                <div>
                  <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 700, margin: 0, color: 'var(--color-foreground)' }}>
                    Send Payment Reminder
                  </h3>
                  <span style={{ fontSize: '11px', color: 'var(--color-foreground-subtle)' }}>
                    {reminderTarget.clientName} · {reminderTarget.invoiceNumber}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setReminderTarget(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--color-foreground-subtle)', cursor: 'pointer', fontSize: '18px' }}
              >
                <i className="ti ti-x" />
              </button>
            </div>

            {/* Tone Selector */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-foreground-muted)' }}>
                Reminder Tone & Stage:
              </label>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  type="button"
                  onClick={() => setReminderTone('polite')}
                  style={{
                    flex: 1,
                    padding: '6px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 600,
                    border: reminderTone === 'polite' ? '1px solid var(--color-primary)' : '0.5px solid var(--color-border)',
                    background: reminderTone === 'polite' ? 'var(--color-primary-muted)' : 'var(--color-surface-raised)',
                    color: reminderTone === 'polite' ? 'var(--color-primary)' : 'var(--color-foreground-muted)',
                    cursor: 'pointer',
                  }}
                >
                  Gentle / Milestone
                </button>
                <button
                  type="button"
                  onClick={() => setReminderTone('due')}
                  style={{
                    flex: 1,
                    padding: '6px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 600,
                    border: reminderTone === 'due' ? '1px solid var(--color-secondary)' : '0.5px solid var(--color-border)',
                    background: reminderTone === 'due' ? 'var(--color-secondary-muted)' : 'var(--color-surface-raised)',
                    color: reminderTone === 'due' ? 'var(--color-secondary)' : 'var(--color-foreground-muted)',
                    cursor: 'pointer',
                  }}
                >
                  Past Due Notice
                </button>
                <button
                  type="button"
                  onClick={() => setReminderTone('final')}
                  style={{
                    flex: 1,
                    padding: '6px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 600,
                    border: reminderTone === 'final' ? '1px solid var(--color-danger)' : '0.5px solid var(--color-border)',
                    background: reminderTone === 'final' ? 'var(--color-danger-muted)' : 'var(--color-surface-raised)',
                    color: reminderTone === 'final' ? 'var(--color-danger)' : 'var(--color-foreground-muted)',
                    cursor: 'pointer',
                  }}
                >
                  Final Notice (60d+)
                </button>
              </div>
            </div>

            {/* Preview Box */}
            <div
              style={{
                background: 'var(--color-surface-raised)',
                border: '0.5px solid var(--color-border)',
                borderRadius: '8px',
                padding: '12px',
                fontSize: '11px',
                lineHeight: 1.5,
                color: 'var(--color-foreground)',
                whiteSpace: 'pre-wrap',
                maxHeight: '140px',
                overflowY: 'auto',
              }}
            >
              {reminderMessageText}
            </div>

            {/* Actions */}
            <div className="financials-modal-footer" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <Button
                variant="outline"
                onClick={handleCopyReminder}
                style={{ height: '36px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <i className={copiedReminder ? 'ti ti-check' : 'ti ti-copy'} />
                {copiedReminder ? 'Copied!' : 'Copy Text'}
              </Button>
              {reminderTarget.clientEmail && (
                <Button
                  variant="outline"
                  onClick={handleOpenEmail}
                  style={{ height: '36px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <i className="ti ti-mail" />
                  Email
                </Button>
              )}
              <Button
                onClick={handleOpenWhatsApp}
                style={{
                  height: '36px',
                  fontSize: '11px',
                  fontWeight: 600,
                  background: 'var(--color-success)',
                  color: '#ffffff',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <i className="ti ti-brand-whatsapp" style={{ fontSize: '15px' }} />
                Send via WhatsApp
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL 3: ADD PAYABLE BILL MODAL ───────────────────────────────── */}
      {isAddPayableOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
          onClick={() => setIsAddPayableOpen(false)}
        >
          <div
            className="financials-modal-dialog"
            style={{
              width: '100%',
              maxWidth: '420px',
              background: 'var(--color-surface)',
              border: '0.5px solid var(--color-border)',
              borderRadius: '14px',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'var(--color-primary-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <i className="ti ti-file-invoice" style={{ fontSize: '16px', color: 'var(--color-primary)' }} />
                </div>
                <div>
                  <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 700, margin: 0, color: 'var(--color-foreground)' }}>
                    Add Accounts Payable Bill
                  </h3>
                  <span style={{ fontSize: '11px', color: 'var(--color-foreground-subtle)' }}>
                    Record pending vendor bill or freelancer fee
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddPayableOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--color-foreground-subtle)', cursor: 'pointer', fontSize: '18px' }}
              >
                <i className="ti ti-x" />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-foreground-muted)' }}>Vendor / Payee Name</label>
              <Input
                placeholder="e.g. Senthil Camera Rentals"
                value={newPayableVendor}
                onChange={(e) => setNewPayableVendor(e.target.value)}
                style={{ height: '36px', fontSize: '12px' }}
              />
            </div>

            <div className="financials-modal-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-foreground-muted)' }}>Category</label>
                <select
                  value={newPayableCategory}
                  onChange={(e) => setNewPayableCategory(e.target.value as ExpenseCategory)}
                  style={{
                    height: '36px',
                    borderRadius: '8px',
                    padding: '0 8px',
                    background: 'var(--color-surface-raised)',
                    border: '0.5px solid var(--color-border)',
                    fontSize: '12px',
                    color: 'var(--color-foreground)',
                  }}
                >
                  <option value="equipment">Equipment & Service</option>
                  <option value="freelancer">Freelancer Payout</option>
                  <option value="studioRent">Studio Rent</option>
                  <option value="utilities">Power & Utilities</option>
                  <option value="travel">Travel & Conveyance</option>
                  <option value="marketing">Marketing & Ads</option>
                  <option value="misc">General & Misc</option>
                  {customCategories.length > 0 && (
                    <optgroup label="Custom Categories">
                      {customCategories.map((c) => (
                        <option key={c.key} value={c.key}>
                          {c.label}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-foreground-muted)' }}>Bill / Ref #</label>
                <Input
                  placeholder="e.g. INV-904"
                  value={newPayableBillNo}
                  onChange={(e) => setNewPayableBillNo(e.target.value)}
                  style={{ height: '36px', fontSize: '12px' }}
                />
              </div>
            </div>

            <div className="financials-modal-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-foreground-muted)' }}>Gross Amount (₹)</label>
                <Input
                  type="number"
                  placeholder="e.g. 25000"
                  value={newPayableAmount}
                  onChange={(e) => {
                    const val = e.target.value
                    setNewPayableAmount(val)
                    const amt = parseFloat(val.replace(/[^0-9.]/g, '')) || 0
                    if (amt > 0 && newPayableGstRate > 0) {
                      setNewPayableGstAmount(String(Math.round((amt * newPayableGstRate) / (100 + newPayableGstRate))))
                    }
                  }}
                  style={{ height: '36px', fontSize: '12px', fontWeight: 700 }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-foreground-muted)' }}>Due Date</label>
                <Input
                  type="date"
                  value={newPayableDueDate}
                  onChange={(e) => setNewPayableDueDate(e.target.value)}
                  style={{ height: '36px', fontSize: '12px' }}
                />
              </div>
            </div>

            {/* GST Details for ITC */}
            <div className="financials-modal-grid-3" style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr 1fr', gap: '8px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-foreground-muted)' }}>Vendor GSTIN</label>
                <Input
                  placeholder="e.g. 27AAAAA0000A1Z5"
                  value={newPayableGstin}
                  onChange={(e) => setNewPayableGstin(e.target.value.toUpperCase())}
                  style={{ height: '36px', fontSize: '12px' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-foreground-muted)' }}>GST Rate</label>
                <select
                  value={newPayableGstRate}
                  onChange={(e) => {
                    const r = Number(e.target.value) || 0
                    setNewPayableGstRate(r)
                    const amt = parseFloat(newPayableAmount.replace(/[^0-9.]/g, '')) || 0
                    if (amt > 0 && r > 0) {
                      setNewPayableGstAmount(String(Math.round((amt * r) / (100 + r))))
                    } else {
                      setNewPayableGstAmount('0')
                    }
                  }}
                  style={{
                    height: '36px',
                    borderRadius: '8px',
                    padding: '0 8px',
                    background: 'var(--color-surface-raised)',
                    border: '0.5px solid var(--color-border)',
                    fontSize: '12px',
                    color: 'var(--color-foreground)',
                  }}
                >
                  <option value={0}>0%</option>
                  <option value={5}>5%</option>
                  <option value={12}>12%</option>
                  <option value={18}>18%</option>
                  <option value={28}>28%</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-foreground-muted)' }}>GST Tax (₹)</label>
                <Input
                  type="number"
                  placeholder="Tax portion"
                  value={newPayableGstAmount}
                  onChange={(e) => setNewPayableGstAmount(e.target.value)}
                  style={{ height: '36px', fontSize: '12px' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-foreground-muted)' }}>Linked Project / Note (Optional)</label>
              <Input
                placeholder="e.g. Anand & Divya Wedding gear lease"
                value={newPayableNote}
                onChange={(e) => setNewPayableNote(e.target.value)}
                style={{ height: '36px', fontSize: '12px' }}
              />
            </div>

            <div className="financials-modal-footer" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '6px' }}>
              <Button variant="outline" onClick={() => setIsAddPayableOpen(false)} style={{ height: '34px', fontSize: '11px' }}>
                Cancel
              </Button>
              <Button
                onClick={handleCreatePayable}
                disabled={savingPayable}
                style={{ height: '34px', fontSize: '11px', background: 'var(--color-primary)', color: '#ffffff', fontWeight: 600 }}
              >
                {savingPayable ? 'Recording...' : 'Save Payable Bill'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL 4: SETTLE PAYABLE DIALOG ─────────────────────────────────── */}
      {settlingPayable && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
          onClick={() => setSettlingPayable(null)}
        >
          <div
            className="financials-modal-dialog"
            style={{
              width: '100%',
              maxWidth: '380px',
              background: 'var(--color-surface)',
              border: '0.5px solid var(--color-border)',
              borderRadius: '14px',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 700, margin: 0, color: 'var(--color-foreground)' }}>
                Settle Payable Bill
              </h3>
              <button
                type="button"
                onClick={() => setSettlingPayable(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--color-foreground-subtle)', cursor: 'pointer', fontSize: '18px' }}
              >
                <i className="ti ti-x" />
              </button>
            </div>

            <div style={{ padding: '10px', borderRadius: '8px', background: 'var(--color-surface-raised)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '11px', color: 'var(--color-foreground-subtle)' }}>Paying to:</span>
              <strong style={{ fontSize: 'var(--text-sm)', color: 'var(--color-foreground)' }}>{settlingPayable.vendorName}</strong>
              <span style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--color-danger)' }}>
                {formatINR(settlingPayable.amount)}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-foreground-muted)' }}>Payment Settlement Method</label>
              <select
                value={settlementMethod}
                onChange={(e) => setSettlementMethod(e.target.value as 'bankTransfer' | 'cash' | 'gpay')}
                style={{
                  height: '36px',
                  borderRadius: '8px',
                  padding: '0 8px',
                  background: 'var(--color-surface-raised)',
                  border: '0.5px solid var(--color-border)',
                  fontSize: '12px',
                  color: 'var(--color-foreground)',
                }}
              >
                <option value="bankTransfer">Bank Transfer / NEFT / IMPS</option>
                <option value="gpay">UPI / GPay / PhonePe</option>
                <option value="cash">Cash in Studio</option>
              </select>
              <span style={{ fontSize: '10px', color: 'var(--color-foreground-subtle)' }}>
                Settling this will automatically deduct funds and record an Expense.
              </span>
            </div>

            <div className="financials-modal-footer" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '6px' }}>
              <Button variant="outline" onClick={() => setSettlingPayable(null)} style={{ height: '34px', fontSize: '11px' }}>
                Cancel
              </Button>
              <Button
                onClick={handleSettlePayable}
                disabled={settlingAction}
                style={{ height: '34px', fontSize: '11px', background: 'var(--color-primary)', color: '#ffffff', fontWeight: 600 }}
              >
                {settlingAction ? 'Settling...' : 'Confirm Settlement'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL 5: CATEGORY EXPENSES DRILL-DOWN MODAL ────────────────────── */}
      {drillCategory && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
          onClick={() => setDrillCategory(null)}
        >
          <div
            className="financials-modal-dialog"
            style={{
              width: '100%',
              maxWidth: '520px',
              background: 'var(--color-surface)',
              border: '0.5px solid var(--color-border)',
              borderRadius: '14px',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
              maxHeight: '80vh',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 700, margin: 0, color: 'var(--color-foreground)' }}>
                  {drillCategory.label} Expenses
                </h3>
                <span style={{ fontSize: '11px', color: 'var(--color-foreground-subtle)' }}>
                  {currentMonthSummary.fullMonthLabel} · Total Spend: {formatINR(drillCategory.actual)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setDrillCategory(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--color-foreground-subtle)', cursor: 'pointer', fontSize: '18px' }}
              >
                <i className="ti ti-x" />
              </button>
            </div>

            <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '360px' }}>
              {currentMonthSummary.lineItems
                .filter((item) => item.type === 'expense' && (item.category === drillCategory.category || item.category === drillCategory.label))
                .map((item) => (
                  <div
                    key={item.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      background: 'var(--color-surface-raised)',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-foreground)' }}>{item.label}</span>
                      <span style={{ fontSize: '10px', color: 'var(--color-foreground-subtle)' }}>
                        {item.date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · {item.meta}
                      </span>
                    </div>
                    <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-danger)' }}>
                      {formatINR(item.amount)}
                    </span>
                  </div>
                ))}
            </div>

            <div className="financials-modal-footer" style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button variant="outline" onClick={() => setDrillCategory(null)} style={{ height: '32px', fontSize: '11px' }}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL 6: PROJECT COST DRILL-DOWN MODAL ─────────────────────────── */}
      {drillProject && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
          onClick={() => setDrillProject(null)}
        >
          <div
            className="financials-modal-dialog"
            style={{
              width: '100%',
              maxWidth: '520px',
              background: 'var(--color-surface)',
              border: '0.5px solid var(--color-border)',
              borderRadius: '14px',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
              maxHeight: '80vh',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 700, margin: 0, color: 'var(--color-foreground)' }}>
                  {drillProject.projectName} Cost Breakdown
                </h3>
                <span style={{ fontSize: '11px', color: 'var(--color-foreground-subtle)' }}>
                  Client: {drillProject.clientName} · Revenue: {formatINR(drillProject.revenue)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setDrillProject(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--color-foreground-subtle)', cursor: 'pointer', fontSize: '18px' }}
              >
                <i className="ti ti-x" />
              </button>
            </div>

            <div className="financials-modal-grid-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', textAlign: 'center', background: 'var(--color-surface-raised)', padding: '10px', borderRadius: '8px' }}>
              <div>
                <div style={{ fontSize: '10px', color: 'var(--color-foreground-subtle)' }}>Revenue</div>
                <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-foreground)' }}>{formatINR(drillProject.revenue)}</div>
              </div>
              <div>
                <div style={{ fontSize: '10px', color: 'var(--color-foreground-subtle)' }}>Direct Costs</div>
                <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-danger)' }}>{formatINR(drillProject.directExpenses)}</div>
              </div>
              <div>
                <div style={{ fontSize: '10px', color: 'var(--color-foreground-subtle)' }}>Net Margin</div>
                <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: drillProject.netProfit >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                  {formatINR(drillProject.netProfit)} ({drillProject.marginPct}%)
                </div>
              </div>
            </div>

            <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '300px' }}>
              {drillProject.expenseItems.length === 0 ? (
                <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--color-foreground-subtle)', fontSize: 'var(--text-xs)' }}>
                  No direct expenses logged against this project ID yet.
                </div>
              ) : (
                drillProject.expenseItems.map((e) => (
                  <div
                    key={e.expenseId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      background: 'var(--color-surface-raised)',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-foreground)' }}>{e.vendor || e.note || 'Expense'}</span>
                      <span style={{ fontSize: '10px', color: 'var(--color-foreground-subtle)' }}>
                        {CATEGORY_META[e.category]?.label || e.category} · {e.date instanceof Date ? e.date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''}
                      </span>
                    </div>
                    <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-danger)' }}>
                      {formatINR(e.amount)}
                    </span>
                  </div>
                ))
              )}
            </div>

            <div className="financials-modal-footer" style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button variant="outline" onClick={() => setDrillProject(null)} style={{ height: '32px', fontSize: '11px' }}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL 7: INLINE BUDGET EDIT MODAL ──────────────────────────────── */}
      {editingBudgetCategory && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
          onClick={() => setEditingBudgetCategory(null)}
        >
          <div
            className="financials-modal-dialog"
            style={{
              width: '100%',
              maxWidth: '380px',
              background: 'var(--color-surface)',
              border: '0.5px solid var(--color-border)',
              borderRadius: '14px',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'var(--color-primary-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <i className="ti ti-scale" style={{ fontSize: '16px', color: 'var(--color-primary)' }} />
                </div>
                <div>
                  <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 700, margin: 0, color: 'var(--color-foreground)' }}>
                    Edit Monthly Budget
                  </h3>
                  <span style={{ fontSize: '11px', color: 'var(--color-foreground-subtle)' }}>
                    {editingBudgetCategory} · {currentMonthSummary.fullMonthLabel}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingBudgetCategory(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--color-foreground-subtle)', cursor: 'pointer', fontSize: '18px' }}
              >
                <i className="ti ti-x" />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-foreground-muted)' }}>
                Target Budget Amount (₹)
              </label>
              <Input
                type="number"
                value={editingBudgetAmount}
                onChange={(e) => setEditingBudgetAmount(e.target.value)}
                placeholder="e.g. 50000"
                style={{
                  height: '40px',
                  borderRadius: '8px',
                  fontSize: 'var(--text-sm)',
                  fontWeight: 600,
                  background: 'var(--color-surface-raised)',
                  border: '0.5px solid var(--color-border)',
                }}
                autoFocus
              />
              <span style={{ fontSize: '11px', color: 'var(--color-foreground-subtle)' }}>
                Sets spending ceiling for {currentMonthSummary.monthLabel} {currentMonthSummary.year}.
              </span>
            </div>

            <div className="financials-modal-footer" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <Button variant="outline" type="button" onClick={() => setEditingBudgetCategory(null)} style={{ height: '36px', fontSize: 'var(--text-xs)' }}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleSaveBudget}
                disabled={savingBudget}
                style={{ height: '36px', fontSize: 'var(--text-xs)', fontWeight: 600, background: 'var(--color-primary)', color: '#ffffff' }}
              >
                {savingBudget ? 'Saving...' : 'Save Budget'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL 7.5: ADD CUSTOM EXPENSE CATEGORY MODAL ────────────────── */}
      {showAddCategoryModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
          onClick={() => setShowAddCategoryModal(false)}
        >
          <div
            className="financials-modal-dialog"
            style={{
              width: '100%',
              maxWidth: '440px',
              background: 'var(--color-surface)',
              border: '0.5px solid var(--color-border)',
              borderRadius: '14px',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'var(--color-primary-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <i className="ti ti-category" style={{ fontSize: '16px', color: 'var(--color-primary)' }} />
                </div>
                <div>
                  <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 700, margin: 0, color: 'var(--color-foreground)' }}>
                    Add Expense Category
                  </h3>
                  <span style={{ fontSize: '11px', color: 'var(--color-foreground-subtle)' }}>
                    Create a custom category for tracking expenses &amp; budgets
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddCategoryModal(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--color-foreground-subtle)', cursor: 'pointer', fontSize: '18px' }}
              >
                <i className="ti ti-x" />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-foreground-muted)' }}>
                  Category Name *
                </label>
                <Input
                  type="text"
                  value={newCatLabel}
                  onChange={(e) => setNewCatLabel(e.target.value)}
                  placeholder="e.g. Drone Pilots, Software & Tools, Food & Catering"
                  style={{
                    height: '38px',
                    borderRadius: '8px',
                    fontSize: 'var(--text-sm)',
                    background: 'var(--color-surface-raised)',
                    border: '0.5px solid var(--color-border)',
                  }}
                  autoFocus
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-foreground-muted)' }}>
                  Choose Icon
                </label>
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '8px',
                    maxHeight: '110px',
                    overflowY: 'auto',
                    padding: '8px',
                    background: 'var(--color-surface-raised)',
                    borderRadius: '8px',
                    border: '0.5px solid var(--color-border)',
                  }}
                >
                  {[
                    'ti-tag',
                    'ti-camera',
                    'ti-device-laptop',
                    'ti-drone',
                    'ti-music',
                    'ti-bulb',
                    'ti-coffee',
                    'ti-shopping-cart',
                    'ti-printer',
                    'ti-car',
                    'ti-shirt',
                    'ti-plane',
                    'ti-building',
                    'ti-gift',
                    'ti-briefcase',
                    'ti-wifi',
                    'ti-shield',
                    'ti-headphones',
                    'ti-cloud',
                    'ti-sparkles',
                  ].map((iconName) => (
                    <button
                      key={iconName}
                      type="button"
                      onClick={() => setNewCatIcon(iconName)}
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '6px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: newCatIcon === iconName ? 'var(--color-primary)' : 'var(--color-surface)',
                        color: newCatIcon === iconName ? '#ffffff' : 'var(--color-foreground)',
                        border: newCatIcon === iconName ? 'none' : '0.5px solid var(--color-border)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <i className={`ti ${iconName}`} style={{ fontSize: '15px' }} />
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-foreground-muted)' }}>
                  Default Monthly Budget (₹)
                </label>
                <Input
                  type="number"
                  value={newCatDefaultBudget}
                  onChange={(e) => setNewCatDefaultBudget(e.target.value)}
                  placeholder="e.g. 25000"
                  style={{
                    height: '38px',
                    borderRadius: '8px',
                    fontSize: 'var(--text-sm)',
                    background: 'var(--color-surface-raised)',
                    border: '0.5px solid var(--color-border)',
                  }}
                />
                <span style={{ fontSize: '10px', color: 'var(--color-foreground-subtle)' }}>
                  This amount will be used as default target for each month unless edited.
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingTop: '4px' }}>
              <button
                type="button"
                onClick={() => setShowAddCategoryModal(false)}
                disabled={creatingCategory}
                style={{
                  padding: '8px 14px',
                  borderRadius: '8px',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  background: 'var(--color-surface-raised)',
                  border: '0.5px solid var(--color-border)',
                  color: 'var(--color-foreground)',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateCategory}
                disabled={creatingCategory || !newCatLabel.trim()}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  background: 'var(--color-primary)',
                  color: '#ffffff',
                  border: 'none',
                  cursor: creatingCategory || !newCatLabel.trim() ? 'not-allowed' : 'pointer',
                  opacity: creatingCategory || !newCatLabel.trim() ? 0.6 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                {creatingCategory ? (
                  <>
                    <i className="ti ti-loader animate-spin" />
                    <span>Creating...</span>
                  </>
                ) : (
                  <>
                    <i className="ti ti-plus" />
                    <span>Add Category</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL 8: ADJUST CASH & OPENING BALANCES ─────────────────────────── */}
      {isOpeningBalancesModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
          onClick={() => setIsOpeningBalancesModalOpen(false)}
        >
          <div
            className="financials-modal-dialog"
            style={{
              width: '100%',
              maxWidth: '420px',
              background: 'var(--color-surface)',
              border: '0.5px solid var(--color-border)',
              borderRadius: '14px',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'var(--color-primary-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <i className="ti ti-vault" style={{ fontSize: '16px', color: 'var(--color-primary)' }} />
                </div>
                <div>
                  <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 700, margin: 0, color: 'var(--color-foreground)' }}>
                    Set Cash &amp; Bank Baseline
                  </h3>
                  <span style={{ fontSize: '11px', color: 'var(--color-foreground-subtle)' }}>
                    Actual verified studio opening balances
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOpeningBalancesModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--color-foreground-subtle)', cursor: 'pointer', fontSize: '18px' }}
              >
                <i className="ti ti-x" />
              </button>
            </div>

            <p style={{ fontSize: '11px', color: 'var(--color-foreground-muted)', margin: 0, lineHeight: 1.5 }}>
              Sets your verified studio bank, cash, and UPI balances as of this date. Historical transactions on or before this date are reconciled into this baseline; only new transactions after this date will adjust your liquid cash position.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-foreground-muted)' }}>Bank Accounts Balance (₹)</label>
                {cashPosition.bankAccountsBreakdown && cashPosition.bankAccountsBreakdown.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const sum = cashPosition.bankAccountsBreakdown?.reduce((acc, b) => acc + b.balance, 0) || 0
                      setBaselineBank(String(sum))
                    }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--color-primary)',
                      fontSize: '10px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      padding: 0,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                    title="Recalculate sum of all bank accounts"
                  >
                    <i className="ti ti-refresh" style={{ fontSize: '11px' }} />
                    Sync from Accounts ({formatCompactINR(cashPosition.bankAccountsBreakdown.reduce((acc, b) => acc + b.balance, 0))})
                  </button>
                )}
              </div>
              <Input
                type="number"
                placeholder="e.g. 850000"
                value={baselineBank}
                onChange={(e) => setBaselineBank(e.target.value)}
                style={{ height: '36px', fontSize: '12px', fontWeight: 600 }}
              />
              {cashPosition.bankAccountsBreakdown && cashPosition.bankAccountsBreakdown.length > 0 && (
                <div style={{ fontSize: '10px', color: 'var(--color-foreground-subtle)', lineHeight: 1.4, marginTop: '2px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  <span>Sum of {cashPosition.bankAccountsBreakdown.length} accounts:</span>
                  {cashPosition.bankAccountsBreakdown.map((b) => (
                    <span key={b.bankAccountId} style={{ color: 'var(--color-foreground)' }}>
                      {b.nickname}: <strong>{formatCompactINR(b.balance)}</strong>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="financials-modal-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-foreground-muted)' }}>Cash In Studio (₹)</label>
                <Input
                  type="number"
                  placeholder="e.g. 150000"
                  value={baselineCash}
                  onChange={(e) => setBaselineCash(e.target.value)}
                  style={{ height: '36px', fontSize: '12px', fontWeight: 600 }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-foreground-muted)' }}>UPI / Gateway In-Transit (₹)</label>
                <Input
                  type="number"
                  placeholder="e.g. 75000"
                  value={baselineUPI}
                  onChange={(e) => setBaselineUPI(e.target.value)}
                  style={{ height: '36px', fontSize: '12px', fontWeight: 600 }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-foreground-muted)' }}>Baseline As-Of Date</label>
              <Input
                type="date"
                value={baselineDate}
                onChange={(e) => setBaselineDate(e.target.value)}
                style={{ height: '36px', fontSize: '12px' }}
              />
            </div>

            <div className="financials-modal-footer" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '6px' }}>
              <Button variant="outline" onClick={() => setIsOpeningBalancesModalOpen(false)} style={{ height: '34px', fontSize: '11px' }}>
                Cancel
              </Button>
              <Button
                onClick={handleSaveOpeningBalances}
                disabled={savingBaseline}
                style={{ height: '34px', fontSize: '11px', background: 'var(--color-primary)', color: '#ffffff', fontWeight: 600 }}
              >
                {savingBaseline ? 'Saving...' : 'Save Cash Baseline'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL 9: GST TAX SUMMARY & GSTR EXPORT ─────────────────────────── */}
      {isGstModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
          onClick={() => setIsGstModalOpen(false)}
        >
          <div
            className="financials-modal-dialog"
            style={{
              width: '100%',
              maxWidth: '520px',
              background: 'var(--color-surface)',
              border: '0.5px solid var(--color-border)',
              borderRadius: '14px',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'var(--color-primary-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <i className="ti ti-receipt-tax" style={{ fontSize: '16px', color: 'var(--color-primary)' }} />
                </div>
                <div>
                  <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 700, margin: 0, color: 'var(--color-foreground)' }}>
                    GST Tax Summary &amp; GSTR Filing
                  </h3>
                  <span style={{ fontSize: '11px', color: 'var(--color-foreground-subtle)' }}>
                    GSTR-1 &amp; GSTR-3B monthly tax reconciliation
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsGstModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--color-foreground-subtle)', cursor: 'pointer', fontSize: '18px' }}
              >
                <i className="ti ti-x" />
              </button>
            </div>

            {/* Outward Supplies (Output Tax) */}
            <div style={{ background: 'var(--color-surface-raised)', borderRadius: '10px', padding: '12px', border: '0.5px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-foreground-muted)' }}>
                  1. Outward Supplies (Realized Sales)
                </span>
                <span style={{ fontSize: '11px', color: 'var(--color-foreground-subtle)' }}>
                  GSTR-1 / Table 3.1(a)
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 'var(--text-xs)' }}>
                <span style={{ color: 'var(--color-foreground-muted)' }}>Taxable Value:</span>
                <span style={{ fontWeight: 600, color: 'var(--color-foreground)' }}>{formatINR(gstSummary.outputTaxableAmount)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 'var(--text-xs)' }}>
                <span style={{ color: 'var(--color-foreground-muted)' }}>Output GST Collected (18%):</span>
                <span style={{ fontWeight: 700, color: 'var(--color-primary)' }}>{formatINR(gstSummary.outputGst)}</span>
              </div>
            </div>

            {/* Inward Supplies (Input Tax Credit - ITC) */}
            <div style={{ background: 'var(--color-surface-raised)', borderRadius: '10px', padding: '12px', border: '0.5px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-foreground-muted)' }}>
                  2. Input Tax Credit (ITC on Expenses)
                </span>
                <span style={{ fontSize: '11px', color: 'var(--color-foreground-subtle)' }}>
                  Table 4(A) / 4(B)
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 'var(--text-xs)' }}>
                <span style={{ color: 'var(--color-foreground-muted)' }}>Eligible ITC (Claimable):</span>
                <span style={{ fontWeight: 700, color: 'var(--color-success)' }}>{formatINR(gstSummary.eligibleInputGst)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 'var(--text-xs)' }}>
                <span style={{ color: 'var(--color-foreground-muted)' }}>Ineligible ITC (Blocked under Sec 17(5)):</span>
                <span style={{ fontWeight: 600, color: 'var(--color-foreground-subtle)' }}>{formatINR(gstSummary.ineligibleInputGst)}</span>
              </div>
            </div>

            {/* Net Tax Liability */}
            <div style={{ background: gstSummary.netGstPayable > 0 ? 'var(--color-danger-muted)' : 'var(--color-success-muted)', borderRadius: '10px', padding: '14px', border: `0.5px solid ${gstSummary.netGstPayable > 0 ? 'var(--color-danger)' : 'var(--color-success)'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: gstSummary.netGstPayable > 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>
                  {gstSummary.netGstPayable > 0 ? 'Net GST Payable in Cash' : 'ITC Carry-Forward Balance'}
                </span>
                <div style={{ fontSize: '10px', color: 'var(--color-foreground-subtle)' }}>
                  Output GST ({formatINR(gstSummary.outputGst)}) − Eligible ITC ({formatINR(gstSummary.eligibleInputGst)})
                </div>
              </div>
              <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: gstSummary.netGstPayable > 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>
                {gstSummary.netGstPayable > 0 ? formatINR(gstSummary.netGstPayable) : formatINR(gstSummary.netItcCarryForward)}
              </div>
            </div>

            <div className="financials-modal-footer" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
              <Button variant="outline" onClick={() => setIsGstModalOpen(false)} style={{ height: '34px', fontSize: '11px' }}>
                Close
              </Button>
              <Button
                onClick={() => {
                  exportGstSummaryCSV(expenses, clients, currentMonthSummary.fullMonthLabel)
                  setBudgetSuccessMsg('Exported GSTR-1 & 3B CSV statement!')
                  setTimeout(() => setBudgetSuccessMsg(null), 4000)
                }}
                style={{ height: '34px', fontSize: '11px', background: 'var(--color-primary)', color: '#ffffff', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <i className="ti ti-download" />
                Export GSTR Filing CSV
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL 10: CASH-BASIS REALIZED P&L BREAKDOWN ─────────────────────── */}
      {isPnlBreakdownModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
          onClick={() => setIsPnlBreakdownModalOpen(false)}
        >
          <div
            className="financials-modal-dialog"
            style={{
              width: '100%',
              maxWidth: '560px',
              background: 'var(--color-surface)',
              border: '0.5px solid var(--color-border)',
              borderRadius: '14px',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'var(--color-primary-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <i className="ti ti-list-details" style={{ fontSize: '16px', color: 'var(--color-primary)' }} />
                </div>
                <div>
                  <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 700, margin: 0, color: 'var(--color-foreground)' }}>
                    Realized P&amp;L Statement · {currentMonthSummary.fullMonthLabel}
                  </h3>
                  <span style={{ fontSize: '11px', color: 'var(--color-foreground-subtle)' }}>
                    Cash-Basis (Realized customer receipts vs direct &amp; operating outflows)
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPnlBreakdownModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--color-foreground-subtle)', cursor: 'pointer', fontSize: '18px' }}
              >
                <i className="ti ti-x" />
              </button>
            </div>

            {/* Revenue Row */}
            <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'var(--color-surface-raised)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-foreground)' }}>Realized Operating Revenue</span>
              <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--color-success)' }}>{formatINR(pnlStatement.revenue)}</span>
            </div>

            {/* COGS Section */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-foreground-muted)' }}>
                  Less: Cost of Goods &amp; Services (COGS)
                </span>
                <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-secondary)' }}>
                  −{formatINR(pnlStatement.cogs)}
                </span>
              </div>
              {pnlStatement.cogsBreakdown.map((item) => (
                <div key={item.category} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 8px', fontSize: '11px', color: 'var(--color-foreground-muted)' }}>
                  <span>{item.label} ({item.pct}%)</span>
                  <span>{formatINR(item.amount)}</span>
                </div>
              ))}
            </div>

            {/* Gross Profit Subtotal */}
            <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'var(--color-surface-raised)', border: '0.5px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-foreground)' }}>Gross Operating Profit</span>
                <div style={{ fontSize: '10px', color: 'var(--color-foreground-subtle)' }}>Gross Margin: {pnlStatement.grossMarginPct}%</div>
              </div>
              <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: pnlStatement.grossProfit >= 0 ? 'var(--color-primary)' : 'var(--color-danger)' }}>
                {formatINR(pnlStatement.grossProfit)}
              </span>
            </div>

            {/* OpEx Section */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-foreground-muted)' }}>
                  Less: Operating Overheads (OpEx)
                </span>
                <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-danger)' }}>
                  −{formatINR(pnlStatement.opex)}
                </span>
              </div>
              {pnlStatement.opexBreakdown.map((item) => (
                <div key={item.category} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 8px', fontSize: '11px', color: 'var(--color-foreground-muted)' }}>
                  <span>{item.label} ({item.pct}%)</span>
                  <span>{formatINR(item.amount)}</span>
                </div>
              ))}
            </div>

            {/* Net Profit Subtotal */}
            <div style={{ padding: '12px 14px', borderRadius: '8px', background: pnlStatement.netProfit >= 0 ? 'var(--color-primary-muted)' : 'var(--color-danger-muted)', border: `0.5px solid ${pnlStatement.netProfit >= 0 ? 'var(--color-primary)' : 'var(--color-danger)'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-foreground)' }}>Net Operating Income</span>
                <div style={{ fontSize: '10px', color: 'var(--color-foreground-subtle)' }}>Net Margin: {pnlStatement.netMarginPct}%</div>
              </div>
              <span style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: pnlStatement.netProfit >= 0 ? 'var(--color-primary)' : 'var(--color-danger)' }}>
                {formatINR(pnlStatement.netProfit)}
              </span>
            </div>

            <div className="financials-modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
              <Button variant="outline" onClick={() => setIsPnlBreakdownModalOpen(false)} style={{ height: '34px', fontSize: '11px' }}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL 11: FULL COMPREHENSIVE CASHFLOW & TRANSACTIONS LEDGER ─────── */}
      {isFullTransactionsModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: isModalFullscreen ? '0' : '16px',
          }}
          onClick={() => setIsFullTransactionsModalOpen(false)}
        >
          <div
            className={`financials-full-ledger-modal ${isModalFullscreen ? 'is-fullscreen' : ''}`}
            style={{
              width: isModalFullscreen ? '100vw' : '96vw',
              maxWidth: isModalFullscreen ? '100vw' : '1350px',
              height: isModalFullscreen ? '100vh' : '92vh',
              maxHeight: isModalFullscreen ? '100vh' : '94vh',
              background: 'var(--color-surface)',
              border: isModalFullscreen ? 'none' : '0.5px solid var(--color-border)',
              borderRadius: isModalFullscreen ? '0' : '16px',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '16px 22px',
                borderBottom: '0.5px solid var(--color-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px',
                background: 'var(--color-surface-raised)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '10px',
                    background: 'var(--color-primary-muted)',
                    color: 'var(--color-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '18px',
                  }}
                >
                  <i className="ti ti-receipt-2" />
                </div>
                <div>
                  <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 700, margin: 0, color: 'var(--color-foreground)' }}>
                    Comprehensive Cashflow Ledger
                  </h3>
                  <span style={{ fontSize: '11px', color: 'var(--color-foreground-subtle)' }}>
                    {fullLedgerScope === 'month'
                      ? currentMonthSummary.fullMonthLabel
                      : `${getPeriodLabel(selectedPeriod)} · ${fullLedgerStats.count} entries`}
                  </span>
                </div>
              </div>

              {/* Scope Switcher & Action Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                {/* Scope Toggle */}
                <div
                  style={{
                    display: 'inline-flex',
                    borderRadius: '8px',
                    border: '0.5px solid var(--color-border)',
                    background: 'var(--color-surface)',
                    padding: '2px',
                    gap: '2px',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setFullLedgerScope('month')}
                    style={{
                      border: 'none',
                      background: fullLedgerScope === 'month' ? 'var(--color-primary)' : 'transparent',
                      color: fullLedgerScope === 'month' ? '#ffffff' : 'var(--color-foreground-muted)',
                      fontSize: '11px',
                      fontWeight: fullLedgerScope === 'month' ? 600 : 500,
                      padding: '4px 10px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                    }}
                  >
                    {currentMonthSummary.monthLabel} {currentMonthSummary.year}
                  </button>
                  <button
                    type="button"
                    onClick={() => setFullLedgerScope('period')}
                    style={{
                      border: 'none',
                      background: fullLedgerScope === 'period' ? 'var(--color-primary)' : 'transparent',
                      color: fullLedgerScope === 'period' ? '#ffffff' : 'var(--color-foreground-muted)',
                      fontSize: '11px',
                      fontWeight: fullLedgerScope === 'period' ? 600 : 500,
                      padding: '4px 10px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                    }}
                  >
                    Full {getPeriodLabel(selectedPeriod)}
                  </button>
                </div>

                {/* Export CSV Button */}
                <Button
                  onClick={() =>
                    exportCashflowTransactionsCSV(
                      fullLedgerLineItems,
                      fullLedgerScope === 'month' ? currentMonthSummary.fullMonthLabel : selectedPeriod
                    )
                  }
                  style={{
                    height: '32px',
                    fontSize: '11px',
                    background: 'var(--color-primary)',
                    color: '#ffffff',
                    fontWeight: 600,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <i className="ti ti-download" style={{ fontSize: '13px' }} />
                  Export CSV
                </Button>

                {/* Fullscreen Toggle */}
                <button
                  type="button"
                  onClick={() => setIsModalFullscreen((prev) => !prev)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--color-foreground-subtle)',
                    cursor: 'pointer',
                    fontSize: '16px',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  title={isModalFullscreen ? 'Exit Fullscreen' : 'Open Fullscreen'}
                >
                  <i className={isModalFullscreen ? 'ti ti-minimize' : 'ti ti-maximize'} />
                </button>

                <button
                  type="button"
                  onClick={() => setIsFullTransactionsModalOpen(false)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--color-foreground-subtle)',
                    cursor: 'pointer',
                    fontSize: '18px',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <i className="ti ti-x" />
                </button>
              </div>
            </div>

            {/* Financial Totals Strip */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '12px',
                padding: '14px 22px',
                background: 'var(--color-surface)',
                borderBottom: '0.5px solid var(--color-border)',
              }}
            >
              <div style={{ padding: '8px 12px', borderRadius: '8px', background: 'var(--color-surface-raised)', border: '0.5px solid var(--color-border)' }}>
                <span style={{ fontSize: '10px', color: 'var(--color-foreground-subtle)', fontWeight: 600, textTransform: 'uppercase' }}>Total Inflows (Income)</span>
                <div style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--color-success)', marginTop: '2px' }}>
                  +{formatINR(fullLedgerStats.inflow)}
                </div>
              </div>

              <div style={{ padding: '8px 12px', borderRadius: '8px', background: 'var(--color-surface-raised)', border: '0.5px solid var(--color-border)' }}>
                <span style={{ fontSize: '10px', color: 'var(--color-foreground-subtle)', fontWeight: 600, textTransform: 'uppercase' }}>Total Outflows (Expenses)</span>
                <div style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--color-danger)', marginTop: '2px' }}>
                  −{formatINR(fullLedgerStats.outflow)}
                </div>
              </div>

              <div style={{ padding: '8px 12px', borderRadius: '8px', background: fullLedgerStats.net >= 0 ? 'var(--color-primary-muted)' : 'var(--color-danger-muted)', border: `0.5px solid ${fullLedgerStats.net >= 0 ? 'var(--color-primary)' : 'var(--color-danger)'}` }}>
                <span style={{ fontSize: '10px', color: 'var(--color-foreground-subtle)', fontWeight: 600, textTransform: 'uppercase' }}>Net Cash Position</span>
                <div style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: fullLedgerStats.net >= 0 ? 'var(--color-primary)' : 'var(--color-danger)', marginTop: '2px' }}>
                  {formatINR(fullLedgerStats.net)}
                </div>
              </div>

              <div style={{ padding: '8px 12px', borderRadius: '8px', background: 'var(--color-surface-raised)', border: '0.5px solid var(--color-border)' }}>
                <span style={{ fontSize: '10px', color: 'var(--color-foreground-subtle)', fontWeight: 600, textTransform: 'uppercase' }}>Records Matching</span>
                <div style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--color-foreground)', marginTop: '2px' }}>
                  {fullLedgerStats.count} Transactions
                </div>
              </div>
            </div>

            {/* Filter & Search Bar */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 22px',
                gap: '12px',
                flexWrap: 'wrap',
                background: 'var(--color-surface)',
                borderBottom: '0.5px solid var(--color-border)',
              }}
            >
              {/* Search */}
              <div style={{ position: 'relative', flex: '1', minWidth: '220px', maxWidth: '380px' }}>
                <i
                  className="ti ti-search"
                  style={{
                    position: 'absolute',
                    left: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    fontSize: '13px',
                    color: 'var(--color-foreground-subtle)',
                  }}
                />
                <input
                  type="text"
                  placeholder="Search client, vendor, note, reference..."
                  value={fullLedgerSearch}
                  onChange={(e) => setFullLedgerSearch(e.target.value)}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    height: '32px',
                    padding: '0 10px 0 30px',
                    borderRadius: '8px',
                    background: 'var(--color-surface-raised)',
                    border: '0.5px solid var(--color-border)',
                    fontSize: '12px',
                    color: 'var(--color-foreground)',
                    outline: 'none',
                  }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                {/* Type Filter */}
                <div
                  style={{
                    display: 'inline-flex',
                    borderRadius: '8px',
                    border: '0.5px solid var(--color-border)',
                    background: 'var(--color-surface-raised)',
                    padding: '2px',
                    gap: '2px',
                  }}
                >
                  {(['all', 'income', 'expense'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setFullLedgerTypeFilter(t)}
                      style={{
                        border: 'none',
                        background: fullLedgerTypeFilter === t ? 'var(--color-surface)' : 'transparent',
                        color:
                          fullLedgerTypeFilter === t
                            ? t === 'income'
                              ? 'var(--color-success)'
                              : t === 'expense'
                              ? 'var(--color-danger)'
                              : 'var(--color-foreground)'
                            : 'var(--color-foreground-muted)',
                        fontSize: '11px',
                        fontWeight: fullLedgerTypeFilter === t ? 600 : 500,
                        padding: '3px 8px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                      }}
                    >
                      {t === 'all' ? 'All Types' : t === 'income' ? 'Inflows' : 'Outflows'}
                    </button>
                  ))}
                </div>

                {/* Method Filter */}
                <select
                  value={fullLedgerMethodFilter}
                  onChange={(e) => setFullLedgerMethodFilter(e.target.value)}
                  style={{
                    height: '30px',
                    padding: '0 8px',
                    borderRadius: '6px',
                    background: 'var(--color-surface-raised)',
                    border: '0.5px solid var(--color-border)',
                    color: 'var(--color-foreground)',
                    fontSize: '11px',
                    fontWeight: 500,
                    outline: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <option value="all">All Payment Methods</option>
                  <option value="cash">Cash Only</option>
                  <option value="upi">GPay / UPI / PhonePe</option>
                  <option value="bank">Bank Transfer / NEFT</option>
                </select>
              </div>
            </div>

            {/* Scrollable Table Area */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0' }}>
              {fullLedgerLineItems.length === 0 ? (
                <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--color-foreground-subtle)', fontSize: 'var(--text-sm)' }}>
                  <i className="ti ti-receipt-off" style={{ fontSize: '32px', display: 'block', marginBottom: '8px', opacity: 0.5 }} />
                  No transactions match the selected filters or search.
                </div>
              ) : (
                <>
                  {/* Desktop Table View */}
                  <div className="financials-desktop-table" style={{ width: '100%', overflowX: 'auto' }}>
                    <table
                      style={{
                        width: '100%',
                        borderCollapse: 'collapse',
                        fontSize: 'var(--text-xs)',
                        textAlign: 'left',
                      }}
                    >
                      <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                        <tr style={{ background: 'var(--color-surface-raised)', borderBottom: '0.5px solid var(--color-border-strong)' }}>
                          <th style={{ padding: '10px 16px', fontWeight: 600, color: 'var(--color-foreground-subtle)' }}>Date</th>
                          <th style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--color-foreground-subtle)' }}>Type</th>
                          <th style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--color-foreground-subtle)' }}>Particulars / Client / Vendor</th>
                          <th style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--color-foreground-subtle)' }}>Category</th>
                          <th style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--color-foreground-subtle)' }}>Method &amp; Details</th>
                          <th style={{ padding: '10px 16px', fontWeight: 600, color: 'var(--color-foreground-subtle)', textAlign: 'right' }}>Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {fullLedgerLineItems.map((item) => {
                          const dateFormatted =
                            item.date instanceof Date && !isNaN(item.date.getTime())
                              ? item.date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                              : '—'
                          const isIncome = item.type === 'income'

                          return (
                            <tr
                              key={item.id}
                              style={{
                                borderBottom: '0.5px solid var(--color-border)',
                                transition: 'background 0.1s ease',
                              }}
                            >
                              <td style={{ padding: '10px 16px', whiteSpace: 'nowrap', color: 'var(--color-foreground-muted)', fontWeight: 500 }}>
                                {dateFormatted}
                              </td>
                              <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                                <span
                                  style={{
                                    padding: '2px 8px',
                                    borderRadius: '6px',
                                    fontSize: '10px',
                                    fontWeight: 700,
                                    background: isIncome ? 'var(--color-success-muted)' : 'var(--color-danger-muted)',
                                    color: isIncome ? 'var(--color-success)' : 'var(--color-danger)',
                                    textTransform: 'uppercase',
                                  }}
                                >
                                  {isIncome ? 'Inflow' : 'Outflow'}
                                </span>
                              </td>
                              <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--color-foreground)' }}>
                                {item.label}
                              </td>
                              <td style={{ padding: '10px 14px', color: 'var(--color-foreground-muted)', whiteSpace: 'nowrap' }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                  <i className={`ti ${item.icon}`} style={{ fontSize: '13px', color: item.iconFg }} />
                                  {item.category}
                                </span>
                              </td>
                              <td style={{ padding: '10px 14px', color: 'var(--color-foreground-subtle)', fontSize: '11px' }}>
                                {item.meta}
                              </td>
                              <td
                                style={{
                                  padding: '10px 16px',
                                  textAlign: 'right',
                                  fontWeight: 700,
                                  color: isIncome ? 'var(--color-success)' : 'var(--color-danger)',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {isIncome ? `+${formatINR(item.amount)}` : `−${formatINR(item.amount)}`}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Card List View */}
                  <div className="financials-mobile-cards" style={{ padding: '12px' }}>
                    {fullLedgerLineItems.map((item) => {
                      const dateFormatted =
                        item.date instanceof Date && !isNaN(item.date.getTime())
                          ? item.date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                          : '—'
                      const isIncome = item.type === 'income'

                      return (
                        <div
                          key={item.id}
                          style={{
                            padding: '12px',
                            background: 'var(--color-surface-raised)',
                            border: '0.5px solid var(--color-border)',
                            borderRadius: '10px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '6px',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '11px', color: 'var(--color-foreground-subtle)' }}>{dateFormatted}</span>
                            <span
                              style={{
                                padding: '2px 6px',
                                borderRadius: '4px',
                                fontSize: '10px',
                                fontWeight: 700,
                                background: isIncome ? 'var(--color-success-muted)' : 'var(--color-danger-muted)',
                                color: isIncome ? 'var(--color-success)' : 'var(--color-danger)',
                              }}
                            >
                              {isIncome ? 'INFLOW' : 'OUTFLOW'}
                            </span>
                          </div>
                          <div style={{ fontWeight: 600, fontSize: 'var(--text-xs)', color: 'var(--color-foreground)' }}>
                            {item.label}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--color-foreground-subtle)' }}>
                            {item.meta}
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px', borderTop: '0.5px solid var(--color-border)', paddingTop: '6px' }}>
                            <span style={{ fontSize: '11px', color: 'var(--color-foreground-muted)' }}>{item.category}</span>
                            <span style={{ fontWeight: 700, fontSize: 'var(--text-sm)', color: isIncome ? 'var(--color-success)' : 'var(--color-danger)' }}>
                              {isIncome ? `+${formatINR(item.amount)}` : `−${formatINR(item.amount)}`}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: '12px 22px',
                borderTop: '0.5px solid var(--color-border)',
                background: 'var(--color-surface-raised)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span style={{ fontSize: '11px', color: 'var(--color-foreground-subtle)' }}>
                Showing {fullLedgerLineItems.length} transactions · Studio Zoom Financial Suite
              </span>
              <Button
                variant="outline"
                onClick={() => setIsFullTransactionsModalOpen(false)}
                style={{ height: '34px', fontSize: '11px' }}
              >
                Close Ledger
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL: ADD / EDIT BANK ACCOUNT MODAL ───────────────────────── */}
      {isAddBankAccountOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
          onClick={() => setIsAddBankAccountOpen(false)}
        >
          <div
            className="financials-modal-dialog"
            style={{
              width: '100%',
              maxWidth: '480px',
              background: 'var(--color-surface)',
              border: '0.5px solid var(--color-border)',
              borderRadius: '14px',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '10px',
                    background: 'var(--color-primary-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--color-primary)',
                  }}
                >
                  <i className="ti ti-building-bank" style={{ fontSize: '18px' }} />
                </div>
                <div>
                  <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 700, margin: 0, color: 'var(--color-foreground)' }}>
                    {editingBankAccount ? 'Edit Bank Account' : 'Add Bank Account'}
                  </h3>
                  <span style={{ fontSize: '11px', color: 'var(--color-foreground-subtle)' }}>
                    Configure settlement bank account for client payment receipts
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddBankAccountOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--color-foreground-subtle)', cursor: 'pointer', fontSize: '18px' }}
              >
                <i className="ti ti-x" />
              </button>
            </div>

            {/* Error Message */}
            {bankModalError && (
              <div
                style={{
                  padding: '8px 12px',
                  borderRadius: '6px',
                  background: 'var(--color-danger-muted)',
                  color: 'var(--color-danger)',
                  fontSize: '12px',
                  fontWeight: 500,
                }}
              >
                {bankModalError}
              </div>
            )}

            {/* Form Fields */}
            <div className="financials-modal-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-foreground-muted)' }}>
                  Nickname *
                </label>
                <Input
                  placeholder="e.g. Studio HDFC / Father's SBI"
                  value={bankModalNickname}
                  onChange={(e) => setBankModalNickname(e.target.value)}
                  style={{ height: '36px', fontSize: '12px' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-foreground-muted)' }}>
                  Bank Name *
                </label>
                <Input
                  placeholder="e.g. HDFC Bank / State Bank of India"
                  value={bankModalName}
                  onChange={(e) => setBankModalName(e.target.value)}
                  style={{ height: '36px', fontSize: '12px' }}
                />
              </div>
            </div>

            <div className="financials-modal-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-foreground-muted)' }}>
                  Account Holder *
                </label>
                <Input
                  placeholder="e.g. Studio Zoom LLP / Father Name"
                  value={bankModalHolder}
                  onChange={(e) => setBankModalHolder(e.target.value)}
                  style={{ height: '36px', fontSize: '12px' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-foreground-muted)' }}>
                  Masked A/C Number
                </label>
                <Input
                  placeholder="e.g. •••• 4892"
                  value={bankModalMasked}
                  onChange={(e) => setBankModalMasked(e.target.value)}
                  style={{ height: '36px', fontSize: '12px' }}
                />
              </div>
            </div>

            <div className="financials-modal-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-foreground-muted)' }}>
                  UPI ID (Optional)
                </label>
                <Input
                  placeholder="e.g. studio@okaxis"
                  value={bankModalUpi}
                  onChange={(e) => setBankModalUpi(e.target.value)}
                  style={{ height: '36px', fontSize: '12px' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-foreground-muted)' }}>
                  IFSC Code (Optional)
                </label>
                <Input
                  placeholder="e.g. HDFC0001234"
                  value={bankModalIfsc}
                  onChange={(e) => setBankModalIfsc(e.target.value)}
                  style={{ height: '36px', fontSize: '12px' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-foreground-muted)' }}>
                  Opening Balance (₹) (Optional)
                </label>
                <span style={{ fontSize: '10px', color: 'var(--color-foreground-subtle)' }}>
                  Default: ₹0
                </span>
              </div>
              <Input
                type="number"
                placeholder="0"
                value={bankModalOpening}
                onChange={(e) => setBankModalOpening(e.target.value)}
                style={{ height: '36px', fontSize: '12px' }}
              />
              <span style={{ fontSize: '10px', color: 'var(--color-foreground-subtle)', lineHeight: 1.3 }}>
                Leave 0 if you manage your studio&apos;s overall treasury balances via the Liquid Cash Position card (Baseline Set).
              </span>
            </div>

            {/* Default toggle */}
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
                fontSize: '12px',
                color: 'var(--color-foreground)',
                padding: '6px 0',
              }}
            >
              <input
                type="checkbox"
                checked={bankModalIsDefault}
                onChange={(e) => setBankModalIsDefault(e.target.checked)}
                style={{ width: '16px', height: '16px', accentColor: 'var(--color-primary)', cursor: 'pointer' }}
              />
              <span>Set as default account for electronic receipts (GPay, Transfer, Cheque)</span>
            </label>

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
              <Button
                variant="outline"
                type="button"
                onClick={() => setIsAddBankAccountOpen(false)}
                disabled={savingBankAccount}
                style={{ height: '36px', fontSize: '12px' }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleSaveBankAccountSubmit}
                disabled={savingBankAccount}
                style={{
                  height: '36px',
                  fontSize: '12px',
                  fontWeight: 600,
                  background: 'var(--color-primary)',
                  color: '#ffffff',
                }}
              >
                {savingBankAccount ? 'Saving...' : editingBankAccount ? 'Update Account' : 'Save Account'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

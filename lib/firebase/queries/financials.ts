import {
  collection,
  collectionGroup,
  query,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  serverTimestamp,
  Timestamp,
  writeBatch,
  increment,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import type { Expense, Client, Budget, ExpenseCategory, AccountPayable, CashOpeningBalances, CustomExpenseCategory } from '@/types'
export type { CashOpeningBalances }

export interface ClientPaymentRecord {
  paymentId: string
  clientId: string
  amount: number
  date: Date
  method: string
  instalment?: string
  transactionId?: string
  recordedByName?: string
}

// ─── TYPES ──────────────────────────────────────────────────────────────────

export type AccountingCategoryType = 'cogs' | 'opex'

export const CATEGORY_ACCOUNTING_TYPE: Record<string, AccountingCategoryType> = {
  freelancer: 'cogs',
  freelancers: 'cogs',
  props: 'cogs',
  equipment: 'cogs',
  production: 'cogs',
  editing: 'cogs',
  travel: 'cogs',
  studioRent: 'opex',
  salaries: 'opex',
  utilities: 'opex',
  marketing: 'opex',
  maintenance: 'opex',
  software: 'opex',
  misc: 'opex',
  general: 'opex',
}

export interface RealizedPnLStatement {
  revenue: number
  cogs: number
  cogsBreakdown: { category: string; label: string; amount: number; pct: number }[]
  grossProfit: number
  grossMarginPct: number
  opex: number
  opexBreakdown: { category: string; label: string; amount: number; pct: number }[]
  netProfit: number
  netMarginPct: number
  basis: 'cash'
}

export interface GstTaxSummary {
  outputTaxableAmount: number
  outputGst: number
  inputTaxableAmount: number
  eligibleInputGst: number
  ineligibleInputGst: number
  netGstPayable: number
  netItcCarryForward: number
  itemsWithGstCount: number
}

export type ForecastScenario = 'expected' | 'optimistic' | 'conservative'

export interface BudgetAlert {
  category: string
  label: string
  percentUsed: number
  excessAmount: number
  severity: 'warning' | 'danger'
}

export interface FinancialLineItem {
  id: string
  date: Date
  type: 'income' | 'expense'
  category: string
  label: string
  meta: string
  amount: number
  signedAmount: number
  icon: string
  iconBg: string
  iconFg: string
  amtColor: string
  clientId?: string
  projectId?: string
  invoiceNumber?: string
}

export interface MonthlyFinancialSummary {
  monthKey: string        // e.g. "2026-07"
  monthLabel: string      // e.g. "Jul"
  fullMonthLabel: string  // e.g. "July 2026"
  year: number
  month: number           // 1 - 12
  income: number
  incomeCount: number
  outflow: number
  outflowCount: number
  net: number
  marginPct: number
  mainOutflowType: string
  lineItems: FinancialLineItem[]
}

export interface BudgetVsActualRow {
  category: ExpenseCategory | string
  label: string
  icon: string
  budget: number
  actual: number
  variance: number        // budget - actual
  percentUsed: number     // (actual / budget) * 100
  status: 'onTrack' | 'nearLimit' | 'overBudget'
  statusLabel: string
  badgeBg: string
  badgeFg: string
  varColor: string
  isCustom?: boolean
  customCategoryId?: string
}

export interface OutstandingReceivable {
  id: string
  clientId: string
  clientName: string
  clientPhone: string
  clientEmail: string
  eventName: string
  invoiceNumber: string
  totalAmount: number
  amountPaid: number
  balanceDue: number
  dueDate: Date
  isOverdue: boolean
  daysPastDue: number
  agingBucket: 'current' | '31-60' | '60+'
  paymentStatus: string
  lastRemindedAt?: Date
  reminderCount?: number
  lastReminderMethod?: string
}

export interface ReceivablesAgingSummary {
  current: { count: number; total: number }       // 0 - 30 days
  aging31to60: { count: number; total: number }   // 31 - 60 days
  aging60plus: { count: number; total: number }   // 60+ days
  totalBalanceDue: number
}

export interface PayablesSummary {
  totalPayable: number
  overduePayable: number
  dueThisWeek: number
  pendingCount: number
  overdueCount: number
}

export interface CashflowForecastMonth {
  monthKey: string
  monthLabel: string
  year: number
  month: number
  projectedInflow: number
  projectedOutflow: number
  projectedNet: number
  projectedClosingBalance: number
  inflowNote: string
  outflowNote: string
  collectionRate: number
  scenario: ForecastScenario
}

export interface CashPositionSummary {
  cashInHand: number
  cashInBank: number
  cashInUPI: number
  totalAvailable: number
  monthlyBurnRate: number
  runwayMonths: number
  hasCustomOpeningBalances: boolean
  asOfDate?: Date
}

export interface OutflowCategoryBreakdown {
  category: string
  label: string
  amount: number
  percentage: number
  icon: string
}

export interface ProjectProfitabilitySummary {
  projectId: string
  clientId: string
  projectName: string
  clientName: string
  eventDate: Date
  packageType: string
  revenue: number
  directExpenses: number
  netProfit: number
  marginPct: number
  marginTier: 'high' | 'healthy' | 'low' | 'deficit'
  expenseItems: Expense[]
}

// ─── DEFAULT BASELINE BUDGETS ───────────────────────────────────────────────
export const DEFAULT_CATEGORY_BUDGETS: Record<string, number> = {
  freelancer: 150000,
  equipment: 60000,
  travel: 35000,
  studioRent: 50000,
  utilities: 15000,
  propsSets: 20000,
  marketing: 25000,
  salaries: 120000,
  misc: 15000,
}

// Category icons & labels
export const CATEGORY_META: Record<string, { label: string; icon: string }> = {
  freelancer: { label: 'Freelancer Payouts', icon: 'ti-camera' },
  equipment:  { label: 'Equipment & Service', icon: 'ti-device-camera-phone' },
  travel:     { label: 'Travel & Conveyance', icon: 'ti-car' },
  studioRent: { label: 'Studio Rent', icon: 'ti-building' },
  utilities:  { label: 'Power & Utilities', icon: 'ti-bolt' },
  propsSets:  { label: 'Props & Sets', icon: 'ti-palette' },
  marketing:  { label: 'Marketing & Ads', icon: 'ti-speakerphone' },
  salaries:   { label: 'Staff Salaries', icon: 'ti-users' },
  misc:       { label: 'General & Misc', icon: 'ti-dots' },
}

/**
 * Returns display label and icon for a category key, checking standard CATEGORY_META
 * first, then customCategories, falling back to a clean capitalized string.
 */
export function getCategoryMeta(
  categoryKey: string,
  customCategories: CustomExpenseCategory[] = []
): { label: string; icon: string } {
  if (CATEGORY_META[categoryKey]) {
    return CATEGORY_META[categoryKey]
  }
  const custom = customCategories.find((c) => c.key === categoryKey)
  if (custom) {
    return { label: custom.label, icon: custom.icon || 'ti-tag' }
  }
  const fallbackLabel = categoryKey
    .replace(/^custom_/, '')
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim()
  return { label: fallbackLabel || categoryKey, icon: 'ti-tag' }
}

function parseDate(val: unknown, fallback: Date = new Date()): Date {
  if (!val) return fallback
  if (val instanceof Date && !isNaN(val.getTime())) return val
  if (typeof (val as { toDate?: () => Date }).toDate === 'function') {
    const d = (val as { toDate: () => Date }).toDate()
    if (!isNaN(d.getTime())) return d
  }
  if (typeof val === 'object' && val !== null) {
    if ('seconds' in val && typeof (val as { seconds: number }).seconds === 'number') {
      const d = new Date((val as { seconds: number }).seconds * 1000)
      if (!isNaN(d.getTime())) return d
    }
  }
  const parsed = new Date(val as string | number)
  return !isNaN(parsed.getTime()) ? parsed : fallback
}

function parseDateNullable(val: unknown): Date | undefined {
  if (!val) return undefined
  if (val instanceof Date) return isNaN(val.getTime()) ? undefined : val
  if (typeof (val as { toDate?: () => Date }).toDate === 'function') {
    const d = (val as { toDate: () => Date }).toDate()
    return isNaN(d.getTime()) ? undefined : d
  }
  if (typeof val === 'object' && val !== null) {
    if ('seconds' in val && typeof (val as { seconds: number }).seconds === 'number') {
      const d = new Date((val as { seconds: number }).seconds * 1000)
      return isNaN(d.getTime()) ? undefined : d
    }
  }
  const parsed = new Date(val as string | number)
  return !isNaN(parsed.getTime()) ? parsed : undefined
}

// ─── BUDGET CRUD ────────────────────────────────────────────────────────────

export function subscribeToBudgets(
  callback: (budgets: Budget[]) => void
): () => void {
  const q = query(collection(db, 'budgets'))
  return onSnapshot(
    q,
    snap => {
      const list: Budget[] = snap.docs.map(d => {
        const data = d.data() as Record<string, unknown>
        return {
          budgetId: d.id,
          category: (data.category as ExpenseCategory) || 'misc',
          period: (data.period as 'monthly' | 'annual') || 'monthly',
          year: Number(data.year) || new Date().getFullYear(),
          month: data.month !== undefined && data.month !== null ? Number(data.month) : undefined,
          budgetedAmount: Number(data.budgetedAmount) || 0,
        }
      })
      callback(list)
    },
    err => {
      console.warn('[Financials] Budgets subscription warning:', err)
      callback([])
    }
  )
}

export async function saveBudgetAmount(
  category: string,
  amount: number,
  year: number = new Date().getFullYear(),
  month?: number
): Promise<void> {
  const docId = month !== undefined ? `budget_${year}_${month}_${category}` : `budget_${year}_${category}`
  const ref = doc(db, 'budgets', docId)

  await setDoc(
    ref,
    {
      budgetId: docId,
      category,
      period: month !== undefined ? 'monthly' : 'annual',
      year,
      month: month !== undefined ? month : null,
      budgetedAmount: Math.max(0, amount),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  )
}

export async function copyBudgetsFromPreviousMonth(
  fromYear: number,
  fromMonth: number,
  toYear: number,
  toMonth: number,
  budgetsList: Budget[],
  customCategories: CustomExpenseCategory[] = []
): Promise<number> {
  let copiedCount = 0
  const defaultCategories = Object.keys(DEFAULT_CATEGORY_BUDGETS)
  const customKeys = customCategories.map((c) => c.key)
  const allCategories = Array.from(new Set([...defaultCategories, ...customKeys]))

  for (const cat of allCategories) {
    const prev = budgetsList.find((b) => b.year === fromYear && b.month === fromMonth && b.category === cat)
    const customCat = customCategories.find((c) => c.key === cat)
    const defaultAmt = customCat?.defaultBudget ?? DEFAULT_CATEGORY_BUDGETS[cat] ?? 25000
    const amountToCopy = prev ? prev.budgetedAmount : defaultAmt
    await saveBudgetAmount(cat, amountToCopy, toYear, toMonth)
    copiedCount++
  }

  return copiedCount
}

// ─── ALL CLIENT PAYMENTS (CROSS-CLIENT CASH INFLOWS) ─────────────────────────

export function subscribeToAllClientPayments(
  callback: (payments: ClientPaymentRecord[]) => void
): () => void {
  const q = query(collectionGroup(db, 'payments'))
  return onSnapshot(
    q,
    snap => {
      const list: ClientPaymentRecord[] = snap.docs.map(d => {
        const data = d.data()
        const parentClientId = d.ref.parent?.parent?.id || ''
        return {
          paymentId: d.id,
          clientId: parentClientId,
          amount: Number(data.amount) || 0,
          date: parseDate(data.date),
          method: (data.method as string) || 'bankTransfer',
          instalment: (data.instalment as string) || '',
          transactionId: (data.transactionId as string) || '',
          recordedByName: (data.recordedByName as string) || '',
        }
      })
      callback(list)
    },
    err => {
      console.warn('[Financials] Payments collectionGroup subscription warning:', err)
      callback([])
    }
  )
}

// ─── ACCOUNTS PAYABLE CRUD (MONEY WE OWE) ───────────────────────────────────

export function subscribeToPayables(
  callback: (payables: AccountPayable[]) => void
): () => void {
  const q = query(collection(db, 'payables'))
  return onSnapshot(
    q,
    snap => {
      const today = new Date().getTime()
      const list: AccountPayable[] = snap.docs
        .map(d => {
          const data = d.data() as Record<string, unknown>
          const dueDate = parseDate(data.dueDate)
          let status: 'pending' | 'overdue' | 'paid' = (data.status as 'pending' | 'overdue' | 'paid') || 'pending'
          if (status === 'pending' && dueDate.getTime() < today) {
            status = 'overdue'
          }

          return {
            payableId: d.id,
            vendorName: (data.vendorName as string) || 'Unnamed Vendor',
            category: (data.category as ExpenseCategory) || 'misc',
            billNumber: (data.billNumber as string) || '',
            amount: Number(data.amount) || 0,
            dueDate,
            status,
            note: (data.note as string) || '',
            projectId: (data.projectId as string) || '',
            projectName: (data.projectName as string) || '',
            paidDate: data.paidDate ? parseDate(data.paidDate) : undefined,
            paymentMethod: (data.paymentMethod as string) || '',
            createdAt: parseDate(data.createdAt),
            isDeleted: Boolean(data.isDeleted),
          }
        })
        .filter(p => !p.isDeleted)
        .sort((a, b) => {
          // Sort: pending/overdue first, then by dueDate ascending
          if (a.status !== 'paid' && b.status === 'paid') return -1
          if (a.status === 'paid' && b.status !== 'paid') return 1
          return a.dueDate.getTime() - b.dueDate.getTime()
        })

      callback(list)
    },
    err => {
      console.warn('[Financials] Payables subscription warning:', err)
      callback([])
    }
  )
}

export async function createPayable(
  data: Omit<AccountPayable, 'payableId' | 'createdAt' | 'status'> & {
    status?: 'pending' | 'overdue' | 'paid'
    vendorGstin?: string
    gstAmount?: number
    gstRate?: number
  }
): Promise<string> {
  const ref = doc(collection(db, 'payables'))
  const payableId = ref.id

  await setDoc(ref, {
    payableId,
    vendorName: data.vendorName.trim(),
    vendorGstin: data.vendorGstin?.trim() || '',
    category: data.category,
    billNumber: data.billNumber?.trim() || `BILL-${Math.floor(1000 + Math.random() * 9000)}`,
    amount: Math.max(0, data.amount),
    gstAmount: Math.max(0, data.gstAmount || 0),
    gstRate: data.gstRate || 0,
    dueDate: Timestamp.fromDate(data.dueDate),
    status: data.status || 'pending',
    note: data.note?.trim() || '',
    projectId: data.projectId?.trim() || '',
    projectName: data.projectName?.trim() || '',
    createdAt: serverTimestamp(),
    isDeleted: false,
  })

  return payableId
}

/**
 * Atomically marks a payable as settled and creates the linked expense record
 * within a single Firestore transaction/batch to prevent orphaned entries or double counts.
 */
export async function markPayableAsPaid(
  payableId: string,
  paymentMethod: string = 'bankTransfer',
  paidDate: Date = new Date(),
  payableData?: {
    vendorName: string
    category: ExpenseCategory | string
    amount: number
    projectId?: string
    projectName?: string
    note?: string
    billNumber?: string
    vendorGstin?: string
    gstAmount?: number
    gstRate?: number
    isGstClaimable?: boolean
    existingExpenseId?: string
  }
): Promise<void> {
  const batch = writeBatch(db)
  const payableRef = doc(db, 'payables', payableId)

  let finalExpenseId = payableData?.existingExpenseId

  // Only create a new expense if one is not already linked to avoid double-counting
  if (!finalExpenseId && payableData) {
    const expenseDocRef = doc(collection(db, 'expenses'))
    finalExpenseId = expenseDocRef.id

    batch.set(expenseDocRef, {
      expenseId: finalExpenseId,
      code: `EXP-${Math.floor(1000 + Math.random() * 9000)}`,
      date: Timestamp.fromDate(paidDate),
      category: (payableData.category as ExpenseCategory) || 'misc',
      amount: payableData.amount,
      method: paymentMethod,
      vendor: payableData.vendorName,
      note: `Payable settled (${payableData.billNumber || payableId}): ${payableData.note || ''}`.trim(),
      description: `Settlement for ${payableData.vendorName}`,
      projectId: payableData.projectId || '',
      projectName: payableData.projectName || '',
      source: 'payable',
      payableId,
      vendorGstin: payableData.vendorGstin || '',
      gstAmount: payableData.gstAmount || 0,
      gstRate: payableData.gstRate || 0,
      isGstClaimable: payableData.isGstClaimable ?? true,
      createdBy: 'Admin',
      createdAt: serverTimestamp(),
      isDeleted: false,
    })
  }

  batch.update(payableRef, {
    status: 'paid',
    paymentMethod,
    paidDate: Timestamp.fromDate(paidDate),
    expenseId: finalExpenseId || '',
    updatedAt: serverTimestamp(),
  })

  await batch.commit()
}

export async function deletePayable(payableId: string): Promise<void> {
  const ref = doc(db, 'payables', payableId)
  await updateDoc(ref, {
    isDeleted: true,
    deletedAt: serverTimestamp(),
  })
}

/**
 * Tracks reminder actions (WhatsApp, Email, Copy) on client documents
 * to prevent over-notifying and provide clear audit history.
 */
export async function logInvoiceReminder(
  clientId: string,
  method: 'whatsapp' | 'email' | 'clipboard' = 'whatsapp',
  clientName?: string,
  invoiceNumber?: string
): Promise<void> {
  if (!clientId) return
  try {
    const clientRef = doc(db, 'clients', clientId)
    const updatePayload: Record<string, unknown> = {
      lastRemindedAt: serverTimestamp(),
      reminderCount: increment(1),
      lastReminderMethod: method,
      updatedAt: serverTimestamp(),
    }
    if (clientName) updatePayload.lastRemindedClientName = clientName
    if (invoiceNumber) updatePayload.lastRemindedInvoice = invoiceNumber

    await updateDoc(clientRef, updatePayload)
  } catch (err) {
    console.warn('[Financials] Could not log invoice reminder:', err)
  }
}

/**
 * Subscribes to configured Cash Opening Balances in studioSettings/cashPosition.
 */
export function subscribeToCashOpeningBalances(
  onData: (data: CashOpeningBalances | null) => void
): () => void {
  const ref = doc(db, 'studioSettings', 'cashPosition')
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        onData(null)
        return
      }
      const d = snap.data()
      onData({
        cashInBank: Number(d.cashInBank) || 0,
        cashInUPI: Number(d.cashInUPI) || 0,
        cashInHand: Number(d.cashInHand) || 0,
        asOfDate: d.asOfDate?.toDate
          ? d.asOfDate.toDate()
          : d.asOfDate
          ? new Date(d.asOfDate)
          : d.updatedAt?.toDate
          ? d.updatedAt.toDate()
          : new Date(),
        updatedAt: d.updatedAt?.toDate ? d.updatedAt.toDate() : undefined,
        updatedBy: d.updatedBy || '',
      })
    },
    (err) => {
      console.warn('[Financials] Failed to subscribe to cash opening balances:', err)
      onData(null)
    }
  )
}

/**
 * Updates baseline opening balances for Bank, UPI, and Cash in Hand.
 */
export async function saveCashOpeningBalances(balances: {
  cashInBank: number
  cashInUPI: number
  cashInHand: number
  asOfDate?: Date
  updatedBy?: string
}): Promise<void> {
  const ref = doc(db, 'studioSettings', 'cashPosition')
  await setDoc(
    ref,
    {
      cashInBank: Math.max(0, balances.cashInBank),
      cashInUPI: Math.max(0, balances.cashInUPI),
      cashInHand: Math.max(0, balances.cashInHand),
      asOfDate: balances.asOfDate ? Timestamp.fromDate(balances.asOfDate) : Timestamp.now(),
      updatedAt: serverTimestamp(),
      updatedBy: balances.updatedBy || 'Admin',
    },
    { merge: true }
  )
}

/**
 * Generates an export-ready CSV string for GSTR-1 and GSTR-3B filing and ITC reconciliation.
 */
export function exportGstSummaryCSV(
  expenses: Expense[],
  clients: Client[],
  periodLabel: string = 'Current_Period'
): string {
  const lines: string[] = []
  lines.push('STUDIO ZOOM — GST REPORT & ITC RECONCILIATION')
  lines.push(`Period: ${periodLabel}`)
  lines.push(`Generated: ${new Date().toLocaleDateString('en-IN')}`)
  lines.push('')

  // Section 1: Output Tax (Client Collections)
  lines.push('SECTION 1: OUTWARD SUPPLIES (OUTPUT GST COLLECTED ON SERVICES)')
  lines.push('Invoice / ID,Client Name,Contact,Gross Received (INR),Taxable Value (INR),CGST 9% (INR),SGST 9% (INR),Total GST (INR)')
  let totalOutputGross = 0
  let totalOutputTaxable = 0
  let totalOutputCgst = 0
  let totalOutputSgst = 0
  let totalOutputGst = 0

  for (const c of clients) {
    if (c.isDeleted) continue
    const paid = (Number(c.totalAmount) || 0) - (Number(c.balanceDue) || 0)
    if (paid <= 0) continue
    const gst = Math.round((paid * 18) / 118)
    const base = paid - gst
    const half = Math.round(gst / 2)
    totalOutputGross += paid
    totalOutputTaxable += base
    totalOutputCgst += half
    totalOutputSgst += (gst - half)
    totalOutputGst += gst

    const inv = c.invoiceNumber || `ZS-INV-${c.clientId.slice(-4).toUpperCase()}`
    lines.push(`"${inv}","${c.name}","${c.contact || ''}",${paid},${base},${half},${gst - half},${gst}`)
  }
  lines.push(`TOTAL OUTWARD SUPPLIES,,,${totalOutputGross},${totalOutputTaxable},${totalOutputCgst},${totalOutputSgst},${totalOutputGst}`)
  lines.push('')

  // Section 2: Input Tax Credit (ITC on Expenses)
  lines.push('SECTION 2: INWARD SUPPLIES (INPUT TAX CREDIT - ITC)')
  lines.push('Expense Code,Vendor Name,Vendor GSTIN,Category,Gross Amount (INR),Taxable Value (INR),GST Rate (%),ITC Claimable?,Total ITC (INR)')
  let totalInputGross = 0
  let totalInputTaxable = 0
  let totalEligibleItc = 0
  let totalIneligibleItc = 0

  for (const e of expenses) {
    if (e.isDeleted) continue
    const amt = Number(e.amount) || 0
    let gst = Number(e.gstAmount) || 0
    if (gst === 0 && (e.category === 'equipment' || e.category === 'software')) {
      gst = Math.round((amt * 18) / 118)
    }
    const base = amt - gst
    const isClaimable = e.isGstClaimable !== false
    totalInputGross += amt
    totalInputTaxable += base
    if (isClaimable) totalEligibleItc += gst
    else totalIneligibleItc += gst

    lines.push(`"${e.code || e.expenseId}","${e.vendor || 'Vendor'}","${e.vendorGstin || 'N/A'}","${e.category}",${amt},${base},${e.gstRate || 18},"${isClaimable ? 'YES' : 'NO (Blocked)'}",${gst}`)
  }
  lines.push(`TOTAL INWARD SUPPLIES,,,,${totalInputGross},${totalInputTaxable},,,${totalEligibleItc + totalIneligibleItc}`)
  lines.push('')

  // Section 3: Net Tax Liability
  const netTax = Math.max(0, totalOutputGst - totalEligibleItc)
  const itcCarry = Math.max(0, totalEligibleItc - totalOutputGst)
  lines.push('SECTION 3: TAX LIABILITY SUMMARY (GSTR-3B PREPARATION)')
  lines.push(`Total Output GST Collected,${totalOutputGst}`)
  lines.push(`Eligible Input Tax Credit (ITC),${totalEligibleItc}`)
  lines.push(`Ineligible ITC (Blocked),${totalIneligibleItc}`)
  lines.push(`Net GST Payable in Cash,${netTax}`)
  lines.push(`Net ITC Carry Forward Balance,${itcCarry}`)

  return lines.join('\n')
}

/**
 * Generates and downloads a formatted CSV spreadsheet of cashflow transactions (line items).
 */
export function exportCashflowTransactionsCSV(
  lineItems: FinancialLineItem[],
  periodLabel: string = 'Current_Period'
): void {
  if (typeof window === 'undefined') return

  const lines: string[] = []
  lines.push('STUDIO ZOOM — CASHFLOW TRANSACTIONS LEDGER')
  lines.push(`Period: ${periodLabel}`)
  lines.push(`Generated: ${new Date().toLocaleDateString('en-IN')} ${new Date().toLocaleTimeString('en-IN')}`)
  lines.push(`Total Transactions: ${lineItems.length}`)
  lines.push('')
  lines.push('Date,Type,Category,Description / Client / Vendor,Details / Method,Amount (INR),Net Cashflow Impact (INR)')

  for (const item of lineItems) {
    const dateStr = item.date instanceof Date && !isNaN(item.date.getTime())
      ? item.date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
      : ''
    const typeStr = item.type === 'income' ? 'INFLOW (INCOME)' : 'OUTFLOW (EXPENSE)'
    const category = `"${(item.category || '').replace(/"/g, '""')}"`
    const desc = `"${(item.label || '').replace(/"/g, '""')}"`
    const meta = `"${(item.meta || '').replace(/"/g, '""')}"`
    const amt = item.amount
    const signedAmt = item.type === 'income' ? item.amount : -item.amount

    lines.push(`"${dateStr}",${typeStr},${category},${desc},${meta},${amt},${signedAmt}`)
  }

  const csvContent = lines.join('\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `StudioZoom_Cashflow_Transactions_${periodLabel.replace(/[\s/]/g, '_')}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ─── AGGREGATED FINANCIALS COMPILER ─────────────────────────────────────────

export function compileMonthlyFinancials(
  expenses: Expense[],
  clients: Client[],
  payables: AccountPayable[] = [],
  openingBalances?: CashOpeningBalances | null,
  scenario: ForecastScenario = 'expected',
  selectedMonthKey?: string,
  clientPayments: ClientPaymentRecord[] = []
): {
  monthlyMap: Map<string, MonthlyFinancialSummary>
  last6Months: MonthlyFinancialSummary[]
  allAvailableMonths: MonthlyFinancialSummary[]
  availableYears: number[]
  outstandingReceivables: OutstandingReceivable[]
  receivablesAgingSummary: ReceivablesAgingSummary
  payablesSummary: PayablesSummary
  cashPosition: CashPositionSummary
  cashflowForecast: CashflowForecastMonth[]
  categoryOutflowBreakdown: OutflowCategoryBreakdown[]
  fyTotals: { income: number; outflow: number; net: number; marginPct: number }
  pnlStatement: RealizedPnLStatement
  gstSummary: GstTaxSummary
} {
  const monthlyMap = new Map<string, MonthlyFinancialSummary>()
  const now = new Date()

  // Collect all unique years across real transactions + current, previous, and next year (for FY completion)
  const yearsSet = new Set<number>([now.getFullYear(), now.getFullYear() - 1, now.getFullYear() + 1])
  for (const p of clientPayments) {
    if (p.date && !isNaN(p.date.getTime())) yearsSet.add(p.date.getFullYear())
  }
  for (const e of expenses) {
    if (e.date) {
      const d = e.date instanceof Date ? e.date : new Date(e.date)
      if (!isNaN(d.getTime())) yearsSet.add(d.getFullYear())
    }
  }
  for (const c of clients) {
    if (c.eventDate) {
      const d = new Date(c.eventDate)
      if (!isNaN(d.getTime())) yearsSet.add(d.getFullYear())
    }
    if (c.createdAt) {
      const d = new Date(c.createdAt)
      if (!isNaN(d.getTime())) yearsSet.add(d.getFullYear())
    }
  }
  const availableYears = Array.from(yearsSet).sort((a, b) => b - a)

  // Ensure all 12 calendar months for every available year exist in monthlyMap
  for (const yr of availableYears) {
    for (let m = 1; m <= 12; m++) {
      const d = new Date(yr, m - 1, 1)
      const key = `${yr}-${String(m).padStart(2, '0')}`
      if (!monthlyMap.has(key)) {
        monthlyMap.set(key, {
          monthKey: key,
          monthLabel: d.toLocaleString('en-US', { month: 'short' }),
          fullMonthLabel: d.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
          year: yr,
          month: m,
          income: 0,
          incomeCount: 0,
          outflow: 0,
          outflowCount: 0,
          net: 0,
          marginPct: 0,
          mainOutflowType: 'None',
          lineItems: [],
        })
      }
    }
  }

  // Generate 6 rolling months ending at current month
  const monthKeys: string[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    monthKeys.push(key)
  }

  // Cash in hand / Bank / UPI breakdown based on verified opening balances
  const hasCustomOpeningBalances = Boolean(openingBalances)
  let cashInHand = openingBalances ? openingBalances.cashInHand : 150000
  let cashInBank = openingBalances ? openingBalances.cashInBank : 850000
  let cashInUPI = openingBalances ? openingBalances.cashInUPI : 75000

  // When a verified baseline / opening balance is set, transactions on or before
  // that baseline date are considered already reconciled into the verified starting balance.
  // Only incremental transactions occurring strictly AFTER this cutoff should adjust the liquid cash position.
  const baselineCutoffTime: number = openingBalances?.asOfDate
    ? (() => {
        const d = openingBalances.asOfDate instanceof Date
          ? new Date(openingBalances.asOfDate)
          : new Date(String(openingBalances.asOfDate))
        if (isNaN(d.getTime())) return 0
        d.setHours(23, 59, 59, 999)
        return d.getTime()
      })()
    : 0

  // 1. Process Income from Client bookings & payments
  const clientMap = new Map<string, Client>()
  for (const c of clients) {
    if (!c.isDeleted) {
      clientMap.set(c.clientId, c)
    }
  }

  const clientPaidFromDocMap = new Map<string, number>()

  // 1A. Process individual actual payment records (exact dates, amounts, and methods)
  for (const payment of clientPayments) {
    if (payment.amount <= 0) continue

    const c = clientMap.get(payment.clientId)
    if (c && c.isDeleted) continue

    // Track total processed from actual payment documents
    const prev = clientPaidFromDocMap.get(payment.clientId) || 0
    clientPaidFromDocMap.set(payment.clientId, prev + payment.amount)

    const date = payment.date instanceof Date && !isNaN(payment.date.getTime())
      ? payment.date
      : new Date()
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

    // Distribute received funds to exact cash accounts based on payment method
    // Only accumulate into liquid cash position if transaction occurred AFTER verified baseline date
    if (!hasCustomOpeningBalances || date.getTime() > baselineCutoffTime) {
      const methodLower = (payment.method || '').toLowerCase()
      if (methodLower === 'cash') {
        cashInHand += payment.amount
      } else if (methodLower === 'gpay' || methodLower === 'upi' || methodLower === 'phonepe') {
        cashInUPI += payment.amount
      } else {
        cashInBank += payment.amount
      }
    }

    if (!monthlyMap.has(key)) {
      const monthLabel = date.toLocaleString('en-US', { month: 'short' })
      const fullMonthLabel = date.toLocaleString('en-US', { month: 'long', year: 'numeric' })
      monthlyMap.set(key, {
        monthKey: key,
        monthLabel,
        fullMonthLabel,
        year: date.getFullYear(),
        month: date.getMonth() + 1,
        income: 0,
        incomeCount: 0,
        outflow: 0,
        outflowCount: 0,
        net: 0,
        marginPct: 0,
        mainOutflowType: 'None',
        lineItems: [],
      })
    }

    const monthData = monthlyMap.get(key)!
    monthData.income += payment.amount
    monthData.incomeCount += 1

    monthData.lineItems.push({
      id: `pay_${payment.paymentId}`,
      date,
      type: 'income',
      category: 'Client Payment',
      label: c?.eventName || c?.name || 'Client Payment',
      meta: `${c?.name || 'Client'} · ${payment.instalment || 'Payment'} (${(payment.method || 'Transfer').toUpperCase()})`,
      amount: payment.amount,
      signedAmount: payment.amount,
      icon: 'ti-receipt',
      iconBg: 'var(--color-success-muted)',
      iconFg: 'var(--color-success)',
      amtColor: 'var(--color-success)',
      clientId: payment.clientId,
      projectId: c?.projectId,
      invoiceNumber: c?.invoiceNumber,
    })
  }

  // 1B. Fallback for clients who have collected funds not yet recorded in payments subcollection
  for (const c of clients) {
    if (c.isDeleted) continue

    const totalCollected = Math.max(0, (c.totalAmount || 0) - (c.balanceDue || 0))
    const alreadyProcessed = clientPaidFromDocMap.get(c.clientId) || 0
    const remainder = totalCollected - alreadyProcessed
    if (remainder <= 0) continue

    // For unitemized balances, attribute to eventDate (or createdAt)
    const date = c.eventDate ? new Date(c.eventDate) : (c.createdAt ? new Date(c.createdAt) : new Date())
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

    if (!hasCustomOpeningBalances || date.getTime() > baselineCutoffTime) {
      cashInBank += Math.round(remainder * 0.70)
      cashInUPI += Math.round(remainder * 0.20)
      cashInHand += Math.round(remainder * 0.10)
    }

    if (!monthlyMap.has(key)) {
      const monthLabel = date.toLocaleString('en-US', { month: 'short' })
      const fullMonthLabel = date.toLocaleString('en-US', { month: 'long', year: 'numeric' })
      monthlyMap.set(key, {
        monthKey: key,
        monthLabel,
        fullMonthLabel,
        year: date.getFullYear(),
        month: date.getMonth() + 1,
        income: 0,
        incomeCount: 0,
        outflow: 0,
        outflowCount: 0,
        net: 0,
        marginPct: 0,
        mainOutflowType: 'None',
        lineItems: [],
      })
    }

    const monthData = monthlyMap.get(key)!
    monthData.income += remainder
    monthData.incomeCount += 1

    monthData.lineItems.push({
      id: `inc_${c.clientId}`,
      date,
      type: 'income',
      category: 'Client Payment',
      label: c.eventName || c.name || 'Client Payment',
      meta: `${c.name || 'Client'} · Advance / Balance (${c.packageType || 'Custom'})`,
      amount: remainder,
      signedAmount: remainder,
      icon: 'ti-receipt',
      iconBg: 'var(--color-success-muted)',
      iconFg: 'var(--color-success)',
      amtColor: 'var(--color-success)',
      clientId: c.clientId,
      projectId: c.projectId,
      invoiceNumber: c.invoiceNumber,
    })
  }

  // 2. Process Outflow from Expenses
  const outflowTypeMap = new Map<string, Map<string, number>>()
  const categoryTotalAllTime = new Map<string, number>()

  for (const e of expenses) {
    if (e.isDeleted) continue

    const date = e.date instanceof Date ? e.date : new Date(e.date)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    const amount = Number(e.amount) || 0

    // Deduct from cash position based on payment method (only for expenses occurring AFTER verified baseline date)
    if (!hasCustomOpeningBalances || date.getTime() > baselineCutoffTime) {
      const methodLower = (e.method || '').toLowerCase()
      if (methodLower.includes('cash')) {
        cashInHand = Math.max(0, cashInHand - amount)
      } else if (methodLower.includes('upi') || methodLower.includes('gpay')) {
        cashInUPI = Math.max(0, cashInUPI - amount)
      } else {
        cashInBank = Math.max(0, cashInBank - amount)
      }
    }

    categoryTotalAllTime.set(e.category, (categoryTotalAllTime.get(e.category) || 0) + amount)

    if (!monthlyMap.has(key)) {
      const monthLabel = date.toLocaleString('en-US', { month: 'short' })
      const fullMonthLabel = date.toLocaleString('en-US', { month: 'long', year: 'numeric' })
      monthlyMap.set(key, {
        monthKey: key,
        monthLabel,
        fullMonthLabel,
        year: date.getFullYear(),
        month: date.getMonth() + 1,
        income: 0,
        incomeCount: 0,
        outflow: 0,
        outflowCount: 0,
        net: 0,
        marginPct: 0,
        mainOutflowType: 'None',
        lineItems: [],
      })
    }

    const monthData = monthlyMap.get(key)!
    monthData.outflow += amount
    monthData.outflowCount += 1

    if (!outflowTypeMap.has(key)) outflowTypeMap.set(key, new Map())
    const catMap = outflowTypeMap.get(key)!
    catMap.set(e.category, (catMap.get(e.category) || 0) + amount)

    let icon = 'ti-cash'
    let iconBg = 'var(--color-surface-raised)'
    let iconFg = 'var(--color-foreground-muted)'

    if (e.category === 'salaries') {
      icon = 'ti-users'
      iconBg = 'var(--color-primary-muted)'
      iconFg = 'var(--color-primary)'
    } else if (e.category === 'freelancer') {
      icon = 'ti-camera'
      iconBg = 'var(--color-secondary-muted)'
      iconFg = 'var(--color-secondary)'
    } else if (e.category === 'equipment') {
      icon = 'ti-tool'
      iconBg = 'var(--color-accent-muted)'
      iconFg = 'var(--color-accent)'
    } else if (e.category === 'travel') {
      icon = 'ti-car'
      iconBg = 'var(--color-purple-muted)'
      iconFg = 'var(--color-purple)'
    } else if (e.category === 'studioRent') {
      icon = 'ti-building'
      iconBg = 'var(--color-danger-muted)'
      iconFg = 'var(--color-danger)'
    }

    monthData.lineItems.push({
      id: `exp_${e.expenseId}`,
      date,
      type: 'expense',
      category: e.category,
      label: e.vendor || e.note || e.description || 'Expense',
      meta: `${CATEGORY_META[e.category]?.label || e.category} · ${e.method || 'Cash'}`,
      amount,
      signedAmount: -amount,
      icon,
      iconBg,
      iconFg,
      amtColor: 'var(--color-danger)',
      projectId: e.projectId,
    })
  }

  // Calculate net, margin, and main outflow type for each month
  for (const [key, m] of monthlyMap.entries()) {
    m.net = m.income - m.outflow
    m.marginPct = m.income > 0 ? Math.round((m.net / m.income) * 100) : 0

    const catMap = outflowTypeMap.get(key)
    if (catMap && catMap.size > 0) {
      let topCat = ''
      let topAmt = 0
      for (const [cat, amt] of catMap.entries()) {
        if (amt > topAmt) {
          topAmt = amt
          topCat = cat
        }
      }
      m.mainOutflowType = CATEGORY_META[topCat]?.label || topCat || 'Operations'
    } else {
      m.mainOutflowType = m.outflow > 0 ? 'Operations' : 'No outflows'
    }

    m.lineItems.sort((a, b) => b.date.getTime() - a.date.getTime())
  }

  const last6Months = monthKeys.map(k => monthlyMap.get(k)!).filter(Boolean)

  const allAvailableMonths = Array.from(monthlyMap.values()).sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year
    return b.month - a.month
  })

  // 3. Compile Outstanding Receivables with Aging Buckets
  const outstandingReceivables: OutstandingReceivable[] = []
  const todayTimestamp = now.getTime()

  const agingSummary: ReceivablesAgingSummary = {
    current: { count: 0, total: 0 },
    aging31to60: { count: 0, total: 0 },
    aging60plus: { count: 0, total: 0 },
    totalBalanceDue: 0,
  }

  for (const c of clients) {
    if (c.isDeleted) continue
    const balance = Number(c.balanceDue) || 0
    if (balance > 0) {
      const eventDate = c.eventDate ? new Date(c.eventDate) : new Date()
      const isOverdue = c.paymentStatus === 'overdue' || (eventDate.getTime() < todayTimestamp && balance > 0)
      const daysPastDue = Math.max(0, Math.floor((todayTimestamp - eventDate.getTime()) / (1000 * 60 * 60 * 24)))

      let agingBucket: 'current' | '31-60' | '60+' = 'current'
      if (daysPastDue > 60) {
        agingBucket = '60+'
        agingSummary.aging60plus.count += 1
        agingSummary.aging60plus.total += balance
      } else if (daysPastDue > 30) {
        agingBucket = '31-60'
        agingSummary.aging31to60.count += 1
        agingSummary.aging31to60.total += balance
      } else {
        agingBucket = 'current'
        agingSummary.current.count += 1
        agingSummary.current.total += balance
      }

      agingSummary.totalBalanceDue += balance

      outstandingReceivables.push({
        id: c.clientId,
        clientId: c.clientId,
        clientName: c.name || 'Unnamed Client',
        clientPhone: c.contact || '',
        clientEmail: c.email || '',
        eventName: c.eventName || 'Studio Event',
        invoiceNumber: c.invoiceNumber || `ZS-INV-${c.clientId.slice(-4).toUpperCase()}`,
        totalAmount: c.totalAmount || 0,
        amountPaid: Math.max(0, (c.totalAmount || 0) - balance),
        balanceDue: balance,
        dueDate: eventDate,
        isOverdue,
        daysPastDue,
        agingBucket,
        paymentStatus: c.paymentStatus || (isOverdue ? 'overdue' : 'partial'),
        lastRemindedAt: parseDateNullable(c.lastRemindedAt),
        reminderCount: c.reminderCount || 0,
      })
    }
  }

  // Sort outstanding: 60+ first, then 31-60, then highest balance
  outstandingReceivables.sort((a, b) => {
    if (a.agingBucket === '60+' && b.agingBucket !== '60+') return -1
    if (a.agingBucket !== '60+' && b.agingBucket === '60+') return 1
    if (a.isOverdue && !b.isOverdue) return -1
    if (!a.isOverdue && b.isOverdue) return 1
    return b.balanceDue - a.balanceDue
  })

  // 4. Accounts Payable Summary
  const oneWeekLater = todayTimestamp + 7 * 24 * 60 * 60 * 1000
  let totalPayable = 0
  let overduePayable = 0
  let dueThisWeek = 0
  let pendingCount = 0
  let overdueCount = 0

  for (const p of payables) {
    if (p.status !== 'paid') {
      totalPayable += p.amount
      pendingCount += 1

      if (p.dueDate.getTime() < todayTimestamp) {
        overduePayable += p.amount
        overdueCount += 1
      } else if (p.dueDate.getTime() <= oneWeekLater) {
        dueThisWeek += p.amount
      }
    }
  }

  const payablesSummary: PayablesSummary = {
    totalPayable,
    overduePayable,
    dueThisWeek,
    pendingCount,
    overdueCount,
  }

  // 5. Total Available Cash & Burn Rate / Runway
  const totalAvailable = Math.max(0, cashInHand + cashInBank + cashInUPI)

  // Average monthly burn rate across last 3 months
  let last3MonthsBurnSum = 0
  const recent3 = last6Months.slice(-3)
  for (const m of recent3) {
    last3MonthsBurnSum += m.outflow
  }
  const monthlyBurnRate = recent3.length > 0 ? Math.round(last3MonthsBurnSum / recent3.length) : 150000
  const runwayMonths = monthlyBurnRate > 0 && totalAvailable > 0 ? Math.round((totalAvailable / monthlyBurnRate) * 10) / 10 : 0

  const cashPosition: CashPositionSummary = {
    cashInHand,
    cashInBank,
    cashInUPI,
    totalAvailable,
    monthlyBurnRate,
    runwayMonths,
    hasCustomOpeningBalances,
    asOfDate: openingBalances?.asOfDate,
  }

  // 6. Cashflow Forecast for Next 1 - 3 Months with Sensitivity Scenarios
  const cashflowForecast: CashflowForecastMonth[] = []
  let runningProjectedBalance = totalAvailable
  const collectionRate = scenario === 'optimistic' ? 1.0 : scenario === 'conservative' ? 0.65 : 0.85

  for (let i = 1; i <= 3; i++) {
    const fDate = new Date(now.getFullYear(), now.getMonth() + i, 1)
    const fKey = `${fDate.getFullYear()}-${String(fDate.getMonth() + 1).padStart(2, '0')}`
    const fLabel = fDate.toLocaleString('en-US', { month: 'short' })

    // Inflow: upcoming events with balanceDue occurring in that target month
    let rawInflow = 0
    let upcomingBookingsCount = 0
    for (const c of clients) {
      if (c.isDeleted) continue
      if (c.eventDate) {
        const evDate = new Date(c.eventDate)
        if (evDate.getFullYear() === fDate.getFullYear() && evDate.getMonth() === fDate.getMonth()) {
          rawInflow += Number(c.balanceDue) || 0
          upcomingBookingsCount++
        }
      }
    }

    if (rawInflow === 0) {
      rawInflow = Math.round(monthlyBurnRate * 1.35)
    }

    // Apply collection rate based on chosen scenario
    const projectedInflow = Math.round(rawInflow * collectionRate)

    // Outflow: baseline monthly burn (rent + salaries + gear) + pending payables scheduled in that month
    let projectedOutflow = monthlyBurnRate
    for (const p of payables) {
      if (p.status !== 'paid' && p.dueDate.getFullYear() === fDate.getFullYear() && p.dueDate.getMonth() === fDate.getMonth()) {
        projectedOutflow += p.amount
      }
    }

    const projectedNet = projectedInflow - projectedOutflow
    runningProjectedBalance += projectedNet

    cashflowForecast.push({
      monthKey: fKey,
      monthLabel: `${fLabel} ${fDate.getFullYear()}`,
      year: fDate.getFullYear(),
      month: fDate.getMonth() + 1,
      projectedInflow,
      projectedOutflow,
      projectedNet,
      projectedClosingBalance: runningProjectedBalance,
      inflowNote: upcomingBookingsCount > 0
        ? `${upcomingBookingsCount} bookings (${Math.round(collectionRate * 100)}% realization)`
        : `Projected pipeline (${Math.round(collectionRate * 100)}% realization)`,
      outflowNote: `Baseline burn + scheduled vendor payables`,
      collectionRate,
      scenario,
    })
  }

  // 7. Outflow Category Breakdown Distribution (across recent expenses)
  const categoryOutflowBreakdown: OutflowCategoryBreakdown[] = []
  let totalOutflowAllTime = 0
  for (const amt of categoryTotalAllTime.values()) {
    totalOutflowAllTime += amt
  }

  for (const [cat, amt] of categoryTotalAllTime.entries()) {
    const percentage = totalOutflowAllTime > 0 ? Math.round((amt / totalOutflowAllTime) * 100) : 0
    categoryOutflowBreakdown.push({
      category: cat,
      label: CATEGORY_META[cat]?.label || cat,
      amount: amt,
      percentage,
      icon: CATEGORY_META[cat]?.icon || 'ti-tag',
    })
  }
  categoryOutflowBreakdown.sort((a, b) => b.amount - a.amount)

  // 8. Financial Year Totals
  let fyIncome = 0
  let fyOutflow = 0
  for (const m of monthlyMap.values()) {
    fyIncome += m.income
    fyOutflow += m.outflow
  }
  const fyNet = fyIncome - fyOutflow
  const fyMargin = fyIncome > 0 ? Math.round((fyNet / fyIncome) * 100) : 0

  // 9. Realized P&L Statement (Cash Basis with COGS vs OpEx)
  const targetKey = selectedMonthKey || monthKeys[monthKeys.length - 1]
  const targetMonth = monthlyMap.get(targetKey)
  const revenue = targetMonth ? targetMonth.income : 0

  let cogs = 0
  let opex = 0
  const cogsCatMap = new Map<string, number>()
  const opexCatMap = new Map<string, number>()

  for (const e of expenses) {
    if (e.isDeleted) continue
    const d = e.date instanceof Date ? e.date : new Date(e.date)
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (k !== targetKey) continue

    const amt = Number(e.amount) || 0
    const cat = e.category || 'misc'
    const type = CATEGORY_ACCOUNTING_TYPE[cat] || 'opex'

    if (type === 'cogs') {
      cogs += amt
      cogsCatMap.set(cat, (cogsCatMap.get(cat) || 0) + amt)
    } else {
      opex += amt
      opexCatMap.set(cat, (opexCatMap.get(cat) || 0) + amt)
    }
  }

  const grossProfit = revenue - cogs
  const grossMarginPct = revenue > 0 ? Math.round((grossProfit / revenue) * 100) : 0
  const netProfit = grossProfit - opex
  const netMarginPct = revenue > 0 ? Math.round((netProfit / revenue) * 100) : 0

  const cogsBreakdown = Array.from(cogsCatMap.entries()).map(([cat, amt]) => ({
    category: cat,
    label: CATEGORY_META[cat]?.label || cat,
    amount: amt,
    pct: cogs > 0 ? Math.round((amt / cogs) * 100) : 0,
  })).sort((a, b) => b.amount - a.amount)

  const opexBreakdown = Array.from(opexCatMap.entries()).map(([cat, amt]) => ({
    category: cat,
    label: CATEGORY_META[cat]?.label || cat,
    amount: amt,
    pct: opex > 0 ? Math.round((amt / opex) * 100) : 0,
  })).sort((a, b) => b.amount - a.amount)

  const pnlStatement: RealizedPnLStatement = {
    revenue,
    cogs,
    cogsBreakdown,
    grossProfit,
    grossMarginPct,
    opex,
    opexBreakdown,
    netProfit,
    netMarginPct,
    basis: 'cash',
  }

  // 10. GST Tax Summary (Output Tax vs Input Tax Credit)
  let outputTaxableAmount = 0
  let outputGst = 0
  let inputTaxableAmount = 0
  let eligibleInputGst = 0
  let ineligibleInputGst = 0
  let itemsWithGstCount = 0

  for (const c of clients) {
    if (c.isDeleted) continue
    const d = c.createdAt ? new Date(c.createdAt) : (c.eventDate ? new Date(c.eventDate) : new Date())
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (k !== targetKey) continue

    const paid = (Number(c.totalAmount) || 0) - (Number(c.balanceDue) || 0)
    if (paid > 0) {
      const tax = Math.round((paid * 18) / 118)
      outputGst += tax
      outputTaxableAmount += (paid - tax)
    }
  }

  for (const e of expenses) {
    if (e.isDeleted) continue
    const d = e.date instanceof Date ? e.date : new Date(e.date)
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (k !== targetKey) continue

    const amt = Number(e.amount) || 0
    let gst = Number(e.gstAmount) || 0
    if (gst === 0 && (e.category === 'equipment' || e.category === 'software')) {
      gst = Math.round((amt * 18) / 118)
    }

    if (gst > 0) {
      itemsWithGstCount++
      inputTaxableAmount += (amt - gst)
      if (e.isGstClaimable !== false) {
        eligibleInputGst += gst
      } else {
        ineligibleInputGst += gst
      }
    }
  }

  const gstSummary: GstTaxSummary = {
    outputTaxableAmount,
    outputGst,
    inputTaxableAmount,
    eligibleInputGst,
    ineligibleInputGst,
    netGstPayable: Math.max(0, outputGst - eligibleInputGst),
    netItcCarryForward: Math.max(0, eligibleInputGst - outputGst),
    itemsWithGstCount,
  }

  return {
    monthlyMap,
    last6Months,
    allAvailableMonths,
    availableYears,
    outstandingReceivables,
    receivablesAgingSummary: agingSummary,
    payablesSummary,
    cashPosition,
    cashflowForecast,
    categoryOutflowBreakdown,
    fyTotals: {
      income: fyIncome,
      outflow: fyOutflow,
      net: fyNet,
      marginPct: fyMargin,
    },
    pnlStatement,
    gstSummary,
  }
}

// ─── COMPILE BUDGET ROWS ────────────────────────────────────────────────────

export function compileBudgetRows(
  expenses: Expense[],
  budgetsList: Budget[],
  selectedMonth: number,
  selectedYear: number,
  customCategories: CustomExpenseCategory[] = []
): {
  rows: BudgetVsActualRow[]
  totalBudget: number
  totalActual: number
  totalVariance: number
  nearLimitCount: number
  overBudgetCount: number
  alerts: BudgetAlert[]
} {
  const actualsByCategory = new Map<string, number>()

  for (const e of expenses) {
    if (e.isDeleted) continue
    const date = e.date instanceof Date ? e.date : new Date(e.date)
    if (date.getFullYear() === selectedYear && date.getMonth() + 1 === selectedMonth) {
      const cat = e.category || 'misc'
      actualsByCategory.set(cat, (actualsByCategory.get(cat) || 0) + (Number(e.amount) || 0))
    }
  }

  const customBudgetMap = new Map<string, number>()
  for (const b of budgetsList) {
    if (b.year === selectedYear) {
      if (b.month === selectedMonth || b.month === undefined || b.month === null) {
        customBudgetMap.set(b.category, b.budgetedAmount)
      }
    }
  }

  const defaultCategories = Object.keys(DEFAULT_CATEGORY_BUDGETS)
  const customKeys = customCategories.map((c) => c.key)
  const expenseCatsThisMonth = Array.from(actualsByCategory.keys())
  const budgetCatsThisMonth = Array.from(customBudgetMap.keys())

  const categories = Array.from(new Set([
    ...defaultCategories,
    ...customKeys,
    ...expenseCatsThisMonth,
    ...budgetCatsThisMonth,
  ]))

  const rows: BudgetVsActualRow[] = []
  let totalBudget = 0
  let totalActual = 0
  let nearLimitCount = 0
  let overBudgetCount = 0

  for (const cat of categories) {
    const customCat = customCategories.find((c) => c.key === cat)
    const defaultAmt = customCat?.defaultBudget ?? DEFAULT_CATEGORY_BUDGETS[cat] ?? 25000

    const budgetAmount = customBudgetMap.has(cat)
      ? customBudgetMap.get(cat)!
      : defaultAmt

    const actualAmount = actualsByCategory.get(cat) || 0
    const variance = budgetAmount - actualAmount
    const percentUsed = budgetAmount > 0 ? Math.round((actualAmount / budgetAmount) * 100) : 0

    let status: 'onTrack' | 'nearLimit' | 'overBudget' = 'onTrack'
    let statusLabel = 'On track'
    let badgeBg = 'var(--color-success-muted)'
    let badgeFg = 'var(--color-success)'
    let varColor = 'var(--color-success)'

    if (variance < 0) {
      status = 'overBudget'
      statusLabel = 'Over budget'
      badgeBg = 'var(--color-danger-muted)'
      badgeFg = 'var(--color-danger)'
      varColor = 'var(--color-danger)'
      overBudgetCount++
    } else if (percentUsed >= 85) {
      status = 'nearLimit'
      statusLabel = percentUsed >= 95 ? 'Critical (95%+)' : 'Near limit (85%+)'
      badgeBg = 'var(--color-secondary-muted)'
      badgeFg = 'var(--color-secondary)'
      varColor = 'var(--color-secondary)'
      nearLimitCount++
    }

    totalBudget += budgetAmount
    totalActual += actualAmount

    const meta = getCategoryMeta(cat, customCategories)

    rows.push({
      category: cat,
      label: meta.label,
      icon: meta.icon,
      budget: budgetAmount,
      actual: actualAmount,
      variance,
      percentUsed,
      status,
      statusLabel,
      badgeBg,
      badgeFg,
      varColor,
      isCustom: Boolean(customCat),
      customCategoryId: customCat?.id,
    })
  }

  const alerts: BudgetAlert[] = []
  for (const r of rows) {
    if (r.percentUsed >= 100) {
      alerts.push({
        category: r.category,
        label: r.label,
        percentUsed: r.percentUsed,
        excessAmount: Math.max(0, r.actual - r.budget),
        severity: 'danger',
      })
    } else if (r.percentUsed >= 85) {
      alerts.push({
        category: r.category,
        label: r.label,
        percentUsed: r.percentUsed,
        excessAmount: 0,
        severity: 'warning',
      })
    }
  }

  return {
    rows,
    totalBudget,
    totalActual,
    totalVariance: totalBudget - totalActual,
    nearLimitCount,
    overBudgetCount,
    alerts,
  }
}

// ─── PROJECT-WISE PROFITABILITY COMPILER ────────────────────────────────────

export function compileProjectProfitability(
  clients: Client[],
  expenses: Expense[]
): ProjectProfitabilitySummary[] {
  const list: ProjectProfitabilitySummary[] = []

  for (const c of clients) {
    if (c.isDeleted) continue

    const revenue = Number(c.totalAmount) || 0
    if (revenue <= 0 && !c.eventName) continue

    // Direct costs charged to this project
    const projectExpenses = expenses.filter(
      e => !e.isDeleted && (
        (e.projectId && e.projectId === c.projectId) ||
        (e.projectId && e.projectId === c.clientId) ||
        (e.projectName && c.eventName && e.projectName.toLowerCase().trim() === c.eventName.toLowerCase().trim())
      )
    )

    const directExpenses = projectExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0)
    const netProfit = revenue - directExpenses
    const marginPct = revenue > 0 ? Math.round((netProfit / revenue) * 100) : (netProfit < 0 ? -100 : 0)

    let marginTier: 'high' | 'healthy' | 'low' | 'deficit' = 'healthy'
    if (netProfit < 0) {
      marginTier = 'deficit'
    } else if (marginPct >= 50) {
      marginTier = 'high'
    } else if (marginPct >= 25) {
      marginTier = 'healthy'
    } else {
      marginTier = 'low'
    }

    list.push({
      projectId: c.projectId || c.clientId,
      clientId: c.clientId,
      projectName: c.eventName || 'Studio Event',
      clientName: c.name || 'Client',
      eventDate: c.eventDate ? new Date(c.eventDate) : new Date(),
      packageType: c.packageType || 'Custom Package',
      revenue,
      directExpenses,
      netProfit,
      marginPct,
      marginTier,
      expenseItems: projectExpenses,
    })
  }

  // Sort by highest revenue, then net profit
  return list.sort((a, b) => b.revenue - a.revenue)
}

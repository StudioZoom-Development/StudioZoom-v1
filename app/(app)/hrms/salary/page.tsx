'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { format, addMonths, subMonths, isValid, parseISO } from 'date-fns'
import { useAuthStore } from '@/store/authStore'
import { DateField } from '@/components/shared/DateField'
import { TableRowSkeleton } from '@/components/shared/LoadingSkeleton'
import { EmptyState } from '@/components/shared/EmptyState'
import {
  subscribeMonthlySalaries,
  saveSalaryAdvances,
} from '@/lib/firebase/queries/salary'
import {
  subscribeToStaffOnly,
  type StaffMember,
} from '@/lib/firebase/queries/staff'
import type { Salary, SalaryAdvanceEntry } from '@/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDisplayDate(dateStr?: string): string {
  if (!dateStr) return ''
  try {
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const parsed = parseISO(dateStr)
      if (isValid(parsed)) return format(parsed, 'dd/MM/yyyy')
    }
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
      return dateStr
    }
    const d = new Date(dateStr)
    if (isValid(d)) return format(d, 'dd/MM/yyyy')
  } catch {
    // fallback
  }
  return dateStr
}

function formatRupees(amount?: number | null): string {
  if (amount === undefined || amount === null || isNaN(amount)) return '—'
  const isNeg = amount < 0
  const absVal = Math.abs(amount)
  const formatted = absVal.toLocaleString('en-IN')
  return isNeg ? `-₹${formatted}` : `₹${formatted}`
}

function parseCurrencyInput(val: string): number {
  const clean = val.replace(/[^0-9]/g, '')
  return clean ? parseInt(clean, 10) : 0
}

interface ProcessedSalaryRow {
  staffUid: string
  staffName: string
  jobTitle: string
  baseSalary: number
  adv1Amount: number
  adv1Date: string
  adv2Amount: number
  adv2Date: string
  adv3Amount: number
  adv3Date: string
  totalAdvance: number
  pending: number
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const TH_STYLE: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  fontWeight: 600,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: 'var(--color-foreground-subtle)',
  padding: '14px 16px',
  borderBottom: '0.5px solid var(--color-border-strong)',
  background: 'var(--color-surface)',
}

const TD_STYLE: React.CSSProperties = {
  fontSize: 'var(--text-sm)',
  padding: '14px 16px',
  verticalAlign: 'middle',
  fontFamily: 'var(--font-inter)',
  color: 'var(--color-foreground)',
  borderBottom: '0.5px solid var(--color-border)',
}

// ─── Page Component ───────────────────────────────────────────────────────────

export default function SalaryPage() {
  const router = useRouter()
  const appUser = useAuthStore(s => s.appUser)
  const role = appUser?.role ?? 'staff'
  const isAuthorized = role === 'admin' || role === 'manager'

  // Month navigation (Defaults to current date)
  const [viewDate, setViewDate] = useState<Date>(() => new Date())
  const year = viewDate.getFullYear()
  const month = viewDate.getMonth() + 1
  const monthLabel = format(viewDate, 'MMMM yyyy')

  // Data States
  const [staffList, setStaffList] = useState<StaffMember[]>([])
  const [salariesMap, setSalariesMap] = useState<Record<string, Salary>>({})
  const [loading, setLoading] = useState(true)

  // Active Staff View (Screenshot 2: Staff Detail View)
  const [activeStaffUid, setActiveStaffUid] = useState<string | null>(null)

  // Detail View Form States
  const [formAdv1Amount, setFormAdv1Amount] = useState<string>('0')
  const [formAdv1Date, setFormAdv1Date] = useState<string>('')
  const [formAdv2Amount, setFormAdv2Amount] = useState<string>('0')
  const [formAdv2Date, setFormAdv2Date] = useState<string>('')
  const [formAdv3Amount, setFormAdv3Amount] = useState<string>('0')
  const [formAdv3Date, setFormAdv3Date] = useState<string>('')
  const [formChanged, setFormChanged] = useState<boolean>(false)
  const [saving, setSaving] = useState<boolean>(false)
  const [validationError, setValidationError] = useState<string>('')
  const [showBackConfirm, setShowBackConfirm] = useState<boolean>(false)

  // Default date within the selected month (today if today is in month, else 1st of month)
  const todayDateObj = new Date()
  const defaultMonthDate =
    todayDateObj.getFullYear() === year && todayDateObj.getMonth() + 1 === month
      ? format(todayDateObj, 'yyyy-MM-dd')
      : format(new Date(year, month - 1, 1), 'yyyy-MM-dd')

  // 1. Subscribe to Active Staff
  useEffect(() => {
    const unsub = subscribeToStaffOnly(list => {
      setStaffList(list.filter(s => s.isActive !== false))
    })
    return () => unsub()
  }, [])

  // 2. Subscribe to Monthly Salaries
  useEffect(() => {
    const unsub = subscribeMonthlySalaries(year, month, records => {
      setSalariesMap(records)
      setLoading(false)
    })
    return () => unsub()
  }, [year, month])

  // Combine Staff with Monthly Salaries
  const processedRows = useMemo<ProcessedSalaryRow[]>(() => {
    return staffList.map(staff => {
      const salaryDoc = salariesMap[staff.uid]
      const baseSalary = staff.baseSalary ?? salaryDoc?.baseSalary ?? 0

      const adv1Amount = salaryDoc?.advance1?.amount ?? 0
      const adv1Date = salaryDoc?.advance1?.date ?? ''

      const adv2Amount = salaryDoc?.advance2?.amount ?? 0
      const adv2Date = salaryDoc?.advance2?.date ?? ''

      const adv3Amount = salaryDoc?.advance3?.amount ?? 0
      const adv3Date = salaryDoc?.advance3?.date ?? ''

      const totalAdvance = adv1Amount + adv2Amount + adv3Amount
      const pending = baseSalary - totalAdvance

      return {
        staffUid: staff.uid,
        staffName: staff.name,
        jobTitle: staff.jobTitle || 'Staff',
        baseSalary,
        adv1Amount,
        adv1Date,
        adv2Amount,
        adv2Date,
        adv3Amount,
        adv3Date,
        totalAdvance,
        pending,
      }
    })
  }, [staffList, salariesMap])

  // Totals row calculations
  const totals = useMemo(() => {
    let totalBase = 0
    let totalAdv1 = 0
    let totalAdv2 = 0
    let totalAdv3 = 0
    let totalAdvances = 0
    let totalPending = 0

    for (const r of processedRows) {
      totalBase += r.baseSalary
      totalAdv1 += r.adv1Amount
      totalAdv2 += r.adv2Amount
      totalAdv3 += r.adv3Amount
      totalAdvances += r.totalAdvance
      totalPending += r.pending
    }

    return {
      totalBase,
      totalAdv1,
      totalAdv2,
      totalAdv3,
      totalAdvances,
      totalPending,
    }
  }, [processedRows])

  // Active staff details for Screenshot 2 view
  const activeStaffRow = useMemo(() => {
    if (!activeStaffUid) return null
    return processedRows.find(r => r.staffUid === activeStaffUid) || null
  }, [activeStaffUid, processedRows])

  // Open staff detail card
  const handleOpenStaffDetail = (staffUid: string) => {
    const row = processedRows.find(r => r.staffUid === staffUid)
    if (row) {
      setActiveStaffUid(staffUid)
      setFormAdv1Amount(row.adv1Amount ? String(row.adv1Amount) : '0')
      setFormAdv1Date(row.adv1Date || '')
      setFormAdv2Amount(row.adv2Amount ? String(row.adv2Amount) : '0')
      setFormAdv2Date(row.adv2Date || '')
      setFormAdv3Amount(row.adv3Amount ? String(row.adv3Amount) : '0')
      setFormAdv3Date(row.adv3Date || '')
      setFormChanged(false)
      setValidationError('')
      setShowBackConfirm(false)
    }
  }



  // Live calculation for Detail View
  const liveAdv1 = parseCurrencyInput(formAdv1Amount)
  const liveAdv2 = parseCurrencyInput(formAdv2Amount)
  const liveAdv3 = parseCurrencyInput(formAdv3Amount)
  const liveTotalAdvances = liveAdv1 + liveAdv2 + liveAdv3
  const activeBaseSalary = activeStaffRow?.baseSalary ?? 0
  const liveSalaryPending = activeBaseSalary - liveTotalAdvances

  // Sequential unlock conditions:
  // Advance 2 is unlocked only once Advance 1 has amount > 0
  const isAdv2Unlocked = liveAdv1 > 0
  // Advance 3 is unlocked only once Advance 2 has amount > 0
  const isAdv3Unlocked = liveAdv1 > 0 && liveAdv2 > 0

  // ─── CSV Export ─────────────────────────────────────────────────────────────

  const handleExportCSV = () => {
    const headers = [
      'Staff',
      'Base Salary',
      'Advance 1',
      'Advance 1 Date',
      'Advance 2',
      'Advance 2 Date',
      'Advance 3',
      'Advance 3 Date',
      'Total Advance',
      'Pending',
    ]

    const csvLines = [headers.join(',')]
    const escape = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`

    for (const r of processedRows) {
      csvLines.push([
        escape(r.staffName),
        r.baseSalary,
        r.adv1Amount > 0 ? r.adv1Amount : 0,
        escape(r.adv1Amount > 0 && r.adv1Date ? formatDisplayDate(r.adv1Date) : ''),
        r.adv2Amount > 0 ? r.adv2Amount : 0,
        escape(r.adv2Amount > 0 && r.adv2Date ? formatDisplayDate(r.adv2Date) : ''),
        r.adv3Amount > 0 ? r.adv3Amount : 0,
        escape(r.adv3Amount > 0 && r.adv3Date ? formatDisplayDate(r.adv3Date) : ''),
        r.totalAdvance,
        r.pending,
      ].join(','))
    }

    // Totals row — All 10 columns cleanly aligned
    csvLines.push([
      '"TOTALS"',
      totals.totalBase,
      totals.totalAdv1,
      '""',
      totals.totalAdv2,
      '""',
      totals.totalAdv3,
      '""',
      totals.totalAdvances,
      totals.totalPending,
    ].join(','))

    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `Salary_${format(viewDate, 'MMM_yyyy')}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  // ─── Save Advances ──────────────────────────────────────────────────────────

  const handleSaveAdvances = async () => {
    if (!activeStaffRow) return

    // Validation: Total Advances cannot exceed Base Salary
    if (liveTotalAdvances > activeBaseSalary) {
      setValidationError('The advance given is greater than Base Salary.')
      return
    }

    setSaving(true)
    setValidationError('')

    try {
      const adv1DateToSave = formAdv1Date || defaultMonthDate
      const adv2DateToSave = formAdv2Date || defaultMonthDate
      const adv3DateToSave = formAdv3Date || defaultMonthDate

      const adv1: SalaryAdvanceEntry | undefined =
        liveAdv1 > 0 ? { amount: liveAdv1, date: adv1DateToSave } : undefined
      const adv2: SalaryAdvanceEntry | undefined =
        liveAdv2 > 0 && isAdv2Unlocked ? { amount: liveAdv2, date: adv2DateToSave } : undefined
      const adv3: SalaryAdvanceEntry | undefined =
        liveAdv3 > 0 && isAdv3Unlocked ? { amount: liveAdv3, date: adv3DateToSave } : undefined

      await saveSalaryAdvances({
        staffUid: activeStaffRow.staffUid,
        year,
        month,
        baseSalary: activeBaseSalary,
        advance1: adv1,
        advance2: adv2,
        advance3: adv3,
      })

      setFormChanged(false)
      setShowBackConfirm(false)
      setActiveStaffUid(null)
    } catch (err) {
      console.error('Failed to save salary advances:', err)
      setValidationError(err instanceof Error ? err.message : 'Failed to save advances.')
    } finally {
      setSaving(false)
    }
  }

  // Back button handler
  const handleBackClick = () => {
    if (formChanged) {
      setShowBackConfirm(true)
    } else {
      setActiveStaffUid(null)
    }
  }

  // Access check
  if (!isAuthorized) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '50vh',
        color: 'var(--color-foreground-muted)',
        fontFamily: 'var(--font-inter)',
        fontSize: 'var(--text-sm)',
      }}>
        <i className="ti ti-lock" style={{ fontSize: '24px', marginRight: '10px' }} />
        You do not have permission to view this page.
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // VIEW 2: Staff Detail Card View (Matching Screenshot 2)
  // ─────────────────────────────────────────────────────────────────────────────
  if (activeStaffRow) {
    return (
      <div style={{
        fontFamily: 'var(--font-inter)',
        color: 'var(--color-foreground)',
        padding: '24px',
        maxWidth: '1280px',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '24px',
      }}>
        {/* Header with Back Arrow */}
        <div style={{ width: '100%', maxWidth: '520px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              id="salary-back-btn"
              onClick={handleBackClick}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--color-foreground)',
                display: 'flex',
                alignItems: 'center',
                padding: '4px',
                fontSize: '20px',
              }}
              title="Back to Salary list"
            >
              <i className="ti ti-arrow-left" />
            </button>
            <h1 style={{
              fontSize: 'var(--text-2xl)',
              fontWeight: 700,
              letterSpacing: '-0.02em',
              margin: 0,
              color: 'var(--color-foreground)',
            }}>
              {activeStaffRow.staffName} · {monthLabel}
            </h1>
          </div>
          <div style={{
            fontSize: 'var(--text-sm)',
            color: 'var(--color-foreground-muted)',
            marginLeft: '36px',
          }}>
            {activeStaffRow.jobTitle}
          </div>
        </div>

        {/* Detail Card Container */}
        <div style={{
          width: '100%',
          maxWidth: '520px',
          background: 'var(--color-surface)',
          border: '0.5px solid var(--color-border)',
          borderRadius: '16px',
          padding: '28px',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
        }}>

          {/* Base Salary (Read-only) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{
              fontSize: 'var(--text-xs)',
              fontWeight: 500,
              color: 'var(--color-foreground-muted)',
            }}>
              Base salary
            </label>
            <div style={{
              height: '42px',
              background: 'var(--color-surface-raised)',
              border: '0.5px solid var(--color-border)',
              borderRadius: '8px',
              padding: '0 14px',
              display: 'flex',
              alignItems: 'center',
              fontSize: 'var(--text-sm)',
              fontWeight: 600,
              color: 'var(--color-foreground)',
            }}>
              {formatRupees(activeBaseSalary)}
            </div>
          </div>

          {/* Advance 1 Row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--color-foreground-muted)' }}>
                Advance 1
              </label>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                background: 'var(--color-surface-raised)',
                border: '0.5px solid var(--color-border)',
                borderRadius: '8px',
                height: '42px',
                padding: '0 12px',
              }}>
                <span style={{ color: 'var(--color-foreground-muted)', marginRight: '6px' }}>₹</span>
                <input
                  id="adv1-amount-input"
                  type="text"
                  value={formAdv1Amount === '0' ? '' : formAdv1Amount}
                  placeholder="0"
                  onChange={e => {
                    const parsed = parseCurrencyInput(e.target.value)
                    setFormAdv1Amount(String(parsed))
                    setFormChanged(true)
                    setValidationError('')
                    if (parsed > 0 && !formAdv1Date) {
                      setFormAdv1Date(defaultMonthDate)
                    }
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    width: '100%',
                    color: 'var(--color-foreground)',
                    fontSize: 'var(--text-sm)',
                    fontWeight: 500,
                    fontFamily: 'var(--font-inter)',
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--color-foreground-muted)' }}>
                Date
              </label>
              <DateField
                value={formAdv1Date}
                onChange={d => {
                  setFormAdv1Date(d)
                  setFormChanged(true)
                }}
                placeholder="DD/MM/YYYY"
                allowEmpty={true}
              />
            </div>
          </div>

          {/* Advance 2 Row (Disabled until Advance 1 has data) */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '14px',
            opacity: isAdv2Unlocked ? 1 : 0.45,
            pointerEvents: isAdv2Unlocked ? 'auto' : 'none',
            transition: 'opacity 0.2s',
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--color-foreground-muted)' }}>
                Advance 2
              </label>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                background: 'var(--color-surface-raised)',
                border: '0.5px solid var(--color-border)',
                borderRadius: '8px',
                height: '42px',
                padding: '0 12px',
              }}>
                <span style={{ color: 'var(--color-foreground-muted)', marginRight: '6px' }}>₹</span>
                <input
                  id="adv2-amount-input"
                  type="text"
                  disabled={!isAdv2Unlocked}
                  value={formAdv2Amount === '0' ? '' : formAdv2Amount}
                  placeholder="0"
                  onChange={e => {
                    const parsed = parseCurrencyInput(e.target.value)
                    setFormAdv2Amount(String(parsed))
                    setFormChanged(true)
                    setValidationError('')
                    if (parsed > 0 && !formAdv2Date) {
                      setFormAdv2Date(defaultMonthDate)
                    }
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    width: '100%',
                    color: 'var(--color-foreground)',
                    fontSize: 'var(--text-sm)',
                    fontWeight: 500,
                    fontFamily: 'var(--font-inter)',
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--color-foreground-muted)' }}>
                Date
              </label>
              <DateField
                value={formAdv2Date}
                onChange={d => {
                  setFormAdv2Date(d)
                  setFormChanged(true)
                }}
                placeholder="DD/MM/YYYY"
                disabled={!isAdv2Unlocked}
                allowEmpty={true}
              />
            </div>
          </div>

          {/* Advance 3 Row (Disabled until Advance 2 has data) */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '14px',
            opacity: isAdv3Unlocked ? 1 : 0.45,
            pointerEvents: isAdv3Unlocked ? 'auto' : 'none',
            transition: 'opacity 0.2s',
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--color-foreground-muted)' }}>
                Advance 3 (optional)
              </label>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                background: 'var(--color-surface-raised)',
                border: '0.5px solid var(--color-border)',
                borderRadius: '8px',
                height: '42px',
                padding: '0 12px',
              }}>
                <span style={{ color: 'var(--color-foreground-muted)', marginRight: '6px' }}>₹</span>
                <input
                  id="adv3-amount-input"
                  type="text"
                  disabled={!isAdv3Unlocked}
                  value={formAdv3Amount === '0' ? '' : formAdv3Amount}
                  placeholder="0"
                  onChange={e => {
                    const parsed = parseCurrencyInput(e.target.value)
                    setFormAdv3Amount(String(parsed))
                    setFormChanged(true)
                    setValidationError('')
                    if (parsed > 0 && !formAdv3Date) {
                      setFormAdv3Date(defaultMonthDate)
                    }
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    width: '100%',
                    color: 'var(--color-foreground)',
                    fontSize: 'var(--text-sm)',
                    fontWeight: 500,
                    fontFamily: 'var(--font-inter)',
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--color-foreground-muted)' }}>
                Date
              </label>
              <DateField
                value={formAdv3Date}
                onChange={d => {
                  setFormAdv3Date(d)
                  setFormChanged(true)
                }}
                placeholder="DD/MM/YYYY"
                disabled={!isAdv3Unlocked}
                allowEmpty={true}
              />
            </div>
          </div>

          {/* Validation Error Alert */}
          {validationError && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: 'var(--color-danger-muted)',
              border: '0.5px solid var(--color-danger)',
              borderRadius: '8px',
              padding: '10px 14px',
              color: 'var(--color-danger)',
              fontSize: 'var(--text-xs)',
              fontWeight: 500,
            }}>
              <i className="ti ti-alert-circle" style={{ fontSize: '16px', flexShrink: 0 }} />
              <span>{validationError}</span>
            </div>
          )}

          {/* Live Summary Box */}
          <div style={{
            background: 'var(--color-surface-raised)',
            border: '0.5px solid var(--color-border)',
            borderRadius: '12px',
            padding: '16px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-foreground-muted)' }}>
                Total advances
              </span>
              <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--color-foreground)' }}>
                {formatRupees(liveTotalAdvances)}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-foreground)' }}>
                Salary pending
              </span>
              <span style={{
                fontSize: 'var(--text-xl)',
                fontWeight: 700,
                color: liveSalaryPending >= 0 ? 'var(--color-success)' : 'var(--color-danger)',
              }}>
                {formatRupees(liveSalaryPending)}
              </span>
            </div>
          </div>

          {/* Footer Actions */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '12px', marginTop: '6px' }}>
            <button
              id="salary-save-btn"
              onClick={handleSaveAdvances}
              disabled={!formChanged || saving}
              style={{
                height: '40px',
                padding: '0 24px',
                borderRadius: '8px',
                background: 'var(--color-surface-raised)',
                border: '0.5px solid var(--color-border)',
                color: 'var(--color-foreground)',
                fontSize: 'var(--text-sm)',
                fontWeight: 600,
                fontFamily: 'var(--font-inter)',
                cursor: !formChanged || saving ? 'not-allowed' : 'pointer',
                opacity: !formChanged || saving ? 0.5 : 1,
                transition: 'opacity 0.15s, background 0.15s',
              }}
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>

        </div>

        {/* Back Button Confirmation Modal (Save or Cancel) */}
        {showBackConfirm && (
          <div
            onClick={() => setShowBackConfirm(false)}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 9999,
              background: 'rgba(0,0,0,0.7)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px',
            }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                width: '100%',
                maxWidth: '420px',
                background: 'var(--color-surface-overlay)',
                border: '0.5px solid var(--color-border)',
                borderRadius: '16px',
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '20px',
                boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <h3 style={{
                    fontSize: 'var(--text-lg)',
                    fontWeight: 600,
                    margin: 0,
                    color: 'var(--color-foreground)',
                  }}>
                    Save Changes?
                  </h3>
                  <p style={{
                    fontSize: 'var(--text-sm)',
                    color: 'var(--color-foreground-muted)',
                    margin: 0,
                    lineHeight: 1.5,
                  }}>
                    You have unsaved changes to this salary advance. Would you like to save them before leaving, or cancel and discard?
                  </p>
                </div>
                <button
                  onClick={() => setShowBackConfirm(false)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--color-foreground-muted)',
                    cursor: 'pointer',
                    padding: '4px',
                    fontSize: '18px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  title="Close"
                >
                  <i className="ti ti-x" />
                </button>
              </div>

              {validationError && (
                <div style={{
                  padding: '10px 14px',
                  borderRadius: '8px',
                  background: 'var(--color-danger-muted)',
                  border: '0.5px solid var(--color-danger)',
                  color: 'var(--color-danger)',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 500,
                }}>
                  {validationError}
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setFormChanged(false)
                    setShowBackConfirm(false)
                    setActiveStaffUid(null)
                  }}
                  style={{
                    height: '38px',
                    padding: '0 18px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    background: 'transparent',
                    border: '0.5px solid var(--color-border)',
                    color: 'var(--color-foreground)',
                    fontSize: 'var(--text-sm)',
                    fontFamily: 'var(--font-inter)',
                    fontWeight: 500,
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveAdvances}
                  disabled={saving}
                  style={{
                    height: '38px',
                    padding: '0 20px',
                    borderRadius: '8px',
                    cursor: saving ? 'not-allowed' : 'pointer',
                    background: 'var(--color-primary)',
                    border: 'none',
                    color: '#ffffff',
                    fontSize: 'var(--text-sm)',
                    fontFamily: 'var(--font-inter)',
                    fontWeight: 600,
                    opacity: saving ? 0.7 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // VIEW 1: Salary Monthly Grid (Matching Screenshot 1)
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div style={{
      fontFamily: 'var(--font-inter)',
      color: 'var(--color-foreground)',
      padding: '24px',
      maxWidth: '1280px',
      margin: '0 auto',
      display: 'flex',
      flexDirection: 'column',
      gap: '20px',
    }}>

      {/* ── Subheader / Control Row ────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
      }}>
        {/* Left: Month Navigator Pill + Admin only badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'var(--color-surface)',
            border: '0.5px solid var(--color-border)',
            borderRadius: '10px',
            padding: '4px 10px',
            height: '38px',
          }}>
            <button
              id="salary-prev-month"
              onClick={() => {
                setLoading(true)
                setViewDate(d => subMonths(d, 1))
              }}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--color-foreground-muted)',
                display: 'flex',
                alignItems: 'center',
                padding: '4px',
              }}
              title="Previous month"
            >
              <i className="ti ti-chevron-left" style={{ fontSize: '16px' }} />
            </button>

            <span style={{
              fontSize: 'var(--text-sm)',
              fontWeight: 600,
              minWidth: '120px',
              textAlign: 'center',
              color: 'var(--color-foreground)',
            }}>
              {monthLabel}
            </span>

            <button
              id="salary-next-month"
              onClick={() => {
                setLoading(true)
                setViewDate(d => addMonths(d, 1))
              }}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--color-foreground-muted)',
                display: 'flex',
                alignItems: 'center',
                padding: '4px',
              }}
              title="Next month"
            >
              <i className="ti ti-chevron-right" style={{ fontSize: '16px' }} />
            </button>
          </div>
        </div>

        {/* Right: Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            id="salary-export-csv-btn"
            onClick={handleExportCSV}
            disabled={processedRows.length === 0}
            style={{
              height: '38px',
              padding: '0 16px',
              borderRadius: '8px',
              background: 'var(--color-surface-raised)',
              border: '0.5px solid var(--color-border)',
              color: 'var(--color-foreground)',
              fontSize: 'var(--text-sm)',
              fontWeight: 500,
              fontFamily: 'var(--font-inter)',
              cursor: processedRows.length === 0 ? 'not-allowed' : 'pointer',
              opacity: processedRows.length === 0 ? 0.5 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            Export CSV
          </button>

          <button
            id="salary-generate-all-payslips-btn"
            onClick={() => router.push('/hrms/payslips')}
            style={{
              height: '38px',
              padding: '0 18px',
              borderRadius: '8px',
              background: 'var(--color-primary)',
              color: '#ffffff',
              border: 'none',
              fontSize: 'var(--text-sm)',
              fontWeight: 600,
              fontFamily: 'var(--font-inter)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            Generate all payslips
          </button>
        </div>
      </div>

      {/* ── Salary Table ─────────────────────────────────────────────────── */}
      <div style={{
        background: 'var(--color-surface)',
        border: '0.5px solid var(--color-border)',
        borderRadius: '12px',
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...TH_STYLE, width: '220px', textAlign: 'left' }}>Staff</th>
                <th style={{ ...TH_STYLE, width: '120px', textAlign: 'right' }}>Base</th>
                <th style={{ ...TH_STYLE, width: '120px', textAlign: 'right' }}>Advance 1</th>
                <th style={{ ...TH_STYLE, width: '120px', textAlign: 'right' }}>Advance 2</th>
                <th style={{ ...TH_STYLE, width: '120px', textAlign: 'right' }}>Advance 3</th>
                <th style={{ ...TH_STYLE, width: '130px', textAlign: 'right' }}>Total Adv.</th>
                <th style={{ ...TH_STYLE, width: '130px', textAlign: 'right' }}>Pending</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableRowSkeleton rows={6} cols={7} />
              ) : processedRows.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '40px 16px', textAlign: 'center' }}>
                    <EmptyState
                      icon="ti-cash"
                      title="No staff records found"
                      description="Add staff members to start tracking monthly salary advances."
                    />
                  </td>
                </tr>
              ) : (
                <>
                  {processedRows.map(row => {
                    const isOverdraft = row.pending < 0

                    return (
                      <tr
                        key={row.staffUid}
                        style={{
                          transition: 'background 0.12s',
                        }}
                      >
                        {/* Staff Name (Clickable) */}
                        <td style={{ ...TD_STYLE, textAlign: 'left' }}>
                          <button
                            onClick={() => handleOpenStaffDetail(row.staffUid)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--color-foreground)',
                              fontWeight: 600,
                              fontSize: 'var(--text-sm)',
                              fontFamily: 'var(--font-inter)',
                              cursor: 'pointer',
                              padding: 0,
                              textAlign: 'left',
                              textDecoration: 'none',
                            }}
                            onMouseEnter={e => {
                              e.currentTarget.style.color = 'var(--color-primary)'
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.color = 'var(--color-foreground)'
                            }}
                          >
                            {row.staffName}
                          </button>
                        </td>

                        {/* Base Salary */}
                        <td style={{ ...TD_STYLE, textAlign: 'right', fontWeight: 500 }}>
                          {formatRupees(row.baseSalary)}
                        </td>

                        {/* Advance 1 */}
                        <td style={{
                          ...TD_STYLE,
                          textAlign: 'right',
                        }}>
                          {row.adv1Amount > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                              <span style={{
                                fontWeight: 600,
                                color: 'var(--color-foreground)',
                              }}>
                                {formatRupees(row.adv1Amount)}
                              </span>
                              {row.adv1Date ? (
                                <span style={{
                                  fontSize: 'var(--text-xs)',
                                  color: 'var(--color-foreground-muted)',
                                  fontWeight: 400,
                                }}>
                                  {formatDisplayDate(row.adv1Date)}
                                </span>
                              ) : null}
                            </div>
                          ) : (
                            <span style={{ color: 'var(--color-foreground-subtle)' }}>—</span>
                          )}
                        </td>

                        {/* Advance 2 */}
                        <td style={{
                          ...TD_STYLE,
                          textAlign: 'right',
                        }}>
                          {row.adv2Amount > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                              <span style={{
                                fontWeight: 600,
                                color: 'var(--color-foreground)',
                              }}>
                                {formatRupees(row.adv2Amount)}
                              </span>
                              {row.adv2Date ? (
                                <span style={{
                                  fontSize: 'var(--text-xs)',
                                  color: 'var(--color-foreground-muted)',
                                  fontWeight: 400,
                                }}>
                                  {formatDisplayDate(row.adv2Date)}
                                </span>
                              ) : null}
                            </div>
                          ) : (
                            <span style={{ color: 'var(--color-foreground-subtle)' }}>—</span>
                          )}
                        </td>

                        {/* Advance 3 */}
                        <td style={{
                          ...TD_STYLE,
                          textAlign: 'right',
                        }}>
                          {row.adv3Amount > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                              <span style={{
                                fontWeight: 600,
                                color: 'var(--color-foreground)',
                              }}>
                                {formatRupees(row.adv3Amount)}
                              </span>
                              {row.adv3Date ? (
                                <span style={{
                                  fontSize: 'var(--text-xs)',
                                  color: 'var(--color-foreground-muted)',
                                  fontWeight: 400,
                                }}>
                                  {formatDisplayDate(row.adv3Date)}
                                </span>
                              ) : null}
                            </div>
                          ) : (
                            <span style={{ color: 'var(--color-foreground-subtle)' }}>—</span>
                          )}
                        </td>

                        {/* Total Advance */}
                        <td style={{ ...TD_STYLE, textAlign: 'right', fontWeight: 700 }}>
                          {formatRupees(row.totalAdvance)}
                        </td>

                        {/* Pending */}
                        <td style={{
                          ...TD_STYLE,
                          textAlign: 'right',
                          fontWeight: 700,
                          color: isOverdraft ? 'var(--color-danger)' : 'var(--color-success)',
                        }}>
                          {formatRupees(row.pending)}
                        </td>
                      </tr>
                    )
                  })}

                  {/* Totals Row */}
                  <tr style={{
                    background: 'var(--color-surface-raised)',
                    borderTop: '0.5px solid var(--color-border-strong)',
                  }}>
                    <td style={{
                      ...TD_STYLE,
                      textAlign: 'left',
                      fontWeight: 600,
                      fontSize: 'var(--text-xs)',
                      color: 'var(--color-foreground-subtle)',
                      letterSpacing: '0.04em',
                    }}>
                      TOTALS
                    </td>

                    <td style={{ ...TD_STYLE, textAlign: 'right', fontWeight: 700 }}>
                      {formatRupees(totals.totalBase)}
                    </td>

                    <td style={{ ...TD_STYLE, textAlign: 'right', fontWeight: 600 }}>
                      {formatRupees(totals.totalAdv1)}
                    </td>

                    <td style={{ ...TD_STYLE, textAlign: 'right', fontWeight: 600 }}>
                      {formatRupees(totals.totalAdv2)}
                    </td>

                    <td style={{ ...TD_STYLE, textAlign: 'right', fontWeight: 600 }}>
                      {formatRupees(totals.totalAdv3)}
                    </td>

                    <td style={{ ...TD_STYLE, textAlign: 'right', fontWeight: 700 }}>
                      {formatRupees(totals.totalAdvances)}
                    </td>

                    <td style={{
                      ...TD_STYLE,
                      textAlign: 'right',
                      fontWeight: 700,
                      color: totals.totalPending >= 0 ? 'var(--color-success)' : 'var(--color-danger)',
                    }}>
                      {formatRupees(totals.totalPending)}
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  )
}

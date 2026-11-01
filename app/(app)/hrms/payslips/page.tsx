'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { format, addMonths, subMonths } from 'date-fns'
import { useAuthStore } from '@/store/authStore'
import { useBackSwipe } from '@/hooks/useMobileGestures'
import { Badge } from '@/components/shared/Badge'
import { EmptyState } from '@/components/shared/EmptyState'
import { TableRowSkeleton } from '@/components/shared/LoadingSkeleton'
import { Button } from '@/components/ui/button'
import { PayslipDeductionsModal } from '@/components/hrms/PayslipDeductionsModal'
import {
  subscribeToStaffOnly,
  subscribeToAllAttendanceRecords,
  type StaffMember,
} from '@/lib/firebase/queries/staff'
import { subscribeMonthlySalaries } from '@/lib/firebase/queries/salary'
import {
  subscribeMonthlyPayslips,
  subscribeStaffPayslipHistory,
  requestGeneratePayslip,
} from '@/lib/firebase/queries/payslips'
import {
  calculatePayslip,
  formatIndianCurrency,
  type PayrollAdjustmentParams,
} from '@/lib/payroll/calculator'
import type { AttendanceRecord, Salary, PayslipRecord } from '@/types'

// ─── Table Header Style Token ──────────────────────────────────────────────────
const TH_STYLE: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  fontWeight: 600,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: 'var(--color-foreground-subtle)',
  padding: '12px 16px',
  borderBottom: '0.5px solid var(--color-border-strong)',
  background: 'var(--color-surface)',
  textAlign: 'left',
}

const TD_STYLE: React.CSSProperties = {
  fontSize: 'var(--text-sm)',
  padding: '14px 16px',
  verticalAlign: 'middle',
  color: 'var(--color-foreground)',
  borderBottom: '0.5px solid var(--color-border)',
  fontFamily: 'var(--font-inter)',
}

export default function PayslipsPage() {
  const router = useRouter()
  const { backSwipeHandlers } = useBackSwipe()
  const appUser = useAuthStore((s) => s.appUser)
  const role = appUser?.role ?? 'staff'
  const isAdminOrManager = role === 'admin' || role === 'manager'

  // Redirect staff users away from payslips management page
  useEffect(() => {
    if (appUser && !isAdminOrManager) {
      router.replace('/hrms/timeclock')
    }
  }, [appUser, isAdminOrManager, router])

  // Month navigation:
  // Strictly completed months only.
  // Example: If today is in November, only months up to October can be generated/downloaded.
  // When December arrives, November payslips become available to generate/download.
  const now = useMemo(() => new Date(), [])
  // Latest completed month = 1st day of the previous calendar month
  const maxAllowedDate = useMemo(() => new Date(now.getFullYear(), now.getMonth() - 1, 1), [now])

  const [currentDate, setCurrentDate] = useState<Date>(() => {
    // Defaults directly to the latest completed month (e.g. October when current month is November)
    return new Date(now.getFullYear(), now.getMonth() - 1, 1)
  })
  const selectedYear = currentDate.getFullYear()
  const selectedMonth = currentDate.getMonth() + 1 // 1-12

  // Check if selected month is ongoing (current month) or in the future
  const isUpcomingMonth = useMemo(() => {
    const selectedStart = new Date(selectedYear, selectedMonth - 1, 1)
    return selectedStart > maxAllowedDate
  }, [selectedYear, selectedMonth, maxAllowedDate])

  const canGoNextMonth = useMemo(() => {
    const nextMonth = addMonths(currentDate, 1)
    return new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 1) <= maxAllowedDate
  }, [currentDate, maxAllowedDate])

  // Data states
  const [staffList, setStaffList] = useState<StaffMember[]>([])
  const [attendanceMap, setAttendanceMap] = useState<Record<string, AttendanceRecord>>({})
  const [salariesMap, setSalariesMap] = useState<Record<string, Salary>>({})
  const [monthlyPayslipsMap, setMonthlyPayslipsMap] = useState<Record<string, PayslipRecord>>({})
  const [staffHistory, setStaffHistory] = useState<PayslipRecord[]>([])
  const [loading, setLoading] = useState(true)

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'ready' | 'generated' | 'missing'>('all')

  // Modal State
  const [selectedStaffForModal, setSelectedStaffForModal] = useState<StaffMember | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [activeGeneratingUid, setActiveGeneratingUid] = useState<string | null>(null)

  // Bulk Generation State
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number; activeName: string } | null>(null)
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null)

  const showToast = useCallback((text: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToastMessage({ text, type })
    setTimeout(() => {
      setToastMessage((prev) => (prev?.text === text ? null : prev))
    }, 4500)
  }, [])

  // ─── 1. Subscriptions for Admin/Manager ──────────────────────────────────────
  useEffect(() => {
    if (!isAdminOrManager) return
    setLoading(true)

    // Staff list
    const unsubStaff = subscribeToStaffOnly((staff) => {
      setStaffList(staff)
      setLoading(false)
    })

    // Attendance for selected month
    const unsubAtt = subscribeToAllAttendanceRecords(selectedYear, selectedMonth, (recordsMap) => {
      setAttendanceMap(recordsMap)
    })

    // Salaries for selected month
    const unsubSal = subscribeMonthlySalaries(selectedYear, selectedMonth, (salaries) => {
      setSalariesMap(salaries)
    })

    // Generated payslips for selected month
    const unsubPayslips = subscribeMonthlyPayslips(selectedYear, selectedMonth, (payslips) => {
      const map: Record<string, PayslipRecord> = {}
      for (const p of payslips) {
        map[p.staffUid] = p
      }
      setMonthlyPayslipsMap(map)
    })

    return () => {
      unsubStaff()
      unsubAtt()
      unsubSal()
      unsubPayslips()
    }
  }, [isAdminOrManager, selectedYear, selectedMonth])

  // ─── 2. Subscription for Staff Role ──────────────────────────────────────────
  useEffect(() => {
    if (isAdminOrManager || !appUser?.uid) return
    setLoading(true)

    const unsubHistory = subscribeStaffPayslipHistory(appUser.uid, (records) => {
      setStaffHistory(records)
      setLoading(false)
    })

    return () => {
      unsubHistory()
    }
  }, [isAdminOrManager, appUser?.uid])

  // ─── 3. Computed Staff Rows ──────────────────────────────────────────────────
  const processedRows = useMemo(() => {
    return staffList.map((staff) => {
      const att = attendanceMap[staff.uid] || null
      const sal = salariesMap[staff.uid] || null
      const existing = monthlyPayslipsMap[staff.uid] || null

      const baseSalary = Number(staff.baseSalary || 0)
      const hasBaseSalary = baseSalary > 0

      const calculation = calculatePayslip({
        staffUid: staff.uid,
        staffName: staff.name,
        jobTitle: staff.jobTitle,
        year: selectedYear,
        month: selectedMonth,
        baseSalary,
        attendanceRecord: att,
        salaryRecord: sal,
        payslipNumber: existing?.payslipNumber || 'ZS-PS-0000',
      })

      let status: 'generated' | 'ready' | 'missing' = 'ready'
      let missingReason = ''

      if (existing) {
        status = 'generated'
      } else if (!hasBaseSalary) {
        status = 'missing'
        missingReason = 'Missing base salary'
      }

      return {
        staff,
        att,
        sal,
        existing,
        baseSalary,
        calculation,
        status,
        missingReason,
      }
    })
  }, [staffList, attendanceMap, salariesMap, monthlyPayslipsMap, selectedYear, selectedMonth])

  // ─── 4. Filtered Rows ────────────────────────────────────────────────────────
  const filteredRows = useMemo(() => {
    return processedRows.filter((r) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchesName = r.staff.name.toLowerCase().includes(q)
        const matchesRole = (r.staff.jobTitle || '').toLowerCase().includes(q)
        if (!matchesName && !matchesRole) return false
      }

      if (filterStatus === 'ready') return r.status === 'ready'
      if (filterStatus === 'generated') return r.status === 'generated'
      if (filterStatus === 'missing') return r.status === 'missing'

      return true
    })
  }, [processedRows, searchQuery, filterStatus])

  // ─── 5. KPI Stats ───────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const totalStaff = processedRows.length
    const readyCount = processedRows.filter((r) => r.status === 'ready').length
    const generatedCount = processedRows.filter((r) => r.status === 'generated').length
    const missingCount = processedRows.filter((r) => r.status === 'missing').length
    const totalPayroll = processedRows.reduce((acc, r) => acc + (r.existing?.netPay ?? r.calculation.netPay), 0)

    return { totalStaff, readyCount, generatedCount, missingCount, totalPayroll }
  }, [processedRows])

  // ─── 6. Action: Generate / Download Handler ──────────────────────────────────
  const handleGeneratePayslip = async (
    staff: StaffMember,
    adjustments: PayrollAdjustmentParams = {},
    action: 'download' | 'preview' = 'download'
  ) => {
    try {
      setIsGenerating(true)
      setActiveGeneratingUid(staff.uid)

      const { blob, filename } = await requestGeneratePayslip({
        staffUid: staff.uid,
        year: selectedYear,
        month: selectedMonth,
        action,
        adjustments,
      })

      const blobUrl = URL.createObjectURL(blob)

      if (action === 'preview') {
        window.open(blobUrl, '_blank')
      } else {
        const link = document.createElement('a')
        link.href = blobUrl
        link.download = filename
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
      }

      setTimeout(() => URL.createObjectURL(blob), 60000)
      showToast(`Payslip for ${staff.name} generated successfully!`, 'success')
      setIsModalOpen(false)
      setSelectedStaffForModal(null)
    } catch (err: unknown) {
      console.error('[Generate Error]:', err)
      const msg = err instanceof Error ? err.message : 'Failed to generate payslip'
      showToast(msg, 'error')
    } finally {
      setIsGenerating(false)
      setActiveGeneratingUid(null)
    }
  }

  // ─── 7. Action: Generate All Payslips (Sequential Batch Runner) ───────────────
  const handleGenerateAll = async () => {
    const eligibleRows = processedRows.filter((r) => r.status === 'ready' || r.status === 'generated')
    if (eligibleRows.length === 0) {
      showToast('No eligible staff members ready for payslip generation.', 'info')
      return
    }

    setBulkProgress({ current: 0, total: eligibleRows.length, activeName: '' })

    let successCount = 0
    let failureCount = 0

    for (let i = 0; i < eligibleRows.length; i++) {
      const row = eligibleRows[i]
      setBulkProgress({
        current: i + 1,
        total: eligibleRows.length,
        activeName: row.staff.name,
      })

      try {
        const { blob, filename } = await requestGeneratePayslip({
          staffUid: row.staff.uid,
          year: selectedYear,
          month: selectedMonth,
          action: 'download',
        })

        const blobUrl = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = blobUrl
        link.download = filename
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)

        successCount++
        // Polite delay to prevent browser download popup throttling
        await new Promise((resolve) => setTimeout(resolve, 450))
      } catch (err) {
        console.error(`Failed to generate for ${row.staff.name}:`, err)
        failureCount++
      }
    }

    setBulkProgress(null)
    if (failureCount === 0) {
      showToast(`All ${successCount} payslips generated and downloaded successfully!`, 'success')
    } else {
      showToast(`${successCount} payslips downloaded, ${failureCount} failed.`, 'info')
    }
  }

  // ─── STAFF VIEW (ROLE === 'STAFF') ──────────────────────────────────────────
  // Per business rule, staff role does not have access to payslips page.
  if (!isAdminOrManager) {
    return (
      <div
        style={{
          maxWidth: '1280px',
          margin: '0 auto',
          padding: '60px 16px',
          textAlign: 'center',
          fontFamily: 'var(--font-inter)',
        }}
      >
        <EmptyState
          icon="ti-lock"
          title="Access Restricted"
          description="Payslip management is only accessible to Studio Administrators and Managers."
        />
      </div>
    )
  }

  // ─── ADMIN & MANAGER VIEW ───────────────────────────────────────────────────
  return (
    <div
      {...backSwipeHandlers}
      style={{
        maxWidth: '1280px',
        margin: '0 auto',
        padding: '24px 16px',
        fontFamily: 'var(--font-inter)',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
      }}
    >
      {/* TOAST FEEDBACK */}
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            zIndex: 10000,
            padding: '12px 18px',
            borderRadius: '8px',
            backgroundColor: toastMessage.type === 'error' ? 'var(--color-danger)' : 'var(--color-surface-raised)',
            border: `0.5px solid ${toastMessage.type === 'error' ? 'var(--color-danger)' : 'var(--color-primary)'}`,
            color: toastMessage.type === 'error' ? '#ffffff' : 'var(--color-foreground)',
            fontSize: 'var(--text-sm)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <i className={`ti ${toastMessage.type === 'error' ? 'ti-alert-circle' : 'ti-check'}`} />
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* HEADER WITH MONTH NAVIGATION */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div>
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--color-foreground)', margin: 0 }}>
            Payslip Management
          </h1>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-foreground-muted)', margin: '4px 0 0 0' }}>
            Review attendance, adjust deductions, and generate monthly payslips in INR.
          </p>
        </div>

        {/* MONTH STEPPER */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: 'var(--color-surface)',
            padding: '6px 12px',
            borderRadius: '10px',
            border: '0.5px solid var(--color-border)',
          }}
        >
          <button
            onClick={() => setCurrentDate((prev) => subMonths(prev, 1))}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--color-foreground)',
              fontSize: '18px',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <i className="ti ti-chevron-left" />
          </button>

          <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, minWidth: '130px', textAlign: 'center' }}>
            {format(currentDate, 'MMMM yyyy')}
          </span>

          <button
            onClick={() => {
              if (canGoNextMonth) {
                setCurrentDate((prev) => addMonths(prev, 1))
              }
            }}
            disabled={!canGoNextMonth}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: canGoNextMonth ? 'pointer' : 'not-allowed',
              color: canGoNextMonth ? 'var(--color-foreground)' : 'var(--color-foreground-subtle)',
              opacity: canGoNextMonth ? 1 : 0.4,
              fontSize: '18px',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
            }}
            title={canGoNextMonth ? 'Next Month' : 'Upcoming months cannot be generated yet'}
          >
            <i className="ti ti-chevron-right" />
          </button>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => setCurrentDate(new Date(now.getFullYear(), now.getMonth() - 1, 1))}
            style={{ fontSize: 'var(--text-xs)', padding: '4px 8px', height: 'auto', marginLeft: '4px' }}
          >
            Latest Closed Month
          </Button>
        </div>
      </div>

      {/* KPI METRIC CARDS */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: '16px',
        }}
      >
        <div
          style={{
            padding: '16px 20px',
            borderRadius: '12px',
            backgroundColor: 'var(--color-surface)',
            border: '0.5px solid var(--color-border)',
          }}
        >
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
            Total Staff
          </div>
          <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--color-foreground)', marginTop: '4px' }}>
            {stats.totalStaff}
          </div>
        </div>

        <div
          style={{
            padding: '16px 20px',
            borderRadius: '12px',
            backgroundColor: 'var(--color-surface)',
            border: '0.5px solid var(--color-border)',
          }}
        >
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
            Ready to Generate
          </div>
          <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--color-primary)', marginTop: '4px' }}>
            {stats.readyCount}
          </div>
        </div>

        <div
          style={{
            padding: '16px 20px',
            borderRadius: '12px',
            backgroundColor: 'var(--color-surface)',
            border: '0.5px solid var(--color-border)',
          }}
        >
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
            Generated Payslips
          </div>
          <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--color-success)', marginTop: '4px' }}>
            {stats.generatedCount}
          </div>
        </div>

        <div
          style={{
            padding: '16px 20px',
            borderRadius: '12px',
            backgroundColor: 'var(--color-surface)',
            border: '0.5px solid var(--color-border)',
          }}
        >
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
            Estimated Net Payroll
          </div>
          <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--color-foreground)', marginTop: '4px' }}>
            {formatIndianCurrency(stats.totalPayroll)}
          </div>
        </div>
      </div>

      {/* TOOLBAR: SEARCH, FILTERS, & BULK ACTION */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          padding: '12px 16px',
          borderRadius: '12px',
          backgroundColor: 'var(--color-surface)',
          border: '0.5px solid var(--color-border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: '260px' }}>
          {/* Search */}
          <div style={{ position: 'relative', width: '100%', maxWidth: '300px' }}>
            <i
              className="ti ti-search"
              style={{
                position: 'absolute',
                left: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--color-foreground-subtle)',
              }}
            />
            <input
              type="text"
              placeholder="Search staff or designation..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px 8px 34px',
                borderRadius: '8px',
                border: '0.5px solid var(--color-border)',
                backgroundColor: 'var(--color-surface-raised)',
                color: 'var(--color-foreground)',
                fontSize: 'var(--text-sm)',
                outline: 'none',
              }}
            />
          </div>

          {/* Filter Pills */}
          <div style={{ display: 'flex', gap: '6px' }}>
            {(['all', 'ready', 'generated', 'missing'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setFilterStatus(tab)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '20px',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: filterStatus === tab ? '0.5px solid var(--color-primary)' : '0.5px solid var(--color-border)',
                  backgroundColor: filterStatus === tab ? 'var(--color-primary-muted)' : 'transparent',
                  color: filterStatus === tab ? 'var(--color-primary)' : 'var(--color-foreground-muted)',
                  textTransform: 'capitalize',
                }}
              >
                {tab === 'all' ? 'All Staff' : tab}
              </button>
            ))}
          </div>
        </div>

        {/* BULK ACTION BUTTON */}
        <Button
          onClick={handleGenerateAll}
          disabled={Boolean(bulkProgress) || isUpcomingMonth || stats.readyCount + stats.generatedCount === 0}
          style={{
            backgroundColor: isUpcomingMonth ? 'var(--color-surface-raised)' : 'var(--color-primary)',
            color: isUpcomingMonth ? 'var(--color-foreground-muted)' : '#ffffff',
            fontWeight: 600,
            fontSize: 'var(--text-sm)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            cursor: isUpcomingMonth ? 'not-allowed' : 'pointer',
          }}
          title={isUpcomingMonth ? 'Upcoming months cannot be generated yet' : undefined}
        >
          {bulkProgress ? (
            <>
              <i className="ti ti-loader ti-spin" />
              <span>
                Generating {bulkProgress.current} of {bulkProgress.total}...
              </span>
            </>
          ) : (
            <>
              <i className="ti ti-download" />
              <span>Generate All Payslips ({stats.readyCount + stats.generatedCount})</span>
            </>
          )}
        </Button>
      </div>

      {/* BULK PROGRESS BANNER */}
      {bulkProgress && (
        <div
          style={{
            padding: '12px 18px',
            borderRadius: '10px',
            backgroundColor: 'var(--color-primary-muted)',
            border: '0.5px solid var(--color-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 'var(--text-sm)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <i className="ti ti-loader ti-spin" style={{ color: 'var(--color-primary)' }} />
            <span>
              Processing <strong>{bulkProgress.activeName}</strong> ({bulkProgress.current} / {bulkProgress.total})
            </span>
          </div>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>
            Sequential auto-download in progress...
          </span>
        </div>
      )}

      {/* DATA GRID: DESKTOP TABLE & MOBILE COMPACT CARDS */}
      {loading ? (
        <div
          style={{
            borderRadius: '12px',
            border: '0.5px solid var(--color-border)',
            backgroundColor: 'var(--color-surface)',
            overflow: 'hidden',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              <TableRowSkeleton rows={5} cols={7} />
            </tbody>
          </table>
        </div>
      ) : filteredRows.length === 0 ? (
        <EmptyState
          icon="ti-file-invoice"
          title="No staff records found"
          description="Try adjusting your filter or search criteria."
        />
      ) : (
        <>
          {/* DESKTOP TABLE (> 768px) */}
          <div
            className="hidden md:block"
            style={{
              borderRadius: '12px',
              border: '0.5px solid var(--color-border)',
              backgroundColor: 'var(--color-surface)',
              overflow: 'hidden',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={TH_STYLE}>STAFF MEMBER</th>
                  <th style={TH_STYLE}>BASE SALARY</th>
                  <th style={TH_STYLE}>ATTENDANCE</th>
                  <th style={TH_STYLE}>DEDUCTIONS</th>
                  <th style={TH_STYLE}>EST. NET PAY</th>
                  <th style={TH_STYLE}>STATUS</th>
                  <th style={{ ...TH_STYLE, textAlign: 'right' }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => {
                  const isCurrentGenerating = activeGeneratingUid === row.staff.uid

                  return (
                    <tr key={row.staff.uid}>
                      {/* 1. Staff Name & Designation */}
                      <td style={TD_STYLE}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div
                            style={{
                              width: '36px',
                              height: '36px',
                              borderRadius: '50%',
                              backgroundColor: 'var(--color-primary-muted)',
                              color: 'var(--color-primary)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 700,
                              fontSize: 'var(--text-sm)',
                            }}
                          >
                            {row.staff.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, color: 'var(--color-foreground)' }}>{row.staff.name}</div>
                            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>
                              {row.staff.jobTitle || 'Staff'}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* 2. Base Salary */}
                      <td style={TD_STYLE}>
                        <span style={{ fontWeight: 600 }}>{formatIndianCurrency(row.baseSalary)}</span>
                      </td>

                      {/* 3. Attendance */}
                      <td style={TD_STYLE}>
                        {row.att?.summary ? (
                          <div style={{ fontSize: 'var(--text-xs)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <div>
                              <strong>{row.att.summary.present}</strong> Present{row.att.summary.weekOff > 0 ? ` · ${row.att.summary.weekOff} WO` : ''}
                            </div>
                            <div style={{ color: 'var(--color-foreground-muted)' }}>
                              {row.att.summary.absent} Absent · {row.att.summary.halfDay} Half
                            </div>
                          </div>
                        ) : (
                          <div style={{ fontSize: 'var(--text-xs)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <div>
                              <strong>{row.calculation.presentDays}</strong> Present / {row.calculation.totalCalendarDays} Days
                            </div>
                            <div style={{ color: 'var(--color-foreground-muted)' }}>
                              Full Calendar Working Days
                            </div>
                          </div>
                        )}
                      </td>

                      {/* 4. Deductions */}
                      <td style={TD_STYLE}>
                        <div style={{ fontSize: 'var(--text-xs)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span>Att: {formatIndianCurrency(row.calculation.attendanceDeduction)}</span>
                          {row.calculation.totalAdvances > 0 && (
                            <span style={{ color: 'var(--color-secondary)' }}>
                              Adv: {formatIndianCurrency(row.calculation.totalAdvances)}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 5. Estimated Net Pay */}
                      <td style={TD_STYLE}>
                        <span style={{ fontWeight: 700, color: 'var(--color-primary)', fontSize: 'var(--text-base)' }}>
                          {formatIndianCurrency(row.existing?.netPay ?? row.calculation.netPay)}
                        </span>
                      </td>

                      {/* 6. Status Badge */}
                      <td style={TD_STYLE}>
                        {row.status === 'generated' ? (
                          <Badge variant="paid" label="Generated" />
                        ) : row.status === 'ready' ? (
                          <Badge variant="available" label="Ready" />
                        ) : (
                          <Badge variant="unpaid" label={row.missingReason || 'Missing Data'} />
                        )}
                      </td>

                      {/* 7. Action Buttons */}
                      <td style={{ ...TD_STYLE, textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                          {isUpcomingMonth ? (
                            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>
                              Upcoming month
                            </span>
                          ) : row.status !== 'missing' ? (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setSelectedStaffForModal(row.staff)
                                  setIsModalOpen(true)
                                }}
                                disabled={isCurrentGenerating}
                                style={{
                                  fontSize: 'var(--text-xs)',
                                  padding: '6px 10px',
                                  backgroundColor: 'var(--color-surface-raised)',
                                  borderColor: 'var(--color-border)',
                                }}
                              >
                                <i className="ti ti-adjustments" style={{ marginRight: '4px' }} />
                                {row.existing ? 'Adjust & Reissue' : 'Generate'}
                              </Button>

                              <Button
                                size="sm"
                                onClick={() => handleGeneratePayslip(row.staff, {}, 'download')}
                                disabled={isCurrentGenerating}
                                style={{
                                  fontSize: 'var(--text-xs)',
                                  padding: '6px 10px',
                                  backgroundColor: 'var(--color-primary)',
                                  color: '#ffffff',
                                }}
                              >
                                {isCurrentGenerating ? (
                                  <i className="ti ti-loader ti-spin" />
                                ) : (
                                  <i className="ti ti-download" />
                                )}
                              </Button>
                            </>
                          ) : (
                            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>
                              Data needed
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* MOBILE COMPACT CARDS (< 768px) */}
          <div className="flex flex-col gap-3 md:hidden">
            {filteredRows.map((row) => (
              <div
                key={row.staff.uid}
                style={{
                  padding: '16px',
                  borderRadius: '12px',
                  backgroundColor: 'var(--color-surface)',
                  border: '0.5px solid var(--color-border)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        backgroundColor: 'var(--color-primary-muted)',
                        color: 'var(--color-primary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: 'var(--text-xs)',
                      }}
                    >
                      {row.staff.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--color-foreground)' }}>
                        {row.staff.name}
                      </div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>
                        {row.staff.jobTitle || 'Staff'}
                      </div>
                    </div>
                  </div>

                  <Badge
                    variant={row.status === 'generated' ? 'paid' : row.status === 'ready' ? 'available' : 'unpaid'}
                    label={row.status === 'generated' ? 'Generated' : row.status === 'ready' ? 'Ready' : (row.missingReason || 'Missing Data')}
                  />
                </div>

                {/* Financial Summary Pill */}
                <div
                  style={{
                    padding: '10px 12px',
                    borderRadius: '8px',
                    backgroundColor: 'var(--color-surface-raised)',
                    border: '0.5px solid var(--color-border)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>Net Salary</div>
                    <div style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--color-primary)' }}>
                      {formatIndianCurrency(row.existing?.netPay ?? row.calculation.netPay)}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right', fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>
                    <div>Base: {formatIndianCurrency(row.baseSalary)}</div>
                    <div>Ded: {formatIndianCurrency(row.calculation.totalDeductions)}</div>
                  </div>
                </div>

                {/* Action Buttons */}
                {isUpcomingMonth ? (
                  <div style={{ textAlign: 'center', fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)', padding: '6px 0' }}>
                    Upcoming month cannot be generated yet
                  </div>
                ) : row.status !== 'missing' ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSelectedStaffForModal(row.staff)
                        setIsModalOpen(true)
                      }}
                      style={{ fontSize: 'var(--text-xs)', padding: '8px' }}
                    >
                      <i className="ti ti-adjustments" style={{ marginRight: '4px' }} />
                      Adjust
                    </Button>

                    <Button
                      size="sm"
                      onClick={() => handleGeneratePayslip(row.staff, {}, 'download')}
                      disabled={activeGeneratingUid === row.staff.uid}
                      style={{ backgroundColor: 'var(--color-primary)', color: '#ffffff', fontSize: 'var(--text-xs)' }}
                    >
                      <i className="ti ti-download" style={{ marginRight: '4px' }} />
                      Download
                    </Button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </>
      )}

      {/* DEDUCTIONS ADJUSTMENT MODAL */}
      {selectedStaffForModal && (
        <PayslipDeductionsModal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false)
            setSelectedStaffForModal(null)
          }}
          staffMember={selectedStaffForModal}
          year={selectedYear}
          month={selectedMonth}
          attendanceRecord={attendanceMap[selectedStaffForModal.uid] || null}
          salaryRecord={salariesMap[selectedStaffForModal.uid] || null}
          existingPayslip={monthlyPayslipsMap[selectedStaffForModal.uid] || null}
          onConfirmGenerate={({ adjustments, action }) =>
            handleGeneratePayslip(selectedStaffForModal, adjustments, action)
          }
          isGenerating={isGenerating}
        />
      )}
    </div>
  )
}

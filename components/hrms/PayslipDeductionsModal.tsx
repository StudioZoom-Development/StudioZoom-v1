'use client'

import { useState, useMemo, useEffect } from 'react'
import type { StaffMember } from '@/lib/firebase/queries/staff'
import type { AttendanceRecord, Salary, PayslipRecord } from '@/types'
import {
  calculatePayslip,
  formatIndianCurrency,
  numberToWordsINR,
  type PayrollAdjustmentParams,
} from '@/lib/payroll/calculator'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

interface PayslipDeductionsModalProps {
  isOpen:             boolean
  onClose:            () => void
  staffMember:        StaffMember | null
  year:               number
  month:              number
  attendanceRecord?:  AttendanceRecord | null
  salaryRecord?:      Salary | null
  existingPayslip?:   PayslipRecord | null
  onConfirmGenerate:  (params: { adjustments: PayrollAdjustmentParams; action: 'download' | 'preview' }) => Promise<void>
  isGenerating?:      boolean
}

export function PayslipDeductionsModal({
  isOpen,
  onClose,
  staffMember,
  year,
  month,
  attendanceRecord,
  salaryRecord,
  existingPayslip,
  onConfirmGenerate,
  isGenerating = false,
}: PayslipDeductionsModalProps) {
  // State for overrides
  const [applyAttendanceDeduction, setApplyAttendanceDeduction] = useState(true)
  const [isCustomAttendance, setIsCustomAttendance] = useState(false)
  const [customAttendanceAmount, setCustomAttendanceAmount] = useState<string>('')

  // Editable attendance metrics (Present, Half-Days, Absences)
  const [presentDaysInput, setPresentDaysInput] = useState<string>('')
  const [halfDaysInput, setHalfDaysInput] = useState<string>('')
  const [absentDaysInput, setAbsentDaysInput] = useState<string>('')

  const [advanceAmount, setAdvanceAmount] = useState<string>('')
  const [customBonus, setCustomBonus] = useState<string>('')
  const [customBonusReason, setCustomBonusReason] = useState<string>('')

  const [customDeduction, setCustomDeduction] = useState<string>('')
  const [customDeductionReason, setCustomDeductionReason] = useState<string>('')

  const baseSalary = Number(staffMember?.baseSalary || 0)

  // Baseline actual counts from Firestore attendance summary or standard defaults
  const actualAttendance = useMemo(() => {
    let present = 0
    let half = 0
    let absent = 0
    let weekOff = 0

    if (attendanceRecord?.summary) {
      present = Number(attendanceRecord.summary.present || 0)
      half = Number(attendanceRecord.summary.halfDay || 0)
      absent = Number(attendanceRecord.summary.absent || 0)
      weekOff = 0
    } else if (attendanceRecord?.dailyStatus && Object.keys(attendanceRecord.dailyStatus).length > 0) {
      for (const rawStatus of Object.values(attendanceRecord.dailyStatus)) {
        const s = String(rawStatus)
        if (s === 'P' || s === 'Permission') present++
        else if (s === 'HalfDay' || s === 'H') half++
        else if (s === 'AB' || s === 'Absent') absent++
      }
      weekOff = 0
    } else {
      // Standard full month: full calendar days as working days (0 week-offs)
      const totalCal = new Date(year, month, 0).getDate()
      present = totalCal
      weekOff = 0
    }

    return { present, half, absent, weekOff }
  }, [attendanceRecord, year, month])

  // Initialize or reset state when modal opens
  useEffect(() => {
    if (!isOpen || !staffMember) return

    if (existingPayslip) {
      setApplyAttendanceDeduction(existingPayslip.attendanceDeduction > 0 || !existingPayslip.isAdjusted)
      setIsCustomAttendance(existingPayslip.isAdjusted)
      setCustomAttendanceAmount(String(existingPayslip.attendanceDeduction ?? ''))
      setPresentDaysInput(String(existingPayslip.presentDays ?? actualAttendance.present))
      setHalfDaysInput(String(existingPayslip.halfDays ?? actualAttendance.half))
      setAbsentDaysInput(String(existingPayslip.absentDays ?? actualAttendance.absent))

      setAdvanceAmount(String(existingPayslip.totalAdvances ?? ''))
      setCustomBonus(existingPayslip.customBonus > 0 ? String(existingPayslip.customBonus) : '')
      setCustomBonusReason(existingPayslip.customBonusReason || '')
      setCustomDeduction(existingPayslip.customDeduction > 0 ? String(existingPayslip.customDeduction) : '')
      setCustomDeductionReason(existingPayslip.customDeductionReason || '')
    } else {
      // Defaults from attendance record
      setPresentDaysInput(String(actualAttendance.present))
      setHalfDaysInput(String(actualAttendance.half))
      setAbsentDaysInput(String(actualAttendance.absent))

      // Defaults from salary record
      const defaultAdvTotal =
        (Number(salaryRecord?.advance1?.amount) || 0) +
        (Number(salaryRecord?.advance2?.amount) || 0) +
        (Number(salaryRecord?.advance3?.amount) || 0)

      setApplyAttendanceDeduction(true)
      setIsCustomAttendance(false)
      setCustomAttendanceAmount('')
      setAdvanceAmount(defaultAdvTotal > 0 ? String(defaultAdvTotal) : '')
      setCustomBonus('')
      setCustomBonusReason('')
      setCustomDeduction('')
      setCustomDeductionReason('')
    }
  }, [isOpen, staffMember, salaryRecord, existingPayslip, actualAttendance])

  // Build adjustments object for calculation
  const currentAdjustments = useMemo<PayrollAdjustmentParams>(() => {
    const adj: PayrollAdjustmentParams = {
      applyAttendanceDeduction,
    }

    // Pass custom attendance days if specified
    const pDays = parseFloat(presentDaysInput)
    if (!isNaN(pDays) && pDays >= 0) adj.customPresentDays = pDays

    const hDays = parseFloat(halfDaysInput)
    if (!isNaN(hDays) && hDays >= 0) adj.customHalfDays = hDays

    const aDays = parseFloat(absentDaysInput)
    if (!isNaN(aDays) && aDays >= 0) adj.customAbsentDays = aDays

    if (applyAttendanceDeduction && isCustomAttendance) {
      const parsed = parseFloat(customAttendanceAmount)
      adj.customAttendanceDeduction = isNaN(parsed) ? 0 : Math.max(0, parsed)
    }

    if (advanceAmount !== '') {
      const parsedAdv = parseFloat(advanceAmount)
      adj.advanceDeduction = isNaN(parsedAdv) ? 0 : Math.max(0, parsedAdv)
    }

    if (customBonus !== '') {
      const parsedBonus = parseFloat(customBonus)
      adj.customBonus = isNaN(parsedBonus) ? 0 : Math.max(0, parsedBonus)
      adj.customBonusReason = customBonusReason.trim()
    }

    if (customDeduction !== '') {
      const parsedDed = parseFloat(customDeduction)
      adj.customDeduction = isNaN(parsedDed) ? 0 : Math.max(0, parsedDed)
      adj.customDeductionReason = customDeductionReason.trim()
    }

    return adj
  }, [
    applyAttendanceDeduction,
    isCustomAttendance,
    customAttendanceAmount,
    presentDaysInput,
    halfDaysInput,
    absentDaysInput,
    advanceAmount,
    customBonus,
    customBonusReason,
    customDeduction,
    customDeductionReason,
  ])

  // Live recalculated preview
  const livePreview = useMemo(() => {
    if (!staffMember) return null

    return calculatePayslip({
      staffUid: staffMember.uid,
      staffName: staffMember.name,
      jobTitle: staffMember.jobTitle,
      year,
      month,
      baseSalary,
      attendanceRecord,
      salaryRecord,
      adjustments: currentAdjustments,
      payslipNumber: existingPayslip?.payslipNumber || 'ZS-PS-PREVIEW',
    })
  }, [staffMember, year, month, baseSalary, attendanceRecord, salaryRecord, currentAdjustments, existingPayslip])

  if (!isOpen || !staffMember) return null

  const monthLabel = MONTH_NAMES[month - 1] || 'Month'

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        backdropFilter: 'blur(3px)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '580px',
          maxHeight: '92vh',
          backgroundColor: 'var(--color-surface)',
          border: '0.5px solid var(--color-border)',
          borderRadius: '16px',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
          overflow: 'hidden',
          fontFamily: 'var(--font-inter)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* MODAL HEADER */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '0.5px solid var(--color-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--color-surface)',
          }}
        >
          <div>
            <div style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--color-foreground)' }}>
              Payroll Review & Deductions
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)', marginTop: '2px' }}>
              {staffMember.name} · {staffMember.jobTitle || 'Staff'} · {monthLabel} {year}
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isGenerating}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--color-foreground-muted)',
              fontSize: '20px',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <i className="ti ti-x" />
          </button>
        </div>

        {/* MODAL BODY (SCROLLABLE) */}
        <div
          style={{
            padding: '20px 24px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '18px',
          }}
        >
          {/* STAFF & ATTENDANCE SUMMARY CARD */}
          <div
            style={{
              padding: '14px 16px',
              borderRadius: '10px',
              backgroundColor: 'var(--color-surface-raised)',
              border: '0.5px solid var(--color-border)',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-foreground-muted)', textTransform: 'uppercase' }}>
                Base Salary
              </span>
              <span style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--color-foreground)' }}>
                {formatIndianCurrency(baseSalary)}
              </span>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(70px, 1fr))',
                gap: '8px',
                paddingTop: '8px',
                borderTop: '0.5px solid var(--color-border)',
                fontSize: 'var(--text-xs)',
              }}
            >
              <div>
                <div style={{ color: 'var(--color-foreground-muted)' }}>Calendar</div>
                <div style={{ fontWeight: 600, color: 'var(--color-foreground)' }}>{livePreview?.totalCalendarDays || 0}d</div>
              </div>
              <div>
                <div style={{ color: 'var(--color-foreground-muted)' }}>Present</div>
                <div style={{ fontWeight: 600, color: 'var(--color-foreground)' }}>{livePreview?.presentDays || 0}d</div>
              </div>
              <div>
                <div style={{ color: 'var(--color-foreground-muted)' }}>Half Days</div>
                <div style={{ fontWeight: 600, color: 'var(--color-foreground)' }}>{livePreview?.halfDays || 0}d</div>
              </div>
              <div>
                <div style={{ color: 'var(--color-foreground-muted)' }}>Absences</div>
                <div style={{ fontWeight: 600, color: livePreview?.absentDays ? 'var(--color-danger)' : 'var(--color-foreground)' }}>
                  {livePreview?.absentDays || 0}d
                </div>
              </div>
              <div>
                <div style={{ color: 'var(--color-foreground-muted)' }}>Payable</div>
                <div style={{ fontWeight: 700, color: 'var(--color-primary)' }}>{livePreview?.payableDays || 0}d</div>
              </div>
            </div>
          </div>

          {/* 1. ACTUAL ATTENDANCE & EDITABLE ATTENDANCE DAYS */}
          <div
            style={{
              padding: '14px 16px',
              borderRadius: '10px',
              backgroundColor: 'var(--color-surface-raised)',
              border: '0.5px solid var(--color-border)',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            {/* Actual attendance status banner */}
            <div>
              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-foreground-muted)', textTransform: 'uppercase' }}>
                Actual System Attendance Logged
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px', fontSize: 'var(--text-xs)' }}>
                <span style={{ padding: '3px 8px', borderRadius: '4px', backgroundColor: 'var(--color-success-muted)', color: 'var(--color-success)', fontWeight: 600 }}>
                  Present: {actualAttendance.present}d
                </span>
                <span style={{ padding: '3px 8px', borderRadius: '4px', backgroundColor: 'var(--color-accent-muted)', color: 'var(--color-accent)', fontWeight: 600 }}>
                  Half-Day: {actualAttendance.half}d
                </span>
                <span style={{ padding: '3px 8px', borderRadius: '4px', backgroundColor: 'var(--color-danger-muted)', color: 'var(--color-danger)', fontWeight: 600 }}>
                  Absent: {actualAttendance.absent}d
                </span>
              </div>
            </div>

            {/* Editable Days Inputs */}
            <div style={{ borderTop: '0.5px solid var(--color-border)', paddingTop: '10px' }}>
              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-foreground)', marginBottom: '8px' }}>
                Edit Attendance Days for this Payroll
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
                  gap: '12px',
                }}
              >
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: 'var(--color-foreground-muted)', marginBottom: '3px' }}>
                    Present (d)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={presentDaysInput}
                    onChange={(e) => setPresentDaysInput(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '6px 8px',
                      borderRadius: '6px',
                      border: '0.5px solid var(--color-border)',
                      backgroundColor: 'var(--color-surface)',
                      color: 'var(--color-foreground)',
                      fontSize: 'var(--text-sm)',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: 'var(--color-foreground-muted)', marginBottom: '3px' }}>
                    Half-Day (d)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={halfDaysInput}
                    onChange={(e) => setHalfDaysInput(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '6px 8px',
                      borderRadius: '6px',
                      border: '0.5px solid var(--color-border)',
                      backgroundColor: 'var(--color-surface)',
                      color: 'var(--color-foreground)',
                      fontSize: 'var(--text-sm)',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: 'var(--color-foreground-muted)', marginBottom: '3px' }}>
                    Absent (d)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={absentDaysInput}
                    onChange={(e) => setAbsentDaysInput(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '6px 8px',
                      borderRadius: '6px',
                      border: '0.5px solid var(--color-border)',
                      backgroundColor: 'var(--color-surface)',
                      color: 'var(--color-foreground)',
                      fontSize: 'var(--text-sm)',
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Attendance Deduction Toggle & Custom Amount Override */}
            <div style={{ borderTop: '0.5px solid var(--color-border)', paddingTop: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-foreground)' }}>
                    Attendance Deduction
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>
                    Auto: {formatIndianCurrency(Math.round(((parseFloat(absentDaysInput) || 0) + (parseFloat(halfDaysInput) || 0) * 0.5) * (livePreview?.dailyRate || 0)))}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: 'var(--text-xs)', color: applyAttendanceDeduction ? 'var(--color-foreground)' : 'var(--color-foreground-muted)' }}>
                    {applyAttendanceDeduction ? 'Apply' : 'Waived'}
                  </span>
                  <Switch
                    checked={applyAttendanceDeduction}
                    onCheckedChange={setApplyAttendanceDeduction}
                  />
                </div>
              </div>

              {applyAttendanceDeduction && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '8px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--text-xs)', cursor: 'pointer', color: 'var(--color-foreground)' }}>
                    <input
                      type="checkbox"
                      checked={isCustomAttendance}
                      onChange={(e) => {
                        setIsCustomAttendance(e.target.checked)
                        if (!e.target.checked) setCustomAttendanceAmount('')
                      }}
                      style={{ accentColor: 'var(--color-primary)' }}
                    />
                    <span>Enter custom attendance deduction amount (override)</span>
                  </label>

                  {isCustomAttendance && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-foreground-muted)' }}>₹</span>
                      <input
                        type="number"
                        min="0"
                        value={customAttendanceAmount}
                        onChange={(e) => setCustomAttendanceAmount(e.target.value)}
                        placeholder="e.g. 500"
                        style={{
                          flex: 1,
                          padding: '8px 12px',
                          borderRadius: '6px',
                          border: '0.5px solid var(--color-border)',
                          backgroundColor: 'var(--color-surface)',
                          color: 'var(--color-foreground)',
                          fontSize: 'var(--text-sm)',
                          fontFamily: 'var(--font-inter)',
                        }}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 2. ADVANCE DEDUCTION ADJUSTMENT */}
          <div
            style={{
              padding: '14px 16px',
              borderRadius: '10px',
              backgroundColor: 'var(--color-surface-raised)',
              border: '0.5px solid var(--color-border)',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-foreground)' }}>
                  Salary Advance Recovery
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>
                  Scheduled advances to recover in this payroll
                </div>
              </div>
            </div>

            {/* Advance Breakdown Pills if available */}
            {salaryRecord && ((salaryRecord.advance1?.amount || 0) > 0 || (salaryRecord.advance2?.amount || 0) > 0 || (salaryRecord.advance3?.amount || 0) > 0) ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', fontSize: '11px' }}>
                {(salaryRecord.advance1?.amount || 0) > 0 && (
                  <span style={{ padding: '3px 8px', borderRadius: '4px', backgroundColor: 'var(--color-surface)', border: '0.5px solid var(--color-border)', color: 'var(--color-foreground)' }}>
                    Advance 1: <strong>{formatIndianCurrency(salaryRecord.advance1?.amount)}</strong> {salaryRecord.advance1?.date ? `(${salaryRecord.advance1.date})` : ''}
                  </span>
                )}
                {(salaryRecord.advance2?.amount || 0) > 0 && (
                  <span style={{ padding: '3px 8px', borderRadius: '4px', backgroundColor: 'var(--color-surface)', border: '0.5px solid var(--color-border)', color: 'var(--color-foreground)' }}>
                    Advance 2: <strong>{formatIndianCurrency(salaryRecord.advance2?.amount)}</strong> {salaryRecord.advance2?.date ? `(${salaryRecord.advance2.date})` : ''}
                  </span>
                )}
                {(salaryRecord.advance3?.amount || 0) > 0 && (
                  <span style={{ padding: '3px 8px', borderRadius: '4px', backgroundColor: 'var(--color-surface)', border: '0.5px solid var(--color-border)', color: 'var(--color-foreground)' }}>
                    Advance 3: <strong>{formatIndianCurrency(salaryRecord.advance3?.amount)}</strong> {salaryRecord.advance3?.date ? `(${salaryRecord.advance3.date})` : ''}
                  </span>
                )}
              </div>
            ) : (
              <div style={{ fontSize: '11px', color: 'var(--color-foreground-muted)', fontStyle: 'italic' }}>
                No scheduled salary advances logged for this month.
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-foreground-muted)' }}>₹</span>
              <input
                type="number"
                min="0"
                value={advanceAmount}
                onChange={(e) => setAdvanceAmount(e.target.value)}
                placeholder="0"
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '0.5px solid var(--color-border)',
                  backgroundColor: 'var(--color-surface)',
                  color: 'var(--color-foreground)',
                  fontSize: 'var(--text-sm)',
                  fontFamily: 'var(--font-inter)',
                }}
              />
            </div>
          </div>

          {/* 3. OPTIONAL BONUS OR OTHER DEDUCTION */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '12px',
            }}
          >
            {/* Custom Bonus */}
            <div
              style={{
                padding: '12px 14px',
                borderRadius: '10px',
                backgroundColor: 'var(--color-surface-raised)',
                border: '0.5px solid var(--color-border)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-success)' }}>
                + Add Bonus / Incentive
              </div>
              <input
                type="number"
                min="0"
                value={customBonus}
                onChange={(e) => setCustomBonus(e.target.value)}
                placeholder="₹ Amount"
                style={{
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: '0.5px solid var(--color-border)',
                  backgroundColor: 'var(--color-surface)',
                  color: 'var(--color-foreground)',
                  fontSize: 'var(--text-sm)',
                }}
              />
              <input
                type="text"
                value={customBonusReason}
                onChange={(e) => setCustomBonusReason(e.target.value)}
                placeholder="Note (e.g. Festival)"
                style={{
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: '0.5px solid var(--color-border)',
                  backgroundColor: 'var(--color-surface)',
                  color: 'var(--color-foreground)',
                  fontSize: 'var(--text-xs)',
                }}
              />
            </div>

            {/* Custom Deduction */}
            <div
              style={{
                padding: '12px 14px',
                borderRadius: '10px',
                backgroundColor: 'var(--color-surface-raised)',
                border: '0.5px solid var(--color-border)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-danger)' }}>
                − Add Custom Deduction
              </div>
              <input
                type="number"
                min="0"
                value={customDeduction}
                onChange={(e) => setCustomDeduction(e.target.value)}
                placeholder="₹ Amount"
                style={{
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: '0.5px solid var(--color-border)',
                  backgroundColor: 'var(--color-surface)',
                  color: 'var(--color-foreground)',
                  fontSize: 'var(--text-sm)',
                }}
              />
              <input
                type="text"
                value={customDeductionReason}
                onChange={(e) => setCustomDeductionReason(e.target.value)}
                placeholder="Reason note"
                style={{
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: '0.5px solid var(--color-border)',
                  backgroundColor: 'var(--color-surface)',
                  color: 'var(--color-foreground)',
                  fontSize: 'var(--text-xs)',
                }}
              />
            </div>
          </div>

          {/* NET PAY RECALCULATED BANNER */}
          <div
            style={{
              padding: '16px 20px',
              borderRadius: '12px',
              backgroundColor: 'var(--color-primary-muted)',
              border: '0.5px solid var(--color-primary)',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
            }}
          >
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-primary)', textTransform: 'uppercase' }}>
              Calculated Net Salary Payable
            </div>
            <div style={{ fontSize: 'var(--text-3xl)', fontWeight: 700, color: 'var(--color-foreground)' }}>
              {formatIndianCurrency(livePreview?.netPay)}
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)', fontStyle: 'italic' }}>
              {numberToWordsINR(livePreview?.netPay || 0)}
            </div>
          </div>
        </div>

        {/* MODAL FOOTER ACTIONS */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '0.5px solid var(--color-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '12px',
            backgroundColor: 'var(--color-surface)',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={isGenerating}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: '0.5px solid var(--color-border)',
              backgroundColor: 'transparent',
              color: 'var(--color-foreground)',
              fontSize: 'var(--text-sm)',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={() => onConfirmGenerate({ adjustments: currentAdjustments, action: 'preview' })}
            disabled={isGenerating}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: '0.5px solid var(--color-border)',
              backgroundColor: 'var(--color-surface-raised)',
              color: 'var(--color-foreground)',
              fontSize: 'var(--text-sm)',
              cursor: isGenerating ? 'not-allowed' : 'pointer',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <i className="ti ti-eye" />
            <span>Preview PDF</span>
          </button>

          <Button
            type="button"
            onClick={() => onConfirmGenerate({ adjustments: currentAdjustments, action: 'download' })}
            disabled={isGenerating}
            style={{
              backgroundColor: 'var(--color-primary)',
              color: '#ffffff',
              fontSize: 'var(--text-sm)',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            {isGenerating ? (
              <>
                <i className="ti ti-loader ti-spin" />
                <span>Generating...</span>
              </>
            ) : (
              <>
                <i className="ti ti-download" />
                <span>Confirm & Download</span>
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

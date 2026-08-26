'use client'

import React, { useState, useRef, useEffect } from 'react'
import {
  format,
  parse,
  isValid,
  parseISO,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  addMonths,
  subMonths,
  isSameDay,
  isToday as checkIsToday,
} from 'date-fns'

export interface DateFieldProps {
  value: string // ISO string "YYYY-MM-DD"
  onChange: (isoDate: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  style?: React.CSSProperties
}

export function DateField({
  value,
  onChange,
  placeholder = 'DD/MM/YYYY',
  disabled = false,
  className = '',
  style,
}: DateFieldProps) {
  // Compute initial today date if value is empty
  const getTodayISO = () => format(new Date(), 'yyyy-MM-dd')
  const effectiveISO = value || getTodayISO()

  // Make sure parent is notified of initial today date if empty
  useEffect(() => {
    if (!value) {
      onChange(getTodayISO())
    }
  }, [value, onChange])

  const parseCurrentDate = (isoStr: string): Date => {
    if (!isoStr) return new Date()
    const parsed = parseISO(isoStr)
    return isValid(parsed) ? parsed : new Date()
  }

  const formatDisplay = (d: Date): string => (isValid(d) ? format(d, 'dd/MM/yyyy') : '')

  // Track prop changes for render-time sync
  const [prevISO, setPrevISO] = useState(effectiveISO)
  const [viewDate, setViewDate] = useState<Date>(() => parseCurrentDate(effectiveISO))
  const [inputText, setInputText] = useState<string>(() => formatDisplay(parseCurrentDate(effectiveISO)))
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Sync state during render when prop changes
  if (effectiveISO !== prevISO) {
    setPrevISO(effectiveISO)
    const d = parseCurrentDate(effectiveISO)
    setInputText(formatDisplay(d))
    setViewDate(d)
  }

  const selectedDate = parseCurrentDate(effectiveISO)

  // Close calendar popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelectDay = (day: Date) => {
    if (disabled) return
    const iso = format(day, 'yyyy-MM-dd')
    setInputText(format(day, 'dd/MM/yyyy'))
    onChange(iso)
    setIsOpen(false)
  }

  // Handle manual typing in input field
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return
    const rawVal = e.target.value
    setInputText(rawVal)

    // Try parsing DD/MM/YYYY
    if (rawVal.length === 10) {
      const parsed = parse(rawVal, 'dd/MM/yyyy', new Date())
      if (isValid(parsed)) {
        const iso = format(parsed, 'yyyy-MM-dd')
        onChange(iso)
        setViewDate(parsed)
      }
    }
  }

  // Calendar grid calculations
  const monthStart = startOfMonth(viewDate)
  const monthEnd = endOfMonth(viewDate)
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd })
  const startDayOfWeek = getDay(monthStart)

  const emptyPrefixSlots = Array.from({ length: startDayOfWeek })

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', ...style }}>
      {/* Date input control */}
      <div
        onClick={() => {
          if (!disabled) setIsOpen(!isOpen)
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          background: 'var(--color-surface-raised)',
          border: `0.5px solid ${isOpen ? 'var(--color-primary)' : 'var(--color-border)'}`,
          borderRadius: '8px',
          padding: '0 10px',
          height: '36px',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
          transition: 'all 0.15s ease',
        }}
        className={className}
      >
        <input
          type="text"
          value={inputText}
          onChange={handleInputChange}
          placeholder={placeholder}
          disabled={disabled}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--color-foreground)',
            fontSize: 'var(--text-sm)',
            fontFamily: 'var(--font-inter)',
            width: '100%',
          }}
        />
        <i
          className="ti ti-calendar"
          style={{
            fontSize: '16px',
            color: isOpen ? 'var(--color-primary)' : 'var(--color-foreground-muted)',
            marginLeft: '8px',
            flexShrink: 0,
          }}
        />
      </div>

      {/* Calendar popover modal */}
      {isOpen && !disabled && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            zIndex: 100,
            width: '280px',
            background: 'var(--color-surface-overlay)',
            border: '0.5px solid var(--color-border)',
            borderRadius: '12px',
            padding: '16px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.4)',
            fontFamily: 'var(--font-inter)',
          }}
        >
          {/* Calendar Header: Month/Year navigation */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '12px',
            }}
          >
            <button
              type="button"
              onClick={() => setViewDate(subMonths(viewDate, 1))}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--color-foreground-muted)',
                cursor: 'pointer',
                padding: '4px',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <i className="ti ti-chevron-left" style={{ fontSize: '16px' }} />
            </button>

            <span
              style={{
                fontSize: 'var(--text-sm)',
                fontWeight: 600,
                color: 'var(--color-foreground)',
              }}
            >
              {format(viewDate, 'MMMM yyyy')}
            </span>

            <button
              type="button"
              onClick={() => setViewDate(addMonths(viewDate, 1))}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--color-foreground-muted)',
                cursor: 'pointer',
                padding: '4px',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <i className="ti ti-chevron-right" style={{ fontSize: '16px' }} />
            </button>
          </div>

          {/* Weekday labels */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, 1fr)',
              gap: '2px',
              textAlign: 'center',
              marginBottom: '6px',
            }}
          >
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(dayName => (
              <span
                key={dayName}
                style={{
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  color: 'var(--color-foreground-subtle)',
                }}
              >
                {dayName}
              </span>
            ))}
          </div>

          {/* Days Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, 1fr)',
              gap: '2px',
            }}
          >
            {/* Empty slots for month start offset */}
            {emptyPrefixSlots.map((_, idx) => (
              <div key={`empty-${idx}`} />
            ))}

            {/* Month days */}
            {daysInMonth.map(day => {
              const isSelected = isSameDay(day, selectedDate)
              const isToday = checkIsToday(day)

              let bg = 'transparent'
              let fg = 'var(--color-foreground)'

              if (isSelected) {
                bg = 'var(--color-primary)'
                fg = '#ffffff'
              } else if (isToday) {
                bg = 'var(--color-primary-muted)'
                fg = 'var(--color-primary)'
              }

              return (
                <button
                  type="button"
                  key={day.toISOString()}
                  onClick={() => handleSelectDay(day)}
                  style={{
                    height: '32px',
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: bg,
                    color: fg,
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: 'var(--text-xs)',
                    fontWeight: isSelected || isToday ? 600 : 400,
                    cursor: 'pointer',
                    transition: 'all 0.1s ease',
                  }}
                >
                  {format(day, 'd')}
                </button>
              )
            })}
          </div>

          {/* Footer: Select Today */}
          <div
            style={{
              marginTop: '12px',
              paddingTop: '8px',
              borderTop: '0.5px solid var(--color-border)',
              display: 'flex',
              justifyContent: 'flex-end',
            }}
          >
            <button
              type="button"
              onClick={() => handleSelectDay(new Date())}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--color-primary)',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

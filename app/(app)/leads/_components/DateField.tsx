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
}

export function DateField({ value, onChange, placeholder = 'DD/MM/YYYY' }: DateFieldProps) {
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
    const iso = format(day, 'yyyy-MM-dd')
    setInputText(format(day, 'dd/MM/yyyy'))
    onChange(iso)
    setIsOpen(false)
  }

  // Handle manual typing in input field
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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

  const dayNames = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      {/* ── Input Box with Static Tabler Calendar Icon ── */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '100%' }}>
        <input
          type="text"
          value={inputText}
          onChange={handleInputChange}
          onClick={() => setIsOpen(prev => !prev)}
          placeholder={placeholder}
          readOnly // Prevent native OS soft keyboard interference while preserving click-to-pick
          style={{
            fontFamily:   'var(--font-inter)',
            height:       '36px',
            width:        '100%',
            boxSizing:    'border-box',
            background:   'var(--color-surface-raised)',
            border:       '0.5px solid var(--color-border)',
            borderRadius: '8px',
            padding:      '0 36px 0 12px',
            fontSize:     'var(--text-sm)',
            color:        'var(--color-foreground)',
            outline:      'none',
            cursor:       'pointer',
            userSelect:   'none',
          }}
        />
        <i
          className="ti ti-calendar"
          onClick={() => setIsOpen(prev => !prev)}
          style={{
            position:      'absolute',
            right:         '12px',
            top:           '50%',
            transform:     'translateY(-50%)',
            fontSize:      '16px',
            color:         'var(--color-foreground-muted)',
            cursor:        'pointer',
          }}
        />
      </div>

      {/* ── Custom Calendar Popover ── */}
      {isOpen && (
        <div
          style={{
            position:     'absolute',
            top:          'calc(100% + 6px)',
            left:         0,
            zIndex:       100,
            width:        '260px',
            background:   'var(--color-surface-overlay)',
            border:       '0.5px solid var(--color-border-strong)',
            borderRadius: '12px',
            padding:      '12px',
            boxShadow:    '0 10px 30px rgba(0, 0, 0, 0.45)',
            fontFamily:   'var(--font-inter)',
          }}
        >
          {/* Calendar Header: Month + Year Navigation */}
          <div
            style={{
              display:        'flex',
              justifyContent: 'space-between',
              alignItems:     'center',
              marginBottom:   '10px',
            }}
          >
            <button
              type="button"
              onClick={() => setViewDate(prev => subMonths(prev, 1))}
              style={{
                background:  'transparent',
                border:      'none',
                color:       'var(--color-foreground-muted)',
                cursor:      'pointer',
                padding:     '4px 8px',
                fontSize:    '14px',
                borderRadius:'4px',
              }}
            >
              ◀
            </button>
            <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-foreground)' }}>
              {format(viewDate, 'MMMM yyyy')}
            </span>
            <button
              type="button"
              onClick={() => setViewDate(prev => addMonths(prev, 1))}
              style={{
                background:  'transparent',
                border:      'none',
                color:       'var(--color-foreground-muted)',
                cursor:      'pointer',
                padding:     '4px 8px',
                fontSize:    '14px',
                borderRadius:'4px',
              }}
            >
              ▶
            </button>
          </div>

          {/* Days of Week Header */}
          <div
            style={{
              display:               'grid',
              gridTemplateColumns:   'repeat(7, 1fr)',
              gap:                   '2px',
              textAlign:             'center',
              marginBottom:          '6px',
            }}
          >
            {dayNames.map(day => (
              <span
                key={day}
                style={{
                  fontSize:   'var(--text-xs)',
                  fontWeight: 600,
                  color:      'var(--color-foreground-subtle)',
                }}
              >
                {day}
              </span>
            ))}
          </div>

          {/* Calendar Days Grid */}
          <div
            style={{
              display:             'grid',
              gridTemplateColumns: 'repeat(7, 1fr)',
              gap:                 '2px',
            }}
          >
            {/* Empty offset cells for starting day */}
            {Array.from({ length: startDayOfWeek }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}

            {/* Month Day Cells */}
            {daysInMonth.map(day => {
              const isSelected = isSameDay(day, selectedDate)
              const isToday = checkIsToday(day)

              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => handleSelectDay(day)}
                  style={{
                    height:       '30px',
                    width:        '100%',
                    display:      'flex',
                    alignItems:   'center',
                    justifyContent:'center',
                    background:   isSelected
                      ? 'var(--color-primary)'
                      : 'transparent',
                    color: isSelected
                      ? '#ffffff'
                      : isToday
                      ? 'var(--color-primary)'
                      : 'var(--color-foreground)',
                    border: isToday && !isSelected
                      ? '0.5px solid var(--color-primary)'
                      : 'none',
                    borderRadius: '6px',
                    fontSize:     'var(--text-xs)',
                    fontWeight:   isSelected || isToday ? 600 : 400,
                    cursor:       'pointer',
                  }}
                >
                  {format(day, 'd')}
                </button>
              )
            })}
          </div>

          {/* Quick Select "Today" Button */}
          <div
            style={{
              marginTop: '10px',
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
                color: 'var(--color-accent)',
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

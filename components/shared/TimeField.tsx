'use client'

import React, { useState, useRef, useEffect } from 'react'

export interface TimeFieldProps {
  value: string // "HH:mm" in 24-hour format, e.g. "09:00", "18:30"
  onChange: (timeStr: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  style?: React.CSSProperties
  align?: 'left' | 'right' | 'auto'
  allowEmpty?: boolean
}

/**
 * Parses "HH:mm" (24h) or "hh:mm AM/PM" into { hours: 1..12, minutes: 0..59, period: 'AM' | 'PM' }
 */
function parseTime(timeStr: string): { hour12: number; minute: number; period: 'AM' | 'PM' } {
  if (!timeStr) {
    const now = new Date()
    const h = now.getHours()
    const m = Math.floor(now.getMinutes() / 5) * 5
    return {
      hour12: h % 12 === 0 ? 12 : h % 12,
      minute: m,
      period: h >= 12 ? 'PM' : 'AM',
    }
  }

  // Check 12h format "09:00 AM"
  const match12 = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i)
  if (match12) {
    let h = parseInt(match12[1], 10)
    const m = parseInt(match12[2], 10)
    const p = (match12[3] || (h >= 12 ? 'PM' : 'AM')).toUpperCase() as 'AM' | 'PM'
    if (h > 12) {
      h = h % 12
    } else if (h === 0) {
      h = 12
    }
    return { hour12: h, minute: Math.min(59, Math.max(0, m)), period: p }
  }

  // Fallback 24h format "HH:mm"
  const parts = timeStr.split(':')
  const h = parseInt(parts[0], 10) || 0
  const m = parseInt(parts[1], 10) || 0
  const period: 'AM' | 'PM' = h >= 12 ? 'PM' : 'AM'
  const hour12 = h % 12 === 0 ? 12 : h % 12
  return { hour12, minute: Math.min(59, Math.max(0, m)), period }
}

function to24hString(hour12: number, minute: number, period: 'AM' | 'PM'): string {
  let h = hour12 % 12
  if (period === 'PM') h += 12
  const hh = String(h).padStart(2, '0')
  const mm = String(minute).padStart(2, '0')
  return `${hh}:${mm}`
}

function to12hDisplay(hour12: number, minute: number, period: 'AM' | 'PM'): string {
  const hh = String(hour12).padStart(2, '0')
  const mm = String(minute).padStart(2, '0')
  return `${hh}:${mm} ${period}`
}

export function TimeField({
  value,
  onChange,
  placeholder = 'HH:MM AM/PM',
  disabled = false,
  className = '',
  style,
  align = 'auto',
  allowEmpty = false,
}: TimeFieldProps) {
  const initialParsed = parseTime(value)
  const [hour12, setHour12] = useState<number>(initialParsed.hour12)
  const [minute, setMinute] = useState<number>(initialParsed.minute)
  const [period, setPeriod] = useState<'AM' | 'PM'>(initialParsed.period)
  const [inputText, setInputText] = useState<string>(() => {
    if (!value && allowEmpty) return ''
    return to12hDisplay(initialParsed.hour12, initialParsed.minute, initialParsed.period)
  })

  // Sync state if value prop changes (during render)
  const [prevVal, setPrevVal] = useState(value)
  if (value !== prevVal) {
    setPrevVal(value)
    if (!value && allowEmpty) {
      setInputText('')
    } else {
      const p = parseTime(value)
      setHour12(p.hour12)
      setMinute(p.minute)
      setPeriod(p.period)
      setInputText(to12hDisplay(p.hour12, p.minute, p.period))
    }
  }

  const [isOpen, setIsOpen] = useState<boolean>(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const [autoAlign, setAutoAlign] = useState<'left' | 'right'>('left')
  const effectiveAlign: 'left' | 'right' = align === 'right' || align === 'left' ? align : autoAlign

  useEffect(() => {
    if (align !== 'auto') return
    if (isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      const viewportOverflow = rect.left + 290 > window.innerWidth - 16
      const inRightHalf = rect.left > window.innerWidth * 0.52

      let parentOverflow = false
      let el: HTMLElement | null = containerRef.current.parentElement
      while (el && el !== document.body) {
        const cs = window.getComputedStyle(el)
        if (cs.maxWidth || cs.overflow === 'hidden' || cs.overflowX === 'hidden') {
          const pRect = el.getBoundingClientRect()
          if (rect.left + 280 > pRect.right - 8) {
            parentOverflow = true
            break
          }
        }
        el = el.parentElement
      }

      if (viewportOverflow || parentOverflow || inRightHalf) {
        setAutoAlign('right')
      } else {
        setAutoAlign('left')
      }
    }
  }, [isOpen, align])

  // Close popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const emitChange = (h: number, m: number, p: 'AM' | 'PM') => {
    const val24 = to24hString(h, m, p)
    const val12 = to12hDisplay(h, m, p)
    setInputText(val12)
    onChange(val24)
  }

  const handleSelectHour = (h: number) => {
    setHour12(h)
    emitChange(h, minute, period)
  }

  const handleSelectMinute = (m: number) => {
    setMinute(m)
    emitChange(hour12, m, period)
  }

  const handleSelectPeriod = (p: 'AM' | 'PM') => {
    setPeriod(p)
    emitChange(hour12, minute, p)
  }

  // Handle manual typing
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return
    const rawVal = e.target.value
    setInputText(rawVal)

    if (!rawVal.trim()) {
      if (allowEmpty) onChange('')
      return
    }

    // Try parsing typing
    const match = rawVal.match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i)
    if (match) {
      let h = parseInt(match[1], 10)
      const m = parseInt(match[2], 10)
      let p: 'AM' | 'PM' = period
      if (match[3]) {
        p = match[3].toUpperCase() as 'AM' | 'PM'
      } else if (h >= 12) {
        p = 'PM'
        h = h > 12 ? h - 12 : h
      }
      if (h > 0 && h <= 12 && m >= 0 && m < 60) {
        setHour12(h)
        setMinute(m)
        setPeriod(p)
        onChange(to24hString(h, m, p))
      }
    }
  }

  const handleNow = () => {
    const now = new Date()
    const rawH = now.getHours()
    const p: 'AM' | 'PM' = rawH >= 12 ? 'PM' : 'AM'
    const h = rawH % 12 === 0 ? 12 : rawH % 12
    const m = Math.floor(now.getMinutes() / 5) * 5
    setHour12(h)
    setMinute(m)
    setPeriod(p)
    emitChange(h, m, p)
    setIsOpen(false)
  }

  const PRESET_TIMES = [
    { label: '09:00 AM', h: 9, m: 0, p: 'AM' as const },
    { label: '02:00 PM', h: 2, m: 0, p: 'PM' as const },
    { label: '06:00 PM', h: 6, m: 0, p: 'PM' as const },
    { label: '08:00 PM', h: 8, m: 0, p: 'PM' as const },
  ]

  const MINUTES_OPTIONS = [0, 15, 30, 45]

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', ...style }}>
      {/* Time input control */}
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
          className="ti ti-clock"
          style={{
            fontSize: '16px',
            color: isOpen ? 'var(--color-primary)' : 'var(--color-foreground-muted)',
            marginLeft: '8px',
            flexShrink: 0,
          }}
        />
      </div>

      {/* Time Popover Modal */}
      {isOpen && !disabled && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            ...(effectiveAlign === 'right' ? { right: 0 } : { left: 0 }),
            zIndex: 9999,
            width: '280px',
            maxWidth: 'calc(100vw - 32px)',
            background: 'var(--color-surface-overlay)',
            border: '0.5px solid var(--color-border)',
            borderRadius: '12px',
            padding: '16px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.4)',
            fontFamily: 'var(--font-inter)',
          }}
        >
          {/* Header Display */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <i className="ti ti-clock" style={{ fontSize: '15px', color: 'var(--color-primary)' }} />
              <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--color-foreground)' }}>
                {to12hDisplay(hour12, minute, period)}
              </span>
            </div>

            {/* Segmented AM / PM Switch */}
            <div
              style={{
                display: 'inline-flex',
                background: 'var(--color-surface-raised)',
                borderRadius: '6px',
                padding: '2px',
                border: '0.5px solid var(--color-border)',
              }}
            >
              {(['AM', 'PM'] as const).map(p => {
                const isActive = period === p
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => handleSelectPeriod(p)}
                    style={{
                      border: 'none',
                      background: isActive ? 'var(--color-primary)' : 'transparent',
                      color: isActive ? '#ffffff' : 'var(--color-foreground-muted)',
                      padding: '3px 10px',
                      borderRadius: '4px',
                      fontSize: 'var(--text-xs)',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.1s ease',
                    }}
                  >
                    {p}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Quick Presets */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '4px',
              marginBottom: '12px',
            }}
          >
            {PRESET_TIMES.map(preset => {
              const isMatch = hour12 === preset.h && minute === preset.m && period === preset.p
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    setHour12(preset.h)
                    setMinute(preset.m)
                    setPeriod(preset.p)
                    emitChange(preset.h, preset.m, preset.p)
                  }}
                  style={{
                    background: isMatch ? 'var(--color-primary-muted)' : 'var(--color-surface-raised)',
                    border: `0.5px solid ${isMatch ? 'var(--color-primary)' : 'var(--color-border)'}`,
                    color: isMatch ? 'var(--color-primary)' : 'var(--color-foreground-muted)',
                    borderRadius: '6px',
                    padding: '4px 2px',
                    fontSize: '10px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {preset.label}
                </button>
              )
            })}
          </div>

          {/* Hours Section Header */}
          <div
            style={{
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              color: 'var(--color-foreground-subtle)',
              marginBottom: '6px',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            Hour
          </div>

          {/* Hours Grid (1 to 12) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(6, 1fr)',
              gap: '4px',
              marginBottom: '12px',
            }}
          >
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(h => {
              const isSelected = hour12 === h
              return (
                <button
                  key={h}
                  type="button"
                  onClick={() => handleSelectHour(h)}
                  style={{
                    height: '28px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: isSelected ? 'var(--color-primary)' : 'transparent',
                    color: isSelected ? '#ffffff' : 'var(--color-foreground)',
                    border: isSelected ? 'none' : '0.5px solid var(--color-border)',
                    borderRadius: '6px',
                    fontSize: 'var(--text-xs)',
                    fontWeight: isSelected ? 600 : 400,
                    cursor: 'pointer',
                    transition: 'all 0.1s ease',
                  }}
                >
                  {h}
                </button>
              )
            })}
          </div>

          {/* Minutes Section Header */}
          <div
            style={{
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              color: 'var(--color-foreground-subtle)',
              marginBottom: '6px',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            Minute
          </div>

          {/* Minutes Chips */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '4px',
            }}
          >
            {MINUTES_OPTIONS.map(m => {
              const isSelected = minute === m
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => handleSelectMinute(m)}
                  style={{
                    height: '28px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: isSelected ? 'var(--color-primary)' : 'transparent',
                    color: isSelected ? '#ffffff' : 'var(--color-foreground)',
                    border: isSelected ? 'none' : '0.5px solid var(--color-border)',
                    borderRadius: '6px',
                    fontSize: 'var(--text-xs)',
                    fontWeight: isSelected ? 600 : 400,
                    cursor: 'pointer',
                    transition: 'all 0.1s ease',
                  }}
                >
                  :{String(m).padStart(2, '0')}
                </button>
              )
            })}
          </div>

          {/* Footer with Now & Done */}
          <div
            style={{
              marginTop: '14px',
              paddingTop: '10px',
              borderTop: '0.5px solid var(--color-border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <button
              type="button"
              onClick={handleNow}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--color-foreground-muted)',
                fontSize: 'var(--text-xs)',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Current time
            </button>

            <button
              type="button"
              onClick={() => setIsOpen(false)}
              style={{
                background: 'var(--color-primary)',
                border: 'none',
                color: '#ffffff',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                borderRadius: '6px',
                padding: '4px 14px',
                cursor: 'pointer',
              }}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

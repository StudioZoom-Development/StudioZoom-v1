'use client'

import React, { useState } from 'react'

export interface PhoneNumberInputProps {
  value: string // Combined value e.g. "+91 98400 11223" or "+919840011223" or "9840011223"
  onChange: (fullContact: string) => void
  error?: string
  setError?: (err?: string) => void
  disabled?: boolean
  className?: string
  style?: React.CSSProperties
}

export const COUNTRY_CODES = [
  { code: '+91', label: '+91 (IN)' },
  { code: '+1',  label: '+1 (US)' },
  { code: '+44', label: '+44 (UK)' },
  { code: '+971', label: '+971 (UAE)' },
  { code: '+65', label: '+65 (SG)' },
  { code: '+61', label: '+61 (AU)' },
  { code: '+60', label: '+60 (MY)' },
  { code: '+49', label: '+49 (DE)' },
  { code: '+33', label: '+33 (FR)' },
  { code: '+81', label: '+81 (JP)' },
]

export function parsePhoneNumber(raw: string): { countryCode: string; number: string } {
  if (!raw) return { countryCode: '+91', number: '' }
  const clean = raw.trim()
  const matchedCC = COUNTRY_CODES.find(c => clean.startsWith(c.code))
  if (matchedCC) {
    const numPart = clean.slice(matchedCC.code.length).replace(/[^0-9]/g, '').slice(0, 10)
    return { countryCode: matchedCC.code, number: numPart }
  }
  if (clean.startsWith('+')) {
    const parts = clean.split(/\s+/)
    if (parts.length > 1) {
      return { countryCode: parts[0], number: parts.slice(1).join('').replace(/[^0-9]/g, '').slice(0, 10) }
    }
  }
  return { countryCode: '+91', number: clean.replace(/[^0-9]/g, '').slice(0, 10) }
}

export function PhoneNumberInput({
  value,
  onChange,
  error: externalError,
  disabled = false,
  className = '',
  style,
}: PhoneNumberInputProps) {
  const [prevValue, setPrevValue] = useState(value)
  const [countryCode, setCountryCode] = useState(() => parsePhoneNumber(value).countryCode)
  const [number, setNumber] = useState(() => parsePhoneNumber(value).number)

  // Sync state during render when prop changes
  if (value !== prevValue) {
    setPrevValue(value)
    const parsed = parsePhoneNumber(value)
    setCountryCode(parsed.countryCode)
    setNumber(parsed.number)
  }

  const updateContact = (newCode: string, newNum: string) => {
    setCountryCode(newCode)
    setNumber(newNum)
    onChange(newNum ? `${newCode} ${newNum}` : '')
  }

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const sanitized = e.target.value.replace(/[^0-9]/g, '').slice(0, 10)
    updateContact(countryCode, sanitized)
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    const pastedText = e.clipboardData.getData('text') || ''
    const sanitized = pastedText.replace(/[^0-9]/g, '').slice(0, 10)
    updateContact(countryCode, sanitized)
  }

  return (
    <div style={{ display: 'flex', gap: '8px', width: '100%', alignItems: 'center', ...style }} className={className}>
      <select
        value={countryCode}
        onChange={e => updateContact(e.target.value, number)}
        disabled={disabled}
        style={{
          fontFamily: 'var(--font-inter)',
          height: '36px',
          width: '100px',
          minWidth: '96px',
          background: 'var(--color-surface-raised)',
          border: `0.5px solid ${externalError ? 'var(--color-danger)' : 'var(--color-border)'}`,
          borderRadius: '8px',
          padding: '0 8px',
          fontSize: 'var(--text-sm)',
          color: 'var(--color-foreground)',
          outline: 'none',
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        {COUNTRY_CODES.map(c => (
          <option key={c.code} value={c.code}>{c.label}</option>
        ))}
      </select>

      <input
        type="tel"
        inputMode="numeric"
        maxLength={10}
        value={number}
        onChange={handleNumberChange}
        onPaste={handlePaste}
        disabled={disabled}
        placeholder="98400 11223"
        style={{
          fontFamily: 'var(--font-inter)',
          height: '36px',
          flex: 1,
          width: '100%',
          background: 'var(--color-surface-raised)',
          border: `0.5px solid ${externalError ? 'var(--color-danger)' : 'var(--color-border)'}`,
          borderRadius: '8px',
          padding: '0 12px',
          fontSize: 'var(--text-sm)',
          color: 'var(--color-foreground)',
          outline: 'none',
          boxSizing: 'border-box',
        }}
      />
    </div>
  )
}

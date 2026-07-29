'use client'

import React, { useState } from 'react'
import { PACKAGE_OPTIONS } from '@/lib/firebase/queries/leads'

export interface PackageSelectorProps {
  packageName: string
  packageAmount: number | string
  onChange: (pkgName: string, amount: number) => void
  error?: string
}

// Helper to normalize package names from legacy format (e.g. "Gold · ₹2,80,000" -> "Gold")
export function parsePackageName(raw: string): string {
  if (!raw) return ''
  const trimmed = raw.trim()
  if (trimmed.includes('Gold')) return 'Gold'
  if (trimmed.includes('Silver')) return 'Silver'
  if (trimmed.includes('Platinum')) return 'Platinum'
  if (trimmed.includes('Other')) return 'Other'
  return trimmed
}

// Helper to lookup default price
export function getDefaultPrice(name: string): number {
  const norm = parsePackageName(name)
  const pkg = PACKAGE_OPTIONS.find(p => p.name === norm)
  return pkg ? pkg.defaultPrice : 0
}

export function PackageSelector({
  packageName,
  packageAmount,
  onChange,
  error,
}: PackageSelectorProps) {
  const normPackage = parsePackageName(packageName)

  const [prevPackageName, setPrevPackageName] = useState(packageName)
  const [selectedPkg, setSelectedPkg] = useState<string>(normPackage)

  const initialAmount = packageAmount
    ? String(packageAmount)
    : normPackage
    ? String(getDefaultPrice(normPackage))
    : ''
  const [amountStr, setAmountStr] = useState<string>(initialAmount)

  // Sync state ONLY when package name prop changes externally (e.g. loading edit lead data)
  if (packageName !== prevPackageName) {
    setPrevPackageName(packageName)
    const norm = parsePackageName(packageName)
    setSelectedPkg(norm)
    if (packageAmount !== undefined && packageAmount !== null && packageAmount !== 0) {
      setAmountStr(String(packageAmount))
    } else if (norm) {
      const def = getDefaultPrice(norm)
      setAmountStr(def ? String(def) : '')
    } else {
      setAmountStr('')
    }
  }

  // Handle dropdown package selection change
  const handlePkgChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newPkg = e.target.value
    setSelectedPkg(newPkg)

    if (newPkg === 'Other' || !newPkg) {
      setAmountStr('')
      onChange(newPkg, 0)
    } else {
      const defaultPrice = getDefaultPrice(newPkg)
      setAmountStr(defaultPrice ? String(defaultPrice) : '')
      onChange(newPkg, defaultPrice)
    }
  }

  // Handle manual amount input change - allow empty string while user types/deletes
  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value.replace(/[^0-9]/g, '')
    setAmountStr(rawVal)
    const num = rawVal ? parseInt(rawVal, 10) : 0
    onChange(selectedPkg, num)
  }

  // On blur, if a standard package is selected and user left amount blank/0, re-apply default price
  const handleAmountBlur = () => {
    if (selectedPkg && selectedPkg !== 'Other') {
      if (!amountStr || parseInt(amountStr, 10) === 0) {
        const def = getDefaultPrice(selectedPkg)
        if (def) {
          setAmountStr(String(def))
          onChange(selectedPkg, def)
        }
      }
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%' }}>
      <div style={{ display: 'flex', gap: '8px', width: '100%', alignItems: 'center' }}>
        {/* ── Package Dropdown (~55% width) ── */}
        <select
          value={selectedPkg}
          onChange={handlePkgChange}
          style={{
            fontFamily:   'var(--font-inter)',
            height:       '36px',
            flex:         '1 1 55%',
            width:        '55%',
            background:   'var(--color-surface-raised)',
            border:       `0.5px solid ${error ? 'var(--color-danger)' : 'var(--color-border)'}`,
            borderRadius: '8px',
            padding:      '0 10px',
            fontSize:     'var(--text-sm)',
            color:        selectedPkg ? 'var(--color-foreground)' : 'var(--color-foreground-muted)',
            outline:      'none',
            cursor:       'pointer',
            boxSizing:    'border-box',
          }}
        >
          <option value="">Select package</option>
          {PACKAGE_OPTIONS.map(pkg => (
            <option key={pkg.id} value={pkg.name}>
              {pkg.name}
            </option>
          ))}
        </select>

        {/* ── Package Amount Input (~45% width with ₹ prefix) ── */}
        <div
          style={{
            display:     'flex',
            alignItems:  'center',
            flex:        '1 1 45%',
            width:       '45%',
            height:      '36px',
            background:  'var(--color-surface-raised)',
            border:      `0.5px solid ${error ? 'var(--color-danger)' : 'var(--color-border)'}`,
            borderRadius:'8px',
            padding:     '0 10px',
            boxSizing:   'border-box',
          }}
        >
          <span
            style={{
              fontFamily:  'var(--font-inter)',
              fontSize:    'var(--text-sm)',
              color:       'var(--color-foreground-muted)',
              marginRight: '6px',
              userSelect:  'none',
            }}
          >
            ₹
          </span>
          <input
            type="tel"
            inputMode="numeric"
            value={amountStr ? Number(amountStr).toLocaleString('en-IN') : ''}
            onChange={handleAmountChange}
            onBlur={handleAmountBlur}
            placeholder="Package amount"
            style={{
              fontFamily: 'var(--font-inter)',
              height:     '100%',
              width:      '100%',
              background: 'transparent',
              border:     'none',
              fontSize:   'var(--text-sm)',
              color:      'var(--color-foreground)',
              outline:    'none',
            }}
          />
        </div>
      </div>

      {error && (
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-danger)', marginTop: '2px' }}>
          {error}
        </span>
      )}
    </div>
  )
}

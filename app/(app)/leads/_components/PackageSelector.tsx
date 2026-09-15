'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { PACKAGE_OPTIONS, PackageOption } from '@/lib/firebase/queries/leads'
import { subscribeToPackageConfig } from '@/lib/firebase/queries/settings'

export interface PackageSelectorProps {
  packageName: string
  packageAmount: number | string
  onChange: (pkgName: string, amount: number) => void
  error?: string
}

// Helper to normalize package names
export function parsePackageName(raw: string, availableList?: PackageOption[]): string {
  if (!raw) return ''
  const trimmed = raw.trim()
  const clean = trimmed.split(/[·–—]/)[0].trim()

  if (availableList && availableList.length > 0) {
    const match = availableList.find(p => p.name.toLowerCase() === clean.toLowerCase())
    if (match) return match.name
  }

  if (clean.includes('Gold')) return 'Gold'
  if (clean.includes('Silver')) return 'Silver'
  if (clean.includes('Platinum')) return 'Platinum'
  if (clean.includes('Other')) return 'Other'
  return clean
}

// Helper to lookup default price from static options if config is not available
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
  const [configPackages, setConfigPackages] = useState<PackageOption[]>([])

  // Subscribe to packages from /studioSettings/packageConfig
  useEffect(() => {
    return subscribeToPackageConfig(data => {
      if (data && Array.isArray(data.packages) && data.packages.length > 0) {
        const mapped: PackageOption[] = data.packages.map(p => ({
          id: p.id || p.name.toLowerCase().replace(/\s+/g, '-'),
          name: p.name,
          defaultPrice: p.price ?? 0,
        }))
        // Ensure "Other" is always available at the end for custom entries
        if (!mapped.some(p => p.name.toLowerCase() === 'other')) {
          mapped.push({ id: 'other', name: 'Other', defaultPrice: 0 })
        }
        setConfigPackages(mapped)
      } else {
        setConfigPackages(PACKAGE_OPTIONS)
      }
    })
  }, [])

  const availablePackages = useMemo(() => {
    return configPackages.length > 0 ? configPackages : PACKAGE_OPTIONS
  }, [configPackages])

  const getPrice = (name: string): number => {
    const norm = parsePackageName(name, availablePackages)
    const pkg = availablePackages.find(p => p.name.toLowerCase() === norm.toLowerCase())
    return pkg ? pkg.defaultPrice : 0
  }

  const normPackage = parsePackageName(packageName, availablePackages)

  const [prevPackageName, setPrevPackageName] = useState(packageName)
  const [selectedPkg, setSelectedPkg] = useState<string>(normPackage)

  const initialAmount = packageAmount
    ? String(packageAmount)
    : normPackage
    ? String(getPrice(normPackage))
    : ''
  const [amountStr, setAmountStr] = useState<string>(initialAmount)

  // Sync state when package name prop changes externally (e.g. loading edit lead data)
  if (packageName !== prevPackageName) {
    setPrevPackageName(packageName)
    const norm = parsePackageName(packageName, availablePackages)
    setSelectedPkg(norm)
    if (packageAmount !== undefined && packageAmount !== null && packageAmount !== 0) {
      setAmountStr(String(packageAmount))
    } else if (norm) {
      const def = getPrice(norm)
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
      const defaultPrice = getPrice(newPkg)
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
        const def = getPrice(selectedPkg)
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
          {availablePackages.map(pkg => (
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

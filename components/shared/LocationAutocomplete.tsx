'use client'

import React, { useState, useEffect, useRef, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { subscribeToSavedAddresses } from '@/lib/firebase/queries/savedAddresses'
import type { SavedAddress } from '@/types'

interface LocationAutocompleteProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  style?: React.CSSProperties
  disabled?: boolean
  autoFocus?: boolean
  id?: string
}

export function LocationAutocomplete({
  value,
  onChange,
  placeholder = 'Venue, city or saved address',
  className = 'h-9',
  style,
  disabled = false,
  autoFocus = false,
  id,
}: LocationAutocompleteProps) {
  const [addresses, setAddresses] = useState<SavedAddress[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    return subscribeToSavedAddresses(setAddresses)
  }, [])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const filteredAddresses = useMemo(() => {
    if (!addresses.length) return []
    const trimmed = (value || '').trim().toLowerCase()
    if (!trimmed) {
      // Show up to 6 most recent / relevant addresses on focus
      return addresses.slice(0, 6)
    }
    return addresses.filter(addr =>
      addr.name.toLowerCase().includes(trimmed) ||
      addr.address.toLowerCase().includes(trimmed)
    ).slice(0, 8)
  }, [addresses, value])

  const handleSelect = (addr: SavedAddress) => {
    const formatted = addr.address.toLowerCase().includes(addr.name.toLowerCase())
      ? addr.address
      : `${addr.name}, ${addr.address}`
    onChange(formatted)
    setIsOpen(false)
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', ...style }}>
      <Input
        id={id}
        value={value}
        onChange={e => {
          onChange(e.target.value)
          if (!isOpen) setIsOpen(true)
        }}
        onFocus={() => setIsOpen(true)}
        placeholder={placeholder}
        className={className}
        disabled={disabled}
        autoFocus={autoFocus}
        autoComplete="off"
      />

      {isOpen && filteredAddresses.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            background: 'var(--color-surface-overlay)',
            border: '0.5px solid var(--color-border)',
            borderRadius: '10px',
            padding: '6px',
            zIndex: 60,
            maxHeight: '220px',
            overflowY: 'auto',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
            fontFamily: 'var(--font-inter)',
          }}
        >
          <div style={{
            padding: '4px 8px 6px',
            fontSize: 'var(--text-xs)',
            fontWeight: 600,
            color: 'var(--color-foreground-subtle)',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <span>Saved Addresses</span>
            <span style={{ fontSize: '10px', color: 'var(--color-foreground-muted)' }}>
              {filteredAddresses.length} {filteredAddresses.length === 1 ? 'match' : 'matches'}
            </span>
          </div>

          {filteredAddresses.map(addr => (
            <div
              key={addr.id}
              onMouseDown={e => {
                e.preventDefault()
                handleSelect(addr)
              }}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                padding: '8px 10px',
                borderRadius: '6px',
                cursor: 'pointer',
                transition: 'background 0.12s ease',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'var(--color-surface-raised)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'transparent'
              }}
            >
              <div
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '6px',
                  flexShrink: 0,
                  background: 'var(--color-primary-muted)',
                  color: 'var(--color-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginTop: '2px',
                }}
              >
                <i className="ti ti-map-pin" style={{ fontSize: '14px' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 'var(--text-sm)',
                  fontWeight: 600,
                  color: 'var(--color-foreground)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {addr.name}
                </div>
                <div style={{
                  fontSize: 'var(--text-xs)',
                  color: 'var(--color-foreground-muted)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {addr.address}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

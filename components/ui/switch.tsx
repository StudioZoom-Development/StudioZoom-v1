'use client'

import * as React from 'react'

interface SwitchProps {
  checked:          boolean
  onCheckedChange?: (checked: boolean) => void
  disabled?:        boolean
  className?:       string
}

export function Switch({ checked, onCheckedChange, disabled = false }: SwitchProps) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onCheckedChange?.(!checked)}
      style={{
        display:        'inline-flex',
        alignItems:     'center',
        width:          '42px',
        height:         '24px',
        borderRadius:   '12px',
        padding:        '2px',
        cursor:         disabled ? 'not-allowed' : 'pointer',
        border:         'none',
        outline:        'none',
        background:     checked ? 'var(--color-primary)' : 'var(--color-surface-raised)',
        transition:     'background 0.2s',
        flexShrink:     0,
        opacity:        disabled ? 0.5 : 1,
        boxSizing:      'border-box',
      }}
    >
      <span
        style={{
          width:         '18px',
          height:        '18px',
          borderRadius:  '50%',
          background:    '#ffffff',
          transform:     checked ? 'translateX(18px)' : 'translateX(0)',
          transition:    'transform 0.2s',
          display:       'block',
          flexShrink:    0,
        }}
      />
    </button>
  )
}

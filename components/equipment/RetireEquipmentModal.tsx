'use client'

import React, { useState } from 'react'
import type { Equipment } from '@/types'

interface RetireEquipmentModalProps {
  open: boolean
  item: Equipment | null
  onClose: () => void
  onConfirm: (reason: string) => Promise<void>
}

const RETIRE_REASONS = [
  'Damaged beyond repair',
  'Lost / Stolen on shoot',
  'Sold to third party',
  'Replaced by newer model',
  'Donated / Decommissioned',
]

export function RetireEquipmentModal({
  open,
  item,
  onClose,
  onConfirm,
}: RetireEquipmentModalProps) {
  const [selectedReason, setSelectedReason] = useState(RETIRE_REASONS[0])
  const [customReason, setCustomReason] = useState('')
  const [loading, setLoading] = useState(false)

  if (!open || !item) return null

  const handleRetire = async () => {
    const finalReason = customReason.trim() ? customReason.trim() : selectedReason
    try {
      setLoading(true)
      await onConfirm(finalReason)
      onClose()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9992,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '460px',
          background: 'var(--color-surface)',
          border: '0.5px solid var(--color-border)',
          borderRadius: '16px',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
          fontFamily: 'var(--font-inter)',
          color: 'var(--color-foreground)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              background: 'var(--color-danger-muted)',
              color: 'var(--color-danger)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '20px',
            }}
          >
            <i className="ti ti-archive" />
          </div>
          <div>
            <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 700, margin: 0 }}>
              Retire / Dispose Equipment
            </h3>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>
              {item.itemCode} · {item.name}
            </span>
          </div>
        </div>

        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-foreground-muted)', margin: 0, lineHeight: 1.4 }}>
          This will change the status to <b>Retired</b> and preserve all past checkout logs and maintenance history. Retired items cannot be checked out.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-foreground-subtle)' }}>
            Reason for Retirement
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {RETIRE_REASONS.map((r) => (
              <label
                key={r}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: 'var(--text-xs)',
                  color: 'var(--color-foreground)',
                  cursor: 'pointer',
                  padding: '6px 8px',
                  borderRadius: '6px',
                  background: selectedReason === r ? 'var(--color-surface-raised)' : 'transparent',
                }}
              >
                <input
                  type="radio"
                  name="retire_reason"
                  checked={selectedReason === r}
                  onChange={() => setSelectedReason(r)}
                  style={{ accentColor: 'var(--color-primary)' }}
                />
                <span>{r}</span>
              </label>
            ))}
          </div>

          <input
            type="text"
            value={customReason}
            onChange={(e) => setCustomReason(e.target.value)}
            placeholder="Or specify custom reason / notes..."
            style={{
              height: '36px',
              borderRadius: '8px',
              background: 'var(--color-surface-raised)',
              border: '0.5px solid var(--color-border)',
              padding: '0 12px',
              fontSize: 'var(--text-xs)',
              color: 'var(--color-foreground)',
              outline: 'none',
              marginTop: '4px',
            }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', paddingTop: '8px' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              height: '36px',
              padding: '0 14px',
              borderRadius: '8px',
              background: 'transparent',
              border: '0.5px solid var(--color-border)',
              color: 'var(--color-foreground)',
              fontSize: 'var(--text-xs)',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={handleRetire}
            style={{
              height: '36px',
              padding: '0 16px',
              borderRadius: '8px',
              background: 'var(--color-danger)',
              border: 'none',
              color: '#ffffff',
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Retiring...' : 'Confirm Retirement'}
          </button>
        </div>
      </div>
    </div>
  )
}

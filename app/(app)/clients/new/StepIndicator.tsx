'use client'

import { motion } from 'framer-motion'

interface StepDef {
  label: string
  icon:  string
}

const STEPS: StepDef[] = [
  { label: 'Booking Type', icon: 'ti-layout-grid' },
  { label: 'Client',       icon: 'ti-user' },
  { label: 'Event',        icon: 'ti-calendar-event' },
  { label: 'Package',      icon: 'ti-package' },
  { label: 'Payment',      icon: 'ti-credit-card' },
  { label: 'Review',       icon: 'ti-checklist' },
]

interface StepIndicatorProps {
  currentStep:  number
  onStepClick:  (step: number) => void
  onSaveDraft:  () => void
  isSaving:     boolean
  completedSteps: Set<number>
}

export default function StepIndicator({
  currentStep,
  onStepClick,
  onSaveDraft,
  isSaving,
  completedSteps,
}: StepIndicatorProps): React.JSX.Element {
  return (
    <div style={{
      width: '220px',
      minWidth: '220px',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      padding: '24px 0',
      fontFamily: 'var(--font-inter)',
    }}>
      {/* Step list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
        {STEPS.map((step, idx) => {
          const isActive    = idx === currentStep
          const isCompleted = completedSteps.has(idx)
          const isClickable = isCompleted || idx <= currentStep

          return (
            <div key={step.label}>
              {/* Step row */}
              <motion.div
                onClick={() => isClickable && onStepClick(idx)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '10px 16px',
                  cursor: isClickable ? 'pointer' : 'default',
                  borderRadius: '8px',
                  background: isActive ? 'var(--color-primary-muted)' : 'transparent',
                  transition: 'background 0.2s ease',
                }}
                whileHover={isClickable ? { background: 'var(--color-surface-raised)' } : {}}
              >
                {/* Dot / check */}
                <motion.div
                  layout
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    fontSize: '13px',
                    fontWeight: 600,
                    border: isActive
                      ? '2px solid var(--color-primary)'
                      : isCompleted
                        ? '2px solid var(--color-success)'
                        : '1.5px solid var(--color-border-strong)',
                    background: isActive
                      ? 'var(--color-primary)'
                      : isCompleted
                        ? 'var(--color-success)'
                        : 'transparent',
                    color: isActive || isCompleted
                      ? '#ffffff'
                      : 'var(--color-foreground-subtle)',
                  }}
                  animate={{
                    scale: isActive ? 1.1 : 1,
                  }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                >
                  {isCompleted
                    ? <i className="ti ti-check" style={{ fontSize: '14px' }} />
                    : <i className={`ti ${step.icon}`} style={{ fontSize: '13px' }} />
                  }
                </motion.div>

                {/* Label */}
                <span style={{
                  fontSize: 'var(--text-sm)',
                  fontWeight: isActive ? 600 : 400,
                  color: isActive
                    ? 'var(--color-foreground)'
                    : isCompleted
                      ? 'var(--color-foreground)'
                      : 'var(--color-foreground-muted)',
                  transition: 'color 0.2s ease',
                }}>
                  {step.label}
                </span>
              </motion.div>

              {/* Connecting line */}
              {idx < STEPS.length - 1 && (
                <div style={{
                  marginLeft: '29px',
                  width: '2px',
                  height: '16px',
                  background: isCompleted
                    ? 'var(--color-success)'
                    : 'var(--color-border)',
                  transition: 'background 0.3s ease',
                }} />
              )}
            </div>
          )
        })}
      </div>

      {/* Save Draft */}
      <button
        onClick={onSaveDraft}
        disabled={isSaving}
        style={{
          fontFamily: 'var(--font-inter)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
          padding: '10px 16px',
          margin: '0 16px',
          background: 'transparent',
          border: '0.5px solid var(--color-border)',
          borderRadius: '8px',
          fontSize: 'var(--text-sm)',
          color: 'var(--color-foreground-muted)',
          cursor: isSaving ? 'not-allowed' : 'pointer',
          opacity: isSaving ? 0.5 : 1,
          transition: 'all 0.2s ease',
        }}
      >
        <i className="ti ti-device-floppy" style={{ fontSize: '16px' }} />
        {isSaving ? 'Saving…' : 'Save as draft'}
      </button>
    </div>
  )
}

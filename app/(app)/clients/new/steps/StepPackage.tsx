'use client'

import { useEffect, useState } from 'react'
import { motion, useSpring, useTransform } from 'framer-motion'
import { Input } from '@/components/ui/input'
import { subscribeToPackageConfig, PackageTemplate } from '@/lib/firebase/queries/settings'
import { BookingWizardState, BookingAction } from '../bookingReducer'

interface StepPackageProps {
  state:    BookingWizardState
  dispatch: React.Dispatch<BookingAction>
}

/** Animated number counter */
function AnimatedNumber({ value }: { value: number }): React.JSX.Element {
  const springVal = useSpring(0, { stiffness: 120, damping: 20 })
  const display = useTransform(springVal, (v: number) =>
    `₹${Math.round(v).toLocaleString('en-IN')}`
  )

  useEffect(() => {
    springVal.set(value)
  }, [value, springVal])

  return (
    <motion.span style={{
      fontSize: 'var(--text-3xl)',
      fontWeight: 700,
      fontFamily: 'var(--font-inter)',
      color: 'var(--color-primary)',
    }}>
      {display}
    </motion.span>
  )
}

export default function StepPackage({ state, dispatch }: StepPackageProps): React.JSX.Element {
  const [packages, setPackages] = useState<PackageTemplate[]>([])
  const isRecurring = state.bookingType === 'recurring'

  useEffect(() => {
    const unsub = subscribeToPackageConfig(config => {
      if (config?.packages?.length) {
        setPackages(config.packages)
      }
    })
    return () => unsub()
  }, [])

  const handleSelectPackage = (pkg: PackageTemplate): void => {
    dispatch({ type: 'SET_PACKAGE', payload: { id: pkg.id, name: pkg.name, price: pkg.price } })
  }

  const handleCustom = (): void => {
    dispatch({ type: 'SET_PACKAGE', payload: { id: 'custom', name: 'Custom', price: state.totalAmount } })
  }

  // Computed total for recurring
  const computedTotal = isRecurring && state.perSessionRate > 0 && state.totalSessions > 0
    ? state.perSessionRate * state.totalSessions
    : state.totalAmount

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div>
        <h2 style={{
          fontSize: 'var(--text-xl)',
          fontWeight: 600,
          color: 'var(--color-foreground)',
          fontFamily: 'var(--font-inter)',
          margin: 0,
        }}>
          Package &amp; pricing
        </h2>
        <p style={{
          fontSize: 'var(--text-sm)',
          color: 'var(--color-foreground-muted)',
          fontFamily: 'var(--font-inter)',
          marginTop: '6px',
        }}>
          {isRecurring
            ? 'Set the per-session rate for this contract.'
            : 'Select a package template or enter a custom amount.'}
        </p>
      </div>

      {/* Package cards (not for recurring) */}
      {!isRecurring && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: '10px',
        }}>
          {packages.map(pkg => {
            const isSelected = state.selectedPackageId === pkg.id
            return (
              <motion.div
                key={pkg.id}
                onClick={() => handleSelectPackage(pkg)}
                style={{
                  padding: '16px',
                  borderRadius: '10px',
                  border: isSelected
                    ? '2px solid var(--color-primary)'
                    : '0.5px solid var(--color-border)',
                  background: isSelected
                    ? 'var(--color-primary-muted)'
                    : 'var(--color-surface)',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  transition: 'border-color 0.15s ease, background 0.15s ease',
                }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <div style={{
                  fontSize: 'var(--text-sm)',
                  fontWeight: 600,
                  fontFamily: 'var(--font-inter)',
                  color: 'var(--color-foreground)',
                }}>
                  {pkg.name}
                </div>
                <div style={{
                  fontSize: 'var(--text-lg)',
                  fontWeight: 700,
                  fontFamily: 'var(--font-inter)',
                  color: isSelected ? 'var(--color-primary)' : 'var(--color-foreground)',
                }}>
                  ₹{pkg.price.toLocaleString('en-IN')}
                </div>
                {pkg.items && (
                  <div style={{
                    fontSize: 'var(--text-xs)',
                    fontFamily: 'var(--font-inter)',
                    color: 'var(--color-foreground-muted)',
                    lineHeight: 1.4,
                  }}>
                    {pkg.items}
                  </div>
                )}
              </motion.div>
            )
          })}

          {/* Custom card */}
          <motion.div
            onClick={handleCustom}
            style={{
              padding: '16px',
              borderRadius: '10px',
              border: state.selectedPackageId === 'custom'
                ? '2px solid var(--color-primary)'
                : '0.5px dashed var(--color-border-strong)',
              background: state.selectedPackageId === 'custom'
                ? 'var(--color-primary-muted)'
                : 'transparent',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              minHeight: '80px',
              transition: 'border-color 0.15s ease, background 0.15s ease',
            }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <i className="ti ti-pencil" style={{
              fontSize: '20px',
              color: state.selectedPackageId === 'custom'
                ? 'var(--color-primary)'
                : 'var(--color-foreground-muted)',
            }} />
            <div style={{
              fontSize: 'var(--text-sm)',
              fontWeight: 500,
              fontFamily: 'var(--font-inter)',
              color: state.selectedPackageId === 'custom'
                ? 'var(--color-primary)'
                : 'var(--color-foreground-muted)',
            }}>
              Custom
            </div>
          </motion.div>
        </div>
      )}

      {/* Amount inputs */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        padding: '16px',
        borderRadius: '10px',
        background: 'var(--color-surface)',
        border: '0.5px solid var(--color-border)',
      }}>
        {isRecurring ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Mode selector */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '10px',
            }}>
              <div
                onClick={() => {
                  dispatch({ type: 'SET_FIELD', field: 'recurringPaymentType', value: 'perSession' })
                  dispatch({ type: 'SET_FIELD', field: 'totalAmount', value: state.perSessionRate * state.totalSessions })
                }}
                style={{
                  padding: '14px',
                  borderRadius: '10px',
                  border: state.recurringPaymentType === 'perSession'
                    ? '2px solid var(--color-primary)'
                    : '0.5px solid var(--color-border)',
                  background: state.recurringPaymentType === 'perSession'
                    ? 'var(--color-primary-muted)'
                    : 'var(--color-surface-raised)',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                }}
              >
                <div style={{
                  fontSize: 'var(--text-sm)',
                  fontWeight: 600,
                  color: state.recurringPaymentType === 'perSession' ? 'var(--color-primary)' : 'var(--color-foreground)',
                  fontFamily: 'var(--font-inter)',
                }}>
                  Payment per session
                </div>
                <div style={{
                  fontSize: 'var(--text-xs)',
                  color: 'var(--color-foreground-muted)',
                  fontFamily: 'var(--font-inter)',
                }}>
                  Calculate total as rate × {state.totalSessions} sessions
                </div>
              </div>

              <div
                onClick={() => {
                  dispatch({ type: 'SET_FIELD', field: 'recurringPaymentType', value: 'custom' })
                }}
                style={{
                  padding: '14px',
                  borderRadius: '10px',
                  border: state.recurringPaymentType === 'custom'
                    ? '2px solid var(--color-primary)'
                    : '0.5px solid var(--color-border)',
                  background: state.recurringPaymentType === 'custom'
                    ? 'var(--color-primary-muted)'
                    : 'var(--color-surface-raised)',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                }}
              >
                <div style={{
                  fontSize: 'var(--text-sm)',
                  fontWeight: 600,
                  color: state.recurringPaymentType === 'custom' ? 'var(--color-primary)' : 'var(--color-foreground)',
                  fontFamily: 'var(--font-inter)',
                }}>
                  Custom contract amount
                </div>
                <div style={{
                  fontSize: 'var(--text-xs)',
                  color: 'var(--color-foreground-muted)',
                  fontFamily: 'var(--font-inter)',
                }}>
                  Fixed lump-sum for the whole contract
                </div>
              </div>
            </div>

            {/* Inputs based on selected mode */}
            {state.recurringPaymentType === 'perSession' ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{
                    fontSize: 'var(--text-sm)',
                    fontWeight: 500,
                    fontFamily: 'var(--font-inter)',
                    color: 'var(--color-foreground)',
                  }}>
                    Per-session rate (₹)
                  </label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={state.perSessionRate > 0 ? String(state.perSessionRate) : ''}
                    onChange={e => {
                      const rate = parseFloat(e.target.value) || 0
                      dispatch({ type: 'SET_FIELD', field: 'perSessionRate', value: rate })
                      dispatch({ type: 'SET_FIELD', field: 'totalAmount', value: rate * state.totalSessions })
                    }}
                    className="h-9"
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{
                    fontSize: 'var(--text-sm)',
                    fontWeight: 500,
                    fontFamily: 'var(--font-inter)',
                    color: 'var(--color-foreground)',
                  }}>
                    Sessions
                  </label>
                  <div style={{
                    height: '36px',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 12px',
                    background: 'var(--color-surface-raised)',
                    border: '0.5px solid var(--color-border)',
                    borderRadius: '8px',
                    fontSize: 'var(--text-sm)',
                    fontFamily: 'var(--font-inter)',
                    color: 'var(--color-foreground-muted)',
                  }}>
                    {state.totalSessions} sessions
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{
                    fontSize: 'var(--text-sm)',
                    fontWeight: 500,
                    fontFamily: 'var(--font-inter)',
                    color: 'var(--color-foreground)',
                  }}>
                    Total contract amount (₹)
                  </label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={state.totalAmount > 0 ? String(state.totalAmount) : ''}
                    onChange={e => {
                      const total = parseFloat(e.target.value) || 0
                      dispatch({ type: 'SET_FIELD', field: 'totalAmount', value: total })
                      if (state.totalSessions > 0) {
                        dispatch({ type: 'SET_FIELD', field: 'perSessionRate', value: Math.round(total / state.totalSessions) })
                      }
                    }}
                    className="h-9"
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{
                    fontSize: 'var(--text-sm)',
                    fontWeight: 500,
                    fontFamily: 'var(--font-inter)',
                    color: 'var(--color-foreground)',
                  }}>
                    Effective rate / session
                  </label>
                  <div style={{
                    height: '36px',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 12px',
                    background: 'var(--color-surface-raised)',
                    border: '0.5px solid var(--color-border)',
                    borderRadius: '8px',
                    fontSize: 'var(--text-sm)',
                    fontFamily: 'var(--font-inter)',
                    color: 'var(--color-foreground-muted)',
                  }}>
                    {state.totalSessions > 0 && state.totalAmount > 0
                      ? `≈ ₹${Math.round(state.totalAmount / state.totalSessions).toLocaleString('en-IN')} / session`
                      : '—'}
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{
              fontSize: 'var(--text-sm)',
              fontWeight: 500,
              fontFamily: 'var(--font-inter)',
              color: 'var(--color-foreground)',
            }}>
              Total amount
            </label>
            <Input
              type="number"
              placeholder="0"
              value={state.totalAmount > 0 ? String(state.totalAmount) : ''}
              onChange={e => dispatch({ type: 'SET_FIELD', field: 'totalAmount', value: parseFloat(e.target.value) || 0 })}
              className="h-9"
              style={{ maxWidth: '220px' }}
              disabled={state.selectedPackageId !== 'custom' && state.selectedPackageId !== ''}
            />
          </div>
        )}

        {/* Price summary */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingTop: '12px',
          borderTop: '0.5px solid var(--color-border)',
        }}>
          <div style={{
            fontSize: 'var(--text-xs)',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: 'var(--color-foreground-subtle)',
            fontFamily: 'var(--font-inter)',
          }}>
            Package total
          </div>
          <AnimatedNumber value={computedTotal} />
        </div>
      </div>
    </div>
  )
}

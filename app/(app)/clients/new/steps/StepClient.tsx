'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Input } from '@/components/ui/input'
import { Client } from '@/types'
import { subscribeToClients } from '@/lib/firebase/queries/clients'
import { BookingWizardState, BookingAction } from '../bookingReducer'

interface StepClientProps {
  state:    BookingWizardState
  dispatch: React.Dispatch<BookingAction>
}

export default function StepClient({ state, dispatch }: StepClientProps): React.JSX.Element {
  const [searchTerm, setSearchTerm] = useState('')
  const [allClients, setAllClients] = useState<Client[]>([])
  const [filteredClients, setFilteredClients] = useState<Client[]>([])
  const [showResults, setShowResults] = useState(false)
  const [contactTouched, setContactTouched] = useState(false)

  const rawContactDigits = state.contact.replace(/\D/g, '')

  const contactError = useMemo(() => {
    if (!contactTouched && !rawContactDigits) return ''
    if (contactTouched && !rawContactDigits) return 'Contact number is required'
    if (rawContactDigits.length > 0 && rawContactDigits.length !== 10) {
      return 'Contact number must be exactly 10 digits'
    }
    return ''
  }, [contactTouched, rawContactDigits])

  const emailError = useMemo(() => {
    if (!state.email) return ''
    const trimmed = state.email.trim()
    if (!trimmed) return ''
    const emailRegex = /^[^\s@]+@[^\s@]+\.[a-zA-Z0-9.-]*[cC][oO][mM]$/
    if (!emailRegex.test(trimmed)) {
      return 'Email must be a valid address ending with .com'
    }
    return ''
  }, [state.email])

  // Subscribe to all clients for search
  useEffect(() => {
    const unsub = subscribeToClients({}, (clients: Client[]) => {
      setAllClients(clients)
    })
    return () => unsub()
  }, [])

  // Filter clients by search term
  const handleSearch = useCallback((term: string) => {
    setSearchTerm(term)
    if (term.trim().length < 2) {
      setFilteredClients([])
      setShowResults(false)
      return
    }
    const lower = term.toLowerCase()
    const matches = allClients
      .filter(c =>
        c.name.toLowerCase().includes(lower) ||
        c.contact.includes(term) ||
        c.email.toLowerCase().includes(lower)
      )
      .slice(0, 5)
    setFilteredClients(matches)
    setShowResults(true)
  }, [allClients])

  const handleSelectClient = (client: Client): void => {
    dispatch({
      type: 'SET_EXISTING_CLIENT',
      payload: {
        clientId: client.clientId,
        name:     client.name,
        contact:  client.contact,
        email:    client.email,
      },
    })
    setShowResults(false)
    setSearchTerm('')
  }

  const handleCreateNew = (): void => {
    dispatch({ type: 'SET_CLIENT_MODE', payload: 'new' })
    setShowResults(false)
  }

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
          Client information
        </h2>
        <p style={{
          fontSize: 'var(--text-sm)',
          color: 'var(--color-foreground-muted)',
          fontFamily: 'var(--font-inter)',
          marginTop: '6px',
        }}>
          Search for an existing client or create a new one.
        </p>
      </div>

      {/* Search bar */}
      <div style={{ position: 'relative' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '0 14px',
          background: 'var(--color-surface-raised)',
          border: '0.5px solid var(--color-border)',
          borderRadius: '10px',
          height: '42px',
        }}>
          <i className="ti ti-search" style={{ fontSize: '18px', color: 'var(--color-foreground-subtle)' }} />
          <input
            placeholder="Search by name, phone, or email…"
            value={searchTerm}
            onChange={e => handleSearch(e.target.value)}
            style={{
              fontFamily: 'var(--font-inter)',
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontSize: 'var(--text-sm)',
              color: 'var(--color-foreground)',
            }}
          />
          {searchTerm && (
            <span
              onClick={() => { setSearchTerm(''); setShowResults(false) }}
              style={{ cursor: 'pointer', color: 'var(--color-foreground-muted)', fontSize: '14px' }}
            >
              <i className="ti ti-x" />
            </span>
          )}
        </div>

        {/* Search results dropdown */}
        <AnimatePresence>
          {showResults && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }}
              style={{
                position: 'absolute',
                top: '48px',
                left: 0,
                right: 0,
                background: 'var(--color-surface-overlay)',
                border: '0.5px solid var(--color-border)',
                borderRadius: '10px',
                padding: '6px',
                zIndex: 20,
                maxHeight: '280px',
                overflowY: 'auto',
              }}
            >
              {filteredClients.length > 0 ? (
                filteredClients.map(c => (
                  <motion.div
                    key={c.clientId}
                    onClick={() => handleSelectClient(c)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      transition: 'background 0.15s ease',
                    }}
                    whileHover={{ backgroundColor: 'var(--color-surface-raised)' }}
                  >
                    {/* Avatar */}
                    <div style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '50%',
                      background: 'var(--color-primary-muted)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 'var(--text-xs)',
                      fontWeight: 700,
                      color: 'var(--color-primary)',
                      fontFamily: 'var(--font-inter)',
                      flexShrink: 0,
                    }}>
                      {c.name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 'var(--text-sm)',
                        fontWeight: 500,
                        color: 'var(--color-foreground)',
                        fontFamily: 'var(--font-inter)',
                      }}>
                        {c.name}
                      </div>
                      <div style={{
                        fontSize: 'var(--text-xs)',
                        color: 'var(--color-foreground-muted)',
                        fontFamily: 'var(--font-inter)',
                      }}>
                        {c.contact} · {c.email || 'No email'}
                      </div>
                    </div>
                  </motion.div>
                ))
              ) : (
                <div style={{
                  padding: '16px',
                  textAlign: 'center',
                  fontSize: 'var(--text-sm)',
                  color: 'var(--color-foreground-muted)',
                  fontFamily: 'var(--font-inter)',
                }}>
                  No clients found for &ldquo;{searchTerm}&rdquo;
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Selected existing client badge */}
      <AnimatePresence>
        {state.clientMode === 'existing' && state.existingClientId && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '14px 16px',
              borderRadius: '10px',
              background: 'var(--color-success-muted)',
              border: '0.5px solid var(--color-success)',
            }}
          >
            <i className="ti ti-check" style={{ fontSize: '18px', color: 'var(--color-success)' }} />
            <div style={{ flex: 1 }}>
              <div style={{
                fontSize: 'var(--text-sm)',
                fontWeight: 600,
                color: 'var(--color-foreground)',
                fontFamily: 'var(--font-inter)',
              }}>
                {state.clientName}
              </div>
              <div style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--color-foreground-muted)',
                fontFamily: 'var(--font-inter)',
              }}>
                {state.contact} · {state.email || 'No email'}
              </div>
            </div>
            <span
              onClick={handleCreateNew}
              style={{
                cursor: 'pointer',
                fontSize: 'var(--text-xs)',
                fontWeight: 500,
                color: 'var(--color-primary)',
                fontFamily: 'var(--font-inter)',
              }}
            >
              Change
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* New client form */}
      <AnimatePresence>
        {state.clientMode === 'new' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
          >
            {/* Divider label */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}>
              <div style={{
                flex: 1,
                height: '0.5px',
                background: 'var(--color-border)',
              }} />
              <span style={{
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: 'var(--color-foreground-subtle)',
                fontFamily: 'var(--font-inter)',
              }}>
                New client details
              </span>
              <div style={{
                flex: 1,
                height: '0.5px',
                background: 'var(--color-border)',
              }} />
            </div>

            {/* Name */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{
                fontSize: 'var(--text-sm)',
                fontWeight: 500,
                fontFamily: 'var(--font-inter)',
                color: 'var(--color-foreground)',
              }}>
                Full name <span style={{ color: 'var(--color-danger)' }}>*</span>
              </label>
              <Input
                placeholder="Client full name"
                value={state.clientName}
                onChange={e => dispatch({ type: 'SET_FIELD', field: 'clientName', value: e.target.value })}
                className="h-9"
              />
            </div>

            {/* Contact + Email */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{
                  fontSize: 'var(--text-sm)',
                  fontWeight: 500,
                  fontFamily: 'var(--font-inter)',
                  color: 'var(--color-foreground)',
                }}>
                  Contact <span style={{ color: 'var(--color-danger)' }}>*</span>
                </label>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <span style={{
                    height: '36px',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 10px',
                    background: 'var(--color-surface-overlay)',
                    border: `0.5px solid ${contactError ? 'var(--color-danger)' : 'var(--color-border)'}`,
                    borderRight: 'none',
                    borderRadius: '8px 0 0 8px',
                    fontSize: 'var(--text-sm)',
                    fontFamily: 'var(--font-inter)',
                    color: 'var(--color-foreground-muted)',
                  }}>
                    +91
                  </span>
                  <input
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={10}
                    placeholder="9840012345"
                    value={rawContactDigits}
                    onChange={e => {
                      const digits = e.target.value.replace(/\D/g, '').slice(0, 10)
                      dispatch({ type: 'SET_FIELD', field: 'contact', value: digits })
                    }}
                    onKeyDown={e => {
                      if ([
                        'Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
                        'Tab', 'Home', 'End', 'Enter'
                      ].includes(e.key) || (e.ctrlKey || e.metaKey)) {
                        return
                      }
                      if (!/^[0-9]$/.test(e.key)) {
                        e.preventDefault()
                      }
                    }}
                    onPaste={e => {
                      e.preventDefault()
                      const pasted = e.clipboardData.getData('text')
                      const digits = pasted.replace(/\D/g, '').slice(0, 10)
                      dispatch({ type: 'SET_FIELD', field: 'contact', value: digits })
                      setContactTouched(true)
                    }}
                    onBlur={() => setContactTouched(true)}
                    style={{
                      fontFamily: 'var(--font-inter)',
                      flex: 1,
                      height: '36px',
                      background: 'var(--color-surface-raised)',
                      border: `0.5px solid ${contactError ? 'var(--color-danger)' : 'var(--color-border)'}`,
                      borderRadius: '0 8px 8px 0',
                      padding: '0 12px',
                      fontSize: 'var(--text-sm)',
                      color: 'var(--color-foreground)',
                      outline: 'none',
                    }}
                  />
                </div>
                {contactError && (
                  <span style={{
                    fontSize: 'var(--text-xs)',
                    color: 'var(--color-danger)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    marginTop: '2px',
                  }}>
                    <i className="ti ti-alert-circle" style={{ fontSize: '13px' }} />
                    {contactError}
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{
                  fontSize: 'var(--text-sm)',
                  fontWeight: 500,
                  fontFamily: 'var(--font-inter)',
                  color: 'var(--color-foreground)',
                }}>
                  Email
                </label>
                <Input
                  type="email"
                  placeholder="name@email.com"
                  value={state.email}
                  onChange={e => dispatch({ type: 'SET_FIELD', field: 'email', value: e.target.value })}
                  style={emailError ? { border: '0.5px solid var(--color-danger)' } : undefined}
                  className="h-9"
                />
                {emailError && (
                  <span style={{
                    fontSize: 'var(--text-xs)',
                    color: 'var(--color-danger)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    marginTop: '2px',
                  }}>
                    <i className="ti ti-alert-circle" style={{ fontSize: '13px' }} />
                    {emailError}
                  </span>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

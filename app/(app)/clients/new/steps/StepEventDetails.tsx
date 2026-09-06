'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { Input } from '@/components/ui/input'
import { EventType } from '@/types'
import { BookingWizardState, BookingAction } from '../bookingReducer'

const EVENT_TYPES: Array<{ value: EventType; label: string }> = [
  { value: 'wedding',     label: 'Wedding' },
  { value: 'reception',   label: 'Reception' },
  { value: 'preWedding',  label: 'Pre-Wedding' },
  { value: 'engagement',  label: 'Engagement' },
  { value: 'birthday',    label: 'Birthday' },
  { value: 'babyShower',  label: 'Baby Shower' },
  { value: 'puberty',     label: 'Puberty' },
  { value: 'corporate',   label: 'Corporate' },
  { value: 'schoolEvent', label: 'School Event' },
  { value: 'portrait',    label: 'Portrait' },
  { value: 'studio',      label: 'Studio' },
  { value: 'other',       label: 'Other' },
]

const SELECT_STYLE: React.CSSProperties = {
  fontFamily: 'var(--font-inter)',
  height: '36px',
  width: '100%',
  background: 'var(--color-surface-raised)',
  border: '0.5px solid var(--color-border)',
  borderRadius: '8px',
  padding: '0 10px',
  fontSize: 'var(--text-sm)',
  color: 'var(--color-foreground)',
  outline: 'none',
  cursor: 'pointer',
}

interface StepEventDetailsProps {
  state:    BookingWizardState
  dispatch: React.Dispatch<BookingAction>
}

export default function StepEventDetails({ state, dispatch }: StepEventDetailsProps): React.JSX.Element {
  const isMultiDate = state.bookingType === 'multiDate'
  const isRecurring = state.bookingType === 'recurring'

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
          Event details
        </h2>
        <p style={{
          fontSize: 'var(--text-sm)',
          color: 'var(--color-foreground-muted)',
          fontFamily: 'var(--font-inter)',
          marginTop: '6px',
        }}>
          {isMultiDate
            ? 'Add all dates for this multi-date booking.'
            : isRecurring
              ? 'Set the recurring schedule for this contract.'
              : 'Describe the event being booked.'}
        </p>
      </div>

      {/* Event Name */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <label style={{
          fontSize: 'var(--text-sm)',
          fontWeight: 500,
          fontFamily: 'var(--font-inter)',
          color: 'var(--color-foreground)',
        }}>
          Event name <span style={{ color: 'var(--color-danger)' }}>*</span>
        </label>
        <Input
          placeholder="e.g. Karthik weds Priya"
          value={state.eventName}
          onChange={e => dispatch({ type: 'SET_FIELD', field: 'eventName', value: e.target.value })}
          className="h-9"
        />
      </div>

      {/* Event Type + Location (always shown) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{
            fontSize: 'var(--text-sm)',
            fontWeight: 500,
            fontFamily: 'var(--font-inter)',
            color: 'var(--color-foreground)',
          }}>
            Event type <span style={{ color: 'var(--color-danger)' }}>*</span>
          </label>
          <select
            style={SELECT_STYLE}
            value={state.eventType}
            onChange={e => dispatch({ type: 'SET_EVENT_TYPE', payload: e.target.value as EventType })}
          >
            {EVENT_TYPES.map(et => (
              <option key={et.value} value={et.value}>{et.label}</option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{
            fontSize: 'var(--text-sm)',
            fontWeight: 500,
            fontFamily: 'var(--font-inter)',
            color: 'var(--color-foreground)',
          }}>
            Location
          </label>
          <Input
            placeholder="Venue, city"
            value={state.location}
            onChange={e => dispatch({ type: 'SET_FIELD', field: 'location', value: e.target.value })}
            className="h-9"
          />
        </div>
      </div>

      {/* Custom Event Type Input (when 'other' is selected) */}
      {state.eventType === 'other' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{
            fontSize: 'var(--text-sm)',
            fontWeight: 500,
            fontFamily: 'var(--font-inter)',
            color: 'var(--color-foreground)',
          }}>
            Specify other event type <span style={{ color: 'var(--color-danger)' }}>*</span>
          </label>
          <Input
            placeholder="e.g. Housewarming, Naming ceremony, Fashion shoot…"
            value={state.customEventType}
            onChange={e => dispatch({ type: 'SET_FIELD', field: 'customEventType', value: e.target.value })}
            className="h-9"
          />
        </div>
      )}

      {/* ──── ONE-TIME: Single date & timings ──── */}
      {!isMultiDate && !isRecurring && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '12px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{
              fontSize: 'var(--text-sm)',
              fontWeight: 500,
              fontFamily: 'var(--font-inter)',
              color: 'var(--color-foreground)',
            }}>
              Event date <span style={{ color: 'var(--color-danger)' }}>*</span>
            </label>
            <Input
              type="date"
              value={state.eventDate}
              onChange={e => dispatch({ type: 'SET_FIELD', field: 'eventDate', value: e.target.value })}
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
              Start time
            </label>
            <Input
              type="time"
              value={state.startTime}
              onChange={e => dispatch({ type: 'SET_FIELD', field: 'startTime', value: e.target.value })}
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
              End time
            </label>
            <Input
              type="time"
              value={state.endTime}
              onChange={e => dispatch({ type: 'SET_FIELD', field: 'endTime', value: e.target.value })}
              className="h-9"
            />
          </div>
        </div>
      )}

      {/* ──── MULTI-DATE: Date list builder ──── */}
      {isMultiDate && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{
            fontSize: 'var(--text-xs)',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: 'var(--color-foreground-subtle)',
            fontFamily: 'var(--font-inter)',
          }}>
            Event dates &amp; schedule
          </div>

          <AnimatePresence initial={false}>
            {state.eventDates.map((ed, idx) => (
              <motion.div
                key={ed.id}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                style={{ overflow: 'hidden' }}
              >
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1.2fr 130px 96px 96px 1fr 36px',
                  gap: '8px',
                  alignItems: 'end',
                  paddingBottom: '8px',
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {idx === 0 && (
                      <label style={{
                        fontSize: 'var(--text-xs)',
                        fontWeight: 500,
                        fontFamily: 'var(--font-inter)',
                        color: 'var(--color-foreground-muted)',
                      }}>
                        Label
                      </label>
                    )}
                    <Input
                      placeholder="e.g. Engagement"
                      value={ed.label}
                      onChange={e => dispatch({
                        type: 'UPDATE_EVENT_DATE',
                        id: ed.id,
                        field: 'label',
                        value: e.target.value,
                      })}
                      className="h-9"
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {idx === 0 && (
                      <label style={{
                        fontSize: 'var(--text-xs)',
                        fontWeight: 500,
                        fontFamily: 'var(--font-inter)',
                        color: 'var(--color-foreground-muted)',
                      }}>
                        Date
                      </label>
                    )}
                    <Input
                      type="date"
                      value={ed.date}
                      onChange={e => dispatch({
                        type: 'UPDATE_EVENT_DATE',
                        id: ed.id,
                        field: 'date',
                        value: e.target.value,
                      })}
                      className="h-9"
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {idx === 0 && (
                      <label style={{
                        fontSize: 'var(--text-xs)',
                        fontWeight: 500,
                        fontFamily: 'var(--font-inter)',
                        color: 'var(--color-foreground-muted)',
                      }}>
                        Start
                      </label>
                    )}
                    <Input
                      type="time"
                      value={ed.startTime || '09:00'}
                      onChange={e => dispatch({
                        type: 'UPDATE_EVENT_DATE',
                        id: ed.id,
                        field: 'startTime',
                        value: e.target.value,
                      })}
                      className="h-9"
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {idx === 0 && (
                      <label style={{
                        fontSize: 'var(--text-xs)',
                        fontWeight: 500,
                        fontFamily: 'var(--font-inter)',
                        color: 'var(--color-foreground-muted)',
                      }}>
                        End
                      </label>
                    )}
                    <Input
                      type="time"
                      value={ed.endTime || '18:00'}
                      onChange={e => dispatch({
                        type: 'UPDATE_EVENT_DATE',
                        id: ed.id,
                        field: 'endTime',
                        value: e.target.value,
                      })}
                      className="h-9"
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {idx === 0 && (
                      <label style={{
                        fontSize: 'var(--text-xs)',
                        fontWeight: 500,
                        fontFamily: 'var(--font-inter)',
                        color: 'var(--color-foreground-muted)',
                      }}>
                        Location
                      </label>
                    )}
                    <Input
                      placeholder="Venue (optional)"
                      value={ed.location}
                      onChange={e => dispatch({
                        type: 'UPDATE_EVENT_DATE',
                        id: ed.id,
                        field: 'location',
                        value: e.target.value,
                      })}
                      className="h-9"
                    />
                  </div>

                  {/* Remove button (hidden for first row if only one) */}
                  <motion.button
                    onClick={() => dispatch({ type: 'REMOVE_EVENT_DATE', id: ed.id })}
                    disabled={state.eventDates.length <= 1}
                    style={{
                      width: '36px',
                      height: '36px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: '8px',
                      border: '0.5px solid var(--color-border)',
                      background: 'transparent',
                      color: state.eventDates.length <= 1
                        ? 'var(--color-foreground-subtle)'
                        : 'var(--color-danger)',
                      cursor: state.eventDates.length <= 1 ? 'not-allowed' : 'pointer',
                      fontSize: '16px',
                    }}
                    whileHover={state.eventDates.length > 1 ? { scale: 1.05 } : {}}
                    whileTap={state.eventDates.length > 1 ? { scale: 0.95 } : {}}
                  >
                    <i className="ti ti-trash" />
                  </motion.button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Add date button */}
          <motion.button
            onClick={() => dispatch({ type: 'ADD_EVENT_DATE' })}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '8px 0',
              borderRadius: '8px',
              border: '0.5px dashed var(--color-border-strong)',
              background: 'transparent',
              fontSize: 'var(--text-sm)',
              fontFamily: 'var(--font-inter)',
              fontWeight: 500,
              color: 'var(--color-primary)',
              cursor: 'pointer',
            }}
            whileHover={{ scale: 1.01, borderColor: 'var(--color-primary)' }}
            whileTap={{ scale: 0.99 }}
          >
            <i className="ti ti-plus" style={{ fontSize: '16px' }} />
            Add another date
          </motion.button>
        </div>
      )}

      {/* ──── RECURRING: Schedule builder ──── */}
      {isRecurring && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          padding: '16px',
          borderRadius: '10px',
          background: 'var(--color-surface)',
          border: '0.5px solid var(--color-border)',
        }}>
          <div style={{
            fontSize: 'var(--text-xs)',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: 'var(--color-foreground-subtle)',
            fontFamily: 'var(--font-inter)',
          }}>
            Recurring schedule &amp; timings
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{
                fontSize: 'var(--text-sm)',
                fontWeight: 500,
                fontFamily: 'var(--font-inter)',
                color: 'var(--color-foreground)',
              }}>
                Frequency
              </label>
              <select
                style={SELECT_STYLE}
                value={state.frequency}
                onChange={e => dispatch({ type: 'SET_FIELD', field: 'frequency', value: e.target.value })}
              >
                <option value="weekly">Weekly</option>
                <option value="biweekly">Bi-weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{
                fontSize: 'var(--text-sm)',
                fontWeight: 500,
                fontFamily: 'var(--font-inter)',
                color: 'var(--color-foreground)',
              }}>
                Start date
              </label>
              <Input
                type="date"
                value={state.startDate}
                onChange={e => dispatch({ type: 'SET_FIELD', field: 'startDate', value: e.target.value })}
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
                End date
              </label>
              <Input
                type="date"
                value={state.endDate}
                onChange={e => dispatch({ type: 'SET_FIELD', field: 'endDate', value: e.target.value })}
                className="h-9"
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{
                fontSize: 'var(--text-sm)',
                fontWeight: 500,
                fontFamily: 'var(--font-inter)',
                color: 'var(--color-foreground)',
              }}>
                Total sessions
              </label>
              <Input
                type="number"
                min="1"
                placeholder="12"
                value={state.totalSessions > 0 ? String(state.totalSessions) : ''}
                onChange={e => dispatch({ type: 'SET_FIELD', field: 'totalSessions', value: parseInt(e.target.value) || 0 })}
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
                Session start time
              </label>
              <Input
                type="time"
                value={state.sessionStartTime}
                onChange={e => dispatch({ type: 'SET_FIELD', field: 'sessionStartTime', value: e.target.value })}
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
                Session end time
              </label>
              <Input
                type="time"
                value={state.sessionEndTime}
                onChange={e => dispatch({ type: 'SET_FIELD', field: 'sessionEndTime', value: e.target.value })}
                className="h-9"
              />
            </div>
          </div>
        </div>
      )}

      {/* Notes */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <label style={{
          fontSize: 'var(--text-sm)',
          fontWeight: 500,
          fontFamily: 'var(--font-inter)',
          color: 'var(--color-foreground)',
        }}>
          Notes
        </label>
        <textarea
          placeholder="Special instructions, timings, preferences…"
          value={state.notes}
          onChange={e => dispatch({ type: 'SET_FIELD', field: 'notes', value: e.target.value })}
          rows={3}
          style={{
            fontFamily: 'var(--font-inter)',
            width: '100%',
            background: 'var(--color-surface-raised)',
            border: '0.5px solid var(--color-border)',
            borderRadius: '8px',
            padding: '10px 12px',
            fontSize: 'var(--text-sm)',
            color: 'var(--color-foreground)',
            outline: 'none',
            resize: 'vertical',
          }}
        />
      </div>
    </div>
  )
}

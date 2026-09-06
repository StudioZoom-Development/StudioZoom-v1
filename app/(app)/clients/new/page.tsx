'use client'

import { useReducer, useState, useCallback, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore } from '@/store/authStore'
import { createBooking } from '@/lib/firebase/queries/clients'
import { getLeadById, updateLead } from '@/lib/firebase/queries/leads'
import { getDraftById, saveBookingDraft, deleteBookingDraft } from '@/lib/firebase/queries/drafts'
import { format } from 'date-fns'
import { BookingDraft, EventType } from '@/types'
import { DraftsModal } from '@/components/shared/DraftsModal'
import { bookingReducer, createInitialState, BookingWizardState } from './bookingReducer'
import StepIndicator from './StepIndicator'
import StepBookingType from './steps/StepBookingType'
import StepClient from './steps/StepClient'
import StepEventDetails from './steps/StepEventDetails'
import StepPackage from './steps/StepPackage'
import StepPayment from './steps/StepPayment'
import StepReview from './steps/StepReview'

const TOTAL_STEPS = 6

// ─── Animation variants ─────────────────────────────────────────────────

const stepVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 80 : -80,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction < 0 ? 80 : -80,
    opacity: 0,
  }),
}

const stepTransition = {
  x: { type: 'spring' as const, stiffness: 350, damping: 30 },
  opacity: { duration: 0.2 },
}

// ─── Page ────────────────────────────────────────────────────────────────

function NewBookingPageContent(): React.JSX.Element {
  const router = useRouter()
  const searchParams = useSearchParams()
  const appUser = useAuthStore(s => s.appUser)

  const [state, dispatch] = useReducer(bookingReducer, undefined, createInitialState)
  const [currentStep, setCurrentStep] = useState(0)
  const [direction, setDirection] = useState(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set())

  // Drafts & Lead Conversion State
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null)
  const [convertingLeadId, setConvertingLeadId] = useState<string | null>(null)
  const [draftsModalOpen, setDraftsModalOpen] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const toastTimerRef = useRef<NodeJS.Timeout | null>(null)

  const showToast = useCallback((msg: string, durationMs: number = 4000) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToastMessage(msg)
    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null)
      toastTimerRef.current = null
    }, durationMs)
  }, [])

  // Clear toast timer on unmount
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current)
      }
    }
  }, [])

  const draftIdParam = searchParams.get('draftId')
  const leadIdParam  = searchParams.get('leadId')

  // Hydrate draft or lead on mount if query params present
  useEffect(() => {
    let isMounted = true

    if (draftIdParam) {
      getDraftById(draftIdParam).then(draft => {
        if (!isMounted) return
        if (draft && draft.state) {
          dispatch({ type: 'HYDRATE_STATE', payload: draft.state })
          setActiveDraftId(draft.draftId)
          if (typeof draft.currentStep === 'number') {
            setCurrentStep(draft.currentStep)
          }
          showToast(`Resumed draft: "${draft.clientName || draft.name}"`)
        }
      })
    } else if (leadIdParam) {
      getLeadById(leadIdParam).then(lead => {
        if (!isMounted) return
        if (lead) {
          setConvertingLeadId(lead.leadId)
          const rawType = (lead.eventType || 'wedding').toLowerCase()
          let eventType: EventType = 'wedding'
          let customEventType = ''
          if (['wedding', 'reception', 'prewedding', 'engagement', 'birthday', 'babyshower', 'puberty', 'corporate', 'schoolevent', 'portrait', 'studio'].includes(rawType)) {
            eventType = (rawType === 'prewedding' ? 'preWedding' : rawType === 'babyshower' ? 'babyShower' : rawType === 'schoolevent' ? 'schoolEvent' : rawType) as EventType
          } else {
            eventType = 'other'
            customEventType = lead.eventType?.replace(/^(other)\s*[—–-]?\s*/i, '') || ''
          }

          dispatch({
            type: 'HYDRATE_STATE',
            payload: {
              bookingType: 'oneTime',
              clientMode: 'new',
              clientName: lead.name || '',
              contact: lead.contact || '',
              email: lead.email || '',
              eventName: `${lead.name}'s Event`,
              eventType,
              customEventType,
              eventDate: lead.tentativeDate || (lead.eventDate ? format(new Date(lead.eventDate), 'yyyy-MM-dd') : undefined),
              notes: lead.notes || '',
              totalAmount: lead.packageAmount || lead.budget || 0,
              packageType: lead.interestedPackage || '',
            }
          })
          setCurrentStep(1)
          showToast(`Loaded details from lead "${lead.name}". Complete the steps to confirm booking.`, 4500)
        }
      })
    }

    return () => {
      isMounted = false
    }
  }, [draftIdParam, leadIdParam, showToast])

  const handleSelectDraft = (draft: BookingDraft) => {
    if (draft.state) {
      dispatch({ type: 'HYDRATE_STATE', payload: draft.state as Partial<BookingWizardState> })
      setActiveDraftId(draft.draftId)
      if (typeof draft.currentStep === 'number') {
        setCurrentStep(draft.currentStep)
      }
      setDraftsModalOpen(false)
      showToast(`Resumed draft: "${draft.clientName || draft.name}"`)
    }
  }

  // ─── Step validation ─────────────────────────────────────────────

  const validateStep = useCallback((step: number): boolean => {
    switch (step) {
      case 0:
        if (!state.bookingType) {
          setError('Please select a booking type')
          return false
        }
        break
      case 1:
        if (!state.clientName.trim()) {
          setError('Please enter the client name')
          return false
        }
        if (!state.contact.trim()) {
          setError('Please enter a contact number')
          return false
        }
        break
      case 2:
        if (!state.eventName.trim()) {
          setError('Please enter an event name')
          return false
        }
        if (state.eventType === 'other' && !state.customEventType.trim()) {
          setError('Please specify the other event type')
          return false
        }
        if (state.bookingType === 'oneTime' && !state.eventDate) {
          setError('Please select an event date')
          return false
        }
        if (state.bookingType === 'multiDate' && state.eventDates.length === 0) {
          setError('Please add at least one event date')
          return false
        }
        break
      case 3:
        // Package step — allow ₹0 (will save as lead or custom)
        break
      case 4:
        // Payment step — always valid (no advance = yet to be paid)
        break
    }
    setError('')
    return true
  }, [state])

  // ─── Navigation ──────────────────────────────────────────────────

  const goToStep = useCallback((step: number) => {
    setDirection(step > currentStep ? 1 : -1)
    setCurrentStep(step)
    setError('')
  }, [currentStep])

  const handleNext = useCallback(() => {
    if (!validateStep(currentStep)) return
    setCompletedSteps(prev => new Set(prev).add(currentStep))
    if (currentStep < TOTAL_STEPS - 1) {
      setDirection(1)
      setCurrentStep(prev => prev + 1)
      setError('')
    }
  }, [currentStep, validateStep])

  const handleBack = useCallback(() => {
    if (currentStep > 0) {
      setDirection(-1)
      setCurrentStep(prev => prev - 1)
      setError('')
    }
  }, [currentStep])

  // ─── Submit ──────────────────────────────────────────────────────

  const handleSubmit = useCallback(async (asLead: boolean = false) => {
    setSaving(true)
    setError('')

    try {
      if (asLead) {
        // Save directly to dedicated booking drafts
        const savedId = await saveBookingDraft(state, currentStep, activeDraftId || undefined, appUser?.uid)
        setActiveDraftId(savedId)
        showToast('Draft saved successfully! You can resume it anytime.')
        return
      }

      const eventDate = state.bookingType === 'multiDate'
        ? new Date(state.eventDates[0]?.date || new Date())
        : state.bookingType === 'recurring'
        ? new Date(state.startDate || new Date())
        : new Date(state.eventDate)

      const bookingPayload = {
        eventName:       state.eventName.trim() || state.clientName.trim(),
        eventType:       state.eventType,
        customEventType: state.eventType === 'other' ? state.customEventType.trim() : undefined,
        eventDate,
        startTime:       state.startTime,
        endTime:         state.endTime,
        location:        state.location.trim(),
        clientName:      state.clientName.trim(),
        contact:         state.contact.trim(),
        email:           state.email.trim(),
        notes:           state.notes.trim(),
        bookingType:     state.bookingType || 'oneTime',
        eventDates:      state.bookingType === 'multiDate' ? state.eventDates.map(ed => ({
          id:        ed.id,
          label:     ed.label,
          date:      ed.date,
          location:  ed.location || '',
          startTime: ed.startTime || '09:00',
          endTime:   ed.endTime || '18:00',
        })) : [],
        recurringSchedule: state.bookingType === 'recurring' ? {
          frequency:        state.frequency,
          startDate:        state.startDate,
          endDate:          state.endDate,
          totalSessions:    state.totalSessions,
          perSessionRate:   state.perSessionRate,
          paymentType:      state.recurringPaymentType,
          sessionStartTime: state.sessionStartTime,
          sessionEndTime:   state.sessionEndTime,
        } : undefined,
        packageType:   state.packageType || 'Custom',
        totalAmount:   state.totalAmount,
        advanceAmount: state.advanceAmount,
        advanceDate:   new Date(state.advanceDate),
        paymentMethod: state.paymentMethod,
        status:        'booked' as 'booked' | 'inquiry',
        createdBy:     appUser?.uid || 'system',
      }

      console.group('📋 [CreateBooking] Submitting Confirmed Booking')
      console.log('Wizard Form State:', state)
      console.log('Final Data Payload:', bookingPayload)
      console.groupEnd()

      const newId = await createBooking(bookingPayload)

      // Clean up draft if active
      if (activeDraftId) {
        await deleteBookingDraft(activeDraftId)
      }

      // Mark lead as converted if converting from a lead
      if (convertingLeadId) {
        await updateLead(convertingLeadId, {
          status: 'won',
          convertedClientId: newId,
        })
      }

      router.push(`/clients/${newId}`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create booking'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }, [state, currentStep, activeDraftId, convertingLeadId, appUser, router, showToast])

  const handleSaveDraft = useCallback(() => {
    handleSubmit(true)
  }, [handleSubmit])

  // ─── Render step content ─────────────────────────────────────────

  function renderStep(): React.JSX.Element {
    switch (currentStep) {
      case 0:
        return <StepBookingType selectedType={state.bookingType} dispatch={dispatch} />
      case 1:
        return <StepClient state={state} dispatch={dispatch} />
      case 2:
        return <StepEventDetails state={state} dispatch={dispatch} />
      case 3:
        return <StepPackage state={state} dispatch={dispatch} />
      case 4:
        return <StepPayment state={state} dispatch={dispatch} />
      case 5:
        return (
          <StepReview
            state={state}
            onGoToStep={goToStep}
            onSubmit={handleSubmit}
            isSaving={saving}
          />
        )
      default:
        return <div />
    }
  }

  // ─── Layout ──────────────────────────────────────────────────────

  return (
    <div style={{
      fontFamily: 'var(--font-inter)',
      display: 'flex',
      flexDirection: 'column',
      gap: '0',
      height: '100%',
      minHeight: 'calc(100vh - 56px)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingBottom: '20px',
        borderBottom: '0.5px solid var(--color-border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span
            onClick={() => router.push('/clients')}
            style={{
              cursor: 'pointer',
              color: 'var(--color-foreground-muted)',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <i className="ti ti-arrow-left" style={{ fontSize: '20px' }} />
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={{
              fontSize: 'var(--text-2xl)',
              fontWeight: 700,
              letterSpacing: '-0.02em',
              lineHeight: 1.2,
              color: 'var(--color-foreground)',
            }}>
              New booking
            </div>
            <div style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--color-foreground-muted)',
            }}>
              Step {currentStep + 1} of {TOTAL_STEPS}
            </div>
          </div>
        </div>

        {/* Action Buttons: Drafts Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            onClick={() => setDraftsModalOpen(true)}
            style={{
              fontFamily: 'var(--font-inter)',
              height: '36px',
              padding: '0 14px',
              borderRadius: '8px',
              border: '0.5px solid var(--color-border)',
              background: 'var(--color-surface-raised)',
              fontSize: 'var(--text-sm)',
              fontWeight: 500,
              color: 'var(--color-foreground)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'background 0.15s ease',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-overlay)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--color-surface-raised)')}
          >
            <i className="ti ti-files" style={{ fontSize: '16px', color: 'var(--color-primary)' }} />
            <span>Saved drafts</span>
          </button>
        </div>
      </div>

      {/* Toast Banner */}
      {toastMessage && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            margin: '12px 0',
            padding: '10px 16px',
            borderRadius: '8px',
            background: 'var(--color-primary-muted)',
            border: '0.5px solid var(--color-primary)',
            color: 'var(--color-primary)',
            fontSize: 'var(--text-sm)',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <i className="ti ti-check" style={{ fontSize: '16px' }} />
          <span>{toastMessage}</span>
        </motion.div>
      )}

      {/* Body: Sidebar + Content */}
      <div style={{
        display: 'flex',
        flex: 1,
        gap: '0',
        paddingTop: '0',
      }}>
        {/* Step Indicator */}
        <div style={{
          borderRight: '0.5px solid var(--color-border)',
        }}>
          <StepIndicator
            currentStep={currentStep}
            onStepClick={goToStep}
            onSaveDraft={handleSaveDraft}
            isSaving={saving}
            completedSteps={completedSteps}
          />
        </div>

        {/* Content area */}
        <div style={{
          flex: 1,
          padding: '24px 32px',
          maxWidth: '720px',
          overflow: 'hidden',
          position: 'relative',
        }}>
          {/* Error banner */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--color-danger)',
                background: 'var(--color-danger-muted)',
                borderRadius: '8px',
                padding: '10px 14px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <i className="ti ti-alert-circle" style={{ fontSize: '16px', flexShrink: 0 }} />
              {error}
            </motion.div>
          )}

          {/* Step content with AnimatePresence */}
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={currentStep}
              custom={direction}
              variants={stepVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={stepTransition}
            >
              {renderStep()}
            </motion.div>
          </AnimatePresence>

          {/* Footer nav (not shown on Review step — it has its own buttons) */}
          {currentStep < 5 && (
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingTop: '24px',
              marginTop: '24px',
              borderTop: '0.5px solid var(--color-border)',
            }}>
              <div>
                {currentStep > 0 && (
                  <motion.button
                    onClick={handleBack}
                    style={{
                      fontFamily: 'var(--font-inter)',
                      height: '38px',
                      padding: '0 16px',
                      borderRadius: '8px',
                      border: '0.5px solid var(--color-border)',
                      background: 'transparent',
                      fontSize: 'var(--text-sm)',
                      fontWeight: 500,
                      color: 'var(--color-foreground)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <i className="ti ti-arrow-left" style={{ fontSize: '16px' }} />
                    Back
                  </motion.button>
                )}
              </div>

              <motion.button
                onClick={handleNext}
                style={{
                  fontFamily: 'var(--font-inter)',
                  height: '38px',
                  padding: '0 20px',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'var(--color-primary)',
                  fontSize: 'var(--text-sm)',
                  fontWeight: 600,
                  color: '#ffffff',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                Continue
                <i className="ti ti-arrow-right" style={{ fontSize: '16px' }} />
              </motion.button>
            </div>
          )}
        </div>
      </div>

      {/* Saved Drafts Modal */}
      <DraftsModal
        open={draftsModalOpen}
        onClose={() => setDraftsModalOpen(false)}
        onSelectDraft={handleSelectDraft}
      />
    </div>
  )
}

export default function NewBookingPage(): React.JSX.Element {
  return (
    <Suspense fallback={null}>
      <NewBookingPageContent />
    </Suspense>
  )
}

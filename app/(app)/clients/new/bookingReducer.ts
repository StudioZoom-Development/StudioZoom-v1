import { BookingType, EventType } from '@/types'

// ─── State ───────────────────────────────────────────────────────────────

export interface EventDateRow {
  id:        string
  label:     string
  date:      string   // YYYY-MM-DD
  location:  string
  startTime?: string  // HH:MM
  endTime?:   string  // HH:MM
}

export interface BookingWizardState {
  // Step 1 — Booking Type
  bookingType: BookingType | null

  // Step 2 — Client
  clientMode:       'new' | 'existing'
  existingClientId: string | null
  clientName:       string
  contact:          string
  email:            string

  // Step 3 — Event Details
  eventName:       string
  eventType:       EventType
  customEventType: string
  location:        string
  notes:           string
  // One-time
  eventDate: string   // YYYY-MM-DD
  startTime: string   // HH:MM
  endTime:   string   // HH:MM
  // Multi-date
  eventDates: EventDateRow[]
  // Recurring
  frequency:            'weekly' | 'biweekly' | 'monthly'
  startDate:            string
  endDate:              string
  totalSessions:        number
  sessionStartTime:     string
  sessionEndTime:       string
  recurringPaymentType: 'perSession' | 'custom'

  // Step 4 — Package
  selectedPackageId: string
  packageType:       string
  totalAmount:       number
  perSessionRate:    number

  // Step 5 — Payment
  advanceAmount: number
  advanceDate:   string
  paymentMethod: 'gpay' | 'cash' | 'bankTransfer' | 'cheque'
}

// ─── Actions ─────────────────────────────────────────────────────────────

export type BookingAction =
  | { type: 'SET_BOOKING_TYPE'; payload: BookingType }
  | { type: 'SET_CLIENT_MODE'; payload: 'new' | 'existing' }
  | { type: 'SET_EXISTING_CLIENT'; payload: { clientId: string; name: string; contact: string; email: string } }
  | { type: 'SET_FIELD'; field: keyof BookingWizardState; value: string | number }
  | { type: 'SET_EVENT_TYPE'; payload: EventType }
  | { type: 'ADD_EVENT_DATE' }
  | { type: 'REMOVE_EVENT_DATE'; id: string }
  | { type: 'UPDATE_EVENT_DATE'; id: string; field: keyof EventDateRow; value: string }
  | { type: 'SET_PACKAGE'; payload: { id: string; name: string; price: number } }
  | { type: 'SET_PAYMENT_METHOD'; payload: 'gpay' | 'cash' | 'bankTransfer' | 'cheque' }
  | { type: 'HYDRATE_STATE'; payload: Partial<BookingWizardState> }
  | { type: 'RESET' }

// ─── Helpers ─────────────────────────────────────────────────────────────

function generateId(): string {
  return Math.random().toString(36).substring(2, 10)
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ─── Initial State ───────────────────────────────────────────────────────

export function createInitialState(): BookingWizardState {
  const today = todayStr()
  return {
    bookingType:          null,
    clientMode:           'new',
    existingClientId:     null,
    clientName:           '',
    contact:              '',
    email:                '',
    eventName:            '',
    eventType:            'wedding',
    customEventType:      '',
    location:             '',
    notes:                '',
    eventDate:            today,
    startTime:            '09:00',
    endTime:              '18:00',
    eventDates:           [{ id: generateId(), label: 'Day 1', date: today, location: '', startTime: '09:00', endTime: '18:00' }],
    frequency:            'monthly',
    startDate:            today,
    endDate:              today,
    totalSessions:        1,
    sessionStartTime:     '09:00',
    sessionEndTime:       '18:00',
    recurringPaymentType: 'perSession',
    selectedPackageId:    '',
    packageType:          '',
    totalAmount:          0,
    perSessionRate:       0,
    advanceAmount:        0,
    advanceDate:          today,
    paymentMethod:        'gpay',
  }
}

// ─── Reducer ─────────────────────────────────────────────────────────────

export function bookingReducer(
  state: BookingWizardState,
  action: BookingAction
): BookingWizardState {
  switch (action.type) {
    case 'SET_BOOKING_TYPE':
      return { ...state, bookingType: action.payload }

    case 'SET_CLIENT_MODE':
      return {
        ...state,
        clientMode: action.payload,
        existingClientId: action.payload === 'new' ? null : state.existingClientId,
      }

    case 'SET_EXISTING_CLIENT':
      return {
        ...state,
        clientMode:       'existing',
        existingClientId: action.payload.clientId,
        clientName:       action.payload.name,
        contact:          action.payload.contact,
        email:            action.payload.email,
      }

    case 'SET_FIELD':
      return { ...state, [action.field]: action.value }

    case 'SET_EVENT_TYPE':
      return { ...state, eventType: action.payload }

    case 'ADD_EVENT_DATE':
      return {
        ...state,
        eventDates: [
          ...state.eventDates,
          { id: generateId(), label: `Day ${state.eventDates.length + 1}`, date: todayStr(), location: '', startTime: '09:00', endTime: '18:00' },
        ],
      }

    case 'REMOVE_EVENT_DATE':
      return {
        ...state,
        eventDates: state.eventDates.filter(d => d.id !== action.id),
      }

    case 'UPDATE_EVENT_DATE':
      return {
        ...state,
        eventDates: state.eventDates.map(d =>
          d.id === action.id ? { ...d, [action.field]: action.value } : d
        ),
      }

    case 'SET_PACKAGE':
      return {
        ...state,
        selectedPackageId: action.payload.id,
        packageType:       action.payload.name,
        totalAmount:       action.payload.price,
      }

    case 'SET_PAYMENT_METHOD':
      return { ...state, paymentMethod: action.payload }

    case 'HYDRATE_STATE':
      return {
        ...state,
        ...action.payload,
      }

    case 'RESET':
      return createInitialState()

    default:
      return state
  }
}

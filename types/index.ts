// ─── USER ─────────────────────────────────────────────────────────────────
export type UserRole = 'admin' | 'manager' | 'staff'

export interface AppUser {
  uid: string
  name: string
  email: string
  role: UserRole
  isActive: boolean
  photoURL?: string
  createdAt: Date
}

// ─── CLIENT ───────────────────────────────────────────────────────────────
export type EventType =
  | 'wedding' | 'reception' | 'preWedding' | 'engagement'
  | 'birthday' | 'babyShower' | 'puberty'
  | 'corporate' | 'schoolEvent'
  | 'portrait' | 'studio' | 'other'

export type BookingType = 'oneTime' | 'multiDate' | 'recurring'

export interface EventDateEntry {
  id:         string
  date:       Date
  label:      string        // e.g. "Engagement", "Wedding Day 1", "Reception"
  location?:  string        // optional per-date location override
  startTime?: string        // e.g. "09:00"
  endTime?:   string        // e.g. "18:00"
}

export interface RecurringSchedule {
  frequency:         'weekly' | 'biweekly' | 'monthly'
  startDate:         Date
  endDate:           Date
  totalSessions:     number
  perSessionRate:    number
  paymentType?:      'perSession' | 'custom'
  sessionStartTime?: string
  sessionEndTime?:   string
}

export type PaymentStatus = 'unpaid' | 'partial' | 'paid' | 'overdue'
export type ClientStatus  = 'inquiry' | 'booked'

export interface Client {
  clientId:       string
  projectId?:     string
  name:           string
  contact:        string
  email:          string
  eventName:      string
  eventType:      EventType
  customEventType?: string
  eventDate:      Date
  startTime?:     string
  endTime?:       string
  location:       string
  packageType:    string
  totalAmount:    number
  balanceDue:     number
  paymentStatus:  PaymentStatus
  invoiceNumber:  string
  status:         ClientStatus
  stage?:         ProjectStage
  notes?:              string
  isDeleted?:          boolean
  staffUids?:          string[]
  assignedStaff?:      string[]
  teamInitials?:       string[]
  freelancerIds?:      string[]
  bookingType?:        BookingType
  eventDates?:         EventDateEntry[]
  recurringSchedule?:  RecurringSchedule
  bookingGroupId?:     string
  projectIds?:         string[]          // IDs of all sibling session projects for recurring bookings
  lastRemindedAt?:     Date
  reminderCount?:      number
  createdBy:           string
  createdAt:           Date
  updatedAt:           Date
}

export interface BankAccount {
  bankAccountId:       string
  bankName:            string              // e.g. "HDFC Bank", "State Bank of India (SBI)"
  accountHolder:       string              // e.g. "Studio Zoom (Owner)", "Father's Account"
  nickname:            string              // e.g. "Studio HDFC (Primary)", "Father's SBI"
  accountNumberMasked: string              // e.g. "•••• 4821" (last 4 digits)
  upiId?:              string              // e.g. "studiozoom@hdfcbank"
  ifsc?:               string              // e.g. "HDFC0001234"
  isDefault?:          boolean             // Auto-selected by default in payment modals
  isActive?:           boolean             // Set to false if account is retired
  openingBalance?:     number              // Baseline starting balance for reconciliation
  createdAt?:          Date
  updatedAt?:          Date
  isDeleted?:          boolean
}

export interface Payment {
  paymentId:       string
  instalment:      '1st' | '2nd' | '3rd' | string
  amount:          number
  date:            Date
  method:          'cash' | 'gpay' | 'bankTransfer' | 'cheque'
  transactionId?:  string
  bankAccountId?:  string
  bankAccountName?: string
  recordedBy:      string
  recordedByName?: string
}

// ─── PROJECT ──────────────────────────────────────────────────────────────
export type ProjectStage =
  | 'booked' | 'planning' | 'preProduction'
  | 'eventDay' | 'postProduction' | 'delivered'

export type ProjectStatus = 'upcoming' | 'ongoing' | 'completed' | 'cancelled'

export interface FreelancerProjectAssignment {
  role:     string
  days:     number
  dayRate:  number
}

export interface Project {
  projectId:              string
  clientId:               string
  eventDate:              Date              // DENORMALIZED from client
  eventName:              string            // DENORMALIZED from client
  clientName:             string            // DENORMALIZED from client
  eventType:              EventType         // DENORMALIZED from client
  customEventType?:       string            // DENORMALIZED from client
  startTime?:             string            // DENORMALIZED from client
  endTime?:               string            // DENORMALIZED from client
  stage:                  ProjectStage
  status:                 ProjectStatus
  callTime?:              string
  engagementDate?:        Date
  preWeddingDate?:        Date
  staffUids:              string[]          // DENORMALIZED for array-contains queries
  freelancerIds:          string[]
  freelancerAssignments?: Record<string, FreelancerProjectAssignment>
  freelancerRates?:       Record<string, number>
  milestones:             Partial<Record<MilestoneKey, Date>>
  photoMilestones?:       Record<string, boolean>
  videoMilestones?:       Record<string, boolean>
  postProdRequirements?:  PostProdRequirements      // Configured at Booked stage
  postProduction?:        PostProductionData         // Populated at Post-Production entry
  override?:              { by: string; reason: string; at: Date }
  bookingType?:           BookingType
  bookingGroupId?:        string             // links sibling projects in multi-date bookings
  sessionIndex?:          number             // 1-indexed session number for recurring discrete sessions
  totalSessions?:         number             // total session count for recurring discrete contract
  sessionRate?:           number             // per-session billing rate
  dateLabel?:             string             // "Engagement", "Reception", etc.
  location?:              string
  eventDates?:            EventDateEntry[]
  recurringSchedule?:     RecurringSchedule
  sessionMilestones?:     Record<string, SessionMilestoneState>
  stageCompletedAt?:      Partial<Record<ProjectStage, Date>>
  stageGates?:            Record<string, Record<string, boolean>>
  isDeleted?:             boolean
  createdBy:              string
  createdAt:              Date
  updatedAt:              Date
}

// ─── POST-PRODUCTION REQUIREMENTS (configured at Booked stage) ───────
export interface PostProdServiceRequirement {
  required: boolean
  clientReviewRequired: boolean
}

export interface PostProdRequirements {
  photography: PostProdServiceRequirement
  album: PostProdServiceRequirement
  videoHighlights: PostProdServiceRequirement
  fullVideo: PostProdServiceRequirement
}

// ─── POST-PRODUCTION TRACK STATUS & DATA ─────────────────────────────
export type PostProdTrackStatus = 'notStarted' | 'inProgress' | 'completed'

export type PostProdStageStatus =
  | 'pending'         // Not yet started
  | 'inProgress'      // Staff actively working
  | 'completed'       // Work finished
  | 'waitingClient'   // Sent for client review
  | 'approved'        // Client approved
  | 'notApproved'     // Client rejected → goes back
  | 'notRequired'     // Client review not required (auto-pass)

export interface ClientReviewEntry {
  decision: 'approved' | 'notApproved'
  reviewedAt: Date
  reviewedBy: string
  notes?: string
}

export interface PostProdStageData {
  status: PostProdStageStatus
  startDate?: Date          // Auto-set on first transition to inProgress
  dueDate?: Date            // Set by admin during Post-Prod setup
}

export interface PostProdTrackAssignment {
  staffUid: string
  staffName: string
  freelancerId?: string
  freelancerName?: string
}

export interface PostProdClientReview {
  status: PostProdStageStatus  // waitingClient | approved | notApproved | notRequired
  required: boolean            // From Booked stage config
  history: ClientReviewEntry[]
}

// ── Photo Track ──
export interface PostProdPhotoTrack {
  status: PostProdTrackStatus
  assignment: PostProdTrackAssignment
  selectedPhotos: boolean
  rawDelivered: boolean
  designing: PostProdStageData
  clientReview: PostProdClientReview
}

// ── Album Track ──
export interface PostProdAlbumTrack {
  status: PostProdTrackStatus
  assignment: PostProdTrackAssignment
  albumDesigning: PostProdStageData
  clientReview: PostProdClientReview
  creatingAlbum: PostProdStageData
  delivered: boolean
}

// ── Video Highlights Track ──
export interface PostProdVideoTrack {
  status: PostProdTrackStatus
  assignment: PostProdTrackAssignment
  selectedVideo: boolean
  rawVideoDelivered: boolean
  highlights: PostProdStageData
  clientReview: PostProdClientReview
}

// ── Full Video Track ──
export interface PostProdFullVideoTrack {
  status: PostProdTrackStatus
  assignment: PostProdTrackAssignment
  fullVideoEditing: PostProdStageData
  clientReview: PostProdClientReview
  delivered: boolean
}

// ── Post-Production Container ──
export interface PostProductionData {
  isConfigured: boolean       // false until admin saves Post-Prod setup
  configuredAt?: Date
  configuredBy?: string
  photoTrack?: PostProdPhotoTrack         // Only present if photography required
  albumTrack?: PostProdAlbumTrack         // Only present if album required
  videoTrack?: PostProdVideoTrack         // Only present if videoHighlights required
  fullVideoTrack?: PostProdFullVideoTrack // Only present if fullVideo required
}
export interface SessionMilestoneState {
  photoMilestones?: Record<string, boolean>
  videoMilestones?: Record<string, boolean>
  delivered?: boolean
  deliveredAt?: Date
  stageCompletedAt?: Partial<Record<ProjectStage, Date>>
}

export type MilestoneKey =
  | 'depositPaid' | 'rawPhotosDelivered' | 'rawVideosDelivered'
  | 'selectedPhotos' | 'selectedVideo' | 'photosDesigning'
  | 'editingHighlights' | 'clientReviewPhoto' | 'clientReviewVideo'
  | 'fullVideoEditing' | 'albumCreated' | 'delivered'

// ─── STAFF ASSIGNMENT — key collection for conflict detection ─────────────
export type AssignmentRole =
  | 'photographer' | 'videographer' | 'assistant'
  | 'editor' | 'designer' | 'drone'

export interface StaffAssignment {
  assignmentId:  string
  projectId:     string
  clientId:      string
  staffUid:      string
  staffName?:    string
  eventDate:     string   // ← "YYYY-MM-DD" STRING, not Timestamp — required for equality queries
  role:          AssignmentRole
  status:        'confirmed' | 'tentative'
  createdAt:     Date
}

// ─── WORK ITEMS ───────────────────────────────────────────────────────────
export type WorkItemType =
  | 'photography' | 'videography' | 'photoEditing'
  | 'videoEditing' | 'albumDesign' | 'highlights' | 'fullFilm'
  | 'photoDesigning' | 'albumDesigning' | 'albumCreating'
  | 'highlightsEditing' | 'fullVideoEditing'

export type PostProdTrackKey = 'photoTrack' | 'albumTrack' | 'videoTrack' | 'fullVideoTrack'
export type PostProdStageKey = 'designing' | 'albumDesigning' | 'creatingAlbum' | 'highlights' | 'fullVideoEditing'

export type WorkItemStatus = 'pending' | 'todo' | 'inProgress' | 'review' | 'done'
export type WorkTrack      = 'photo' | 'video'

export type WorkItemPriority = 'low' | 'medium' | 'high'

export interface WorkItem {
  workItemId:       string
  projectId:        string
  clientId:         string
  eventDate:        Date
  eventName:        string           // DENORMALIZED
  clientName?:      string           // DENORMALIZED
  type:             WorkItemType
  track:            WorkTrack
  assignedToUid:    string
  assignedToName:   string           // DENORMALIZED
  isFreelancer?:    boolean
  status:           WorkItemStatus
  priority?:        WorkItemPriority
  estimatedHours?:  number
  progressPercent?: number           // 0–100
  startDate?:       Date
  dueDate?:         Date
  notes?:           string
  postProdTrackKey?: PostProdTrackKey   // Links to source track
  postProdStageKey?: PostProdStageKey   // Links to stage within track
  isDeleted?:       boolean
  createdBy:        string
  createdAt:        Date
  updatedAt?:       Date
}

// ─── EQUIPMENT ────────────────────────────────────────────────────────────
export type EquipmentCategory =
  | 'cameraBody' | 'camera' | 'lens' | 'camcorder' | 'drone' | 'flash'
  | 'gimbal' | 'light' | 'tripod' | 'backdrop' | 'sdCard' | 'memoryCard'
  | 'battery' | 'charger' | 'wire' | 'other'
  | (string & {})

export type EquipmentCondition = 'excellent' | 'good' | 'canUse' | 'service' | 'damaged'
export type EquipmentStatus    = 'available' | 'out' | 'service' | 'maintenance' | 'repair' | 'damaged' | 'lost' | 'retired'

export interface Equipment {
  itemId:               string
  itemCode:             string      // "CAM-001", "LEN-002", "EQ-001", etc.
  name:                 string
  category:             EquipmentCategory
  brand:                string
  model:                string
  serialNumber:         string
  purchaseDate?:        Date
  purchasePrice:        number
  vendor?:              string
  warrantyExpiry?:      Date
  condition:            EquipmentCondition
  location:             string
  photoUrl?:            string
  status:               EquipmentStatus    // CACHED — source of truth is checkouts
  assignedToUid?:       string             // CACHED current holder
  assignedToName?:      string             // CACHED current holder name
  currentCheckoutId?:   string             // CACHED current checkout doc id
  dueBackDate?:         Date
  lastUsedDate?:        Date
  nextMaintenanceDate?: Date
  notes?:               string
  qrCode?:              string
  barcode?:             string
  kitId?:               string
  parentItemId?:        string
  retiredReason?:       string
  retiredAt?:           Date
  isDeleted?:           boolean
  createdAt:            Date
  updatedAt?:           Date
}

export interface EquipmentKit {
  kitId:        string
  name:         string
  description?: string
  itemIds:      string[]
  isDeleted?:   boolean
  createdAt:    Date
  updatedAt?:   Date
}

export interface EquipmentStatusLog {
  logId:        string
  itemId:       string
  fromStatus:   EquipmentStatus
  toStatus:     EquipmentStatus
  changedByUid: string
  changedByName:string
  reason?:      string
  timestamp:    Date
}

// ─── CHECKOUTS — key collection for equipment conflict detection ──────────
export type CheckoutStatus = 'out' | 'returned' | 'overdue'

export interface Checkout {
  checkoutId:       string
  itemId:           string
  itemCode:         string
  itemName:         string           // DENORMALIZED
  staffUid:         string
  staffName:        string           // DENORMALIZED
  projectId:        string
  eventName:        string           // DENORMALIZED
  eventDate:        Date
  checkedOutAt:     Date
  checkedOutBy:     string
  dueBack:          Date
  checkedInAt?:     Date             // null while still out
  returnCondition?: string
  notes?:           string
  status:           CheckoutStatus
}

// ─── ATTENDANCE ───────────────────────────────────────────────────────────
export type AttendanceStatus =
  | 'P' | 'Late' | 'HalfDay' | 'AB' | 'WO' | 'Permission'

export interface AttendanceRecord {
  attendanceId:  string
  staffUid:      string
  year:          number
  month:         number           // 1–12
  dailyStatus:   Record<string, AttendanceStatus>
  dailyHours:    Record<string, number>    // minutes worked per day
  summary: {
    present:      number
    late:         number
    halfDay:      number
    absent:       number
    weekOff:      number
    totalMinutes: number
  }
}

// ─── TIME LOGS ────────────────────────────────────────────────────────────
export interface TimeLog {
  logId:             string
  staffUid:          string
  date:              string         // "YYYY-MM-DD"
  checkInAt:         Date
  checkOutAt?:       Date           // null = open session
  workedMinutes?:    number
  standardMinutes:   540            // 9 hours — constant
  variance?:         number         // positive = overtime, negative = shortfall
  status:            'open' | 'closed' | 'flagged' | 'corrected'
  overrideStatus?:   'In' | 'Late' | 'Not in'
  isCorrected?:      boolean
  originalCheckInAt?: Date
  originalCheckOutAt?: Date
  correctedBy?:      string
  correctionReason?: string
  correctedAt?:      Date
}

export interface TimeLogCorrection {
  correctionId:     string
  logId?:           string
  staffUid:         string
  date:             string          // "YYYY-MM-DD"
  oldCheckIn:       Date | null
  oldCheckOut:      Date | null
  newCheckIn:       Date
  newCheckOut:      Date
  reason:           string
  correctedBy:      string          // Admin/Manager UID
  correctedByName?: string
  correctedAt:      Date
}

// ─── LEAVE REQUESTS ───────────────────────────────────────────────────────────
export type LeaveRequestType   = 'leave' | 'permission'
export type LeaveRequestStatus = 'pending' | 'approved' | 'rejected'

export interface LeaveRequest {
  requestId:   string
  staffUid:    string
  date:        string               // "YYYY-MM-DD"
  type:        LeaveRequestType
  status:      LeaveRequestStatus
  reason?:     string
  createdAt:   Date
  reviewedBy?: string
  reviewedAt?: Date
}

// ─── SALARY ───────────────────────────────────────────────────────────────
export interface SalaryAdvanceEntry {
  amount: number
  date?: string
}

export interface Salary {
  salaryId:       string
  staffUid:       string
  year:           number
  month:          number
  baseSalary?:    number
  advance1?:      SalaryAdvanceEntry
  advance2?:      SalaryAdvanceEntry
  advance3?:      SalaryAdvanceEntry
  totalAdvances?: number
  salaryPending?: number
  createdAt?:     Date
  updatedAt?:     Date
}

export interface Payslip {
  payslipId:          string
  staffUid:           string
  staffName:          string
  month:              number
  year:               number
  baseSalary:         number
  totalAdvances:      number
  netPay:             number
  attendanceSummary:  AttendanceRecord['summary']
  generatedAt:        Date
  generatedBy:        string
}

// ─── FREELANCER ───────────────────────────────────────────────────────────
export interface Freelancer {
  freelancerId: string
  name:         string
  skill:        'photographer' | 'videographer' | 'editor' | 'designer' | 'other'
  dayRate:      number
  contact:      string
  notes?:       string
  isActive:     boolean
  isDeleted?:   boolean
  createdAt?:   Date
  updatedAt?:   Date
}

export interface FreelancerPayout {
  payoutId:        string
  freelancerId:    string
  freelancerName:  string
  projectId:       string
  eventName?:      string
  days:            number
  dayRate:         number
  amount:          number
  paidDate:        Date
  method?:         'cash' | 'gpay' | 'bankTransfer'
  postedExpenseId: string    // links to auto-created expense doc
  recordedBy?:     string
  createdAt?:      Date
}

// ─── EXPENSES ─────────────────────────────────────────────────────────────
export type ExpenseCategory =
  | 'equipment'
  | 'travel'
  | 'freelancer'
  | 'studioRent'
  | 'rent'
  | 'utilities'
  | 'propsSets'
  | 'props'
  | 'marketing'
  | 'misc'
  | 'salaries'
  | string

export interface CustomExpenseCategory {
  id: string
  key: string
  label: string
  icon: string
  defaultBudget?: number
  isDeleted?: boolean
  createdAt?: Date
}

export interface Expense {
  expenseId:      string
  code?:          string
  date:           Date
  category:       ExpenseCategory
  amount:         number
  method:         string
  vendor?:        string
  note?:          string
  description?:   string
  projectId?:     string
  projectName?:   string
  source:         'manual' | 'freelancerPayout' | 'salary' | 'autoPayout' | 'payable' | string
  payableId?:     string
  hrmsPayoutId?:  string
  gstAmount?:     number
  gstRate?:       number
  vendorGstin?:   string
  isGstClaimable?: boolean
  createdBy:      string
  createdAt:      Date
  isDeleted?:     boolean
}

export interface Budget {
  budgetId:       string
  category:       ExpenseCategory
  period:         'monthly' | 'annual'
  year:           number
  month?:         number
  budgetedAmount: number
}

export interface AccountPayable {
  payableId:      string
  vendorName:     string
  vendorGstin?:   string
  category:       ExpenseCategory | string
  billNumber?:    string
  amount:         number
  gstAmount?:     number
  gstRate?:       number
  dueDate:        Date
  status:         'pending' | 'overdue' | 'paid'
  note?:          string
  projectId?:     string
  projectName?:   string
  paidDate?:      Date
  paymentMethod?: string
  expenseId?:     string
  createdAt:      Date
  isDeleted?:     boolean
}

export interface CashOpeningBalances {
  cashInBank:     number
  cashInUPI:      number
  cashInHand:     number
  asOfDate:       Date
  updatedAt?:     Date
  updatedBy?:     string
}

// ─── QUOTATION & INVOICE ──────────────────────────────────────────────────
export interface LineItem {
  description: string
  qty:         number
  rate:        number
  amount:      number
}

export type QuotationStatus =
  | 'draft' | 'sent' | 'accepted' | 'rejected' | 'converted'

export interface Quotation {
  quotationId:        string
  quotationNumber:    string          // ZS-Q-2026-001
  clientId?:          string
  clientName:         string
  contact:            string
  eventType:          string
  eventDate?:         Date
  validityDate:       Date
  lineItems:          LineItem[]
  subtotal:           number
  gstEnabled:         boolean
  cgst?:              number
  sgst?:              number
  grandTotal:         number
  status:             QuotationStatus
  termsAndConditions: string
  createdBy:          string
  createdAt:          Date
}

export type InvoiceStatus =
  | 'draft' | 'sent' | 'partiallyPaid' | 'paid' | 'overdue'

export interface Invoice {
  invoiceId:     string
  invoiceNumber: string              // ZS-INV-2026-001
  clientId:      string
  projectId:     string
  invoiceDate:   Date
  dueDate:       Date
  lineItems:     LineItem[]
  totalAmount:   number
  amountPaid:    number
  balanceDue:    number
  gstEnabled:    boolean
  cgst?:         number
  sgst?:         number
  status:        InvoiceStatus
  createdBy:     string
  createdAt:     Date
}

// ─── LEADS ────────────────────────────────────────────────────────────────
export type LeadStatus = 'new' | 'contacted' | 'quoted' | 'won' | 'lost' | 'inquiry'

export interface Lead {
  leadId:         string
  name:           string
  contact?:       string
  email?:         string
  eventType:      EventType | string
  eventDate?:     Date
  tentativeDate?: string
  location?:      string
  budget?:        number
  interestedPackage?: string
  packageAmount?: number
  source?:        string
  status:         LeadStatus | string
  notes?:         string
  convertedClientId?: string
  isDeleted?:     boolean
  createdBy?:     string
  createdAt?:     Date
  updatedAt?:     Date
}

// ─── BOOKING DRAFTS ───────────────────────────────────────────────────────
export interface BookingDraft {
  draftId:        string
  name:           string
  clientName:     string
  eventName?:     string
  eventType:      EventType | string
  totalAmount:    number
  currentStep:    number
  state:          unknown
  createdBy:      string
  createdAt:      Date
  updatedAt:      Date
}

// ─── SETTINGS ─────────────────────────────────────────────────────────────
export interface PackageTemplate {
  id:        string
  name:      string
  price:     number
  lineItems: LineItem[]
}

export interface StudioSettings {
  studioName:            string
  address:               string
  city:                  string
  phone:                 string
  email:                 string
  gstin?:                string
  logoURL?:              string
  upiId?:                string
  bankName?:             string
  accountNumber?:        string
  ifsc?:                 string
  signatureURL?:         string
  defaultTerms:          string
  gstEnabled:            boolean
  gstRate:               number
  invoicePrefix:         string
  quotationPrefix:       string
  invoiceStartNumber:    number
  quotationStartNumber:  number
  packages:              PackageTemplate[]
}

// ─── SAVED ADDRESSES ───────────────────────────────────────────────────────
export interface SavedAddress {
  id:         string
  name:       string
  address:    string
  createdAt?: Date
  updatedAt?: Date
  isDeleted?: boolean
}

// ─── NOTIFICATIONS ────────────────────────────────────────────────────────
export type NotificationType = 'leave_applied' | 'leave_approved' | 'leave_rejected'

export interface AppNotification {
  notificationId:      string
  recipient:           string               // 'admin' | 'manager' | staffUid (user UID)
  recipientRole?:      'admin' | 'manager' | 'staff'
  type:                NotificationType
  referenceId:         string               // ID in referenceCollection (e.g. leaveRequest requestId)
  referenceCollection: 'leaveRequests'
  isRead:              boolean
  createdAt:           Date
  readAt?:             Date
  isDeleted?:          boolean
}

export interface CreateNotificationInput {
  recipient:           string
  recipientRole?:      'admin' | 'manager' | 'staff'
  type:                NotificationType
  referenceId:         string
  referenceCollection: 'leaveRequests'
}


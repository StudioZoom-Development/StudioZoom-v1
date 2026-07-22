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
  | 'wedding' | 'preWedding' | 'engagement'
  | 'corporate' | 'portrait' | 'studio' | 'other'

export type PaymentStatus = 'unpaid' | 'partial' | 'paid'
export type ClientStatus  = 'inquiry' | 'booked'

export interface Client {
  clientId:       string
  name:           string
  contact:        string
  email:          string
  eventName:      string
  eventType:      EventType
  eventDate:      Date
  location:       string
  packageType:    string
  totalAmount:    number
  balanceDue:     number
  paymentStatus:  PaymentStatus
  invoiceNumber:  string
  status:         ClientStatus
  notes?:         string
  isDeleted?:     boolean
  createdBy:      string
  createdAt:      Date
  updatedAt:      Date
}

export interface Payment {
  paymentId:   string
  instalment:  '1st' | '2nd' | '3rd'
  amount:      number
  date:        Date
  method:      'cash' | 'gpay' | 'bankTransfer' | 'cheque'
  recordedBy:  string
}

// ─── PROJECT ──────────────────────────────────────────────────────────────
export type ProjectStage =
  | 'booked' | 'planning' | 'preProduction'
  | 'eventDay' | 'postProduction' | 'delivered'

export type ProjectStatus = 'upcoming' | 'ongoing' | 'completed' | 'cancelled'

export interface Project {
  projectId:       string
  clientId:        string
  eventDate:       Date              // DENORMALIZED from client
  eventName:       string            // DENORMALIZED from client
  clientName:      string            // DENORMALIZED from client
  eventType:       EventType         // DENORMALIZED from client
  stage:           ProjectStage
  status:          ProjectStatus
  callTime?:       string
  engagementDate?: Date
  preWeddingDate?: Date
  staffUids:       string[]          // DENORMALIZED for array-contains queries
  freelancerIds:   string[]
  milestones:      Partial<Record<MilestoneKey, Date>>
  override?:       { by: string; reason: string; at: Date }
  isDeleted?:      boolean
  createdBy:       string
  createdAt:       Date
  updatedAt:       Date
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
  eventDate:     string   // ← "YYYY-MM-DD" STRING, not Timestamp — required for equality queries
  role:          AssignmentRole
  status:        'confirmed' | 'tentative'
  createdAt:     Date
}

// ─── WORK ITEMS ───────────────────────────────────────────────────────────
export type WorkItemType =
  | 'photography' | 'videography' | 'photoEditing'
  | 'videoEditing' | 'albumDesign' | 'highlights' | 'fullFilm'

export type WorkItemStatus = 'todo' | 'inProgress' | 'review' | 'done'
export type WorkTrack      = 'photo' | 'video'

export interface WorkItem {
  workItemId:      string
  projectId:       string
  clientId:        string
  eventDate:       Date
  eventName:       string           // DENORMALIZED
  type:            WorkItemType
  track:           WorkTrack
  assignedToUid:   string
  assignedToName:  string           // DENORMALIZED
  status:          WorkItemStatus
  startDate?:      Date
  dueDate?:        Date
  notes?:          string
  createdBy:       string
  createdAt:       Date
}

// ─── EQUIPMENT ────────────────────────────────────────────────────────────
export type EquipmentCategory =
  | 'cameraBody' | 'lens' | 'camcorder' | 'drone' | 'flash'
  | 'gimbal' | 'light' | 'sdCard' | 'battery' | 'charger' | 'wire' | 'other'

export type EquipmentCondition = 'good' | 'excellent' | 'canUse' | 'service'
export type EquipmentStatus    = 'available' | 'out' | 'service'

export interface Equipment {
  itemId:               string
  itemCode:             string      // "001"–"057"
  name:                 string
  category:             EquipmentCategory
  brand:                string
  model:                string
  serialNumber:         string
  purchasePrice:        number
  condition:            EquipmentCondition
  location:             string
  status:               EquipmentStatus    // CACHED — source of truth is checkouts
  assignedToUid?:       string             // CACHED current holder
  currentCheckoutId?:   string             // CACHED current checkout doc id
  lastUsedDate?:        Date
  nextMaintenanceDate?: Date
  isDeleted?:           boolean
  createdAt:            Date
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
  status:            'open' | 'closed' | 'flagged'
  correctedBy?:      string
  correctionReason?: string
}

// ─── SALARY ───────────────────────────────────────────────────────────────
export interface Salary {
  salaryId:       string
  staffUid:       string
  year:           number
  month:          number
  baseSalary:     number
  advance1?:      { amount: number; date: Date }
  advance2?:      { amount: number; date: Date }
  advance3?:      { amount: number; date: Date }
  totalAdvances:  number
  salaryPending:  number
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
  skill:        'photographer' | 'videographer' | 'editor' | 'designer'
  dayRate:      number
  contact:      string
  isActive:     boolean
}

export interface FreelancerPayout {
  payoutId:        string
  freelancerId:    string
  freelancerName:  string
  projectId:       string
  days:            number
  dayRate:         number
  amount:          number
  paidDate:        Date
  postedExpenseId: string    // links to auto-created expense doc
}

// ─── EXPENSES ─────────────────────────────────────────────────────────────
export type ExpenseCategory =
  | 'equipment' | 'travel' | 'freelancer' | 'outsourcing'
  | 'rent' | 'utilities' | 'marketing' | 'misc'

export interface Expense {
  expenseId:  string
  date:       Date
  category:   ExpenseCategory
  amount:     number
  method:     string
  vendor?:    string
  note?:      string
  projectId?: string
  source:     'manual' | 'freelancerPayout' | 'salary'
  createdBy:  string
  createdAt:  Date
}

export interface Budget {
  budgetId:       string
  category:       ExpenseCategory
  period:         'monthly' | 'annual'
  year:           number
  month?:         number
  budgetedAmount: number
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
export type LeadStatus = 'new' | 'contacted' | 'quoted' | 'won' | 'lost'

export interface Lead {
  leadId:      string
  name:        string
  contact:     string
  email?:      string
  eventType:   EventType
  eventDate?:  Date
  location?:   string
  budget?:     number
  source?:     string
  status:      LeadStatus
  notes?:      string
  isDeleted?:  boolean
  createdBy:   string
  createdAt:   Date
  updatedAt:   Date
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

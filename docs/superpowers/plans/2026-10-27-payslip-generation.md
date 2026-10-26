# Payslip Generation System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an on-demand, zero-file-storage Payslip Generation module for Studio Zoom HRMS (`/hrms/payslips`) allowing Admins and Managers to review, adjust deductions, and generate branded PDF payslips in INR, and allowing Staff to download their own historical and current payslips.

**Architecture:** Shared pure TypeScript payroll calculator (`lib/payroll/calculator.ts`) used across client preview and server route; protected Next.js API route (`/api/hrms/payslips/generate/route.ts`) validating Firebase Auth tokens, retrieving Firestore data, saving lightweight audit snapshots to `/payslips/ps_${staffUid}_${year}_${month}`, and generating in-memory PDFs via `pdf-lib` streamed directly to the browser; interactive Deductions Confirmation Modal for Admin/Manager adjustments; and a responsive `/hrms/payslips` page with role-branched Management vs Personal Staff views.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Cloud Firestore, Firebase Admin SDK, `pdf-lib`, `date-fns`, Tabler Icons (`ti ti-*`), Studio Zoom Theme System (`studio-theme.css`).

## Global Constraints

- All currency amounts must be strictly formatted in Indian National Rupee (`₹` / `Rs.`) using `en-IN` numbering. Never display dollar symbols (`$`).
- Generated PDF files must NEVER be stored in Firebase Storage or Firestore; they must be streamed directly in-memory to the client.
- Historical calculation snapshots must be stored in `/payslips/{payslipId}` (`ps_${staffUid}_${year}_${month}`) for audit and financial consistency.
- All styles must strictly adhere to `studio-theme.css` design tokens (`var(--color-...)`, `var(--text-...)`, `0.5px` borders).
- Must work flawlessly in both Dark and Light themes.
- Desktop views (`> 768px`) must remain spacious and multi-column; mobile views (`< 768px`) must collapse into compact cards with touch-friendly controls.
- Strict TypeScript mode with 0 `any` types. All code must pass `npx tsc --noEmit` and `npm run build`.

---

### Task 1: Payroll Calculation Engine & Type Definitions

**Files:**
- Modify: `studio-zoom/types/index.ts:534-547`
- Create: `studio-zoom/lib/payroll/calculator.ts`
- Create: `studio-zoom/scripts/test-payroll-calculator.mjs`

**Interfaces:**
- Consumes: `StaffMember` from `@/lib/firebase/queries/staff`, `AttendanceRecord` from `@/types`, `Salary` from `@/types`.
- Produces: `calculatePayslip(...)`, `formatIndianCurrency(...)`, `numberToWordsINR(...)`, `PayslipRecord` interface.

- [ ] **Step 1: Update Payslip type in `types/index.ts`**

Expand `Payslip` in `studio-zoom/types/index.ts` to include full snapshot fields:
```typescript
export interface PayslipAdvanceItem {
  label:  string
  amount: number
  date?:  string
}

export interface PayslipRecord {
  payslipId:           string           // "ps_uid123_2026_10"
  payslipNumber:       string           // "ZS-PS-0145"
  staffUid:            string
  staffName:           string
  jobTitle:            string
  month:               number           // 1–12
  year:                number           // e.g. 2026

  // Earnings
  baseSalary:          number
  allowances:          number
  customBonus:         number
  customBonusReason?:  string
  grossEarnings:       number

  // Attendance metrics
  totalCalendarDays:   number
  workingDays:         number
  presentDays:         number
  halfDays:            number
  absentDays:          number
  weekOffs:            number
  payableDays:         number
  dailyRate:           number
  attendanceDeduction: number

  // Advance recovery
  advances:            PayslipAdvanceItem[]
  totalAdvances:       number

  // Custom deductions
  customDeduction:     number
  customDeductionReason?: string

  // Totals
  totalDeductions:     number
  netPay:              number

  // Status & Audit
  paymentStatus:       'unpaid' | 'paid'
  paymentDate?:        string
  generatedAt:         Date
  generatedByUid:      string
  generatedByName:     string
  isAdjusted:          boolean
}
```

- [ ] **Step 2: Create pure payroll calculation service in `lib/payroll/calculator.ts`**

Implement `calculatePayslip`:
- Calculate calendar days in month ($D_{\text{total}}$).
- Calculate `dailyRate = baseSalary / D_total`.
- Tally present, half-days, absences, week-offs, and payable days.
- Calculate default `attendanceDeduction = (absentCount + 0.5 * halfDayCount) * dailyRate`.
- Support user override adjustments (`applyAttendanceDeduction`, `customAttendanceDeduction`, `advanceDeduction`, `customBonus`, `customDeduction`).
- Compute `grossEarnings = baseSalary + allowances + customBonus`.
- Compute `totalDeductions = attendanceDeduction + advanceDeduction + customDeduction`.
- Compute `netPay = Math.max(0, Math.round(grossEarnings - totalDeductions))`.
- Implement `numberToWordsINR(amount: number): string` (converts integer to Indian numbering words, e.g. *"Twenty-Five Thousand Ninety-Seven"*).
- Implement `formatIndianCurrency(amount: number): string` (formats as `₹25,097`).

- [ ] **Step 3: Run standalone verification test**

Run: `node scripts/test-payroll-calculator.mjs`
Expected output: Verify all test cases pass:
- Zero absence = full salary.
- 1 absent day in October (31 days) on ₹31,000 base salary = ₹1,000 deduction, net ₹30,000.
- 1 half-day in April (30 days) on ₹30,000 base salary = ₹500 deduction, net ₹29,500.
- Overrides and Indian Rupee text conversions match expected values.

- [ ] **Step 4: Commit**

```bash
git add types/index.ts lib/payroll/calculator.ts scripts/test-payroll-calculator.mjs
git commit -m "feat(payroll): pure calculation engine, INR currency formatting, and types"
```

---

### Task 2: In-Memory PDF Generator (`lib/payroll/pdfGenerator.ts`)

**Files:**
- Create: `studio-zoom/lib/payroll/pdfGenerator.ts`
- Create: `studio-zoom/scripts/test-pdf-generator.mjs`

**Interfaces:**
- Consumes: `PayslipRecord` from `@/types`, `pdf-lib`.
- Produces: `generatePayslipPdf(record: PayslipRecord): Promise<Uint8Array>`.

- [ ] **Step 1: Install `pdf-lib` dependency**

Run: `npm install pdf-lib` in `studio-zoom`.
Verify `package.json` contains `"pdf-lib": "^1.17.9"`.

- [ ] **Step 2: Implement PDF layout generator in `lib/payroll/pdfGenerator.ts`**

Using `pdf-lib`:
- Create A4 portrait document (`595.28 x 841.89`).
- Standard Helvetica / Helvetica-Bold typography.
- Studio Zoom branded header (`#c6539f` brand bar, title, subtitle, reference number `ZS-PS-XXXX`, issue date).
- 2-Column Employee & Studio details grid.
- Attendance summary row box (Calendar Days, Present Days, Week Offs, Half-Days, Absences, Payable Days).
- Side-by-side Earnings & Deductions table with clean borders and light zebra striping.
- Highlighted Net Pay Container: `NET SALARY PAYABLE: Rs. XX,XXX` with amount in words.
- Footer with computer-generated disclaimer and signature line.
- Return `await pdfDoc.save()`.

- [ ] **Step 3: Test PDF output generation**

Run: `node scripts/test-pdf-generator.mjs`
Expected output: Creates a test PDF file in scratch directory, verifies buffer size > 10KB, and validates PDF binary header (`%PDF-1.7`). Clean up test artifact after verification.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json lib/payroll/pdfGenerator.ts scripts/test-pdf-generator.mjs
git commit -m "feat(payroll): in-memory branded PDF generator with pdf-lib"
```

---

### Task 3: Protected Server API Route (`/api/hrms/payslips/generate`)

**Files:**
- Create: `studio-zoom/app/api/hrms/payslips/generate/route.ts`

**Interfaces:**
- Consumes: `getAdminFirestore()` from `@/lib/firebase/admin`, `calculatePayslip` from `@/lib/payroll/calculator`, `generatePayslipPdf` from `@/lib/payroll/pdfGenerator`.
- Produces: HTTP response with binary PDF stream and Firestore document write to `/payslips/ps_${staffUid}_${year}_${month}`.

- [ ] **Step 1: Implement Next.js API Route in `app/api/hrms/payslips/generate/route.ts`**

Configure:
- `export const runtime = 'nodejs'`
- `export const dynamic = 'force-dynamic'`
- Authenticate request via Bearer token:
  - Verify Firebase Auth token via REST / Admin SDK.
  - Extract `callerUid` and look up user role in Firestore (`admin`, `manager`, `staff`).
  - If `role === 'staff'` and `body.staffUid !== callerUid`: return 403 Forbidden.
- Query Firestore:
  - `users/{staffUid}`: Fetch name, jobTitle, joinDate.
  - `attendance`: Find document for `staffUid`, `year`, `month`.
  - `salaries`: Find document for `staffUid`, `year`, `month`.
  - `studioSettings/numbering`: Atomically increment or retrieve next serial (e.g. `ZS-PS-0145`).
- Run `calculatePayslip(...)`.
- Save snapshot to `/payslips/ps_${staffUid}_${year}_${month}` with audit fields (`generatedAt`, `generatedByUid`, `generatedByName`, `isAdjusted`).
- Generate PDF using `generatePayslipPdf(snapshot)`.
- Return `new Response(pdfBytes, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': action === 'download' ? 'attachment; filename=...' : 'inline; filename=...' } })`.

- [ ] **Step 2: Commit**

```bash
git add app/api/hrms/payslips/generate/route.ts
git commit -m "feat(payroll): server-side protected API route for on-demand payslip generation"
```

---

### Task 4: Deductions Confirmation & Adjustment Dialog Component

**Files:**
- Create: `studio-zoom/components/hrms/PayslipDeductionsModal.tsx`

**Interfaces:**
- Consumes: `StaffMember`, `AttendanceRecord`, `Salary`, and `studio-theme.css` variables.
- Produces: Interactive modal with live recalculations, emit confirmed parameters to generate handler.

- [ ] **Step 1: Implement `PayslipDeductionsModal.tsx`**

Features:
- Backdrop `rgba(0,0,0,0.7)` and surface container with `0.5px solid var(--color-border)`.
- Employee info banner (Avatar, Name, Job Title, Month & Year).
- Attendance quick summary card.
- Deductions controls:
  - Toggle: `[✓] Apply Attendance Deduction (₹X,XXX)` with custom override input.
  - Advance Recovery: Displays scheduled advances with editable recovery amount.
  - Custom Adjustment: Optional incentive/bonus (`+ ₹`) or extra deduction (`- ₹`) with reason input.
- Real-time Net Pay summary banner updating as inputs change.
- Buttons: "Preview PDF" (opens in new tab/iframe), "Confirm & Download" (submits adjustments and triggers download), and "Cancel".
- Fully responsive on mobile (`< 768px`) with full-width touch targets.

- [ ] **Step 2: Commit**

```bash
git add components/hrms/PayslipDeductionsModal.tsx
git commit -m "feat(payroll): interactive deductions confirmation and adjustment modal"
```

---

### Task 5: Admin & Manager Workspace (`/hrms/payslips`)

**Files:**
- Create: `studio-zoom/lib/firebase/queries/payslips.ts`
- Modify: `studio-zoom/app/(app)/hrms/payslips/page.tsx`

**Interfaces:**
- Consumes: `subscribeToStaffOnly`, `subscribeMonthlySalaries`, `subscribeMonthlyAttendance`, `PayslipDeductionsModal`.
- Produces: Full interactive management dashboard with month navigation, KPI cards, table grid, and sequential bulk runner.

- [ ] **Step 1: Implement payslip Firestore query helpers in `lib/firebase/queries/payslips.ts`**

Add functions:
- `subscribeMonthlyPayslips(year: number, month: number, onUpdate: (records: PayslipRecord[]) => void)`
- `subscribeStaffPayslipHistory(staffUid: string, onUpdate: (records: PayslipRecord[]) => void)`

- [ ] **Step 2: Build Management View in `app/(app)/hrms/payslips/page.tsx`**

Implement:
- Month navigation header (`< Month Year >` + Current Month button).
- KPI stat cards:
  - Total Staff
  - Ready to Generate
  - Missing Data
  - Estimated Total Net Payroll (`₹`)
- Search bar & filter pills (*All*, *Ready*, *Generated*, *Missing Data*).
- "Generate All Payslips" action with sequential progress bar (`Generating 3 of 18...`).
- Desktop Table (`hidden md:table`) & Mobile Cards (`block md:hidden`):
  - Staff Name & Role
  - Base Salary (`₹`)
  - Attendance Status (Present / Half / Absent)
  - Deductions (`₹`)
  - Estimated Net Pay (`₹`, bold primary color)
  - Status Badge (`Generated`, `Ready`, `Missing Data`)
  - Action buttons: "Generate" (opens `PayslipDeductionsModal`) and "Download PDF".

- [ ] **Step 3: Commit**

```bash
git add lib/firebase/queries/payslips.ts app/(app)/hrms/payslips/page.tsx
git commit -m "feat(payroll): admin and manager payslip workspace with bulk generation"
```

---

### Task 6: Staff "My Payslips" View & Security Rules Update

**Files:**
- Modify: `studio-zoom/app/(app)/hrms/payslips/page.tsx`
- Modify: `studio-zoom/firestore.rules:137-141`

**Interfaces:**
- Consumes: `useAuthStore` for role branching (`staff` vs `admin`/`manager`).
- Produces: Dedicated personal payslip portal for staff and updated Firestore security rules.

- [ ] **Step 1: Add Staff Personal Portal in `app/(app)/hrms/payslips/page.tsx`**

When `appUser.role === 'staff'`:
- Render personal header: *"Welcome, Siva — Your Payslips"*.
- Current month card: Shows current attendance status and payout status.
- Single-click "Download [Current Month] Payslip" button.
- Historical payslips list: Displays past months with payslip serial number, net pay (`₹`), generated date, and instant download button.
- Lock out all administrative actions, filters, and other staff members.

- [ ] **Step 2: Update `firestore.rules` for `/payslips/{payslipId}`**

Update lines 137–141 in `studio-zoom/firestore.rules`:
```firestore
    match /payslips/{payslipId} {
      allow read: if isAdminOrManager() || (
        isSignedIn() && resource.data.staffUid == request.auth.uid
      );
      allow write: if isAdminOrManager();
    }
```

- [ ] **Step 3: Deploy Firestore security rules to dev**

Run: `npx -y firebase-tools deploy --only firestore:rules --project studio-zoom`

- [ ] **Step 4: Commit**

```bash
git add app/(app)/hrms/payslips/page.tsx firestore.rules
git commit -m "feat(payroll): staff personal payslip portal and security rules update"
```

---

### Task 7: Comprehensive Verification & Build Validation

**Files:**
- Review: all modified and newly created files.

- [ ] **Step 1: Run TypeScript validation**

Run: `npx tsc --noEmit`
Expected output: 0 errors.

- [ ] **Step 2: Run Next.js production build**

Run: `npm run build`
Expected output: Clean build with all static and dynamic routes compiled successfully.

- [ ] **Step 3: End-to-end UX & Theme Verification**

Verify:
- Dark theme and Light theme styling compliance.
- Currency display strictly in INR (`₹` / `Rs.`).
- Deductions modal adjusts net salary accurately in real time.
- Individual download and sequential bulk download trigger without freezing the UI.
- Staff role is completely isolated to their own records.

- [ ] **Step 4: Commit final verification**

```bash
git commit --allow-empty -m "chore(payroll): verify clean build and type safety"
```

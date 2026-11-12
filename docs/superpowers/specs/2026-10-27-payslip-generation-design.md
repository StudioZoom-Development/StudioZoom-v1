# Payslip Generation System — Technical & Design Specification

**Document Version:** 1.0.0  
**Date:** 2026-10-27  
**Status:** Approved by User  
**Target Module:** Studio Zoom HRMS (`/hrms/payslips`)

---

## 1. Executive Summary

The Payslip Generation system enables Studio Zoom administrators and managers to generate, review, adjust, and download monthly PDF payslips on-demand for all studio staff. Individual staff members can view and download their own historical and current payslips.

To eliminate storage costs and adhere to strict privacy standards, generated PDF files are **never permanently stored** in Firebase Storage or external file servers. Instead, PDFs are constructed in-memory on demand using `pdf-lib` and streamed directly to the browser. A lightweight calculation snapshot is persisted in Cloud Firestore (`/payslips/{payslipId}`) to ensure that historical payslip figures remain tamper-proof, auditable, and mathematically consistent over time.

All financial amounts are strictly calculated, displayed, and rendered in **Indian National Rupee (`₹` / `Rs.`)** using standard Indian currency formatting (`en-IN`).

---

## 2. User Roles & Permission Matrix

| Capability | Admin | Manager | Staff |
| :--- | :---: | :---: | :---: |
| View all staff payroll rows | Yes | Yes | No |
| View monthly attendance breakdown for all staff | Yes | Yes | No |
| Open Deductions Confirmation & Adjustment dialog | Yes | Yes | No |
| Generate & download individual staff payslip PDF | Yes | Yes | No |
| Execute "Generate All Payslips" (sequential batch) | Yes | Yes | No |
| View own payslip history & current month status | Yes | Yes | Yes |
| Download own payslip PDF | Yes | Yes | Yes |
| Access other employees' salary or payslip data | Yes | Yes | **Forbidden (HTTP 403)** |

Permissions are strictly enforced on both the backend API route (`/api/hrms/payslips/generate`) and Cloud Firestore security rules.

---

## 3. Salary & Deduction Calculation Rules

### 3.1 Attendance-Based Daily Rate
Attendance deductions are calculated based on the actual number of calendar days in the selected payroll month ($D_{\text{total}}$):
- **Calendar Days ($D_{\text{total}}$)**: 31 in Jan/Mar/May/Jul/Aug/Oct/Dec; 30 in Apr/Jun/Sep/Nov; 28 or 29 in Feb.
- **Daily Rate Formula**:
  $$\text{Daily Rate} = \frac{\text{Base Salary}}{D_{\text{total}}}$$

### 3.2 Attendance Day Classification
- **Present (`P`)**: Fully payable (0 deduction).
- **Week Off (`WO`)**: Fully payable (0 deduction).
- **Approved Permission / Paid Leave (`Permission`)**: Counted as payable days (0 deduction).
- **Half-Day (`HalfDay`)**: Deducts $0.5 \times \text{Daily Rate}$.
- **Absent / Unpaid Leave (`AB`)**: Deducts $1.0 \times \text{Daily Rate}$.

$$\text{Auto Attendance Deduction} = \left(\text{Absent Count} + 0.5 \times \text{Half-Day Count}\right) \times \text{Daily Rate}$$

### 3.3 Salary Advances Recovery
Salary advances are retrieved from the monthly salary record in `/salaries` (`advance1`, `advance2`, `advance3`).
- **Total Scheduled Advance** = $\text{adv1.amount} + \text{adv2.amount} + \text{adv3.amount}$.
- Recovery amount is reviewable and adjustable during payslip generation.

### 3.4 Net Salary Payable Formula
$$\text{Net Salary} = \text{Base Salary} + \text{Allowances} + \text{Bonuses} - \text{Attendance Deduction} - \text{Advance Recovery} - \text{Other Deductions}$$
*(All final amounts are rounded to the nearest whole integer in ₹).*

---

## 4. Deduction Review & Confirmation Dialog

Before any payslip is finalized or downloaded by an Admin or Manager, the system presents an interactive **Payroll Review & Adjustment Dialog**:

1. **Header**: Employee Name, Staff ID, Designation, Payroll Month/Year.
2. **Auto-Calculated Metrics**:
   - Base Salary: `₹XX,XXX`
   - Attendance Summary: Calendar Days, Working Days, Present, Half-Days, Absences, Week Offs.
3. **Interactive Adjustments**:
   - **Attendance Deduction Override**:
     - Toggle: `[✓] Apply Attendance Deduction (₹X,XXX)`
     - Ability to waive completely (`₹0`) or enter a custom deduction amount.
   - **Advance Recovery Control**:
     - Displays pending advances with date notes.
     - Editable recovery amount (allows recovering full, partial, or deferring to next month).
   - **Custom Earnings / Deductions**:
     - Ad-hoc bonus/incentive (`+ ₹...`) or custom deduction (`- ₹...`) with a mandatory or optional reason note (e.g. *"Festive bonus"*, *"Overtime"*).
4. **Live Net Pay Recalculator**: Dynamically updates the net payable amount in Indian Rupees as adjustments are keyed in.
5. **Actions**:
   - **"Preview PDF"**: Launches inline PDF preview tab/modal.
   - **"Confirm & Download"**: Saves calculation snapshot to Firestore and initiates PDF download.
   - **"Cancel"**: Closes dialog without saving or generating.

---

## 5. Server-Side Architecture & API Specification

### 5.1 Route: `/api/hrms/payslips/generate`
- **Method**: `POST`
- **Auth**: Requires valid Firebase ID token via `Authorization: Bearer <token>`.
- **Request Body**:
  ```json
  {
    "staffUid": "user_abc123",
    "year": 2026,
    "month": 10,
    "action": "download", // or "preview"
    "adjustments": {
      "applyAttendanceDeduction": true,
      "customAttendanceDeduction": 1000,
      "advanceDeduction": 2000,
      "customBonus": 500,
      "customBonusReason": "Festival Bonus",
      "customDeduction": 0,
      "customDeductionReason": ""
    }
  }
  ```
- **Access Control Logic**:
  - Decode caller UID and role from token.
  - If `role === 'staff'` and `caller.uid !== staffUid`, return HTTP `403 Forbidden`.
  - If `role === 'staff'`, ignore any client-supplied adjustment overrides and use verified default calculation.
  - If `role === 'admin' || role === 'manager'`, apply validated adjustment overrides.

### 5.2 Server Execution Flow
1. Fetch `users/{staffUid}` for identity, job title, and join date.
2. Fetch `attendance` document matching `staffUid`, `year`, `month`.
3. Fetch `salaries` document matching `staffUid`, `year`, `month`.
4. Fetch/Increment sequential payslip counter in `studioSettings/numbering` (Format: `ZS-PS-XXXX`).
5. Execute calculation engine (`lib/payroll/calculator.ts`).
6. Persist calculation snapshot to Firestore (`/payslips/ps_${staffUid}_${year}_${month}`).
7. Construct PDF document in-memory using `pdf-lib`.
8. Return binary stream:
   - `Content-Type: application/pdf`
   - `Content-Disposition: attachment; filename="Payslip_ZS-PS-0145_SivaPrakash_10_2026.pdf"` (or `inline`).

---

## 6. PDF Layout Specification (`pdf-lib`)

- **Page Setup**: A4 Portrait (595.28 × 841.89 pt), 36 pt outer margins.
- **Color Palette**:
  - Primary Brand: `#c6539f` (Header accents, divider bar, Net Pay container).
  - Dark Surface / Text: `#181d19` (Text primary) and `#5a5a50` (Text muted/labels).
  - Background: Crisp clean white for optimal printing.
- **Typography & Font**: Standard Type-1 Helvetica & Helvetica-Bold (guarantees universal rendering across iOS, Android, macOS, and Windows PDF readers).
- **Currency Representation**: `Rs.` prefix with Indian comma separation (e.g. `Rs. 25,000`).
- **Layout Sections**:
  1. **Top Header**: Studio Zoom logo / wordmark, company subline ("Creative Photography & Film Studio"), and prominent "PAYSLIP" title block with Payslip No. and Issue Date.
  2. **Employee & Payroll Details Box**: Two-column tabular layout (Name, Employee ID, Designation, Date of Joining, Month & Year, Working Days).
  3. **Attendance Summary Strip**: Highlight banner listing Calendar Days, Present Days, Week Offs, Half-Days, Absences, and Payable Days.
  4. **Earnings & Deductions Table (Side-by-Side)**:
     - Left Column (Earnings): Basic Salary, Allowances, Incentives/Bonuses, Total Gross Earnings.
     - Right Column (Deductions): Attendance Loss (with days breakdown), Advances Recovered, Other Deductions, Total Deductions.
  5. **Net Salary Payable Highlight**:
     - Large branded callout box: `NET SALARY PAYABLE: Rs. XX,XXX`.
     - Amount in words text: e.g. *"Rupees Twenty-Five Thousand Ninety-Seven Only"*.
  6. **Footer**: System verification disclaimer ("This document is computer generated by Studio Zoom HRMS") and Authorized Signatory block.

---

## 7. Firestore Schema: `/payslips/{payslipId}`

Document ID convention: `ps_${staffUid}_${year}_${month}` (ensures exactly one authoritative record per staff member per month).

```typescript
export interface PayslipRecord {
  payslipId:           string           // e.g. "ps_uid123_2026_10"
  payslipNumber:       string           // e.g. "ZS-PS-0145"
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
  advances:            { label: string; amount: number; date?: string }[]
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

---

## 8. Frontend User Experience (`/hrms/payslips`)

### 8.1 Admin & Manager View
1. **Header & Period Selector**: Month stepper (`< October 2026 >`), Jump to Current Month button.
2. **KPI Header Strip**:
   - Total Staff (e.g. 20)
   - Ready to Generate (e.g. 18)
   - Action Needed / Missing Data (e.g. 2)
   - Estimated Net Payroll (`₹X,XX,XXX`)
3. **Toolbar**: Search input, status filter pills (*All*, *Ready*, *Generated*, *Missing Data*), and **"Generate All Payslips"** button.
4. **Data Grid (Desktop Table / Mobile Cards)**:
   - Staff Avatar & Name
   - Base Salary (`₹`)
   - Attendance Summary pill
   - Total Deductions (`₹`)
   - Estimated Net Pay (`₹`, bold primary color)
   - Status Badge: `<Badge variant="success">Generated</Badge>`, `<Badge variant="available">Ready</Badge>`, or `<Badge variant="unpaid">Missing Data</Badge>`.
   - Action Button: **"Generate"** (triggers adjustment dialog) or **"Download PDF"** (if already generated).
5. **Sequential Bulk Runner**:
   - Iterates through all eligible staff one by one.
   - Shows progress overlay: *"Generating payslip 4 of 18 (Siva Prakash)..."*.
   - Triggers browser downloads sequentially.
   - Robust error handling: single failure does not halt remaining staff generations.

### 8.2 Staff View ("My Payslips")
1. **Personal Portal Header**: Displays logged-in staff member's name and designation.
2. **Current Period Card**: Shows current month's attendance status and salary release status.
3. **One-Click Download**: "Download [Month Year] Payslip" button.
4. **Historical Payslips Table**: Lists past generated payslips with Payslip Number, Month, Net Pay, Generated Date, and direct Download button.
5. **Privacy Boundary**: Staff cannot view, search, or access other staff records.

---

## 9. Security Rules (`firestore.rules`)

Update rule for `/payslips/{payslipId}`:
```firestore
match /payslips/{payslipId} {
  // Staff can read only their own payslips; Admins and Managers can read all
  allow read: if isAdminOrManager() || (
    isSignedIn() && resource.data.staffUid == request.auth.uid
  );
  // Admins and Managers can write calculation snapshots
  allow write: if isAdminOrManager();
}
```

---

## 10. Verification & Quality Checklist

- [ ] All monetary displays, calculations, and PDF labels strictly use **INR / ₹ / Rs.** with Indian numbering format.
- [ ] No PDF files are saved to Firebase Storage or external file buckets.
- [ ] Attendance deductions accurately apply calendar day division ($D_{\text{total}}$).
- [ ] Confirmation & Adjustment dialog allows custom attendance waivers, partial advance recoveries, and custom bonus/deduction notes.
- [ ] Bulk generation processes staff members sequentially and handles isolated failures gracefully.
- [ ] Staff view is strictly locked down to their own records.
- [ ] Passes `npx tsc --noEmit` with zero errors.
- [ ] Tested in both Dark and Light theme modes.

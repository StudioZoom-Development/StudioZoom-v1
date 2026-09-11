# Studio Zoom — Event Types & Full Lifecycle Workflow Specification

**Author:** Bytevators Engineering  
**Version:** 1.0  
**Scope:** Event Management System (`/events`), Calendar Engine (`/events/calendar`), Booking Wizard (`/clients/new`), and CRM (`/clients/[id]`)

---

## 1. Executive Summary & Architecture

Studio Zoom operates a structured event production pipeline tailored for photo and video studios. A booking initiates as a client agreement, creates a denormalized **Client** and **Project** in Firestore, and flows through a deterministic **6-stage pipeline** with strict exit gates.

The platform supports three event models:
1. **One-Day Event (`oneTime`)** — Single shoot session with linear progression.
2. **Multi-Date Event (`multiDate`)** — Multiple distinct functions spread across separate days, each tracked independently on the canvas and scheduled across the calendar.
3. **Recurring / Contract Event (`recurring`)** — Periodic retainers and contracts (Weekly, Bi-weekly, Monthly) with session-based milestones, dynamic date calculation, and automatic calendar population.

```
┌─────────────┐     ┌──────────────┐     ┌────────────────────┐
│   1. Booked │ ──▶ │  2. Planning │ ──▶ │ 3. Pre-Production  │
└─────────────┘     └──────────────┘     └────────────────────┘
                                                    │
                                                    ▼
┌─────────────┐     ┌──────────────────────┐     ┌──────────────┐
│ 6. Delivered│ ◀── │ 5. Post-Production   │ ◀── │ 4. Event Day │
└─────────────┘     └──────────────────────┘     └──────────────┘
```

---

## 2. Universal 6-Stage Project Lifecycle

Every event moves through the following stages, governed by strict exit gates. A stage cannot advance until all required gates are verified.

```
Stage Progression & Exit Gates:
┌───────────────────┬───────────────────────────────────┬──────────────────────────────────────────┐
│ Stage             │ Operational Focus                 │ Mandatory Exit Gates                     │
├───────────────────┼───────────────────────────────────┼──────────────────────────────────────────┤
│ 1. Booked         │ Financial locking, package terms, │ • Deposit / Advance payment received     │
│                   │ deliverable scoping               │ • Post-production requirements configured│
├───────────────────┼───────────────────────────────────┼──────────────────────────────────────────┤
│ 2. Planning       │ Creative vision, crew scheduling, │ • Lead photographer/videographer assigned│
│                   │ equipment reservation             │ • Shot list & reference moodboard ready  │
├───────────────────┼───────────────────────────────────┼──────────────────────────────────────────┤
│ 3. Pre-Production │ Gear readiness, crew call sheets, │ • Equipment packed & checked out (ERP)   │
│                   │ client logistics briefing         │ • Call sheet sent to client & staff      │
├───────────────────┼───────────────────────────────────┼──────────────────────────────────────────┤
│ 4. Event Day      │ Shoot execution, check-ins, media │ • Shoot execution completed              │
│                   │ intake & card dumps               │ • 100% RAW cards dumped & verified       │
├───────────────────┼───────────────────────────────────┼──────────────────────────────────────────┤
│ 5. Post-Production│ Parallel editing tracks, internal │ • Editing tracks completed & color-graded│
│                   │ QA, client review cycles          │ • Client approvals received (or bypassed)│
├───────────────────┼───────────────────────────────────┼──────────────────────────────────────────┤
│ 6. Delivered      │ Physical/digital asset handover,  │ • Balance Due = ₹0 (all instalments paid)│
│                   │ final balance settlement          │ • Formal client sign-off received        │
│                   │                                   │ • "Complete Event Handover" confirmed    │
└───────────────────┴───────────────────────────────────┴──────────────────────────────────────────┘
```

---

## 3. Detailed Workflow by Event Type

```
========================================================================================
TYPE 1: ONE-DAY EVENT (oneTime)
========================================================================================
```

### Overview
The standard model for single-day shoots, such as Birthdays, Engagement parties, Studio portraits, Baby showers, and One-day Corporate meetings.

### Data Schema
* `bookingType`: `'oneTime'`
* `eventDate`: Single `Timestamp` (e.g. `2026-10-15`)
* `startTime`: e.g. `'09:00'` | `endTime`: e.g. `'18:00'`
* `location`: Single venue address

### End-to-End Execution Flow
1. **Booking Creation (`/clients/new`)**:
   - Operator selects **One-time Event**.
   - Specifies client details, single event date, start/end time, and venue.
   - Assigns package deliverables and records initial advance (GPay, Cash, Bank Transfer).
   - Generates sequential invoice (e.g. `ZS-INV-2026-042`).
2. **Calendar Scheduling (`/events/calendar`)**:
   - The engine plots a single event badge on `eventDate`.
   - Sidebar displays call times, allocated staff avatars, and direct links.
3. **Event Board Timeline (`/events`)**:
   - Displays a single "Main Shoot Day" timeline node.
   - Equipment and staff are allocated for this single operational day.
4. **Event Day Execution**:
   - Photographers/cinematographers clock in via HRMS timeclock.
   - Post-shoot: memory cards dumped to studio storage, and the RAW backup gate is confirmed.
5. **Post-Production**:
   - Two parallel tracks execute on the shoot's footage:
     - **Photo Track**: RAW Selection ──▶ Color Grade/Retouch ──▶ Client Review ──▶ Album Design
     - **Video Track**: Footage Ingest ──▶ Rough Cut ──▶ Teaser/Reel ──▶ Full Film ──▶ Client Approval
6. **Delivery & Archival**:
   - Final deliverables released.
   - Balance payment recorded (reducing `balanceDue` to ₹0).
   - Client sign-off ticked ──▶ Handover finalized ──▶ Project shifts to **Done** rail.

---

```
========================================================================================
TYPE 2: MULTI-DATE EVENT (multiDate)
========================================================================================
```

### Overview
Designed for weddings, cultural festivities, and multi-day conferences requiring coverage across several distinct dates and locations.

### Data Schema
* `bookingType`: `'multiDate'`
* `eventDates`: Array of `EventDateEntry` objects:
  ```typescript
  interface EventDateEntry {
    id: string
    date: Date
    label: string      // e.g. "Engagement", "Mehendi", "Wedding Muhurtham", "Reception"
    location?: string  // Per-date venue override
    startTime?: string // e.g. "06:00"
    endTime?: string   // e.g. "14:00"
  }
  ```

### End-to-End Execution Flow
1. **Booking Creation (`/clients/new`)**:
   - Operator chooses **Multi-date Event**.
   - Dynamic schedule builder allows adding $N$ dates, each with its own date, label, time window, and venue.
   - Package pricing accounts for multi-day coverage.
2. **Automatic Calendar Scheduling (`/events/calendar`)**:
   - The calendar plots each function on its exact calendar day:
     - *14 Nov 2026:* `Karthik weds Priya — Engagement`
     - *15 Nov 2026:* `Karthik weds Priya — Haldi & Sangeet`
     - *16 Nov 2026:* `Karthik weds Priya — Wedding Muhurtham`
     - *16 Nov 2026:* `Karthik weds Priya — Grand Reception`
   - Prevents crew and kit double-booking across overlapping days.
3. **Event Board Canvas (`/events`)**:
   - Top of canvas displays interactive **Day Tabs** (`Day 1: Engagement`, `Day 2: Sangeet`, etc.).
   - Switching tabs displays the specific date's venue, timings, and dedicated operational gates:
     - Crew call sheets per day.
     - Equipment checkout per day.
     - Memory card dump & backup verification per day.
4. **Post-Production**:
   - Footage is cataloged by shoot day (`/RAW/Day1_Engagement`, `/RAW/Day2_Wedding`).
   - Editors can release intermediate teasers for Day 1 while Day 3 is still in editing.
   - Unified master album and wedding film encapsulate all shoot days.
5. **Delivery & Archival**:
   - Handover requires verification that deliverables from **all shoot days** are bundled.
   - Sign-off and balance settlement trigger project completion.

---

```
========================================================================================
TYPE 3: RECURRING / CONTRACT EVENT (recurring)
========================================================================================
```

### Overview
Built for ongoing studio contracts, corporate content retainers, weekly podcast series, school sports coverage, and monthly commercial product sessions.

### Data Schema
* `bookingType`: `'recurring'`
* `recurringSchedule`:
  ```typescript
  interface RecurringSchedule {
    frequency: 'weekly' | 'biweekly' | 'monthly'
    startDate: Date
    endDate: Date
    totalSessions: number
    perSessionRate: number
    paymentType?: 'perSession' | 'custom'
    sessionStartTime?: string
    sessionEndTime?: string
  }
  ```
* `sessionMilestones`: Tracks photo/video progress and delivery status per session index (`session_0`, `session_1`, ...).

### End-to-End Execution Flow
1. **Booking Creation (`/clients/new`)**:
   - Operator selects **Recurring / Contract**.
   - Chooses **Frequency** (`Weekly`, `Bi-weekly`, or `Monthly`).
   - Selects **Start Date** and **Total Sessions** (e.g. 12 sessions).
   - **Live Schedule Generation:** The system instantly computes and displays the full schedule of all 12 session dates, days of the week, and timings, automatically syncing the contract `endDate`.
   - Supports Per-Session pricing or consolidated contract totals.
2. **Automatic Calendar Population (`/events/calendar`)**:
   - The calendar engine expands the recurring rule across the upcoming months.
   - Every session automatically appears on its calculated date:
     - *Session 1:* Fri, 11 Sep 2026
     - *Session 2:* Fri, 18 Sep 2026
     - *Session 3:* Fri, 25 Sep 2026...
   - Displays session timing (`09:00 – 18:00`), stage status, and assigned studio bay.
3. **Discrete Session Projects Architecture (`/events`)**:
   - Rather than forcing all sessions into a single cluttered monolithic canvas, booking a recurring contract creates $N$ discrete session projects:
     - `Church Videography — Session 1 (11 Sep 2026)`
     - `Church Videography — Session 2 (18 Sep 2026)`
     - `Church Videography — Session 3 (25 Sep 2026)...`
   - Each session project is linked to the parent client via `bookingGroupId` and contains `sessionIndex: 1..N`, `totalSessions: N`, and `sessionRate`.
   - **Clean Linear Canvas:** Each session renders the standard, uncluttered 6-stage lifecycle (`Booked` → `Planning` → `Pre-Production` → `Event Day` → `Post-Production` → `Delivered`), completely eliminating canvas wire clutter.
   - **Independent Progression:** Session 1 can be completed and delivered while Session 4 is still in planning.
   - **Dedicated Work Items:** In `/events/work-board`, editors and videographers can be assigned tasks specifically against each discrete session project.
4. **Billing Models**:
   - **Per-Session Billing:** Invoices generated incrementally after each session completes.
   - **Consolidated Retainer:** Advance deposit covers monthly quota; overages billed separately.
5. **Contract Completion**:
   - Client overview displays all discrete sessions with real-time links to their individual canvases.
   - Handover gate confirms all $N$ sessions have been delivered.
   - Final account reconciliation clears any outstanding balance.

---

## 4. Architectural Comparison Matrix

| Dimension | One-Day Event (`oneTime`) | Multi-Date Event (`multiDate`) | Recurring Event (`recurring`) |
|---|---|---|---|
| **Use Cases** | Birthdays, single-day weddings, portraits | Traditional weddings, multi-day summits | Corporate retainers, podcast series, studios |
| **Schedule Model** | Single calendar day | Heterogeneous dated list of functions | Fixed frequency interval (Weekly, Bi-weekly, Monthly) |
| **Booking UI** | Single date picker | Dynamic "Add another date" rows | Frequency selector + Sessions with live date generation |
| **Calendar View** | 1 badge on shoot date | Distinct badge per function date | Recurring badges automatically scheduled across months |
| **Event Canvas** | Single linear canvas | Interactive Function Tabs (`Day 1`, `Day 2`, ...) | Interactive Session Tabs (`Session 1`, `Session 2`, ...) |
| **Crew Assignment** | 1 crew roster | Crew can vary per function | Dedicated recurring crew or rotating staff |
| **Kit Management** | Single ERP checkout/check-in | Multi-day checkout with intermediate swaps | Periodic weekly/monthly gear reservation |
| **RAW Media Intake** | 1 storage dump batch | Per-function media dumps and cards | Per-session memory card dumps & verification |
| **Post-Production** | Single project pipeline | Multi-folder project; unified master film | Independent per-session editing sprints |
| **Invoicing Model** | Advance + Balance (up to 3 instalments) | Advance + Milestone payments | Per-session billing or Retainer milestone |
| **Completion Gate** | Single day sign-off + ₹0 balance | All functions verified + ₹0 balance | All contract sessions fulfilled + client sign-off |

---

## 5. Post-Production Parallel Tracks & Client Review Cycle

During Stage 5 (**Post-Production**), the system runs parallel sub-tracks configured during the Booked stage:

```
                      ┌── Photography Track ──▶ RAW Select ──▶ Color Grade ──▶ Gallery Review ──┐
                      │                                                                        │
[Media Dump Verified] ├── Album Design Track ──▶ Layout Design ──▶ Client Proof ──▶ Print/Bind ─┼──▶ [Handover Ready]
                      │                                                                        │
                      ├── Video Highlights   ──▶ Story Cut ──▶ Color/Audio ──▶ Teaser Approval ┤
                      │                                                                        │
                      └── Full Video Film    ──▶ Rough Assembly ──▶ Master Film ──▶ 4K Export ─┘
```

### Client Review Decisions
When a track enters client review:
* **Approved:** Stage advances to the next post-production milestone or completes the track.
* **Not Approved / Revisions:** Operator enters revision notes (e.g. skin retouching, music change). The track status resets to in-progress with a revision iteration counter.
* **Review Not Required:** If configured at booking as "No client review needed", the track auto-passes upon staff completion.

---

## 6. Strict Handover & Financial Settlement Gates

In accordance with Studio Zoom workspace constraints:
1. **Zero Balance Due:** A project cannot be closed if `balanceDue > 0`. The Delivered stage warns with an alert showing the due amount and provides a 1-click **Record Payment** modal.
2. **Client Sign-off:** The client must physically or digitally approve deliverables. Ticking **"Client sign-off received"** activates the final handover button.
3. **Execution Timestamping:** Clicking **"Complete Event Handover"**:
   - Sets `status: 'completed'` on the Firestore project document.
   - Records `stageCompletedAt.delivered = serverTimestamp()`.
   - Stores `stageGates.delivered['Client sign-off received'] = true`.
   - Moves the project strictly into the **Done** tab on the Event Board.

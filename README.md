# Studio Zoom — Photography & Video Studio Management

> **All-in-one CRM · HRMS · ERP · Events** platform built for professional photography and video studios.

[![Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-black?logo=vercel)](https://studio-zoom-v1.vercel.app)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![Firebase](https://img.shields.io/badge/Firebase-v12-orange?logo=firebase)](https://firebase.google.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org/)

---

## 📖 Overview

Studio Zoom is a multi-module web application covering every operational need of a studio business:

| Module | Description |
|---|---|
| **Dashboard** | KPI overview — revenue, bookings, leads, staff |
| **CRM / Clients** | Full client profiles, contact history, pipeline |
| **Leads** | Lead capture, status tracking, conversion |
| **Events** | Shoot calendar, work-board, editing board |
| **HRMS** | Staff management, attendance, timeclock, payslips, salary |
| **ERP** | Equipment checkout, invoices, quotations, expenses, cashflow, accounts |
| **Notifications** | System notifications per user |
| **Settings** | Studio profile, user preferences |

---

## 🚀 Live Deployments

| Environment | URL | Firebase Project |
|---|---|---|
| **Production** | [studio-zoom-v1.vercel.app](https://studio-zoom-v1.vercel.app) | `studio-zoom-production` |
| **Staging/Preview** | Vercel Preview URL (any PR to `dev`) | `studio-zoom` |

---

## 🧱 Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript 5 |
| UI | Vanilla CSS + Custom Design System (`_ds`) |
| State | Zustand |
| Data Fetching | Firebase Realtime listeners + React Query |
| Auth | Firebase Authentication (Email/Password) |
| Database | Firestore (per-environment projects) |
| Storage | Firebase Storage |
| Forms | React Hook Form + Zod |
| Hosting | Vercel |
| CI/CD | GitHub Actions |

---

## 📁 Folder Structure

```
studio-zoom/
├── app/                          # Next.js App Router
│   ├── (auth)/                   # Auth route group (no sidebar)
│   │   └── login/page.tsx
│   ├── (app)/                    # Authenticated route group
│   │   ├── layout.tsx            # Sidebar + TopBar shell
│   │   ├── dashboard/page.tsx
│   │   ├── clients/
│   │   │   ├── page.tsx          # Clients list
│   │   │   ├── new/page.tsx      # New client form
│   │   │   └── [id]/page.tsx     # Client detail
│   │   ├── leads/
│   │   ├── events/
│   │   │   ├── page.tsx          # Events overview
│   │   │   ├── calendar/page.tsx
│   │   │   ├── work-board/page.tsx
│   │   │   └── editing/page.tsx
│   │   ├── hrms/
│   │   │   ├── staff/
│   │   │   ├── freelancers/
│   │   │   ├── attendance/page.tsx
│   │   │   ├── timeclock/page.tsx
│   │   │   ├── timelogs/page.tsx
│   │   │   ├── salary/
│   │   │   └── payslips/
│   │   ├── erp/
│   │   │   ├── equipment/
│   │   │   ├── invoices/page.tsx
│   │   │   ├── quotations/
│   │   │   ├── expenses/page.tsx
│   │   │   ├── cashflow/page.tsx
│   │   │   └── accounts/page.tsx
│   │   ├── notifications/page.tsx
│   │   └── settings/page.tsx
│   ├── layout.tsx                # Root layout (loads DS bundle)
│   ├── providers.tsx             # QueryClient + AuthStore bootstrap
│   └── globals.css
│
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx           # App sidebar navigation
│   │   ├── TopBar.tsx            # Top bar with search & user
│   │   └── MobileNav.tsx         # Mobile bottom navigation
│   └── shared/
│       ├── Avatar.tsx
│       ├── Badge.tsx
│       ├── BackgroundBeams.tsx   # Animated login background
│       ├── ConfirmModal.tsx
│       ├── DataTable.tsx
│       ├── EmptyState.tsx
│       ├── KpiCard.tsx
│       ├── LoadingSkeleton.tsx
│       └── PageHeader.tsx
│
├── hooks/
│   ├── useAuth.ts                # Auth state listener + Zustand sync
│   ├── useRealtimeCollection.ts  # Generic Firestore collection hook
│   ├── useRealtimeDoc.ts         # Generic Firestore document hook
│   └── useRole.ts                # Role-based access helpers
│
├── lib/
│   ├── firebase/
│   │   ├── config.ts             # Firebase initialization
│   │   └── auth.ts               # Auth helpers (signIn, signOut)
│   └── utils/
│       ├── currency.ts           # INR formatting
│       ├── dates.ts              # Date formatting helpers
│       ├── gates.ts              # Role gate utility functions
│       └── conflicts.ts          # Booking conflict detection
│
├── store/
│   ├── authStore.ts              # Zustand auth state slice
│   └── uiStore.ts                # Zustand UI state slice (sidebar, etc.)
│
├── types/
│   └── index.ts                  # All shared TypeScript interfaces
│
├── scripts/
│   ├── seed-admin.mjs            # Seed admin user → Dev Firebase
│   ├── seed-admin-prod.mjs       # Seed admin user → Prod Firebase
│   └── sync-vercel-env.mjs       # Push local .env files to Vercel
│
├── public/
│   └── _ds/                      # Nova Design System static bundle
│       └── nova-design-system-.../
│           ├── _ds_bundle.js
│           ├── _ds_bundle.css
│           └── fonts/
│
├── firestore.rules               # Firestore security rules
├── firestore.indexes.json        # Composite indexes
├── firebase.json                 # Firebase deploy config
├── .env.example                  # Template — commit this, not .env.*
├── .env.development              # Dev Firebase keys (gitignored)
├── .env.production               # Prod Firebase keys (gitignored)
├── AGENTS.md                     # Team contribution rules
└── next.config.ts
```

---

## ⚙️ Prerequisites

- Node.js `≥ 18` (v20+ recommended)
- npm `≥ 9`
- Firebase CLI: `npm install -g firebase-tools`
- Vercel CLI: `npm install -g vercel` *(optional, for env sync)*
- Git

---

## 🛠️ Local Setup

### 1. Clone the repository

```bash
git clone https://github.com/StudioZoom-Development/StudioZoom-v1.git
cd StudioZoom-v1/studio-zoom
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Copy the example file and fill in the Firebase keys (get them from the team password vault):

```bash
cp .env.example .env.local
```

`.env.local` — paste your dev/staging Firebase credentials here:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_APP_ENV=development
```

### 4. Start the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🔐 Firebase Setup

### Authentication
- Email/Password provider enabled in Firebase Console.
- After cloning, seed the initial admin account:
  ```bash
  node scripts/seed-admin.mjs          # for dev project
  node scripts/seed-admin-prod.mjs     # for prod project
  ```

### Firestore Rules
Deploy the security rules whenever `/firestore.rules` changes:
```bash
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```
> **Never edit rules directly in the Firebase Console for production changes.**

---

## 🚢 Deployment

### Vercel (automatic via CI)

| Git Branch | Vercel Environment | Firebase |
|---|---|---|
| `dev` | Preview/Staging | `studio-zoom` |
| `main` | Production | `studio-zoom-production` |

Merging any Pull Request automatically triggers a Vercel build. No manual deployment needed.

### Environment Variables on Vercel

All `NEXT_PUBLIC_*` keys must be configured in the Vercel project's **Settings → Environment Variables** panel. See [AGENTS.md](./AGENTS.md) for the full list of required keys.

### Manual deploy commands (advanced)
```bash
# Build check before PR
npm run build

# Lint check
npm run lint
```

---

## 🌿 Git Contribution Guide

### Branching model

```
main          ← Production (protected)
  └── dev     ← Staging/Integration
        └── feature/<name>   ← Your work
        └── fix/<name>
```

### Workflow

```bash
# Start a new feature
git checkout dev && git pull origin dev
git checkout -b feature/crm-lead-pipeline

# Commit using Conventional Commits
git add .
git commit -m "feat(crm): add lead pipeline kanban view"

# Push and open Pull Request → target: dev
git push origin feature/crm-lead-pipeline
```

### Commit types
`feat` · `fix` · `chore` · `docs` · `refactor` · `style` · `test` · `perf`

### PR Rules
1. No direct push to `main` or `dev` — PRs only.
2. 1 reviewer approval required before merge.
3. PR must describe: **what**, **why**, and **how tested**.
4. Squash-merge feature branches into `dev`.
5. Delete branches after merge.
6. `dev → main` merges happen as release PRs before client milestones.

> Full details in [AGENTS.md](./AGENTS.md)

---

## 🔑 User Roles

| Role | Permissions |
|---|---|
| `admin` | Full access — all modules, user management |
| `manager` | All operational modules, no user management |
| `staff` | Limited access — own timeclock, assigned events |

Roles are defined in Firestore under `users/{uid}.role` and enforced via Firestore security rules + client-side gates in `/lib/utils/gates.ts`.

---

## 🤝 Team Handoff Checklist

For a new developer joining the team:

- [ ] Obtain Firebase Dev credentials from password vault → create `.env.local`
- [ ] Run `npm install` and `npm run dev`
- [ ] Verify login at `localhost:3000/login`
- [ ] Review `AGENTS.md` for contribution rules
- [ ] Review `types/index.ts` for domain types
- [ ] Review `firestore.rules` for security model

---

## 📄 License

Private — Studio Zoom Productions. All rights reserved.

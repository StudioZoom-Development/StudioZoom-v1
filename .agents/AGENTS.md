# Studio Zoom — Antigravity Workspace Rules

These rules are non-negotiable constraints for every component, screen, and UI element
built in this project. They apply to every file Antigravity creates or edits.
If a rule conflicts with a request, **the rule wins**.

---

## Git Rules

### Branching
- NEVER commit or push directly to `main` or `dev`. Always create a feature/fix branch first.
- Always branch from `dev` for new features and bug fixes: `git checkout dev && git pull origin dev && git checkout -b feature/<desc>`.
- Branch naming conventions:
  - New feature: `feature/<short-desc>`
  - Bug fix: `fix/<short-desc>`
  - Hotfix from production: `hotfix/<short-desc>`
- Hotfixes must be merged to BOTH `main` and `dev` after completion.
- Delete branches after they are merged.

### Commit Messages
- All commits MUST follow Conventional Commits format: `<type>(<scope>): <short description>`
- Valid types: `feat`, `fix`, `chore`, `docs`, `refactor`, `style`, `test`, `perf`
- Examples:
  - `feat(crm): screen 05 — client list with real-time Firestore`
  - `feat(hrms): screen 14 — attendance grid with monthly navigation`
  - `fix(ui): badge inquiry variant missing background colour`
  - `chore(deps): bump firebase to 10.x`
- Never write vague commit messages like `update`, `fix`, `changes`, or `WIP`.

### Pull Requests
- Always remind the user to open a PR targeting `dev` (not `main`) for feature/fix branches.
- `dev → main` merges should only happen as release PRs before client milestones.
- Always squash-merge feature branches into `dev`.

---

## Environment & Secrets

- NEVER read, print, or suggest committing `.env.development`, `.env.production`, or `.env.local` files.
- NEVER suggest adding secret values directly in code or in chat.
- Always refer to `.env.example` as the template — it has keys but no values.
- When a collaborator needs credentials, instruct them to use a password manager vault, not chat/email.

---

## Firebase Rules

- Firestore security rules MUST be deployed via CLI: `firebase deploy --only firestore:rules`
- NEVER suggest editing Firestore rules directly in the Firebase Console for production changes.
- Composite indexes must be deployed via: `firebase deploy --only firestore:indexes`
- Use separate Firebase projects for dev (`studio-zoom`) and production (`studio-zoom-production`). Never mix them.

---

## Code Quality

- All code must pass `npx tsc --noEmit` and `npm run build` before marking a task as complete.
- Avoid TypeScript `any` types — use proper interfaces from `/types/index.ts`.
- Every function must have explicit parameter and return types.
- Reusable components go in `/components/shared/`. Page-specific components go inside the route folder.
- Never re-implement Firebase logic inline. Use existing hooks: `useAuth`, `useRealtimeCollection`, `useRealtimeDoc`, `useRole`.
- Role-based access must use the gate utilities in `/lib/utils/gates.ts`.

---

## Vercel & Deployment

- Environment variables are managed in Vercel Project Settings, NOT in committed files.
- `dev` branch → Vercel Preview (connects to `studio-zoom` Firebase dev project).
- `main` branch → Vercel Production (connects to `studio-zoom-production` Firebase project).
- After adding Vercel env vars, always redeploy to bake them into the build.

---

## 1. Theme System — The Absolute Source of Truth

The file `studio-theme.css` (in project root) defines every colour, surface, and
typography token for this application. It is the ONLY source of design values.

```css
/* studio-theme.css defines these on [data-theme="dark"] and [data-theme="light"] */

/* SURFACES */
--color-background      /* page body — #000000 dark / #ffffff light */
--color-surface         /* cards, sidebar, panels — #181d19 / #efefeb */
--color-surface-raised  /* inputs, dropdowns, elevated cards — #1e2420 / #e8e8e4 */
--color-surface-overlay /* modals, popovers — #242b25 / #e0e0db */

/* TEXT */
--color-foreground        /* primary text — #f3f2e7 / #151810 */
--color-foreground-muted  /* secondary text, labels — #9a9a8a / #5a5a50 */
--color-foreground-subtle /* placeholders, disabled, column headers — #5a5a50 / #9a9a8a */

/* BORDERS */
--color-border        /* default borders — #2a302b / #d8d8d0 */
--color-border-strong /* emphasized borders, table headers — #3a4040 / #b8b8b0 */

/* BRAND — SAME IN BOTH THEMES */
--color-primary        /* #c6539f — active nav, primary buttons, badges */
--color-primary-hover  /* #d966ad / #b04590 */
--color-primary-muted  /* #2a1220 / #f5e0ef — primary tint backgrounds */
--color-secondary      /* #eca82f dark / #d18f1a light — warnings, overdue */
--color-secondary-muted /* #2a1f08 / #fdf3de */
--color-accent         /* #5b73f0 dark / #213bdb light — links, info */
--color-accent-muted   /* #0a1040 / #e0e4f8 */

/* SEMANTIC */
--color-success        /* #4caf50 dark / #2e7d32 light */
--color-success-muted  /* #0d2010 / #e8f5e9 */
--color-danger         /* #ef5350 dark / #c62828 light */
--color-danger-muted   /* #2a0a0a / #ffebee */
--color-warning        /* same as secondary */
--color-warning-muted  /* same as secondary-muted */
--color-purple         /* #a78bfa dark / #7c5cd6 light — post-prod stage */
--color-purple-muted   /* #1e1233 / #ede8fb */

/* TYPOGRAPHY — Minor Third Scale (same in both themes) */
--text-xs:   0.694rem   /* 11px — badges, metadata, column headers */
--text-sm:   0.833rem   /* 13px — body text, labels, nav items */
--text-base: 1rem       /* 16px — default body */
--text-lg:   1.2rem     /* 19px — card titles, section headings */
--text-xl:   1.44rem    /* 23px — page section headings */
--text-2xl:  1.728rem   /* 28px — page titles, client names */
--text-3xl:  2.074rem   /* 33px — KPI numbers */
--text-4xl:  2.488rem   /* 40px — hero stats */
--text-5xl:  2.986rem   /* 48px — display only */

/* FONT */
--font-inter: "Inter", system-ui, sans-serif  /* the ONLY font used */
```

---

## 2. The Three Unbreakable Colour Rules

### RULE 1 — Never hardcode a hex colour value. Ever.

Only allowed hardcoded colour values:
- `#ffffff` for white text ON a primary/accent button (button foreground only)
- `transparent` for ghost button backgrounds
- `rgba(0,0,0,0.7)` for modal backdrops only

### RULE 2 — Every component must work in BOTH dark and light theme.

Never write a component that assumes dark or light mode.
Always use CSS variables so the component automatically adapts when `data-theme` toggles.

### RULE 3 — data-theme must be on the root wrapper at all times.

In `/app/(app)/layout.tsx`, the outermost div must have `data-theme={theme}` from `useUIStore()`.
Without `data-theme`, ALL colour variables resolve to nothing and the page appears unstyled.

---

## 3. Component Styling Standard

All UI elements use **inline styles with CSS variables**.
Tailwind is used **only for structural layout utilities** (flex, grid, overflow, hidden, block, md:flex, etc.), never for colours, spacing tokens, or typography.

### Icon usage (Tabler Icons webfont — always):

Format: `className="ti ti-[icon-name]"`
NEVER use `@tabler/icons-react` SVG components — use the webfont class only.

---

## 4. Stage / Status Badge Colour Map

Every badge must use these exact pairings via `<Badge variant="..." />` from `/components/shared/Badge.tsx`:

- `booked` → accent-muted / accent
- `planning` → primary-muted / primary
- `preProduction` → secondary-muted / secondary
- `eventDay` → danger-muted / danger
- `postProduction` → purple-muted / purple
- `delivered` → success-muted / success
- `paid` → success-muted / success
- `partial` → secondary-muted / secondary
- `unpaid` → danger-muted / danger
- `overdue` → danger-muted / danger
- `inquiry` → surface-raised / foreground-muted
- `available` → success-muted / success
- `out` → secondary-muted / secondary
- `service` → surface-raised / foreground-muted
- `free` → success-muted / success
- `occupied` → secondary-muted / secondary
- `overloaded` → danger-muted / danger
- `todo` → surface-raised / foreground-muted
- `inProgress` → accent-muted / accent
- `review` → secondary-muted / secondary
- `done` → success-muted / success

---

## 5. Typography Rules

```
Page titles:      var(--text-2xl), fontWeight: 700, letterSpacing: -0.02em
Section headings: var(--text-xl),  fontWeight: 600
Card titles:      var(--text-lg),  fontWeight: 600
Body / labels:    var(--text-sm),  fontWeight: 400 or 500
Metadata:         var(--text-xs),  fontWeight: 500 or 600
KPI numbers:      var(--text-3xl), fontWeight: 700, color: var(--color-primary)
```

Font is ALWAYS `var(--font-inter)`. Do not use Tailwind font utilities.

---

## 6. Layout & Spacing

**App shell dimensions (do not change):**
- Sidebar: width 220px, background var(--color-surface)
- TopBar: height 56px, background var(--color-surface)
- Content: max-width 1280px, padding 24px, background var(--color-background)

**Border width:** always `0.5px` for card and container borders. Never use `1px`.

---

## 7. Component File Rules

### Shared components — reuse, never recreate

From `/components/shared/`:
- `Badge.tsx` — all stage/status/payment pills
- `EmptyState.tsx` — empty list states
- `ConfirmModal.tsx` — destructive confirmation dialogs
- `LoadingSkeleton.tsx` — (Skeleton + TableRowSkeleton) loading placeholders

### shadcn components — these only:
```typescript
import { Button } from '@/components/ui/button'
import { Input }  from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
```

### Aceternity components — two only:
```typescript
import { BackgroundBeams } from '@/components/ui/background-beams'  // login only
import { Timeline }        from '@/components/ui/timeline'           // events canvas only
```

---

## 8. Firestore Query Rules

**NEVER write Firestore queries inline in a component or page file.**
All queries live exclusively in `/lib/firebase/queries/[collection].ts`.

Real-time subscriptions must return their unsubscribe function and be called in useEffect cleanup.
Timestamps must always be converted to Date objects.
**Soft deletes only — never hard delete** (use `isDeleted: true` pattern).
All queries must filter soft-deleted documents with `.filter(c => !c.isDeleted)`.

---

## 9. TypeScript Rules

- Strict mode is on. `any` is forbidden.
- Every Firestore document must be typed via `/types/index.ts`.
- Every function must have explicit parameter and return types.
- Run `npx tsc --noEmit` before every commit. Zero errors required.

---

## 10. Checklist Before Every Commit

```
☐ npx tsc --noEmit → zero errors
☐ npm run build    → clean build
☐ No hardcoded hex colours
☐ No inline Firestore queries in component files
☐ data-theme is on root layout wrapper
☐ Component tested in dark mode → looks correct
☐ Component tested in light mode → looks correct
☐ All badge variants use /components/shared/Badge.tsx
☐ All soft-deletes use isDeleted:true pattern
☐ No any TypeScript types
☐ Design file comparison: side-by-side with .dc.html → matches
```

---

## 11. Design File Reference

When building any screen, open the corresponding design file and match it exactly:

```
design-components/Studio Zoom.dc.html      → login, sidebar, topbar, shell
design-components/ScreenClients_dc.html    → clients list, detail, new booking
design-components/ScreenDashboards_dc.html → all 3 dashboards
design-components/ScreenEvents_dc.html     → events canvas, calendar, work board
design-components/ScreenCRM2_dc.html       → project detail, work items
design-components/ScreenHRMS_dc.html       → attendance, time clock
design-components/ScreenHRMS2_dc.html      → staff, salary, payslips, freelancers
design-components/ScreenERP_dc.html        → equipment, quotations
design-components/ScreenERP2_dc.html       → equipment checkout, held view
design-components/ScreenSettings_dc.html   → settings
design-components/studio-theme.css         → ALL colour tokens
```

---

*Studio Zoom · Antigravity Workspace Rules · Bytevators · July 2026*

---

## 14. Design System Components — Per Screen Reference

> **Rule:** Only the components listed per screen may be used for that screen.
> All tables, badges, avatars, kanban cards, calendars, and attendance grids use token-styled custom markup — NOT prebuilt component library equivalents.

| Screen / File | Allowed DS Components |
|---|---|
| **Studio Zoom.dc.html** (shell + login) | `BackgroundBeams` (login bg), `ShadcnInput` (email/password), `ShadcnButton` (Sign in) |
| **ScreenDashboards.dc.html** | `ShadcnButton` (New booking); hand-built buttons for staff check-in |
| **ScreenClients.dc.html** | `ShadcnButton` (New client, Record payment, Save/Create booking), `ShadcnInput` (booking form fields) |
| **ScreenEvents.dc.html** | `AceternityTimeline` (event lifecycle), `ShadcnButton` (Project detail / Edit event) |
| **ScreenHRMS.dc.html** (attendance, time clock) | `ShadcnButton` (Export CSV), `ShadcnInput` (date field) |
| **ScreenERP.dc.html** (equipment, quotations, invoices, cashflow) | `ShadcnButton` (checkout, new invoice, export, convert), `ShadcnInput` (quotation builder), `ShadcnSwitch` (GST toggle) |
| **ScreenCRM2.dc.html** (project detail, work items, leads) | `ShadcnButton` (Client record, Save/Cancel, New lead, Convert), `ShadcnInput` (work-item and lead form fields) |
| **ScreenHRMS2.dc.html** (staff, salary, payslips, freelancers) | `ShadcnButton` (Add staff, Save, Generate payslip, Bulk generate, Add/Assign freelancer), `ShadcnInput` (profile, salary, advance, freelancer, date fields), `ShadcnSwitch` (freelancer active toggle) |
| **ScreenERP2.dc.html** (equipment detail, checkout, held, quotations, expenses, accounts) | `ShadcnButton` (Save, checkout/check-in, New quotation, Convert, Add expense, Export), `ShadcnInput` (equipment, checkout, expense, convert-modal fields) |
| **ScreenSettings.dc.html** | `ShadcnButton` (Upload/Remove, Save changes, Add package, Create user), `ShadcnInput` (branding, GST, numbering fields), `ShadcnSwitch` (Charge GST toggle) |

### Import paths
```typescript
import { Button } from '@/components/ui/button'           // ShadcnButton
import { Input }  from '@/components/ui/input'            // ShadcnInput
import { Switch } from '@/components/ui/switch'           // ShadcnSwitch
import { BackgroundBeams } from '@/components/ui/background-beams'  // login only
import { Timeline }        from '@/components/ui/timeline'           // events canvas only
```

### What is NEVER built from component libraries
- Tables → plain `<table>` with inline CSS tokens
- Badges / pills → `<Badge variant="..." />` from `/components/shared/Badge.tsx`
- Avatars / initials → hand-built `<div>` circles with `var(--color-primary-muted)`
- Kanban cards → plain `<div>` with `var(--color-surface)` and `var(--color-border)`
- Calendar grid → hand-built with `var(--color-surface-raised)` cells
- Attendance grid → hand-built table with token colours

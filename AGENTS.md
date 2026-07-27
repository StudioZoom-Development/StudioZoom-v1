# Studio Zoom — Contribution Rules

> These rules apply globally to every agent working on this repository.

---

## 1. Git Branching Strategy

| Branch | Purpose |
|---|---|
| `main` | **Production** — auto-deploys to Vercel Production (`studio-zoom-production` Firebase). Protected. No direct pushes. |
| `dev` | **Staging/Integration** — auto-deploys to Vercel Preview (`studio-zoom` Firebase). All feature work merges here first. |
| `feature/<short-desc>` | New features, branched from `dev` |
| `fix/<short-desc>` | Bug fixes, branched from `dev` (or `main` for hotfixes) |
| `hotfix/<short-desc>` | Urgent production fixes, branched from `main`, merged back to BOTH `main` and `dev` |

### Creating branches

```bash
# Feature
git checkout dev && git pull origin dev
git checkout -b feature/crm-lead-pipeline

# Bug fix
git checkout dev && git pull origin dev
git checkout -b fix/erp-duplicate-awb-guard

# Hotfix from production
git checkout main && git pull origin main
git checkout -b hotfix/auth-token-expiry
```

---

## 2. Commit Convention — Conventional Commits

```
<type>(<scope>): <short description>
```

### Types
| Type | When to use |
|---|---|
| `feat` | New feature |
| `fix` | Bug fix |
| `chore` | Tooling, deps, build changes |
| `docs` | Documentation only |
| `refactor` | Code restructure without behavior change |
| `style` | Formatting, no logic change |
| `test` | Adding or updating tests |
| `perf` | Performance improvement |

### Examples
```
feat(crm): add lead status pipeline view
fix(erp): correct duplicate AWB guard on new consignment
chore(deps): bump firebase to 10.x
docs(readme): update setup instructions
refactor(auth): simplify role-check hook
style: format with prettier
test(hrms): add attendance calculation unit tests
perf(dashboard): memoize KPI card data selectors
```

---

## 3. Pull Request Rules

- **No direct push to `main` or `dev`** — always via Pull Request.
- Minimum **1 reviewer approval** before merge (partners review each other's PRs).
- Every PR description must answer:
  1. **What** changed?
  2. **Why** was this change needed?
  3. **How** was it tested?
- **Squash-merge** feature/fix branches into `dev` for clean history.
- **Merge `dev` → `main`** via a release PR before each client delivery or milestone.
- **Delete branches** after merge.

---

## 4. Environment & Secrets Rules

- **Never share `.env.*` files over chat, email, or Slack.** Use a password manager (1Password, Bitwarden) to hand off credentials to teammates.
- `.env.example` must always be committed with keys but no values, so any new collaborator knows exactly what variables are needed.
- Use **separate Firebase projects** for staging vs. production — never mix dev work with live client data.
- All Firebase security rules are versioned in `/firestore.rules` and deployed via:
  ```bash
  firebase deploy --only firestore:rules
  ```
  Never edit rules directly in the Firebase Console for production changes.

---

## 5. `.gitignore` Essentials

The following must always be ignored and never committed:

```
.env*
!.env.example
node_modules/
.next/
*.log
.firebase/
firebase-debug.log
serviceAccountKey.json
.vercel/
```

---

## 6. Code Quality Rules

- All code must pass `npm run lint` and `npm run build` before merging.
- TypeScript `any` types are discouraged — use proper interfaces from `/types/index.ts`.
- Components must be placed in `/components/shared/` (reusable) or inside the route folder (page-specific).
- Use existing hooks (`useAuth`, `useRealtimeCollection`, `useRole`) — do not re-implement Firebase logic inline.
- Follow the existing role gate pattern using `/lib/utils/gates.ts`.

---

## 7. Design System Components — Per Screen Reference

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

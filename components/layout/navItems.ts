import type { UserRole } from '@/types'

export interface NavItem {
  id:    string
  label: string
  icon:  string
  href:  string
  roles: UserRole[]
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

export const CRM_ITEMS: NavItem[] = [
  { id: 'events',     label: 'Events Board', icon: 'ti-route',           href: '/events',            roles: ['admin','manager'] },
  { id: 'calendar',   label: 'Calendar',     icon: 'ti-calendar-event',  href: '/events/calendar',   roles: ['admin','manager'] },
  { id: 'work-board', label: 'Work Board',   icon: 'ti-layout-kanban',   href: '/events/work-board', roles: ['admin','manager'] },
  { id: 'editing',    label: 'Editing Queue',icon: 'ti-wand',            href: '/events/editing',    roles: ['admin','manager','staff'] },
  { id: 'clients',    label: 'Clients',      icon: 'ti-users',           href: '/clients',           roles: ['admin','manager'] },
  { id: 'leads',      label: 'Leads',        icon: 'ti-user-plus',       href: '/leads',             roles: ['admin','manager'] },
]

export const HRMS_ITEMS: NavItem[] = [
  { id: 'attendance',  label: 'Attendance',  icon: 'ti-checklist',    href: '/hrms/attendance',  roles: ['admin','manager','staff'] },
  { id: 'timeclock',   label: 'Time Clock',  icon: 'ti-clock',        href: '/hrms/timeclock',   roles: ['admin','manager','staff'] },
  { id: 'timelogs',    label: 'Time Logs',   icon: 'ti-history',      href: '/hrms/timelogs',    roles: ['admin','manager'] },
  { id: 'staff',       label: 'Staff',       icon: 'ti-id-badge-2',   href: '/hrms/staff',       roles: ['admin'] },
  { id: 'freelancers', label: 'Freelancers', icon: 'ti-user-star',    href: '/hrms/freelancers', roles: ['admin','manager'] },
  { id: 'salary',      label: 'Salary',      icon: 'ti-cash',         href: '/hrms/salary',      roles: ['admin'] },
  { id: 'payslips',    label: 'Payslips',    icon: 'ti-file-invoice', href: '/hrms/payslips',    roles: ['admin','staff'] },
]

export const ERP_ITEMS: NavItem[] = [
  { id: 'equipment',  label: 'Equipment',  icon: 'ti-camera',    href: '/erp/equipment',  roles: ['admin','manager'] },
  { id: 'quotations', label: 'Quotations', icon: 'ti-file-text', href: '/erp/quotations', roles: ['admin','manager'] },
  { id: 'invoices',   label: 'Invoices',   icon: 'ti-receipt',   href: '/erp/invoices',   roles: ['admin'] },
  { id: 'expenses',   label: 'Expenses',   icon: 'ti-wallet',    href: '/erp/expenses',   roles: ['admin'] },
  { id: 'cashflow',   label: 'Cashflow',   icon: 'ti-chart-bar', href: '/erp/cashflow',   roles: ['admin'] },
  { id: 'accounts',   label: 'Accounts',   icon: 'ti-scale',     href: '/erp/accounts',   roles: ['admin'] },
]

export const NAV_GROUPS: NavGroup[] = [
  { label: 'CRM',  items: CRM_ITEMS  },
  { label: 'HRMS', items: HRMS_ITEMS },
  { label: 'ERP',  items: ERP_ITEMS  },
]

/** All navigable hrefs — used for active-state resolution */
export const ALL_NAV_HREFS: string[] = [
  '/dashboard',
  ...CRM_ITEMS.map(i  => i.href),
  ...HRMS_ITEMS.map(i => i.href),
  ...ERP_ITEMS.map(i  => i.href),
  '/settings',
]

'use client'
import { useAuthStore } from '@/store/authStore'
import type { UserRole } from '@/types'

interface RolePermissions {
  role: UserRole | undefined
  isAdmin: boolean
  isManager: boolean
  isStaff: boolean
  isAdminOrManager: boolean
  can: (action: RoleAction) => boolean
}

type RoleAction =
  | 'manageUsers'
  | 'manageClients'
  | 'viewSalary'
  | 'editSalary'
  | 'viewPayslips'
  | 'manageEquipment'
  | 'manageExpenses'
  | 'viewTimeLogs'
  | 'manageSettings'
  | 'assignWork'
  | 'updateOwnWorkStatus'

const ROLE_PERMISSIONS: Record<UserRole, RoleAction[]> = {
  admin: [
    'manageUsers', 'manageClients', 'viewSalary', 'editSalary',
    'viewPayslips', 'manageEquipment', 'manageExpenses', 'viewTimeLogs',
    'manageSettings', 'assignWork', 'updateOwnWorkStatus',
  ],
  manager: [
    'manageClients', 'viewPayslips', 'manageEquipment',
    'viewTimeLogs', 'assignWork', 'updateOwnWorkStatus',
  ],
  staff: [
    'viewPayslips', 'updateOwnWorkStatus',
  ],
}

export function useRolePermissions(): RolePermissions {
  const role = useAuthStore(s => s.appUser?.role)

  const can = (action: RoleAction): boolean => {
    if (!role) return false
    return ROLE_PERMISSIONS[role].includes(action)
  }

  return {
    role,
    isAdmin:          role === 'admin',
    isManager:        role === 'manager',
    isStaff:          role === 'staff',
    isAdminOrManager: role === 'admin' || role === 'manager',
    can,
  }
}

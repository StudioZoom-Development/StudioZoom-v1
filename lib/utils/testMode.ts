import { useUIStore } from '@/store/uiStore'

export interface TestModeCheckOpts {
  isUser?: boolean
  email?:  string
  name?:   string
}

/**
 * Checks if a record should be included based on Test Dataset Mode.
 * - When Test Dataset Mode is OFF: returns true (all records shown).
 * - When Test Dataset Mode is ON:
 *   - Any record with createdAt >= cutoff is shown (created during test session).
 *   - Any record with createdAt < cutoff (or missing createdAt) is hidden.
 *   - Special exception: 'Studio Admin' (admin@studiozoom.in) in user management
 *     is ALWAYS preserved so admin can use the application.
 */
export function isAllowedByTestMode(
  createdAt: Date | unknown,
  opts?: TestModeCheckOpts
): boolean {
  if (typeof window === 'undefined') return true
  try {
    const { testDatasetMode, testModeCutoff } = useUIStore.getState()
    if (!testDatasetMode || !testModeCutoff) return true

    // Special exemption: Always preserve Studio Admin in user management
    if (opts?.isUser || opts?.email || opts?.name) {
      const email = (opts.email || '').toLowerCase().trim()
      const name = (opts.name || '').toLowerCase().trim()
      if (email === 'admin@studiozoom.in' || name === 'studio admin') {
        return true
      }
    }

    if (!createdAt) return false

    let time: number
    if (createdAt instanceof Date) {
      time = createdAt.getTime()
    } else if (typeof (createdAt as { toMillis?: () => number })?.toMillis === 'function') {
      time = (createdAt as { toMillis: () => number }).toMillis()
    } else if (typeof (createdAt as { seconds?: number })?.seconds === 'number') {
      time = (createdAt as { seconds: number }).seconds * 1000
    } else {
      time = new Date(createdAt as string | number).getTime()
    }

    if (isNaN(time)) return false
    return time >= testModeCutoff
  } catch {
    return true
  }
}

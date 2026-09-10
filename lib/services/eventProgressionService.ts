import { Client, Project, EventDateEntry } from '@/types'
import { computeRecurringSessionDates } from '@/lib/utils/dates'

export interface EventProgressionResult {
  isRecurring: boolean
  isMultiDate: boolean
  totalCount: number
  deliveredCount: number
  displayDate: Date | null
  displayLabel: string | null
  sessionRate: number
  effectiveBalanceDue: number
}

/**
 * Pure domain service calculating event progression, upcoming session/day dates,
 * and per-session billing allocation following Single Responsibility Principle.
 */
export function computeEventProgression(
  client: Client,
  linkedProjects: Project[] = []
): EventProgressionResult {
  const isRecurring = Boolean(
    client.bookingType === 'recurring' ||
    client.recurringSchedule ||
    client.bookingGroupId ||
    (client.projectIds && client.projectIds.length > 1) ||
    linkedProjects.some(p => p.bookingType === 'recurring' || p.sessionIndex !== undefined)
  )

  const isMultiDate = Boolean(
    !isRecurring && (
      client.bookingType === 'multiDate' ||
      (Array.isArray(client.eventDates) && client.eventDates.length > 1)
    )
  )

  // 1. Recurring Event Progression
  if (isRecurring) {
    const totalSessions =
      client.recurringSchedule?.totalSessions ||
      client.projectIds?.length ||
      linkedProjects.filter(p => p.sessionIndex !== undefined).length ||
      Math.max(1, linkedProjects.length)

    let deliveredSessions = linkedProjects.filter(p =>
      p.stage === 'delivered' ||
      p.status === 'completed' ||
      Boolean(p.stageCompletedAt?.delivered)
    ).length

    if (deliveredSessions === 0 && client.stage === 'delivered') {
      deliveredSessions = 1
    }
    deliveredSessions = Math.min(totalSessions, deliveredSessions)

    // Upcoming date from discrete projects
    let displayDate: Date | null = null
    let displayLabel: string | null = null

    if (linkedProjects.length > 0) {
      const sortedProjs = [...linkedProjects].sort((a, b) => {
        const idxA = a.sessionIndex ?? 0
        const idxB = b.sessionIndex ?? 0
        if (idxA !== idxB) return idxA - idxB
        const tA = a.eventDate instanceof Date ? a.eventDate.getTime() : new Date(a.eventDate).getTime()
        const tB = b.eventDate instanceof Date ? b.eventDate.getTime() : new Date(b.eventDate).getTime()
        return tA - tB
      })

      const nextProj = sortedProjs.find(p =>
        p.stage !== 'delivered' &&
        p.status !== 'completed' &&
        !p.stageCompletedAt?.delivered
      )

      if (nextProj) {
        displayDate = nextProj.eventDate instanceof Date ? nextProj.eventDate : new Date(nextProj.eventDate)
        const sNum = nextProj.sessionIndex || (sortedProjs.indexOf(nextProj) + 1)
        displayLabel = `Session ${sNum} of ${totalSessions}`
      } else {
        const lastProj = sortedProjs[sortedProjs.length - 1]
        displayDate = lastProj?.eventDate instanceof Date ? lastProj.eventDate : lastProj?.eventDate ? new Date(lastProj.eventDate) : null
        displayLabel = `All ${totalSessions} sessions completed`
      }
    } else if (client.recurringSchedule) {
      const sessions = computeRecurringSessionDates(
        client.recurringSchedule.frequency || 'weekly',
        client.recurringSchedule.startDate,
        client.recurringSchedule.totalSessions || 1,
        client.recurringSchedule.sessionStartTime || client.startTime || '09:00',
        client.recurringSchedule.sessionEndTime || client.endTime || '18:00'
      )
      const nextIdx = Math.min(sessions.length - 1, deliveredSessions)
      const sess = sessions[nextIdx]
      if (sess) {
        displayDate = sess.date
        const allDone = deliveredSessions >= sessions.length
        displayLabel = allDone
          ? `All ${totalSessions} sessions completed`
          : `Session ${sess.sessionNumber} of ${totalSessions}`
      }
    }

    if (!displayDate) {
      displayDate = client.eventDate instanceof Date ? client.eventDate : client.eventDate ? new Date(client.eventDate) : null
    }

    // Per-session rate & balance allocation
    const clientTotal = client.totalAmount || 0
    const clientBalance = client.balanceDue !== undefined ? client.balanceDue : clientTotal
    const rawRate = client.recurringSchedule?.perSessionRate
    const sessionRate = rawRate && rawRate > 0 ? rawRate : (totalSessions > 0 ? Math.round(clientTotal / totalSessions) : clientTotal)

    const totalPaid = Math.max(0, clientTotal - clientBalance)
    // Target session for balance calculation
    const activeSessionIdx = Math.min(totalSessions, deliveredSessions + 1)
    const priorRequired = (activeSessionIdx - 1) * sessionRate
    const sessionPaid = Math.max(0, Math.min(sessionRate, totalPaid - priorRequired))
    const effectiveBalanceDue = Math.max(0, sessionRate - sessionPaid)

    return {
      isRecurring: true,
      isMultiDate: false,
      totalCount: totalSessions,
      deliveredCount: deliveredSessions,
      displayDate,
      displayLabel,
      sessionRate,
      effectiveBalanceDue,
    }
  }

  // 2. Multi-Date Event Progression
  if (isMultiDate) {
    const rawDates: EventDateEntry[] = Array.isArray(client.eventDates) ? client.eventDates : []
    const multiDays = rawDates.map((ed, i) => ({
      id: ed.id || String(i),
      label: ed.label || `Day ${i + 1}`,
      date: ed.date instanceof Date ? ed.date : new Date(ed.date),
    }))

    const totalDays = multiDays.length || 2
    let displayDate: Date | null = null
    let displayLabel: string | null = null

    if (multiDays.length > 0) {
      const sortedDays = [...multiDays].sort((a, b) => a.date.getTime() - b.date.getTime())
      const now = new Date()
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

      const nextDay = sortedDays.find(d => {
        const dayDate = new Date(d.date.getFullYear(), d.date.getMonth(), d.date.getDate())
        return dayDate >= today
      })

      if (nextDay) {
        const dayIdx = sortedDays.indexOf(nextDay) + 1
        displayDate = nextDay.date
        displayLabel = `${nextDay.label || `Day ${dayIdx}`} (${dayIdx} of ${sortedDays.length})`
      } else {
        const lastDay = sortedDays[sortedDays.length - 1]
        displayDate = lastDay.date
        displayLabel = `${sortedDays.length} days completed`
      }
    }

    if (!displayDate) {
      displayDate = client.eventDate instanceof Date ? client.eventDate : client.eventDate ? new Date(client.eventDate) : null
    }

    return {
      isRecurring: false,
      isMultiDate: true,
      totalCount: totalDays,
      deliveredCount: client.stage === 'delivered' ? totalDays : 0,
      displayDate,
      displayLabel,
      sessionRate: client.totalAmount || 0,
      effectiveBalanceDue: client.balanceDue !== undefined ? client.balanceDue : (client.totalAmount || 0),
    }
  }

  // 3. Single Day Event
  const singleDate = client.eventDate instanceof Date ? client.eventDate : client.eventDate ? new Date(client.eventDate) : null
  return {
    isRecurring: false,
    isMultiDate: false,
    totalCount: 1,
    deliveredCount: client.stage === 'delivered' ? 1 : 0,
    displayDate: singleDate,
    displayLabel: null,
    sessionRate: client.totalAmount || 0,
    effectiveBalanceDue: client.balanceDue !== undefined ? client.balanceDue : (client.totalAmount || 0),
  }
}

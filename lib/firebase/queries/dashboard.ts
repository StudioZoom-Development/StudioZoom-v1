import {
  collection,
  onSnapshot,
  collectionGroup,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import type {
  Client,
  Expense,
  Project,
  WorkItem,
  AppUser,
  TimeLog,
  Checkout,
} from '@/types'
import { getTodayDateString, subscribeToAllTodayTimeLogs } from './timeLogs'

export interface DashboardEventItem {
  id: string
  projectId?: string
  clientId: string
  name: string
  clientName: string
  eventDate: Date
  startTime?: string
  venue?: string
  stage: string
  packageType?: string
  team: { name: string; init: string; role?: string }[]
}

export interface DashboardAttendanceItem {
  uid: string
  name: string
  role: string
  time: string
  status: 'present' | 'late' | 'notInYet'
}

export interface DashboardCheckoutItem {
  checkoutId: string
  itemName: string
  itemCode?: string
  staffName: string
  dueBackDate: Date
  isOverdue: boolean
}

export interface DashboardAggregates {
  // Financials (Admin only)
  revenueMtd: number
  revenueGrowthPct: number
  pendingReceivables: number
  overdueClientsCount: number
  cashflowMonths: { month: string; income: number; outflow: number; net: number }[]

  // Operational (Admin & Manager)
  activeProjectsCount: number
  eventsThisMonthCount: number
  overdueEditingTasksCount: number
  awaitingClientReviewCount: number
  gearOnFieldCount: number
  gearOverdueCount: number

  // Feeds & Radars
  upcomingEvents: DashboardEventItem[]
  attendanceSummary: {
    totalStaff: number
    clockedInCount: number
    records: DashboardAttendanceItem[]
  }
  postProdRadar: {
    photoTrack: { inProgress: number; inReview: number; completed: number }
    albumTrack: { inProgress: number; inReview: number; completed: number }
    videoTrack: { inProgress: number; inReview: number; completed: number }
    fullVideoTrack: { inProgress: number; inReview: number; completed: number }
  }
  recentCheckouts: DashboardCheckoutItem[]
}

function getInitials(name: string): string {
  if (!name) return 'SZ'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/**
 * Main reactive aggregator for the Studio Zoom executive & operations dashboard.
 * Listens to underlying collections and produces a unified snapshot.
 */
export function subscribeToDashboardData(
  onData: (data: DashboardAggregates) => void
): () => void {
  let clients: Client[] = []
  let clientPayments: { amount: number; date: Date }[] = []
  let projects: Project[] = []
  let workItems: WorkItem[] = []
  let staffList: AppUser[] = []
  let todayTimeLogs: TimeLog[] = []
  let activeCheckouts: Checkout[] = []
  let expenses: Expense[] = []

  const computeAndEmit = () => {
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth() // 0-indexed

    // ─── 1. Financials (MTD & Receivables) ──────────────────────────────────
    let revenueMtd = 0
    let revenueLastMonth = 0

    // Sum from actual client payments
    for (const p of clientPayments) {
      if (!p.date || isNaN(p.date.getTime())) continue
      const pYear = p.date.getFullYear()
      const pMonth = p.date.getMonth()
      if (pYear === currentYear && pMonth === currentMonth) {
        revenueMtd += p.amount
      } else if (
        (currentMonth === 0 && pYear === currentYear - 1 && pMonth === 11) ||
        (pYear === currentYear && pMonth === currentMonth - 1)
      ) {
        revenueLastMonth += p.amount
      }
    }

    // Fallback: If no collectionGroup payments exist yet for clients with advance payments
    if (revenueMtd === 0 && clientPayments.length === 0) {
      for (const c of clients) {
        if (c.isDeleted) continue
        const raw = c as unknown as Record<string, unknown>
        const advance = Number(raw.advanceAmount) || 0
        const advDateRaw = raw.advanceDate
        if (advance > 0 && advDateRaw) {
          const advDate = advDateRaw instanceof Date ? advDateRaw : new Date(String(advDateRaw))
          if (advDate.getFullYear() === currentYear && advDate.getMonth() === currentMonth) {
            revenueMtd += advance
          }
        }
      }
    }

    const revenueGrowthPct = revenueLastMonth > 0
      ? Math.round(((revenueMtd - revenueLastMonth) / revenueLastMonth) * 100)
      : revenueMtd > 0 ? 100 : 0

    // Pending Receivables
    let pendingReceivables = 0
    let overdueClientsCount = 0
    for (const c of clients) {
      if (c.isDeleted) continue
      const bal = Number(c.balanceDue) || 0
      if (bal > 0) {
        pendingReceivables += bal
        const eventDate = c.eventDate ? new Date(c.eventDate) : new Date()
        if (c.paymentStatus === 'overdue' || eventDate.getTime() < now.getTime()) {
          overdueClientsCount++
        }
      }
    }

    // ─── 2. Active Projects & Events This Month ────────────────────────────
    let activeProjectsCount = 0
    let eventsThisMonthCount = 0

    for (const p of projects) {
      if (p.isDeleted) continue
      if (['planning', 'preProduction', 'eventDay', 'postProduction', 'booked'].includes(p.stage)) {
        activeProjectsCount++
      }
      if (p.eventDate) {
        const d = p.eventDate instanceof Date ? p.eventDate : new Date(p.eventDate)
        if (d.getFullYear() === currentYear && d.getMonth() === currentMonth) {
          eventsThisMonthCount++
        }
      }
    }

    // If projects is empty, fallback to clients
    if (activeProjectsCount === 0) {
      for (const c of clients) {
        if (c.isDeleted) continue
        if (['planning', 'preProduction', 'eventDay', 'postProduction', 'booked'].includes(c.status)) {
          activeProjectsCount++
        }
        if (c.eventDate) {
          const d = c.eventDate instanceof Date ? c.eventDate : new Date(c.eventDate)
          if (d.getFullYear() === currentYear && d.getMonth() === currentMonth) {
            eventsThisMonthCount++
          }
        }
      }
    }

    // ─── 3. Upcoming Events Timeline (Next 14 Days) ─────────────────────────
    const upcomingEvents: DashboardEventItem[] = []
    const fourteenDaysLater = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)

    // Helper map of staff names
    const staffMap = new Map<string, AppUser>()
    for (const s of staffList) staffMap.set(s.uid, s)

    for (const c of clients) {
      if (c.isDeleted) continue
      const eventDate = c.eventDate ? new Date(c.eventDate) : null
      if (!eventDate || isNaN(eventDate.getTime())) continue

      if (eventDate >= yesterday && eventDate <= fourteenDaysLater) {
        const matchingProject = projects.find(p => p.clientId === c.clientId && !p.isDeleted)
        const teamIds = matchingProject?.staffUids || c.staffUids || []
        const team = teamIds.slice(0, 3).map(uid => {
          const s = staffMap.get(uid)
          const name = s?.name || 'Staff'
          return { name, init: getInitials(name), role: s?.role }
        })

        upcomingEvents.push({
          id: matchingProject?.projectId || c.clientId,
          projectId: matchingProject?.projectId,
          clientId: c.clientId,
          name: c.eventName || c.name || 'Studio Event',
          clientName: c.name || 'Client',
          eventDate,
          startTime: c.eventDates?.[0]?.startTime || c.startTime || '09:00',
          venue: c.location || (c.eventDates?.[0]?.location) || 'Avadi Studio',
          stage: matchingProject?.stage || c.stage || 'planning',
          packageType: c.packageType || 'Custom',
          team,
        })
      }
    }

    // Sort upcoming events chronologically
    upcomingEvents.sort((a, b) => a.eventDate.getTime() - b.eventDate.getTime())

    // ─── 4. Work Board & Post-Production Radar ─────────────────────────────
    let overdueEditingTasksCount = 0
    let awaitingClientReviewCount = 0

    const postProdRadar = {
      photoTrack:     { inProgress: 0, inReview: 0, completed: 0 },
      albumTrack:     { inProgress: 0, inReview: 0, completed: 0 },
      videoTrack:     { inProgress: 0, inReview: 0, completed: 0 },
      fullVideoTrack: { inProgress: 0, inReview: 0, completed: 0 },
    }

    for (const item of workItems) {
      if (item.isDeleted) continue
      const isPastDue = item.dueDate && new Date(item.dueDate).getTime() < now.getTime() && item.status !== 'done'
      if (isPastDue) overdueEditingTasksCount++

      if (item.status === 'review') awaitingClientReviewCount++

      const trackKey = item.postProdTrackKey ||
        (item.type === 'photoEditing' || item.type === 'photoDesigning' ? 'photoTrack' :
         item.type === 'albumDesign' || item.type === 'albumDesigning' || item.type === 'albumCreating' ? 'albumTrack' :
         item.type === 'highlights' || item.type === 'highlightsEditing' || item.type === 'videoEditing' ? 'videoTrack' :
         item.type === 'fullFilm' || item.type === 'fullVideoEditing' ? 'fullVideoTrack' : null)

      if (trackKey && postProdRadar[trackKey]) {
        if (item.status === 'done') {
          postProdRadar[trackKey].completed++
        } else if (item.status === 'review') {
          postProdRadar[trackKey].inReview++
        } else if (item.status === 'inProgress' || item.status === 'todo') {
          postProdRadar[trackKey].inProgress++
        }
      }
    }

    // ─── 5. Attendance Pulse Today ──────────────────────────────────────────
    const clockedInStaffUids = new Set<string>()
    const timeLogMap = new Map<string, TimeLog>()

    for (const tl of todayTimeLogs) {
      if (tl.checkInAt) {
        clockedInStaffUids.add(tl.staffUid)
        if (!timeLogMap.has(tl.staffUid) || tl.status === 'open') {
          timeLogMap.set(tl.staffUid, tl)
        }
      }
    }

    const attendanceRecords: DashboardAttendanceItem[] = staffList
      .filter(s => s.role === 'staff' || s.role === 'manager')
      .map(s => {
        const tl = timeLogMap.get(s.uid)
        const isPresent = clockedInStaffUids.has(s.uid)
        let checkInTimeStr = 'Not in yet'

        if (tl?.checkInAt) {
          let d: Date | null = null
          const raw = tl.checkInAt as unknown
          if (raw instanceof Date) {
            d = raw
          } else if (typeof (raw as { toDate?: () => Date })?.toDate === 'function') {
            d = (raw as { toDate: () => Date }).toDate()
          } else if (typeof raw === 'object' && raw !== null && 'seconds' in raw && typeof (raw as { seconds: number }).seconds === 'number') {
            d = new Date((raw as { seconds: number }).seconds * 1000)
          } else if (typeof raw === 'string' || typeof raw === 'number') {
            const parsed = new Date(raw)
            if (!isNaN(parsed.getTime())) d = parsed
          }

          if (d && !isNaN(d.getTime())) {
            checkInTimeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
          }
        }

        return {
          uid: s.uid,
          name: s.name,
          role: s.role.toUpperCase(),
          time: checkInTimeStr,
          status: isPresent ? 'present' : 'notInYet',
        }
      })

    const attendanceSummary = {
      totalStaff: attendanceRecords.length,
      clockedInCount: clockedInStaffUids.size,
      records: attendanceRecords.slice(0, 8),
    }

    // ─── 6. Equipment & Checkouts ───────────────────────────────────────────
    let gearOnFieldCount = 0
    let gearOverdueCount = 0
    const recentCheckouts: DashboardCheckoutItem[] = []

    for (const co of activeCheckouts) {
      gearOnFieldCount++
      let dueBack = new Date()
      const rawDue = (co as unknown as Record<string, unknown>).dueBack
      if (rawDue) {
        if (typeof (rawDue as { toDate?: () => Date }).toDate === 'function') {
          dueBack = (rawDue as { toDate: () => Date }).toDate()
        } else if (rawDue instanceof Date && !isNaN(rawDue.getTime())) {
          dueBack = rawDue
        } else if (typeof rawDue === 'object' && 'seconds' in rawDue && typeof (rawDue as { seconds: number }).seconds === 'number') {
          dueBack = new Date((rawDue as { seconds: number }).seconds * 1000)
        } else if (typeof rawDue === 'string' || typeof rawDue === 'number') {
          const parsed = new Date(rawDue)
          if (!isNaN(parsed.getTime())) dueBack = parsed
        }
      }
      const isOverdue = co.status === 'overdue' || (dueBack.getTime() < now.getTime() && co.status !== 'returned')
      if (isOverdue) gearOverdueCount++

      if (recentCheckouts.length < 5) {
        recentCheckouts.push({
          checkoutId: co.checkoutId,
          itemName: co.itemName || 'Camera Gear',
          itemCode: co.itemCode,
          staffName: co.staffName || 'Staff Member',
          dueBackDate: dueBack,
          isOverdue,
        })
      }
    }

    // ─── 7. Cashflow Mini Strip (Last 6 Months) ─────────────────────────────
    const monthlyMap = new Map<string, { income: number; outflow: number }>()
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      monthlyMap.set(key, { income: 0, outflow: 0 })
    }

    for (const p of clientPayments) {
      if (!p.date || isNaN(p.date.getTime())) continue
      const key = `${p.date.getFullYear()}-${String(p.date.getMonth() + 1).padStart(2, '0')}`
      if (monthlyMap.has(key)) {
        monthlyMap.get(key)!.income += p.amount
      }
    }

    for (const e of expenses) {
      if (e.isDeleted) continue
      const date = e.date instanceof Date ? e.date : new Date(e.date)
      if (isNaN(date.getTime())) continue
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      if (monthlyMap.has(key)) {
        monthlyMap.get(key)!.outflow += Number(e.amount) || 0
      }
    }

    const cashflowMonths = Array.from(monthlyMap.entries()).map(([key, data]) => {
      const [yr, mo] = key.split('-')
      const d = new Date(Number(yr), Number(mo) - 1, 1)
      const monthLabel = d.toLocaleString('en-US', { month: 'short' })
      return {
        month: monthLabel,
        income: data.income,
        outflow: data.outflow,
        net: data.income - data.outflow,
      }
    })

    // Emit consolidated reactive snapshot
    onData({
      revenueMtd,
      revenueGrowthPct,
      pendingReceivables,
      overdueClientsCount,
      cashflowMonths,
      activeProjectsCount,
      eventsThisMonthCount,
      overdueEditingTasksCount,
      awaitingClientReviewCount,
      gearOnFieldCount,
      gearOverdueCount,
      upcomingEvents,
      attendanceSummary,
      postProdRadar,
      recentCheckouts,
    })
  }

  // Set up listeners with unsubscribe handlers
  const unsubClients = onSnapshot(collection(db, 'clients'), (snap) => {
    clients = snap.docs.map(d => ({ clientId: d.id, ...(d.data() as object) } as Client))
    computeAndEmit()
  }, () => {})

  const unsubPayments = onSnapshot(collectionGroup(db, 'payments'), (snap) => {
    clientPayments = snap.docs.map(d => {
      const data = d.data()
      const rawDate = data.date
      const date = rawDate?.toDate ? rawDate.toDate() : rawDate ? new Date(rawDate) : new Date()
      return {
        amount: Number(data.amount) || 0,
        date,
      }
    })
    computeAndEmit()
  }, () => {})

  const unsubProjects = onSnapshot(collection(db, 'projects'), (snap) => {
    projects = snap.docs.map(d => ({ projectId: d.id, ...(d.data() as object) } as Project))
    computeAndEmit()
  }, () => {})

  const unsubWorkItems = onSnapshot(collection(db, 'workItems'), (snap) => {
    workItems = snap.docs.map(d => ({ workItemId: d.id, ...(d.data() as object) } as WorkItem))
    computeAndEmit()
  }, () => {})

  const unsubStaff = onSnapshot(collection(db, 'users'), (snap) => {
    staffList = snap.docs.map(d => ({ uid: d.id, ...(d.data() as object) } as AppUser))
    computeAndEmit()
  }, () => {})

  const todayStr = getTodayDateString()
  const unsubTimeLogs = subscribeToAllTodayTimeLogs(todayStr, (logs) => {
    todayTimeLogs = logs
    computeAndEmit()
  })

  const unsubCheckouts = onSnapshot(collection(db, 'checkouts'), (snap) => {
    activeCheckouts = snap.docs
      .map(d => ({ checkoutId: d.id, ...(d.data() as object) } as Checkout))
      .filter(c => c.status === 'out' || c.status === 'overdue')
    computeAndEmit()
  }, () => {})

  const unsubExpenses = onSnapshot(collection(db, 'expenses'), (snap) => {
    expenses = snap.docs.map(d => ({ expenseId: d.id, ...(d.data() as object) } as Expense))
    computeAndEmit()
  }, () => {})

  return () => {
    unsubClients()
    unsubPayments()
    unsubProjects()
    unsubWorkItems()
    unsubStaff()
    unsubTimeLogs()
    unsubCheckouts()
    unsubExpenses()
  }
}

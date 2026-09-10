'use client'

import React, { useState, useEffect, useMemo, useRef, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { Project, ProjectStage, EventDateEntry, Freelancer, Client } from '@/types'
import {
  subscribeToProjects,
  updateProjectStage,
  updateProjectStageGates,
  updateTrackMilestone,
  updateSessionTrackMilestone,
  updateSessionDelivery,
  assignStaffToProject,
  removeStaffFromProject,
} from '@/lib/firebase/queries/projects'
import { subscribeToStaff, StaffMember } from '@/lib/firebase/queries/staff'
import {
  subscribeToFreelancers,
  assignFreelancerToProject,
  unassignFreelancerFromProject,
} from '@/lib/firebase/queries/freelancers'
import { useAuthStore } from '@/store/authStore'
import { useUIStore } from '@/store/uiStore'
import { Badge } from '@/components/shared/Badge'
import { Button } from '@/components/ui/button'
import { RecordPaymentModal } from '@/components/shared/RecordPaymentModal'
import {
  PostProdRequirements,
  PostProductionData,
  PostProdTrackKey,
  PostProdStageStatus,
  PostProdTrackStatus,
  PostProdPhotoTrack,
  PostProdAlbumTrack,
  PostProdVideoTrack,
  PostProdFullVideoTrack,
} from '@/types'
import {
  savePostProdRequirements,
  initializePostProduction,
  updateTrackStageStatus,
  updateTrackCheckbox,
  submitClientReview,
  updateTrackAssignment,
  updateStageDueDate,
  computeOverallDueDate,
  isPhotoTrackComplete,
  isAlbumTrackComplete,
  isVideoTrackComplete,
  isFullVideoTrackComplete,
} from '@/lib/firebase/queries/postProduction'
import { createPostProdWorkItems } from '@/lib/firebase/queries/workItems'

// ─── STAGE METADATA & EXIT GATES CONFIG ─────────────────────────────────────
interface StageConfig {
  name:         string
  stageKey:     ProjectStage
  icon:         string
  defaultDesc:  string
  defaultGates: string[]
  whenOffset:   string
}

const STAGE_CONFIGS: StageConfig[] = [
  {
    name:         'Booked',
    stageKey:     'booked',
    icon:         'ti-calendar-check',
    defaultDesc:  'Advance received, dates blocked on studio calendar, and quotation accepted.',
    defaultGates: ['Advance payment recorded', 'Quotation accepted by client'],
    whenOffset:   'At booking confirmation',
  },
  {
    name:         'Planning',
    stageKey:     'planning',
    icon:         'ti-clipboard-list',
    defaultDesc:  'Shot list preparation, venue recce/walkthrough, and primary crew allocation.',
    defaultGates: ['Shot list approved', 'Core team assigned', 'Venue walkthrough done'],
    whenOffset:   '2–3 weeks prior to shoot',
  },
  {
    name:         'Pre-Prod',
    stageKey:     'preProduction',
    icon:         'ti-package',
    defaultDesc:  'Equipment checkout, batteries & SD cards prep, freelancer confirmations, and travel schedule.',
    defaultGates: ['Equipment checked out', 'Freelancer crew confirmed'],
    whenOffset:   '3–5 days prior to shoot',
  },
  {
    name:         'Event Day',
    stageKey:     'eventDay',
    icon:         'ti-camera',
    defaultDesc:  'Live event coverage on site. Call time tracking and immediate dual raw backup upon pack-up.',
    defaultGates: ['All raw footage backed up (2 copies)'],
    whenOffset:   'Shoot day',
  },
  {
    name:         'Post-Prod',
    stageKey:     'postProduction',
    icon:         'ti-adjustments-alt',
    defaultDesc:  'Splits into parallel photo and video delivery tracks. Both tracks must finish before delivery.',
    defaultGates: ['Photo track completed', 'Video track completed'],
    whenOffset:   '1–4 weeks post event',
  },
  {
    name:         'Delivered',
    stageKey:     'delivered',
    icon:         'ti-box-check',
    defaultDesc:  'Final album, pen drive, and online gallery handover. Balance collected before release.',
    defaultGates: ['Outstanding balance = ₹0', 'Client sign-off received'],
    whenOffset:   'Final handover',
  },
]

const STAGE_ORDER: ProjectStage[] = [
  'booked',
  'planning',
  'preProduction',
  'eventDay',
  'postProduction',
  'delivered',
]

export const PHOTO_TRACK_MILESTONES = [
  'Selected Photos',
  'Raw Delivered',
  'Designing',
  'Client Review',
  'Creating Album',
  'Delivered',
]

export const VIDEO_TRACK_MILESTONES = [
  'Selected Video',
  'Raw Delivered',
  'Highlights',
  'Highlights Review',
  'Full Editing',
  'Final Video Review',
  'Delivered',
]

const MOCK_FALLBACK_PROJECTS: Project[] = []
const MOCK_STAFF: StaffMember[] = []
const MOCK_FREELANCERS: Freelancer[] = []

const formatDateTime = (d: unknown): string => {
  if (!d) return ''
  let date: Date
  if (d instanceof Date) {
    date = d
  } else if (typeof (d as { toDate?: () => Date }).toDate === 'function') {
    date = (d as { toDate: () => Date }).toDate()
  } else if (typeof d === 'object' && d !== null && 'seconds' in d && typeof (d as { seconds: number }).seconds === 'number') {
    date = new Date((d as { seconds: number }).seconds * 1000)
  } else if (typeof d === 'object' && d !== null && '_seconds' in d && typeof (d as { _seconds: number })._seconds === 'number') {
    date = new Date((d as { _seconds: number })._seconds * 1000)
  } else {
    date = new Date(d as string | number)
  }
  if (isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) + ' at ' + date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
}

const formatDisplayDate = (d: unknown): string => {
  if (!d) return '—'
  let date: Date
  if (d instanceof Date) date = d
  else if (typeof (d as { toDate?: () => Date }).toDate === 'function') date = (d as { toDate: () => Date }).toDate()
  else if (typeof d === 'object' && d !== null && 'seconds' in d && typeof (d as { seconds: number }).seconds === 'number') {
    date = new Date((d as { seconds: number }).seconds * 1000)
  } else {
    date = new Date(d as string | number)
  }
  if (isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

const formatDateInputVal = (d: unknown): string => {
  if (!d) return ''
  let date: Date
  if (d instanceof Date) date = d
  else if (typeof (d as { toDate?: () => Date }).toDate === 'function') date = (d as { toDate: () => Date }).toDate()
  else if (typeof d === 'object' && d !== null && 'seconds' in d && typeof (d as { seconds: number }).seconds === 'number') {
    date = new Date((d as { seconds: number }).seconds * 1000)
  } else {
    date = new Date(d as string | number)
  }
  if (isNaN(date.getTime())) return ''
  return date.toISOString().split('T')[0]
}

const parseTimeToMinutes = (timeStr?: string): number => {
  if (!timeStr) return 20 * 60 // default 8:00 PM
  const s = timeStr.trim().toLowerCase()
  const isPm = s.includes('pm')
  const isAm = s.includes('am')
  const clean = s.replace(/(am|pm)/g, '').trim()
  const [hStr, mStr] = clean.split(':')
  let h = parseInt(hStr, 10) || 0
  const m = parseInt(mStr, 10) || 0
  if (isPm && h < 12) h += 12
  if (isAm && h === 12) h = 0
  return h * 60 + m
}

const getShootEndDateTime = (eventDate: Date, endTimeStr?: string): Date => {
  const d = new Date(eventDate)
  const minutes = parseTimeToMinutes(endTimeStr)
  d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0)
  return d
}

const getStageCompletedDate = (p: Project | null, stageKey: ProjectStage): Date | null => {
  if (!p) return null
  if (stageKey === 'delivered') {
    const isSignoff = Boolean(p.stageGates?.delivered?.['Client sign-off received'])
    if (p.status !== 'completed' || !isSignoff) {
      return null
    }
  }
  if (p.stageCompletedAt?.[stageKey]) {
    const raw = p.stageCompletedAt[stageKey]
    if (raw instanceof Date) return raw
    if (typeof (raw as { toDate?: () => Date }).toDate === 'function') return (raw as { toDate: () => Date }).toDate()
    return new Date(raw as unknown as string | number)
  }
  // Fallbacks for legacy/mock data:
  if (stageKey === 'booked' && p.createdAt) {
    return p.createdAt instanceof Date ? p.createdAt : new Date(p.createdAt)
  }
  if (stageKey === 'delivered' && p.milestones?.delivered && p.status === 'completed' && Boolean(p.stageGates?.delivered?.['Client sign-off received'])) {
    return p.milestones.delivered instanceof Date ? p.milestones.delivered : new Date(p.milestones.delivered)
  }
  const stageIdx = STAGE_CONFIGS.findIndex(s => s.stageKey === stageKey)
  const currentIdx = STAGE_CONFIGS.findIndex(s => s.stageKey === p.stage)
  if (stageIdx >= 0 && currentIdx > stageIdx && p.updatedAt) {
    return p.updatedAt instanceof Date ? p.updatedAt : new Date(p.updatedAt)
  }
  return null
}

function getProjectEffectiveDateRange(p: Project): { startDate: Date; endDate: Date } {
  let startDate = p.eventDate instanceof Date ? p.eventDate : new Date(p.eventDate)
  let endDate = startDate

  if (p.bookingType === 'recurring' && p.recurringSchedule) {
    if (p.recurringSchedule.startDate) {
      startDate = p.recurringSchedule.startDate instanceof Date
        ? p.recurringSchedule.startDate
        : new Date(p.recurringSchedule.startDate)
    }
    if (p.recurringSchedule.endDate) {
      endDate = p.recurringSchedule.endDate instanceof Date
        ? p.recurringSchedule.endDate
        : new Date(p.recurringSchedule.endDate)
    }
  } else if (p.bookingType === 'multiDate' && p.eventDates && p.eventDates.length > 0) {
    const first = p.eventDates[0]
    const last = p.eventDates[p.eventDates.length - 1]
    startDate = first.date instanceof Date ? first.date : new Date(first.date)
    endDate = last.date instanceof Date ? last.date : new Date(last.date)
  }

  return { startDate, endDate }
}

function isProjectOverdue(p: Project, now: Date): boolean {
  if (p.stage === 'delivered' || p.status === 'completed' || p.status === 'cancelled') {
    return false
  }

  const { endDate } = getProjectEffectiveDateRange(p)
  const endOfDayMs = new Date(endDate).setHours(23, 59, 59, 999)

  // Recurring booking: contract spans across all sessions through endDate
  if (p.bookingType === 'recurring') {
    return now.getTime() > endOfDayMs
  }

  // Multi-date booking: spans across all shoot dates
  if (p.bookingType === 'multiDate') {
    return now.getTime() > endOfDayMs
  }

  // Post-production: editing actively happens AFTER the shoot date.
  // Standard post-production SLA is 30 days after the shoot before it is considered overdue.
  if (p.stage === 'postProduction') {
    const deliverySlaMs = endDate.getTime() + (30 * 24 * 60 * 60 * 1000)
    return now.getTime() > deliverySlaMs
  }

  // Booked, Planning, Pre-Prod, Event Day:
  // Overdue if the shoot day has completely ended (past 23:59:59 of eventDate)
  return now.getTime() > endOfDayMs
}

interface Point {
  x: number
  y: number
}

function EventsBoardContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const appUser = useAuthStore(s => s.appUser)

  const paramProject = searchParams.get('project')
  const paramStage = searchParams.get('stage') as ProjectStage | null
  const testDatasetMode = useUIStore(s => s.testDatasetMode)
  const testModeCutoff = useUIStore(s => s.testModeCutoff)

  // ─── STATE ──────────────────────────────────────────────────────────────
  const [projects, setProjects] = useState<Project[]>([])
  const [staffList, setStaffList] = useState<StaffMember[]>(() => testDatasetMode ? [] : MOCK_STAFF)
  const [freelancerList, setFreelancerList] = useState<Freelancer[]>(() => testDatasetMode ? [] : MOCK_FREELANCERS)
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [railFilter, setRailFilter] = useState<'active' | 'done' | 'overdue'>('active')
  const [panelStageKey, setPanelStageKey] = useState<ProjectStage | null>(null)
  const [overrideReason, setOverrideReason] = useState('')
  const [isAdvancing, setIsAdvancing] = useState(false)
  const [selectedDayTab, setSelectedDayTab] = useState<number>(0)
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [recordPaymentModalOpen, setRecordPaymentModalOpen] = useState(false)

  // ─── Post-Production Setup & Review State ───
  const [postProdSetupStaff, setPostProdSetupStaff] = useState<Record<string, string>>({})
  const [postProdSetupFreelancer, setPostProdSetupFreelancer] = useState<Record<string, string>>({})
  const [postProdSetupDueDates, setPostProdSetupDueDates] = useState<Record<string, string>>({})
  const [isSubmittingSetup, setIsSubmittingSetup] = useState(false)
  const [rejectModalTrack, setRejectModalTrack] = useState<PostProdTrackKey | null>(null)
  const [rejectNotes, setRejectNotes] = useState('')
  const [isSubmittingReview, setIsSubmittingReview] = useState(false)
  const [expandedReviewHistory, setExpandedReviewHistory] = useState<Record<string, boolean>>({})

  // Canvas element refs and measured port positions
  const canvasRef = useRef<HTMLDivElement>(null)
  const innerContainerRef = useRef<HTMLDivElement>(null)
  const [ports, setPorts] = useState<Record<string, Point>>({})
  // Guard so URL params (project + stage) are only applied once on initial load,
  // not every time the projects array updates from Firestore
  const urlParamsAppliedRef = useRef(false)

  // Canvas Drag / Pan in all directions & Zoom
  const [zoom, setZoom] = useState<number>(1)
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 48, y: 48 })
  const [isDragging, setIsDragging] = useState(false)

  // ─── DYNAMIC PORT MEASUREMENT ───────────────────────────────────────────
  const measurePorts = useCallback(() => {
    if (!canvasRef.current || !innerContainerRef.current) return
    const innerRect = innerContainerRef.current.getBoundingClientRect()
    const elements = innerContainerRef.current.querySelectorAll<HTMLElement>('[data-port-id]')
    const coords: Record<string, Point> = {}

    elements.forEach(el => {
      const id = el.getAttribute('data-port-id')
      if (!id) return
      const rect = el.getBoundingClientRect()
      // Calculate coordinates relative to inner container taking scale into account
      const x = (rect.left + rect.width / 2 - innerRect.left) / zoom
      const y = (rect.top + rect.height / 2 - innerRect.top) / zoom
      coords[id] = { x, y }
    })

    setPorts(coords)
  }, [zoom])

  useEffect(() => {
    measurePorts()
    const timer = setTimeout(measurePorts, 60)
    return () => clearTimeout(timer)
  }, [measurePorts, selectedProjectId, selectedDayTab, projects])

  useEffect(() => {
    window.addEventListener('resize', measurePorts)
    return () => window.removeEventListener('resize', measurePorts)
  }, [measurePorts])
  const dragStartRef = useRef<{
    mouseX: number
    mouseY: number
    panX: number
    panY: number
    hasMoved: boolean
  }>({
    mouseX: 0,
    mouseY: 0,
    panX: 48,
    panY: 48,
    hasMoved: false,
  })

  // Draggable node offsets { [nodeId]: { x, y } }
  const [nodeOffsets, setNodeOffsets] = useState<Record<string, { x: number; y: number }>>({})
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null)
  const draggingNodeRef = useRef<{
    nodeId: string
    startMouseX: number
    startMouseY: number
    startOffsetX: number
    startOffsetY: number
    hasMoved: boolean
  } | null>(null)
  const justDraggedRef = useRef<boolean>(false)
  const rafRef = useRef<number | null>(null)
  const dragTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const measureTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Load custom node offsets from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('studio_zoom_node_offsets')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          const sanitized: Record<string, { x: number; y: number }> = {}
          for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
            if (v && typeof v === 'object' && 'x' in v && 'y' in v) {
              const xNum = Number((v as { x: unknown }).x)
              const yNum = Number((v as { y: unknown }).y)
              if (!isNaN(xNum) && !isNaN(yNum)) {
                sanitized[k] = { x: xNum, y: yNum }
              }
            }
          }
          const timer = setTimeout(() => {
            setNodeOffsets(sanitized)
            setTimeout(measurePorts, 60)
          }, 0)
          return () => clearTimeout(timer)
        }
      }
    } catch {
      // ignore
    }
  }, [measurePorts])

  // Persist node offsets safely to localStorage when offsets change
  useEffect(() => {
    if (Object.keys(nodeOffsets).length === 0) return
    try {
      localStorage.setItem('studio_zoom_node_offsets', JSON.stringify(nodeOffsets))
    } catch {
      // ignore
    }
  }, [nodeOffsets])

  const handleNodeMouseDown = (e: React.MouseEvent, nodeId: string) => {
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    if (target.closest('button, input, select, textarea, a, [data-no-drag]')) {
      return
    }
    e.stopPropagation()

    const currentOffset = nodeOffsets[nodeId]
    const curX = currentOffset?.x && !isNaN(currentOffset.x) ? currentOffset.x : 0
    const curY = currentOffset?.y && !isNaN(currentOffset.y) ? currentOffset.y : 0

    draggingNodeRef.current = {
      nodeId,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startOffsetX: curX,
      startOffsetY: curY,
      hasMoved: false,
    }
  }

  const handleResetPositions = () => {
    setNodeOffsets({})
    try {
      localStorage.removeItem('studio_zoom_node_offsets')
    } catch {
      // ignore
    }
    setPan({ x: 48, y: 48 })
    setZoom(1)
    setTimeout(measurePorts, 50)
  }

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only drag with left mouse button (0) or middle mouse button (1)
    if (e.button !== 0 && e.button !== 1) return

    // Do not initiate canvas drag if clicking interactive controls (buttons, inputs, etc.)
    const target = e.target as HTMLElement
    if (target.closest('button, input, select, textarea, a, [data-no-drag]')) {
      return
    }

    setIsDragging(true)
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      panX: pan.x,
      panY: pan.y,
      hasMoved: false,
    }
  }

  // Global mousemove and mouseup listeners for buttery smooth dragging in all directions
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // Safety: if mouse buttons are 0, user released mouse button outside or lost focus
      if (e.buttons === 0) {
        if (draggingNodeRef.current || isDragging) {
          handleMouseUp()
        }
        return
      }

      // 1. Node dragging takes priority
      if (draggingNodeRef.current) {
        const node = draggingNodeRef.current
        const z = zoom > 0 ? zoom : 1
        const dx = (e.clientX - node.startMouseX) / z
        const dy = (e.clientY - node.startMouseY) / z
        const dist = Math.hypot(dx * z, dy * z)

        // Require at least 6px of intentional movement to start dragging the node
        if (!node.hasMoved) {
          if (dist < 6) return
          node.hasMoved = true
          setDraggingNodeId(node.nodeId)
        }

        const nextX = Math.round(node.startOffsetX + dx)
        const nextY = Math.round(node.startOffsetY + dy)
        const targetId = node.nodeId

        setNodeOffsets(prev => ({
          ...prev,
          [targetId]: { x: nextX, y: nextY },
        }))

        if (rafRef.current) cancelAnimationFrame(rafRef.current)
        rafRef.current = requestAnimationFrame(() => {
          measurePorts()
        })
        return
      }

      // 2. Canvas panning
      if (isDragging) {
        const dx = e.clientX - dragStartRef.current.mouseX
        const dy = e.clientY - dragStartRef.current.mouseY
        const dist = Math.hypot(dx, dy)
        if (!dragStartRef.current.hasMoved) {
          if (dist < 6) return
          dragStartRef.current.hasMoved = true
        }
        setPan({
          x: dragStartRef.current.panX + dx,
          y: dragStartRef.current.panY + dy,
        })
      }
    }

    const handleMouseUp = () => {
      if (draggingNodeRef.current) {
        const hasMoved = draggingNodeRef.current.hasMoved
        if (hasMoved) {
          justDraggedRef.current = true
          if (dragTimeoutRef.current) clearTimeout(dragTimeoutRef.current)
          dragTimeoutRef.current = setTimeout(() => {
            justDraggedRef.current = false
          }, 150)

          if (measureTimeoutRef.current) clearTimeout(measureTimeoutRef.current)
          measureTimeoutRef.current = setTimeout(measurePorts, 20)
        }
        setDraggingNodeId(null)
        draggingNodeRef.current = null
      }
      setIsDragging(false)
      dragStartRef.current.hasMoved = false
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (dragTimeoutRef.current) clearTimeout(dragTimeoutRef.current)
      if (measureTimeoutRef.current) clearTimeout(measureTimeoutRef.current)
    }
  }, [isDragging, zoom, measurePorts])

  // Mouse wheel scroll up/down for zoom in and zoom out
  useEffect(() => {
    const canvasEl = canvasRef.current
    if (!canvasEl) return

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const step = 0.08
      const delta = e.deltaY < 0 ? step : -step
      setZoom(prev => {
        const next = Math.round((prev + delta) * 100) / 100
        return Math.min(1.8, Math.max(0.4, next))
      })
    }

    canvasEl.addEventListener('wheel', onWheel, { passive: false })
    return () => canvasEl.removeEventListener('wheel', onWheel)
  }, [])

  // Open stage panel on card click (only block if user actively dragged the node)
  const handleStageCardClick = (stageKey: ProjectStage, dayIdx?: number) => {
    if (justDraggedRef.current || draggingNodeRef.current?.hasMoved) return
    if (dayIdx !== undefined) {
      setSelectedDayTab(dayIdx)
    }
    setPanelStageKey(stageKey)
  }

  // Local gate checklist state by project & stage: Record<string, boolean>
  const [gateOverrides, setGateOverrides] = useState<Record<string, boolean>>({})
  const [trackMilestoneOverrides, setTrackMilestoneOverrides] = useState<Record<string, boolean>>({})

  // ─── REAL-TIME FIRESTORE SUBSCRIPTIONS ──────────────────────────────────
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('studio_zoom_demo_projects')
      } catch {}
    }

    const filterActiveBoardProjects = (raw: Project[]): Project[] => {
      const nowMs = Date.now()
      return raw.filter(p => {
        const isCompleted = p.stage === 'delivered' || p.status === 'completed'
        if (!isCompleted) return true
        const { endDate } = getProjectEffectiveDateRange(p)
        const daysSinceEvent = (nowMs - endDate.getTime()) / (1000 * 60 * 60 * 24)
        return daysSinceEvent <= 30
      })
    }

    const unsubProjects = subscribeToProjects(firestoreProjects => {
      const raw = firestoreProjects || []
      const projs = filterActiveBoardProjects(raw)
      setProjects(projs)
      setSelectedProjectId(curr => {
        if (paramProject) {
          const match = projs.find(p => p.projectId === paramProject || p.clientId === paramProject)
          if (match) return match.projectId
        }
        if (curr && projs.some(p => p.projectId === curr)) return curr
        const firstActive = projs.find(p => p.stage !== 'delivered') || projs[0]
        return firstActive?.projectId || null
      })
    })

    const handleSync = () => {}
    window.addEventListener('studio_zoom_projects_changed', handleSync)

    const unsubStaff = subscribeToStaff(team => {
      setStaffList(team || [])
    })

    const unsubFreelancers = subscribeToFreelancers(data => {
      setFreelancerList(data || [])
    })

    return () => {
      unsubProjects()
      unsubStaff()
      unsubFreelancers()
      window.removeEventListener('studio_zoom_projects_changed', handleSync)
    }
  }, [paramProject, testDatasetMode, testModeCutoff])

  const handleSelectProject = (projectId: string) => {
    setSelectedProjectId(projectId)
    setSelectedDayTab(0)
    setOverrideReason('')
  }

  const selectedProject = useMemo((): Project | null => {
    return projects.find(p => p.projectId === selectedProjectId) || projects[0] || null
  }, [projects, selectedProjectId])

  // Real-time client & payment listener for the currently selected project
  useEffect(() => {
    if (!selectedProject?.clientId || selectedProject.clientId.startsWith('client-')) {
      const timer = setTimeout(() => setSelectedClient(null), 0)
      return () => clearTimeout(timer)
    }

    const unsub = onSnapshot(doc(db, 'clients', selectedProject.clientId), snap => {
      if (snap.exists()) {
        const d = snap.data()
        setSelectedClient({
          ...d,
          clientId: snap.id,
        } as Client)
      } else {
        setSelectedClient(null)
      }
    })

    return () => unsub()
  }, [selectedProject?.clientId])

  const clientBalanceDue = selectedClient?.balanceDue ?? 0
  const clientTotalAmount = selectedClient?.totalAmount ?? 0

  const isDiscreteSession = Boolean(
    selectedProject?.sessionIndex !== undefined ||
    (selectedProject?.bookingType === 'recurring' && selectedProject?.eventName?.includes('Session'))
  )

  const sessionRate = useMemo(() => {
    if (!isDiscreteSession) return 0
    if (selectedProject?.sessionRate && selectedProject.sessionRate > 0) {
      return selectedProject.sessionRate
    }
    if (selectedClient?.recurringSchedule?.perSessionRate && selectedClient.recurringSchedule.perSessionRate > 0) {
      return selectedClient.recurringSchedule.perSessionRate
    }
    const totalSessions = selectedProject?.totalSessions || selectedClient?.recurringSchedule?.totalSessions || 1
    const totalAmt = selectedClient?.totalAmount ?? 0
    return totalSessions > 0 ? Math.round(totalAmt / totalSessions) : 0
  }, [isDiscreteSession, selectedProject?.sessionRate, selectedProject?.totalSessions, selectedClient?.recurringSchedule, selectedClient?.totalAmount])

  const effectiveTotalAmount = isDiscreteSession && sessionRate > 0
    ? sessionRate
    : clientTotalAmount

  const effectiveBalanceDue = useMemo(() => {
    if (!isDiscreteSession || sessionRate <= 0) {
      return clientBalanceDue
    }
    const totalPaid = Math.max(0, clientTotalAmount - clientBalanceDue)
    const sessionIdx = selectedProject?.sessionIndex || 1
    const priorRequired = (sessionIdx - 1) * sessionRate
    const sessionPaid = Math.max(0, Math.min(sessionRate, totalPaid - priorRequired))
    return Math.max(0, sessionRate - sessionPaid)
  }, [isDiscreteSession, sessionRate, clientTotalAmount, clientBalanceDue, selectedProject?.sessionIndex])

  const isPaymentPending = effectiveBalanceDue > 0 && selectedClient?.paymentStatus !== 'paid'

  const now = useMemo(() => new Date(), [])

  // Apply URL params (project + stage) only once — on the first time projects data is available.
  // Do NOT re-run on every Firestore update, otherwise any panel navigation resets back to the URL stage.
  useEffect(() => {
    if (urlParamsAppliedRef.current) return
    if (projects.length === 0) return

    const timer = setTimeout(() => {
      let applied = false
      if (paramProject) {
        const match = projects.find(p => p.projectId === paramProject || p.clientId === paramProject)
        if (match) {
          setSelectedProjectId(match.projectId)
          const signoffKey = `${match.projectId}_delivered_Client sign-off received`
          const isSignoffDone = Boolean(gateOverrides[signoffKey] || match.stageGates?.delivered?.['Client sign-off received'])
          const isDone = match.stage === 'delivered' && match.status === 'completed' && Boolean(match.stageCompletedAt?.delivered) && isSignoffDone
          const isOverdue = !isDone && isProjectOverdue(match, now)
          if (isDone) setRailFilter('done')
          else if (isOverdue) setRailFilter('overdue')
          else setRailFilter('active')
          applied = true
        }
      }
      if (paramStage && STAGE_CONFIGS.some(s => s.stageKey === paramStage)) {
        setPanelStageKey(paramStage)
        applied = true
      }

      if (applied || (!paramProject && !paramStage)) {
        urlParamsAppliedRef.current = true
      }
    }, 0)

    return () => clearTimeout(timer)
  }, [paramProject, paramStage, projects, now, gateOverrides])

  // ─── HELPER: Check if a project is fully finished/done ────────────────────
  const isProjectFullyDone = useCallback((p: Project): boolean => {
    if (p.stage !== 'delivered') return false
    const signoffKey = `${p.projectId}_delivered_Client sign-off received`
    const isSignoffDone = Boolean(gateOverrides[signoffKey] || p.stageGates?.delivered?.['Client sign-off received'])
    return p.status === 'completed' && Boolean(p.stageCompletedAt?.delivered) && isSignoffDone
  }, [gateOverrides])

  // ─── KPI METRICS ────────────────────────────────────────────────────────
  const { ongoingCount, doneCount, overdueCount } = useMemo(() => {
    let ongoing = 0
    let done = 0
    let overdue = 0

    projects.forEach(p => {
      const isDone = isProjectFullyDone(p)
      if (isDone) {
        done++
      } else if (isProjectOverdue(p, now)) {
        overdue++
      } else {
        ongoing++
      }
    })

    return { ongoingCount: ongoing, doneCount: done, overdueCount: overdue }
  }, [projects, now, isProjectFullyDone])

  // ─── FILTERED PROJECTS IN LEFT RAIL ─────────────────────────────────────
  const filteredProjects = useMemo(() => {
    return projects.filter(p => {
      const isDone = isProjectFullyDone(p)
      const isPastDue = !isDone && isProjectOverdue(p, now)
      const isOngoing = !isDone && !isPastDue

      // Requirement 2: Completed or done events should not exist after 30 days from the event
      if (isDone) {
        const { endDate } = getProjectEffectiveDateRange(p)
        const diffMs = now.getTime() - endDate.getTime()
        const diffDays = diffMs / (1000 * 60 * 60 * 24)
        if (diffDays > 30) return false
      }

      // Mutually exclusive tabs (no leak between ongoing, done, overdue):
      if (railFilter === 'active' && !isOngoing) return false
      if (railFilter === 'done' && !isDone) return false
      if (railFilter === 'overdue' && !isPastDue) return false

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const matchName = (p.eventName || '').toLowerCase().includes(q)
        const matchClient = (p.clientName || '').toLowerCase().includes(q)
        const matchType = (p.eventType || '').toLowerCase().includes(q)
        const matchCustom = (p.customEventType || '').toLowerCase().includes(q)
        const matchLabel = (p.dateLabel || '').toLowerCase().includes(q)
        const matchLocation = (p.location || '').toLowerCase().includes(q)
        const matchBookingType = (p.bookingType || '').toLowerCase().includes(q)
        if (!matchName && !matchClient && !matchType && !matchCustom && !matchLabel && !matchLocation && !matchBookingType) {
          return false
        }
      }

      return true
    })
  }, [projects, railFilter, searchQuery, now, isProjectFullyDone])

  // ─── STAGE PROGRESS HELPERS ─────────────────────────────────────────────
  const currentStageIndex = useMemo(() => {
    if (!selectedProject) return 0
    const idx = STAGE_ORDER.indexOf(selectedProject.stage)
    return idx >= 0 ? idx : 0
  }, [selectedProject])

  const getStageStatus = useCallback((stageKey: ProjectStage): 'completed' | 'active' | 'pending' => {
    const stageIdx = STAGE_ORDER.indexOf(stageKey)
    if (stageIdx < currentStageIndex) return 'completed'
    if (stageIdx === currentStageIndex) {
      if (selectedProject?.stage === 'delivered') {
        const signoffKey = `${selectedProject.projectId}_delivered_Client sign-off received`
        const isSignoffDone = Boolean(gateOverrides[signoffKey] || selectedProject.stageGates?.delivered?.['Client sign-off received'])
        const isBalanceDone = !isPaymentPending && effectiveBalanceDue <= 0
        const isHandoverDone = selectedProject.status === 'completed' && Boolean(selectedProject.stageCompletedAt?.delivered) && isSignoffDone && isBalanceDone

        if (!isHandoverDone) {
          return 'active'
        }
        return 'completed'
      }
      return 'active'
    }
    return 'pending'
  }, [currentStageIndex, selectedProject, effectiveBalanceDue, isPaymentPending, gateOverrides])

  const getDaySessionStatus = useCallback((day: EventDateEntry, _idx: number): 'completed' | 'active' | 'pending' => {
    if (!selectedProject) return 'pending'

    const eventDayIdx = STAGE_ORDER.indexOf('eventDay')
    // If the project has not reached eventDay yet:
    if (currentStageIndex < eventDayIdx) {
      return 'pending'
    }

    // If the entire project is completed & delivered:
    if (selectedProject.stage === 'delivered' && selectedProject.status === 'completed') {
      return 'completed'
    }

    const dayDate = day.date instanceof Date ? day.date : new Date(day.date)
    const startOfToday = new Date(now)
    startOfToday.setHours(0, 0, 0, 0)
    const endOfToday = new Date(now)
    endOfToday.setHours(23, 59, 59, 999)

    // Future date (e.g. 16 Sept, 23 Sept, 30 Sept when today is 9 Sept):
    if (dayDate.getTime() > endOfToday.getTime()) {
      return 'pending'
    }

    // Past date (before today):
    if (dayDate.getTime() < startOfToday.getTime()) {
      return 'completed'
    }

    // Today (same day as now):
    // If the project has already moved to post-production or delivered, today's shoot has completed
    if (currentStageIndex > eventDayIdx) {
      return 'completed'
    }

    // Currently in eventDay on today's date:
    return 'active'
  }, [selectedProject, currentStageIndex, now])

  const getDaySessionStatus = useCallback((day: EventDateEntry, _idx: number): 'completed' | 'active' | 'pending' => {
    if (!selectedProject) return 'pending'

    const eventDayIdx = STAGE_ORDER.indexOf('eventDay')
    // If the project has not reached eventDay yet:
    if (currentStageIndex < eventDayIdx) {
      return 'pending'
    }

    // If the entire project is completed & delivered:
    if (selectedProject.stage === 'delivered' && selectedProject.status === 'completed') {
      return 'completed'
    }

    const dayDate = day.date instanceof Date ? day.date : new Date(day.date)
    const startOfToday = new Date(now)
    startOfToday.setHours(0, 0, 0, 0)
    const endOfToday = new Date(now)
    endOfToday.setHours(23, 59, 59, 999)

    // Future date (e.g. 16 Sept, 23 Sept, 30 Sept when today is 9 Sept):
    if (dayDate.getTime() > endOfToday.getTime()) {
      return 'pending'
    }

    // Past date (before today):
    if (dayDate.getTime() < startOfToday.getTime()) {
      return 'completed'
    }

    // Today (same day as now):
    // If the project has already moved to post-production or delivered, today's shoot has completed
    if (currentStageIndex > eventDayIdx) {
      return 'completed'
    }

    // Currently in eventDay on today's date:
    return 'active'
  }, [selectedProject, currentStageIndex, now])

  // Multi-day / Multi-event tracks detection
  const multiEventDays: EventDateEntry[] = useMemo(() => {
    if (!selectedProject) return []
    if (selectedProject.eventDates && selectedProject.eventDates.length > 0) {
      return (selectedProject.eventDates as unknown as Array<{
        id?: string
        date: unknown
        label?: string
        location?: string
        startTime?: string
        endTime?: string
      }>).map((ed, i) => {
        let dateVal: unknown = ed.date
        if (dateVal && typeof (dateVal as { toDate?: () => Date }).toDate === 'function') {
          dateVal = (dateVal as { toDate: () => Date }).toDate()
        } else if (dateVal && typeof dateVal === 'object' && 'seconds' in dateVal && typeof (dateVal as { seconds: number }).seconds === 'number') {
          dateVal = new Date((dateVal as { seconds: number }).seconds * 1000)
        } else if (dateVal && typeof dateVal === 'object' && '_seconds' in dateVal && typeof (dateVal as { _seconds: number })._seconds === 'number') {
          dateVal = new Date((dateVal as { _seconds: number })._seconds * 1000)
        } else if (dateVal && !(dateVal instanceof Date) && (typeof dateVal === 'string' || typeof dateVal === 'number')) {
          dateVal = new Date(dateVal)
        }
        const validDate = dateVal instanceof Date && !isNaN(dateVal.getTime()) ? dateVal : selectedProject.eventDate
        return {
          id: ed.id || `day-${i}`,
          date: validDate,
          label: ed.label || `Day ${i + 1}`,
          location: ed.location,
          startTime: ed.startTime,
          endTime: ed.endTime,
        }
      })
    }
    if (selectedProject.bookingType === 'recurring' && !selectedProject.sessionIndex && selectedProject.recurringSchedule) {
      const rs = selectedProject.recurringSchedule
      const start = rs.startDate instanceof Date ? rs.startDate : new Date(rs.startDate)
      const count = rs.totalSessions || 1
      const days: EventDateEntry[] = []
      for (let i = 0; i < count; i++) {
        const sessionDate = new Date(start)
        if (rs.frequency === 'weekly') {
          sessionDate.setDate(sessionDate.getDate() + (i * 7))
        } else if (rs.frequency === 'biweekly') {
          sessionDate.setDate(sessionDate.getDate() + (i * 14))
        } else if (rs.frequency === 'monthly') {
          sessionDate.setMonth(sessionDate.getMonth() + i)
        }
        days.push({
          id: `session-${i + 1}`,
          date: sessionDate,
          label: `Session ${i + 1}`,
          location: selectedProject.location || 'Venue Site',
          startTime: rs.sessionStartTime || selectedProject.startTime || '09:00',
          endTime: rs.sessionEndTime || selectedProject.endTime || '18:00',
        })
      }
      if (days.length > 0) return days
    }
    return [
      {
        id: selectedProject.sessionIndex ? `session-${selectedProject.sessionIndex}` : 'main-day',
        date: selectedProject.eventDate,
        label: selectedProject.dateLabel || (selectedProject.sessionIndex ? `Session ${selectedProject.sessionIndex}` : 'Main Shoot Day'),
        location: selectedProject.location || 'Venue Site',
        startTime: selectedProject.startTime || '07:00 AM',
        endTime: selectedProject.endTime || '08:00 PM',
      }
    ]
  }, [selectedProject])

  const isMultiEvent = multiEventDays.length > 1
  const isRecurring = Boolean(selectedProject?.bookingType === 'recurring' && !selectedProject?.sessionIndex)

  // ─── TRACK MILESTONE HELPERS ────────────────────────────────────────────
  const isTrackMilestoneDone = useCallback((track: 'photo' | 'video', milestone: string, sessionIdx?: number): boolean => {
    if (!selectedProject) return false
    const isProjectRecurring = selectedProject.bookingType === 'recurring'
    const actualSessionIdx = isProjectRecurring ? (sessionIdx !== undefined ? sessionIdx : selectedDayTab) : undefined

    const overrideKey = actualSessionIdx !== undefined
      ? `${selectedProject.projectId}_session_${actualSessionIdx}_${track}_${milestone}`
      : `${selectedProject.projectId}_${track}_${milestone}`

    if (trackMilestoneOverrides[overrideKey] !== undefined) {
      return trackMilestoneOverrides[overrideKey]
    }

    if (actualSessionIdx !== undefined) {
      const sessionState = selectedProject.sessionMilestones?.[actualSessionIdx]
      const sessionField = track === 'photo' ? sessionState?.photoMilestones : sessionState?.videoMilestones
      if (sessionField && sessionField[milestone] !== undefined) {
        return sessionField[milestone]
      }
      // If recurring session shoot is not completed yet, milestones are not done by default
      const day = multiEventDays[actualSessionIdx]
      const dayStatus = day ? getDaySessionStatus(day, actualSessionIdx) : 'pending'
      if (dayStatus !== 'completed') {
        return false
      }
    }

    const projectMilestones = track === 'photo' ? selectedProject.photoMilestones : selectedProject.videoMilestones
    if (projectMilestones && projectMilestones[milestone] !== undefined) {
      return projectMilestones[milestone]
    }
    const stageIdx = STAGE_ORDER.indexOf(selectedProject.stage)
    if (stageIdx > 4) return true
    return false
  }, [selectedProject, selectedDayTab, multiEventDays, trackMilestoneOverrides, getDaySessionStatus])

  const photoTrackDoneCount = useMemo(() => {
    const isProjectRecurring = selectedProject?.bookingType === 'recurring'
    return PHOTO_TRACK_MILESTONES.filter(m => isTrackMilestoneDone('photo', m, isProjectRecurring ? selectedDayTab : undefined)).length
  }, [isTrackMilestoneDone, selectedProject, selectedDayTab])

  const isPhotoTrackAllDone = photoTrackDoneCount === PHOTO_TRACK_MILESTONES.length

  const videoTrackDoneCount = useMemo(() => {
    const isProjectRecurring = selectedProject?.bookingType === 'recurring'
    return VIDEO_TRACK_MILESTONES.filter(m => isTrackMilestoneDone('video', m, isProjectRecurring ? selectedDayTab : undefined)).length
  }, [isTrackMilestoneDone, selectedProject, selectedDayTab])

  const isVideoTrackAllDone = videoTrackDoneCount === VIDEO_TRACK_MILESTONES.length

  const toggleTrackMilestone = async (track: 'photo' | 'video', milestone: string, e?: React.MouseEvent, sessionIdx?: number) => {
    if (e) {
      e.stopPropagation()
    }
    if (!selectedProject) return

    const isProjectRecurring = selectedProject.bookingType === 'recurring'
    const actualSessionIdx = isProjectRecurring ? (sessionIdx !== undefined ? sessionIdx : selectedDayTab) : undefined

    const currentlyDone = isTrackMilestoneDone(track, milestone, actualSessionIdx)
    const newVal = !currentlyDone
    const key = actualSessionIdx !== undefined
      ? `${selectedProject.projectId}_session_${actualSessionIdx}_${track}_${milestone}`
      : `${selectedProject.projectId}_${track}_${milestone}`

    setTrackMilestoneOverrides(prev => ({ ...prev, [key]: newVal }))

    setProjects(prev => prev.map(p => {
      if (p.projectId === selectedProject.projectId) {
        if (actualSessionIdx !== undefined) {
          const currentSessions = p.sessionMilestones || {}
          const currentSession = currentSessions[actualSessionIdx] || {}
          const field = track === 'photo' ? 'photoMilestones' : 'videoMilestones'
          return {
            ...p,
            sessionMilestones: {
              ...currentSessions,
              [actualSessionIdx]: {
                ...currentSession,
                [field]: {
                  ...(currentSession[field] || {}),
                  [milestone]: newVal,
                },
              },
            },
          }
        }
        const field = track === 'photo' ? 'photoMilestones' : 'videoMilestones'
        return {
          ...p,
          [field]: {
            ...(p[field] || {}),
            [milestone]: newVal,
          },
        }
      }
      return p
    }))

    if (actualSessionIdx !== undefined) {
      if (!selectedProject.projectId.startsWith('demo-')) {
        try {
          await updateSessionTrackMilestone(selectedProject.projectId, actualSessionIdx, track, milestone, newVal)
        } catch (err) {
          console.error(`Failed to update session ${actualSessionIdx} ${track} milestone ${milestone}:`, err)
        }
      }
      return
    }

    const milestones = track === 'photo' ? PHOTO_TRACK_MILESTONES : VIDEO_TRACK_MILESTONES
    const allOthersDone = milestones.filter(m => m !== milestone).every(m => isTrackMilestoneDone(track, m))
    const willBeAllDone = newVal && allOthersDone
    const gateLabel = track === 'photo' ? 'Photo track completed' : 'Video track completed'
    const gateKey = `${selectedProject.projectId}_postProduction_${gateLabel}`
    setGateOverrides(prev => ({ ...prev, [gateKey]: willBeAllDone }))

    if (!selectedProject.projectId.startsWith('demo-')) {
      try {
        await updateTrackMilestone(selectedProject.projectId, track, milestone, newVal)
        await updateProjectStageGates(selectedProject.projectId, 'postProduction', { [gateLabel]: willBeAllDone })
      } catch (err) {
        console.error(`Failed to update ${track} milestone ${milestone}:`, err)
      }
    }
  }

  // ─── RECURRING SESSION STATUS HELPERS ──────────────────────────────────
  const getSessionPostProdStatus = useCallback((idx: number): 'completed' | 'active' | 'pending' => {
    if (!selectedProject) return 'pending'
    const day = multiEventDays[idx]
    if (!day) return 'pending'
    const dayStatus = getDaySessionStatus(day, idx)
    if (dayStatus === 'pending') return 'pending'

    const photoDone = PHOTO_TRACK_MILESTONES.every(m => isTrackMilestoneDone('photo', m, idx))
    const videoDone = VIDEO_TRACK_MILESTONES.every(m => isTrackMilestoneDone('video', m, idx))

    if (photoDone && videoDone) return 'completed'
    return 'active'
  }, [selectedProject, multiEventDays, getDaySessionStatus, isTrackMilestoneDone])

  const getSessionDeliveryStatus = useCallback((idx: number): 'completed' | 'active' | 'pending' => {
    if (!selectedProject) return 'pending'
    const postStatus = getSessionPostProdStatus(idx)
    if (postStatus !== 'completed') return 'pending'

    const isDelivered = selectedProject.sessionMilestones?.[idx]?.delivered ?? false
    if (isDelivered) return 'completed'
    return 'active'
  }, [selectedProject, getSessionPostProdStatus])

  const allSessionsDelivered = useMemo(() => {
    if (!selectedProject || selectedProject.bookingType !== 'recurring' || multiEventDays.length === 0) return false
    return multiEventDays.every((_, idx) => getSessionDeliveryStatus(idx) === 'completed')
  }, [selectedProject, multiEventDays, getSessionDeliveryStatus])

  const handleDeliverSession = async (sessionIdx: number) => {
    if (!selectedProject) return
    setIsAdvancing(true)
    const nowCompleted = new Date()
    try {
      setProjects(prev => prev.map(p => {
        if (p.projectId === selectedProject.projectId) {
          const currentSessions = p.sessionMilestones || {}
          const currentSession = currentSessions[sessionIdx] || {}
          return {
            ...p,
            sessionMilestones: {
              ...currentSessions,
              [sessionIdx]: {
                ...currentSession,
                delivered: true,
                deliveredAt: nowCompleted,
              },
            },
          }
        }
        return p
      }))

      if (!selectedProject.projectId.startsWith('demo-')) {
        await updateSessionDelivery(selectedProject.projectId, sessionIdx, true)
      }
    } catch (err) {
      console.error(`Failed to deliver session ${sessionIdx}:`, err)
    } finally {
      setIsAdvancing(false)
    }
  }

  // ─── SHOOT TIMING & MANDATORY TEAM HELPERS ──────────────────────────────
  const shootTimingInfo = useMemo(() => {
    if (!selectedProject) {
      return { isCompleted: true, shootEndTime: new Date(), formattedTime: '' }
    }
    const currentDay = (panelStageKey === 'eventDay' && multiEventDays.length > 1 && multiEventDays[selectedDayTab])
      ? multiEventDays[selectedDayTab]
      : (multiEventDays.length > 0 ? multiEventDays[0] : null)
    const baseDate = currentDay?.date instanceof Date ? currentDay.date : new Date(currentDay?.date || selectedProject.eventDate)
    const timeStr = currentDay?.endTime || selectedProject.endTime || '08:00 PM'
    const shootEndTime = getShootEndDateTime(baseDate, timeStr)
    const isCompleted = now.getTime() >= shootEndTime.getTime()
    const formattedTime = shootEndTime.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }) + ' (' + shootEndTime.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
    }) + ')'
    return { isCompleted, shootEndTime, formattedTime }
  }, [selectedProject, panelStageKey, multiEventDays, selectedDayTab, now])

  const isTeamAssignmentMandatory = useMemo(() => {
    if (!panelStageKey) return false
    return ['planning', 'preProduction', 'eventDay', 'postProduction'].includes(panelStageKey)
  }, [panelStageKey])

  const hasAssignedTeamMembers = useMemo(() => {
    return (selectedProject?.staffUids || []).length > 0
  }, [selectedProject?.staffUids])

  // ─── GATE CHECKLIST STATE ───────────────────────────────────────────────
  const toggleGate = (stageKey: ProjectStage, gateText: string, currentVal: boolean) => {
    if (!selectedProject) return

    // Requirement 5: The All raw footage checklist should be restricted until Events day shoot is completed
    if (stageKey === 'eventDay' && gateText.toLowerCase().includes('raw footage') && !shootTimingInfo.isCompleted) {
      return
    }

    // Outstanding balance gate cannot be manually ticked if balance is due; open payment modal
    if (gateText.toLowerCase().includes('balance') || gateText.toLowerCase().includes('outstanding')) {
      if (effectiveBalanceDue > 0 || isPaymentPending) {
        setRecordPaymentModalOpen(true)
        return
      }
    }

    const key = `${selectedProject.projectId}_${stageKey}_${gateText}`
    const newVal = !currentVal
    setGateOverrides(prev => ({ ...prev, [key]: newVal }))

    if (stageKey === 'postProduction') {
      if (gateText === 'Photo track completed') {
        PHOTO_TRACK_MILESTONES.forEach(m => {
          const mKey = `${selectedProject.projectId}_photo_${m}`
          setTrackMilestoneOverrides(prev => ({ ...prev, [mKey]: newVal }))
          if (!selectedProject.projectId.startsWith('demo-')) {
            updateTrackMilestone(selectedProject.projectId, 'photo', m, newVal).catch(console.error)
          }
        })
      } else if (gateText === 'Video track completed') {
        VIDEO_TRACK_MILESTONES.forEach(m => {
          const mKey = `${selectedProject.projectId}_video_${m}`
          setTrackMilestoneOverrides(prev => ({ ...prev, [mKey]: newVal }))
          if (!selectedProject.projectId.startsWith('demo-')) {
            updateTrackMilestone(selectedProject.projectId, 'video', m, newVal).catch(console.error)
          }
        })
      }
    }

    if (!selectedProject.projectId.startsWith('demo-')) {
      updateProjectStageGates(selectedProject.projectId, stageKey, { [gateText]: newVal }).catch(err => {
        console.error('Failed to update stage gate in firestore:', err)
      })
    }
  }

  // ─── Post-Production Handlers ───────────────────────────────────────────
  const handleRequirementChange = async (
    serviceKey: 'photography' | 'album' | 'videoHighlights' | 'fullVideo',
    field: 'required' | 'clientReviewRequired',
    value: boolean
  ) => {
    if (!selectedProject) return
    const currentReqs: PostProdRequirements = selectedProject.postProdRequirements || {
      photography: { required: true, clientReviewRequired: true },
      album: { required: true, clientReviewRequired: true },
      videoHighlights: { required: true, clientReviewRequired: true },
      fullVideo: { required: true, clientReviewRequired: true },
    }
    const updated: PostProdRequirements = {
      ...currentReqs,
      [serviceKey]: {
        ...currentReqs[serviceKey],
        [field]: value,
      },
    }
    setProjects(prev =>
      prev.map(p =>
        p.projectId === selectedProject.projectId
          ? { ...p, postProdRequirements: updated }
          : p
      )
    )
    try {
      await savePostProdRequirements(selectedProject.projectId, updated)
    } catch (err) {
      console.error('Failed to save post-prod requirements:', err)
    }
  }

  const handleStartPostProduction = async () => {
    if (!selectedProject || isSubmittingSetup) return
    const reqs = selectedProject.postProdRequirements || {
      photography: { required: true, clientReviewRequired: true },
      album: { required: true, clientReviewRequired: true },
      videoHighlights: { required: true, clientReviewRequired: true },
      fullVideo: { required: true, clientReviewRequired: true },
    }

    const defaultEventDate = selectedProject.eventDate || new Date()
    const defaultDateStr = (days: number) => {
      const d = new Date(defaultEventDate)
      d.setDate(d.getDate() + days)
      return d.toISOString().split('T')[0]
    }

    const defaultStaffUid = selectedProject.staffUids?.[0] || staffList[0]?.uid || ''

    const photoStaff = postProdSetupStaff['photoTrack'] || defaultStaffUid
    const photoDue = postProdSetupDueDates['photo_designing'] || defaultDateStr(10)

    const albumStaff = postProdSetupStaff['albumTrack'] || defaultStaffUid
    const albumDesigningDue = postProdSetupDueDates['album_designing'] || defaultDateStr(14)
    const albumCreatingDue = postProdSetupDueDates['album_creating'] || defaultDateStr(21)

    const videoStaff = postProdSetupStaff['videoTrack'] || defaultStaffUid
    const videoDue = postProdSetupDueDates['video_highlights'] || defaultDateStr(12)

    const fullVideoStaff = postProdSetupStaff['fullVideoTrack'] || defaultStaffUid
    const fullVideoDue = postProdSetupDueDates['full_video_editing'] || defaultDateStr(25)

    if (reqs.photography?.required && !photoStaff) {
      alert('Please assign a staff member for the Photo Track.')
      return
    }
    if (reqs.album?.required && !albumStaff) {
      alert('Please assign a staff member for the Album Track.')
      return
    }
    if (reqs.videoHighlights?.required && !videoStaff) {
      alert('Please assign a staff member for the Video Highlights Track.')
      return
    }
    if (reqs.fullVideo?.required && !fullVideoStaff) {
      alert('Please assign a staff member for the Full Video Track.')
      return
    }

    setIsSubmittingSetup(true)
    try {
      const newPostProdData: PostProductionData = {
        isConfigured: true,
        configuredAt: new Date(),
        configuredBy: appUser?.name || 'Admin',
      }

      if (reqs.photography?.required) {
        const sUid = photoStaff
        const sMember = staffList.find(s => s.uid === sUid)
        const fId = postProdSetupFreelancer['photoTrack']
        const fMember = freelancerList.find(f => f.freelancerId === fId)

        newPostProdData.photoTrack = {
          status: 'notStarted',
          assignment: {
            staffUid: sUid,
            staffName: sMember?.name || 'Staff',
            ...(fId && fMember ? { freelancerId: fId, freelancerName: fMember.name } : {}),
          },
          selectedPhotos: false,
          rawDelivered: false,
          designing: {
            status: 'pending',
            dueDate: new Date(photoDue),
          },
          clientReview: {
            status: reqs.photography.clientReviewRequired ? 'pending' : 'notRequired',
            required: reqs.photography.clientReviewRequired,
            history: [],
          },
        }
      }

      if (reqs.album?.required) {
        const sUid = albumStaff
        const sMember = staffList.find(s => s.uid === sUid)
        const fId = postProdSetupFreelancer['albumTrack']
        const fMember = freelancerList.find(f => f.freelancerId === fId)

        newPostProdData.albumTrack = {
          status: 'notStarted',
          assignment: {
            staffUid: sUid,
            staffName: sMember?.name || 'Staff',
            ...(fId && fMember ? { freelancerId: fId, freelancerName: fMember.name } : {}),
          },
          albumDesigning: {
            status: 'pending',
            dueDate: new Date(albumDesigningDue),
          },
          clientReview: {
            status: reqs.album.clientReviewRequired ? 'pending' : 'notRequired',
            required: reqs.album.clientReviewRequired,
            history: [],
          },
          creatingAlbum: {
            status: 'pending',
            dueDate: new Date(albumCreatingDue),
          },
          delivered: false,
        }
      }

      if (reqs.videoHighlights?.required) {
        const sUid = videoStaff
        const sMember = staffList.find(s => s.uid === sUid)
        const fId = postProdSetupFreelancer['videoTrack']
        const fMember = freelancerList.find(f => f.freelancerId === fId)

        newPostProdData.videoTrack = {
          status: 'notStarted',
          assignment: {
            staffUid: sUid,
            staffName: sMember?.name || 'Staff',
            ...(fId && fMember ? { freelancerId: fId, freelancerName: fMember.name } : {}),
          },
          selectedVideo: false,
          rawVideoDelivered: false,
          highlights: {
            status: 'pending',
            dueDate: new Date(videoDue),
          },
          clientReview: {
            status: reqs.videoHighlights.clientReviewRequired ? 'pending' : 'notRequired',
            required: reqs.videoHighlights.clientReviewRequired,
            history: [],
          },
        }
      }

      if (reqs.fullVideo?.required) {
        const sUid = fullVideoStaff
        const sMember = staffList.find(s => s.uid === sUid)
        const fId = postProdSetupFreelancer['fullVideoTrack']
        const fMember = freelancerList.find(f => f.freelancerId === fId)

        newPostProdData.fullVideoTrack = {
          status: 'notStarted',
          assignment: {
            staffUid: sUid,
            staffName: sMember?.name || 'Staff',
            ...(fId && fMember ? { freelancerId: fId, freelancerName: fMember.name } : {}),
          },
          fullVideoEditing: {
            status: 'pending',
            dueDate: new Date(fullVideoDue),
          },
          clientReview: {
            status: reqs.fullVideo.clientReviewRequired ? 'pending' : 'notRequired',
            required: reqs.fullVideo.clientReviewRequired,
            history: [],
          },
          delivered: false,
        }
      }

      if (!selectedProject.projectId.startsWith('demo-')) {
        await initializePostProduction(selectedProject.projectId, newPostProdData)
        try {
          await createPostProdWorkItems(
            selectedProject.projectId,
            newPostProdData,
            selectedProject,
            appUser?.uid || 'admin'
          )
        } catch (workErr) {
          console.warn('Could not auto-create post-prod work items:', workErr)
        }
      }

      setProjects(prev =>
        prev.map(p =>
          p.projectId === selectedProject.projectId
            ? { ...p, postProduction: newPostProdData }
            : p
        )
      )
    } catch (err) {
      console.error('Failed to initialize post-production:', err)
      alert('Failed to start post-production. Please check console.')
    } finally {
      setIsSubmittingSetup(false)
    }
  }

  const handleTrackCheckboxToggle = async (
    trackKey: PostProdTrackKey,
    field: string,
    currentVal: boolean
  ) => {
    if (!selectedProject || !selectedProject.postProduction) return
    const pp = selectedProject.postProduction
    const currentTrack = pp[trackKey]
    if (!currentTrack) return

    const updatedTrack = {
      ...currentTrack,
      [field]: !currentVal,
    }
    const updatedPP: PostProductionData = {
      ...pp,
      [trackKey]: updatedTrack,
    }

    setProjects(prev =>
      prev.map(p =>
        p.projectId === selectedProject.projectId
          ? { ...p, postProduction: updatedPP }
          : p
      )
    )

    try {
      await updateTrackCheckbox(selectedProject.projectId, trackKey, field, !currentVal)
    } catch (err) {
      console.error('Failed to update track checkbox:', err)
    }
  }

  const handleTrackStageStatusChange = async (
    trackKey: PostProdTrackKey,
    stageKey: string,
    newStatus: PostProdStageStatus,
    currentStartDate?: Date
  ) => {
    if (!selectedProject || !selectedProject.postProduction) return
    const pp = selectedProject.postProduction
    const currentTrack = pp[trackKey]
    if (!currentTrack) return

    const currentStageData = (currentTrack as unknown as Record<string, unknown>)[stageKey] as Record<string, unknown>
    const updatedStageData = {
      ...currentStageData,
      status: newStatus,
      startDate: newStatus === 'inProgress' && !currentStartDate ? new Date() : (currentStageData?.startDate as Date | undefined),
    }

    const updatedTrack: Record<string, unknown> = {
      ...currentTrack,
      status: 'inProgress' as PostProdTrackStatus,
      [stageKey]: updatedStageData,
    }

    if (newStatus === 'waitingClient') {
      const cr = (currentTrack as unknown as Record<string, unknown>).clientReview as Record<string, unknown> | undefined
      if (cr) {
        updatedTrack.clientReview = {
          ...cr,
          status: 'waitingClient',
        }
      }
    }

    const updatedPP: PostProductionData = {
      ...pp,
      [trackKey]: updatedTrack as unknown as typeof currentTrack,
    }

    setProjects(prev =>
      prev.map(p =>
        p.projectId === selectedProject.projectId
          ? { ...p, postProduction: updatedPP }
          : p
      )
    )

    try {
      await updateTrackStageStatus(
        selectedProject.projectId,
        trackKey,
        stageKey,
        newStatus,
        Boolean(currentStartDate)
      )
    } catch (err) {
      console.error('Failed to update stage status:', err)
    }
  }

  const handleClientReviewAction = async (
    trackKey: PostProdTrackKey,
    decision: 'approved' | 'notApproved',
    notes?: string
  ) => {
    if (!selectedProject || !selectedProject.postProduction) return
    setIsSubmittingReview(true)
    try {
      await submitClientReview(
        selectedProject.projectId,
        trackKey,
        decision,
        appUser?.name || 'Admin',
        notes
      )

      if (selectedProject.projectId.startsWith('demo-')) {
        const pp = selectedProject.postProduction
        const currentTrack = pp[trackKey]
        if (currentTrack) {
          let stageKey = ''
          if (trackKey === 'photoTrack') stageKey = 'designing'
          else if (trackKey === 'albumTrack') stageKey = 'albumDesigning'
          else if (trackKey === 'videoTrack') stageKey = 'highlights'
          else if (trackKey === 'fullVideoTrack') stageKey = 'fullVideoEditing'

          const updatedTrack: Record<string, unknown> = {
            ...currentTrack,
            clientReview: {
              ...((currentTrack.clientReview as unknown) as Record<string, unknown>),
              status: decision,
            },
          }
          if (stageKey) {
            const currentStage = ((currentTrack as unknown) as Record<string, unknown>)[stageKey] as Record<string, unknown> | undefined
            updatedTrack[stageKey] = {
              ...(currentStage || {}),
              status: decision === 'approved' ? 'completed' : 'pending',
            }
          }
          const updatedPP: PostProductionData = {
            ...pp,
            [trackKey]: updatedTrack as unknown as typeof currentTrack,
          }
          setProjects(prev => prev.map(p => p.projectId === selectedProject.projectId ? { ...p, postProduction: updatedPP } : p))
        }
      }

      setRejectModalTrack(null)
      setRejectNotes('')
    } catch (err) {
      console.error('Failed to submit client review:', err)
    } finally {
      setIsSubmittingReview(false)
    }
  }

  const currentPanelConfig = useMemo(() => {
    return STAGE_CONFIGS.find(s => s.stageKey === panelStageKey) || null
  }, [panelStageKey])

  const panelGates = useMemo(() => {
    if (!currentPanelConfig || !selectedProject) return []
    const stageIdx = STAGE_ORDER.indexOf(currentPanelConfig.stageKey)

    // Dynamic gates for Post-Production when requirements exist
    if (currentPanelConfig.stageKey === 'postProduction' && selectedProject.postProdRequirements) {
      if (!selectedProject.postProduction?.isConfigured) {
        return [
          { label: 'Post-Production Setup configured', done: false, isOptional: false }
        ]
      }
      const reqs = selectedProject.postProdRequirements
      const pp = selectedProject.postProduction
      const dynamicGates: Array<{ label: string; done: boolean; isOptional: boolean }> = []

      if (reqs.photography?.required && pp.photoTrack) {
        const key = `${selectedProject.projectId}_postProduction_Photo track completed`
        const isDone = gateOverrides[key] !== undefined ? gateOverrides[key] : isPhotoTrackComplete(pp.photoTrack)
        dynamicGates.push({ label: 'Photo track completed', done: isDone, isOptional: false })
      }
      if (reqs.album?.required && pp.albumTrack) {
        const key = `${selectedProject.projectId}_postProduction_Album track completed`
        const isDone = gateOverrides[key] !== undefined ? gateOverrides[key] : isAlbumTrackComplete(pp.albumTrack)
        dynamicGates.push({ label: 'Album track completed', done: isDone, isOptional: false })
      }
      if (reqs.videoHighlights?.required && pp.videoTrack) {
        const key = `${selectedProject.projectId}_postProduction_Video Highlights completed`
        const isDone = gateOverrides[key] !== undefined ? gateOverrides[key] : isVideoTrackComplete(pp.videoTrack)
        dynamicGates.push({ label: 'Video Highlights completed', done: isDone, isOptional: false })
      }
      if (reqs.fullVideo?.required && pp.fullVideoTrack) {
        const key = `${selectedProject.projectId}_postProduction_Full Video completed`
        const isDone = gateOverrides[key] !== undefined ? gateOverrides[key] : isFullVideoTrackComplete(pp.fullVideoTrack)
        dynamicGates.push({ label: 'Full Video completed', done: isDone, isOptional: false })
      }

      return dynamicGates.length > 0 ? dynamicGates : [{ label: 'All tracks completed', done: true, isOptional: false }]
    }

    return currentPanelConfig.defaultGates.map((gateText: string, i: number) => {
      const key = `${selectedProject.projectId}_${currentPanelConfig.stageKey}_${gateText}`
      // Requirement 4: Freelancer checklist is not mandatory in preprod
      const isOptional = currentPanelConfig.stageKey === 'preProduction' && gateText.toLowerCase().includes('freelancer')
      const isBalanceGate = gateText.toLowerCase().includes('balance') || gateText.toLowerCase().includes('outstanding')
      const isRawFootageGate = gateText.toLowerCase().includes('raw footage')

      let isDone = false
      if (isBalanceGate) {
        // Balance gate: strictly depends on remaining balance due
        isDone = !isPaymentPending && effectiveBalanceDue <= 0
      } else if (isRawFootageGate) {
        // Raw footage gate: NEVER auto-ticks! Only done if explicitly ticked or project already completed eventDay
        if (gateOverrides[key] !== undefined) {
          isDone = gateOverrides[key]
        } else if (stageIdx < currentStageIndex) {
          isDone = true
        } else {
          isDone = false
        }
      } else if (gateOverrides[key] !== undefined) {
        isDone = gateOverrides[key]
      } else if (currentPanelConfig.stageKey === 'postProduction') {
        if (gateText === 'Photo track completed') isDone = isPhotoTrackAllDone
        else if (gateText === 'Video track completed') isDone = isVideoTrackAllDone
      } else if (currentPanelConfig.stageKey === 'planning' && gateText.toLowerCase().includes('core team')) {
        isDone = (selectedProject.staffUids || []).length > 0
      } else if (stageIdx < currentStageIndex) {
        isDone = true
      } else if (stageIdx === currentStageIndex) {
        // Do not auto tick gates in the active stage
        isDone = false
      }

      return { label: gateText, done: isDone, isOptional }
    })
  }, [currentPanelConfig, selectedProject, currentStageIndex, gateOverrides, isPhotoTrackAllDone, isVideoTrackAllDone, isPaymentPending, effectiveBalanceDue])

  const allPanelGatesDone = useMemo(() => {
    if (panelGates.length === 0) return false

    // If delivered stage and payment is pending, cannot advance or complete
    if (panelStageKey === 'delivered' && (effectiveBalanceDue > 0 || isPaymentPending)) {
      return false
    }

    // Requirement 4: Optional gates do not block stage advancement
    const mandatoryGatesDone = panelGates.every(g => g.isOptional || g.done)
    if (!mandatoryGatesDone) return false

    // Requirement 3: Mandatory team member assigning in planning, preprod, Event day, post prod
    if (isTeamAssignmentMandatory && !hasAssignedTeamMembers) return false

    // Requirement 6: Event day cannot advance until shoot timing is completed
    if (panelStageKey === 'eventDay' && !shootTimingInfo.isCompleted) return false

    return true
  }, [panelGates, isTeamAssignmentMandatory, hasAssignedTeamMembers, panelStageKey, shootTimingInfo.isCompleted, effectiveBalanceDue, isPaymentPending])

  const nextStageKey = useMemo((): ProjectStage | null => {
    if (!panelStageKey) return null
    const idx = STAGE_ORDER.indexOf(panelStageKey)
    if (idx >= 0 && idx < STAGE_ORDER.length - 1) {
      return STAGE_ORDER[idx + 1]
    }
    return null
  }, [panelStageKey])

  const panelStageStatus = useMemo((): 'completed' | 'active' | 'pending' => {
    if (!panelStageKey) return 'pending'
    if (selectedProject?.bookingType === 'recurring') {
      if (panelStageKey === 'eventDay' && multiEventDays[selectedDayTab]) {
        return getDaySessionStatus(multiEventDays[selectedDayTab], selectedDayTab)
      }
      if (panelStageKey === 'postProduction') {
        return getSessionPostProdStatus(selectedDayTab)
      }
      if (panelStageKey === 'delivered') {
        return getSessionDeliveryStatus(selectedDayTab)
      }
    }
    if (panelStageKey === 'eventDay' && multiEventDays.length > 1 && multiEventDays[selectedDayTab]) {
      return getDaySessionStatus(multiEventDays[selectedDayTab], selectedDayTab)
    }
    return getStageStatus(panelStageKey)
  }, [panelStageKey, selectedProject, getDaySessionStatus, getSessionPostProdStatus, getSessionDeliveryStatus, multiEventDays, selectedDayTab, getStageStatus])

  // ─── ADVANCE STAGE HANDLER ──────────────────────────────────────────────
  const handleAdvanceStage = async () => {
    if (!selectedProject || !panelStageKey || !nextStageKey) return
    const hasOverride = overrideReason.trim().length > 0
    if (!allPanelGatesDone && !hasOverride) return

    setIsAdvancing(true)
    const nowCompleted = new Date()
    try {
      if (selectedProject.projectId.startsWith('demo-')) {
        setProjects(prev => prev.map(p => {
          if (p.projectId === selectedProject.projectId) {
            return {
              ...p,
              stage: nextStageKey,
              status: 'ongoing',
              stageCompletedAt: {
                ...(p.stageCompletedAt || {}),
                [panelStageKey]: nowCompleted,
              },
              updatedAt: nowCompleted,
            }
          }
          return p
        }))
      } else {
        await updateProjectStage(
          selectedProject.projectId,
          nextStageKey,
          selectedProject.clientId,
          hasOverride ? { by: appUser?.name || 'Admin', reason: overrideReason.trim() } : undefined,
          panelStageKey
        )
        setProjects(prev => prev.map(p => {
          if (p.projectId === selectedProject.projectId) {
            return {
              ...p,
              stage: nextStageKey,
              status: 'ongoing',
              stageCompletedAt: {
                ...(p.stageCompletedAt || {}),
                [panelStageKey]: nowCompleted,
              },
              updatedAt: nowCompleted,
            }
          }
          return p
        }))
      }

      setPanelStageKey(nextStageKey)
      setOverrideReason('')
    } catch (err) {
      console.error('Failed to advance project stage:', err)
    } finally {
      setIsAdvancing(false)
    }
  }

  const handleCompleteHandover = async () => {
    if (!selectedProject) return
    if (effectiveBalanceDue > 0 || isPaymentPending) {
      alert(`Outstanding balance of ₹${effectiveBalanceDue.toLocaleString('en-IN')} is still due. Please record payment before completing final handover.`)
      setRecordPaymentModalOpen(true)
      return
    }
    const hasOverride = overrideReason.trim().length > 0
    if (!allPanelGatesDone && !hasOverride) return

    setIsAdvancing(true)
    const nowCompleted = new Date()
    try {
      const signoffKey = `${selectedProject.projectId}_delivered_Client sign-off received`
      setGateOverrides(prev => ({ ...prev, [signoffKey]: true }))

      if (selectedProject.projectId.startsWith('demo-')) {
        setProjects(prev => prev.map(p => {
          if (p.projectId === selectedProject.projectId) {
            return {
              ...p,
              status: 'completed',
              stageCompletedAt: {
                ...(p.stageCompletedAt || {}),
                delivered: nowCompleted,
              },
              stageGates: {
                ...(p.stageGates || {}),
                delivered: {
                  'Outstanding balance = ₹0': true,
                  'Client sign-off received': true,
                },
              },
              updatedAt: nowCompleted,
            }
          }
          return p
        }))
      } else {
        await updateProjectStage(
          selectedProject.projectId,
          'delivered',
          selectedProject.clientId,
          hasOverride ? { by: appUser?.name || 'Admin', reason: overrideReason.trim() } : undefined,
          'delivered'
        )
        await updateProjectStageGates(selectedProject.projectId, 'delivered', {
          'Outstanding balance = ₹0': true,
          'Client sign-off received': true,
        }).catch(() => {})

        setProjects(prev => prev.map(p => {
          if (p.projectId === selectedProject.projectId) {
            return {
              ...p,
              status: 'completed',
              stageCompletedAt: {
                ...(p.stageCompletedAt || {}),
                delivered: nowCompleted,
              },
              stageGates: {
                ...(p.stageGates || {}),
                delivered: {
                  'Outstanding balance = ₹0': true,
                  'Client sign-off received': true,
                },
              },
              updatedAt: nowCompleted,
            }
          }
          return p
        }))
      }
      setOverrideReason('')
    } catch (err) {
      console.error('Failed to complete project handover:', err)
    } finally {
      setIsAdvancing(false)
    }
  }

  // ─── TEAM ASSIGNMENT HELPERS ────────────────────────────────────────────
  const assignedTeamMembers = useMemo(() => {
    if (!selectedProject) return []
    const uids = selectedProject.staffUids || []
    return staffList.filter(s => uids.includes(s.uid))
  }, [selectedProject, staffList])

  const unassignedStaff = useMemo(() => {
    if (!selectedProject) return []
    const uids = selectedProject.staffUids || []
    return staffList.filter(s => !uids.includes(s.uid))
  }, [selectedProject, staffList])

  const handleAssignStaff = async (staffUid: string) => {
    if (!selectedProject) return
    if (selectedProject.projectId.startsWith('demo-')) {
      setProjects(prev => {
        const next = prev.map(p => {
          if (p.projectId === selectedProject.projectId) {
            return { ...p, staffUids: [...(p.staffUids || []), staffUid] }
          }
          return p
        })
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem('studio_zoom_demo_projects', JSON.stringify(next))
            window.dispatchEvent(new Event('studio_zoom_projects_changed'))
          } catch {}
        }
        return next
      })
    } else {
      await assignStaffToProject(selectedProject.projectId, staffUid, selectedProject.clientId)
    }
  }

  const handleRemoveStaff = async (staffUid: string) => {
    if (!selectedProject) return
    if (selectedProject.projectId.startsWith('demo-')) {
      setProjects(prev => {
        const next = prev.map(p => {
          if (p.projectId === selectedProject.projectId) {
            return { ...p, staffUids: (p.staffUids || []).filter(id => id !== staffUid) }
          }
          return p
        })
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem('studio_zoom_demo_projects', JSON.stringify(next))
            window.dispatchEvent(new Event('studio_zoom_projects_changed'))
          } catch {}
        }
        return next
      })
    } else {
      await removeStaffFromProject(selectedProject.projectId, staffUid, selectedProject.clientId)
    }
  }

  // ─── FREELANCER ASSIGNMENT HELPERS ──────────────────────────────────────
  const assignedFreelancers = useMemo(() => {
    if (!selectedProject) return []
    const ids = selectedProject.freelancerIds || []
    return freelancerList.filter(f => ids.includes(f.freelancerId))
  }, [selectedProject, freelancerList])

  const unassignedFreelancers = useMemo(() => {
    if (!selectedProject) return []
    const ids = selectedProject.freelancerIds || []
    return freelancerList.filter(f => !ids.includes(f.freelancerId) && f.isActive !== false)
  }, [selectedProject, freelancerList])

  const handleAssignFreelancer = async (freelancerId: string) => {
    if (!selectedProject) return
    const fl = freelancerList.find(f => f.freelancerId === freelancerId)
    const assignedRole = fl ? (fl.skill.charAt(0).toUpperCase() + fl.skill.slice(1)) : 'Photographer'
    const assignedRate = fl?.dayRate || 6000

    setProjects(prev => {
      const next = prev.map(p => {
        if (p.projectId === selectedProject.projectId) {
          const updatedIds = Array.from(new Set([...(p.freelancerIds || []), freelancerId]))
          const updatedAssignments = {
            ...(p.freelancerAssignments || {}),
            [freelancerId]: { role: assignedRole, days: 1, dayRate: assignedRate }
          }
          const updatedRates = {
            ...(p.freelancerRates || {}),
            [freelancerId]: assignedRate
          }
          return {
            ...p,
            freelancerIds: updatedIds,
            freelancerAssignments: updatedAssignments,
            freelancerRates: updatedRates,
            updatedAt: new Date(),
          }
        }
        return p
      })
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('studio_zoom_demo_projects', JSON.stringify(next))
          window.dispatchEvent(new Event('studio_zoom_projects_changed'))
        } catch {}
      }
      return next
    })

    // Auto check 'Freelancer crew confirmed' gate if in Pre-Prod
    const overrideKey = `${selectedProject.projectId}_preProduction_Freelancer crew confirmed`
    setGateOverrides(prev => ({ ...prev, [overrideKey]: true }))

    if (!selectedProject.projectId.startsWith('demo-')) {
      try {
        await assignFreelancerToProject(selectedProject.projectId, freelancerId, {
          role: assignedRole,
          days: 1,
          dayRate: assignedRate,
        }, selectedProject.clientId)
      } catch (err) {
        console.error('Failed to assign freelancer in Firestore:', err)
      }
    }
  }

  const handleRemoveFreelancer = async (freelancerId: string) => {
    if (!selectedProject) return

    setProjects(prev => {
      const next = prev.map(p => {
        if (p.projectId === selectedProject.projectId) {
          const updatedIds = (p.freelancerIds || []).filter(id => id !== freelancerId)
          const updatedAssignments = { ...(p.freelancerAssignments || {}) }
          delete updatedAssignments[freelancerId]
          const updatedRates = { ...(p.freelancerRates || {}) }
          delete updatedRates[freelancerId]
          return {
            ...p,
            freelancerIds: updatedIds,
            freelancerAssignments: updatedAssignments,
            freelancerRates: updatedRates,
            updatedAt: new Date(),
          }
        }
        return p
      })
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('studio_zoom_demo_projects', JSON.stringify(next))
          window.dispatchEvent(new Event('studio_zoom_projects_changed'))
        } catch {}
      }
      return next
    })

    if (!selectedProject.projectId.startsWith('demo-')) {
      try {
        await unassignFreelancerFromProject(selectedProject.projectId, freelancerId, selectedProject.clientId)
      } catch (err) {
        console.error('Failed to unassign freelancer in Firestore:', err)
      }
    }
  }

  const formatShortDate = (d: unknown) => {
    if (!d) return '—'
    let date: Date
    if (d instanceof Date) {
      date = d
    } else if (typeof (d as { toDate?: () => Date }).toDate === 'function') {
      date = (d as { toDate: () => Date }).toDate()
    } else if (typeof d === 'object' && d !== null && 'seconds' in d && typeof (d as { seconds: number }).seconds === 'number') {
      date = new Date((d as { seconds: number }).seconds * 1000)
    } else if (typeof d === 'object' && d !== null && '_seconds' in d && typeof (d as { _seconds: number })._seconds === 'number') {
      date = new Date((d as { _seconds: number })._seconds * 1000)
    } else {
      date = new Date(d as string | number)
    }
    if (isNaN(date.getTime())) return '—'
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  }



  // ─── POST-PROD PARALLEL TRACKS PROGRESS ─────────────────────────────────
  const isPostProdActive = currentStageIndex >= 4
  const isPostProdComplete = currentStageIndex > 4

  // ─── WIRE RENDER HELPER FUNCTION ────────────────────────────────────────
  const renderWire = (
    fromId: string,
    toId: string,
    isActive: boolean,
    isCompleted: boolean,
    label?: string
  ) => {
    const p1 = ports[fromId]
    const p2 = ports[toId]
    if (
      !p1 || !p2 ||
      typeof p1.x !== 'number' || typeof p1.y !== 'number' ||
      typeof p2.x !== 'number' || typeof p2.y !== 'number' ||
      isNaN(p1.x) || isNaN(p1.y) || isNaN(p2.x) || isNaN(p2.y)
    ) {
      return null
    }

    const dx = Math.max(40, Math.abs(p2.x - p1.x) * 0.5)
    const pathData = `M ${p1.x} ${p1.y} C ${p1.x + dx} ${p1.y}, ${p2.x - dx} ${p2.y}, ${p2.x} ${p2.y}`
    const midX = (p1.x + p2.x) / 2
    const midY = (p1.y + p2.y) / 2

    const strokeColor = isCompleted
      ? 'var(--color-success)'
      : isActive
      ? 'var(--color-primary)'
      : 'var(--color-border-strong)'

    return (
      <g key={`${fromId}-${toId}`}>
        {/* Glowing highlight for active wire */}
        {isActive && (
          <path
            d={pathData}
            fill="none"
            stroke="var(--color-primary)"
            strokeWidth="6"
            strokeOpacity="0.25"
          />
        )}
        {/* Main curved wire */}
        <path
          d={pathData}
          fill="none"
          stroke={strokeColor}
          strokeWidth="2.5"
          strokeDasharray={!isActive && !isCompleted ? '5 4' : undefined}
        />
        {/* Optional branch badge pill in middle of curve (like [1], [2] in user screenshot) */}
        {label && (
          <g transform={`translate(${midX}, ${midY})`}>
            <rect
              x="-12"
              y="-10"
              width="24"
              height="20"
              rx="6"
              fill="var(--color-surface)"
              stroke={strokeColor}
              strokeWidth="1.5"
            />
            <text
              textAnchor="middle"
              dominantBaseline="central"
              fill="var(--color-foreground)"
              fontSize="10"
              fontWeight="700"
              fontFamily="var(--font-inter)"
            >
              {label}
            </text>
          </g>
        )}
      </g>
    )
  }

  return (
    <div style={{
      display: 'flex',
      height: '100%',
      width: '100%',
      overflow: 'hidden',
      fontFamily: 'var(--font-inter)',
      background: 'var(--color-background)',
    }}>
      
      {/* ─── LEFT RAIL: PROJECT LIST ────────────────────────────────────── */}
      <aside style={{
        width: '280px',
        flexShrink: 0,
        borderRight: '0.5px solid var(--color-border)',
        background: 'var(--color-surface)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 10,
      }}>
        {/* Top KPI Filter Chips */}
        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', borderBottom: '0.5px solid var(--color-border)' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            {/* Ongoing Chip */}
            <div
              onClick={() => {
                setRailFilter('active')
                const match = projects.find(p => {
                  const ed = p.eventDate instanceof Date ? p.eventDate : new Date(p.eventDate)
                  return p.stage !== 'delivered' && p.status !== 'completed' && ed.getTime() >= now.getTime()
                })
                if (match) handleSelectProject(match.projectId)
              }}
              style={{
                flex: 1,
                cursor: 'pointer',
                background: railFilter === 'active' ? 'var(--color-primary-muted)' : 'var(--color-surface-raised)',
                border: `0.5px solid ${railFilter === 'active' ? 'var(--color-primary)' : 'var(--color-border)'}`,
                borderRadius: '8px',
                padding: '8px 0',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                transition: 'all 0.15s ease',
              }}
            >
              <span style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--color-primary)' }}>
                {ongoingCount}
              </span>
              <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-foreground-subtle)' }}>
                Ongoing
              </span>
            </div>

            {/* Done Chip */}
            <div
              onClick={() => {
                setRailFilter('done')
                const match = projects.find(p => p.stage === 'delivered' || p.status === 'completed')
                if (match) handleSelectProject(match.projectId)
              }}
              style={{
                flex: 1,
                cursor: 'pointer',
                background: railFilter === 'done' ? 'var(--color-success-muted)' : 'var(--color-surface-raised)',
                border: `0.5px solid ${railFilter === 'done' ? 'var(--color-success)' : 'var(--color-border)'}`,
                borderRadius: '8px',
                padding: '8px 0',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                transition: 'all 0.15s ease',
              }}
            >
              <span style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--color-success)' }}>
                {doneCount}
              </span>
              <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-foreground-subtle)' }}>
                Done
              </span>
            </div>

            {/* Overdue Chip */}
            <div
              onClick={() => {
                setRailFilter('overdue')
                const match = projects.find(p => {
                  const ed = p.eventDate instanceof Date ? p.eventDate : new Date(p.eventDate)
                  return (p.stage !== 'delivered' && p.status !== 'completed') && ed.getTime() < now.getTime()
                })
                if (match) handleSelectProject(match.projectId)
              }}
              style={{
                flex: 1,
                cursor: 'pointer',
                background: railFilter === 'overdue' ? 'var(--color-danger-muted)' : 'var(--color-surface-raised)',
                border: `0.5px solid ${railFilter === 'overdue' ? 'var(--color-danger)' : 'var(--color-border)'}`,
                borderRadius: '8px',
                padding: '8px 0',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                transition: 'all 0.15s ease',
              }}
            >
              <span style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--color-danger)' }}>
                {overdueCount}
              </span>
              <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-foreground-subtle)' }}>
                Overdue
              </span>
            </div>
          </div>

          {/* Live Search */}
          <div style={{ position: 'relative' }}>
            <i
              className="ti ti-search"
              style={{
                fontSize: '15px',
                color: 'var(--color-foreground-subtle)',
                position: 'absolute',
                left: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
              }}
            />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search events"
              style={{
                fontFamily: 'var(--font-inter)',
                width: '100%',
                boxSizing: 'border-box',
                height: '34px',
                background: 'var(--color-surface-raised)',
                border: '0.5px solid var(--color-border)',
                borderRadius: '8px',
                padding: '0 10px 0 32px',
                fontSize: 'var(--text-sm)',
                color: 'var(--color-foreground)',
                outline: 'none',
              }}
            />
            {searchQuery && (
              <span
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  cursor: 'pointer',
                  color: 'var(--color-foreground-subtle)',
                }}
              >
                <i className="ti ti-x" style={{ fontSize: '14px' }} />
              </span>
            )}
          </div>
        </div>

        {/* Scrollable Project Cards */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {filteredProjects.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '36px 16px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '8px',
            }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: 'var(--color-surface-raised)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '0.5px solid var(--color-border)',
              }}>
                <i className="ti ti-users" style={{ fontSize: '20px', color: 'var(--color-foreground-muted)' }} />
              </div>
              <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-foreground)' }}>
                {projects.length === 0 ? 'No clients' : 'No clients found'}
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)', lineHeight: 1.4 }}>
                {projects.length === 0 ? 'No bookings in the system' : 'Try adjusting your search or filter'}
              </div>
            </div>
          ) : (
            filteredProjects.map(p => {
              const isSelected = p.projectId === selectedProject?.projectId
              const isOverdue = isProjectOverdue(p, now)
              const isMultiDay = (p.eventDates && p.eventDates.length > 1) || p.bookingType === 'multiDate'
              const isRecurring = p.bookingType === 'recurring'

              return (
                <div
                  key={p.projectId}
                  onClick={() => handleSelectProject(p.projectId)}
                  style={{
                    cursor: 'pointer',
                    borderRadius: '10px',
                    padding: '12px 14px',
                    background: isSelected ? 'var(--color-primary-muted)' : 'var(--color-surface-raised)',
                    borderTop: '0.5px solid var(--color-border)',
                    borderRight: '0.5px solid var(--color-border)',
                    borderBottom: '0.5px solid var(--color-border)',
                    borderLeft: `3px solid ${isSelected ? 'var(--color-primary)' : 'transparent'}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '6px' }}>
                    <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--color-foreground)' }}>
                      {p.eventName || p.clientName}
                    </span>
                    {isMultiDay && (
                      <span style={{
                        fontSize: '9px',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        padding: '1px 5px',
                        borderRadius: '4px',
                        background: 'var(--color-accent-muted)',
                        color: 'var(--color-accent)',
                      }}>
                        Multi-Day
                      </span>
                    )}
                    {isRecurring && (
                      <span style={{
                        fontSize: '9px',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        padding: '1px 5px',
                        borderRadius: '4px',
                        background: 'var(--color-purple-muted)',
                        color: 'var(--color-purple)',
                      }}>
                        {p.sessionIndex ? `Session ${p.sessionIndex}/${p.totalSessions || ''}` : 'Recurring'}
                      </span>
                    )}
                  </div>

                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ textTransform: 'capitalize' }}>
                      {p.eventType === 'other' && p.customEventType ? p.customEventType : p.eventType}
                    </span>
                    <span>·</span>
                    {p.sessionIndex ? (
                      <span>{formatShortDate(p.eventDate)}{p.sessionRate ? ` · ₹${p.sessionRate.toLocaleString('en-IN')}` : ''}</span>
                    ) : isRecurring && p.recurringSchedule ? (
                      <span>
                        {formatShortDate(p.recurringSchedule.startDate)}
                        {p.recurringSchedule.frequency ? ` · ${p.recurringSchedule.frequency}` : ''}
                      </span>
                    ) : (
                      <span>{formatShortDate(p.eventDate)}</span>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2px' }}>
                    <Badge variant={p.stage} />
                    {isOverdue && (
                      <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--color-danger)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                        <i className="ti ti-alert-triangle" style={{ fontSize: '12px' }} />
                        Overdue
                      </span>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </aside>

      {/* ─── MAIN CANVAS WORKSPACE ──────────────────────────────────────── */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        
        {/* Canvas Top Bar */}
        <header style={{
          height: '56px',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '0 24px',
          borderBottom: '0.5px solid var(--color-border)',
          background: 'var(--color-surface)',
          zIndex: 5,
        }}>
          {selectedProject ? (
            <>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: 'var(--text-base)', fontWeight: 700, whiteSpace: 'nowrap', color: 'var(--color-foreground)' }}>
                  {selectedProject.eventName || selectedProject.clientName}
                </span>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>
                  <span style={{ textTransform: 'capitalize' }}>
                    {selectedProject.eventType === 'other' && selectedProject.customEventType ? selectedProject.customEventType : selectedProject.eventType}
                  </span>
                  {' · '}
                  {selectedProject.bookingType === 'recurring' && selectedProject.recurringSchedule ? (
                    `${formatShortDate(selectedProject.recurringSchedule.startDate)} – ${formatShortDate(selectedProject.recurringSchedule.endDate)}`
                  ) : (
                    formatShortDate(selectedProject.eventDate)
                  )}
                  {selectedProject.clientName && ` · ${selectedProject.clientName}`}
                </span>
              </div>
              <Badge variant={selectedProject.stage} />
              {isMultiEvent && (
                <span style={{
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '10px',
                  background: 'var(--color-surface-raised)',
                  color: 'var(--color-foreground-muted)',
                  border: '0.5px solid var(--color-border)',
                }}>
                  {multiEventDays.length} Event Tracks
                </span>
              )}
              {selectedProject.sessionIndex ? (
                <>
                  <span style={{
                    fontSize: 'var(--text-xs)',
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: '10px',
                    background: 'var(--color-purple-muted)',
                    color: 'var(--color-purple)',
                    border: '0.5px solid var(--color-border)',
                  }}>
                    Recurring · Session {selectedProject.sessionIndex} of {selectedProject.totalSessions || ''}
                  </span>
                  {sessionRate > 0 && (
                    <span style={{
                      fontSize: 'var(--text-xs)',
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: '10px',
                      background: 'var(--color-surface-raised)',
                      color: 'var(--color-foreground)',
                      border: '0.5px solid var(--color-border)',
                    }}>
                      ₹{sessionRate.toLocaleString('en-IN')} / session
                    </span>
                  )}
                </>
              ) : selectedProject.bookingType === 'recurring' && selectedProject.recurringSchedule ? (
                <span style={{
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '10px',
                  background: 'var(--color-purple-muted)',
                  color: 'var(--color-purple)',
                  border: '0.5px solid var(--color-border)',
                }}>
                  {selectedProject.recurringSchedule.totalSessions} Sessions · {selectedProject.recurringSchedule.frequency.charAt(0).toUpperCase() + selectedProject.recurringSchedule.frequency.slice(1)}
                </span>
              ) : null}
            </>
          ) : (
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-foreground-muted)' }}>
              {projects.length === 0 ? 'No clients or bookings' : 'Select a project from the left rail'}
            </span>
          )}

          <div style={{ flex: 1 }} />

          {/* Zoom Controls */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '2px',
            background: 'var(--color-surface-raised)',
            border: '0.5px solid var(--color-border)',
            borderRadius: '8px',
            padding: '2px',
          }}>
            <span
              onClick={() => setZoom(z => Math.max(0.5, +(z - 0.1).toFixed(1)))}
              title="Zoom out"
              style={{
                width: '26px',
                height: '26px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '6px',
                cursor: 'pointer',
                color: 'var(--color-foreground-muted)',
              }}
            >
              <i className="ti ti-minus" style={{ fontSize: '14px' }} />
            </span>
            <span
              onClick={() => {
                setZoom(1)
                setPan({ x: 48, y: 48 })
              }}
              title="Click to reset view (100% zoom & center)"
              style={{
                minWidth: '44px',
                textAlign: 'center',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                color: 'var(--color-foreground-muted)',
                cursor: 'pointer',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {Math.round(zoom * 100)}%
            </span>
            <span
              onClick={() => setZoom(z => Math.min(1.4, +(z + 0.1).toFixed(1)))}
              title="Zoom in"
              style={{
                width: '26px',
                height: '26px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '6px',
                cursor: 'pointer',
                color: 'var(--color-foreground-muted)',
              }}
            >
              <i className="ti ti-plus" style={{ fontSize: '14px' }} />
            </span>
          </div>

          {/* Reset Positions Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleResetPositions}
            title="Reset all node positions to default layout"
            style={{
              height: '32px',
              fontSize: 'var(--text-xs)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              borderColor: Object.keys(nodeOffsets).length > 0 ? 'var(--color-primary)' : 'var(--color-border)',
              color: Object.keys(nodeOffsets).length > 0 ? 'var(--color-primary)' : 'var(--color-foreground)',
            }}
          >
            <i className="ti ti-refresh" style={{ fontSize: '14px' }} />
            Reset positions
          </Button>

          {/* Project Detail Link Button */}
          {selectedProject?.clientId && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/clients/${selectedProject.clientId}`)}
              style={{ height: '32px', fontSize: 'var(--text-xs)' }}
            >
              <i className="ti ti-external-link" style={{ marginRight: '4px', fontSize: '14px' }} />
              Project detail
            </Button>
          )}
        </header>

        {/* ─── NODE-GRAPH WORKFLOW CANVAS ───────────────────────────────── */}
        {!selectedProject ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--color-background)',
              backgroundImage: 'radial-gradient(var(--color-border) 1.2px, transparent 1.2px)',
              backgroundSize: '24px 24px',
              padding: '40px 24px',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '16px',
                background: 'var(--color-primary-muted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '16px',
                border: '0.5px solid var(--color-border)',
              }}
            >
              <i className="ti ti-calendar-plus" style={{ fontSize: '30px', color: 'var(--color-primary)' }} />
            </div>

            <div style={{ fontSize: 'var(--text-xl)', fontWeight: 600, color: 'var(--color-foreground)', marginBottom: '8px' }}>
              {projects.length === 0 ? 'No Clients or Bookings' : 'No Event Selected'}
            </div>

            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-foreground-muted)', maxWidth: '380px', lineHeight: 1.6, marginBottom: '24px' }}>
              {projects.length === 0
                ? 'There are currently no clients or bookings. Create a new booking to start tracking events and workflows on the board.'
                : 'Select an event from the left list to view and manage its interactive workflow canvas.'}
            </div>

            <Button
              onClick={() => router.push('/clients/new')}
              style={{
                background: 'var(--color-primary)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                padding: '0 20px',
                height: '40px',
                fontSize: 'var(--text-sm)',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
                fontFamily: 'var(--font-inter)',
              }}
            >
              <i className="ti ti-plus" style={{ fontSize: '16px' }} />
              Create New Booking
            </Button>
          </div>
        ) : (
          <div
            ref={canvasRef}
          onMouseDown={handleCanvasMouseDown}
          style={{
            flex: 1,
            position: 'relative',
            overflow: 'hidden',
            background: 'var(--color-background)',
            backgroundImage: 'radial-gradient(var(--color-border) 1.2px, transparent 1.2px)',
            backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
            backgroundPosition: `${pan.x}px ${pan.y}px`,
            cursor: isDragging ? 'grabbing' : 'grab',
            userSelect: isDragging ? 'none' : 'auto',
          }}
        >
          {/* Zoomable & All-Direction Pannable Inner Canvas Container */}
          <div
            ref={innerContainerRef}
            style={{
              transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
              transformOrigin: '0 0',
              minWidth: '2200px',
              minHeight: '1200px',
              padding: '60px 80px 180px',
              position: 'relative',
              cursor: isDragging ? 'grabbing' : 'grab',
              willChange: isDragging ? 'transform' : 'auto',
            }}
          >
            
            {/* ─── DYNAMIC SVG CONNECTOR LAYER ─── */}
            <svg
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
                zIndex: 1,
              }}
            >
              {/* Wire 1: Start Pill -> Booked */}
              {renderWire('start-out', 'booked-in', currentStageIndex >= 0, currentStageIndex > 0)}

              {/* Wire 2: Booked -> Planning */}
              {renderWire('booked-out', 'planning-in', currentStageIndex >= 1, currentStageIndex > 1)}

              {/* Wire 3: Planning -> Pre-Prod */}
              {renderWire('planning-out', 'preprod-in', currentStageIndex >= 2, currentStageIndex > 2)}

              {/* Wire 4+ depending on flow */}
              {isRecurring ? (
                <>
                  {/* Wire 4: Pre-Prod -> Session Event Days */}
                  {multiEventDays.map((day: EventDateEntry, idx: number) => {
                    const dayStatus = getDaySessionStatus(day, idx)
                    return renderWire(
                      'preprod-out',
                      `day-in-${idx}`,
                      dayStatus === 'active' || dayStatus === 'completed',
                      dayStatus === 'completed',
                      `${idx + 1}`
                    )
                  })}

                  {/* Wire 5: Session Event Day -> Session Post-Prod */}
                  {multiEventDays.map((day: EventDateEntry, idx: number) => {
                    const postStatus = getSessionPostProdStatus(idx)
                    return renderWire(
                      `day-out-${idx}`,
                      `postprod-in-${idx}`,
                      postStatus === 'active' || postStatus === 'completed',
                      postStatus === 'completed'
                    )
                  })}

                  {/* Wire 6: Session Post-Prod -> Session Delivered */}
                  {multiEventDays.map((_: EventDateEntry, idx: number) => {
                    const postStatus = getSessionPostProdStatus(idx)
                    const delStatus = getSessionDeliveryStatus(idx)
                    return renderWire(
                      `postprod-out-${idx}`,
                      `delivered-in-${idx}`,
                      delStatus === 'active' || delStatus === 'completed',
                      delStatus === 'completed'
                    )
                  })}

                  {/* Wire 7: Session Delivered -> Contract Complete Pill */}
                  {multiEventDays.map((_: EventDateEntry, idx: number) => {
                    const delStatus = getSessionDeliveryStatus(idx)
                    return renderWire(
                      `delivered-out-${idx}`,
                      'end-in',
                      delStatus === 'completed',
                      allSessionsDelivered
                    )
                  })}
                </>
              ) : (
                <>
                  {/* Wire 4: Pre-Prod -> Event Day(s) tracks */}
                  {multiEventDays.map((_: EventDateEntry, idx: number) => {
                    return renderWire(
                      'preprod-out',
                      `day-in-${idx}`,
                      currentStageIndex >= 3,
                      currentStageIndex > 3,
                      isMultiEvent ? `${idx + 1}` : undefined
                    )
                  })}

                  {/* Wire 5: Event Day(s) tracks -> Post-Prod */}
                  {multiEventDays.map((_: EventDateEntry, idx: number) => {
                    return renderWire(
                      `day-out-${idx}`,
                      'postprod-in',
                      currentStageIndex >= 4,
                      currentStageIndex > 4
                    )
                  })}

                  {/* Wire 6: Post-Prod -> Photo Track & Video Track */}
                  {renderWire('postprod-out-photo', 'photo-in', isPostProdActive, isPostProdComplete || isPhotoTrackAllDone)}
                  {renderWire('postprod-out-video', 'video-in', isPostProdActive, isPostProdComplete || isVideoTrackAllDone)}

                  {/* Wire 7: Photo Track & Video Track -> Delivered */}
                  {renderWire('photo-out', 'delivered-in', isPhotoTrackAllDone || currentStageIndex >= 5, (isPhotoTrackAllDone && isVideoTrackAllDone) || currentStageIndex >= 5)}
                  {renderWire('video-out', 'delivered-in', isVideoTrackAllDone || currentStageIndex >= 5, (isPhotoTrackAllDone && isVideoTrackAllDone) || currentStageIndex >= 5)}

                  {/* Wire 8: Delivered -> End Completed Pill */}
                  {renderWire('delivered-out', 'end-in', currentStageIndex === 5, currentStageIndex === 5 && selectedProject?.status === 'completed')}
                </>
              )}
            </svg>

            {/* ─── NODE CARDS LAYOUT ─── */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '64px', position: 'relative', zIndex: 2 }}>
              
              {/* ROOT NODE: START PROJECT PILL */}
              <div
                onMouseDown={(e) => handleNodeMouseDown(e, 'start')}
                style={{
                  marginTop: '68px',
                  width: '130px',
                  flexShrink: 0,
                  background: 'var(--color-surface)',
                  border: '1.5px solid var(--color-accent)',
                  borderRadius: '20px',
                  padding: '8px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: draggingNodeId === 'start'
                    ? '0 12px 28px rgba(0,0,0,0.35), 0 0 0 1px var(--color-accent)'
                    : '0 2px 8px rgba(0,0,0,0.15)',
                  position: 'relative',
                  cursor: draggingNodeId === 'start' ? 'grabbing' : 'grab',
                  transform: `translate3d(${nodeOffsets['start']?.x || 0}px, ${nodeOffsets['start']?.y || 0}px, 0)`,
                  zIndex: draggingNodeId === 'start' ? 10 : 2,
                  transition: draggingNodeId === 'start' ? 'none' : 'box-shadow 0.15s ease',
                  userSelect: 'none',
                }}
              >
                <i className="ti ti-grip-vertical" style={{ fontSize: '13px', color: 'var(--color-foreground-subtle)', cursor: 'grab' }} title="Drag node" />
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-accent)' }} />
                <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-accent)' }}>
                  Start Project
                </span>
                {/* Output Port */}
                <span
                  data-port-id="start-out"
                  style={{
                    position: 'absolute',
                    right: '-6px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    background: 'var(--color-surface)',
                    border: '2px solid var(--color-accent)',
                  }}
                />
              </div>

              {/* STAGE 1: BOOKED */}
              <StageNodeCard
                config={STAGE_CONFIGS[0]}
                status={getStageStatus('booked')}
                schedule={formatShortDate(selectedProject?.createdAt)}
                isSelected={panelStageKey === 'booked'}
                onClick={() => handleStageCardClick('booked')}
                onMouseDown={(e) => handleNodeMouseDown(e, 'booked')}
                style={{
                  transform: `translate3d(${nodeOffsets['booked']?.x || 0}px, ${nodeOffsets['booked']?.y || 0}px, 0)`,
                  zIndex: draggingNodeId === 'booked' ? 10 : 2,
                }}
                isNodeDragging={draggingNodeId === 'booked'}
                inPortId="booked-in"
                outPortId="booked-out"
                gates={['Advance recorded', 'Quotation accepted']}
                assignedNames={[]}
                isDragging={isDragging}
              />

              {/* STAGE 2: PLANNING */}
              <StageNodeCard
                config={STAGE_CONFIGS[1]}
                status={getStageStatus('planning')}
                schedule="2–3 weeks prior"
                isSelected={panelStageKey === 'planning'}
                onClick={() => handleStageCardClick('planning')}
                onMouseDown={(e) => handleNodeMouseDown(e, 'planning')}
                style={{
                  transform: `translate3d(${nodeOffsets['planning']?.x || 0}px, ${nodeOffsets['planning']?.y || 0}px, 0)`,
                  zIndex: draggingNodeId === 'planning' ? 10 : 2,
                }}
                isNodeDragging={draggingNodeId === 'planning'}
                inPortId="planning-in"
                outPortId="planning-out"
                gates={['Shot list approved', 'Core team assigned', 'Venue walkthrough done']}
                assignedNames={assignedTeamMembers.map(s => s.name)}
                isDragging={isDragging}
              />

              {/* STAGE 3: PRE-PROD */}
              <StageNodeCard
                config={STAGE_CONFIGS[2]}
                status={getStageStatus('preProduction')}
                schedule="3–5 days prior"
                isSelected={panelStageKey === 'preProduction'}
                onClick={() => handleStageCardClick('preProduction')}
                onMouseDown={(e) => handleNodeMouseDown(e, 'preProduction')}
                style={{
                  transform: `translate3d(${nodeOffsets['preProduction']?.x || 0}px, ${nodeOffsets['preProduction']?.y || 0}px, 0)`,
                  zIndex: draggingNodeId === 'preProduction' ? 10 : 2,
                }}
                isNodeDragging={draggingNodeId === 'preProduction'}
                inPortId="preprod-in"
                outPortId="preprod-out"
                gates={['Equipment checked out', 'Freelancer crew confirmed']}
                assignedNames={[
                  ...assignedTeamMembers.map(s => s.name),
                  ...assignedFreelancers.map(f => `${f.name} (FL)`),
                ]}
                isDragging={isDragging}
              />

              {/* STAGE 4: EVENT DAY(S) — MULTI-DATE / RECURRING EVENT TRACKS */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {multiEventDays.map((day: EventDateEntry, idx: number) => {
                  const dayStatus = getDaySessionStatus(day, idx)
                  const isDaySelected = panelStageKey === 'eventDay' && selectedDayTab === idx
                  const dayNodeId = `eventDay-${idx}`
                  const isDayDragging = draggingNodeId === dayNodeId

                  const dayLeftBorderColor =
                    dayStatus === 'completed'
                      ? 'var(--color-success)'
                      : dayStatus === 'active'
                      ? 'var(--color-primary)'
                      : 'var(--color-border)'

                  const daySelectionRingColor =
                    dayStatus === 'completed'
                      ? 'var(--color-success)'
                      : dayStatus === 'active'
                      ? 'var(--color-primary)'
                      : 'var(--color-border-strong)'

                  return (
                    <div
                      key={day.id || idx}
                      onClick={() => handleStageCardClick('eventDay', idx)}
                      onMouseDown={(e) => handleNodeMouseDown(e, dayNodeId)}
                      style={{
                        width: '260px',
                        cursor: isDayDragging ? 'grabbing' : 'pointer',
                        background: isDaySelected ? 'var(--color-surface-raised)' : 'var(--color-surface)',
                        borderTop: '0.5px solid var(--color-border)',
                        borderRight: '0.5px solid var(--color-border)',
                        borderBottom: '0.5px solid var(--color-border)',
                        borderLeft: `${isDaySelected ? '4px' : '3px'} solid ${dayLeftBorderColor}`,
                        borderRadius: '12px',
                        padding: '16px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                        boxShadow: isDayDragging
                          ? `0 12px 28px rgba(0,0,0,0.35), 0 0 0 2px ${daySelectionRingColor}`
                          : isDaySelected
                          ? `0 0 0 2px ${daySelectionRingColor}, 0 6px 20px rgba(0,0,0,0.22)`
                          : '0 2px 8px rgba(0,0,0,0.1)',
                        position: 'relative',
                        transform: `translate3d(${nodeOffsets[dayNodeId]?.x || 0}px, ${nodeOffsets[dayNodeId]?.y || 0}px, 0)`,
                        zIndex: isDayDragging ? 10 : 2,
                        transition: isDayDragging ? 'none' : 'box-shadow 0.15s ease, background-color 0.15s ease',
                        userSelect: 'none',
                      }}
                    >
                      {/* Left & Right Ports */}
                      <span
                        data-port-id={`day-in-${idx}`}
                        style={{
                          position: 'absolute',
                          left: '-6px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          width: '12px',
                          height: '12px',
                          borderRadius: '50%',
                          background: 'var(--color-surface)',
                          border: '2px solid var(--color-accent)',
                        }}
                      />
                      <span
                        data-port-id={`day-out-${idx}`}
                        style={{
                          position: 'absolute',
                          right: '-6px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          width: '12px',
                          height: '12px',
                          borderRadius: '50%',
                          background: 'var(--color-surface)',
                          border: '2px solid var(--color-accent)',
                        }}
                      />

                      {/* Header with track number badge */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <i
                            className="ti ti-grip-vertical"
                            style={{ fontSize: '13px', color: 'var(--color-foreground-subtle)', cursor: 'grab' }}
                            title="Drag node"
                          />
                          {isMultiEvent && (
                            <span style={{
                              width: '18px',
                              height: '18px',
                              borderRadius: '50%',
                              background: 'var(--color-primary-muted)',
                              color: 'var(--color-primary)',
                              fontSize: '10px',
                              fontWeight: 700,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}>
                              {idx + 1}
                            </span>
                          )}
                          <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--color-foreground)' }}>
                            {day.label || `Event Day ${idx + 1}`}
                          </span>
                        </div>
                        <StatusPill status={dayStatus} />
                      </div>

                      {/* Day details */}
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <span><i className="ti ti-calendar" style={{ marginRight: '4px' }} />{formatShortDate(day.date)}</span>
                        {day.location && <span><i className="ti ti-map-pin" style={{ marginRight: '4px' }} />{day.location}</span>}
                        {day.startTime && <span><i className="ti ti-clock" style={{ marginRight: '4px' }} />{day.startTime} - {day.endTime || 'Wrap'}</span>}
                      </div>

                      {/* Exit gate summary */}
                      {(() => {
                        const rawKey = `${selectedProject?.projectId}_eventDay_All raw footage backed up (2 copies)`
                        const isRawBackupDone = currentStageIndex > STAGE_ORDER.indexOf('eventDay') || !!gateOverrides[rawKey]
                        return (
                          <div style={{ borderTop: '0.5px solid var(--color-border)', paddingTop: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <i
                              className={isRawBackupDone ? 'ti ti-circle-check' : 'ti ti-circle'}
                              style={{
                                fontSize: '14px',
                                color: isRawBackupDone ? 'var(--color-success)' : 'var(--color-foreground-subtle)',
                              }}
                            />
                            <span style={{ fontSize: '11px', color: isRawBackupDone ? 'var(--color-foreground)' : 'var(--color-foreground-subtle)' }}>
                              Dual raw backup verification
                            </span>
                          </div>
                        )
                      })()}
                    </div>
                  )
                })}
              </div>

              {/* STAGE 5 & 6 BRANCH: RECURRING SESSIONS VS STANDARD PIPELINE */}
              {isRecurring ? (
                <>
                  {/* RECURRING MODE: COLUMN 6 (POST-PROD PER SESSION) */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {multiEventDays.map((day: EventDateEntry, idx: number) => {
                      const postStatus = getSessionPostProdStatus(idx)
                      const isPostSelected = panelStageKey === 'postProduction' && selectedDayTab === idx
                      const postNodeId = `postprod-${idx}`
                      const isPostDragging = draggingNodeId === postNodeId
                      const photoDoneCount = PHOTO_TRACK_MILESTONES.filter(m => isTrackMilestoneDone('photo', m, idx)).length
                      const videoDoneCount = VIDEO_TRACK_MILESTONES.filter(m => isTrackMilestoneDone('video', m, idx)).length
                      const isAllDone = postStatus === 'completed'

                      const postBorderColor =
                        postStatus === 'completed'
                          ? 'var(--color-success)'
                          : postStatus === 'active'
                          ? 'var(--color-primary)'
                          : 'var(--color-border)'

                      const postRingColor =
                        postStatus === 'completed'
                          ? 'var(--color-success)'
                          : postStatus === 'active'
                          ? 'var(--color-primary)'
                          : 'var(--color-border-strong)'

                      return (
                        <div
                          key={postNodeId}
                          onClick={() => handleStageCardClick('postProduction', idx)}
                          onMouseDown={(e) => handleNodeMouseDown(e, postNodeId)}
                          style={{
                            width: '270px',
                            cursor: isPostDragging ? 'grabbing' : 'pointer',
                            background: isPostSelected ? 'var(--color-surface-raised)' : 'var(--color-surface)',
                            borderTop: '0.5px solid var(--color-border)',
                            borderRight: '0.5px solid var(--color-border)',
                            borderBottom: '0.5px solid var(--color-border)',
                            borderLeft: `${isPostSelected ? '4px' : '3px'} solid ${postBorderColor}`,
                            borderRadius: '12px',
                            padding: '16px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '10px',
                            boxShadow: isPostDragging
                              ? `0 12px 28px rgba(0,0,0,0.35), 0 0 0 2px ${postRingColor}`
                              : isPostSelected
                              ? `0 0 0 2px ${postRingColor}, 0 6px 20px rgba(0,0,0,0.22)`
                              : '0 2px 8px rgba(0,0,0,0.1)',
                            position: 'relative',
                            transform: `translate3d(${nodeOffsets[postNodeId]?.x || 0}px, ${nodeOffsets[postNodeId]?.y || 0}px, 0)`,
                            zIndex: isPostDragging ? 10 : 2,
                            transition: isPostDragging ? 'none' : 'box-shadow 0.15s ease, background-color 0.15s ease',
                            userSelect: 'none',
                          }}
                        >
                          {/* Left & Right Ports */}
                          <span
                            data-port-id={`postprod-in-${idx}`}
                            style={{
                              position: 'absolute',
                              left: '-6px',
                              top: '50%',
                              transform: 'translateY(-50%)',
                              width: '12px',
                              height: '12px',
                              borderRadius: '50%',
                              background: 'var(--color-surface)',
                              border: '2px solid var(--color-accent)',
                            }}
                          />
                          <span
                            data-port-id={`postprod-out-${idx}`}
                            style={{
                              position: 'absolute',
                              right: '-6px',
                              top: '50%',
                              transform: 'translateY(-50%)',
                              width: '12px',
                              height: '12px',
                              borderRadius: '50%',
                              background: 'var(--color-surface)',
                              border: `2px solid ${isAllDone ? 'var(--color-success)' : 'var(--color-primary)'}`,
                            }}
                          />

                          {/* Header */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <i
                                className="ti ti-grip-vertical"
                                style={{ fontSize: '13px', color: 'var(--color-foreground-subtle)', cursor: 'grab' }}
                                title="Drag node"
                              />
                              <i className="ti ti-palette" style={{ fontSize: '15px', color: 'var(--color-primary)' }} />
                              <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--color-foreground)' }}>
                                Post-Prod · Session {idx + 1}
                              </span>
                            </div>
                            <StatusPill status={postStatus} />
                          </div>

                          {/* Track progress pills */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{
                              fontSize: '10px',
                              fontWeight: 600,
                              padding: '2px 6px',
                              borderRadius: '6px',
                              background: photoDoneCount === PHOTO_TRACK_MILESTONES.length ? 'var(--color-success-muted)' : 'var(--color-surface-raised)',
                              color: photoDoneCount === PHOTO_TRACK_MILESTONES.length ? 'var(--color-success)' : 'var(--color-accent)',
                              border: '0.5px solid var(--color-border)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}>
                              <i className="ti ti-camera" style={{ fontSize: '12px' }} />
                              Photo: {photoDoneCount}/{PHOTO_TRACK_MILESTONES.length}
                            </span>
                            <span style={{
                              fontSize: '10px',
                              fontWeight: 600,
                              padding: '2px 6px',
                              borderRadius: '6px',
                              background: videoDoneCount === VIDEO_TRACK_MILESTONES.length ? 'var(--color-success-muted)' : 'var(--color-surface-raised)',
                              color: videoDoneCount === VIDEO_TRACK_MILESTONES.length ? 'var(--color-success)' : 'var(--color-secondary)',
                              border: '0.5px solid var(--color-border)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}>
                              <i className="ti ti-video" style={{ fontSize: '12px' }} />
                              Video: {videoDoneCount}/{VIDEO_TRACK_MILESTONES.length}
                            </span>
                          </div>

                          {/* Exit gate summary */}
                          <div style={{ borderTop: '0.5px solid var(--color-border)', paddingTop: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <i
                              className={isAllDone ? 'ti ti-circle-check' : 'ti ti-circle'}
                              style={{
                                fontSize: '14px',
                                color: isAllDone ? 'var(--color-success)' : 'var(--color-foreground-subtle)',
                              }}
                            />
                            <span style={{ fontSize: '11px', color: 'var(--color-foreground-subtle)' }}>
                              Client review &amp; master export
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* RECURRING MODE: COLUMN 7 (DELIVERED PER SESSION) */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {multiEventDays.map((day: EventDateEntry, idx: number) => {
                      const delStatus = getSessionDeliveryStatus(idx)
                      const isDelSelected = panelStageKey === 'delivered' && selectedDayTab === idx
                      const delNodeId = `delivered-${idx}`
                      const isDelDragging = draggingNodeId === delNodeId
                      const isDelDone = delStatus === 'completed'

                      const delBorderColor =
                        delStatus === 'completed'
                          ? 'var(--color-success)'
                          : delStatus === 'active'
                          ? 'var(--color-primary)'
                          : 'var(--color-border)'

                      const delRingColor =
                        delStatus === 'completed'
                          ? 'var(--color-success)'
                          : delStatus === 'active'
                          ? 'var(--color-primary)'
                          : 'var(--color-border-strong)'

                      return (
                        <div
                          key={delNodeId}
                          onClick={() => handleStageCardClick('delivered', idx)}
                          onMouseDown={(e) => handleNodeMouseDown(e, delNodeId)}
                          style={{
                            width: '250px',
                            cursor: isDelDragging ? 'grabbing' : 'pointer',
                            background: isDelSelected ? 'var(--color-surface-raised)' : 'var(--color-surface)',
                            borderTop: '0.5px solid var(--color-border)',
                            borderRight: '0.5px solid var(--color-border)',
                            borderBottom: '0.5px solid var(--color-border)',
                            borderLeft: `${isDelSelected ? '4px' : '3px'} solid ${delBorderColor}`,
                            borderRadius: '12px',
                            padding: '16px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '10px',
                            boxShadow: isDelDragging
                              ? `0 12px 28px rgba(0,0,0,0.35), 0 0 0 2px ${delRingColor}`
                              : isDelSelected
                              ? `0 0 0 2px ${delRingColor}, 0 6px 20px rgba(0,0,0,0.22)`
                              : '0 2px 8px rgba(0,0,0,0.1)',
                            position: 'relative',
                            transform: `translate3d(${nodeOffsets[delNodeId]?.x || 0}px, ${nodeOffsets[delNodeId]?.y || 0}px, 0)`,
                            zIndex: isDelDragging ? 10 : 2,
                            transition: isDelDragging ? 'none' : 'box-shadow 0.15s ease, background-color 0.15s ease',
                            userSelect: 'none',
                          }}
                        >
                          {/* Left & Right Ports */}
                          <span
                            data-port-id={`delivered-in-${idx}`}
                            style={{
                              position: 'absolute',
                              left: '-6px',
                              top: '50%',
                              transform: 'translateY(-50%)',
                              width: '12px',
                              height: '12px',
                              borderRadius: '50%',
                              background: 'var(--color-surface)',
                              border: '2px solid var(--color-accent)',
                            }}
                          />
                          <span
                            data-port-id={`delivered-out-${idx}`}
                            style={{
                              position: 'absolute',
                              right: '-6px',
                              top: '50%',
                              transform: 'translateY(-50%)',
                              width: '12px',
                              height: '12px',
                              borderRadius: '50%',
                              background: 'var(--color-surface)',
                              border: `2px solid ${isDelDone ? 'var(--color-success)' : 'var(--color-border)'}`,
                            }}
                          />

                          {/* Header */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <i
                                className="ti ti-grip-vertical"
                                style={{ fontSize: '13px', color: 'var(--color-foreground-subtle)', cursor: 'grab' }}
                                title="Drag node"
                              />
                              <i className="ti ti-package" style={{ fontSize: '15px', color: 'var(--color-success)' }} />
                              <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--color-foreground)' }}>
                                Delivered · Session {idx + 1}
                              </span>
                            </div>
                            <StatusPill status={delStatus} />
                          </div>

                          {/* Details */}
                          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            <span><i className="ti ti-calendar-check" style={{ marginRight: '4px' }} />Deliverables Handover</span>
                            <span><i className="ti ti-user-check" style={{ marginRight: '4px' }} />Client Sign-off</span>
                          </div>

                          {/* Exit gate summary */}
                          <div style={{ borderTop: '0.5px solid var(--color-border)', paddingTop: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <i
                              className={isDelDone ? 'ti ti-circle-check' : 'ti ti-circle'}
                              style={{
                                fontSize: '14px',
                                color: isDelDone ? 'var(--color-success)' : 'var(--color-foreground-subtle)',
                              }}
                            />
                            <span style={{ fontSize: '11px', color: 'var(--color-foreground-subtle)' }}>
                              {isDelDone ? 'Session Handover Complete' : 'Pending Deliverables Sign-off'}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* RECURRING MODE: COLUMN 8 (CONTRACT COMPLETION PILL) */}
                  <div style={{ display: 'flex', alignItems: 'center', marginTop: '68px' }}>
                    <div
                      onMouseDown={(e) => handleNodeMouseDown(e, 'end')}
                      style={{
                        width: '150px',
                        flexShrink: 0,
                        background: 'var(--color-surface)',
                        border: `1.5px solid ${allSessionsDelivered ? 'var(--color-success)' : 'var(--color-border)'}`,
                        borderRadius: '20px',
                        padding: '8px 14px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        boxShadow: draggingNodeId === 'end'
                          ? '0 12px 28px rgba(0,0,0,0.35), 0 0 0 1px var(--color-success)'
                          : '0 2px 8px rgba(0,0,0,0.15)',
                        position: 'relative',
                        cursor: draggingNodeId === 'end' ? 'grabbing' : 'grab',
                        transform: `translate3d(${nodeOffsets['end']?.x || 0}px, ${nodeOffsets['end']?.y || 0}px, 0)`,
                        zIndex: draggingNodeId === 'end' ? 10 : 2,
                        transition: draggingNodeId === 'end' ? 'none' : 'box-shadow 0.15s ease',
                        userSelect: 'none',
                      }}
                    >
                      <span
                        data-port-id="end-in"
                        style={{
                          position: 'absolute',
                          left: '-6px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          width: '12px',
                          height: '12px',
                          borderRadius: '50%',
                          background: 'var(--color-surface)',
                          border: `2px solid ${allSessionsDelivered ? 'var(--color-success)' : 'var(--color-border)'}`,
                        }}
                      />
                      <i className="ti ti-grip-vertical" style={{ fontSize: '13px', color: 'var(--color-foreground-subtle)', cursor: 'grab' }} title="Drag node" />
                      <span style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: allSessionsDelivered ? 'var(--color-success)' : 'var(--color-foreground-subtle)',
                        flexShrink: 0,
                      }} />
                      <span style={{
                        fontSize: 'var(--text-xs)',
                        fontWeight: 700,
                        color: allSessionsDelivered ? 'var(--color-success)' : 'var(--color-foreground-subtle)',
                      }}>
                        Contract Done
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* STAGE 5: POST-PROD (Main node + parallel photo & video tracks) */}
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '20px',
                      width: '310px',
                      transform: `translate3d(${nodeOffsets['postProduction']?.x || 0}px, ${nodeOffsets['postProduction']?.y || 0}px, 0)`,
                      zIndex: draggingNodeId === 'postProduction' || draggingNodeId === 'photoTrack' || draggingNodeId === 'videoTrack' ? 10 : 2,
                      position: 'relative',
                    }}
                  >
                    <div style={{ position: 'relative' }}>
                      <StageNodeCard
                        config={STAGE_CONFIGS[4]}
                        status={getStageStatus('postProduction')}
                        schedule="Post-event processing"
                        isSelected={panelStageKey === 'postProduction'}
                        onClick={() => handleStageCardClick('postProduction')}
                        onMouseDown={(e) => handleNodeMouseDown(e, 'postProduction')}
                        isNodeDragging={draggingNodeId === 'postProduction'}
                        inPortId="postprod-in"
                        gates={(() => {
                          if (selectedProject?.postProdRequirements && selectedProject.postProduction?.isConfigured) {
                            const g: string[] = []
                            if (selectedProject.postProdRequirements.photography?.required) g.push('Photo track completed')
                            if (selectedProject.postProdRequirements.album?.required) g.push('Album track completed')
                            if (selectedProject.postProdRequirements.videoHighlights?.required) g.push('Video Highlights completed')
                            if (selectedProject.postProdRequirements.fullVideo?.required) g.push('Full Video completed')
                            return g.length > 0 ? g : ['Tracks completed']
                          }
                          return ['Photo track completed', 'Video track completed']
                        })()}
                        assignedNames={assignedTeamMembers.map(s => s.name)}
                        isDragging={isDragging}
                      />
                      {/* Branching ports at bottom to Photo and Video tracks */}
                      <span
                        data-port-id="postprod-out-photo"
                        style={{
                          position: 'absolute',
                          left: '80px',
                          bottom: '-6px',
                          width: '12px',
                          height: '12px',
                          borderRadius: '50%',
                          background: 'var(--color-surface)',
                          border: '2px solid var(--color-accent)',
                          zIndex: 3,
                        }}
                      />
                      <span
                        data-port-id="postprod-out-video"
                        style={{
                          position: 'absolute',
                          right: '80px',
                          bottom: '-6px',
                          width: '12px',
                          height: '12px',
                          borderRadius: '50%',
                          background: 'var(--color-surface)',
                          border: '2px solid var(--color-secondary)',
                          zIndex: 3,
                        }}
                      />
                    </div>

                    {/* Parallel Tracks visual cards */}
                    <div style={{ display: 'flex', gap: '12px' }}>
                      
                      {/* Photo Track Card */}
                      <div
                        onClick={() => {
                          if (!dragStartRef.current.hasMoved && !draggingNodeRef.current?.hasMoved) handleStageCardClick('postProduction')
                        }}
                        onMouseDown={(e) => handleNodeMouseDown(e, 'photoTrack')}
                        style={{
                          flex: 1,
                          background: 'var(--color-surface)',
                          border: '0.5px solid var(--color-border)',
                          borderTop: '2.5px solid var(--color-accent)',
                          borderRadius: '10px',
                          padding: '12px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px',
                          position: 'relative',
                          cursor: draggingNodeId === 'photoTrack' ? 'grabbing' : 'pointer',
                          transform: `translate3d(${nodeOffsets['photoTrack']?.x || 0}px, ${nodeOffsets['photoTrack']?.y || 0}px, 0)`,
                          zIndex: draggingNodeId === 'photoTrack' ? 10 : 2,
                          boxShadow: draggingNodeId === 'photoTrack'
                            ? '0 12px 28px rgba(0,0,0,0.35), 0 0 0 1px var(--color-accent)'
                            : panelStageKey === 'postProduction'
                            ? '0 0 0 1px var(--color-accent)'
                            : 'none',
                          transition: draggingNodeId === 'photoTrack' ? 'none' : 'all 0.15s ease',
                          userSelect: 'none',
                        }}
                      >
                        {/* Ports */}
                        <span
                          data-port-id="photo-in"
                          style={{
                            position: 'absolute',
                            top: '-6px',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            width: '12px',
                            height: '12px',
                            borderRadius: '50%',
                            background: 'var(--color-surface)',
                            border: '2px solid var(--color-accent)',
                          }}
                        />
                        <span
                          data-port-id="photo-out"
                          style={{
                            position: 'absolute',
                            right: '-6px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            width: '12px',
                            height: '12px',
                            borderRadius: '50%',
                            background: 'var(--color-surface)',
                            border: `2px solid ${isPhotoTrackAllDone ? 'var(--color-success)' : 'var(--color-accent)'}`,
                          }}
                        />

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <i className="ti ti-grip-vertical" style={{ fontSize: '12px', color: 'var(--color-foreground-subtle)', cursor: 'grab' }} title="Drag node" />
                            <i className="ti ti-camera" style={{ fontSize: '14px', color: 'var(--color-accent)' }} />
                            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-foreground)' }}>
                              Photo Track
                            </span>
                          </div>
                          <span style={{
                            fontSize: '10px',
                            fontWeight: 600,
                            padding: '1px 6px',
                            borderRadius: '10px',
                            background: isPhotoTrackAllDone ? 'var(--color-success-muted)' : 'var(--color-surface-raised)',
                            color: isPhotoTrackAllDone ? 'var(--color-success)' : 'var(--color-foreground-muted)',
                            border: `0.5px solid ${isPhotoTrackAllDone ? 'var(--color-success)' : 'var(--color-border)'}`,
                          }}>
                            {photoTrackDoneCount}/{PHOTO_TRACK_MILESTONES.length}
                          </span>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', pointerEvents: 'none' }}>
                          {PHOTO_TRACK_MILESTONES.map((step) => {
                            const isDone = isTrackMilestoneDone('photo', step)
                            return (
                              <div
                                key={step}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  padding: '2px 4px',
                                  borderRadius: '4px',
                                }}
                              >
                                <i
                                  className={isDone ? 'ti ti-checkbox' : 'ti ti-square'}
                                  style={{
                                    fontSize: '13px',
                                    color: isDone ? 'var(--color-success)' : 'var(--color-foreground-subtle)',
                                    flexShrink: 0,
                                  }}
                                />
                                <span style={{
                                  fontSize: '11px',
                                  color: isDone ? 'var(--color-foreground-muted)' : 'var(--color-foreground)',
                                  textDecoration: isDone ? 'line-through' : 'none',
                                  fontWeight: isDone ? 400 : 500,
                                  userSelect: 'none',
                                }}>
                                  {step}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      </div>

                      {/* Video Track Card */}
                      <div
                        onClick={() => {
                          if (!dragStartRef.current.hasMoved && !draggingNodeRef.current?.hasMoved) handleStageCardClick('postProduction')
                        }}
                        onMouseDown={(e) => handleNodeMouseDown(e, 'videoTrack')}
                        style={{
                          flex: 1,
                          background: 'var(--color-surface)',
                          border: '0.5px solid var(--color-border)',
                          borderTop: '2.5px solid var(--color-secondary)',
                          borderRadius: '10px',
                          padding: '12px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px',
                          position: 'relative',
                          cursor: draggingNodeId === 'videoTrack' ? 'grabbing' : 'pointer',
                          transform: `translate3d(${nodeOffsets['videoTrack']?.x || 0}px, ${nodeOffsets['videoTrack']?.y || 0}px, 0)`,
                          zIndex: draggingNodeId === 'videoTrack' ? 10 : 2,
                          boxShadow: draggingNodeId === 'videoTrack'
                            ? '0 12px 28px rgba(0,0,0,0.35), 0 0 0 1px var(--color-secondary)'
                            : panelStageKey === 'postProduction'
                            ? '0 0 0 1px var(--color-secondary)'
                            : 'none',
                          transition: draggingNodeId === 'videoTrack' ? 'none' : 'all 0.15s ease',
                          userSelect: 'none',
                        }}
                      >
                        {/* Ports */}
                        <span
                          data-port-id="video-in"
                          style={{
                            position: 'absolute',
                            top: '-6px',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            width: '12px',
                            height: '12px',
                            borderRadius: '50%',
                            background: 'var(--color-surface)',
                            border: '2px solid var(--color-secondary)',
                          }}
                        />
                        <span
                          data-port-id="video-out"
                          style={{
                            position: 'absolute',
                            right: '-6px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            width: '12px',
                            height: '12px',
                            borderRadius: '50%',
                            background: 'var(--color-surface)',
                            border: `2px solid ${isVideoTrackAllDone ? 'var(--color-success)' : 'var(--color-secondary)'}`,
                          }}
                        />

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <i className="ti ti-grip-vertical" style={{ fontSize: '12px', color: 'var(--color-foreground-subtle)', cursor: 'grab' }} title="Drag node" />
                            <i className="ti ti-video" style={{ fontSize: '14px', color: 'var(--color-secondary)' }} />
                            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-foreground)' }}>
                              Video Track
                            </span>
                          </div>
                          <span style={{
                            fontSize: '10px',
                            fontWeight: 600,
                            padding: '1px 6px',
                            borderRadius: '10px',
                            background: isVideoTrackAllDone ? 'var(--color-success-muted)' : 'var(--color-surface-raised)',
                            color: isVideoTrackAllDone ? 'var(--color-success)' : 'var(--color-foreground-muted)',
                            border: `0.5px solid ${isVideoTrackAllDone ? 'var(--color-success)' : 'var(--color-border)'}`,
                          }}>
                            {videoTrackDoneCount}/{VIDEO_TRACK_MILESTONES.length}
                          </span>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', pointerEvents: 'none' }}>
                          {VIDEO_TRACK_MILESTONES.map((step) => {
                            const isDone = isTrackMilestoneDone('video', step)
                            return (
                              <div
                                key={step}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  padding: '2px 4px',
                                  borderRadius: '4px',
                                }}
                              >
                                <i
                                  className={isDone ? 'ti ti-checkbox' : 'ti ti-square'}
                                  style={{
                                    fontSize: '13px',
                                    color: isDone ? 'var(--color-success)' : 'var(--color-foreground-subtle)',
                                    flexShrink: 0,
                                  }}
                                />
                                <span style={{
                                  fontSize: '11px',
                                  color: isDone ? 'var(--color-foreground-muted)' : 'var(--color-foreground)',
                                  textDecoration: isDone ? 'line-through' : 'none',
                                  fontWeight: isDone ? 400 : 500,
                                  userSelect: 'none',
                                }}>
                                  {step}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      </div>

                    </div>
                  </div>

                  {/* STAGE 6: DELIVERED */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                    <StageNodeCard
                      config={STAGE_CONFIGS[5]}
                      status={getStageStatus('delivered')}
                      schedule="Final handover"
                      isSelected={panelStageKey === 'delivered'}
                      onClick={() => handleStageCardClick('delivered')}
                      onMouseDown={(e) => handleNodeMouseDown(e, 'delivered')}
                      style={{
                        transform: `translate3d(${nodeOffsets['delivered']?.x || 0}px, ${nodeOffsets['delivered']?.y || 0}px, 0)`,
                        zIndex: draggingNodeId === 'delivered' ? 10 : 2,
                      }}
                      isNodeDragging={draggingNodeId === 'delivered'}
                      inPortId="delivered-in"
                      outPortId="delivered-out"
                      gates={['Outstanding balance = ₹0', 'Client sign-off received']}
                      gateDetails={[
                        {
                          label: 'Outstanding balance = ₹0',
                          done: effectiveBalanceDue <= 0 && !isPaymentPending,
                          isPaymentGate: true,
                          dueAmount: effectiveBalanceDue,
                          onRecordPayment: () => setRecordPaymentModalOpen(true),
                        },
                        {
                          label: 'Client sign-off received',
                          done: Boolean(gateOverrides[`${selectedProject.projectId}_delivered_Client sign-off received`] || selectedProject.stageGates?.delivered?.['Client sign-off received']),
                        },
                      ]}
                      assignedNames={assignedTeamMembers.slice(0, 1).map(s => s.name)}
                      isDragging={isDragging}
                    />

                    {/* Handover Complete Pill */}
                    {(() => {
                      const isHandoverFinished = getStageStatus('delivered') === 'completed'
                      return (
                        <div
                          onMouseDown={(e) => handleNodeMouseDown(e, 'end')}
                          style={{
                            width: '140px',
                            flexShrink: 0,
                            background: 'var(--color-surface)',
                            border: `1.5px solid ${isHandoverFinished ? 'var(--color-success)' : 'var(--color-border)'}`,
                            borderRadius: '20px',
                            padding: '8px 12px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            boxShadow: draggingNodeId === 'end'
                              ? `0 12px 28px rgba(0,0,0,0.35), 0 0 0 1px ${isHandoverFinished ? 'var(--color-success)' : 'var(--color-border)'}`
                              : '0 2px 8px rgba(0,0,0,0.15)',
                            position: 'relative',
                            cursor: draggingNodeId === 'end' ? 'grabbing' : 'grab',
                            transform: `translate3d(${nodeOffsets['end']?.x || 0}px, ${nodeOffsets['end']?.y || 0}px, 0)`,
                            zIndex: draggingNodeId === 'end' ? 10 : 2,
                            transition: draggingNodeId === 'end' ? 'none' : 'box-shadow 0.15s ease',
                            userSelect: 'none',
                          }}
                        >
                          {/* Left Port */}
                          <span
                            data-port-id="end-in"
                            style={{
                              position: 'absolute',
                              left: '-6px',
                              top: '50%',
                              transform: 'translateY(-50%)',
                              width: '12px',
                              height: '12px',
                              borderRadius: '50%',
                              background: 'var(--color-surface)',
                              border: `2px solid ${isHandoverFinished ? 'var(--color-success)' : 'var(--color-border)'}`,
                            }}
                          />
                          <i className="ti ti-grip-vertical" style={{ fontSize: '13px', color: 'var(--color-foreground-subtle)', cursor: 'grab' }} title="Drag node" />
                          <span style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            background: isHandoverFinished ? 'var(--color-success)' : 'var(--color-foreground-subtle)',
                          }} />
                          <span style={{
                            fontSize: 'var(--text-xs)',
                            fontWeight: 700,
                            color: isHandoverFinished ? 'var(--color-success)' : 'var(--color-foreground-subtle)',
                          }}>
                            Completed
                          </span>
                        </div>
                      )
                    })()}
                  </div>
                </>
              )}

            </div>

          </div>
        </div>
        )}
      </div>

      {/* ─── SLIDE-IN SIDE PANEL (340px) ────────────────────────────────── */}
      {panelStageKey && currentPanelConfig && (
        <aside style={{
          position: 'absolute',
          top: '56px',
          right: 0,
          bottom: 0,
          width: '340px',
          maxWidth: '85%',
          background: 'var(--color-surface)',
          borderLeft: '0.5px solid var(--color-border)',
          boxShadow: '-16px 0 40px rgba(0,0,0,0.35)',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 25,
        }}>
          {/* Panel Header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '14px 16px',
            borderBottom: '0.5px solid var(--color-border)',
          }}>
            <span style={{ fontSize: 'var(--text-lg)', fontWeight: 600, flex: 1, color: 'var(--color-foreground)' }}>
              {isRecurring && multiEventDays[selectedDayTab]
                ? `${currentPanelConfig.name} · ${multiEventDays[selectedDayTab].label || `Session ${selectedDayTab + 1}`}`
                : panelStageKey === 'eventDay' && multiEventDays.length > 1 && multiEventDays[selectedDayTab]
                ? `${currentPanelConfig.name} · ${multiEventDays[selectedDayTab].label || `Day ${selectedDayTab + 1}`}`
                : currentPanelConfig.name}
            </span>
            <StatusPill status={panelStageStatus} />
            <span
              onClick={() => setPanelStageKey(null)}
              style={{ cursor: 'pointer', color: 'var(--color-foreground-muted)', display: 'flex', padding: '4px' }}
            >
              <i className="ti ti-x" style={{ fontSize: '18px' }} />
            </span>
          </div>

          {/* Panel Content (Scrollable) */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
            
            {/* Description */}
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-foreground-muted)', lineHeight: 1.5 }}>
              {currentPanelConfig.defaultDesc}
            </div>

            {/* Schedule metadata */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-foreground-subtle)' }}>
                Schedule
              </span>
              <span style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--color-foreground)' }}>
                {isRecurring && multiEventDays[selectedDayTab]
                  ? `${formatShortDate(multiEventDays[selectedDayTab].date)} · ${multiEventDays[selectedDayTab].label || `Session ${selectedDayTab + 1}`}`
                  : panelStageKey === 'eventDay' && multiEventDays[selectedDayTab]
                  ? `${formatShortDate(multiEventDays[selectedDayTab].date)} · ${multiEventDays[selectedDayTab].label || 'Shoot day'}`
                  : selectedProject
                  ? `${formatShortDate(selectedProject.eventDate)} · ${currentPanelConfig.whenOffset}`
                  : '—'}
              </span>
              {panelStageKey === 'eventDay' && selectedProject && (() => {
                const dayEntry = multiEventDays[selectedDayTab]
                const location = dayEntry?.location
                const startTime = dayEntry?.startTime || selectedProject.startTime
                const endTime = dayEntry?.endTime || selectedProject.endTime
                const timeLabel = startTime ? `${startTime} – ${endTime || 'Wrap'}` : null

                if (!location && !timeLabel) return null

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '2px', fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>
                    {timeLabel && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <i className="ti ti-clock" style={{ fontSize: '13px' }} />
                        {timeLabel}
                      </span>
                    )}
                    {location && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <i className="ti ti-map-pin" style={{ fontSize: '13px' }} />
                        {location}
                      </span>
                    )}
                  </div>
                )
              })()}
            </div>

            {/* Stage Completed Timestamp (if stage completed) */}
            {(() => {
              if (isRecurring && multiEventDays[selectedDayTab]) {
                if (panelStageKey === 'eventDay' && getDaySessionStatus(multiEventDays[selectedDayTab], selectedDayTab) !== 'completed') return null
                if (panelStageKey === 'postProduction' && getSessionPostProdStatus(selectedDayTab) !== 'completed') return null
                if (panelStageKey === 'delivered' && getSessionDeliveryStatus(selectedDayTab) !== 'completed') return null
              } else if (panelStageKey === 'eventDay' && multiEventDays.length > 1 && multiEventDays[selectedDayTab]) {
                const dayStatus = getDaySessionStatus(multiEventDays[selectedDayTab], selectedDayTab)
                if (dayStatus !== 'completed') return null
              }
              const compDate = getStageCompletedDate(selectedProject, panelStageKey)
              if (!compDate) return null
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-foreground-subtle)' }}>
                    Stage Completed
                  </span>
                  <span style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <i className="ti ti-circle-check" style={{ fontSize: '15px' }} />
                    {formatDateTime(compDate)}
                  </span>
                </div>
              )
            })()}

            {/* Exit Gate Checklist (Interactive) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-foreground-subtle)' }}>
                  Exit gate checklist
                </span>
                <span style={{ fontSize: '10px', color: 'var(--color-foreground-subtle)' }}>
                  {panelStageStatus === 'completed'
                    ? 'All gates satisfied'
                    : panelStageStatus === 'active'
                    ? 'Click to mark done'
                    : 'Upcoming requirements'}
                </span>
              </div>

              {panelGates.map(gate => {
                const isRawFootageGate = gate.label.toLowerCase().includes('raw footage backed up')
                const isRawLocked = isRawFootageGate && !shootTimingInfo.isCompleted
                const isBalanceGate = gate.label.toLowerCase().includes('balance') || gate.label.toLowerCase().includes('outstanding')
                const isBalancePending = isBalanceGate && (effectiveBalanceDue > 0 || isPaymentPending)

                return (
                  <div
                    key={gate.label}
                    onClick={() => {
                      if (isRawLocked) {
                        alert(`Event day shoot is still in progress (ends ${shootTimingInfo.formattedTime || 'later'}). Raw footage backup cannot be checked yet.`)
                        return
                      }
                      if (isBalancePending) {
                        setRecordPaymentModalOpen(true)
                        return
                      }
                      toggleGate(panelStageKey, gate.label, gate.done)
                    }}
                    title={
                      isRawLocked
                        ? `Shoot in progress (ends ${shootTimingInfo.formattedTime || 'later'}). Locked until shoot completes.`
                        : isBalancePending
                        ? `Outstanding balance of ₹${effectiveBalanceDue.toLocaleString('en-IN')} is due. Click to record payment.`
                        : undefined
                    }
                    style={{
                      cursor: isRawLocked ? 'not-allowed' : 'pointer',
                      opacity: isRawLocked ? 0.75 : 1,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      fontSize: 'var(--text-sm)',
                      color: gate.done ? 'var(--color-foreground)' : 'var(--color-foreground-muted)',
                      background: isRawLocked
                        ? 'var(--color-surface)'
                        : isBalancePending
                        ? 'var(--color-secondary-muted)'
                        : gate.done
                        ? 'var(--color-success-muted)'
                        : 'var(--color-surface-raised)',
                      border: `0.5px solid ${isRawLocked || isBalancePending ? 'var(--color-secondary)' : gate.done ? 'var(--color-success)' : 'var(--color-border)'}`,
                      borderRadius: '8px',
                      padding: '8px 12px',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <i
                      className={isRawLocked ? 'ti ti-lock' : isBalancePending ? 'ti ti-alert-circle' : gate.done ? 'ti ti-circle-check' : 'ti ti-circle'}
                      style={{
                        fontSize: '18px',
                        color: isRawLocked || isBalancePending
                          ? 'var(--color-secondary)'
                          : gate.done
                          ? 'var(--color-success)'
                          : 'var(--color-foreground-subtle)',
                      }}
                    />
                    <span style={{ flex: 1 }}>
                      {isBalancePending
                        ? `Outstanding balance: ₹${effectiveBalanceDue.toLocaleString('en-IN')} Due`
                        : gate.label}
                    </span>
                    {isBalancePending && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setRecordPaymentModalOpen(true)
                        }}
                        style={{
                          background: 'var(--color-primary)',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '6px',
                          padding: '4px 10px',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <i className="ti ti-cash" style={{ fontSize: '12px' }} />
                        Record payment
                      </button>
                    )}
                    {gate.isOptional && (
                      <span style={{
                        fontSize: '10px',
                        fontWeight: 600,
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: 'var(--color-surface)',
                        border: '0.5px solid var(--color-border)',
                        color: 'var(--color-foreground-subtle)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                      }}>
                        Optional
                      </span>
                    )}
                    {isRawLocked && (
                      <span style={{
                        fontSize: '10px',
                        fontWeight: 600,
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: 'var(--color-secondary-muted)',
                        color: 'var(--color-secondary)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}>
                        <i className="ti ti-clock" style={{ fontSize: '11px' }} />
                        Ends {shootTimingInfo.formattedTime || 'later'}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Booked Stage — Post-Production Requirements Configuration */}
            {panelStageKey === 'booked' && selectedProject && (() => {
              const reqs = selectedProject.postProdRequirements || {
                photography: { required: true, clientReviewRequired: true },
                album: { required: true, clientReviewRequired: true },
                videoHighlights: { required: true, clientReviewRequired: true },
                fullVideo: { required: true, clientReviewRequired: true },
              }

              const servicesList: Array<{
                key: 'photography' | 'album' | 'videoHighlights' | 'fullVideo'
                label: string
                icon: string
                desc: string
              }> = [
                { key: 'photography', label: 'Photography', icon: 'ti-camera', desc: 'Raw delivery, photo selection & designing' },
                { key: 'album', label: 'Album', icon: 'ti-book', desc: 'Album designing, client review & album printing' },
                { key: 'videoHighlights', label: 'Video - Highlights', icon: 'ti-sparkles', desc: 'Raw footage backup & cinematic highlights' },
                { key: 'fullVideo', label: 'Full Video', icon: 'ti-movie', desc: 'Complete multi-cam event film & editing' },
              ]

              const anyRequired = servicesList.some(s => reqs[s.key]?.required)

              return (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  background: 'var(--color-surface-raised)',
                  border: '0.5px solid var(--color-border)',
                  borderRadius: '10px',
                  padding: '14px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <i className="ti ti-settings-cog" style={{ fontSize: '16px', color: 'var(--color-primary)' }} />
                      <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-foreground)' }}>
                        Post-Production Requirements
                      </span>
                    </div>
                    <span style={{
                      fontSize: '9px',
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: '4px',
                      background: 'var(--color-primary-muted)',
                      color: 'var(--color-primary)',
                      border: '0.5px solid var(--color-primary)',
                      textTransform: 'uppercase',
                    }}>
                      Source of Truth
                    </span>
                  </div>

                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)', lineHeight: '1.4' }}>
                    Select services included in this booking. The post-production stage will automatically build only the required tracks.
                  </span>

                  {!anyRequired && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      background: 'var(--color-warning-muted)',
                      border: '0.5px solid var(--color-warning)',
                      color: 'var(--color-warning)',
                      fontSize: 'var(--text-xs)',
                    }}>
                      <i className="ti ti-alert-triangle" style={{ fontSize: '14px' }} />
                      <span>At least one service should be marked Required before advancing.</span>
                    </div>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {servicesList.map(srv => {
                      const isReq = reqs[srv.key]?.required ?? true
                      const isRevReq = reqs[srv.key]?.clientReviewRequired ?? true

                      return (
                        <div
                          key={srv.key}
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px',
                            padding: '10px 12px',
                            background: 'var(--color-surface)',
                            border: `0.5px solid ${isReq ? 'var(--color-primary)' : 'var(--color-border)'}`,
                            borderRadius: '8px',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          {/* Service Header & Radio */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <i className={`ti ${srv.icon}`} style={{ fontSize: '16px', color: isReq ? 'var(--color-primary)' : 'var(--color-foreground-subtle)' }} />
                              <div>
                                <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-foreground)' }}>
                                  {srv.label}
                                </span>
                              </div>
                            </div>

                            {/* Service Required / Not Required Radio */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: 'var(--text-xs)', color: isReq ? 'var(--color-primary)' : 'var(--color-foreground-muted)' }}>
                                <input
                                  type="radio"
                                  name={`req_${srv.key}`}
                                  checked={isReq}
                                  onChange={() => handleRequirementChange(srv.key, 'required', true)}
                                  style={{ accentColor: 'var(--color-primary)', cursor: 'pointer' }}
                                />
                                <span style={{ fontWeight: isReq ? 700 : 400 }}>Required</span>
                              </label>

                              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: 'var(--text-xs)', color: !isReq ? 'var(--color-foreground)' : 'var(--color-foreground-muted)' }}>
                                <input
                                  type="radio"
                                  name={`req_${srv.key}`}
                                  checked={!isReq}
                                  onChange={() => handleRequirementChange(srv.key, 'required', false)}
                                  style={{ accentColor: 'var(--color-primary)', cursor: 'pointer' }}
                                />
                                <span style={{ fontWeight: !isReq ? 700 : 400 }}>Not Required</span>
                              </label>
                            </div>
                          </div>

                          {/* Client Review Sub-Option (indented) */}
                          {isReq && (
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              paddingLeft: '24px',
                              paddingTop: '6px',
                              borderTop: '0.5px dashed var(--color-border)',
                            }}>
                              <span style={{ fontSize: '11px', color: 'var(--color-foreground-muted)', fontWeight: 500 }}>
                                Client Review Cycle
                              </span>

                              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '11px', color: isRevReq ? 'var(--color-accent)' : 'var(--color-foreground-muted)' }}>
                                  <input
                                    type="radio"
                                    name={`rev_${srv.key}`}
                                    checked={isRevReq}
                                    onChange={() => handleRequirementChange(srv.key, 'clientReviewRequired', true)}
                                    style={{ accentColor: 'var(--color-accent)', cursor: 'pointer' }}
                                  />
                                  <span style={{ fontWeight: isRevReq ? 700 : 400 }}>Required</span>
                                </label>

                                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '11px', color: !isRevReq ? 'var(--color-foreground)' : 'var(--color-foreground-muted)' }}>
                                  <input
                                    type="radio"
                                    name={`rev_${srv.key}`}
                                    checked={!isRevReq}
                                    onChange={() => handleRequirementChange(srv.key, 'clientReviewRequired', false)}
                                    style={{ accentColor: 'var(--color-accent)', cursor: 'pointer' }}
                                  />
                                  <span style={{ fontWeight: !isRevReq ? 700 : 400 }}>Not Required</span>
                                </label>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })()}

            {/* Post-Production Parallel Tracks Checklists & Cards */}
            {panelStageKey === 'postProduction' && selectedProject && (() => {
              const reqs = selectedProject.postProdRequirements
              const postProd = selectedProject.postProduction
              const isConfigured = Boolean(postProd?.isConfigured)

              // Legacy fallback if project has no requirements configured
              if (!reqs && !postProd) {
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div style={{
                      padding: '10px 12px',
                      background: 'var(--color-primary-muted)',
                      border: '0.5px solid var(--color-primary)',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <i className="ti ti-sparkles" style={{ fontSize: '16px', color: 'var(--color-primary)' }} />
                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground)' }}>
                          Enable 4-track post-production system for this event:
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          const defaultReqs: PostProdRequirements = {
                            photography: { required: true, clientReviewRequired: true },
                            album: { required: true, clientReviewRequired: true },
                            videoHighlights: { required: true, clientReviewRequired: true },
                            fullVideo: { required: true, clientReviewRequired: true },
                          }
                          savePostProdRequirements(selectedProject.projectId, defaultReqs).catch(console.error)
                          setProjects(prev => prev.map(p => p.projectId === selectedProject.projectId ? { ...p, postProdRequirements: defaultReqs } : p))
                        }}
                        style={{
                          padding: '4px 10px',
                          borderRadius: '4px',
                          border: 'none',
                          background: 'var(--color-primary)',
                          color: '#ffffff',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        Enable Now
                      </button>
                    </div>

                    {/* Legacy Photo Track Card */}
                    <div style={{
                      background: 'var(--color-surface-raised)',
                      borderTop: '0.5px solid var(--color-border)',
                      borderRight: '0.5px solid var(--color-border)',
                      borderBottom: '0.5px solid var(--color-border)',
                      borderLeft: '3px solid var(--color-accent)',
                      borderRadius: '8px',
                      padding: '12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <i className="ti ti-camera" style={{ fontSize: '15px', color: 'var(--color-accent)' }} />
                          <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-foreground)' }}>
                            Photo Track Milestones
                          </span>
                        </div>
                        <span style={{
                          fontSize: '10px',
                          fontWeight: 600,
                          padding: '2px 6px',
                          borderRadius: '10px',
                          background: isPhotoTrackAllDone ? 'var(--color-success-muted)' : 'var(--color-surface)',
                          color: isPhotoTrackAllDone ? 'var(--color-success)' : 'var(--color-foreground-muted)',
                          border: `0.5px solid ${isPhotoTrackAllDone ? 'var(--color-success)' : 'var(--color-border)'}`,
                        }}>
                          {photoTrackDoneCount}/{PHOTO_TRACK_MILESTONES.length} done
                        </span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {PHOTO_TRACK_MILESTONES.map(step => {
                          const isDone = isTrackMilestoneDone('photo', step)
                          return (
                            <div
                              key={step}
                              onClick={(e) => toggleTrackMilestone('photo', step, e)}
                              style={{
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '6px 8px',
                                borderRadius: '6px',
                                background: isDone ? 'var(--color-success-muted)' : 'var(--color-surface)',
                                border: `0.5px solid ${isDone ? 'var(--color-success)' : 'var(--color-border)'}`,
                              }}
                            >
                              <i className={isDone ? 'ti ti-checkbox' : 'ti ti-square'} style={{ fontSize: '16px', color: isDone ? 'var(--color-success)' : 'var(--color-foreground-subtle)' }} />
                              <span style={{ flex: 1, fontSize: 'var(--text-xs)', color: isDone ? 'var(--color-foreground)' : 'var(--color-foreground-muted)', textDecoration: isDone ? 'line-through' : 'none' }}>
                                {step}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    {/* Legacy Video Track Card */}
                    <div style={{
                      background: 'var(--color-surface-raised)',
                      borderTop: '0.5px solid var(--color-border)',
                      borderRight: '0.5px solid var(--color-border)',
                      borderBottom: '0.5px solid var(--color-border)',
                      borderLeft: '3px solid var(--color-secondary)',
                      borderRadius: '8px',
                      padding: '12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <i className="ti ti-video" style={{ fontSize: '15px', color: 'var(--color-secondary)' }} />
                          <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-foreground)' }}>
                            Video Track Milestones
                          </span>
                        </div>
                        <span style={{
                          fontSize: '10px',
                          fontWeight: 600,
                          padding: '2px 6px',
                          borderRadius: '10px',
                          background: isVideoTrackAllDone ? 'var(--color-success-muted)' : 'var(--color-surface)',
                          color: isVideoTrackAllDone ? 'var(--color-success)' : 'var(--color-foreground-muted)',
                          border: `0.5px solid ${isVideoTrackAllDone ? 'var(--color-success)' : 'var(--color-border)'}`,
                        }}>
                          {videoTrackDoneCount}/{VIDEO_TRACK_MILESTONES.length} done
                        </span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {VIDEO_TRACK_MILESTONES.map(step => {
                          const isDone = isTrackMilestoneDone('video', step)
                          return (
                            <div
                              key={step}
                              onClick={(e) => toggleTrackMilestone('video', step, e)}
                              style={{
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '6px 8px',
                                borderRadius: '6px',
                                background: isDone ? 'var(--color-success-muted)' : 'var(--color-surface)',
                                border: `0.5px solid ${isDone ? 'var(--color-success)' : 'var(--color-border)'}`,
                              }}
                            >
                              <i className={isDone ? 'ti ti-checkbox' : 'ti ti-square'} style={{ fontSize: '16px', color: isDone ? 'var(--color-success)' : 'var(--color-foreground-subtle)' }} />
                              <span style={{ flex: 1, fontSize: 'var(--text-xs)', color: isDone ? 'var(--color-foreground)' : 'var(--color-foreground-muted)', textDecoration: isDone ? 'line-through' : 'none' }}>
                                {step}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )
              }

              // CASE A: Post-Production Setup Form (when not configured yet)
              if (!isConfigured) {
                const isPhotoReq = reqs?.photography?.required ?? true
                const isAlbumReq = reqs?.album?.required ?? true
                const isVideoReq = reqs?.videoHighlights?.required ?? true
                const isFullVideoReq = reqs?.fullVideo?.required ?? true

                const defaultEventDate = selectedProject.eventDate || new Date()
                const defaultDateStr = (days: number) => {
                  const d = new Date(defaultEventDate)
                  d.setDate(d.getDate() + days)
                  return d.toISOString().split('T')[0]
                }
                const defaultStaffUid = selectedProject.staffUids?.[0] || staffList[0]?.uid || ''

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div style={{
                      padding: '12px',
                      background: 'var(--color-primary-muted)',
                      border: '0.5px solid var(--color-primary)',
                      borderRadius: '8px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <i className="ti ti-tools" style={{ fontSize: '16px', color: 'var(--color-primary)' }} />
                        <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--color-foreground)' }}>
                          Post-Production Initial Setup
                        </span>
                      </div>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>
                        Configure staff assignments and target due dates for all required tracks to begin work.
                      </span>
                    </div>

                    {/* Track Setup Cards */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {/* Photo Track Setup */}
                      {isPhotoReq && (
                        <div style={{
                          padding: '12px',
                          background: 'var(--color-surface-raised)',
                          borderTop: '0.5px solid var(--color-border)',
                          borderRight: '0.5px solid var(--color-border)',
                          borderBottom: '0.5px solid var(--color-border)',
                          borderLeft: '3px solid var(--color-accent)',
                          borderRadius: '8px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '10px',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <i className="ti ti-camera" style={{ fontSize: '16px', color: 'var(--color-accent)' }} />
                            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-foreground)' }}>
                              Photo Track Setup
                            </span>
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                            <div>
                              <label style={{ display: 'block', fontSize: '11px', color: 'var(--color-foreground-muted)', marginBottom: '4px' }}>
                                Staff Assignee <span style={{ color: 'var(--color-danger)' }}>*</span>
                              </label>
                              <select
                                value={postProdSetupStaff['photoTrack'] ?? defaultStaffUid}
                                onChange={(e) => setPostProdSetupStaff(prev => ({ ...prev, photoTrack: e.target.value }))}
                                style={{
                                  width: '100%',
                                  padding: '6px 8px',
                                  borderRadius: '6px',
                                  background: 'var(--color-surface)',
                                  border: '0.5px solid var(--color-border)',
                                  color: 'var(--color-foreground)',
                                  fontSize: 'var(--text-xs)',
                                  outline: 'none',
                                }}
                              >
                                <option value="">Select Staff...</option>
                                {staffList.map(s => (
                                  <option key={s.uid} value={s.uid}>{s.name} ({s.jobTitle || s.role})</option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label style={{ display: 'block', fontSize: '11px', color: 'var(--color-foreground-muted)', marginBottom: '4px' }}>
                                Freelancer (Optional)
                              </label>
                              <select
                                value={postProdSetupFreelancer['photoTrack'] || ''}
                                onChange={(e) => setPostProdSetupFreelancer(prev => ({ ...prev, photoTrack: e.target.value }))}
                                style={{
                                  width: '100%',
                                  padding: '6px 8px',
                                  borderRadius: '6px',
                                  background: 'var(--color-surface)',
                                  border: '0.5px solid var(--color-border)',
                                  color: 'var(--color-foreground)',
                                  fontSize: 'var(--text-xs)',
                                  outline: 'none',
                                }}
                              >
                                <option value="">None</option>
                                {freelancerList.map(f => (
                                  <option key={f.freelancerId} value={f.freelancerId}>{f.name} ({f.skill})</option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <div>
                            <label style={{ display: 'block', fontSize: '11px', color: 'var(--color-foreground-muted)', marginBottom: '4px' }}>
                              Designing Due Date <span style={{ color: 'var(--color-danger)' }}>*</span>
                            </label>
                            <input
                              type="date"
                              value={postProdSetupDueDates['photo_designing'] || defaultDateStr(10)}
                              onChange={(e) => setPostProdSetupDueDates(prev => ({ ...prev, photo_designing: e.target.value }))}
                              style={{
                                width: '100%',
                                padding: '6px 8px',
                                borderRadius: '6px',
                                background: 'var(--color-surface)',
                                border: '0.5px solid var(--color-border)',
                                color: 'var(--color-foreground)',
                                fontSize: 'var(--text-xs)',
                                outline: 'none',
                              }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Album Track Setup */}
                      {isAlbumReq && (
                        <div style={{
                          padding: '12px',
                          background: 'var(--color-surface-raised)',
                          borderTop: '0.5px solid var(--color-border)',
                          borderRight: '0.5px solid var(--color-border)',
                          borderBottom: '0.5px solid var(--color-border)',
                          borderLeft: '3px solid var(--color-primary)',
                          borderRadius: '8px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '10px',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <i className="ti ti-book" style={{ fontSize: '16px', color: 'var(--color-primary)' }} />
                            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-foreground)' }}>
                              Album Track Setup
                            </span>
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                            <div>
                              <label style={{ display: 'block', fontSize: '11px', color: 'var(--color-foreground-muted)', marginBottom: '4px' }}>
                                Staff Assignee <span style={{ color: 'var(--color-danger)' }}>*</span>
                              </label>
                              <select
                                value={postProdSetupStaff['albumTrack'] ?? defaultStaffUid}
                                onChange={(e) => setPostProdSetupStaff(prev => ({ ...prev, albumTrack: e.target.value }))}
                                style={{
                                  width: '100%',
                                  padding: '6px 8px',
                                  borderRadius: '6px',
                                  background: 'var(--color-surface)',
                                  border: '0.5px solid var(--color-border)',
                                  color: 'var(--color-foreground)',
                                  fontSize: 'var(--text-xs)',
                                  outline: 'none',
                                }}
                              >
                                <option value="">Select Staff...</option>
                                {staffList.map(s => (
                                  <option key={s.uid} value={s.uid}>{s.name} ({s.jobTitle || s.role})</option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label style={{ display: 'block', fontSize: '11px', color: 'var(--color-foreground-muted)', marginBottom: '4px' }}>
                                Freelancer (Optional)
                              </label>
                              <select
                                value={postProdSetupFreelancer['albumTrack'] || ''}
                                onChange={(e) => setPostProdSetupFreelancer(prev => ({ ...prev, albumTrack: e.target.value }))}
                                style={{
                                  width: '100%',
                                  padding: '6px 8px',
                                  borderRadius: '6px',
                                  background: 'var(--color-surface)',
                                  border: '0.5px solid var(--color-border)',
                                  color: 'var(--color-foreground)',
                                  fontSize: 'var(--text-xs)',
                                  outline: 'none',
                                }}
                              >
                                <option value="">None</option>
                                {freelancerList.map(f => (
                                  <option key={f.freelancerId} value={f.freelancerId}>{f.name} ({f.skill})</option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                            <div>
                              <label style={{ display: 'block', fontSize: '11px', color: 'var(--color-foreground-muted)', marginBottom: '4px' }}>
                                Album Designing Due <span style={{ color: 'var(--color-danger)' }}>*</span>
                              </label>
                              <input
                                type="date"
                                value={postProdSetupDueDates['album_designing'] || defaultDateStr(14)}
                                onChange={(e) => setPostProdSetupDueDates(prev => ({ ...prev, album_designing: e.target.value }))}
                                style={{
                                  width: '100%',
                                  padding: '6px 8px',
                                  borderRadius: '6px',
                                  background: 'var(--color-surface)',
                                  border: '0.5px solid var(--color-border)',
                                  color: 'var(--color-foreground)',
                                  fontSize: 'var(--text-xs)',
                                  outline: 'none',
                                }}
                              />
                            </div>

                            <div>
                              <label style={{ display: 'block', fontSize: '11px', color: 'var(--color-foreground-muted)', marginBottom: '4px' }}>
                                Creating Album Due <span style={{ color: 'var(--color-danger)' }}>*</span>
                              </label>
                              <input
                                type="date"
                                value={postProdSetupDueDates['album_creating'] || defaultDateStr(21)}
                                onChange={(e) => setPostProdSetupDueDates(prev => ({ ...prev, album_creating: e.target.value }))}
                                style={{
                                  width: '100%',
                                  padding: '6px 8px',
                                  borderRadius: '6px',
                                  background: 'var(--color-surface)',
                                  border: '0.5px solid var(--color-border)',
                                  color: 'var(--color-foreground)',
                                  fontSize: 'var(--text-xs)',
                                  outline: 'none',
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Video Highlights Track Setup */}
                      {isVideoReq && (
                        <div style={{
                          padding: '12px',
                          background: 'var(--color-surface-raised)',
                          borderTop: '0.5px solid var(--color-border)',
                          borderRight: '0.5px solid var(--color-border)',
                          borderBottom: '0.5px solid var(--color-border)',
                          borderLeft: '3px solid var(--color-secondary)',
                          borderRadius: '8px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '10px',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <i className="ti ti-sparkles" style={{ fontSize: '16px', color: 'var(--color-secondary)' }} />
                            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-foreground)' }}>
                              Video Highlights Track Setup
                            </span>
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                            <div>
                              <label style={{ display: 'block', fontSize: '11px', color: 'var(--color-foreground-muted)', marginBottom: '4px' }}>
                                Staff Assignee <span style={{ color: 'var(--color-danger)' }}>*</span>
                              </label>
                              <select
                                value={postProdSetupStaff['videoTrack'] ?? defaultStaffUid}
                                onChange={(e) => setPostProdSetupStaff(prev => ({ ...prev, videoTrack: e.target.value }))}
                                style={{
                                  width: '100%',
                                  padding: '6px 8px',
                                  borderRadius: '6px',
                                  background: 'var(--color-surface)',
                                  border: '0.5px solid var(--color-border)',
                                  color: 'var(--color-foreground)',
                                  fontSize: 'var(--text-xs)',
                                  outline: 'none',
                                }}
                              >
                                <option value="">Select Staff...</option>
                                {staffList.map(s => (
                                  <option key={s.uid} value={s.uid}>{s.name} ({s.jobTitle || s.role})</option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label style={{ display: 'block', fontSize: '11px', color: 'var(--color-foreground-muted)', marginBottom: '4px' }}>
                                Freelancer (Optional)
                              </label>
                              <select
                                value={postProdSetupFreelancer['videoTrack'] || ''}
                                onChange={(e) => setPostProdSetupFreelancer(prev => ({ ...prev, videoTrack: e.target.value }))}
                                style={{
                                  width: '100%',
                                  padding: '6px 8px',
                                  borderRadius: '6px',
                                  background: 'var(--color-surface)',
                                  border: '0.5px solid var(--color-border)',
                                  color: 'var(--color-foreground)',
                                  fontSize: 'var(--text-xs)',
                                  outline: 'none',
                                }}
                              >
                                <option value="">None</option>
                                {freelancerList.map(f => (
                                  <option key={f.freelancerId} value={f.freelancerId}>{f.name} ({f.skill})</option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <div>
                            <label style={{ display: 'block', fontSize: '11px', color: 'var(--color-foreground-muted)', marginBottom: '4px' }}>
                              Highlights Due Date <span style={{ color: 'var(--color-danger)' }}>*</span>
                            </label>
                            <input
                              type="date"
                              value={postProdSetupDueDates['video_highlights'] || defaultDateStr(12)}
                              onChange={(e) => setPostProdSetupDueDates(prev => ({ ...prev, video_highlights: e.target.value }))}
                              style={{
                                width: '100%',
                                padding: '6px 8px',
                                borderRadius: '6px',
                                background: 'var(--color-surface)',
                                border: '0.5px solid var(--color-border)',
                                color: 'var(--color-foreground)',
                                fontSize: 'var(--text-xs)',
                                outline: 'none',
                              }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Full Video Track Setup */}
                      {isFullVideoReq && (
                        <div style={{
                          padding: '12px',
                          background: 'var(--color-surface-raised)',
                          borderTop: '0.5px solid var(--color-border)',
                          borderRight: '0.5px solid var(--color-border)',
                          borderBottom: '0.5px solid var(--color-border)',
                          borderLeft: '3px solid var(--color-purple)',
                          borderRadius: '8px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '10px',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <i className="ti ti-movie" style={{ fontSize: '16px', color: 'var(--color-purple)' }} />
                            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-foreground)' }}>
                              Full Video Track Setup
                            </span>
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                            <div>
                              <label style={{ display: 'block', fontSize: '11px', color: 'var(--color-foreground-muted)', marginBottom: '4px' }}>
                                Staff Assignee <span style={{ color: 'var(--color-danger)' }}>*</span>
                              </label>
                              <select
                                value={postProdSetupStaff['fullVideoTrack'] ?? defaultStaffUid}
                                onChange={(e) => setPostProdSetupStaff(prev => ({ ...prev, fullVideoTrack: e.target.value }))}
                                style={{
                                  width: '100%',
                                  padding: '6px 8px',
                                  borderRadius: '6px',
                                  background: 'var(--color-surface)',
                                  border: '0.5px solid var(--color-border)',
                                  color: 'var(--color-foreground)',
                                  fontSize: 'var(--text-xs)',
                                  outline: 'none',
                                }}
                              >
                                <option value="">Select Staff...</option>
                                {staffList.map(s => (
                                  <option key={s.uid} value={s.uid}>{s.name} ({s.jobTitle || s.role})</option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label style={{ display: 'block', fontSize: '11px', color: 'var(--color-foreground-muted)', marginBottom: '4px' }}>
                                Freelancer (Optional)
                              </label>
                              <select
                                value={postProdSetupFreelancer['fullVideoTrack'] || ''}
                                onChange={(e) => setPostProdSetupFreelancer(prev => ({ ...prev, fullVideoTrack: e.target.value }))}
                                style={{
                                  width: '100%',
                                  padding: '6px 8px',
                                  borderRadius: '6px',
                                  background: 'var(--color-surface)',
                                  border: '0.5px solid var(--color-border)',
                                  color: 'var(--color-foreground)',
                                  fontSize: 'var(--text-xs)',
                                  outline: 'none',
                                }}
                              >
                                <option value="">None</option>
                                {freelancerList.map(f => (
                                  <option key={f.freelancerId} value={f.freelancerId}>{f.name} ({f.skill})</option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <div>
                            <label style={{ display: 'block', fontSize: '11px', color: 'var(--color-foreground-muted)', marginBottom: '4px' }}>
                              Full Video Editing Due Date <span style={{ color: 'var(--color-danger)' }}>*</span>
                            </label>
                            <input
                              type="date"
                              value={postProdSetupDueDates['full_video_editing'] || defaultDateStr(25)}
                              onChange={(e) => setPostProdSetupDueDates(prev => ({ ...prev, full_video_editing: e.target.value }))}
                              style={{
                                width: '100%',
                                padding: '6px 8px',
                                borderRadius: '6px',
                                background: 'var(--color-surface)',
                                border: '0.5px solid var(--color-border)',
                                color: 'var(--color-foreground)',
                                fontSize: 'var(--text-xs)',
                                outline: 'none',
                              }}
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Start Post-Production Button */}
                    <Button
                      onClick={handleStartPostProduction}
                      disabled={isSubmittingSetup}
                      style={{
                        width: '100%',
                        padding: '10px',
                        background: 'var(--color-primary)',
                        color: '#ffffff',
                        fontWeight: 600,
                        fontSize: 'var(--text-sm)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                      }}
                    >
                      {isSubmittingSetup ? (
                        <>
                          <i className="ti ti-loader rotate" />
                          <span>Initializing Post-Production...</span>
                        </>
                      ) : (
                        <>
                          <i className="ti ti-player-play" />
                          <span>Save & Start Post-Production</span>
                        </>
                      )}
                    </Button>
                  </div>
                )
              }

              // CASE B: Post-Production Configured — 4 Independent Active Tracks
              if (!postProd) return null
              const nowTime = new Date().getTime()

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {/* Photo Track Card */}
                  {postProd.photoTrack && (() => {
                    const pt = postProd.photoTrack
                    const overallDue = computeOverallDueDate([pt.designing.dueDate])
                    const isOverdue = overallDue && nowTime > overallDue.getTime() && !isPhotoTrackComplete(pt)
                    const isComplete = isPhotoTrackComplete(pt)
                    const isReviewHistOpen = expandedReviewHistory['photoTrack']

                    return (
                      <div style={{
                        background: 'var(--color-surface-raised)',
                        borderTop: '0.5px solid var(--color-border)',
                        borderRight: '0.5px solid var(--color-border)',
                        borderBottom: '0.5px solid var(--color-border)',
                        borderLeft: `3px solid ${isComplete ? 'var(--color-success)' : 'var(--color-accent)'}`,
                        borderRadius: '8px',
                        padding: '12px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                      }}>
                        {/* Header */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <i className="ti ti-camera" style={{ fontSize: '16px', color: 'var(--color-accent)' }} />
                            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-foreground)' }}>
                              Photo Track
                            </span>
                          </div>
                          <Badge
                            variant={isComplete ? 'done' : pt.status === 'inProgress' ? 'inProgress' : 'todo'}
                            label={isComplete ? 'Completed' : pt.status === 'inProgress' ? 'In Progress' : 'Not Started'}
                          />
                        </div>

                        {/* Overall Due Date & Assignee */}
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '6px 8px',
                          background: 'var(--color-surface)',
                          borderRadius: '6px',
                          fontSize: '11px',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--color-foreground-muted)' }}>
                            <i className="ti ti-user" style={{ fontSize: '13px' }} />
                            <span>{pt.assignment.staffName}</span>
                            {pt.assignment.freelancerName && (
                              <span style={{ color: 'var(--color-secondary)' }}>+ {pt.assignment.freelancerName}</span>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <i className="ti ti-calendar" style={{ fontSize: '13px', color: isOverdue ? 'var(--color-danger)' : 'var(--color-foreground-subtle)' }} />
                            <span style={{ fontWeight: 600, color: isOverdue ? 'var(--color-danger)' : 'var(--color-foreground)' }}>
                              Due {formatDisplayDate(overallDue)}
                            </span>
                            {isOverdue && (
                              <span style={{
                                fontSize: '9px',
                                padding: '1px 4px',
                                borderRadius: '3px',
                                background: 'var(--color-danger-muted)',
                                color: 'var(--color-danger)',
                                fontWeight: 700,
                              }}>
                                OVERDUE
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Checkboxes */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div
                            onClick={() => handleTrackCheckboxToggle('photoTrack', 'selectedPhotos', pt.selectedPhotos)}
                            style={{
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              padding: '6px 8px',
                              borderRadius: '6px',
                              background: pt.selectedPhotos ? 'var(--color-success-muted)' : 'var(--color-surface)',
                              border: `0.5px solid ${pt.selectedPhotos ? 'var(--color-success)' : 'var(--color-border)'}`,
                            }}
                          >
                            <i className={pt.selectedPhotos ? 'ti ti-checkbox' : 'ti ti-square'} style={{ fontSize: '16px', color: pt.selectedPhotos ? 'var(--color-success)' : 'var(--color-foreground-subtle)' }} />
                            <span style={{ flex: 1, fontSize: 'var(--text-xs)', color: pt.selectedPhotos ? 'var(--color-foreground)' : 'var(--color-foreground-muted)' }}>
                              Selected Photos
                            </span>
                          </div>

                          <div
                            onClick={() => handleTrackCheckboxToggle('photoTrack', 'rawDelivered', pt.rawDelivered)}
                            style={{
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              padding: '6px 8px',
                              borderRadius: '6px',
                              background: pt.rawDelivered ? 'var(--color-success-muted)' : 'var(--color-surface)',
                              border: `0.5px solid ${pt.rawDelivered ? 'var(--color-success)' : 'var(--color-border)'}`,
                            }}
                          >
                            <i className={pt.rawDelivered ? 'ti ti-checkbox' : 'ti ti-square'} style={{ fontSize: '16px', color: pt.rawDelivered ? 'var(--color-success)' : 'var(--color-foreground-subtle)' }} />
                            <span style={{ flex: 1, fontSize: 'var(--text-xs)', color: pt.rawDelivered ? 'var(--color-foreground)' : 'var(--color-foreground-muted)' }}>
                              Raw Photos Delivered
                            </span>
                          </div>
                        </div>

                        {/* Designing Stage */}
                        <div style={{
                          padding: '8px 10px',
                          background: 'var(--color-surface)',
                          borderRadius: '6px',
                          border: '0.5px solid var(--color-border)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-foreground)' }}>
                              Designing
                            </span>
                            <select
                              value={pt.designing.status}
                              onChange={(e) => handleTrackStageStatusChange('photoTrack', 'designing', e.target.value as PostProdStageStatus, pt.designing.startDate)}
                              style={{
                                padding: '2px 6px',
                                borderRadius: '4px',
                                fontSize: '11px',
                                fontWeight: 600,
                                background: pt.designing.status === 'completed' ? 'var(--color-success-muted)' : pt.designing.status === 'inProgress' ? 'var(--color-accent-muted)' : 'var(--color-surface-raised)',
                                color: pt.designing.status === 'completed' ? 'var(--color-success)' : pt.designing.status === 'inProgress' ? 'var(--color-accent)' : 'var(--color-foreground-muted)',
                                border: '0.5px solid var(--color-border)',
                                outline: 'none',
                                cursor: 'pointer',
                              }}
                            >
                              <option value="pending">Pending</option>
                              <option value="inProgress">In Progress</option>
                              <option value="waitingClient">Waiting for Client</option>
                              <option value="completed">Completed</option>
                            </select>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--color-foreground-subtle)' }}>
                            <span>Start: {formatDisplayDate(pt.designing.startDate)}</span>
                            <span>Due: {formatDisplayDate(pt.designing.dueDate)}</span>
                          </div>
                        </div>

                        {/* Client Review */}
                        <div style={{
                          padding: '8px 10px',
                          background: 'var(--color-surface)',
                          borderRadius: '6px',
                          border: '0.5px solid var(--color-border)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-foreground)' }}>
                              Client Review
                            </span>
                            {!pt.clientReview.required ? (
                              <span style={{ fontSize: '10px', color: 'var(--color-success)', fontWeight: 600 }}>
                                <i className="ti ti-check" /> Not Required
                              </span>
                            ) : (
                              <Badge
                                variant={pt.clientReview.status === 'approved' ? 'done' : pt.clientReview.status === 'notApproved' ? 'overdue' : pt.clientReview.status === 'waitingClient' ? 'review' : 'todo'}
                                label={pt.clientReview.status === 'approved' ? 'Approved' : pt.clientReview.status === 'notApproved' ? 'Revision Needed' : pt.clientReview.status === 'waitingClient' ? 'Waiting Client' : 'Pending'}
                              />
                            )}
                          </div>

                          {pt.clientReview.required && pt.clientReview.status !== 'approved' && (
                            <div style={{ display: 'flex', gap: '6px', marginTop: '2px' }}>
                              <button
                                onClick={() => handleClientReviewAction('photoTrack', 'approved')}
                                style={{
                                  flex: 1,
                                  padding: '5px',
                                  borderRadius: '4px',
                                  border: 'none',
                                  background: 'var(--color-success)',
                                  color: '#ffffff',
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '4px',
                                }}
                              >
                                <i className="ti ti-check" /> Approve
                              </button>
                              <button
                                onClick={() => {
                                  setRejectModalTrack('photoTrack')
                                  setRejectNotes('')
                                }}
                                style={{
                                  flex: 1,
                                  padding: '5px',
                                  borderRadius: '4px',
                                  border: 'none',
                                  background: 'var(--color-danger)',
                                  color: '#ffffff',
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '4px',
                                }}
                              >
                                <i className="ti ti-x" /> Not Approved
                              </button>
                            </div>
                          )}

                          {pt.clientReview.required && pt.clientReview.history && pt.clientReview.history.length > 0 && (
                            <div>
                              <button
                                onClick={() => setExpandedReviewHistory(prev => ({ ...prev, photoTrack: !prev.photoTrack }))}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  padding: '0',
                                  fontSize: '10px',
                                  color: 'var(--color-accent)',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                }}
                              >
                                <i className={isReviewHistOpen ? 'ti ti-chevron-down' : 'ti ti-chevron-right'} />
                                <span>Review History ({pt.clientReview.history.length})</span>
                              </button>

                              {isReviewHistOpen && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
                                  {pt.clientReview.history.map((h, i) => (
                                    <div key={i} style={{ padding: '4px 6px', background: 'var(--color-surface-raised)', borderRadius: '4px', fontSize: '10px' }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, color: h.decision === 'approved' ? 'var(--color-success)' : 'var(--color-danger)' }}>
                                        <span>{h.decision === 'approved' ? '✓ Approved' : '✗ Revision Requested'}</span>
                                        <span style={{ color: 'var(--color-foreground-subtle)' }}>{formatDisplayDate(h.reviewedAt)}</span>
                                      </div>
                                      {h.notes && <div style={{ color: 'var(--color-foreground-muted)', marginTop: '2px' }}>{h.notes}</div>}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })()}

                  {/* Album Track Card */}
                  {postProd.albumTrack && (() => {
                    const at = postProd.albumTrack
                    const overallDue = computeOverallDueDate([at.albumDesigning.dueDate, at.creatingAlbum.dueDate])
                    const isOverdue = overallDue && nowTime > overallDue.getTime() && !isAlbumTrackComplete(at)
                    const isComplete = isAlbumTrackComplete(at)
                    const isReviewHistOpen = expandedReviewHistory['albumTrack']

                    return (
                      <div style={{
                        background: 'var(--color-surface-raised)',
                        borderTop: '0.5px solid var(--color-border)',
                        borderRight: '0.5px solid var(--color-border)',
                        borderBottom: '0.5px solid var(--color-border)',
                        borderLeft: `3px solid ${isComplete ? 'var(--color-success)' : 'var(--color-primary)'}`,
                        borderRadius: '8px',
                        padding: '12px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                      }}>
                        {/* Header */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <i className="ti ti-book" style={{ fontSize: '16px', color: 'var(--color-primary)' }} />
                            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-foreground)' }}>
                              Album Track
                            </span>
                          </div>
                          <Badge
                            variant={isComplete ? 'done' : at.status === 'inProgress' ? 'inProgress' : 'todo'}
                            label={isComplete ? 'Completed' : at.status === 'inProgress' ? 'In Progress' : 'Not Started'}
                          />
                        </div>

                        {/* Overall Due Date & Assignee */}
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '6px 8px',
                          background: 'var(--color-surface)',
                          borderRadius: '6px',
                          fontSize: '11px',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--color-foreground-muted)' }}>
                            <i className="ti ti-user" style={{ fontSize: '13px' }} />
                            <span>{at.assignment.staffName}</span>
                            {at.assignment.freelancerName && (
                              <span style={{ color: 'var(--color-secondary)' }}>+ {at.assignment.freelancerName}</span>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <i className="ti ti-calendar" style={{ fontSize: '13px', color: isOverdue ? 'var(--color-danger)' : 'var(--color-foreground-subtle)' }} />
                            <span style={{ fontWeight: 600, color: isOverdue ? 'var(--color-danger)' : 'var(--color-foreground)' }}>
                              Due {formatDisplayDate(overallDue)}
                            </span>
                            {isOverdue && (
                              <span style={{ fontSize: '9px', padding: '1px 4px', borderRadius: '3px', background: 'var(--color-danger-muted)', color: 'var(--color-danger)', fontWeight: 700 }}>
                                OVERDUE
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Stage 1: Album Designing */}
                        <div style={{
                          padding: '8px 10px',
                          background: 'var(--color-surface)',
                          borderRadius: '6px',
                          border: '0.5px solid var(--color-border)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-foreground)' }}>
                              Album Designing
                            </span>
                            <select
                              value={at.albumDesigning.status}
                              onChange={(e) => handleTrackStageStatusChange('albumTrack', 'albumDesigning', e.target.value as PostProdStageStatus, at.albumDesigning.startDate)}
                              style={{
                                padding: '2px 6px',
                                borderRadius: '4px',
                                fontSize: '11px',
                                fontWeight: 600,
                                background: at.albumDesigning.status === 'completed' ? 'var(--color-success-muted)' : at.albumDesigning.status === 'inProgress' ? 'var(--color-primary-muted)' : 'var(--color-surface-raised)',
                                color: at.albumDesigning.status === 'completed' ? 'var(--color-success)' : at.albumDesigning.status === 'inProgress' ? 'var(--color-primary)' : 'var(--color-foreground-muted)',
                                border: '0.5px solid var(--color-border)',
                                outline: 'none',
                                cursor: 'pointer',
                              }}
                            >
                              <option value="pending">Pending</option>
                              <option value="inProgress">In Progress</option>
                              <option value="waitingClient">Waiting for Client</option>
                              <option value="completed">Completed</option>
                            </select>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--color-foreground-subtle)' }}>
                            <span>Start: {formatDisplayDate(at.albumDesigning.startDate)}</span>
                            <span>Due: {formatDisplayDate(at.albumDesigning.dueDate)}</span>
                          </div>
                        </div>

                        {/* Stage 2: Album Client Review */}
                        <div style={{
                          padding: '8px 10px',
                          background: 'var(--color-surface)',
                          borderRadius: '6px',
                          border: '0.5px solid var(--color-border)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-foreground)' }}>
                              Album Client Review
                            </span>
                            {!at.clientReview.required ? (
                              <span style={{ fontSize: '10px', color: 'var(--color-success)', fontWeight: 600 }}>
                                <i className="ti ti-check" /> Not Required
                              </span>
                            ) : (
                              <Badge
                                variant={at.clientReview.status === 'approved' ? 'done' : at.clientReview.status === 'notApproved' ? 'overdue' : at.clientReview.status === 'waitingClient' ? 'review' : 'todo'}
                                label={at.clientReview.status === 'approved' ? 'Approved' : at.clientReview.status === 'notApproved' ? 'Revision Needed' : at.clientReview.status === 'waitingClient' ? 'Waiting Client' : 'Pending'}
                              />
                            )}
                          </div>

                          {at.clientReview.required && at.clientReview.status !== 'approved' && (
                            <div style={{ display: 'flex', gap: '6px', marginTop: '2px' }}>
                              <button
                                onClick={() => handleClientReviewAction('albumTrack', 'approved')}
                                style={{
                                  flex: 1,
                                  padding: '5px',
                                  borderRadius: '4px',
                                  border: 'none',
                                  background: 'var(--color-success)',
                                  color: '#ffffff',
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '4px',
                                }}
                              >
                                <i className="ti ti-check" /> Approve
                              </button>
                              <button
                                onClick={() => {
                                  setRejectModalTrack('albumTrack')
                                  setRejectNotes('')
                                }}
                                style={{
                                  flex: 1,
                                  padding: '5px',
                                  borderRadius: '4px',
                                  border: 'none',
                                  background: 'var(--color-danger)',
                                  color: '#ffffff',
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '4px',
                                }}
                              >
                                <i className="ti ti-x" /> Not Approved
                              </button>
                            </div>
                          )}

                          {at.clientReview.required && at.clientReview.history && at.clientReview.history.length > 0 && (
                            <div>
                              <button
                                onClick={() => setExpandedReviewHistory(prev => ({ ...prev, albumTrack: !prev.albumTrack }))}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  padding: '0',
                                  fontSize: '10px',
                                  color: 'var(--color-accent)',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                }}
                              >
                                <i className={isReviewHistOpen ? 'ti ti-chevron-down' : 'ti ti-chevron-right'} />
                                <span>Review History ({at.clientReview.history.length})</span>
                              </button>

                              {isReviewHistOpen && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
                                  {at.clientReview.history.map((h, i) => (
                                    <div key={i} style={{ padding: '4px 6px', background: 'var(--color-surface-raised)', borderRadius: '4px', fontSize: '10px' }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, color: h.decision === 'approved' ? 'var(--color-success)' : 'var(--color-danger)' }}>
                                        <span>{h.decision === 'approved' ? '✓ Approved' : '✗ Revision Requested'}</span>
                                        <span style={{ color: 'var(--color-foreground-subtle)' }}>{formatDisplayDate(h.reviewedAt)}</span>
                                      </div>
                                      {h.notes && <div style={{ color: 'var(--color-foreground-muted)', marginTop: '2px' }}>{h.notes}</div>}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Stage 3: Creating Album */}
                        <div style={{
                          padding: '8px 10px',
                          background: 'var(--color-surface)',
                          borderRadius: '6px',
                          border: '0.5px solid var(--color-border)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-foreground)' }}>
                              Creating Album
                            </span>
                            <select
                              value={at.creatingAlbum.status}
                              onChange={(e) => handleTrackStageStatusChange('albumTrack', 'creatingAlbum', e.target.value as PostProdStageStatus, at.creatingAlbum.startDate)}
                              style={{
                                padding: '2px 6px',
                                borderRadius: '4px',
                                fontSize: '11px',
                                fontWeight: 600,
                                background: at.creatingAlbum.status === 'completed' ? 'var(--color-success-muted)' : at.creatingAlbum.status === 'inProgress' ? 'var(--color-primary-muted)' : 'var(--color-surface-raised)',
                                color: at.creatingAlbum.status === 'completed' ? 'var(--color-success)' : at.creatingAlbum.status === 'inProgress' ? 'var(--color-primary)' : 'var(--color-foreground-muted)',
                                border: '0.5px solid var(--color-border)',
                                outline: 'none',
                                cursor: 'pointer',
                              }}
                            >
                              <option value="pending">Pending</option>
                              <option value="inProgress">In Progress</option>
                              <option value="completed">Completed</option>
                            </select>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--color-foreground-subtle)' }}>
                            <span>Start: {formatDisplayDate(at.creatingAlbum.startDate)}</span>
                            <span>Due: {formatDisplayDate(at.creatingAlbum.dueDate)}</span>
                          </div>
                        </div>

                        {/* Delivered Checkbox */}
                        <div
                          onClick={() => handleTrackCheckboxToggle('albumTrack', 'delivered', at.delivered)}
                          style={{
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '6px 8px',
                            borderRadius: '6px',
                            background: at.delivered ? 'var(--color-success-muted)' : 'var(--color-surface)',
                            border: `0.5px solid ${at.delivered ? 'var(--color-success)' : 'var(--color-border)'}`,
                          }}
                        >
                          <i className={at.delivered ? 'ti ti-checkbox' : 'ti ti-square'} style={{ fontSize: '16px', color: at.delivered ? 'var(--color-success)' : 'var(--color-foreground-subtle)' }} />
                          <span style={{ flex: 1, fontSize: 'var(--text-xs)', color: at.delivered ? 'var(--color-foreground)' : 'var(--color-foreground-muted)' }}>
                            Physical Album Delivered
                          </span>
                        </div>
                      </div>
                    )
                  })()}

                  {/* Video Highlights Track Card */}
                  {postProd.videoTrack && (() => {
                    const vt = postProd.videoTrack
                    const overallDue = computeOverallDueDate([vt.highlights.dueDate])
                    const isOverdue = overallDue && nowTime > overallDue.getTime() && !isVideoTrackComplete(vt)
                    const isComplete = isVideoTrackComplete(vt)
                    const isReviewHistOpen = expandedReviewHistory['videoTrack']

                    return (
                      <div style={{
                        background: 'var(--color-surface-raised)',
                        borderTop: '0.5px solid var(--color-border)',
                        borderRight: '0.5px solid var(--color-border)',
                        borderBottom: '0.5px solid var(--color-border)',
                        borderLeft: `3px solid ${isComplete ? 'var(--color-success)' : 'var(--color-secondary)'}`,
                        borderRadius: '8px',
                        padding: '12px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                      }}>
                        {/* Header */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <i className="ti ti-sparkles" style={{ fontSize: '16px', color: 'var(--color-secondary)' }} />
                            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-foreground)' }}>
                              Video Highlights Track
                            </span>
                          </div>
                          <Badge
                            variant={isComplete ? 'done' : vt.status === 'inProgress' ? 'inProgress' : 'todo'}
                            label={isComplete ? 'Completed' : vt.status === 'inProgress' ? 'In Progress' : 'Not Started'}
                          />
                        </div>

                        {/* Overall Due Date & Assignee */}
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '6px 8px',
                          background: 'var(--color-surface)',
                          borderRadius: '6px',
                          fontSize: '11px',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--color-foreground-muted)' }}>
                            <i className="ti ti-user" style={{ fontSize: '13px' }} />
                            <span>{vt.assignment.staffName}</span>
                            {vt.assignment.freelancerName && (
                              <span style={{ color: 'var(--color-secondary)' }}>+ {vt.assignment.freelancerName}</span>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <i className="ti ti-calendar" style={{ fontSize: '13px', color: isOverdue ? 'var(--color-danger)' : 'var(--color-foreground-subtle)' }} />
                            <span style={{ fontWeight: 600, color: isOverdue ? 'var(--color-danger)' : 'var(--color-foreground)' }}>
                              Due {formatDisplayDate(overallDue)}
                            </span>
                            {isOverdue && (
                              <span style={{ fontSize: '9px', padding: '1px 4px', borderRadius: '3px', background: 'var(--color-danger-muted)', color: 'var(--color-danger)', fontWeight: 700 }}>
                                OVERDUE
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Checkboxes */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div
                            onClick={() => handleTrackCheckboxToggle('videoTrack', 'selectedVideo', vt.selectedVideo)}
                            style={{
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              padding: '6px 8px',
                              borderRadius: '6px',
                              background: vt.selectedVideo ? 'var(--color-success-muted)' : 'var(--color-surface)',
                              border: `0.5px solid ${vt.selectedVideo ? 'var(--color-success)' : 'var(--color-border)'}`,
                            }}
                          >
                            <i className={vt.selectedVideo ? 'ti ti-checkbox' : 'ti ti-square'} style={{ fontSize: '16px', color: vt.selectedVideo ? 'var(--color-success)' : 'var(--color-foreground-subtle)' }} />
                            <span style={{ flex: 1, fontSize: 'var(--text-xs)', color: vt.selectedVideo ? 'var(--color-foreground)' : 'var(--color-foreground-muted)' }}>
                              Selected Video
                            </span>
                          </div>

                          <div
                            onClick={() => handleTrackCheckboxToggle('videoTrack', 'rawVideoDelivered', vt.rawVideoDelivered)}
                            style={{
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              padding: '6px 8px',
                              borderRadius: '6px',
                              background: vt.rawVideoDelivered ? 'var(--color-success-muted)' : 'var(--color-surface)',
                              border: `0.5px solid ${vt.rawVideoDelivered ? 'var(--color-success)' : 'var(--color-border)'}`,
                            }}
                          >
                            <i className={vt.rawVideoDelivered ? 'ti ti-checkbox' : 'ti ti-square'} style={{ fontSize: '16px', color: vt.rawVideoDelivered ? 'var(--color-success)' : 'var(--color-foreground-subtle)' }} />
                            <span style={{ flex: 1, fontSize: 'var(--text-xs)', color: vt.rawVideoDelivered ? 'var(--color-foreground)' : 'var(--color-foreground-muted)' }}>
                              Raw Video Delivered
                            </span>
                          </div>
                        </div>

                        {/* Highlights Stage */}
                        <div style={{
                          padding: '8px 10px',
                          background: 'var(--color-surface)',
                          borderRadius: '6px',
                          border: '0.5px solid var(--color-border)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-foreground)' }}>
                              Highlights Editing
                            </span>
                            <select
                              value={vt.highlights.status}
                              onChange={(e) => handleTrackStageStatusChange('videoTrack', 'highlights', e.target.value as PostProdStageStatus, vt.highlights.startDate)}
                              style={{
                                padding: '2px 6px',
                                borderRadius: '4px',
                                fontSize: '11px',
                                fontWeight: 600,
                                background: vt.highlights.status === 'completed' ? 'var(--color-success-muted)' : vt.highlights.status === 'inProgress' ? 'var(--color-secondary-muted)' : 'var(--color-surface-raised)',
                                color: vt.highlights.status === 'completed' ? 'var(--color-success)' : vt.highlights.status === 'inProgress' ? 'var(--color-secondary)' : 'var(--color-foreground-muted)',
                                border: '0.5px solid var(--color-border)',
                                outline: 'none',
                                cursor: 'pointer',
                              }}
                            >
                              <option value="pending">Pending</option>
                              <option value="inProgress">In Progress</option>
                              <option value="waitingClient">Waiting for Client</option>
                              <option value="completed">Completed</option>
                            </select>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--color-foreground-subtle)' }}>
                            <span>Start: {formatDisplayDate(vt.highlights.startDate)}</span>
                            <span>Due: {formatDisplayDate(vt.highlights.dueDate)}</span>
                          </div>
                        </div>

                        {/* Client Review */}
                        <div style={{
                          padding: '8px 10px',
                          background: 'var(--color-surface)',
                          borderRadius: '6px',
                          border: '0.5px solid var(--color-border)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-foreground)' }}>
                              Highlights Client Review
                            </span>
                            {!vt.clientReview.required ? (
                              <span style={{ fontSize: '10px', color: 'var(--color-success)', fontWeight: 600 }}>
                                <i className="ti ti-check" /> Not Required
                              </span>
                            ) : (
                              <Badge
                                variant={vt.clientReview.status === 'approved' ? 'done' : vt.clientReview.status === 'notApproved' ? 'overdue' : vt.clientReview.status === 'waitingClient' ? 'review' : 'todo'}
                                label={vt.clientReview.status === 'approved' ? 'Approved' : vt.clientReview.status === 'notApproved' ? 'Revision Needed' : vt.clientReview.status === 'waitingClient' ? 'Waiting Client' : 'Pending'}
                              />
                            )}
                          </div>

                          {vt.clientReview.required && vt.clientReview.status !== 'approved' && (
                            <div style={{ display: 'flex', gap: '6px', marginTop: '2px' }}>
                              <button
                                onClick={() => handleClientReviewAction('videoTrack', 'approved')}
                                style={{
                                  flex: 1,
                                  padding: '5px',
                                  borderRadius: '4px',
                                  border: 'none',
                                  background: 'var(--color-success)',
                                  color: '#ffffff',
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '4px',
                                }}
                              >
                                <i className="ti ti-check" /> Approve
                              </button>
                              <button
                                onClick={() => {
                                  setRejectModalTrack('videoTrack')
                                  setRejectNotes('')
                                }}
                                style={{
                                  flex: 1,
                                  padding: '5px',
                                  borderRadius: '4px',
                                  border: 'none',
                                  background: 'var(--color-danger)',
                                  color: '#ffffff',
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '4px',
                                }}
                              >
                                <i className="ti ti-x" /> Not Approved
                              </button>
                            </div>
                          )}

                          {vt.clientReview.required && vt.clientReview.history && vt.clientReview.history.length > 0 && (
                            <div>
                              <button
                                onClick={() => setExpandedReviewHistory(prev => ({ ...prev, videoTrack: !prev.videoTrack }))}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  padding: '0',
                                  fontSize: '10px',
                                  color: 'var(--color-accent)',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                }}
                              >
                                <i className={isReviewHistOpen ? 'ti ti-chevron-down' : 'ti ti-chevron-right'} />
                                <span>Review History ({vt.clientReview.history.length})</span>
                              </button>

                              {isReviewHistOpen && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
                                  {vt.clientReview.history.map((h, i) => (
                                    <div key={i} style={{ padding: '4px 6px', background: 'var(--color-surface-raised)', borderRadius: '4px', fontSize: '10px' }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, color: h.decision === 'approved' ? 'var(--color-success)' : 'var(--color-danger)' }}>
                                        <span>{h.decision === 'approved' ? '✓ Approved' : '✗ Revision Requested'}</span>
                                        <span style={{ color: 'var(--color-foreground-subtle)' }}>{formatDisplayDate(h.reviewedAt)}</span>
                                      </div>
                                      {h.notes && <div style={{ color: 'var(--color-foreground-muted)', marginTop: '2px' }}>{h.notes}</div>}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })()}

                  {/* Full Video Track Card */}
                  {postProd.fullVideoTrack && (() => {
                    const fvt = postProd.fullVideoTrack
                    const overallDue = computeOverallDueDate([fvt.fullVideoEditing.dueDate])
                    const isOverdue = overallDue && nowTime > overallDue.getTime() && !isFullVideoTrackComplete(fvt)
                    const isComplete = isFullVideoTrackComplete(fvt)
                    const isReviewHistOpen = expandedReviewHistory['fullVideoTrack']

                    return (
                      <div style={{
                        background: 'var(--color-surface-raised)',
                        borderTop: '0.5px solid var(--color-border)',
                        borderRight: '0.5px solid var(--color-border)',
                        borderBottom: '0.5px solid var(--color-border)',
                        borderLeft: `3px solid ${isComplete ? 'var(--color-success)' : 'var(--color-purple)'}`,
                        borderRadius: '8px',
                        padding: '12px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                      }}>
                        {/* Header */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <i className="ti ti-movie" style={{ fontSize: '16px', color: 'var(--color-purple)' }} />
                            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-foreground)' }}>
                              Full Video Track
                            </span>
                          </div>
                          <Badge
                            variant={isComplete ? 'done' : fvt.status === 'inProgress' ? 'inProgress' : 'todo'}
                            label={isComplete ? 'Completed' : fvt.status === 'inProgress' ? 'In Progress' : 'Not Started'}
                          />
                        </div>

                        {/* Overall Due Date & Assignee */}
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '6px 8px',
                          background: 'var(--color-surface)',
                          borderRadius: '6px',
                          fontSize: '11px',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--color-foreground-muted)' }}>
                            <i className="ti ti-user" style={{ fontSize: '13px' }} />
                            <span>{fvt.assignment.staffName}</span>
                            {fvt.assignment.freelancerName && (
                              <span style={{ color: 'var(--color-secondary)' }}>+ {fvt.assignment.freelancerName}</span>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <i className="ti ti-calendar" style={{ fontSize: '13px', color: isOverdue ? 'var(--color-danger)' : 'var(--color-foreground-subtle)' }} />
                            <span style={{ fontWeight: 600, color: isOverdue ? 'var(--color-danger)' : 'var(--color-foreground)' }}>
                              Due {formatDisplayDate(overallDue)}
                            </span>
                            {isOverdue && (
                              <span style={{ fontSize: '9px', padding: '1px 4px', borderRadius: '3px', background: 'var(--color-danger-muted)', color: 'var(--color-danger)', fontWeight: 700 }}>
                                OVERDUE
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Stage: Full Video Editing */}
                        <div style={{
                          padding: '8px 10px',
                          background: 'var(--color-surface)',
                          borderRadius: '6px',
                          border: '0.5px solid var(--color-border)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-foreground)' }}>
                              Full Video Editing
                            </span>
                            <select
                              value={fvt.fullVideoEditing.status}
                              onChange={(e) => handleTrackStageStatusChange('fullVideoTrack', 'fullVideoEditing', e.target.value as PostProdStageStatus, fvt.fullVideoEditing.startDate)}
                              style={{
                                padding: '2px 6px',
                                borderRadius: '4px',
                                fontSize: '11px',
                                fontWeight: 600,
                                background: fvt.fullVideoEditing.status === 'completed' ? 'var(--color-success-muted)' : fvt.fullVideoEditing.status === 'inProgress' ? 'var(--color-purple-muted)' : 'var(--color-surface-raised)',
                                color: fvt.fullVideoEditing.status === 'completed' ? 'var(--color-success)' : fvt.fullVideoEditing.status === 'inProgress' ? 'var(--color-purple)' : 'var(--color-foreground-muted)',
                                border: '0.5px solid var(--color-border)',
                                outline: 'none',
                                cursor: 'pointer',
                              }}
                            >
                              <option value="pending">Pending</option>
                              <option value="inProgress">In Progress</option>
                              <option value="waitingClient">Waiting for Client</option>
                              <option value="completed">Completed</option>
                            </select>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--color-foreground-subtle)' }}>
                            <span>Start: {formatDisplayDate(fvt.fullVideoEditing.startDate)}</span>
                            <span>Due: {formatDisplayDate(fvt.fullVideoEditing.dueDate)}</span>
                          </div>
                        </div>

                        {/* Client Review */}
                        <div style={{
                          padding: '8px 10px',
                          background: 'var(--color-surface)',
                          borderRadius: '6px',
                          border: '0.5px solid var(--color-border)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-foreground)' }}>
                              Full Video Client Review
                            </span>
                            {!fvt.clientReview.required ? (
                              <span style={{ fontSize: '10px', color: 'var(--color-success)', fontWeight: 600 }}>
                                <i className="ti ti-check" /> Not Required
                              </span>
                            ) : (
                              <Badge
                                variant={fvt.clientReview.status === 'approved' ? 'done' : fvt.clientReview.status === 'notApproved' ? 'overdue' : fvt.clientReview.status === 'waitingClient' ? 'review' : 'todo'}
                                label={fvt.clientReview.status === 'approved' ? 'Approved' : fvt.clientReview.status === 'notApproved' ? 'Revision Needed' : fvt.clientReview.status === 'waitingClient' ? 'Waiting Client' : 'Pending'}
                              />
                            )}
                          </div>

                          {fvt.clientReview.required && fvt.clientReview.status !== 'approved' && (
                            <div style={{ display: 'flex', gap: '6px', marginTop: '2px' }}>
                              <button
                                onClick={() => handleClientReviewAction('fullVideoTrack', 'approved')}
                                style={{
                                  flex: 1,
                                  padding: '5px',
                                  borderRadius: '4px',
                                  border: 'none',
                                  background: 'var(--color-success)',
                                  color: '#ffffff',
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '4px',
                                }}
                              >
                                <i className="ti ti-check" /> Approve
                              </button>
                              <button
                                onClick={() => {
                                  setRejectModalTrack('fullVideoTrack')
                                  setRejectNotes('')
                                }}
                                style={{
                                  flex: 1,
                                  padding: '5px',
                                  borderRadius: '4px',
                                  border: 'none',
                                  background: 'var(--color-danger)',
                                  color: '#ffffff',
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '4px',
                                }}
                              >
                                <i className="ti ti-x" /> Not Approved
                              </button>
                            </div>
                          )}

                          {fvt.clientReview.required && fvt.clientReview.history && fvt.clientReview.history.length > 0 && (
                            <div>
                              <button
                                onClick={() => setExpandedReviewHistory(prev => ({ ...prev, fullVideoTrack: !prev.fullVideoTrack }))}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  padding: '0',
                                  fontSize: '10px',
                                  color: 'var(--color-accent)',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                }}
                              >
                                <i className={isReviewHistOpen ? 'ti ti-chevron-down' : 'ti ti-chevron-right'} />
                                <span>Review History ({fvt.clientReview.history.length})</span>
                              </button>

                              {isReviewHistOpen && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
                                  {fvt.clientReview.history.map((h, i) => (
                                    <div key={i} style={{ padding: '4px 6px', background: 'var(--color-surface-raised)', borderRadius: '4px', fontSize: '10px' }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, color: h.decision === 'approved' ? 'var(--color-success)' : 'var(--color-danger)' }}>
                                        <span>{h.decision === 'approved' ? '✓ Approved' : '✗ Revision Requested'}</span>
                                        <span style={{ color: 'var(--color-foreground-subtle)' }}>{formatDisplayDate(h.reviewedAt)}</span>
                                      </div>
                                      {h.notes && <div style={{ color: 'var(--color-foreground-muted)', marginTop: '2px' }}>{h.notes}</div>}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Delivered Checkbox */}
                        <div
                          onClick={() => handleTrackCheckboxToggle('fullVideoTrack', 'delivered', fvt.delivered)}
                          style={{
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '6px 8px',
                            borderRadius: '6px',
                            background: fvt.delivered ? 'var(--color-success-muted)' : 'var(--color-surface)',
                            border: `0.5px solid ${fvt.delivered ? 'var(--color-success)' : 'var(--color-border)'}`,
                          }}
                        >
                          <i className={fvt.delivered ? 'ti ti-checkbox' : 'ti ti-square'} style={{ fontSize: '16px', color: fvt.delivered ? 'var(--color-success)' : 'var(--color-foreground-subtle)' }} />
                          <span style={{ flex: 1, fontSize: 'var(--text-xs)', color: fvt.delivered ? 'var(--color-foreground)' : 'var(--color-foreground-muted)' }}>
                            Full Video Delivered
                          </span>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              )
            })()}

            {/* Assigned Staff & Freelancer Crew Section (Hidden on Booked stage) */}
            {panelStageKey !== 'booked' && (
              <>
                {/* Assigned Staff Section */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-foreground-subtle)' }}>
                        Assigned team
                  </span>
                  {isTeamAssignmentMandatory && (
                    <span style={{
                      fontSize: '9px',
                      fontWeight: 700,
                      padding: '1px 5px',
                      borderRadius: '4px',
                      background: hasAssignedTeamMembers
                        ? 'var(--color-success-muted)'
                        : panelStageStatus === 'active'
                        ? 'var(--color-danger-muted)'
                        : 'var(--color-surface-raised)',
                      color: hasAssignedTeamMembers
                        ? 'var(--color-success)'
                        : panelStageStatus === 'active'
                        ? 'var(--color-danger)'
                        : 'var(--color-foreground-subtle)',
                      border: `0.5px solid ${
                        hasAssignedTeamMembers
                          ? 'var(--color-success)'
                          : panelStageStatus === 'active'
                          ? 'var(--color-danger)'
                          : 'var(--color-border)'
                      }`,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}>
                      Mandatory
                    </span>
                  )}
                </div>
                <span style={{ fontSize: '10px', color: 'var(--color-foreground-subtle)' }}>
                  {assignedTeamMembers.length} assigned
                </span>
              </div>

              {panelStageStatus === 'active' && isTeamAssignmentMandatory && !hasAssignedTeamMembers && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 10px',
                  borderRadius: '6px',
                  background: 'var(--color-danger-muted)',
                  border: '0.5px solid var(--color-danger)',
                  color: 'var(--color-danger)',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 500,
                }}>
                  <i className="ti ti-alert-circle" style={{ fontSize: '14px', flexShrink: 0 }} />
                  <span>Mandatory: Assign at least one team member to advance this stage.</span>
                </div>
              )}

              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {assignedTeamMembers.map(tm => {
                  const init = tm.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
                  return (
                    <div
                      key={tm.uid}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        background: 'var(--color-surface-raised)',
                        border: '0.5px solid var(--color-border)',
                        borderRadius: '16px',
                        padding: '3px 10px 3px 4px',
                      }}
                    >
                      <div style={{
                        width: '22px',
                        height: '22px',
                        borderRadius: '50%',
                        background: 'var(--color-primary-muted)',
                        color: 'var(--color-primary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '9px',
                        fontWeight: 700,
                      }}>
                        {init}
                      </div>
                      <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-foreground)' }}>
                        {tm.name}
                      </span>
                      <span
                        onClick={(e) => {
                          e.stopPropagation()
                          handleRemoveStaff(tm.uid)
                        }}
                        style={{ cursor: 'pointer', color: 'var(--color-foreground-subtle)', marginLeft: '2px' }}
                      >
                        <i className="ti ti-x" style={{ fontSize: '11px' }} />
                      </span>
                    </div>
                  )
                })}
              </div>

              {/* Quick Assign Staff Dropdown */}
              {unassignedStaff.length > 0 && (
                <div style={{ marginTop: '4px' }}>
                  <select
                    value=""
                    onChange={e => {
                      if (e.target.value) handleAssignStaff(e.target.value)
                    }}
                    style={{
                      fontFamily: 'var(--font-inter)',
                      width: '100%',
                      height: '30px',
                      background: 'var(--color-surface-raised)',
                      border: '0.5px solid var(--color-border)',
                      borderRadius: '6px',
                      padding: '0 8px',
                      fontSize: 'var(--text-xs)',
                      color: 'var(--color-foreground-muted)',
                      outline: 'none',
                    }}
                  >
                    <option value="">＋ Assign staff member…</option>
                    {unassignedStaff.map(s => (
                      <option key={s.uid} value={s.uid}>
                        {s.name} ({s.role})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Freelancer Crew Section (Highlight for Pre-Prod) */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              padding: panelStageKey === 'preProduction' ? '12px' : '0',
              borderRadius: panelStageKey === 'preProduction' ? '8px' : '0',
              background: panelStageKey === 'preProduction' ? 'var(--color-surface-raised)' : 'transparent',
              border: panelStageKey === 'preProduction' ? '0.5px solid var(--color-border)' : 'none',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  color: panelStageKey === 'preProduction' ? 'var(--color-primary)' : 'var(--color-foreground-subtle)',
                }}>
                  Freelancer crew {panelStageKey === 'preProduction' && '· Pre-Prod Gate'}
                </span>
                <span style={{ fontSize: '10px', color: 'var(--color-foreground-subtle)' }}>
                  {assignedFreelancers.length} assigned
                </span>
              </div>

              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {assignedFreelancers.length === 0 ? (
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)', fontStyle: 'italic' }}>
                    No freelancers assigned yet.
                  </span>
                ) : (
                  assignedFreelancers.map(fl => {
                    const specificAssignment = selectedProject?.freelancerAssignments?.[fl.freelancerId]
                    const roleLabel = specificAssignment?.role || fl.skill
                    return (
                      <div
                        key={fl.freelancerId}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          background: 'var(--color-surface)',
                          border: '0.5px solid var(--color-border)',
                          borderRadius: '16px',
                          padding: '3px 10px 3px 6px',
                        }}
                      >
                        <span style={{
                          fontSize: '9px',
                          fontWeight: 700,
                          padding: '2px 5px',
                          borderRadius: '4px',
                          background: 'var(--color-secondary-muted)',
                          color: 'var(--color-secondary)',
                          textTransform: 'uppercase',
                        }}>
                          FL
                        </span>
                        <span
                          onClick={() => router.push(`/hrms/freelancers/${fl.freelancerId}`)}
                          title="Click to view freelancer profile"
                          style={{
                            fontSize: 'var(--text-xs)',
                            fontWeight: 600,
                            color: 'var(--color-foreground)',
                            cursor: 'pointer',
                            textDecoration: 'underline',
                            textDecorationColor: 'var(--color-border)',
                          }}
                        >
                          {fl.name}
                        </span>
                        <span style={{ fontSize: '10px', color: 'var(--color-foreground-muted)' }}>
                          ({roleLabel})
                        </span>
                        <span
                          onClick={(e) => {
                            e.stopPropagation()
                            handleRemoveFreelancer(fl.freelancerId)
                          }}
                          title="Remove freelancer"
                          style={{ cursor: 'pointer', color: 'var(--color-foreground-subtle)', marginLeft: '2px' }}
                        >
                          <i className="ti ti-x" style={{ fontSize: '11px' }} />
                        </span>
                      </div>
                    )
                  })
                )}
              </div>

              {/* Quick Assign Freelancer Dropdown */}
              {unassignedFreelancers.length > 0 && (
                <div style={{ marginTop: '4px' }}>
                  <select
                    value=""
                    onChange={e => {
                      if (e.target.value) handleAssignFreelancer(e.target.value)
                    }}
                    style={{
                      fontFamily: 'var(--font-inter)',
                      width: '100%',
                      height: '30px',
                      background: 'var(--color-surface)',
                      border: '0.5px solid var(--color-border)',
                      borderRadius: '6px',
                      padding: '0 8px',
                      fontSize: 'var(--text-xs)',
                      color: 'var(--color-foreground-muted)',
                      outline: 'none',
                    }}
                  >
                    <option value="">＋ Assign freelancer to project…</option>
                    {unassignedFreelancers.map(fl => (
                      <option key={fl.freelancerId} value={fl.freelancerId}>
                        {fl.name} ({fl.skill} · ₹{fl.dayRate}/day)
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </>
        )}

            {/* Advance Stage / Status Section */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              borderTop: '0.5px solid var(--color-border)',
              paddingTop: '16px',
              marginTop: 'auto',
            }}>
              {/* CASE 1: Stage is already completed */}
              {panelStageStatus === 'completed' && (() => {
                const compDate = getStageCompletedDate(selectedProject, panelStageKey)
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '12px 14px',
                      borderRadius: '8px',
                      background: 'var(--color-success-muted)',
                      border: '0.5px solid var(--color-success)',
                    }}>
                      <i className="ti ti-circle-check" style={{ fontSize: '20px', color: 'var(--color-success)', flexShrink: 0 }} />
                      <div>
                        <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-success)' }}>
                          Stage Completed
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--color-foreground-muted)', marginTop: '2px' }}>
                          {compDate ? (
                            <>Completed on {formatDateTime(compDate)} · Current stage: {STAGE_CONFIGS[currentStageIndex]?.name}.</>
                          ) : (
                            <>All exit gates satisfied · Current stage: {STAGE_CONFIGS[currentStageIndex]?.name}.</>
                          )}
                        </div>
                      </div>
                    </div>

                    {nextStageKey && (
                      <button
                        onClick={() => setPanelStageKey(nextStageKey)}
                        style={{
                          fontFamily: 'var(--font-inter)',
                          height: '36px',
                          borderRadius: '8px',
                          border: '0.5px solid var(--color-border)',
                          background: 'var(--color-surface-raised)',
                          color: 'var(--color-foreground)',
                          fontSize: 'var(--text-xs)',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <span>Next: View {STAGE_CONFIGS.find(s => s.stageKey === nextStageKey)?.name}</span>
                        <i className="ti ti-arrow-right" style={{ fontSize: '14px' }} />
                      </button>
                    )}
                  </div>
                )
              })()}

              {/* CASE 2: Stage is upcoming / locked */}
              {panelStageStatus === 'pending' && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '12px 14px',
                  borderRadius: '8px',
                  background: 'var(--color-surface-raised)',
                  border: '0.5px solid var(--color-border)',
                }}>
                  <i className={panelStageKey === 'eventDay' ? 'ti ti-calendar-time' : 'ti ti-lock'} style={{ fontSize: '20px', color: 'var(--color-foreground-subtle)', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-foreground)' }}>
                      {isRecurring && multiEventDays[selectedDayTab]
                        ? `${multiEventDays[selectedDayTab].label || `Session ${selectedDayTab + 1}`} ${STAGE_CONFIGS.find(s => s.stageKey === panelStageKey)?.name || 'Stage'}`
                        : panelStageKey === 'eventDay' && multiEventDays[selectedDayTab]
                        ? `${multiEventDays[selectedDayTab].label || 'Session'} Scheduled`
                        : 'Upcoming Stage'}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--color-foreground-muted)', marginTop: '2px' }}>
                      {panelStageKey === 'eventDay' && multiEventDays[selectedDayTab]
                        ? `Scheduled for ${formatShortDate(multiEventDays[selectedDayTab].date)}.`
                        : isRecurring && multiEventDays[selectedDayTab]
                        ? `Session shoot is scheduled for ${formatShortDate(multiEventDays[selectedDayTab].date)}.`
                        : `Unlocks after ${STAGE_CONFIGS[currentStageIndex]?.name} is completed.`}
                    </div>
                  </div>
                </div>
              )}

              {/* CASE 3: Active Stage (Current stage being worked on) */}
              {panelStageStatus === 'active' && (() => {
                const advanceBlockReason = (() => {
                  if (isTeamAssignmentMandatory && !hasAssignedTeamMembers) {
                    return 'Assign team member first'
                  }
                  if (panelStageKey === 'eventDay' && !shootTimingInfo.isCompleted) {
                    return `Shoot in progress (ends ${shootTimingInfo.formattedTime || 'later'})`
                  }
                  return 'Gates pending'
                })()

                return (
                  <>
                    {panelStageKey === 'delivered' ? (
                      isRecurring ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          {getSessionDeliveryStatus(selectedDayTab) === 'completed' ? (
                            <div style={{
                              padding: '12px',
                              borderRadius: '8px',
                              background: 'var(--color-success-muted)',
                              border: '0.5px solid var(--color-success)',
                              color: 'var(--color-success)',
                              fontSize: 'var(--text-sm)',
                              fontWeight: 600,
                              textAlign: 'center',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '8px',
                            }}>
                              <i className="ti ti-circle-check" style={{ fontSize: '16px' }} />
                              <span>Session {selectedDayTab + 1} Handover Complete</span>
                            </div>
                          ) : (
                            <Button
                              onClick={() => handleDeliverSession(selectedDayTab)}
                              disabled={isAdvancing}
                              className="w-full h-9 text-xs font-semibold"
                              style={{ background: 'var(--color-success)', color: '#ffffff' }}
                            >
                              <i className="ti ti-package" style={{ marginRight: '6px' }} />
                              Deliver Session {selectedDayTab + 1}
                            </Button>
                          )}
                        </div>
                      ) : selectedProject?.status === 'completed' ? (
                        <div style={{
                          padding: '12px',
                          borderRadius: '8px',
                          background: 'var(--color-success-muted)',
                          border: '0.5px solid var(--color-success)',
                          color: 'var(--color-success)',
                          fontSize: 'var(--text-sm)',
                          fontWeight: 600,
                          textAlign: 'center',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                        }}>
                          <i className="ti ti-circle-check" style={{ fontSize: '16px' }} />
                          <span>Event Done &amp; Handover Complete</span>
                        </div>
                      ) : isPaymentPending ? (
                        /* PAYMENT PENDING: Alert card + Record Payment button (Complete button is hidden until paid) */
                        <div style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '10px',
                          background: 'var(--color-secondary-muted)',
                          border: '0.5px solid var(--color-secondary)',
                          borderRadius: '8px',
                          padding: '12px 14px',
                        }}>
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            color: 'var(--color-secondary)',
                            fontWeight: 600,
                            fontSize: 'var(--text-xs)',
                          }}>
                            <i className="ti ti-alert-circle" style={{ fontSize: '16px' }} />
                            <span>Remaining Payment Pending</span>
                          </div>
                          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground)' }}>
                            ₹{effectiveBalanceDue.toLocaleString('en-IN')} remaining of ₹{effectiveTotalAmount.toLocaleString('en-IN')}{isDiscreteSession ? ' (Session Price)' : ''}. Please record final payment before completing this {isDiscreteSession ? 'session' : 'event'}.
                          </div>
                          <Button
                            className="w-full h-8 text-xs font-medium"
                            onClick={() => setRecordPaymentModalOpen(true)}
                          >
                            <i className="ti ti-cash" style={{ marginRight: '6px' }} />
                            Record Remaining Payment
                          </Button>
                        </div>
                      ) : (
                        /* PAYMENT CLEARED: Complete Handover button is visible */
                        <>
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            color: 'var(--color-success)',
                            fontSize: 'var(--text-xs)',
                            fontWeight: 600,
                            background: 'var(--color-success-muted)',
                            border: '0.5px solid var(--color-success)',
                            borderRadius: '8px',
                            padding: '8px 12px',
                          }}>
                            <i className="ti ti-circle-check" style={{ fontSize: '15px' }} />
                            <span>
                              {effectiveTotalAmount > 0
                                ? `All payments cleared (₹${effectiveTotalAmount.toLocaleString('en-IN')})`
                                : 'Payments cleared'}
                            </span>
                          </div>

                          <button
                            onClick={handleCompleteHandover}
                            disabled={(!allPanelGatesDone && !overrideReason.trim()) || isAdvancing}
                            style={{
                              cursor: (allPanelGatesDone || overrideReason.trim()) && !isAdvancing ? 'pointer' : 'not-allowed',
                              fontFamily: 'var(--font-inter)',
                              height: '38px',
                              borderRadius: '8px',
                              border: 'none',
                              background: (allPanelGatesDone || overrideReason.trim()) ? 'var(--color-success)' : 'var(--color-surface-raised)',
                              color: (allPanelGatesDone || overrideReason.trim()) ? '#ffffff' : 'var(--color-foreground-subtle)',
                              fontSize: 'var(--text-sm)',
                              fontWeight: 600,
                              transition: 'all 0.15s ease',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '8px',
                            }}
                          >
                            {isAdvancing ? (
                              'Completing handover…'
                            ) : allPanelGatesDone ? (
                              <>
                                <span>Complete Event Handover</span>
                                <i className="ti ti-check" style={{ fontSize: '15px' }} />
                              </>
                            ) : overrideReason.trim() ? (
                              <>
                                <span>Override &amp; Complete Handover</span>
                                <i className="ti ti-check" style={{ fontSize: '15px' }} />
                              </>
                            ) : (
                              <span>Complete Handover · {advanceBlockReason}</span>
                            )}
                          </button>

                          {!allPanelGatesDone && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>
                                Admin override (reason required)
                              </span>
                              <input
                                value={overrideReason}
                                onChange={e => setOverrideReason(e.target.value)}
                                placeholder="Reason for override…"
                                style={{
                                  fontFamily: 'var(--font-inter)',
                                  boxSizing: 'border-box',
                                  width: '100%',
                                  height: '32px',
                                  background: 'var(--color-surface-raised)',
                                  border: '0.5px solid var(--color-border)',
                                  borderRadius: '8px',
                                  padding: '0 10px',
                                  fontSize: 'var(--text-xs)',
                                  color: 'var(--color-foreground)',
                                  outline: 'none',
                                }}
                              />
                            </div>
                          )}
                        </>
                      )
                    ) : (
                      <>
                        <button
                          onClick={handleAdvanceStage}
                          disabled={(!allPanelGatesDone && !overrideReason.trim()) || isAdvancing}
                          style={{
                            cursor: (allPanelGatesDone || overrideReason.trim()) && !isAdvancing ? 'pointer' : 'not-allowed',
                            fontFamily: 'var(--font-inter)',
                            height: '38px',
                            borderRadius: '8px',
                            border: 'none',
                            background: (allPanelGatesDone || overrideReason.trim()) ? 'var(--color-primary)' : 'var(--color-surface-raised)',
                            color: (allPanelGatesDone || overrideReason.trim()) ? '#ffffff' : 'var(--color-foreground-subtle)',
                            fontSize: 'var(--text-sm)',
                            fontWeight: 600,
                            transition: 'all 0.15s ease',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                          }}
                        >
                          {isAdvancing ? (
                            'Advancing stage…'
                          ) : allPanelGatesDone ? (
                            <>
                              <span>Next: Advance to {STAGE_CONFIGS.find(s => s.stageKey === nextStageKey)?.name}</span>
                              <i className="ti ti-arrow-right" style={{ fontSize: '15px' }} />
                            </>
                          ) : overrideReason.trim() ? (
                            <>
                              <span>Next: Override & Advance</span>
                              <i className="ti ti-arrow-right" style={{ fontSize: '15px' }} />
                            </>
                          ) : (
                            <span>Next: Advance to {STAGE_CONFIGS.find(s => s.stageKey === nextStageKey)?.name} · {advanceBlockReason}</span>
                          )}
                        </button>

                        {/* Admin Override Input */}
                        {!allPanelGatesDone && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>
                              Admin override (reason required)
                            </span>
                            <input
                              value={overrideReason}
                              onChange={e => setOverrideReason(e.target.value)}
                              placeholder="Reason for override…"
                              style={{
                                fontFamily: 'var(--font-inter)',
                                boxSizing: 'border-box',
                                width: '100%',
                                height: '32px',
                                background: 'var(--color-surface-raised)',
                                border: '0.5px solid var(--color-border)',
                                borderRadius: '8px',
                                padding: '0 10px',
                                fontSize: 'var(--text-xs)',
                                color: 'var(--color-foreground)',
                                outline: 'none',
                              }}
                            />
                          </div>
                        )}
                      </>
                    )}
                  </>
                )
              })()}
            </div>

          </div>
        </aside>
      )}

      {selectedProject && (
        <RecordPaymentModal
          isOpen={recordPaymentModalOpen}
          onClose={() => setRecordPaymentModalOpen(false)}
          clientId={selectedProject.clientId}
          clientName={
            isDiscreteSession
              ? `${selectedProject.clientName || selectedProject.eventName} (Session ${selectedProject.sessionIndex || 1} of ${selectedProject.totalSessions || 1})`
              : (selectedProject.clientName || selectedProject.eventName)
          }
          totalAmount={effectiveTotalAmount}
          balanceDue={effectiveBalanceDue}
          maxBalanceDue={clientBalanceDue}
        />
      )}

      {/* Client Review Rejection / Revision Modal */}
      {rejectModalTrack && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.7)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px',
        }}>
          <div style={{
            width: '100%',
            maxWidth: '480px',
            background: 'var(--color-surface-overlay)',
            border: '0.5px solid var(--color-border)',
            borderRadius: '12px',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="ti ti-alert-triangle" style={{ fontSize: '18px', color: 'var(--color-danger)' }} />
                <span style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--color-foreground)' }}>
                  Client Revision / Rejection
                </span>
              </div>
              <button
                onClick={() => setRejectModalTrack(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--color-foreground-muted)', cursor: 'pointer', fontSize: '18px' }}
              >
                <i className="ti ti-x" />
              </button>
            </div>

            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-foreground-muted)', lineHeight: '1.5' }}>
              Please enter client feedback or required revisions. The work stage for this track will reset to pending so edits can be performed.
            </span>

            <textarea
              value={rejectNotes}
              onChange={(e) => setRejectNotes(e.target.value)}
              placeholder="e.g. Client requested color grade adjustments and skin retouching on portraits..."
              rows={4}
              style={{
                width: '100%',
                padding: '10px 12px',
                background: 'var(--color-surface-raised)',
                border: '0.5px solid var(--color-border)',
                borderRadius: '8px',
                color: 'var(--color-foreground)',
                fontSize: 'var(--text-sm)',
                resize: 'vertical',
                outline: 'none',
                fontFamily: 'var(--font-inter)',
              }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                onClick={() => setRejectModalTrack(null)}
                style={{
                  padding: '8px 14px',
                  borderRadius: '6px',
                  border: '0.5px solid var(--color-border)',
                  background: 'var(--color-surface)',
                  color: 'var(--color-foreground)',
                  fontSize: 'var(--text-sm)',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleClientReviewAction(rejectModalTrack, 'notApproved', rejectNotes)}
                disabled={isSubmittingReview}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: 'none',
                  background: 'var(--color-danger)',
                  color: '#ffffff',
                  fontSize: 'var(--text-sm)',
                  fontWeight: 600,
                  cursor: isSubmittingReview ? 'not-allowed' : 'pointer',
                  opacity: isSubmittingReview ? 0.7 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                {isSubmittingReview ? <i className="ti ti-loader rotate" /> : <i className="ti ti-check" />}
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

// ─── REUSABLE STAGE NODE CARD COMPONENT ─────────────────────────────────────
interface StageNodeGateDetail {
  label: string
  done: boolean
  isPaymentGate?: boolean
  dueAmount?: number
  onRecordPayment?: () => void
}

interface StageNodeCardProps {
  config:         StageConfig
  status:         'completed' | 'active' | 'pending'
  schedule:       string
  isSelected:     boolean
  onClick:        () => void
  onMouseDown?:   (e: React.MouseEvent) => void
  style?:         React.CSSProperties
  inPortId?:      string
  outPortId?:     string
  gates:          string[]
  gateDetails?:   StageNodeGateDetail[]
  assignedNames:  string[]
  isDragging?:    boolean
  isNodeDragging?: boolean
}

function StageNodeCard({
  config,
  status,
  schedule,
  isSelected,
  onClick,
  onMouseDown,
  style,
  inPortId,
  outPortId,
  gates,
  gateDetails,
  assignedNames,
  isDragging,
  isNodeDragging,
}: StageNodeCardProps) {
  const leftBorderColor =
    status === 'completed'
      ? 'var(--color-success)'
      : status === 'active'
      ? 'var(--color-primary)'
      : 'var(--color-border)'

  const selectionRingColor =
    status === 'completed'
      ? 'var(--color-success)'
      : status === 'active'
      ? 'var(--color-primary)'
      : 'var(--color-border-strong)'

  return (
    <div
      onClick={onClick}
      onMouseDown={onMouseDown}
      style={{
        width: '260px',
        flexShrink: 0,
        cursor: isNodeDragging ? 'grabbing' : isDragging ? 'grab' : 'pointer',
        background: isSelected ? 'var(--color-surface-raised)' : 'var(--color-surface)',
        borderTop: '0.5px solid var(--color-border)',
        borderRight: '0.5px solid var(--color-border)',
        borderBottom: '0.5px solid var(--color-border)',
        borderLeft: `${isSelected ? '4px' : '3px'} solid ${leftBorderColor}`,
        borderRadius: '12px',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        boxShadow: isNodeDragging
          ? `0 12px 28px rgba(0,0,0,0.35), 0 0 0 2px ${selectionRingColor}`
          : isSelected
          ? `0 0 0 2px ${selectionRingColor}, 0 6px 20px rgba(0,0,0,0.22)`
          : '0 2px 8px rgba(0,0,0,0.1)',
        position: 'relative',
        transition: isNodeDragging ? 'none' : 'box-shadow 0.15s ease, background-color 0.15s ease',
        userSelect: 'none',
        ...style,
      }}
    >
      {/* Connector Ports on Left and Right (Measured dynamically by data-port-id) */}
      {inPortId && (
        <span
          data-port-id={inPortId}
          style={{
            position: 'absolute',
            left: '-6px',
            top: '50%',
            transform: 'translateY(-50%)',
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            background: 'var(--color-surface)',
            border: '2px solid var(--color-accent)',
          }}
        />
      )}
      {outPortId && (
        <span
          data-port-id={outPortId}
          style={{
            position: 'absolute',
            right: '-6px',
            top: '50%',
            transform: 'translateY(-50%)',
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            background: 'var(--color-surface)',
            border: '2px solid var(--color-accent)',
          }}
        />
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <i
            className="ti ti-grip-vertical"
            style={{ fontSize: '13px', color: 'var(--color-foreground-subtle)', cursor: 'grab' }}
            title="Drag to reposition node"
          />
          <i className={`ti ${config.icon}`} style={{ fontSize: '16px', color: 'var(--color-primary)' }} />
          <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--color-foreground)' }}>
            {config.name}
          </span>
        </div>
        <StatusPill status={status} />
      </div>

      {/* Description */}
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)', lineHeight: 1.4 }}>
        {config.defaultDesc}
      </div>

      {/* Exit Gate summary */}
      <div style={{ borderTop: '0.5px solid var(--color-border)', paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-foreground-subtle)' }}>
          Exit Gate
        </span>
        {gateDetails ? (
          gateDetails.slice(0, 2).map((gd, gdi) => {
            if (gd.isPaymentGate && (!gd.done || (gd.dueAmount ?? 0) > 0)) {
              return (
                <div key={`${gd.label}-${gdi}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', fontSize: '11px', color: 'var(--color-secondary)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                    <i className="ti ti-alert-circle" style={{ fontSize: '13px', color: 'var(--color-secondary)', flexShrink: 0 }} />
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 500 }}>
                      ₹{(gd.dueAmount ?? 0).toLocaleString('en-IN')} Due
                    </span>
                  </div>
                  {gd.onRecordPayment && (
                    <span
                      onClick={(e) => {
                        e.stopPropagation()
                        gd.onRecordPayment?.()
                      }}
                      style={{
                        background: 'var(--color-secondary-muted)',
                        border: '0.5px solid var(--color-secondary)',
                        color: 'var(--color-secondary)',
                        borderRadius: '4px',
                        padding: '1px 6px',
                        fontSize: '10px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                      }}
                    >
                      Record Payment
                    </span>
                  )}
                </div>
              )
            }

            return (
              <div key={`${gd.label}-${gdi}`} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--color-foreground-muted)' }}>
                <i
                  className={gd.done ? 'ti ti-circle-check' : 'ti ti-circle'}
                  style={{
                    fontSize: '13px',
                    color: gd.done ? 'var(--color-success)' : 'var(--color-foreground-subtle)',
                    flexShrink: 0,
                  }}
                />
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{gd.label}</span>
              </div>
            )
          })
        ) : (
          gates.slice(0, 2).map((g, gi) => (
            <div key={`${g}-${gi}`} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--color-foreground-muted)' }}>
              <i
                className={status === 'completed' ? 'ti ti-circle-check' : 'ti ti-circle'}
                style={{
                  fontSize: '13px',
                  color: status === 'completed' ? 'var(--color-success)' : 'var(--color-foreground-subtle)',
                  flexShrink: 0,
                }}
              />
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g}</span>
            </div>
          ))
        )}
      </div>

      {/* Schedule and Team Avatars */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '0.5px solid var(--color-border)', paddingTop: '8px' }}>
        <span style={{ fontSize: '11px', color: 'var(--color-foreground-subtle)' }}>
          {schedule}
        </span>
        <div style={{ display: 'flex', marginLeft: 'auto' }}>
          {assignedNames.slice(0, 3).map((name, i) => {
            const cleanName = name.replace(/\([^)]*\)/g, '').trim() || name
            const init = cleanName
              .split(/\s+/)
              .map((w: string) => w[0])
              .filter(Boolean)
              .join('')
              .slice(0, 2)
              .toUpperCase()
            return (
              <div
                key={`${name}-${i}`}
                title={name}
                style={{
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  background: 'var(--color-primary-muted)',
                  border: '1.5px solid var(--color-surface)',
                  color: 'var(--color-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '8px',
                  fontWeight: 700,
                  marginLeft: i > 0 ? '-5px' : 0,
                }}
              >
                {init}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── STATUS PILL HELPER COMPONENT ───────────────────────────────────────────
function StatusPill({ status }: { status: 'completed' | 'active' | 'pending' }) {
  if (status === 'completed') {
    return (
      <span style={{
        fontSize: 'var(--text-xs)',
        fontWeight: 600,
        padding: '2px 8px',
        borderRadius: '10px',
        background: 'var(--color-success-muted)',
        color: 'var(--color-success)',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
      }}>
        ✓ Completed
      </span>
    )
  }

  if (status === 'active') {
    return (
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: 'var(--text-xs)',
        fontWeight: 600,
        padding: '2px 10px',
        borderRadius: '10px',
        background: 'var(--color-primary-muted)',
        color: 'var(--color-primary)',
      }}>
        <span style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          background: 'var(--color-primary)',
          boxShadow: '0 0 6px var(--color-primary)',
        }} />
        Active now
      </span>
    )
  }

  return (
    <span style={{
      fontSize: 'var(--text-xs)',
      fontWeight: 600,
      padding: '2px 8px',
      borderRadius: '10px',
      background: 'var(--color-surface-raised)',
      color: 'var(--color-foreground-subtle)',
    }}>
      Pending
    </span>
  )
}

class EventsErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Events Canvas Error Boundary caught an error:', error, errorInfo)
  }

  handleReset = () => {
    try {
      localStorage.removeItem('studio_zoom_node_offsets')
    } catch {
      // ignore
    }
    this.setState({ hasError: false, error: null })
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '64px 24px',
          textAlign: 'center',
          fontFamily: 'var(--font-inter)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '60vh',
          gap: '16px',
        }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            background: 'var(--color-danger-muted)',
            color: 'var(--color-danger)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '24px',
          }}>
            <i className="ti ti-alert-triangle" />
          </div>
          <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: 'var(--color-foreground)', margin: 0 }}>
            Events Canvas encountered an issue
          </h2>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-foreground-muted)', maxWidth: '440px', margin: 0 }}>
            A temporary display error occurred while rendering the canvas nodes. Click below to reset node positions and restore the board.
          </p>
          <button
            onClick={this.handleReset}
            style={{
              marginTop: '8px',
              padding: '10px 20px',
              background: 'var(--color-primary)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontSize: 'var(--text-sm)',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontFamily: 'var(--font-inter)',
            }}
          >
            <i className="ti ti-refresh" />
            Reset Canvas & Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

export default function EventsBoardPage() {
  return (
    <EventsErrorBoundary>
      <Suspense fallback={
        <div style={{
          padding: '48px',
          textAlign: 'center',
          color: 'var(--color-foreground-muted)',
          fontFamily: 'var(--font-inter)',
        }}>
          Loading Events Board…
        </div>
      }>
        <EventsBoardContent />
      </Suspense>
    </EventsErrorBoundary>
  )
}

'use client'

import React, { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { Project, ProjectStage, EventDateEntry, Freelancer, Client } from '@/types'
import {
  subscribeToProjects,
  updateProjectStage,
  updateProjectStageGates,
  updateTrackMilestone,
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
import { Badge } from '@/components/shared/Badge'
import { Button } from '@/components/ui/button'
import { RecordPaymentModal } from '@/components/shared/RecordPaymentModal'

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

// Fallback seed projects if database is empty so screen is immediately interactive
const MOCK_FALLBACK_PROJECTS: Project[] = [
  {
    projectId: 'demo-proj-1',
    clientId: 'client-1',
    eventName: 'Karthik weds Priya',
    clientName: 'Karthik Raman',
    eventType: 'wedding',
    stage: 'planning',
    status: 'ongoing',
    eventDate: new Date('2026-08-02T06:00:00'),
    bookingType: 'multiDate',
    dateLabel: 'Grand 3-Day Wedding',
    eventDates: [
      { id: 'd1', date: new Date('2026-07-31T17:00:00'), label: 'Day 1: Sangeet & Mehendi', location: 'ITC Grand Chola', startTime: '17:00', endTime: '22:00' },
      { id: 'd2', date: new Date('2026-08-01T06:30:00'), label: 'Day 2: Muhurtham', location: 'Sri Mahal, Avadi', startTime: '06:00', endTime: '13:00' },
      { id: 'd3', date: new Date('2026-08-02T18:30:00'), label: 'Day 3: Reception', location: 'Mayor Ramanathan Hall', startTime: '18:30', endTime: '22:30' },
    ],
    staffUids: ['staff-naresh', 'staff-siva'],
    freelancerIds: ['fl-guna'],
    milestones: { depositPaid: new Date('2026-05-12') },
    createdBy: 'admin',
    createdAt: new Date('2026-05-12'),
    updatedAt: new Date('2026-05-14'),
  },
  {
    projectId: 'demo-proj-2',
    clientId: 'client-2',
    eventName: 'Divya & Arjun',
    clientName: 'Divya Subramanian',
    eventType: 'engagement',
    stage: 'preProduction',
    status: 'ongoing',
    eventDate: new Date('2026-07-24T16:00:00'),
    bookingType: 'oneTime',
    staffUids: ['staff-siva', 'staff-ramesh'],
    freelancerIds: [],
    milestones: { depositPaid: new Date('2026-06-01') },
    createdBy: 'admin',
    createdAt: new Date('2026-06-01'),
    updatedAt: new Date('2026-07-15'),
  },
  {
    projectId: 'demo-proj-3',
    clientId: 'client-3',
    eventName: 'TVS Lucas AV',
    clientName: 'TVS Lucas Ltd',
    eventType: 'corporate',
    stage: 'planning',
    status: 'ongoing',
    eventDate: new Date('2026-07-26T09:00:00'),
    bookingType: 'oneTime',
    staffUids: ['staff-deepak', 'staff-kavya'],
    freelancerIds: [],
    milestones: { depositPaid: new Date('2026-06-15') },
    createdBy: 'admin',
    createdAt: new Date('2026-06-15'),
    updatedAt: new Date('2026-07-10'),
  },
  {
    projectId: 'demo-proj-4',
    clientId: 'client-4',
    eventName: 'Ravi & Shruti',
    clientName: 'Ravi Kumar',
    eventType: 'wedding',
    stage: 'postProduction',
    status: 'ongoing',
    eventDate: new Date('2026-06-14T08:00:00'),
    bookingType: 'oneTime',
    staffUids: ['staff-kavya', 'staff-ramesh', 'staff-anitha'],
    freelancerIds: [],
    milestones: { depositPaid: new Date('2026-04-01'), rawPhotosDelivered: new Date('2026-06-15') },
    createdBy: 'admin',
    createdAt: new Date('2026-04-01'),
    updatedAt: new Date('2026-06-20'),
  },
  {
    projectId: 'demo-proj-5',
    clientId: 'client-5',
    eventName: 'Prakash Family Portrait',
    clientName: 'Prakash S',
    eventType: 'portrait',
    stage: 'delivered',
    status: 'completed',
    eventDate: new Date('2026-05-18T10:00:00'),
    bookingType: 'oneTime',
    staffUids: ['staff-kavya'],
    freelancerIds: [],
    milestones: { depositPaid: new Date('2026-05-01'), delivered: new Date('2026-05-25') },
    createdBy: 'admin',
    createdAt: new Date('2026-05-01'),
    updatedAt: new Date('2026-05-25'),
  },
  {
    projectId: 'demo-proj-6',
    clientId: 'client-6',
    eventName: 'Aishwarya & Naveen',
    clientName: 'Aishwarya N',
    eventType: 'wedding',
    stage: 'preProduction',
    status: 'ongoing',
    eventDate: new Date('2026-06-10T09:00:00'),
    bookingType: 'oneTime',
    staffUids: ['staff-deepak'],
    freelancerIds: [],
    milestones: { depositPaid: new Date('2026-03-01') },
    createdBy: 'admin',
    createdAt: new Date('2026-03-01'),
    updatedAt: new Date('2026-06-01'),
  },
]

// Fallback staff for assignment initials
const MOCK_STAFF: StaffMember[] = [
  { uid: 'staff-naresh', name: 'Naresh B', email: 'naresh@studiozoom.in', role: 'admin', contact: '9840011223', isActive: true, createdAt: new Date() },
  { uid: 'staff-siva',   name: 'Siva P',   email: 'siva@studiozoom.in',   role: 'staff', contact: '9840022334', isActive: true, createdAt: new Date() },
  { uid: 'staff-kavya',  name: 'Kavya R',  email: 'kavya@studiozoom.in',  role: 'staff', contact: '9840033445', isActive: true, createdAt: new Date() },
  { uid: 'staff-ramesh', name: 'Ramesh D', email: 'ramesh@studiozoom.in', role: 'staff', contact: '9840044556', isActive: true, createdAt: new Date() },
  { uid: 'staff-deepak', name: 'Deepak S', email: 'deepak@studiozoom.in', role: 'staff', contact: '9840055667', isActive: true, createdAt: new Date() },
  { uid: 'staff-anitha', name: 'Anitha M', email: 'anitha@studiozoom.in', role: 'staff', contact: '9840066778', isActive: true, createdAt: new Date() },
]

// Fallback freelancers for assignment
const MOCK_FREELANCERS: Freelancer[] = [
  { freelancerId: 'fl-guna', name: 'Guna Sundaram', skill: 'videographer', dayRate: 7500, contact: '+91 98401 23456', isActive: true },
  { freelancerId: 'fl-arun', name: 'Arun Kumar', skill: 'photographer', dayRate: 6000, contact: '+91 98402 34567', isActive: true },
  { freelancerId: 'fl-manoj', name: 'Manoj Krishna', skill: 'editor', dayRate: 5000, contact: '+91 98403 45678', isActive: true },
  { freelancerId: 'fl-priya', name: 'Priya Mani', skill: 'designer', dayRate: 4500, contact: '+91 98404 56789', isActive: true },
]

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

  // ─── STATE ──────────────────────────────────────────────────────────────
  const [projects, setProjects] = useState<Project[]>([])
  const [staffList, setStaffList] = useState<StaffMember[]>(MOCK_STAFF)
  const [freelancerList, setFreelancerList] = useState<Freelancer[]>(MOCK_FREELANCERS)
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [railFilter, setRailFilter] = useState<'active' | 'done' | 'overdue'>('active')
  const [panelStageKey, setPanelStageKey] = useState<ProjectStage | null>(null)
  const [overrideReason, setOverrideReason] = useState('')
  const [isAdvancing, setIsAdvancing] = useState(false)
  const [selectedDayTab, setSelectedDayTab] = useState<number>(0)
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [recordPaymentModalOpen, setRecordPaymentModalOpen] = useState(false)

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
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStartRef.current.mouseX
      const dy = e.clientY - dragStartRef.current.mouseY
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        dragStartRef.current.hasMoved = true
      }
      setPan({
        x: dragStartRef.current.panX + dx,
        y: dragStartRef.current.panY + dy,
      })
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging])

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

  // Prevent opening stage panel if the user was dragging/panning across a card
  const handleStageCardClick = (stageKey: ProjectStage, dayIdx?: number) => {
    if (dragStartRef.current.hasMoved) return
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
    const unsubProjects = subscribeToProjects(firestoreProjects => {
      const projs = firestoreProjects && firestoreProjects.length > 0 ? firestoreProjects : MOCK_FALLBACK_PROJECTS
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

    const unsubStaff = subscribeToStaff(team => {
      if (team && team.length > 0) {
        setStaffList(team)
      }
    })

    const unsubFreelancers = subscribeToFreelancers(data => {
      if (data && data.length > 0) {
        setFreelancerList(data)
      }
    })

    return () => {
      unsubProjects()
      unsubStaff()
      unsubFreelancers()
    }
  }, [paramProject])

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
      setSelectedClient(null)
      return
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
  const isPaymentPending = clientBalanceDue > 0 && selectedClient?.paymentStatus !== 'paid'

  // Apply URL params (project + stage) only once — on the first time projects data is available.
  // Do NOT re-run on every Firestore update, otherwise any panel navigation resets back to the URL stage.
  useEffect(() => {
    if (urlParamsAppliedRef.current) return
    if (projects.length === 0) return

    let applied = false
    if (paramProject) {
      const match = projects.find(p => p.projectId === paramProject || p.clientId === paramProject)
      if (match) {
        setSelectedProjectId(match.projectId)
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
  }, [paramProject, paramStage, projects])

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

  useLayoutEffect(() => {
    measurePorts()
    const timer = setTimeout(measurePorts, 60)
    return () => clearTimeout(timer)
  }, [measurePorts, selectedProjectId, selectedDayTab, projects])

  useEffect(() => {
    window.addEventListener('resize', measurePorts)
    return () => window.removeEventListener('resize', measurePorts)
  }, [measurePorts])

  // ─── KPI METRICS ────────────────────────────────────────────────────────
  const now = useMemo(() => new Date(), [])

  const { ongoingCount, doneCount, overdueCount } = useMemo(() => {
    let ongoing = 0
    let done = 0
    let overdue = 0

    projects.forEach(p => {
      const isDelivered = p.stage === 'delivered' || p.status === 'completed'
      if (isDelivered) {
        done++
      } else {
        const eventDate = p.eventDate instanceof Date ? p.eventDate : new Date(p.eventDate)
        if (eventDate.getTime() < now.getTime()) {
          overdue++
        } else {
          ongoing++
        }
      }
    })

    return { ongoingCount: ongoing, doneCount: done, overdueCount: overdue }
  }, [projects, now])

  // ─── FILTERED PROJECTS IN LEFT RAIL ─────────────────────────────────────
  const filteredProjects = useMemo(() => {
    return projects.filter(p => {
      const eventDate = p.eventDate instanceof Date ? p.eventDate : new Date(p.eventDate)
      const isDelivered = p.stage === 'delivered' || p.status === 'completed'
      const isPastDue = !isDelivered && eventDate.getTime() < now.getTime()

      // Ongoing: only active projects that are on track (not overdue and not delivered)
      if (railFilter === 'active' && (isDelivered || isPastDue)) return false
      // Done: only delivered/completed projects
      if (railFilter === 'done' && !isDelivered) return false
      // Overdue: only active projects whose event date has passed
      if (railFilter === 'overdue' && !isPastDue) return false

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const matchName = (p.eventName || '').toLowerCase().includes(q)
        const matchClient = (p.clientName || '').toLowerCase().includes(q)
        const matchType = (p.eventType || '').toLowerCase().includes(q)
        const matchLabel = (p.dateLabel || '').toLowerCase().includes(q)
        if (!matchName && !matchClient && !matchType && !matchLabel) return false
      }

      return true
    })
  }, [projects, railFilter, searchQuery, now])

  // ─── STAGE PROGRESS HELPERS ─────────────────────────────────────────────
  const currentStageIndex = useMemo(() => {
    if (!selectedProject) return 0
    const idx = STAGE_ORDER.indexOf(selectedProject.stage)
    return idx >= 0 ? idx : 0
  }, [selectedProject])

  const getStageStatus = (stageKey: ProjectStage): 'completed' | 'active' | 'pending' => {
    const stageIdx = STAGE_ORDER.indexOf(stageKey)
    if (stageIdx < currentStageIndex) return 'completed'
    if (stageIdx === currentStageIndex) {
      if (selectedProject?.stage === 'delivered' && selectedProject?.status === 'completed') {
        return 'completed'
      }
      return 'active'
    }
    return 'pending'
  }

  // Multi-day / Multi-event tracks detection
  const multiEventDays: EventDateEntry[] = useMemo(() => {
    if (!selectedProject) return []
    if (selectedProject.eventDates && selectedProject.eventDates.length > 0) {
      return selectedProject.eventDates
    }
    return [
      {
        id: 'main-day',
        date: selectedProject.eventDate,
        label: selectedProject.dateLabel || 'Main Shoot Day',
        location: 'Venue Site',
        startTime: selectedProject.startTime || '07:00 AM',
        endTime: selectedProject.endTime || '08:00 PM',
      }
    ]
  }, [selectedProject])

  const isMultiEvent = multiEventDays.length > 1

  // ─── TRACK MILESTONE HELPERS ────────────────────────────────────────────
  const isTrackMilestoneDone = useCallback((track: 'photo' | 'video', milestone: string): boolean => {
    if (!selectedProject) return false
    const overrideKey = `${selectedProject.projectId}_${track}_${milestone}`
    if (trackMilestoneOverrides[overrideKey] !== undefined) {
      return trackMilestoneOverrides[overrideKey]
    }
    const projectMilestones = track === 'photo' ? selectedProject.photoMilestones : selectedProject.videoMilestones
    if (projectMilestones && projectMilestones[milestone] !== undefined) {
      return projectMilestones[milestone]
    }
    const stageIdx = STAGE_ORDER.indexOf(selectedProject.stage)
    if (stageIdx > 4) return true
    return false
  }, [selectedProject, trackMilestoneOverrides])

  const photoTrackDoneCount = useMemo(() => {
    return PHOTO_TRACK_MILESTONES.filter(m => isTrackMilestoneDone('photo', m)).length
  }, [isTrackMilestoneDone])

  const isPhotoTrackAllDone = photoTrackDoneCount === PHOTO_TRACK_MILESTONES.length

  const videoTrackDoneCount = useMemo(() => {
    return VIDEO_TRACK_MILESTONES.filter(m => isTrackMilestoneDone('video', m)).length
  }, [isTrackMilestoneDone])

  const isVideoTrackAllDone = videoTrackDoneCount === VIDEO_TRACK_MILESTONES.length

  const toggleTrackMilestone = async (track: 'photo' | 'video', milestone: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation()
    }
    if (!selectedProject) return

    const currentlyDone = isTrackMilestoneDone(track, milestone)
    const newVal = !currentlyDone
    const key = `${selectedProject.projectId}_${track}_${milestone}`

    setTrackMilestoneOverrides(prev => ({ ...prev, [key]: newVal }))

    setProjects(prev => prev.map(p => {
      if (p.projectId === selectedProject.projectId) {
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

  // ─── GATE CHECKLIST STATE ───────────────────────────────────────────────
  const toggleGate = (stageKey: ProjectStage, gateText: string, currentVal: boolean) => {
    if (!selectedProject) return
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

  const currentPanelConfig = useMemo(() => {
    return STAGE_CONFIGS.find(s => s.stageKey === panelStageKey) || null
  }, [panelStageKey])

  const panelGates = useMemo(() => {
    if (!currentPanelConfig || !selectedProject) return []
    const stageIdx = STAGE_ORDER.indexOf(currentPanelConfig.stageKey)
    return currentPanelConfig.defaultGates.map((gateText: string, i: number) => {
      const key = `${selectedProject.projectId}_${currentPanelConfig.stageKey}_${gateText}`
      if (gateOverrides[key] !== undefined) {
        return { label: gateText, done: gateOverrides[key] }
      }
      if (currentPanelConfig.stageKey === 'postProduction') {
        if (gateText === 'Photo track completed') return { label: gateText, done: isPhotoTrackAllDone }
        if (gateText === 'Video track completed') return { label: gateText, done: isVideoTrackAllDone }
      }
      if (stageIdx < currentStageIndex) return { label: gateText, done: true }
      if (stageIdx === currentStageIndex) return { label: gateText, done: i === 0 }
      return { label: gateText, done: false }
    })
  }, [currentPanelConfig, selectedProject, currentStageIndex, gateOverrides, isPhotoTrackAllDone, isVideoTrackAllDone])

  const allPanelGatesDone = useMemo(() => {
    return panelGates.length > 0 && panelGates.every(g => g.done)
  }, [panelGates])

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
    return getStageStatus(panelStageKey)
  }, [panelStageKey, currentStageIndex, selectedProject])

  // ─── ADVANCE STAGE HANDLER ──────────────────────────────────────────────
  const handleAdvanceStage = async () => {
    if (!selectedProject || !panelStageKey || !nextStageKey) return
    const hasOverride = overrideReason.trim().length > 0
    if (!allPanelGatesDone && !hasOverride) return

    setIsAdvancing(true)
    try {
      if (selectedProject.projectId.startsWith('demo-')) {
        setProjects(prev => prev.map(p => {
          if (p.projectId === selectedProject.projectId) {
            return {
              ...p,
              stage: nextStageKey,
              status: nextStageKey === 'delivered' ? 'completed' : 'ongoing',
              updatedAt: new Date(),
            }
          }
          return p
        }))
      } else {
        await updateProjectStage(
          selectedProject.projectId,
          nextStageKey,
          selectedProject.clientId,
          hasOverride ? { by: appUser?.name || 'Admin', reason: overrideReason.trim() } : undefined
        )
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
    const hasOverride = overrideReason.trim().length > 0
    if (!allPanelGatesDone && !hasOverride) return

    setIsAdvancing(true)
    try {
      if (selectedProject.projectId.startsWith('demo-')) {
        setProjects(prev => prev.map(p => {
          if (p.projectId === selectedProject.projectId) {
            return {
              ...p,
              status: 'completed',
              updatedAt: new Date(),
            }
          }
          return p
        }))
      } else {
        await updateProjectStage(
          selectedProject.projectId,
          'delivered',
          selectedProject.clientId,
          hasOverride ? { by: appUser?.name || 'Admin', reason: overrideReason.trim() } : undefined
        )
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
      setProjects(prev => prev.map(p => {
        if (p.projectId === selectedProject.projectId) {
          return { ...p, staffUids: [...(p.staffUids || []), staffUid] }
        }
        return p
      }))
    } else {
      await assignStaffToProject(selectedProject.projectId, staffUid, selectedProject.clientId)
    }
  }

  const handleRemoveStaff = async (staffUid: string) => {
    if (!selectedProject) return
    if (selectedProject.projectId.startsWith('demo-')) {
      setProjects(prev => prev.map(p => {
        if (p.projectId === selectedProject.projectId) {
          return { ...p, staffUids: (p.staffUids || []).filter(id => id !== staffUid) }
        }
        return p
      }))
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

    setProjects(prev => prev.map(p => {
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
    }))

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

    setProjects(prev => prev.map(p => {
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
    }))

    if (!selectedProject.projectId.startsWith('demo-')) {
      try {
        await unassignFreelancerFromProject(selectedProject.projectId, freelancerId, selectedProject.clientId)
      } catch (err) {
        console.error('Failed to unassign freelancer in Firestore:', err)
      }
    }
  }

  const formatShortDate = (d: Date | string | undefined) => {
    if (!d) return '—'
    const date = d instanceof Date ? d : new Date(d)
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  // ─── POST-PROD PARALLEL TRACKS PROGRESS ─────────────────────────────────
  const photoMilestones = PHOTO_TRACK_MILESTONES
  const videoMilestones = VIDEO_TRACK_MILESTONES

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
    if (!p1 || !p2) return null

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
            <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--color-foreground-subtle)', fontSize: 'var(--text-xs)' }}>
              <i className="ti ti-calendar-off" style={{ fontSize: '24px', display: 'block', marginBottom: '8px', opacity: 0.5 }} />
              No events found matching this filter
            </div>
          ) : (
            filteredProjects.map(p => {
              const isSelected = p.projectId === selectedProject?.projectId
              const isOverdue = p.stage !== 'delivered' && (p.eventDate instanceof Date ? p.eventDate : new Date(p.eventDate)).getTime() < now.getTime()
              const isMultiDay = (p.eventDates && p.eventDates.length > 1) || p.bookingType === 'multiDate'

              return (
                <div
                  key={p.projectId}
                  onClick={() => handleSelectProject(p.projectId)}
                  style={{
                    cursor: 'pointer',
                    borderRadius: '10px',
                    padding: '12px 14px',
                    background: isSelected ? 'var(--color-primary-muted)' : 'var(--color-surface-raised)',
                    border: '0.5px solid var(--color-border)',
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
                  </div>

                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ textTransform: 'capitalize' }}>{p.eventType}</span>
                    <span>·</span>
                    <span>{formatShortDate(p.eventDate)}</span>
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
                  <span style={{ textTransform: 'capitalize' }}>{selectedProject.eventType}</span>
                  {' · '}
                  {formatShortDate(selectedProject.eventDate)}
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
            </>
          ) : (
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-foreground-muted)' }}>
              Select a project from the left rail
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
            </svg>

            {/* ─── NODE CARDS LAYOUT ─── */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '64px', position: 'relative', zIndex: 2 }}>
              
              {/* ROOT NODE: START PROJECT PILL */}
              <div style={{
                marginTop: '68px',
                width: '130px',
                flexShrink: 0,
                background: 'var(--color-surface)',
                border: '1.5px solid var(--color-accent)',
                borderRadius: '20px',
                padding: '8px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                position: 'relative',
              }}>
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
                inPortId="booked-in"
                outPortId="booked-out"
                gates={['Advance recorded', 'Quotation accepted']}
                assignedNames={assignedTeamMembers.slice(0, 2).map(s => s.name)}
                isDragging={isDragging}
              />

              {/* STAGE 2: PLANNING */}
              <StageNodeCard
                config={STAGE_CONFIGS[1]}
                status={getStageStatus('planning')}
                schedule="2–3 weeks prior"
                isSelected={panelStageKey === 'planning'}
                onClick={() => handleStageCardClick('planning')}
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
                  const dayStatus = getStageStatus('eventDay')
                  const isDaySelected = panelStageKey === 'eventDay' && selectedDayTab === idx

                  return (
                    <div
                      key={day.id || idx}
                      onClick={() => handleStageCardClick('eventDay', idx)}
                      style={{
                        width: '260px',
                        cursor: isDragging ? 'grabbing' : 'pointer',
                        background: 'var(--color-surface)',
                        border: '0.5px solid var(--color-border)',
                        borderLeft: `3px solid ${
                          dayStatus === 'completed'
                            ? 'var(--color-success)'
                            : dayStatus === 'active'
                            ? 'var(--color-primary)'
                            : 'var(--color-border)'
                        }`,
                        borderRadius: '12px',
                        padding: '16px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                        boxShadow: isDaySelected
                          ? '0 0 0 2px var(--color-primary), 0 4px 14px rgba(0,0,0,0.2)'
                          : '0 2px 8px rgba(0,0,0,0.1)',
                        position: 'relative',
                        transition: 'all 0.15s ease',
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
                      <div style={{ borderTop: '0.5px solid var(--color-border)', paddingTop: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <i
                          className={dayStatus === 'completed' ? 'ti ti-circle-check' : 'ti ti-circle'}
                          style={{
                            fontSize: '14px',
                            color: dayStatus === 'completed' ? 'var(--color-success)' : 'var(--color-foreground-subtle)',
                          }}
                        />
                        <span style={{ fontSize: '11px', color: 'var(--color-foreground-subtle)' }}>
                          Dual raw backup verification
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* STAGE 5: POST-PROD (Main node + parallel photo & video tracks) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '310px' }}>
                <div style={{ position: 'relative' }}>
                  <StageNodeCard
                    config={STAGE_CONFIGS[4]}
                    status={getStageStatus('postProduction')}
                    schedule="Post-event processing"
                    isSelected={panelStageKey === 'postProduction'}
                    onClick={() => handleStageCardClick('postProduction')}
                    inPortId="postprod-in"
                    gates={['Photo track completed', 'Video track completed']}
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
                      if (!dragStartRef.current.hasMoved) handleStageCardClick('postProduction')
                    }}
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
                      cursor: 'pointer',
                      boxShadow: panelStageKey === 'postProduction' ? '0 0 0 1px var(--color-accent)' : 'none',
                      transition: 'all 0.15s ease',
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
                      if (!dragStartRef.current.hasMoved) handleStageCardClick('postProduction')
                    }}
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
                      cursor: 'pointer',
                      boxShadow: panelStageKey === 'postProduction' ? '0 0 0 1px var(--color-secondary)' : 'none',
                      transition: 'all 0.15s ease',
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
                  inPortId="delivered-in"
                  outPortId="delivered-out"
                  gates={['Outstanding balance = ₹0', 'Client sign-off received']}
                  assignedNames={assignedTeamMembers.slice(0, 1).map(s => s.name)}
                  isDragging={isDragging}
                />

                {/* Handover Complete Pill */}
                <div style={{
                  width: '140px',
                  flexShrink: 0,
                  background: 'var(--color-surface)',
                  border: `1.5px solid ${currentStageIndex === 5 ? 'var(--color-success)' : 'var(--color-border)'}`,
                  borderRadius: '20px',
                  padding: '8px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                  position: 'relative',
                }}>
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
                      border: `2px solid ${currentStageIndex === 5 ? 'var(--color-success)' : 'var(--color-border)'}`,
                    }}
                  />
                  <span style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: currentStageIndex === 5 ? 'var(--color-success)' : 'var(--color-foreground-subtle)',
                  }} />
                  <span style={{
                    fontSize: 'var(--text-xs)',
                    fontWeight: 700,
                    color: currentStageIndex === 5 ? 'var(--color-success)' : 'var(--color-foreground-subtle)',
                  }}>
                    Completed
                  </span>
                </div>
              </div>

            </div>

          </div>
        </div>
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
              {currentPanelConfig.name}
            </span>
            <StatusPill status={getStageStatus(panelStageKey)} />
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
                {selectedProject ? formatShortDate(selectedProject.eventDate) : '—'}
                {' · '}
                {currentPanelConfig.whenOffset}
              </span>
            </div>

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

              {panelGates.map(gate => (
                <div
                  key={gate.label}
                  onClick={() => toggleGate(panelStageKey, gate.label, gate.done)}
                  style={{
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    fontSize: 'var(--text-sm)',
                    color: gate.done ? 'var(--color-foreground)' : 'var(--color-foreground-muted)',
                    background: gate.done ? 'var(--color-success-muted)' : 'var(--color-surface-raised)',
                    border: `0.5px solid ${gate.done ? 'var(--color-success)' : 'var(--color-border)'}`,
                    borderRadius: '8px',
                    padding: '8px 12px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <i
                    className={gate.done ? 'ti ti-circle-check' : 'ti ti-circle'}
                    style={{
                      fontSize: '18px',
                      color: gate.done ? 'var(--color-success)' : 'var(--color-foreground-subtle)',
                    }}
                  />
                  <span style={{ flex: 1 }}>{gate.label}</span>
                </div>
              ))}
            </div>

            {/* Post-Production Parallel Tracks Checklists */}
            {panelStageKey === 'postProduction' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {/* Photo Track Card in Side Panel */}
                <div style={{
                  background: 'var(--color-surface-raised)',
                  border: '0.5px solid var(--color-border)',
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
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <i
                            className={isDone ? 'ti ti-checkbox' : 'ti ti-square'}
                            style={{
                              fontSize: '16px',
                              color: isDone ? 'var(--color-success)' : 'var(--color-foreground-subtle)',
                            }}
                          />
                          <span style={{
                            flex: 1,
                            fontSize: 'var(--text-xs)',
                            color: isDone ? 'var(--color-foreground)' : 'var(--color-foreground-muted)',
                            textDecoration: isDone ? 'line-through' : 'none',
                          }}>
                            {step}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Video Track Card in Side Panel */}
                <div style={{
                  background: 'var(--color-surface-raised)',
                  border: '0.5px solid var(--color-border)',
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
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <i
                            className={isDone ? 'ti ti-checkbox' : 'ti ti-square'}
                            style={{
                              fontSize: '16px',
                              color: isDone ? 'var(--color-success)' : 'var(--color-foreground-subtle)',
                            }}
                          />
                          <span style={{
                            flex: 1,
                            fontSize: 'var(--text-xs)',
                            color: isDone ? 'var(--color-foreground)' : 'var(--color-foreground-muted)',
                            textDecoration: isDone ? 'line-through' : 'none',
                          }}>
                            {step}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Assigned Staff Section */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-foreground-subtle)' }}>
                  Assigned team
                </span>
                <span style={{ fontSize: '10px', color: 'var(--color-foreground-subtle)' }}>
                  {assignedTeamMembers.length} assigned
                </span>
              </div>

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
              {panelStageStatus === 'completed' && (
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
                        All exit gates satisfied · Project is currently at {STAGE_CONFIGS[currentStageIndex]?.name}.
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
              )}

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
                  <i className="ti ti-lock" style={{ fontSize: '20px', color: 'var(--color-foreground-subtle)', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-foreground)' }}>
                      Upcoming Stage
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--color-foreground-muted)', marginTop: '2px' }}>
                      Unlocks after {STAGE_CONFIGS[currentStageIndex]?.name} is completed.
                    </div>
                  </div>
                </div>
              )}

              {/* CASE 3: Active Stage (Current stage being worked on) */}
              {panelStageStatus === 'active' && (
                <>
                  {panelStageKey === 'delivered' ? (
                    selectedProject?.status === 'completed' ? (
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
                          ₹{clientBalanceDue.toLocaleString('en-IN')} remaining of ₹{clientTotalAmount.toLocaleString('en-IN')}. Please record final payment before completing this event.
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
                            {clientTotalAmount > 0
                              ? `All payments cleared (₹${clientTotalAmount.toLocaleString('en-IN')})`
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
                            <span>Complete Handover · Gates pending</span>
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
                          <span>Next: Advance to {STAGE_CONFIGS.find(s => s.stageKey === nextStageKey)?.name} · Gates pending</span>
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
              )}
            </div>

          </div>
        </aside>
      )}

      {selectedProject && (
        <RecordPaymentModal
          isOpen={recordPaymentModalOpen}
          onClose={() => setRecordPaymentModalOpen(false)}
          clientId={selectedProject.clientId}
          clientName={selectedProject.clientName || selectedProject.eventName}
          totalAmount={clientTotalAmount}
          balanceDue={clientBalanceDue}
        />
      )}

    </div>
  )
}

// ─── REUSABLE STAGE NODE CARD COMPONENT ─────────────────────────────────────
interface StageNodeCardProps {
  config:        StageConfig
  status:        'completed' | 'active' | 'pending'
  schedule:      string
  isSelected:    boolean
  onClick:       () => void
  inPortId?:     string
  outPortId?:    string
  gates:         string[]
  assignedNames: string[]
  isDragging?:   boolean
}

function StageNodeCard({
  config,
  status,
  schedule,
  isSelected,
  onClick,
  inPortId,
  outPortId,
  gates,
  assignedNames,
  isDragging,
}: StageNodeCardProps) {
  const leftBorderColor =
    status === 'completed'
      ? 'var(--color-success)'
      : status === 'active'
      ? 'var(--color-primary)'
      : 'var(--color-border)'

  return (
    <div
      onClick={onClick}
      style={{
        width: '260px',
        flexShrink: 0,
        cursor: isDragging ? 'grabbing' : 'pointer',
        background: 'var(--color-surface)',
        border: '0.5px solid var(--color-border)',
        borderLeft: `3px solid ${leftBorderColor}`,
        borderRadius: '12px',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        boxShadow: isSelected
          ? '0 0 0 2px var(--color-primary), 0 4px 14px rgba(0,0,0,0.2)'
          : '0 2px 8px rgba(0,0,0,0.1)',
        position: 'relative',
        transition: 'all 0.15s ease',
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
        {gates.slice(0, 2).map((g, gi) => (
          <div key={`${g}-${gi}`} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--color-foreground-muted)' }}>
            <i
              className={status === 'completed' ? 'ti ti-circle-check' : 'ti ti-circle'}
              style={{
                fontSize: '13px',
                color: status === 'completed' ? 'var(--color-success)' : 'var(--color-foreground-subtle)',
              }}
            />
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g}</span>
          </div>
        ))}
      </div>

      {/* Schedule and Team Avatars */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '0.5px solid var(--color-border)', paddingTop: '8px' }}>
        <span style={{ fontSize: '11px', color: 'var(--color-foreground-subtle)' }}>
          {schedule}
        </span>
        <div style={{ display: 'flex', marginLeft: 'auto' }}>
          {assignedNames.slice(0, 3).map((name, i) => {
            const init = name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
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

export default function EventsBoardPage() {
  return (
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
  )
}

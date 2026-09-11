'use client'
import { useState, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  subscribeToWorkItems,
  createWorkItem,
  updateWorkItemStatus,
  updateWorkItemProgress,
  updateWorkItemAssignee,
  saveWorkItemDetails,
  CreateWorkItemData,
} from '@/lib/firebase/queries/workItems'
import { updateTrackStageStatus } from '@/lib/firebase/queries/postProduction'
import {
  subscribeToProjects,
  subscribeToAllStaffAssignments,
  assignStaffToProject,
  removeStaffFromProject,
} from '@/lib/firebase/queries/projects'
import {
  subscribeToFreelancers,
  assignFreelancerToProject,
  unassignFreelancerFromProject,
} from '@/lib/firebase/queries/freelancers'
import { subscribeToStaff, StaffMember } from '@/lib/firebase/queries/staff'
import { useAuthStore } from '@/store/authStore'
import { useUIStore } from '@/store/uiStore'
import { isAllowedByTestMode } from '@/lib/utils/testMode'
import {
  WorkItem,
  WorkItemStatus,
  WorkItemType,
  WorkTrack,
  WorkItemPriority,
  Project,
  StaffAssignment,
  Freelancer,
  PostProdStageStatus,
} from '@/types'

// ─── Fallback Data (matching events board fallback) ────────────────────────────

const MOCK_FALLBACK_PROJECTS: Project[] = []
const MOCK_STAFF: StaffMember[] = []
const MOCK_FREELANCERS: Freelancer[] = []

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  if (!name) return '—'
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function formatDate(d?: Date): string {
  if (!d) return '—'
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function isOverdue(item: WorkItem): boolean {
  if (!item.dueDate || item.status === 'done') return false
  return new Date() > item.dueDate
}

function daysOverdue(item: WorkItem): number {
  if (!item.dueDate) return 0
  const diff = new Date().getTime() - item.dueDate.getTime()
  return Math.ceil(diff / 86400000)
}

// ─── Work Type Metadata ────────────────────────────────────────────────────────

const WORK_TYPE_META: Record<WorkItemType, { label: string; icon: string }> = {
  photography:       { label: 'Photo Shooting',     icon: 'ti-camera' },
  videography:       { label: 'Video Shooting',     icon: 'ti-video' },
  photoEditing:      { label: 'Photo Editing',      icon: 'ti-photo-edit' },
  videoEditing:      { label: 'Video Editing',      icon: 'ti-device-tv' },
  albumDesign:       { label: 'Album Design',       icon: 'ti-layout-2' },
  highlights:        { label: 'Highlights Editing', icon: 'ti-sparkles' },
  fullFilm:          { label: 'Full Film',          icon: 'ti-movie' },
  photoDesigning:    { label: 'Photo Designing',    icon: 'ti-photo-edit' },
  albumDesigning:    { label: 'Album Designing',    icon: 'ti-layout-2' },
  albumCreating:     { label: 'Creating Album',     icon: 'ti-book' },
  highlightsEditing: { label: 'Highlights Editing', icon: 'ti-sparkles' },
  fullVideoEditing:  { label: 'Full Video Editing', icon: 'ti-movie' },
}

const TRACK_BADGE_META: Record<string, { label: string; icon: string }> = {
  photo:     { label: 'Photo',       icon: 'ti-camera' },
  album:     { label: 'Album',       icon: 'ti-book' },
  video:     { label: 'Highlights',  icon: 'ti-sparkles' },
  fullVideo: { label: 'Full Video',  icon: 'ti-movie' },
}

const PRIORITY_COLORS: Record<WorkItemPriority, { bg: string; text: string; label: string }> = {
  high:   { bg: 'var(--color-danger-muted)',    text: 'var(--color-danger)',   label: 'High' },
  medium: { bg: 'var(--color-secondary-muted)', text: 'var(--color-secondary)', label: 'Medium' },
  low:    { bg: 'var(--color-surface-raised)',  text: 'var(--color-foreground-muted)', label: 'Low' },
}

// ─── Bucket Logic ──────────────────────────────────────────────────────────────

type BoardBucket = 'ongoing' | 'pending' | 'upcoming' | 'overdue' | 'completed'

function getBucket(item: WorkItem): BoardBucket {
  if (item.status === 'done') return 'completed'
  if (item.status === 'pending') return 'pending'
  if (isOverdue(item)) return 'overdue'
  if (item.status === 'inProgress' || item.status === 'review') return 'ongoing'
  if (item.status === 'todo') {
    if (item.dueDate && item.dueDate > new Date()) return 'upcoming'
    return 'pending'
  }
  return 'pending'
}

const BUCKET_META: Record<BoardBucket, { label: string; color: string; dot: string; bg: string }> = {
  ongoing:   { label: 'Ongoing',   color: 'var(--color-accent)',    dot: '#5b73f0', bg: 'var(--color-accent-muted)' },
  pending:   { label: 'Pending',   color: 'var(--color-secondary)', dot: '#eca82f', bg: 'var(--color-secondary-muted)' },
  upcoming:  { label: 'Upcoming',  color: 'var(--color-accent)',    dot: '#5b73f0', bg: 'var(--color-accent-muted)' },
  overdue:   { label: 'Overdue',   color: 'var(--color-danger)',    dot: '#ef5350', bg: 'var(--color-danger-muted)' },
  completed: { label: 'Completed', color: 'var(--color-success)',   dot: '#4caf50', bg: 'var(--color-success-muted)' },
}

const BUCKET_ORDER: BoardBucket[] = ['ongoing', 'pending', 'upcoming', 'overdue', 'completed']

// ─── Work Card ─────────────────────────────────────────────────────────────────

function WorkCard({
  item,
  onClick,
  onStatusChange,
}: {
  item: WorkItem
  onClick: () => void
  onStatusChange: (id: string, s: WorkItemStatus) => void
}) {
  const meta     = WORK_TYPE_META[item.type] ?? WORK_TYPE_META.photoEditing
  const priority = PRIORITY_COLORS[item.priority ?? 'medium']
  const overdue  = isOverdue(item)
  const progress = item.progressPercent ?? 0

  const statusOptions: WorkItemStatus[] = ['pending', 'inProgress', 'review', 'done']

  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--color-surface)',
        border: '0.5px solid var(--color-border)',
        borderRadius: '12px',
        padding: '14px',
        marginBottom: '10px',
        cursor: 'pointer',
        transition: 'border-color 0.15s, transform 0.1s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = 'var(--color-border-strong)'
        e.currentTarget.style.transform = 'translateY(-1px)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'var(--color-border)'
        e.currentTarget.style.transform = 'translateY(0)'
      }}
    >
      {/* Top: event name + priority */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-foreground)', lineHeight: 1.3 }}>
          {item.eventName}
        </div>
        <span style={{
          flexShrink: 0,
          fontSize: 'var(--text-xs)',
          fontWeight: 600,
          padding: '2px 8px',
          borderRadius: '20px',
          background: priority.bg,
          color: priority.text,
          fontFamily: 'var(--font-inter)',
        }}>
          {priority.label}
        </span>
      </div>

      {/* Work type + optional track badge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
          <i className={`ti ${meta.icon}`} style={{ fontSize: '13px', color: 'var(--color-foreground-muted)', flexShrink: 0 }} />
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {meta.label}
          </span>
        </div>
        {item.postProdTrackKey && TRACK_BADGE_META[item.postProdTrackKey] && (
          <span style={{
            fontSize: 'var(--text-xs)',
            padding: '1px 6px',
            borderRadius: '4px',
            background: 'var(--color-accent-muted)',
            color: 'var(--color-accent)',
            fontWeight: 600,
            flexShrink: 0,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '3px',
          }}>
            <i className={`ti ${TRACK_BADGE_META[item.postProdTrackKey].icon}`} style={{ fontSize: '10px' }} />
            {TRACK_BADGE_META[item.postProdTrackKey].label}
          </span>
        )}
      </div>

      {/* Assignee */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
        <div style={{
          width: '24px', height: '24px', borderRadius: '50%',
          background: item.isFreelancer ? 'var(--color-purple-muted)' : 'var(--color-primary-muted)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 'var(--text-xs)', fontWeight: 700,
          color: item.isFreelancer ? 'var(--color-purple)' : 'var(--color-primary)',
          flexShrink: 0,
        }}>
          {getInitials(item.assignedToName)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {item.assignedToName}
          </span>
          {item.isFreelancer && (
            <span style={{
              fontSize: '0.62rem',
              padding: '1px 5px',
              borderRadius: '10px',
              background: 'var(--color-purple-muted)',
              color: 'var(--color-purple)',
              fontWeight: 600,
            }}>
              FL
            </span>
          )}
        </div>
      </div>

      {/* Due date + start date + status select */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '10px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0 }}>
          {item.startDate && (
            <span style={{ fontSize: '0.65rem', color: 'var(--color-foreground-subtle)' }}>
              Started {formatDate(item.startDate)}
            </span>
          )}
          <span style={{
            fontSize: 'var(--text-xs)',
            color: overdue ? 'var(--color-danger)' : 'var(--color-foreground-muted)',
            fontWeight: overdue ? 600 : 400,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {item.dueDate ? `Due ${formatDate(item.dueDate)}` : 'No due date'}
            {overdue && ` · ${daysOverdue(item)}d overdue`}
          </span>
        </div>

        {/* Quick status dropdown */}
        <select
          value={item.status}
          onChange={e => {
            e.stopPropagation()
            onStatusChange(item.workItemId, e.target.value as WorkItemStatus)
          }}
          onClick={e => e.stopPropagation()}
          style={{
            fontSize: 'var(--text-xs)',
            background: 'var(--color-surface-raised)',
            border: '0.5px solid var(--color-border)',
            borderRadius: '6px',
            color: 'var(--color-foreground-muted)',
            padding: '2px 6px',
            cursor: 'pointer',
            fontFamily: 'var(--font-inter)',
            outline: 'none',
          }}
        >
          {statusOptions.map(s => (
            <option key={s} value={s}>{s === 'inProgress' ? 'In Progress' : s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
      </div>

      {/* Progress bar */}
      <div style={{ height: '3px', borderRadius: '2px', background: 'var(--color-surface-raised)', overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${progress}%`,
          borderRadius: '2px',
          background: overdue ? 'var(--color-danger)' : item.status === 'done' ? 'var(--color-success)' : 'var(--color-accent)',
          transition: 'width 0.3s ease',
        }} />
      </div>
    </div>
  )
}

// ─── Slide-over Side Panel (Design component match) ────────────────────────────

interface SidePanelProps {
  item: WorkItem | null
  onClose: () => void
  onStatusChange: (id: string, s: WorkItemStatus) => void
  onProgressChange: (id: string, p: number) => void
  onReassign: (id: string, newId: string, newName: string, isFreelancer: boolean) => void
  onUpdateItem?: (updatedItem: WorkItem) => void
  staff: StaffMember[]
  freelancers: Freelancer[]
  isStaff?: boolean
}

function WorkItemSidePanel({
  item,
  onClose,
  onStatusChange,
  onProgressChange,
  onReassign,
  onUpdateItem,
  staff,
  freelancers,
  isStaff = false,
}: SidePanelProps) {
  const [showReassign, setShowReassign] = useState(false)
  const [isEditing, setIsEditing] = useState(false)

  const [prevItemId, setPrevItemId] = useState<string | null>(item?.workItemId ?? null)
  const [editType, setEditType] = useState<WorkItemType>(item?.type ?? 'photography')
  const [editPriority, setEditPriority] = useState<WorkItemPriority>(item?.priority ?? 'medium')
  const [editStatus, setEditStatus] = useState<WorkItemStatus>(item?.status ?? 'todo')
  const [editAssignee, setEditAssignee] = useState<string>(
    item ? (item.isFreelancer ? `fl:${item.assignedToUid}` : `staff:${item.assignedToUid}`) : ''
  )
  const [editEstimatedHours, setEditEstimatedHours] = useState<number>(item?.estimatedHours ?? 6)
  const [editProgress, setEditProgress] = useState<number>(
    item?.progressPercent ?? (item?.status === 'done' ? 100 : item?.status === 'inProgress' ? 50 : 0)
  )
  const [editDueDate, setEditDueDate] = useState<string>(
    item?.dueDate
      ? (item.dueDate instanceof Date ? item.dueDate.toISOString().slice(0, 10) : new Date(item.dueDate).toISOString().slice(0, 10))
      : ''
  )
  const [editNotes, setEditNotes] = useState<string>(item?.notes ?? '')

  if (item && item.workItemId !== prevItemId) {
    setPrevItemId(item.workItemId)
    setEditType(item.type)
    setEditPriority(item.priority ?? 'medium')
    setEditStatus(item.status)
    setEditAssignee(item.isFreelancer ? `fl:${item.assignedToUid}` : `staff:${item.assignedToUid}`)
    setEditEstimatedHours(item.estimatedHours ?? 6)
    setEditProgress(item.progressPercent ?? (item.status === 'done' ? 100 : item.status === 'inProgress' ? 50 : 0))
    setEditDueDate(
      item.dueDate
        ? (item.dueDate instanceof Date ? item.dueDate.toISOString().slice(0, 10) : new Date(item.dueDate).toISOString().slice(0, 10))
        : ''
    )
    setEditNotes(item.notes ?? '')
    setIsEditing(false)
  }

  if (!item) return null

  const meta     = WORK_TYPE_META[item.type] ?? WORK_TYPE_META.photography
  const priority = PRIORITY_COLORS[item.priority ?? 'medium']
  const bucket   = getBucket(item)
  const bucketM  = BUCKET_META[bucket]
  const progress = item.progressPercent ?? (item.status === 'done' ? 100 : item.status === 'inProgress' ? 50 : 0)

  // 4 Standard milestones corresponding to the design
  const milestones = [
    { label: 'Assigned',      status: 'todo' as WorkItemStatus,       percent: 25 },
    { label: 'In progress',   status: 'inProgress' as WorkItemStatus, percent: 50 },
    { label: 'Client review', status: 'review' as WorkItemStatus,     percent: 80 },
    { label: 'Delivered',     status: 'done' as WorkItemStatus,       percent: 100 },
  ]

  const handleMilestoneClick = (targetStatus: WorkItemStatus, percent: number) => {
    onStatusChange(item.workItemId, targetStatus)
    onProgressChange(item.workItemId, percent)
  }

  const handleApplyReassign = (val: string) => {
    if (!val) return
    const [prefix, id] = val.split(':')
    if (prefix === 'staff') {
      const s = staff.find(sm => sm.uid === id)
      if (s) onReassign(item.workItemId, s.uid, s.name, false)
    } else if (prefix === 'fl') {
      const f = freelancers.find(fl => fl.freelancerId === id)
      if (f) onReassign(item.workItemId, f.freelancerId, f.name, true)
    }
    setShowReassign(false)
  }

  const handleSaveEdit = () => {
    if (!item) return
    let newUid = item.assignedToUid
    let newName = item.assignedToName
    let newIsFreelancer = item.isFreelancer

    if (editAssignee) {
      const [prefix, id] = editAssignee.split(':')
      if (prefix === 'staff') {
        const s = staff.find(sm => sm.uid === id)
        if (s) {
          newUid = s.uid
          newName = s.name
          newIsFreelancer = false
        }
      } else if (prefix === 'fl') {
        const f = freelancers.find(fl => fl.freelancerId === id)
        if (f) {
          newUid = f.freelancerId
          newName = f.name
          newIsFreelancer = true
        }
      }
    }

    const isPhoto = ['photography', 'photoEditing', 'albumDesign', 'photoDesigning', 'albumDesigning', 'albumCreating'].includes(editType)

    const updated: WorkItem = {
      ...item,
      type: editType,
      track: isPhoto ? 'photo' : 'video',
      priority: editPriority,
      status: editStatus,
      assignedToUid: newUid,
      assignedToName: newName,
      isFreelancer: newIsFreelancer,
      estimatedHours: Number(editEstimatedHours) || 6,
      progressPercent: Number(editProgress) || 0,
      dueDate: editDueDate ? new Date(editDueDate) : undefined,
      notes: editNotes.trim(),
    }

    onUpdateItem?.(updated)
    setIsEditing(false)
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.5)',
        zIndex: 9998,
        display: 'flex', justifyContent: 'flex-end',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        style={{
          width: '450px',
          maxWidth: '92vw',
          height: '100vh',
          background: 'var(--color-surface)',
          borderLeft: '0.5px solid var(--color-border)',
          boxShadow: '-8px 0 32px rgba(0,0,0,0.35)',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'var(--font-inter)',
          overflowY: 'auto',
          animation: 'slideInRight 0.2s ease-out',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '24px 28px 18px',
          borderBottom: '0.5px solid var(--color-border)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        }}>
          <div>
            <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: 'var(--color-foreground)', margin: 0 }}>
              {isEditing ? `Edit: ${meta.label}` : meta.label}
            </h2>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-foreground-muted)', marginTop: '4px', margin: 0 }}>
              {item.eventName}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {!isStaff && (
              <button
                onClick={() => setIsEditing(!isEditing)}
                style={{
                  background: isEditing ? 'var(--color-primary-muted)' : 'var(--color-surface-raised)',
                  border: `0.5px solid ${isEditing ? 'var(--color-primary)' : 'var(--color-border)'}`,
                  borderRadius: '6px',
                  padding: '6px 12px',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  color: isEditing ? 'var(--color-primary)' : 'var(--color-foreground)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                }}
              >
                <i className={isEditing ? 'ti ti-x' : 'ti ti-edit'} style={{ fontSize: '13px' }} />
                <span>{isEditing ? 'Cancel' : 'Edit'}</span>
              </button>
            )}
            <button
              onClick={onClose}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--color-foreground-muted)', fontSize: '20px', lineHeight: 1, padding: '4px',
              }}
            >
              <i className="ti ti-x" />
            </button>
          </div>
        </div>

        {/* Body */}
        {isEditing ? (
          <div style={{ padding: '24px 28px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '10px 14px',
              background: 'var(--color-primary-muted)',
              borderRadius: '8px',
              border: '0.5px solid var(--color-primary)',
              color: 'var(--color-primary)',
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
            }}>
              <i className="ti ti-edit" style={{ fontSize: '15px' }} />
              <span>Editing Work Item Details</span>
            </div>

            {/* Work Type */}
            <div>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-foreground-muted)', display: 'block', marginBottom: '6px' }}>
                Work Type / Role
              </label>
              <select
                value={editType}
                onChange={e => setEditType(e.target.value as WorkItemType)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: 'var(--color-surface-raised)',
                  border: '0.5px solid var(--color-border)',
                  borderRadius: '8px',
                  color: 'var(--color-foreground)',
                  fontSize: 'var(--text-sm)',
                  fontFamily: 'var(--font-inter)',
                  outline: 'none',
                }}
              >
                <option value="photography">📷 Photo Shooting</option>
                <option value="videography">🎥 Video Shooting</option>
                <option value="photoEditing">🎨 Photo Editing</option>
                <option value="videoEditing">🎬 Video Editing</option>
                <option value="albumDesign">📖 Album Design</option>
                <option value="highlights">✨ Highlights Editing</option>
                <option value="fullFilm">🎞️ Full Film</option>
              </select>
            </div>

            {/* Assignee */}
            <div>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-foreground-muted)', display: 'block', marginBottom: '6px' }}>
                Assignee (Staff or Freelancer)
              </label>
              <select
                value={editAssignee}
                onChange={e => setEditAssignee(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: 'var(--color-surface-raised)',
                  border: '0.5px solid var(--color-border)',
                  borderRadius: '8px',
                  color: 'var(--color-foreground)',
                  fontSize: 'var(--text-sm)',
                  fontFamily: 'var(--font-inter)',
                  outline: 'none',
                }}
              >
                <optgroup label="Permanent Staff">
                  {staff.map(sm => (
                    <option key={sm.uid} value={`staff:${sm.uid}`}>
                      {sm.name} {sm.role ? `(${sm.role})` : ''}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Freelancers">
                  {freelancers.map(fl => (
                    <option key={fl.freelancerId} value={`fl:${fl.freelancerId}`}>
                      {fl.name} ({fl.skill || 'Freelancer'})
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>

            {/* Status & Priority Row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div>
                <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-foreground-muted)', display: 'block', marginBottom: '6px' }}>
                  Status
                </label>
                <select
                  value={editStatus}
                  onChange={e => setEditStatus(e.target.value as WorkItemStatus)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: 'var(--color-surface-raised)',
                    border: '0.5px solid var(--color-border)',
                    borderRadius: '8px',
                    color: 'var(--color-foreground)',
                    fontSize: 'var(--text-sm)',
                    fontFamily: 'var(--font-inter)',
                    outline: 'none',
                  }}
                >
                  <option value="pending">⏸ Pending / Paused</option>
                  <option value="todo">📋 To Do / Assigned</option>
                  <option value="inProgress">▶ In Progress / Ongoing</option>
                  <option value="review">🔍 Client Review</option>
                  <option value="done">✓ Delivered / Completed</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-foreground-muted)', display: 'block', marginBottom: '6px' }}>
                  Priority
                </label>
                <select
                  value={editPriority}
                  onChange={e => setEditPriority(e.target.value as WorkItemPriority)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: 'var(--color-surface-raised)',
                    border: '0.5px solid var(--color-border)',
                    borderRadius: '8px',
                    color: 'var(--color-foreground)',
                    fontSize: 'var(--text-sm)',
                    fontFamily: 'var(--font-inter)',
                    outline: 'none',
                  }}
                >
                  <option value="low">🟢 Low</option>
                  <option value="medium">🟡 Medium</option>
                  <option value="high">🔴 High</option>
                </select>
              </div>
            </div>

            {/* Progress & Effort Row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div>
                <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-foreground-muted)', display: 'block', marginBottom: '6px' }}>
                  Progress ({editProgress}%)
                </label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={editProgress}
                  onChange={e => setEditProgress(Number(e.target.value))}
                  style={{ width: '100%', marginTop: '8px', accentColor: 'var(--color-primary)' }}
                />
              </div>

              <div>
                <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-foreground-muted)', display: 'block', marginBottom: '6px' }}>
                  Estimated Effort (Hours)
                </label>
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={editEstimatedHours}
                  onChange={e => setEditEstimatedHours(Number(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: 'var(--color-surface-raised)',
                    border: '0.5px solid var(--color-border)',
                    borderRadius: '8px',
                    color: 'var(--color-foreground)',
                    fontSize: 'var(--text-sm)',
                    fontFamily: 'var(--font-inter)',
                    outline: 'none',
                  }}
                />
              </div>
            </div>

            {/* Due Date */}
            <div>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-foreground-muted)', display: 'block', marginBottom: '6px' }}>
                Due Date
              </label>
              <input
                type="date"
                value={editDueDate}
                onChange={e => setEditDueDate(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: 'var(--color-surface-raised)',
                  border: '0.5px solid var(--color-border)',
                  borderRadius: '8px',
                  color: 'var(--color-foreground)',
                  fontSize: 'var(--text-sm)',
                  fontFamily: 'var(--font-inter)',
                  outline: 'none',
                }}
              />
            </div>

            {/* Notes / Instructions */}
            <div>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-foreground-muted)', display: 'block', marginBottom: '6px' }}>
                Notes / Scope Instructions
              </label>
              <textarea
                rows={3}
                value={editNotes}
                onChange={e => setEditNotes(e.target.value)}
                placeholder="Add special instructions or client requirements for this work item..."
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: 'var(--color-surface-raised)',
                  border: '0.5px solid var(--color-border)',
                  borderRadius: '8px',
                  color: 'var(--color-foreground)',
                  fontSize: 'var(--text-sm)',
                  fontFamily: 'var(--font-inter)',
                  outline: 'none',
                  resize: 'vertical',
                }}
              />
            </div>

            {/* Save / Cancel Buttons */}
            <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
              <button
                type="button"
                onClick={handleSaveEdit}
                style={{
                  flex: 1,
                  padding: '11px 16px',
                  background: 'var(--color-primary)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: 'var(--text-sm)',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                <i className="ti ti-check" style={{ fontSize: '16px' }} />
                Save Changes
              </button>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                style={{
                  padding: '11px 16px',
                  background: 'var(--color-surface-raised)',
                  color: 'var(--color-foreground)',
                  border: '0.5px solid var(--color-border)',
                  borderRadius: '8px',
                  fontSize: 'var(--text-sm)',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div style={{ padding: '24px 28px', flex: 1, overflowY: 'auto' }}>
            {/* Status & Priority Pills + Track Badge */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                padding: '3px 10px',
                borderRadius: '20px',
                background: bucketM.bg,
                color: bucketM.color,
              }}>
                {bucketM.label}
              </span>
              <span style={{
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                padding: '3px 10px',
                borderRadius: '20px',
                background: priority.bg,
                color: priority.text,
              }}>
                {priority.label}
              </span>
              {item.postProdTrackKey && TRACK_BADGE_META[item.postProdTrackKey] && (
                <span style={{
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  padding: '3px 10px',
                  borderRadius: '20px',
                  background: 'var(--color-accent-muted)',
                  color: 'var(--color-accent)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}>
                  <i className={`ti ${TRACK_BADGE_META[item.postProdTrackKey].icon}`} style={{ fontSize: '11px' }} />
                  {TRACK_BADGE_META[item.postProdTrackKey].label} Track
                </span>
              )}
            </div>

          {/* Paused & Pending Notice Banner */}
          {item.status === 'pending' && (
            <div style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px',
              padding: '12px 16px',
              background: 'var(--color-secondary-muted)',
              border: '0.5px solid var(--color-secondary)',
              borderRadius: '10px',
              marginBottom: '24px',
            }}>
              <i className="ti ti-player-pause" style={{ fontSize: '20px', color: 'var(--color-secondary)', marginTop: '2px' }} />
              <div>
                <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-secondary)' }}>
                  Work is Paused (Pending)
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)', marginTop: '2px', lineHeight: 1.4 }}>
                  This work item has been denoted and moved to Pending status. Click &quot;Resume Work&quot; or change status to move it back to Ongoing.
                </div>
              </div>
            </div>
          )}

          {/* Assignee Card */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '12px',
            background: 'var(--color-surface-raised)',
            border: '0.5px solid var(--color-border)',
            borderRadius: '12px',
            padding: '14px 16px',
            marginBottom: '24px',
          }}>
            <div style={{
              width: '38px', height: '38px', borderRadius: '50%',
              background: item.isFreelancer ? 'var(--color-purple-muted)' : 'var(--color-primary-muted)',
              color: item.isFreelancer ? 'var(--color-purple)' : 'var(--color-primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, fontSize: 'var(--text-sm)',
            }}>
              {getInitials(item.assignedToName)}
            </div>
            <div>
              <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-foreground)' }}>
                {item.assignedToName}
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)', marginTop: '2px' }}>
                {item.isFreelancer ? 'Freelancer · Assigned to' : 'Staff Member · Assigned to'}
              </div>
            </div>
          </div>

          {/* 4-Cell Metadata Grid */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr',
            gap: '16px 20px', marginBottom: '28px',
          }}>
            <div>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)', display: 'block', marginBottom: '4px' }}>
                Event date
              </span>
              <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-foreground)' }}>
                {formatDate(item.eventDate)}
              </span>
            </div>
            <div>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)', display: 'block', marginBottom: '4px' }}>
                Start date
              </span>
              <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-foreground)' }}>
                {item.startDate ? formatDate(item.startDate) : formatDate(item.createdAt)}
              </span>
            </div>
            <div>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)', display: 'block', marginBottom: '4px' }}>
                Due date
              </span>
              <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: isOverdue(item) ? 'var(--color-danger)' : 'var(--color-foreground)' }}>
                {item.dueDate ? formatDate(item.dueDate) : '—'}
              </span>
            </div>
            <div>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)', display: 'block', marginBottom: '4px' }}>
                Effort
              </span>
              <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-foreground)' }}>
                {item.estimatedHours ? `${item.estimatedHours} hrs` : '4 hrs'}
              </span>
            </div>
          </div>

          {/* Progress Section */}
          <div style={{ marginBottom: '28px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)', fontWeight: 500 }}>
                Progress
              </span>
              <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-foreground)' }}>
                {progress}%
              </span>
            </div>
            <div style={{ height: '6px', borderRadius: '3px', background: 'var(--color-surface-raised)', overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${progress}%`,
                background: progress === 100 ? 'var(--color-success)' : 'var(--color-primary)',
                transition: 'width 0.3s ease',
              }} />
            </div>
          </div>

          {/* Milestones Checklist */}
          <div style={{ marginBottom: '28px' }}>
            <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-foreground)', display: 'block', marginBottom: '14px' }}>
              Milestones
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {milestones.map(m => {
                const isSelected = item.status === m.status || (m.status === 'todo' && item.status === 'todo')
                const isPast = progress >= m.percent
                return (
                  <div
                    key={m.label}
                    onClick={() => handleMilestoneClick(m.status, m.percent)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '12px',
                      cursor: 'pointer', userSelect: 'none',
                    }}
                  >
                    <div style={{
                      width: '18px', height: '18px', borderRadius: '50%',
                      border: isPast || isSelected ? '2px solid var(--color-primary)' : '2px solid var(--color-border-strong)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: isPast ? 'var(--color-primary)' : 'transparent',
                      transition: 'all 0.15s ease',
                    }}>
                      {isPast && <i className="ti ti-check" style={{ fontSize: '11px', color: '#ffffff' }} />}
                    </div>
                    <span style={{
                      fontSize: 'var(--text-sm)',
                      color: isPast || isSelected ? 'var(--color-foreground)' : 'var(--color-foreground-muted)',
                      fontWeight: isSelected ? 600 : 400,
                    }}>
                      {m.label}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Activity */}
          <div style={{ marginBottom: '24px' }}>
            <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-foreground)', display: 'block', marginBottom: '8px' }}>
              Activity
            </span>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-foreground-muted)', margin: 0 }}>
              {item.status === 'pending'
                ? `${item.assignedToName} · Work has been denoted and paused in pending state`
                : `${item.assignedToName} is working on this · updated recently`}
            </p>
          </div>

          {/* Pause / Move to Pending Quick Action Button */}
          <div style={{ marginBottom: '24px' }}>
            {item.status === 'pending' ? (
              <button
                type="button"
                onClick={() => onStatusChange(item.workItemId, 'inProgress')}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  background: 'var(--color-primary-muted)',
                  border: '0.5px solid var(--color-primary)',
                  borderRadius: '8px',
                  color: 'var(--color-primary)',
                  fontSize: 'var(--text-sm)',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-inter)',
                  transition: 'background 0.15s ease',
                }}
              >
                <i className="ti ti-player-play" style={{ fontSize: '16px' }} />
                Resume Work (Move to Ongoing)
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onStatusChange(item.workItemId, 'pending')}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  background: 'var(--color-secondary-muted)',
                  border: '0.5px solid var(--color-secondary)',
                  borderRadius: '8px',
                  color: 'var(--color-secondary)',
                  fontSize: 'var(--text-sm)',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-inter)',
                  transition: 'background 0.15s ease',
                }}
              >
                <i className="ti ti-player-pause" style={{ fontSize: '16px' }} />
                Pause Work (Move to Pending)
              </button>
            )}
          </div>

          {/* Change Status Dropdown */}
          <div style={{ marginBottom: '28px' }}>
            <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)', display: 'block', marginBottom: '8px' }}>
              Change status
            </label>
            <select
              value={item.status}
              onChange={e => onStatusChange(item.workItemId, e.target.value as WorkItemStatus)}
              style={{
                width: '100%',
                padding: '10px 14px',
                background: 'var(--color-surface-raised)',
                border: '0.5px solid var(--color-border)',
                borderRadius: '8px',
                color: 'var(--color-foreground)',
                fontSize: 'var(--text-sm)',
                fontFamily: 'var(--font-inter)',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="pending">⏸ Pending / Paused</option>
              <option value="inProgress">▶ Ongoing / In Progress</option>
              <option value="review">🔍 Client Review</option>
              <option value="done">✓ Delivered / Completed</option>
            </select>
          </div>

          {/* Inline Reassign Picker */}
          {showReassign && (
            <div style={{
              background: 'var(--color-surface-raised)',
              border: '0.5px solid var(--color-border)',
              borderRadius: '10px',
              padding: '14px',
              marginBottom: '20px',
            }}>
              <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)', display: 'block', marginBottom: '8px' }}>
                Select new assignee (Staff or Freelancer):
              </label>
              <select
                defaultValue=""
                onChange={e => handleApplyReassign(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: 'var(--color-surface)',
                  border: '0.5px solid var(--color-border)',
                  borderRadius: '6px',
                  color: 'var(--color-foreground)',
                  fontSize: 'var(--text-sm)',
                  fontFamily: 'var(--font-inter)',
                  outline: 'none',
                }}
              >
                <option value="">Choose team member…</option>
                <optgroup label="Staff Members">
                  {staff.map(s => (
                    <option key={s.uid} value={`staff:${s.uid}`}>{s.name} ({s.jobTitle || 'Staff'})</option>
                  ))}
                </optgroup>
                <optgroup label="Freelancers">
                  {freelancers.map(f => (
                    <option key={f.freelancerId} value={`fl:${f.freelancerId}`}>{f.name} ({f.skill})</option>
                  ))}
                </optgroup>
              </select>
            </div>
          )}
        </div>
        )}

        {/* Bottom Actions Bar */}
        {!isEditing && (
          <div style={{
            padding: '16px 28px',
            borderTop: '0.5px solid var(--color-border)',
            display: isStaff ? 'block' : 'grid',
            gridTemplateColumns: isStaff ? undefined : '1fr 1fr',
            gap: '12px',
            background: 'var(--color-surface)',
          }}>
            {!isStaff && (
              <Button
                variant="outline"
                onClick={() => setShowReassign(prev => !prev)}
                style={{
                  background: showReassign ? 'var(--color-surface-raised)' : 'transparent',
                  border: '0.5px solid var(--color-border)',
                  color: 'var(--color-foreground)',
                  borderRadius: '8px',
                  fontFamily: 'var(--font-inter)',
                  fontSize: 'var(--text-sm)',
                  fontWeight: 500,
                  cursor: 'pointer',
                  padding: '10px',
                }}
              >
                {showReassign ? 'Cancel' : 'Reassign'}
              </Button>
            )}

            <Button
              onClick={onClose}
              style={{
                width: isStaff ? '100%' : undefined,
                background: 'var(--color-primary)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontFamily: 'var(--font-inter)',
                fontSize: 'var(--text-sm)',
                fontWeight: 600,
                cursor: 'pointer',
                padding: '10px',
              }}
            >
              Done
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Create Work Modal ─────────────────────────────────────────────────────────

interface CreateModalProps {
  onClose:          () => void
  projects:         Project[]
  staff:            StaffMember[]
  freelancers:      Freelancer[]
  createdBy:        string
  initialAssignee?: { id: string; isFreelancer: boolean }
  onWorkCreated:    (item: WorkItem) => void
  onWorkIdResolved?: (tempId: string, realId: string) => void
}

function CreateWorkModal({
  onClose,
  projects,
  staff,
  freelancers,
  createdBy,
  initialAssignee,
  onWorkCreated,
  onWorkIdResolved,
}: CreateModalProps) {
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState<string | null>(null)

  const defaultAssigneeVal = initialAssignee
    ? (initialAssignee.isFreelancer ? `fl:${initialAssignee.id}` : `staff:${initialAssignee.id}`)
    : (staff[0] ? `staff:${staff[0].uid}` : '')

  const [form, setForm] = useState({
    projectId:    projects[0]?.projectId ?? '',
    type:         'photoEditing' as WorkItemType,
    track:        'photo' as WorkTrack,
    assigneeVal:  defaultAssigneeVal,
    priority:     'medium' as WorkItemPriority,
    startDate:    '',
    dueDate:      '',
    estimatedHours: '4',
    notes:        '',
  })

  const selectedProject = projects.find(p => p.projectId === form.projectId)

  // Parse assignee
  const isFreelancer = form.assigneeVal.startsWith('fl:')
  const rawAssigneeId = form.assigneeVal.replace(/^(staff|fl):/, '')
  const staffMember  = !isFreelancer ? staff.find(s => s.uid === rawAssigneeId) : undefined
  const flMember     = isFreelancer ? freelancers.find(f => f.freelancerId === rawAssigneeId) : undefined
  const assigneeName = staffMember?.name ?? flMember?.name ?? 'Assigned Team'

  const handleTypeChange = (type: WorkItemType) => {
    const photoTypes: WorkItemType[] = ['photography', 'photoEditing', 'albumDesign']
    setForm(f => ({ ...f, type, track: photoTypes.includes(type) ? 'photo' : 'video' }))
  }

  const handleSubmit = async () => {
    if (!form.projectId || !form.assigneeVal) {
      setError('Please select an event and assign to a team member.')
      return
    }
    setSaving(true)
    setError(null)

    const eventDate = selectedProject?.eventDate ? new Date(selectedProject.eventDate) : new Date()
    const startDate = form.startDate ? new Date(form.startDate + 'T00:00:00') : undefined
    const dueDate   = form.dueDate   ? new Date(form.dueDate + 'T00:00:00')   : undefined

    const optimisticId = `work-${form.projectId}-${rawAssigneeId}-${form.type}`
    const optimisticItem: WorkItem = {
      workItemId:      optimisticId,
      projectId:       form.projectId,
      clientId:        selectedProject?.clientId ?? '',
      eventDate,
      eventName:       selectedProject?.eventName ?? 'Assigned Work',
      clientName:      selectedProject?.clientName ?? '',
      type:            form.type,
      track:           form.track,
      assignedToUid:   rawAssigneeId,
      assignedToName:  assigneeName,
      isFreelancer,
      status:          'pending',
      priority:        form.priority,
      estimatedHours:  form.estimatedHours ? parseFloat(form.estimatedHours) : 4,
      progressPercent: 0,
      startDate,
      dueDate,
      notes:           form.notes || undefined,
      createdBy,
      createdAt:       new Date(),
    }

    onWorkCreated(optimisticItem)

    // Save to Firestore
    try {
      const data: CreateWorkItemData = {
        projectId:       form.projectId,
        clientId:        selectedProject?.clientId ?? '',
        eventDate,
        eventName:       selectedProject?.eventName ?? '',
        clientName:      selectedProject?.clientName ?? '',
        type:            form.type,
        track:           form.track,
        assignedToUid:   rawAssigneeId,
        assignedToName:  assigneeName,
        isFreelancer,
        status:          'pending',
        priority:        form.priority,
        estimatedHours:  form.estimatedHours ? parseFloat(form.estimatedHours) : undefined,
        startDate,
        dueDate,
        notes:           form.notes || undefined,
        createdBy,
      }
      const newDocId = await createWorkItem(data)
      if (newDocId) {
        onWorkIdResolved?.(optimisticId, newDocId)
      }

      // Sync assignment to project so it reflects on the Event Board
      if (form.projectId) {
        if (isFreelancer) {
          await assignFreelancerToProject(
            form.projectId,
            rawAssigneeId,
            { role: form.type, days: 1, dayRate: flMember?.dayRate || 6000 },
            selectedProject?.clientId
          ).catch(() => {})
        } else {
          await assignStaffToProject(form.projectId, rawAssigneeId, selectedProject?.clientId).catch(() => {})
        }
      }
      onClose()
    } catch (err) {
      console.error('Failed to create work item in Firestore:', err)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    background: 'var(--color-surface-raised)',
    border: '0.5px solid var(--color-border)',
    color: 'var(--color-foreground)',
    borderRadius: '8px',
    fontSize: 'var(--text-sm)',
    fontFamily: 'var(--font-inter)',
    padding: '8px 12px',
    width: '100%',
    outline: 'none',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 'var(--text-xs)',
    fontWeight: 500,
    color: 'var(--color-foreground-muted)',
    display: 'block',
    marginBottom: '6px',
    fontFamily: 'var(--font-inter)',
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.7)',
        zIndex: 9999, display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        padding: '24px',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'var(--color-surface-overlay)',
        border: '0.5px solid var(--color-border)',
        borderRadius: '16px',
        padding: '28px',
        width: '100%',
        maxWidth: '640px',
        maxHeight: '90vh',
        overflowY: 'auto',
        fontFamily: 'var(--font-inter)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
          <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 600, color: 'var(--color-foreground)' }}>
            Create Work
          </h2>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--color-foreground-muted)', fontSize: '20px', lineHeight: 1,
          }}>
            <i className="ti ti-x" />
          </button>
        </div>

        {error && (
          <div style={{
            background: 'var(--color-danger-muted)',
            border: '0.5px solid var(--color-danger)',
            color: 'var(--color-danger)',
            borderRadius: '8px',
            padding: '10px 14px',
            fontSize: 'var(--text-xs)',
            marginBottom: '16px',
          }}>
            {error}
          </div>
        )}

        {/* Assign to existing event */}
        <div style={{ marginBottom: '20px' }}>
          <label style={labelStyle}>Assign to Existing Event</label>
          <select
            value={form.projectId}
            onChange={e => setForm(f => ({ ...f, projectId: e.target.value }))}
            style={{ ...inputStyle, appearance: 'none' }}
          >
            <option value="">Select a project…</option>
            {projects.map(p => (
              <option key={p.projectId} value={p.projectId}>
                {p.eventName} — {p.clientName}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
          {/* Work Type */}
          <div>
            <label style={labelStyle}>Work Type</label>
            <select
              value={form.type}
              onChange={e => handleTypeChange(e.target.value as WorkItemType)}
              style={{ ...inputStyle, appearance: 'none' }}
            >
              {(Object.keys(WORK_TYPE_META) as WorkItemType[]).map(t => (
                <option key={t} value={t}>{WORK_TYPE_META[t].label}</option>
              ))}
            </select>
          </div>
          {/* Priority */}
          <div>
            <label style={labelStyle}>Priority</label>
            <select
              value={form.priority}
              onChange={e => setForm(f => ({ ...f, priority: e.target.value as WorkItemPriority }))}
              style={{ ...inputStyle, appearance: 'none' }}
            >
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
          {/* Start Date */}
          <div>
            <label style={labelStyle}>Start Date</label>
            <Input
              type="date"
              value={form.startDate}
              onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
              style={{ ...inputStyle }}
            />
          </div>
          {/* Due Date */}
          <div>
            <label style={labelStyle}>Due Date</label>
            <Input
              type="date"
              value={form.dueDate}
              onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))}
              style={{ ...inputStyle }}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
          {/* Assign To (Staff + Freelancers) */}
          <div>
            <label style={labelStyle}>Assign To (Staff or Freelancer)</label>
            <select
              value={form.assigneeVal}
              onChange={e => setForm(f => ({ ...f, assigneeVal: e.target.value }))}
              style={{ ...inputStyle, appearance: 'none' }}
            >
              <option value="">Select team member…</option>
              <optgroup label="Staff Members">
                {staff.map(s => (
                  <option key={s.uid} value={`staff:${s.uid}`}>{s.name} — {s.jobTitle || 'Staff'}</option>
                ))}
              </optgroup>
              <optgroup label="Freelancers">
                {freelancers.map(f => (
                  <option key={f.freelancerId} value={`fl:${f.freelancerId}`}>{f.name} — {f.skill} (Freelancer)</option>
                ))}
              </optgroup>
            </select>
          </div>
          {/* Est. Effort */}
          <div>
            <label style={labelStyle}>Est. Effort (hrs)</label>
            <Input
              type="number"
              value={form.estimatedHours}
              min={0.5}
              step={0.5}
              onChange={e => setForm(f => ({ ...f, estimatedHours: e.target.value }))}
              style={{ ...inputStyle }}
            />
          </div>
        </div>

        {/* Notes */}
        <div style={{ marginBottom: '24px' }}>
          <label style={labelStyle}>Notes</label>
          <textarea
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            placeholder="Optional notes…"
            rows={3}
            style={{
              ...inputStyle,
              resize: 'vertical',
              minHeight: '80px',
            }}
          />
        </div>

        {/* Selected Assignee preview */}
        {form.assigneeVal && (
          <div style={{
            background: 'var(--color-surface-raised)',
            border: '0.5px solid var(--color-border)',
            borderRadius: '10px',
            padding: '12px 16px',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}>
            <div style={{
              width: '32px', height: '32px', borderRadius: '50%',
              background: isFreelancer ? 'var(--color-purple-muted)' : 'var(--color-primary-muted)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 'var(--text-xs)', fontWeight: 600,
              color: isFreelancer ? 'var(--color-purple)' : 'var(--color-primary)',
            }}>
              {getInitials(assigneeName)}
            </div>
            <div>
              <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--color-foreground)' }}>
                {assigneeName}
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>
                {isFreelancer ? `Freelancer (${flMember?.skill || 'Contractor'})` : (staffMember?.jobTitle ?? 'Staff Member')}
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <Button variant="outline" onClick={onClose} disabled={saving}
            style={{
              background: 'transparent',
              border: '0.5px solid var(--color-border)',
              color: 'var(--color-foreground)',
              borderRadius: '8px',
              fontFamily: 'var(--font-inter)',
              fontSize: 'var(--text-sm)',
              cursor: 'pointer',
            }}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={saving || !form.projectId || !form.assigneeVal}
            style={{
              background: 'var(--color-primary)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontFamily: 'var(--font-inter)',
              fontSize: 'var(--text-sm)',
              cursor: 'pointer',
              opacity: (saving || !form.projectId || !form.assigneeVal) ? 0.5 : 1,
            }}>
            {saving ? 'Creating…' : 'Create Work'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Staff/Freelancer Row ──────────────────────────────────────────────────────

interface TeamRowProps {
  personId: string
  name: string
  roleSubtitle: string
  isFreelancer: boolean
  items: WorkItem[]
}

function TeamMemberRow({ personId, name, roleSubtitle, isFreelancer, items }: TeamRowProps) {
  const myActiveItems = items.filter(w => w.assignedToUid === personId && w.status !== 'done')
  const current       = myActiveItems.find(w => w.status === 'inProgress') ?? myActiveItems[0] ?? items.find(w => w.assignedToUid === personId)
  const upcoming      = myActiveItems.filter(w => w.workItemId !== current?.workItemId)[0]

  const workloadScore = myActiveItems.length
  const workload = workloadScore === 0 ? 'Low' : workloadScore <= 2 ? 'Low' : workloadScore <= 4 ? 'Normal' : 'High'
  const wlColor  = workload === 'High' ? 'var(--color-danger)' : workload === 'Normal' ? 'var(--color-accent)' : 'var(--color-success)'

  return (
    <tr style={{ borderBottom: '0.5px solid var(--color-border)' }}>
      {/* Name + avatar */}
      <td style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0,
            background: isFreelancer ? 'var(--color-purple-muted)' : 'var(--color-primary-muted)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 'var(--text-xs)', fontWeight: 700,
            color: isFreelancer ? 'var(--color-purple)' : 'var(--color-primary)',
          }}>
            {getInitials(name)}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--color-foreground)' }}>{name}</span>
              {isFreelancer && (
                <span style={{
                  fontSize: '0.62rem',
                  padding: '1px 5px',
                  borderRadius: '10px',
                  background: 'var(--color-purple-muted)',
                  color: 'var(--color-purple)',
                  fontWeight: 600,
                }}>
                  FL
                </span>
              )}
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>{roleSubtitle}</div>
          </div>
        </div>
      </td>
      {/* Current */}
      <td style={{ padding: '12px 16px' }}>
        {current ? (
          <div>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-foreground)', fontWeight: 500 }}>
              {WORK_TYPE_META[current.type]?.label ?? current.type}
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: isOverdue(current) ? 'var(--color-danger)' : 'var(--color-foreground-muted)' }}>
              {current.status === 'done' ? 'Completed' : `${current.progressPercent ?? 0}% · due ${formatDate(current.dueDate)}`}
              {isOverdue(current) && ' (overdue)'}
            </div>
          </div>
        ) : (
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-success)' }}>Available</span>
        )}
      </td>
      {/* Upcoming */}
      <td style={{ padding: '12px 16px' }}>
        {upcoming ? (
          <div>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-foreground)' }}>
              {WORK_TYPE_META[upcoming.type]?.label ?? upcoming.type}
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>
              {formatDate(upcoming.dueDate)}
            </div>
          </div>
        ) : (
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>None scheduled</span>
        )}
      </td>
      {/* Workload */}
      <td style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: 'var(--text-xs)', color: wlColor, fontWeight: 600 }}>● {workload}</span>
          <div style={{ width: '64px', height: '4px', borderRadius: '2px', background: 'var(--color-surface-raised)', overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: '2px', background: wlColor,
              width: workload === 'High' ? '100%' : workload === 'Normal' ? '60%' : '25%',
            }} />
          </div>
        </div>
      </td>
      {/* Availability */}
      <td style={{ padding: '12px 16px' }}>
        <span style={{
          fontSize: 'var(--text-xs)',
          color: myActiveItems.length === 0 ? 'var(--color-success)' : 'var(--color-foreground-muted)',
          fontWeight: 500,
        }}>
          {myActiveItems.length === 0 ? 'Available now' : 'Busy'}
        </span>
      </td>
    </tr>
  )
}

// ─── Available Card ────────────────────────────────────────────────────────────

function AvailablePersonCard({
  name,
  roleSubtitle,
  isFreelancer,
  onAssign,
}: {
  name: string
  roleSubtitle: string
  isFreelancer: boolean
  onAssign: () => void
}) {
  return (
    <div style={{
      background: 'var(--color-surface)',
      border: '0.5px solid var(--color-border)',
      borderRadius: '12px',
      padding: '20px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '12px',
      textAlign: 'center',
    }}>
      <div style={{
        width: '48px', height: '48px', borderRadius: '50%',
        background: isFreelancer ? 'var(--color-purple-muted)' : 'var(--color-primary-muted)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 'var(--text-lg)', fontWeight: 700,
        color: isFreelancer ? 'var(--color-purple)' : 'var(--color-primary)',
      }}>
        {getInitials(name)}
      </div>
      <div>
        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-foreground)' }}>
          {name}
        </div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)', marginTop: '2px' }}>
          {roleSubtitle}
        </div>
        <div style={{
          marginTop: '6px',
          display: 'inline-block',
          fontSize: 'var(--text-xs)',
          fontWeight: 600,
          padding: '2px 8px',
          borderRadius: '20px',
          background: 'var(--color-success-muted)',
          color: 'var(--color-success)',
        }}>
          Available now
        </div>
      </div>
      <Button
        onClick={onAssign}
        style={{
          width: '100%',
          background: 'transparent',
          border: '0.5px solid var(--color-border)',
          color: 'var(--color-foreground)',
          borderRadius: '8px',
          fontSize: 'var(--text-sm)',
          fontFamily: 'var(--font-inter)',
          cursor: 'pointer',
          padding: '8px',
        }}
      >
        Assign Work
      </Button>
    </div>
  )
}

// ─── Main Unified Work Board Page ──────────────────────────────────────────────

type TabKey = 'board' | 'staff' | 'available'

export default function WorkBoardPage() {
  const appUser = useAuthStore(s => s.appUser)
  const testDatasetMode = useUIStore(s => s.testDatasetMode)
  const testModeCutoff = useUIStore(s => s.testModeCutoff)

  const isStaff = appUser?.role === 'staff'

  const [tab, setTab]                               = useState<TabKey>('board')
  const activeTab: TabKey                           = isStaff ? 'board' : tab
  const [workItems, setWorkItems]                   = useState<WorkItem[]>([])
  const [localItems, setLocalItems]                 = useState<WorkItem[]>([])
  const [projects, setProjects]                     = useState<Project[]>([])
  const [staff, setStaff]                           = useState<StaffMember[]>([])
  const [freelancers, setFreelancers]               = useState<Freelancer[]>([])
  const [assignments, setAssignments]               = useState<StaffAssignment[]>([])
  const [showCreate, setShowCreate]                 = useState(false)
  const [createAssignee, setCreateAssignee]         = useState<{ id: string; isFreelancer: boolean } | undefined>()
  const [selectedPanelItem, setSelectedPanelItem]   = useState<WorkItem | null>(null)

  const effectiveStaff = useMemo<StaffMember[]>(() => {
    if (isStaff && appUser) {
      return [{
        uid: appUser.uid,
        name: appUser.name,
        email: appUser.email,
        role: 'staff',
        isActive: true,
      }]
    }
    return staff
  }, [isStaff, appUser, staff])

  // Filters
  const [filterStaff,    setFilterStaff]    = useState('')
  const [filterStatus,   setFilterStatus]   = useState<WorkItemStatus | ''>('')
  const [filterPriority, setFilterPriority] = useState<WorkItemPriority | ''>('')
  const [filterType,     setFilterType]     = useState<WorkItemType | ''>('')

  // Real-time subscriptions
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('studio_zoom_demo_projects')
      } catch {}
    }

    const unsub1 = subscribeToWorkItems(items => {
      setWorkItems(items || [])
      if (items && items.length > 0) {
        setLocalItems(prev => prev.filter(local => !items.some(w => w.workItemId === local.workItemId)))
      }
    })

    const unsub2 = subscribeToProjects(projs => {
      setProjects(projs || [])
    })

    let unsub3 = () => {}
    let unsub4 = () => {}

    if (appUser?.role === 'admin' || appUser?.role === 'manager') {
      unsub3 = subscribeToStaff(team => {
        setStaff(team || [])
      })

      unsub4 = subscribeToFreelancers(list => {
        setFreelancers(list || [])
      })
    }

    const unsub5 = subscribeToAllStaffAssignments(list => {
      setAssignments(list || [])
    })

    const handleStorageSync = () => {}
    window.addEventListener('studio_zoom_projects_changed', handleStorageSync)

    return () => {
      unsub1()
      unsub2()
      unsub3()
      unsub4()
      unsub5()
      window.removeEventListener('studio_zoom_projects_changed', handleStorageSync)
    }
  }, [testDatasetMode, testModeCutoff, appUser?.role, appUser?.uid, appUser?.name, appUser?.email])

  // ─── Unified allWorkItems (explicit items + synthesized assignments) ─────────
  const allWorkItems = useMemo(() => {
    const getAssigneeName = (uid: string): { name: string; isFreelancer: boolean } => {
      const s = effectiveStaff.find(sm => sm.uid === uid)
      if (s) return { name: s.name, isFreelancer: false }
      const f = freelancers.find(fl => fl.freelancerId === uid)
      if (f) return { name: f.name, isFreelancer: true }
      return { name: uid, isFreelancer: false }
    }

    // 1. Base on real Firestore workItems, overlaying any pending optimistic edits
    const combined: WorkItem[] = workItems.map(item => {
      const local = localItems.find(l => l.workItemId === item.workItemId)
      return local ? { ...item, ...local } : item
    })

    // 2. Add localItems that are purely optimistic (e.g. newly created before Firestore snapshot)
    for (const local of localItems) {
      if (!combined.some(c => c.workItemId === local.workItemId)) {
        combined.push(local)
      }
    }

    // Reconcile items with parent project and post-production progress
    for (let i = 0; i < combined.length; i++) {
      const item = combined[i]
      const proj = projects.find(p => p.projectId === item.projectId)
      if (!proj) continue

      // For post-production items, track stage progress is the source of truth!
      if (item.postProdTrackKey && item.postProdStageKey && proj.postProduction) {
        const pp = proj.postProduction
        let newStatus: WorkItemStatus = item.status
        let newProgress: number = item.progressPercent ?? 0

        const getStageWorkStatus = (stageStatus?: PostProdStageStatus, clientReviewStatus?: string): { status: WorkItemStatus; progressPercent: number } => {
          if (stageStatus === 'completed' || stageStatus === 'approved') return { status: 'done', progressPercent: 100 }
          if (stageStatus === 'waitingClient' || clientReviewStatus === 'waitingClient') return { status: 'review', progressPercent: 80 }
          if (stageStatus === 'inProgress') return { status: 'inProgress', progressPercent: 50 }
          return { status: 'pending', progressPercent: 0 }
        }

        if (item.postProdTrackKey === 'photoTrack' && pp.photoTrack) {
          const pt = pp.photoTrack
          if (pt.status === 'completed' || pt.designing?.status === 'completed' || pt.designing?.status === 'approved') {
            newStatus = 'done'
            newProgress = 100
          } else {
            const mapped = getStageWorkStatus(pt.designing?.status, pt.clientReview?.status)
            newStatus = mapped.status
            newProgress = mapped.progressPercent
          }
        } else if (item.postProdTrackKey === 'albumTrack' && pp.albumTrack) {
          const at = pp.albumTrack
          if (at.status === 'completed') {
            newStatus = 'done'
            newProgress = 100
          } else if (item.postProdStageKey === 'albumDesigning') {
            const mapped = getStageWorkStatus(at.albumDesigning?.status, at.clientReview?.status)
            newStatus = mapped.status
            newProgress = mapped.progressPercent
          } else if (item.postProdStageKey === 'creatingAlbum') {
            const mapped = getStageWorkStatus(at.creatingAlbum?.status)
            newStatus = mapped.status
            newProgress = mapped.progressPercent
          }
        } else if (item.postProdTrackKey === 'videoTrack' && pp.videoTrack) {
          const vt = pp.videoTrack
          if (vt.status === 'completed' || vt.highlights?.status === 'completed' || vt.highlights?.status === 'approved') {
            newStatus = 'done'
            newProgress = 100
          } else {
            const mapped = getStageWorkStatus(vt.highlights?.status, vt.clientReview?.status)
            newStatus = mapped.status
            newProgress = mapped.progressPercent
          }
        } else if (item.postProdTrackKey === 'fullVideoTrack' && pp.fullVideoTrack) {
          const fvt = pp.fullVideoTrack
          if (fvt.status === 'completed' || fvt.fullVideoEditing?.status === 'completed' || fvt.fullVideoEditing?.status === 'approved') {
            newStatus = 'done'
            newProgress = 100
          } else {
            const mapped = getStageWorkStatus(fvt.fullVideoEditing?.status, fvt.clientReview?.status)
            newStatus = mapped.status
            newProgress = mapped.progressPercent
          }
        }

        if (newStatus !== item.status || newProgress !== item.progressPercent) {
          combined[i] = { ...item, status: newStatus, progressPercent: newProgress }
          if (!item.workItemId.startsWith('postprod-') && !item.workItemId.startsWith('assign-') && !item.workItemId.startsWith('proj-')) {
            updateWorkItemStatus(item.workItemId, newStatus).catch(() => {})
          }
        }
      } else if (!item.postProdTrackKey && proj.stage === 'delivered' && item.status !== 'done') {
        combined[i] = { ...item, status: 'done', progressPercent: 100 }
      }
    }

    // 2. Add from staffAssignments collection
    for (const a of assignments) {
      if (testDatasetMode && !projects.some(p => p.projectId === a.projectId)) continue
      const exists = combined.some(
        w => w.projectId === a.projectId && w.assignedToUid === a.staffUid
      )
      if (!exists) {
        const proj = projects.find(p => p.projectId === a.projectId)
        const eventDate = proj?.eventDate || (a.eventDate ? new Date(a.eventDate) : new Date())
        const roleToType: Record<string, WorkItemType> = {
          photographer: 'photography',
          videographer: 'videography',
          editor:       'photoEditing',
          designer:     'albumDesign',
          assistant:    'photography',
          drone:        'videography',
        }
        const itemType = roleToType[a.role] || 'photoEditing'
        const isPhoto = ['photographer', 'editor', 'designer', 'assistant'].includes(a.role)

        let status: WorkItemStatus = 'pending'
        if (proj?.stage === 'delivered') status = 'done'
        else if (proj?.stage === 'postProduction' || proj?.stage === 'eventDay' || proj?.stage === 'preProduction') status = 'inProgress'
        else status = 'pending'

        const assigneeInfo = getAssigneeName(a.staffUid)

        combined.push({
          workItemId:     `assign-${a.assignmentId || a.projectId + '-' + a.staffUid}`,
          projectId:      a.projectId,
          clientId:       a.clientId || proj?.clientId || '',
          eventDate,
          eventName:      proj?.eventName || 'Assigned Event',
          clientName:     proj?.clientName || 'Client',
          type:           itemType,
          track:          isPhoto ? 'photo' : 'video',
          assignedToUid:  a.staffUid,
          assignedToName: a.staffName || assigneeInfo.name,
          isFreelancer:   assigneeInfo.isFreelancer,
          status,
          priority:       'medium',
          estimatedHours: 6,
          progressPercent: status === 'done' ? 100 : status === 'inProgress' ? 50 : 0,
          dueDate:        eventDate,
          createdBy:      'system',
          createdAt:      a.createdAt || eventDate,
        })
      }
    }

    // 3. Add from project.staffUids (every staff member assigned to an event on the event board)
    for (const p of projects) {
      if (!Array.isArray(p.staffUids)) continue
      for (const staffUid of p.staffUids) {
        if (!staffUid) continue
        const exists = combined.some(
          w => w.projectId === p.projectId && w.assignedToUid === staffUid
        )
        if (!exists) {
          let status: WorkItemStatus = 'pending'
          if (p.stage === 'delivered') status = 'done'
          else if (p.stage === 'postProduction' || p.stage === 'eventDay' || p.stage === 'preProduction') status = 'inProgress'
          else status = 'pending'

          const staffMember = effectiveStaff.find(sm => sm.uid === staffUid)
          const isVideoStaff = staffMember?.role?.toLowerCase().includes('video')
          const type: WorkItemType = isVideoStaff ? 'videography' : 'photography'
          const track: WorkTrack   = isVideoStaff ? 'video' : 'photo'
          const assigneeInfo = getAssigneeName(staffUid)

          combined.push({
            workItemId:     `proj-staff-${p.projectId}-${staffUid}`,
            projectId:      p.projectId,
            clientId:       p.clientId || '',
            eventDate:      p.eventDate,
            eventName:      p.eventName,
            clientName:     p.clientName,
            type,
            track,
            assignedToUid:  staffUid,
            assignedToName: assigneeInfo.name,
            isFreelancer:   false,
            status,
            priority:       'medium',
            estimatedHours: 6,
            progressPercent: status === 'done' ? 100 : status === 'inProgress' ? 50 : 0,
            dueDate:        p.eventDate,
            createdBy:      p.createdBy || 'system',
            createdAt:      p.createdAt || new Date(),
          })
        }
      }
    }

    // 4. Add from project.freelancerIds (every freelancer assigned to an event on the event board or freelancer page)
    for (const p of projects) {
      if (!Array.isArray(p.freelancerIds)) continue
      for (const flId of p.freelancerIds) {
        if (!flId) continue
        const exists = combined.some(
          w => w.projectId === p.projectId && w.assignedToUid === flId
        )
        if (!exists) {
          let status: WorkItemStatus = 'pending'
          if (p.stage === 'delivered') status = 'done'
          else if (p.stage === 'postProduction' || p.stage === 'eventDay' || p.stage === 'preProduction') status = 'inProgress'
          else status = 'pending'

          const fl = freelancers.find(f => f.freelancerId === flId)
          const flName = fl?.name || flId
          const skillToType: Record<string, WorkItemType> = {
            photographer: 'photography',
            videographer: 'videography',
            editor:       'photoEditing',
            designer:     'albumDesign',
          }
          const type: WorkItemType = (fl && skillToType[fl.skill]) || 'videography'
          const track: WorkTrack   = ['photographer', 'editor', 'designer'].includes(fl?.skill || '') ? 'photo' : 'video'

          combined.push({
            workItemId:     `proj-fl-${p.projectId}-${flId}`,
            projectId:      p.projectId,
            clientId:       p.clientId || '',
            eventDate:      p.eventDate,
            eventName:      p.eventName,
            clientName:     p.clientName,
            type,
            track,
            assignedToUid:  flId,
            assignedToName: flName,
            isFreelancer:   true,
            status,
            priority:       'medium',
            estimatedHours: 6,
            progressPercent: status === 'done' ? 100 : status === 'inProgress' ? 50 : 0,
            dueDate:        p.eventDate,
            createdBy:      p.createdBy || 'system',
            createdAt:      p.createdAt || new Date(),
          })
        }
      }
    }

    // 5. Add post-production track work items if not already present
    for (const p of projects) {
      if (!p.postProduction?.isConfigured) continue
      const pp = p.postProduction

      const getStageWorkStatus = (stageStatus?: PostProdStageStatus, clientReviewStatus?: string): { status: WorkItemStatus; progressPercent: number } => {
        if (stageStatus === 'completed' || stageStatus === 'approved') return { status: 'done', progressPercent: 100 }
        if (clientReviewStatus === 'waitingClient' || stageStatus === 'waitingClient') return { status: 'review', progressPercent: 80 }
        if (stageStatus === 'inProgress') return { status: 'inProgress', progressPercent: 50 }
        return { status: 'pending', progressPercent: 0 }
      }

      // Photo Track -> photoDesigning
      if (pp.photoTrack) {
        const pt = pp.photoTrack
        const exists = combined.some(w => w.projectId === p.projectId && w.postProdTrackKey === 'photoTrack')
        if (!exists) {
          const isFree = Boolean(pt.assignment.freelancerId)
          const assigneeUid = isFree ? (pt.assignment.freelancerId || '') : pt.assignment.staffUid
          const assigneeName = isFree ? (pt.assignment.freelancerName || '') : pt.assignment.staffName
          const st = pt.status === 'completed'
            ? { status: 'done' as WorkItemStatus, progressPercent: 100 }
            : getStageWorkStatus(pt.designing?.status, pt.clientReview?.status)
          combined.push({
            workItemId: `postprod-${p.projectId}-photoTrack-designing`,
            projectId: p.projectId,
            clientId: p.clientId || '',
            eventDate: p.eventDate,
            eventName: p.eventName,
            clientName: p.clientName,
            type: 'photoDesigning',
            track: 'photo',
            assignedToUid: assigneeUid,
            assignedToName: assigneeName,
            isFreelancer: isFree,
            status: st.status,
            priority: 'medium',
            estimatedHours: 6,
            progressPercent: st.progressPercent,
            dueDate: pt.designing?.dueDate,
            postProdTrackKey: 'photoTrack',
            postProdStageKey: 'designing',
            createdBy: 'system',
            createdAt: p.createdAt || new Date(),
          })
        }
      }

      // Album Track -> albumDesigning + creatingAlbum
      if (pp.albumTrack) {
        const at = pp.albumTrack
        const isFree = Boolean(at.assignment.freelancerId)
        const assigneeUid = isFree ? (at.assignment.freelancerId || '') : at.assignment.staffUid
        const assigneeName = isFree ? (at.assignment.freelancerName || '') : at.assignment.staffName

        const exists1 = combined.some(w => w.projectId === p.projectId && w.postProdTrackKey === 'albumTrack' && w.postProdStageKey === 'albumDesigning')
        if (!exists1) {
          const st1 = at.status === 'completed'
            ? { status: 'done' as WorkItemStatus, progressPercent: 100 }
            : getStageWorkStatus(at.albumDesigning?.status, at.clientReview?.status)
          combined.push({
            workItemId: `postprod-${p.projectId}-albumTrack-albumDesigning`,
            projectId: p.projectId,
            clientId: p.clientId || '',
            eventDate: p.eventDate,
            eventName: p.eventName,
            clientName: p.clientName,
            type: 'albumDesigning',
            track: 'photo',
            assignedToUid: assigneeUid,
            assignedToName: assigneeName,
            isFreelancer: isFree,
            status: st1.status,
            priority: 'medium',
            estimatedHours: 6,
            progressPercent: st1.progressPercent,
            dueDate: at.albumDesigning?.dueDate,
            postProdTrackKey: 'albumTrack',
            postProdStageKey: 'albumDesigning',
            createdBy: 'system',
            createdAt: p.createdAt || new Date(),
          })
        }

        const exists2 = combined.some(w => w.projectId === p.projectId && w.postProdTrackKey === 'albumTrack' && w.postProdStageKey === 'creatingAlbum')
        if (!exists2) {
          const st2 = at.status === 'completed'
            ? { status: 'done' as WorkItemStatus, progressPercent: 100 }
            : getStageWorkStatus(at.creatingAlbum?.status)
          combined.push({
            workItemId: `postprod-${p.projectId}-albumTrack-creatingAlbum`,
            projectId: p.projectId,
            clientId: p.clientId || '',
            eventDate: p.eventDate,
            eventName: p.eventName,
            clientName: p.clientName,
            type: 'albumCreating',
            track: 'photo',
            assignedToUid: assigneeUid,
            assignedToName: assigneeName,
            isFreelancer: isFree,
            status: st2.status,
            priority: 'medium',
            estimatedHours: 6,
            progressPercent: st2.progressPercent,
            dueDate: at.creatingAlbum?.dueDate,
            postProdTrackKey: 'albumTrack',
            postProdStageKey: 'creatingAlbum',
            createdBy: 'system',
            createdAt: p.createdAt || new Date(),
          })
        }
      }

      // Video Track -> highlightsEditing
      if (pp.videoTrack) {
        const vt = pp.videoTrack
        const exists = combined.some(w => w.projectId === p.projectId && w.postProdTrackKey === 'videoTrack')
        if (!exists) {
          const isFree = Boolean(vt.assignment.freelancerId)
          const assigneeUid = isFree ? (vt.assignment.freelancerId || '') : vt.assignment.staffUid
          const assigneeName = isFree ? (vt.assignment.freelancerName || '') : vt.assignment.staffName
          const st = vt.status === 'completed'
            ? { status: 'done' as WorkItemStatus, progressPercent: 100 }
            : getStageWorkStatus(vt.highlights?.status, vt.clientReview?.status)
          combined.push({
            workItemId: `postprod-${p.projectId}-videoTrack-highlights`,
            projectId: p.projectId,
            clientId: p.clientId || '',
            eventDate: p.eventDate,
            eventName: p.eventName,
            clientName: p.clientName,
            type: 'highlightsEditing',
            track: 'video',
            assignedToUid: assigneeUid,
            assignedToName: assigneeName,
            isFreelancer: isFree,
            status: st.status,
            priority: 'medium',
            estimatedHours: 6,
            progressPercent: st.progressPercent,
            dueDate: vt.highlights?.dueDate,
            postProdTrackKey: 'videoTrack',
            postProdStageKey: 'highlights',
            createdBy: 'system',
            createdAt: p.createdAt || new Date(),
          })
        }
      }

      // Full Video Track -> fullVideoEditing
      if (pp.fullVideoTrack) {
        const fvt = pp.fullVideoTrack
        const exists = combined.some(w => w.projectId === p.projectId && w.postProdTrackKey === 'fullVideoTrack')
        if (!exists) {
          const isFree = Boolean(fvt.assignment.freelancerId)
          const assigneeUid = isFree ? (fvt.assignment.freelancerId || '') : fvt.assignment.staffUid
          const assigneeName = isFree ? (fvt.assignment.freelancerName || '') : fvt.assignment.staffName
          const st = fvt.status === 'completed'
            ? { status: 'done' as WorkItemStatus, progressPercent: 100 }
            : getStageWorkStatus(fvt.fullVideoEditing?.status, fvt.clientReview?.status)
          combined.push({
            workItemId: `postprod-${p.projectId}-fullVideoTrack-fullVideoEditing`,
            projectId: p.projectId,
            clientId: p.clientId || '',
            eventDate: p.eventDate,
            eventName: p.eventName,
            clientName: p.clientName,
            type: 'fullVideoEditing',
            track: 'video',
            assignedToUid: assigneeUid,
            assignedToName: assigneeName,
            isFreelancer: isFree,
            status: st.status,
            priority: 'medium',
            estimatedHours: 6,
            progressPercent: st.progressPercent,
            dueDate: fvt.fullVideoEditing?.dueDate,
            postProdTrackKey: 'fullVideoTrack',
            postProdStageKey: 'fullVideoEditing',
            createdBy: 'system',
            createdAt: p.createdAt || new Date(),
          })
        }
      }
    }

    // Filter out items for deleted projects or projects that no longer exist
    const nonDeleted = combined.filter(w => {
      if (w.isDeleted) return false
      if (w.projectId) {
        const p = projects.find(proj => proj.projectId === w.projectId)
        if (!p || p.isDeleted) return false
      }
      return true
    })

    // Deduplicate any items that point to the exact same work
    const seenWork = new Map<string, WorkItem>()
    for (const item of nonDeleted) {
      const workKey = `${item.projectId}_${item.assignedToUid}_${item.type}_${item.postProdTrackKey || ''}_${item.postProdStageKey || ''}`
      const existing = seenWork.get(workKey)
      if (!existing) {
        seenWork.set(workKey, item)
      } else {
        const statusRank = (s: WorkItemStatus) => s === 'done' ? 4 : s === 'review' ? 3 : s === 'inProgress' ? 2 : 1
        const itemRank = statusRank(item.status)
        const existingRank = statusRank(existing.status)
        if (itemRank > existingRank) {
          seenWork.set(workKey, item)
        } else if (itemRank === existingRank) {
          if (existing.workItemId.startsWith('proj-') && !item.workItemId.startsWith('proj-')) {
            seenWork.set(workKey, item)
          }
        }
      }
    }
    const finalItems = Array.from(seenWork.values())

    return testDatasetMode
      ? finalItems.filter(w => isAllowedByTestMode(w.createdAt))
      : finalItems
  }, [workItems, localItems, projects, effectiveStaff, freelancers, assignments, testDatasetMode])

  // If logged in as staff, filter items so staff member can ONLY see their own works
  const userWorkItems = useMemo(() => {
    if (!isStaff || !appUser) return allWorkItems
    const staffUid = appUser.uid
    const staffName = (appUser.name || '').trim().toLowerCase()
    return allWorkItems.filter(w => {
      if (w.assignedToUid && w.assignedToUid === staffUid) return true
      if (w.assignedToName && staffName && w.assignedToName.trim().toLowerCase() === staffName) return true
      return false
    })
  }, [allWorkItems, isStaff, appUser])

  // Filtered items (skills and team member filters are ignored for staff)
  const filtered = useMemo(() => userWorkItems.filter(w => {
    if (!isStaff && filterStaff    && w.assignedToUid !== filterStaff)         return false
    if (!isStaff && filterType     && w.type          !== filterType)           return false
    if (filterStatus   && w.status        !== filterStatus)         return false
    if (filterPriority && w.priority      !== filterPriority)       return false
    return true
  }), [userWorkItems, isStaff, filterStaff, filterStatus, filterPriority, filterType])

  // KPI counts
  const ongoing    = userWorkItems.filter(w => getBucket(w) === 'ongoing').length
  const pending    = userWorkItems.filter(w => getBucket(w) === 'pending').length
  const upcoming   = userWorkItems.filter(w => getBucket(w) === 'upcoming').length
  const overdue    = userWorkItems.filter(w => getBucket(w) === 'overdue').length
  const availStaff = staff.filter(s => !allWorkItems.some(w => w.assignedToUid === s.uid && w.status !== 'done')).length

  // Board buckets
  const buckets = useMemo(() => {
    const map: Record<BoardBucket, WorkItem[]> = {
      ongoing: [], pending: [], upcoming: [], overdue: [], completed: []
    }
    filtered.forEach(w => map[getBucket(w)].push(w))
    return map
  }, [filtered])

  // Staff available (no active work)
  const availableStaff = useMemo(() =>
    staff.filter(s => !allWorkItems.some(w => w.assignedToUid === s.uid && w.status !== 'done'))
  , [staff, allWorkItems])

  // Freelancers available (no active work)
  const availableFreelancers = useMemo(() =>
    freelancers.filter(f => !allWorkItems.some(w => w.assignedToUid === f.freelancerId && w.status !== 'done'))
  , [freelancers, allWorkItems])

  // Helper to match a team member against the skill/type filter
  const matchesSkill = (type: WorkItemType, isFreelancer: boolean, skillOrJob?: string, items: WorkItem[] = []): boolean => {
    if (items.some(w => w.type === type)) return true
    const normalized = (skillOrJob || '').toLowerCase()
    if (isFreelancer) {
      if (normalized === 'photographer' && type === 'photography') return true
      if (normalized === 'videographer' && ['videography', 'highlights', 'fullFilm'].includes(type)) return true
      if (normalized === 'editor' && ['photoEditing', 'videoEditing'].includes(type)) return true
      if (normalized === 'designer' && type === 'albumDesign') return true
      return false
    } else {
      if (type === 'photography' && (normalized.includes('photo') || normalized.includes('camera'))) return true
      if (['videography', 'highlights', 'fullFilm'].includes(type) && (normalized.includes('video') || normalized.includes('cinematograph') || normalized.includes('film'))) return true
      if (['photoEditing', 'videoEditing'].includes(type) && (normalized.includes('edit') || normalized.includes('post'))) return true
      if (type === 'albumDesign' && (normalized.includes('design') || normalized.includes('album'))) return true
      return false
    }
  }

  // Filtered staff list for Staff tab
  const filteredStaffList = useMemo(() => {
    return staff.filter(s => {
      if (filterStaff && s.uid !== filterStaff) return false
      const sItems = allWorkItems.filter(w => w.assignedToUid === s.uid)

      if (filterType && !matchesSkill(filterType, false, s.jobTitle, sItems)) return false

      if (filterStatus) {
        const hasStatus = sItems.some(w =>
          w.status === filterStatus &&
          (!filterType || w.type === filterType) &&
          (!filterPriority || w.priority === filterPriority)
        )
        if (!hasStatus) return false
      }

      if (filterPriority) {
        const hasPriority = sItems.some(w =>
          w.priority === filterPriority &&
          (!filterType || w.type === filterType) &&
          (!filterStatus || w.status === filterStatus)
        )
        if (!hasPriority) return false
      }

      return true
    })
  }, [staff, allWorkItems, filterStaff, filterType, filterStatus, filterPriority])

  // Filtered freelancers list for Staff tab
  const filteredFreelancersList = useMemo(() => {
    return freelancers.filter(f => {
      if (filterStaff && f.freelancerId !== filterStaff) return false
      const fItems = allWorkItems.filter(w => w.assignedToUid === f.freelancerId)

      if (filterType && !matchesSkill(filterType, true, f.skill, fItems)) return false

      if (filterStatus) {
        const hasStatus = fItems.some(w =>
          w.status === filterStatus &&
          (!filterType || w.type === filterType) &&
          (!filterPriority || w.priority === filterPriority)
        )
        if (!hasStatus) return false
      }

      if (filterPriority) {
        const hasPriority = fItems.some(w =>
          w.priority === filterPriority &&
          (!filterType || w.type === filterType) &&
          (!filterStatus || w.status === filterStatus)
        )
        if (!hasPriority) return false
      }

      return true
    })
  }, [freelancers, allWorkItems, filterStaff, filterType, filterStatus, filterPriority])

  // Filtered available staff for Available tab
  const filteredAvailableStaff = useMemo(() => {
    return availableStaff.filter(s => {
      if (filterStaff && s.uid !== filterStaff) return false
      const sItems = allWorkItems.filter(w => w.assignedToUid === s.uid)

      if (filterType && !matchesSkill(filterType, false, s.jobTitle, sItems)) return false

      if (filterStatus) {
        const hasStatus = sItems.some(w =>
          w.status === filterStatus &&
          (!filterType || w.type === filterType) &&
          (!filterPriority || w.priority === filterPriority)
        )
        if (!hasStatus) return false
      }

      if (filterPriority) {
        const hasPriority = sItems.some(w =>
          w.priority === filterPriority &&
          (!filterType || w.type === filterType) &&
          (!filterStatus || w.status === filterStatus)
        )
        if (!hasPriority) return false
      }

      return true
    })
  }, [availableStaff, allWorkItems, filterStaff, filterType, filterStatus, filterPriority])

  // Filtered available freelancers for Available tab
  const filteredAvailableFreelancers = useMemo(() => {
    return availableFreelancers.filter(f => {
      if (filterStaff && f.freelancerId !== filterStaff) return false
      const fItems = allWorkItems.filter(w => w.assignedToUid === f.freelancerId)

      if (filterType && !matchesSkill(filterType, true, f.skill, fItems)) return false

      if (filterStatus) {
        const hasStatus = fItems.some(w =>
          w.status === filterStatus &&
          (!filterType || w.type === filterType) &&
          (!filterPriority || w.priority === filterPriority)
        )
        if (!hasStatus) return false
      }

      if (filterPriority) {
        const hasPriority = fItems.some(w =>
          w.priority === filterPriority &&
          (!filterType || w.type === filterType) &&
          (!filterStatus || w.status === filterStatus)
        )
        if (!hasPriority) return false
      }

      return true
    })
  }, [availableFreelancers, allWorkItems, filterStaff, filterType, filterStatus, filterPriority])

  // Update Status handler (used by cards and side panel)
  const handleStatusChange = async (id: string, status: WorkItemStatus) => {
    const progressVal = status === 'done' ? 100 : status === 'inProgress' ? 50 : status === 'review' ? 80 : 0

    // Optimistic update
    setLocalItems(prev => {
      const exists = prev.find(p => p.workItemId === id)
      if (exists) {
        return prev.map(p => p.workItemId === id ? { ...p, status, progressPercent: progressVal } : p)
      }
      const itemToUpdate = allWorkItems.find(w => w.workItemId === id)
      if (itemToUpdate) {
        return [...prev, { ...itemToUpdate, status, progressPercent: progressVal }]
      }
      return prev
    })

    if (selectedPanelItem?.workItemId === id) {
      setSelectedPanelItem(curr => curr ? { ...curr, status, progressPercent: progressVal } : null)
    }

    // Persist to Firestore idempotently
    try {
      const targetItem = allWorkItems.find(w => w.workItemId === id)
      await updateWorkItemStatus(id, status, Boolean(targetItem?.startDate), targetItem)

      // Bidirectional sync: if this item belongs to a Post-Production track & stage, update the stage status
      if (targetItem?.projectId && targetItem?.postProdTrackKey && targetItem?.postProdStageKey) {
        const stageStatusMap: Record<WorkItemStatus, PostProdStageStatus> = {
          todo: 'pending',
          pending: 'pending',
          inProgress: 'inProgress',
          review: 'waitingClient',
          done: 'completed',
        }
        const mappedStageStatus = stageStatusMap[status] || 'pending'
        await updateTrackStageStatus(
          targetItem.projectId,
          targetItem.postProdTrackKey,
          targetItem.postProdStageKey,
          mappedStageStatus,
          Boolean(targetItem?.startDate)
        )
      }
    } catch (err) {
      console.error('Failed to update status in Firestore:', err)
    }
  }

  // Update Progress handler
  const handleProgressChange = async (id: string, progressPercent: number) => {
    setLocalItems(prev => {
      const exists = prev.find(p => p.workItemId === id)
      if (exists) {
        return prev.map(p => p.workItemId === id ? { ...p, progressPercent } : p)
      }
      const itemToUpdate = allWorkItems.find(w => w.workItemId === id)
      if (itemToUpdate) {
        return [...prev, { ...itemToUpdate, progressPercent }]
      }
      return prev
    })

    if (selectedPanelItem?.workItemId === id) {
      setSelectedPanelItem(curr => curr ? { ...curr, progressPercent } : null)
    }

    if (!id.startsWith('assign-') && !id.startsWith('proj-')) {
      try {
        await updateWorkItemProgress(id, progressPercent)
      } catch (err) {
        console.error('Failed to update progress in Firestore:', err)
      }
    }
  }

  // Reassign handler (bidirectional sync with Event Board)
  const handleReassign = async (id: string, newId: string, newName: string, isFreelancer: boolean) => {
    const item = allWorkItems.find(w => w.workItemId === id)
    if (!item) return

    const prevUid = item.assignedToUid
    const prevIsFreelancer = item.isFreelancer

    // 1. Optimistic update
    setLocalItems(prev => {
      const exists = prev.find(p => p.workItemId === id)
      if (exists) {
        return prev.map(p => p.workItemId === id ? {
          ...p,
          assignedToUid: newId,
          assignedToName: newName,
          isFreelancer,
        } : p)
      }
      return [...prev, {
        ...item,
        assignedToUid: newId,
        assignedToName: newName,
        isFreelancer,
      }]
    })

    if (selectedPanelItem?.workItemId === id) {
      setSelectedPanelItem(curr => curr ? {
        ...curr,
        assignedToUid: newId,
        assignedToName: newName,
        isFreelancer,
      } : null)
    }

    // 2. Persist to workItems collection
    if (!id.startsWith('assign-') && !id.startsWith('proj-')) {
      await updateWorkItemAssignee(id, newId, newName, isFreelancer).catch(() => {})
    }

    // 3. Bidirectional sync: update the Project itself so it reflects on the Event Board
    if (item.projectId) {
      // If demo project, update local demo state and broadcast
      if (item.projectId.startsWith('demo-')) {
        setProjects(prev => {
          const next = prev.map(p => {
            if (p.projectId === item.projectId) {
              let updatedStaff = [...(p.staffUids || [])]
              let updatedFl = [...(p.freelancerIds || [])]

              // Remove previous assignee
              if (prevIsFreelancer) {
                updatedFl = updatedFl.filter(fl => fl !== prevUid)
              } else {
                updatedStaff = updatedStaff.filter(st => st !== prevUid)
              }

              // Add new assignee
              if (isFreelancer) {
                updatedFl = Array.from(new Set([...updatedFl, newId]))
              } else {
                updatedStaff = Array.from(new Set([...updatedStaff, newId]))
              }

              return {
                ...p,
                staffUids: updatedStaff,
                freelancerIds: updatedFl,
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
      } else {
        // Real Firestore project
        try {
          if (prevIsFreelancer) {
            await unassignFreelancerFromProject(item.projectId, prevUid, item.clientId).catch(() => {})
          } else {
            await removeStaffFromProject(item.projectId, prevUid, item.clientId).catch(() => {})
          }

          if (isFreelancer) {
            await assignFreelancerToProject(item.projectId, newId, { role: item.type, days: 1, dayRate: 6000 }, item.clientId).catch(() => {})
          } else {
            await assignStaffToProject(item.projectId, newId, item.clientId).catch(() => {})
          }
        } catch (err) {
          console.error('Failed to sync reassignment with project:', err)
        }
      }
    }
  }

  const handleUpdateWorkItem = async (updatedItem: WorkItem) => {
    // 1. Optimistic update
    setLocalItems(prev => {
      const idx = prev.findIndex(p => p.workItemId === updatedItem.workItemId)
      if (idx >= 0) {
        const copy = [...prev]
        copy[idx] = updatedItem
        return copy
      }
      return [...prev, updatedItem]
    })

    if (selectedPanelItem?.workItemId === updatedItem.workItemId) {
      setSelectedPanelItem(updatedItem)
    }

    // 2. Persist to Firestore
    try {
      await saveWorkItemDetails(updatedItem)
    } catch (err) {
      console.error('Failed to save work item details in Firestore:', err)
    }
  }

  const handleWorkCreated = (newItem: WorkItem) => {
    setLocalItems(prev => [newItem, ...prev])

    // If assigned to a demo project, update localStorage and broadcast
    if (newItem.projectId && newItem.projectId.startsWith('demo-')) {
      setProjects(prev => {
        const next = prev.map(p => {
          if (p.projectId === newItem.projectId) {
            if (newItem.isFreelancer) {
              const updatedFl = Array.from(new Set([...(p.freelancerIds || []), newItem.assignedToUid]))
              return { ...p, freelancerIds: updatedFl, updatedAt: new Date() }
            } else {
              const updatedStaff = Array.from(new Set([...(p.staffUids || []), newItem.assignedToUid]))
              return { ...p, staffUids: updatedStaff, updatedAt: new Date() }
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
    }
  }

  const handleWorkIdResolved = (tempId: string, realId: string) => {
    setLocalItems(prev => prev.map(p => p.workItemId === tempId ? { ...p, workItemId: realId } : p))
  }

  const selectStyle: React.CSSProperties = {
    background: 'var(--color-surface-raised)',
    border: '0.5px solid var(--color-border)',
    color: 'var(--color-foreground)',
    borderRadius: '8px',
    padding: '6px 12px',
    fontSize: 'var(--text-sm)',
    fontFamily: 'var(--font-inter)',
    cursor: 'pointer',
    outline: 'none',
    appearance: 'none',
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'var(--font-inter)',
    fontSize: 'var(--text-sm)',
    fontWeight: active ? 600 : 400,
    color: active ? 'var(--color-foreground)' : 'var(--color-foreground-muted)',
    padding: '6px 4px',
    borderBottom: active ? '2px solid var(--color-primary)' : '2px solid transparent',
    transition: 'color 0.15s, border-color 0.15s',
  })

  return (
    <div style={{ fontFamily: 'var(--font-inter)' }}>
      {/* Page Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '24px', flexWrap: 'wrap', gap: '12px',
      }}>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
          {(isStaff ? (['board'] as TabKey[]) : (['board', 'staff', 'available'] as TabKey[])).map(t => (
            <button key={t} style={tabStyle(activeTab === t)} onClick={() => setTab(t)}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        {!isStaff && (
          <Button
            onClick={() => {
              setCreateAssignee(undefined)
              setShowCreate(true)
            }}
            style={{
              background: 'var(--color-primary)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontWeight: 600,
              fontSize: 'var(--text-xs)',
              borderRadius: '8px',
              padding: '8px 16px',
            }}
          >
            <i className="ti ti-plus" style={{ fontSize: '14px' }} />
            Create Work
          </Button>
        )}
      </div>

      {/* KPI row */}
      <div style={{
        display: 'grid', gridTemplateColumns: isStaff ? 'repeat(4, 1fr)' : 'repeat(5, 1fr)',
        gap: '12px', marginBottom: '20px',
      }}>
        {[
          { label: 'ONGOING',         value: ongoing,    color: 'var(--color-accent)' },
          { label: 'PENDING',         value: pending,    color: 'var(--color-secondary)' },
          { label: 'UPCOMING',        value: upcoming,   color: 'var(--color-accent)' },
          { label: 'OVERDUE',         value: overdue,    color: 'var(--color-danger)' },
          ...(!isStaff ? [{ label: 'AVAILABLE STAFF', value: availStaff, color: 'var(--color-success)' }] : []),
        ].map(k => (
          <div key={k.label} style={{
            background: 'var(--color-surface)',
            border: '0.5px solid var(--color-border)',
            borderRadius: '12px',
            padding: '16px 20px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: k.color, display: 'inline-block', flexShrink: 0 }} />
              <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-foreground-subtle)', letterSpacing: '0.05em' }}>
                {k.label}
              </span>
            </div>
            <div style={{ fontSize: 'var(--text-3xl)', fontWeight: 700, color: 'var(--color-foreground)' }}>
              {k.value}
            </div>
          </div>
        ))}
      </div>

      {/* Filter Bar */}
      <div style={{
        display: 'flex', gap: '10px', alignItems: 'center',
        marginBottom: '20px', flexWrap: 'wrap',
      }}>
        {!isStaff && (
          <select style={selectStyle} value={filterType} onChange={e => setFilterType(e.target.value as WorkItemType | '')}>
            <option value="">All Skills</option>
            {(Object.keys(WORK_TYPE_META) as WorkItemType[]).map(t => (
              <option key={t} value={t}>{WORK_TYPE_META[t].label}</option>
            ))}
          </select>
        )}

        {!isStaff && (
          <select style={selectStyle} value={filterStaff} onChange={e => setFilterStaff(e.target.value)}>
            <option value="">All Team Members</option>
            <optgroup label="Staff Members">
              {effectiveStaff.map(s => <option key={s.uid} value={s.uid}>{s.name} (Staff)</option>)}
            </optgroup>
            <optgroup label="Freelancers">
              {freelancers.map(f => <option key={f.freelancerId} value={f.freelancerId}>{f.name} (FL - {f.skill})</option>)}
            </optgroup>
          </select>
        )}

        <select style={selectStyle} value={filterStatus} onChange={e => setFilterStatus(e.target.value as WorkItemStatus | '')}>
          <option value="">All Status</option>
          <option value="pending">Pending (Paused)</option>
          <option value="todo">Todo</option>
          <option value="inProgress">In Progress / Ongoing</option>
          <option value="review">Review</option>
          <option value="done">Done / Completed</option>
        </select>

        <select style={selectStyle} value={filterPriority} onChange={e => setFilterPriority(e.target.value as WorkItemPriority | '')}>
          <option value="">All Priorities</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>

        <span style={{ marginLeft: 'auto', fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>
          {activeTab === 'board'
            ? `${filtered.length} works`
            : activeTab === 'staff'
              ? `${filteredStaffList.length + filteredFreelancersList.length} members`
              : `${filteredAvailableStaff.length + filteredAvailableFreelancers.length} available`
          }
        </span>
      </div>

      {/* ── BOARD TAB (Kanban) ── */}
      {tab === 'board' && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
          gap: '16px',
          alignItems: 'flex-start',
        }}>
          {BUCKET_ORDER.map(bucket => {
            const meta  = BUCKET_META[bucket]
            const items = buckets[bucket]
            return (
              <div key={bucket}>
                {/* Column header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: meta.dot, display: 'inline-block' }} />
                  <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-foreground)' }}>
                    {meta.label}
                  </span>
                  <span style={{
                    marginLeft: 'auto',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 600,
                    color: 'var(--color-foreground-subtle)',
                    background: 'var(--color-surface-raised)',
                    borderRadius: '20px',
                    padding: '1px 7px',
                  }}>
                    {items.length}
                  </span>
                </div>
                {/* Cards */}
                {items.length === 0 ? (
                  <div style={{
                    textAlign: 'center',
                    padding: '24px 12px',
                    color: 'var(--color-foreground-subtle)',
                    fontSize: 'var(--text-xs)',
                    border: '0.5px dashed var(--color-border)',
                    borderRadius: '12px',
                  }}>
                    No items
                  </div>
                ) : (
                  items.map(item => (
                    <WorkCard
                      key={item.workItemId}
                      item={item}
                      onClick={() => setSelectedPanelItem(item)}
                      onStatusChange={handleStatusChange}
                    />
                  ))
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── STAFF & FREELANCERS TAB ── */}
      {activeTab === 'staff' && (
        <div style={{
          background: 'var(--color-surface)',
          border: '0.5px solid var(--color-border)',
          borderRadius: '12px',
          overflow: 'hidden',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--color-surface-raised)' }}>
                {['TEAM MEMBER', 'CURRENT WORK', 'UPCOMING', 'WORKLOAD', 'AVAILABILITY'].map(h => (
                  <th key={h} style={{
                    padding: '10px 16px',
                    textAlign: 'left',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 600,
                    color: 'var(--color-foreground-subtle)',
                    letterSpacing: '0.05em',
                    borderBottom: '0.5px solid var(--color-border)',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredStaffList.length === 0 && filteredFreelancersList.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{
                    textAlign: 'center',
                    padding: '48px 16px',
                    color: 'var(--color-foreground-muted)',
                    fontSize: 'var(--text-sm)',
                  }}>
                    <i className="ti ti-filter-off" style={{ fontSize: '28px', display: 'block', marginBottom: '8px', color: 'var(--color-foreground-subtle)' }} />
                    No team members match the selected filter criteria.
                  </td>
                </tr>
              ) : (
                <>
                  {/* Staff Rows */}
                  {filteredStaffList.map(s => (
                    <TeamMemberRow
                      key={s.uid}
                      personId={s.uid}
                      name={s.name}
                      roleSubtitle={s.jobTitle || 'Staff Member'}
                      isFreelancer={false}
                      items={allWorkItems}
                    />
                  ))}

                  {/* Freelancer Rows */}
                  {filteredFreelancersList.map(f => (
                    <TeamMemberRow
                      key={f.freelancerId}
                      personId={f.freelancerId}
                      name={f.name}
                      roleSubtitle={`${f.skill.charAt(0).toUpperCase() + f.skill.slice(1)} · Freelancer`}
                      isFreelancer={true}
                      items={allWorkItems}
                    />
                  ))}
                </>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── AVAILABLE TAB ── */}
      {activeTab === 'available' && (
        <div>
          {filteredAvailableStaff.length === 0 && filteredAvailableFreelancers.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '60px 24px',
              color: 'var(--color-foreground-muted)',
              fontSize: 'var(--text-sm)',
            }}>
              <i className="ti ti-users" style={{ fontSize: '32px', display: 'block', marginBottom: '12px', color: 'var(--color-foreground-subtle)' }} />
              {availableStaff.length === 0 && availableFreelancers.length === 0
                ? 'All team members are currently assigned to active works.'
                : 'No available team members match the selected filter criteria.'}
            </div>
          ) : (
            <>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: '16px',
              }}>
                {/* Available Staff */}
                {filteredAvailableStaff.map(s => (
                  <AvailablePersonCard
                    key={s.uid}
                    name={s.name}
                    roleSubtitle={s.jobTitle || 'Staff Member'}
                    isFreelancer={false}
                    onAssign={() => {
                      setCreateAssignee({ id: s.uid, isFreelancer: false })
                      setShowCreate(true)
                    }}
                  />
                ))}

                {/* Available Freelancers */}
                {filteredAvailableFreelancers.map(f => (
                  <AvailablePersonCard
                    key={f.freelancerId}
                    name={f.name}
                    roleSubtitle={`${f.skill.charAt(0).toUpperCase() + f.skill.slice(1)} (Freelancer)`}
                    isFreelancer={true}
                    onAssign={() => {
                      setCreateAssignee({ id: f.freelancerId, isFreelancer: true })
                      setShowCreate(true)
                    }}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── SIDE PANEL (Details & Modifications) ── */}
      <WorkItemSidePanel
        item={selectedPanelItem}
        onClose={() => setSelectedPanelItem(null)}
        onStatusChange={handleStatusChange}
        onProgressChange={handleProgressChange}
        onReassign={handleReassign}
        onUpdateItem={handleUpdateWorkItem}
        staff={effectiveStaff}
        freelancers={freelancers}
        isStaff={isStaff}
      />

      {/* ── CREATE WORK MODAL ── */}
      {showCreate && !isStaff && (
        <CreateWorkModal
          onClose={() => setShowCreate(false)}
          projects={projects}
          staff={staff}
          freelancers={freelancers}
          createdBy={appUser?.uid ?? ''}
          initialAssignee={createAssignee}
          onWorkCreated={handleWorkCreated}
          onWorkIdResolved={handleWorkIdResolved}
        />
      )}
    </div>
  )
}

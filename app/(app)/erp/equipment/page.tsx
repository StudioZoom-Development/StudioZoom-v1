'use client'

import React, { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import type { Equipment, EquipmentCategory, EquipmentCondition, EquipmentStatus } from '@/types'
import {
  subscribeEquipment,
  createEquipment,
  updateEquipment,
  retireEquipment,
  deleteEquipment,
  subscribeCustomEquipmentCategories,
} from '@/lib/firebase/queries/equipment'
import { useAuthStore } from '@/store/authStore'
import { Badge } from '@/components/shared/Badge'
import { EmptyState } from '@/components/shared/EmptyState'
import { LoadingSkeleton } from '@/components/shared/LoadingSkeleton'
import { AddEquipmentModal } from '@/components/equipment/AddEquipmentModal'
import { RetireEquipmentModal } from '@/components/equipment/RetireEquipmentModal'
import { ConfirmModal } from '@/components/shared/ConfirmModal'
import { Button } from '@/components/ui/button'

const INITIAL_FALLBACK_EQUIPMENT: Equipment[] = [
  {
    itemId: 'eq_cam_01',
    itemCode: 'CAM-01',
    name: 'Sony A7 IV',
    category: 'camera',
    brand: 'Sony',
    model: 'ILCE-7M4',
    serialNumber: 'SN-4482-A7M4-2201',
    purchaseDate: new Date('2023-03-15'),
    purchasePrice: 215000,
    condition: 'good',
    location: 'Shelf B2 · Studio',
    status: 'out',
    assignedToName: 'Siva Prakash',
    assignedToUid: 'uid_siva_prakash',
    dueBackDate: new Date(Date.now() + 3 * 24 * 3600 * 1000),
    notes: 'Sensor clean & firmware 3.1 completed',
    currentCheckoutId: 'co_cam_01',
    createdAt: new Date('2023-03-15'),
  },
  {
    itemId: 'eq_cam_02',
    itemCode: 'CAM-02',
    name: 'Canon EOS R6 Mark II',
    category: 'camera',
    brand: 'Canon',
    model: 'EOS R6 Mark II',
    serialNumber: 'SN-3891-R6M2-0442',
    purchaseDate: new Date('2023-08-20'),
    purchasePrice: 245000,
    condition: 'good',
    location: 'Camera Vault A1',
    status: 'available',
    notes: 'Cleaned and ready for assignment',
    createdAt: new Date('2023-08-20'),
  },
  {
    itemId: 'eq_cam_03',
    itemCode: 'CAM-03',
    name: 'Sony FX3 Cinema Line',
    category: 'camcorder',
    brand: 'Sony',
    model: 'ILME-FX3',
    serialNumber: 'SN-8829-FX3-9103',
    purchaseDate: new Date('2024-01-10'),
    purchasePrice: 380000,
    condition: 'excellent',
    location: 'Pelican Case #1',
    status: 'available',
    notes: 'Cinema kit with XLR top handle',
    createdAt: new Date('2024-01-10'),
  },
  {
    itemId: 'eq_len_01',
    itemCode: 'LEN-01',
    name: 'Sony FE 24-70mm f/2.8 GM II',
    category: 'lens',
    brand: 'Sony',
    model: 'SEL2470GM2',
    serialNumber: 'SN-3392-GM2-0191',
    purchaseDate: new Date('2023-04-10'),
    purchasePrice: 195000,
    condition: 'good',
    location: 'Lens Vault A',
    status: 'available',
    notes: 'UV filter attached',
    createdAt: new Date('2023-04-10'),
  },
  {
    itemId: 'eq_len_04',
    itemCode: 'LEN-04',
    name: 'Sony FE 70-200mm f/2.8 GM OSS II',
    category: 'lens',
    brand: 'Sony',
    model: 'SEL70200GM2',
    serialNumber: 'SN-7729-GM2-1025',
    purchaseDate: new Date('2023-05-18'),
    purchasePrice: 245000,
    condition: 'good',
    location: 'Lens Vault A',
    status: 'out',
    assignedToName: 'Siva Prakash',
    assignedToUid: 'uid_siva_prakash',
    dueBackDate: new Date(Date.now() - 3 * 24 * 3600 * 1000),
    notes: 'Assigned for Divya & Arjun engagement',
    currentCheckoutId: 'co_len_04',
    createdAt: new Date('2023-05-18'),
  },
  {
    itemId: 'eq_len_07',
    itemCode: 'LEN-07',
    name: 'Sigma 35mm f/1.4 DG DN Art',
    category: 'lens',
    brand: 'Sigma',
    model: '35mm F1.4 Art',
    serialNumber: 'SN-5521-ART-3501',
    purchaseDate: new Date('2023-09-05'),
    purchasePrice: 75000,
    condition: 'good',
    location: 'Lens Vault B',
    status: 'available',
    createdAt: new Date('2023-09-05'),
  },
  {
    itemId: 'eq_len_08',
    itemCode: 'LEN-08',
    name: 'Canon RF 50mm f/1.2L USM',
    category: 'lens',
    brand: 'Canon',
    model: 'RF 50mm f/1.2L',
    serialNumber: 'SN-1142-RF50-8802',
    purchaseDate: new Date('2023-11-12'),
    purchasePrice: 198000,
    condition: 'excellent',
    location: 'Lens Vault A',
    status: 'available',
    createdAt: new Date('2023-11-12'),
  },
  {
    itemId: 'eq_drn_01',
    itemCode: 'DRN-01',
    name: 'DJI Mavic 3 Pro Cine Drone',
    category: 'drone',
    brand: 'DJI',
    model: 'Mavic 3 Pro Cine',
    serialNumber: 'SN-1928-M3P-4019',
    purchaseDate: new Date('2024-02-15'),
    purchasePrice: 290000,
    condition: 'good',
    location: 'Drone Vault B',
    status: 'out',
    assignedToName: 'Deepak S',
    assignedToUid: 'EmpaoYKGNpXHezIC4vDyLuMQs2o1',
    dueBackDate: new Date(Date.now() - 2 * 24 * 3600 * 1000),
    notes: 'Includes RC Pro and 3 intelligent flight batteries',
    currentCheckoutId: 'co_drn_01',
    createdAt: new Date('2024-02-15'),
  },
  {
    itemId: 'eq_gim_02',
    itemCode: 'GIM-02',
    name: 'DJI RS 3 Pro Gimbal Stabilizer',
    category: 'gimbal',
    brand: 'DJI',
    model: 'RS 3 Pro Combo',
    serialNumber: 'SN-5520-RS3-1944',
    purchaseDate: new Date('2023-10-14'),
    purchasePrice: 72000,
    condition: 'service',
    location: 'Service Shelf S1',
    status: 'service',
    notes: 'Roll axis balancing & firmware re-calibration in progress',
    createdAt: new Date('2023-10-14'),
  },
  {
    itemId: 'eq_fls_01',
    itemCode: 'FLS-01',
    name: 'Godox V1 Round-Head Flash',
    category: 'flash',
    brand: 'Godox',
    model: 'V1-S',
    serialNumber: 'SN-9912-V1S-8831',
    purchaseDate: new Date('2023-06-25'),
    purchasePrice: 21000,
    condition: 'good',
    location: 'Flash Shelf F1',
    status: 'available',
    createdAt: new Date('2023-06-25'),
  },
  {
    itemId: 'eq_fls_03',
    itemCode: 'FLS-03',
    name: 'Godox AD600Pro Witstro Outdoor Strobe',
    category: 'flash',
    brand: 'Godox',
    model: 'AD600Pro',
    serialNumber: 'SN-4410-AD60-2940',
    purchaseDate: new Date('2023-12-01'),
    purchasePrice: 65000,
    condition: 'good',
    location: 'Studio Lighting Rack',
    status: 'out',
    assignedToName: 'Ramesh D',
    assignedToUid: '1gJBWJl5iOfWHeZJnG7iaNACgrw1',
    dueBackDate: new Date(Date.now() + 4 * 24 * 3600 * 1000),
    notes: 'Includes portable battery pack & standard reflector',
    currentCheckoutId: 'co_fls_03',
    createdAt: new Date('2023-12-01'),
  },
  {
    itemId: 'eq_lgt_05',
    itemCode: 'LGT-05',
    name: 'Aputure Light Storm LS 300d II',
    category: 'light',
    brand: 'Aputure',
    model: 'LS 300d II',
    serialNumber: 'SN-6652-300D-0193',
    purchaseDate: new Date('2023-07-20'),
    purchasePrice: 95000,
    condition: 'good',
    location: 'Studio Floor Stand Rack',
    status: 'available',
    createdAt: new Date('2023-07-20'),
  },
  {
    itemId: 'eq_lgt_06',
    itemCode: 'LGT-06',
    name: 'Nanlite Pavotube II 30X RGB LED Tube',
    category: 'light',
    brand: 'Nanlite',
    model: 'Pavotube II 30X',
    serialNumber: 'SN-8821-PAVO-3001',
    purchaseDate: new Date('2024-03-05'),
    purchasePrice: 38000,
    condition: 'excellent',
    location: 'Lighting Case C',
    status: 'available',
    createdAt: new Date('2024-03-05'),
  },
  {
    itemId: 'eq_trp_01',
    itemCode: 'TRP-01',
    name: 'Manfrotto 055 Carbon Fiber Tripod',
    category: 'tripod',
    brand: 'Manfrotto',
    model: 'MT055CXPRO3',
    serialNumber: 'SN-2210-MNF-0553',
    purchaseDate: new Date('2023-05-10'),
    purchasePrice: 34000,
    condition: 'good',
    location: 'Studio Grip Stand Area',
    status: 'available',
    createdAt: new Date('2023-05-10'),
  },
  {
    itemId: 'eq_aud_01',
    itemCode: 'AUD-01',
    name: 'Sennheiser EW-DP Wireless Mic System',
    category: 'other',
    brand: 'Sennheiser',
    model: 'EW-DP ME2 Set',
    serialNumber: 'SN-7731-SENN-9920',
    purchaseDate: new Date('2024-01-18'),
    purchasePrice: 58000,
    condition: 'excellent',
    location: 'Audio Locker A2',
    status: 'available',
    notes: 'Dual receiver with lavalier transmitter',
    createdAt: new Date('2024-01-18'),
  },
  {
    itemId: 'eq_mem_01',
    itemCode: 'MEM-01',
    name: 'SanDisk Extreme PRO 128GB V90 SDXC',
    category: 'sdCard',
    brand: 'SanDisk',
    model: 'SDSDXDK-128G',
    serialNumber: 'SN-1092-SAND-128V',
    purchaseDate: new Date('2024-02-01'),
    purchasePrice: 14500,
    condition: 'excellent',
    location: 'Memory Vault M1',
    status: 'available',
    createdAt: new Date('2024-02-01'),
  },
  {
    itemId: 'eq_bat_01',
    itemCode: 'BAT-01',
    name: 'Sony NP-FZ100 Rechargeable Battery Set (x4)',
    category: 'battery',
    brand: 'Sony',
    model: 'NP-FZ100',
    serialNumber: 'SN-4431-BAT-0044',
    purchaseDate: new Date('2024-02-10'),
    purchasePrice: 28000,
    condition: 'good',
    location: 'Charging Station Rack',
    status: 'available',
    createdAt: new Date('2024-02-10'),
  },
]

const CATEGORY_ITEMS: { key: string; label: string; icon: string }[] = [
  { key: 'all', label: 'All Equipment', icon: 'ti-stack-2' },
  { key: 'camera', label: 'Cameras', icon: 'ti-camera' },
  { key: 'lens', label: 'Lenses', icon: 'ti-aperture' },
  { key: 'light', label: 'Lighting', icon: 'ti-bulb' },
  { key: 'flash', label: 'Flashes', icon: 'ti-bolt' },
  { key: 'drone', label: 'Drones', icon: 'ti-drone' },
  { key: 'gimbal', label: 'Gimbals', icon: 'ti-rotate-360' },
  { key: 'tripod', label: 'Tripods', icon: 'ti-components' },
  { key: 'backdrop', label: 'Backdrops', icon: 'ti-wallpaper' },
  { key: 'sdCard', label: 'Memory', icon: 'ti-device-sd-card' },
  { key: 'battery', label: 'Power', icon: 'ti-battery-charging' },
  { key: 'other', label: 'Other', icon: 'ti-box' },
]

export default function EquipmentPage() {
  const appUser = useAuthStore((s) => s.appUser)
  const isStaff = appUser?.role === 'staff'
  const isAdminOrManager = appUser?.role === 'admin' || appUser?.role === 'manager'

  const isItemAssignedToUser = (item: Equipment): boolean => {
    if (!isStaff) return true
    if (!appUser) return false
    if (item.assignedToUid && item.assignedToUid === appUser.uid) return true
    if (
      appUser.name &&
      item.assignedToName &&
      item.assignedToName.trim().toLowerCase() === appUser.name.trim().toLowerCase()
    ) {
      return true
    }
    return false
  }

  const [equipmentList, setEquipmentList] = useState<Equipment[]>([])
  const [loading, setLoading] = useState(true)
  const [customFirestoreCategories, setCustomFirestoreCategories] = useState<{ key: string; label: string; icon?: string }[]>([])

  // Subscribe to custom equipment categories in Firestore
  useEffect(() => {
    const unsub = subscribeCustomEquipmentCategories((cats) => {
      setCustomFirestoreCategories(cats)
    })
    return () => unsub()
  }, [])

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<'code' | 'name' | 'price' | 'due'>('code')

  // Dynamic category items including standard and any added custom categories
  const dynamicCategoryItems = useMemo(() => {
    const list = [...CATEGORY_ITEMS]
    const existingKeys = new Set(list.map((c) => c.key))

    equipmentList.forEach((item) => {
      if (item.category && !existingKeys.has(item.category)) {
        existingKeys.add(item.category)
        const formattedLabel = String(item.category)
          .replace(/([A-Z])/g, ' $1')
          .replace(/^./, (str) => str.toUpperCase())
        list.push({
          key: item.category,
          label: formattedLabel,
          icon: 'ti-tag',
        })
      }
    })

    // From Firestore studioSettings/equipmentCategories
    customFirestoreCategories.forEach((cat) => {
      if (cat && cat.key && !existingKeys.has(cat.key)) {
        existingKeys.add(cat.key)
        list.push({
          key: cat.key,
          label: cat.label || cat.key,
          icon: cat.icon || 'ti-tag',
        })
      }
    })

    try {
      const stored = typeof window !== 'undefined' ? localStorage.getItem('studio_custom_equipment_categories') : null
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed)) {
          parsed.forEach((cat) => {
            if (cat && cat.key && !existingKeys.has(cat.key)) {
              existingKeys.add(cat.key)
              list.push({
                key: cat.key,
                label: cat.label || cat.key,
                icon: cat.icon || 'ti-tag',
              })
            }
          })
        }
      }
    } catch {
      // ignore
    }

    return list
  }, [equipmentList, customFirestoreCategories])

  // Pagination
  const [currentPage, setCurrentPage] = useState<number>(1)
  const [pageSize, setPageSize] = useState<number>(15)

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(() => {
    if (typeof window === 'undefined') return false
    return new URLSearchParams(window.location.search).get('action') === 'new'
  })
  const [editingItem, setEditingItem] = useState<Equipment | null>(null)
  const [retiringItem, setRetiringItem] = useState<Equipment | null>(null)
  const [deletingItem, setDeletingItem] = useState<Equipment | null>(null)
  const [deleteSubmitting, setDeleteSubmitting] = useState(false)

  // Listen for action=new param or custom event to open Add Equipment modal
  useEffect(() => {
    const handleCheckAction = () => {
      if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('action') === 'new') {
        setIsAddModalOpen(true)
      }
    }
    handleCheckAction()
    window.addEventListener('popstate', handleCheckAction)
    window.addEventListener('studio-open-equipment-add', handleCheckAction)
    return () => {
      window.removeEventListener('popstate', handleCheckAction)
      window.removeEventListener('studio-open-equipment-add', handleCheckAction)
    }
  }, [])

  // Subscribe to real-time Firestore equipment
  useEffect(() => {
    let isMounted = true
    const unsubscribe = subscribeEquipment(
      (items) => {
        if (!isMounted) return
        if (items.length > 0) {
          setEquipmentList(items)
        } else {
          // If fresh collection, provide sample items for immediate preview
          setEquipmentList(INITIAL_FALLBACK_EQUIPMENT)
        }
        setLoading(false)
      },
      (err) => {
        console.error('[EquipmentPage] subscription error:', err)
        if (isMounted) {
          setEquipmentList(INITIAL_FALLBACK_EQUIPMENT)
          setLoading(false)
        }
      }
    )

    return () => {
      isMounted = false
      unsubscribe()
    }
  }, [])

  // KPI calculations
  const kpis = useMemo(() => {
    const total = equipmentList.length
    const available = equipmentList.filter((e) => e.status === 'available').length
    const out = equipmentList.filter((e) => e.status === 'out').length
    const service = equipmentList.filter(
      (e) => e.status === 'service' || e.status === 'maintenance' || e.status === 'repair'
    ).length

    const now = new Date()
    const overdue = equipmentList.filter(
      (e) => e.status === 'out' && e.dueBackDate && e.dueBackDate.getTime() < now.getTime()
    ).length

    const totalValue = equipmentList.reduce((sum, e) => sum + (e.purchasePrice || 0), 0)

    return { total, available, out, service, overdue, totalValue }
  }, [equipmentList])

  // Filtered & Sorted items
  const filteredItems = useMemo(() => {
    let list = [...equipmentList]

    // Category filter
    if (selectedCategory !== 'all') {
      if (selectedCategory === 'camera') {
        list = list.filter((e) => e.category === 'camera' || e.category === 'cameraBody' || e.category === 'camcorder')
      } else if (selectedCategory === 'sdCard') {
        list = list.filter((e) => e.category === 'sdCard' || e.category === 'memoryCard')
      } else if (selectedCategory === 'battery') {
        list = list.filter((e) => e.category === 'battery' || e.category === 'charger' || e.category === 'wire')
      } else {
        list = list.filter((e) => e.category === selectedCategory)
      }
    }

    // Status filter
    if (statusFilter !== 'all') {
      if (statusFilter === 'service') {
        list = list.filter(
          (e) => e.status === 'service' || e.status === 'maintenance' || e.status === 'repair'
        )
      } else if (statusFilter === 'overdue') {
        const now = new Date()
        list = list.filter(
          (e) => e.status === 'out' && e.dueBackDate && e.dueBackDate.getTime() < now.getTime()
        )
      } else {
        list = list.filter((e) => e.status === statusFilter)
      }
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      list = list.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.itemCode.toLowerCase().includes(q) ||
          e.brand.toLowerCase().includes(q) ||
          e.model.toLowerCase().includes(q) ||
          e.serialNumber.toLowerCase().includes(q) ||
          e.location.toLowerCase().includes(q) ||
          (e.assignedToName && e.assignedToName.toLowerCase().includes(q))
      )
    }

    // Sort
    list.sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name)
      if (sortBy === 'price') return (b.purchasePrice || 0) - (a.purchasePrice || 0)
      if (sortBy === 'due') {
        const aDue = a.dueBackDate?.getTime() || 0
        const bDue = b.dueBackDate?.getTime() || 0
        return aDue - bDue
      }
      return a.itemCode.localeCompare(b.itemCode, undefined, { numeric: true })
    })

    return list
  }, [equipmentList, selectedCategory, statusFilter, searchQuery, sortBy])

  // Pagination calculations
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize))
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages)
  const paginatedItems = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize
    return filteredItems.slice(start, start + pageSize)
  }, [filteredItems, safeCurrentPage, pageSize])

  // Save (Add or Edit) Handler
  const handleSaveEquipment = async (data: {
    itemCode: string
    name: string
    category: EquipmentCategory
    brand: string
    model: string
    serialNumber: string
    purchaseDate?: Date
    purchasePrice: number
    vendor?: string
    warrantyExpiry?: Date
    condition: EquipmentCondition
    location: string
    photoUrl?: string
    status?: EquipmentStatus
    notes?: string
  }) => {
    if (editingItem) {
      await updateEquipment(
        editingItem.itemId,
        data,
        appUser ? { uid: appUser.uid, displayName: appUser.name || appUser.email || 'Admin' } : undefined,
        'Equipment updated from inventory'
      )
    } else {
      await createEquipment(
        data,
        appUser ? { uid: appUser.uid, displayName: appUser.name || appUser.email || 'Admin' } : undefined
      )
    }
    setEditingItem(null)
  }

  // Retire Handler
  const handleRetireEquipment = async (reason: string) => {
    if (!retiringItem) return
    await retireEquipment(
      retiringItem.itemId,
      reason,
      appUser ? { uid: appUser.uid, displayName: appUser.name || appUser.email || 'Admin' } : undefined
    )
    setRetiringItem(null)
  }

  // Delete Handler (Soft delete via isDeleted: true)
  const handleDeleteEquipment = async () => {
    if (!deletingItem) return
    try {
      setDeleteSubmitting(true)
      await deleteEquipment(deletingItem.itemId)
      setDeletingItem(null)
    } catch (err) {
      console.error('Failed to delete equipment:', err)
    } finally {
      setDeleteSubmitting(false)
    }
  }

  // Export CSV
  const handleExportCSV = () => {
    const headers = ['Asset Code', 'Name', 'Category', 'Brand', 'Model', 'Serial Number', 'Condition', 'Status', 'Location', 'Assigned To', 'Price (INR)']
    const rows = filteredItems.map((e) => [
      e.itemCode,
      `"${e.name.replace(/"/g, '""')}"`,
      e.category,
      `"${e.brand}"`,
      `"${e.model}"`,
      `"${e.serialNumber}"`,
      e.condition,
      e.status,
      `"${e.location}"`,
      `"${e.assignedToName || ''}"`,
      e.purchasePrice || 0,
    ])

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `StudioZoom_Equipment_${new Date().toISOString().split('T')[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const formatShortDate = (d?: Date) => {
    if (!d) return '—'
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  }

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(val)
  }

  return (
    <div
      className="p-3.5 sm:p-4 md:p-6"
      style={{
        maxWidth: '1280px',
        margin: '0 auto',
        paddingBottom: 'calc(88px + env(safe-area-inset-bottom))',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        fontFamily: 'var(--font-inter)',
        color: 'var(--color-foreground)',
      }}
    >
      <style>{`
        @media (min-width: 900px) {
          .equipment-kpi-grid {
            display: grid !important;
            grid-template-columns: repeat(5, 1fr) !important;
            gap: 12px !important;
          }
          .equipment-kpi-card-5 {
            grid-column: span 1 !important;
          }
        }
        @media (min-width: 600px) and (max-width: 899px) {
          .equipment-kpi-grid {
            display: grid !important;
            grid-template-columns: repeat(3, 1fr) !important;
            gap: 10px !important;
          }
          .equipment-kpi-card-5 {
            grid-column: span 1 !important;
          }
        }
        @media (max-width: 599px) {
          .equipment-kpi-grid {
            display: grid !important;
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 8px !important;
          }
          .equipment-kpi-card-5 {
            grid-column: span 2 !important;
          }
        }
      `}</style>

      {/* ─── PAGE HEADER ──────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h1
              style={{
                fontSize: 'var(--text-2xl)',
                fontWeight: 700,
                letterSpacing: '-0.02em',
                margin: 0,
                lineHeight: 1.2,
              }}
            >
              Equipment & Gear Inventory
            </h1>
            <p
              style={{
                fontSize: 'var(--text-sm)',
                color: 'var(--color-foreground-muted)',
                margin: '4px 0 0 0',
              }}
            >
              Track cameras, lenses, lighting, storage bays, and monitor checkout availability.
            </p>
          </div>

          {/* Quick Action Navigation Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {isAdminOrManager && (
              <button
                type="button"
                onClick={handleExportCSV}
                style={{
                  height: '36px',
                  padding: '0 12px',
                  borderRadius: '8px',
                  background: 'var(--color-surface)',
                  border: '0.5px solid var(--color-border)',
                  color: 'var(--color-foreground-muted)',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <i className="ti ti-download" style={{ fontSize: '15px' }} />
                <span className="hidden sm:inline">Export CSV</span>
              </button>
            )}

            <Link
              href="/erp/equipment/held"
              style={{
                height: '36px',
                padding: '0 14px',
                borderRadius: '8px',
                background: 'var(--color-surface-raised)',
                border: '0.5px solid var(--color-border)',
                color: 'var(--color-accent)',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                textDecoration: 'none',
              }}
            >
              <i className="ti ti-user-check" style={{ fontSize: '16px' }} />
              <span>Staff-Held View</span>
            </Link>

            <Link
              href="/erp/equipment/checkout"
              style={{
                height: '36px',
                padding: '0 14px',
                borderRadius: '8px',
                background: 'var(--color-secondary-muted)',
                border: '0.5px solid var(--color-secondary)',
                color: 'var(--color-secondary)',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                textDecoration: 'none',
              }}
            >
              <i className="ti ti-arrow-right-circle" style={{ fontSize: '16px' }} />
              <span>Checkout / Check-in</span>
            </Link>

            {isAdminOrManager && (
              <button
                type="button"
                onClick={() => {
                  setEditingItem(null)
                  setIsAddModalOpen(true)
                }}
                style={{
                  height: '36px',
                  padding: '0 16px',
                  borderRadius: '8px',
                  background: 'var(--color-primary)',
                  border: 'none',
                  color: '#ffffff',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <i className="ti ti-plus" style={{ fontSize: '16px' }} />
                <span>Add Equipment</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ─── KPI METRIC TILES ─────────────────────────────────────────── */}
      <div className="equipment-kpi-grid">
        {/* Total Assets */}
        <div
          className="p-3 sm:p-4"
          style={{
            background: 'var(--color-surface)',
            border: '0.5px solid var(--color-border)',
            borderRadius: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-foreground-subtle)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Total Assets
            </span>
            <i className="ti ti-box" style={{ fontSize: '18px', color: 'var(--color-primary)' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--color-primary)' }}>
              {kpis.total}
            </span>
            <span style={{ fontSize: '11px', color: 'var(--color-foreground-subtle)' }}>
              items
            </span>
          </div>
          <span style={{ fontSize: '11px', color: 'var(--color-foreground-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {isAdminOrManager ? `Valued at ${formatCurrency(kpis.totalValue)}` : `${kpis.total} items in fleet`}
          </span>
        </div>

        {/* Available */}
        <div
          className="p-3 sm:p-4"
          onClick={() => {
            setStatusFilter(statusFilter === 'available' ? 'all' : 'available')
            setCurrentPage(1)
          }}
          style={{
            background: 'var(--color-surface)',
            border: `0.5px solid ${statusFilter === 'available' ? 'var(--color-success)' : 'var(--color-border)'}`,
            borderRadius: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-foreground-subtle)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Available
            </span>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--color-success)' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--color-success)' }}>
              {kpis.available}
            </span>
            <span style={{ fontSize: '11px', color: 'var(--color-foreground-subtle)' }}>
              ready
            </span>
          </div>
          <span style={{ fontSize: '11px', color: 'var(--color-foreground-muted)' }}>
            {kpis.total > 0 ? `${Math.round((kpis.available / kpis.total) * 100)}% on hand` : '0%'}
          </span>
        </div>

        {/* Checked Out */}
        <div
          className="p-3 sm:p-4"
          onClick={() => {
            setStatusFilter(statusFilter === 'out' ? 'all' : 'out')
            setCurrentPage(1)
          }}
          style={{
            background: 'var(--color-surface)',
            border: `0.5px solid ${statusFilter === 'out' ? 'var(--color-secondary)' : 'var(--color-border)'}`,
            borderRadius: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-foreground-subtle)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Checked Out
            </span>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--color-secondary)' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--color-secondary)' }}>
              {kpis.out}
            </span>
            <span style={{ fontSize: '11px', color: 'var(--color-foreground-subtle)' }}>
              in field
            </span>
          </div>
          <span style={{ fontSize: '11px', color: 'var(--color-foreground-muted)' }}>
            Assigned to shoot crews
          </span>
        </div>

        {/* In Service */}
        <div
          className="p-3 sm:p-4"
          onClick={() => {
            setStatusFilter(statusFilter === 'service' ? 'all' : 'service')
            setCurrentPage(1)
          }}
          style={{
            background: 'var(--color-surface)',
            border: `0.5px solid ${statusFilter === 'service' ? 'var(--color-purple)' : 'var(--color-border)'}`,
            borderRadius: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-foreground-subtle)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              In Service
            </span>
            <i className="ti ti-tool" style={{ fontSize: '18px', color: 'var(--color-purple)' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--color-purple)' }}>
              {kpis.service}
            </span>
            <span style={{ fontSize: '11px', color: 'var(--color-foreground-subtle)' }}>
              repair
            </span>
          </div>
          <span style={{ fontSize: '11px', color: 'var(--color-foreground-muted)' }}>
            Maintenance & checks
          </span>
        </div>

        {/* Overdue Returns */}
        <div
          className="equipment-kpi-card-5 p-3 sm:p-4"
          onClick={() => {
            setStatusFilter(statusFilter === 'overdue' ? 'all' : 'overdue')
            setCurrentPage(1)
          }}
          style={{
            background: kpis.overdue > 0 ? 'var(--color-danger-muted)' : 'var(--color-surface)',
            border: `0.5px solid ${kpis.overdue > 0 ? 'var(--color-danger)' : 'var(--color-border)'}`,
            borderRadius: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: kpis.overdue > 0 ? 'var(--color-danger)' : 'var(--color-foreground-subtle)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Overdue Returns
            </span>
            <i className="ti ti-alert-triangle" style={{ fontSize: '18px', color: 'var(--color-danger)' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--color-danger)' }}>
              {kpis.overdue}
            </span>
            <span style={{ fontSize: '11px', color: 'var(--color-danger)' }}>
              action needed
            </span>
          </div>
          <span style={{ fontSize: '11px', color: 'var(--color-foreground-muted)' }}>
            {kpis.overdue > 0 ? 'Late check-in alerts' : 'All returns on time'}
          </span>
        </div>
      </div>

      {/* ─── CATEGORY PILLS BAR ────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          overflowX: 'auto',
          paddingBottom: '4px',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {dynamicCategoryItems.map((c) => {
          const isActive = selectedCategory === c.key
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => {
                setSelectedCategory(c.key)
                setCurrentPage(1)
              }}
              style={{
                height: '32px',
                padding: '0 12px',
                borderRadius: '20px',
                background: isActive ? 'var(--color-primary-muted)' : 'var(--color-surface)',
                border: `0.5px solid ${isActive ? 'var(--color-primary)' : 'var(--color-border)'}`,
                color: isActive ? 'var(--color-primary)' : 'var(--color-foreground-muted)',
                fontSize: 'var(--text-xs)',
                fontWeight: isActive ? 700 : 500,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
              }}
            >
              <i className={`ti ${c.icon}`} style={{ fontSize: '14px' }} />
              <span>{c.label}</span>
            </button>
          )
        })}
      </div>

      {/* ─── FILTER & SEARCH BAR ──────────────────────────────────────── */}
      <div
        style={{
          background: 'var(--color-surface)',
          border: '0.5px solid var(--color-border)',
          borderRadius: '12px',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        {/* Search Input */}
        <div style={{ position: 'relative', flex: '1 1 260px', minWidth: '220px' }}>
          <i
            className="ti ti-search"
            style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--color-foreground-subtle)',
              fontSize: '15px',
            }}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              setCurrentPage(1)
            }}
            placeholder="Search gear, brand, model, S/N, code, holder..."
            style={{
              width: '100%',
              boxSizing: 'border-box',
              height: '36px',
              borderRadius: '8px',
              background: 'var(--color-surface-raised)',
              border: '0.5px solid var(--color-border)',
              padding: '0 12px 0 34px',
              fontSize: 'var(--text-sm)',
              color: 'var(--color-foreground)',
              outline: 'none',
              fontFamily: 'var(--font-inter)',
            }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('')
                setCurrentPage(1)
              }}
              style={{
                position: 'absolute',
                right: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'transparent',
                border: 'none',
                color: 'var(--color-foreground-subtle)',
                cursor: 'pointer',
              }}
            >
              <i className="ti ti-x" style={{ fontSize: '14px' }} />
            </button>
          )}
        </div>

        {/* Status & Sort Dropdowns */}
        <div className="grid grid-cols-2 gap-2 w-full sm:flex sm:w-auto sm:items-center sm:gap-3">
          <div className="flex items-center gap-1.5 w-full sm:w-auto">
            <span className="hidden sm:inline" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value)
                setCurrentPage(1)
              }}
              className="w-full sm:w-auto"
              style={{
                height: '36px',
                borderRadius: '8px',
                background: 'var(--color-surface-raised)',
                border: '0.5px solid var(--color-border)',
                padding: '0 10px',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                color: 'var(--color-foreground)',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="all">All Statuses</option>
              <option value="available">Available</option>
              <option value="out">Checked Out</option>
              <option value="service">Service / Repair</option>
              <option value="overdue">Overdue Returns</option>
              <option value="retired">Retired</option>
            </select>
          </div>

          {/* Sort Dropdown */}
          <div className="flex items-center gap-1.5 w-full sm:w-auto">
            <span className="hidden sm:inline" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value as 'code' | 'name' | 'price' | 'due')
                setCurrentPage(1)
              }}
              className="w-full sm:w-auto"
              style={{
                height: '36px',
                borderRadius: '8px',
                background: 'var(--color-surface-raised)',
                border: '0.5px solid var(--color-border)',
                padding: '0 10px',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                color: 'var(--color-foreground)',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="code">Sort: Asset Code</option>
              <option value="name">Sort: Name</option>
              <option value="price">Sort: Price (High)</option>
              <option value="due">Sort: Due Date</option>
            </select>
          </div>
        </div>
      </div>

      {/* ─── DATA CONTENT ─────────────────────────────────────────────── */}
      {loading ? (
        <LoadingSkeleton />
      ) : filteredItems.length === 0 ? (
        <EmptyState
          title="No equipment found"
          description={
            searchQuery || selectedCategory !== 'all' || statusFilter !== 'all'
              ? 'Try adjusting your search query or filters to find gear.'
              : 'Start tracking studio assets by adding your first equipment.'
          }
          action={{
            label: 'Add Equipment',
            onClick: () => {
              setEditingItem(null)
              setIsAddModalOpen(true)
            },
          }}
        />
      ) : (
        <>
          {/* DESKTOP TABLE VIEW (hidden on mobile < 768px) */}
          <div
            className="hidden md:block"
            style={{
              background: 'var(--color-surface)',
              border: '0.5px solid var(--color-border)',
              borderRadius: '12px',
              overflow: 'hidden',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
              <thead>
                <tr style={{ background: 'var(--color-surface-raised)' }}>
                  <th style={{ textAlign: 'left', fontSize: 'var(--text-xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-foreground-subtle)', padding: '12px 16px', borderBottom: '0.5px solid var(--color-border-strong)', width: '110px' }}>
                    Code
                  </th>
                  <th style={{ textAlign: 'left', fontSize: 'var(--text-xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-foreground-subtle)', padding: '12px 16px', borderBottom: '0.5px solid var(--color-border-strong)' }}>
                    Item & Brand
                  </th>
                  <th style={{ textAlign: 'left', fontSize: 'var(--text-xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-foreground-subtle)', padding: '12px 16px', borderBottom: '0.5px solid var(--color-border-strong)', width: '130px' }}>
                    Category
                  </th>
                  <th style={{ textAlign: 'left', fontSize: 'var(--text-xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-foreground-subtle)', padding: '12px 16px', borderBottom: '0.5px solid var(--color-border-strong)', width: '110px' }}>
                    Condition
                  </th>
                  <th style={{ textAlign: 'left', fontSize: 'var(--text-xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-foreground-subtle)', padding: '12px 16px', borderBottom: '0.5px solid var(--color-border-strong)' }}>
                    Assigned To / Bay
                  </th>
                  <th style={{ textAlign: 'left', fontSize: 'var(--text-xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-foreground-subtle)', padding: '12px 16px', borderBottom: '0.5px solid var(--color-border-strong)', width: '120px' }}>
                    Due Back
                  </th>
                  <th style={{ textAlign: 'left', fontSize: 'var(--text-xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-foreground-subtle)', padding: '12px 16px', borderBottom: '0.5px solid var(--color-border-strong)', width: '120px' }}>
                    Status
                  </th>
                  <th style={{ textAlign: 'right', fontSize: 'var(--text-xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-foreground-subtle)', padding: '12px 16px', borderBottom: '0.5px solid var(--color-border-strong)', width: '120px' }}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedItems.map((item) => {
                  const now = new Date()
                  const isOverdue =
                    item.status === 'out' &&
                    item.dueBackDate &&
                    item.dueBackDate.getTime() < now.getTime()

                  return (
                    <tr
                      key={item.itemId}
                      style={{
                        borderBottom: '0.5px solid var(--color-border)',
                        transition: 'background 0.1s ease',
                      }}
                    >
                      {/* Code */}
                      <td style={{ padding: '12px 16px', fontWeight: 700, fontFamily: 'monospace', fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>
                        <span
                          style={{
                            padding: '3px 6px',
                            borderRadius: '4px',
                            background: 'var(--color-surface-raised)',
                            border: '0.5px solid var(--color-border)',
                          }}
                        >
                          {item.itemCode}
                        </span>
                      </td>

                      {/* Name & Model */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontWeight: 600, color: 'var(--color-foreground)' }}>
                            {item.name}
                          </span>
                          <span style={{ fontSize: '11px', color: 'var(--color-foreground-subtle)' }}>
                            {item.brand} {item.model ? `· ${item.model}` : ''} {item.serialNumber ? `· S/N: ${item.serialNumber}` : ''}
                          </span>
                        </div>
                      </td>

                      {/* Category */}
                      <td style={{ padding: '12px 16px', color: 'var(--color-foreground-muted)', textTransform: 'capitalize' }}>
                        {item.category}
                      </td>

                      {/* Condition */}
                      <td style={{ padding: '12px 16px' }}>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            padding: '2px 8px',
                            borderRadius: '6px',
                            textTransform: 'capitalize',
                            background:
                              item.condition === 'excellent'
                                ? 'var(--color-success-muted)'
                                : item.condition === 'good'
                                ? 'var(--color-surface-raised)'
                                : item.condition === 'canUse'
                                ? 'var(--color-secondary-muted)'
                                : 'var(--color-danger-muted)',
                            color:
                              item.condition === 'excellent'
                                ? 'var(--color-success)'
                                : item.condition === 'good'
                                ? 'var(--color-foreground)'
                                : item.condition === 'canUse'
                                ? 'var(--color-secondary)'
                                : 'var(--color-danger)',
                          }}
                        >
                          {item.condition}
                        </span>
                      </td>

                      {/* Assigned To / Location */}
                      <td style={{ padding: '12px 16px' }}>
                        {item.status === 'out' && item.assignedToName ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div
                              style={{
                                width: '22px',
                                height: '22px',
                                borderRadius: '50%',
                                background: 'var(--color-primary-muted)',
                                color: 'var(--color-primary)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '10px',
                                fontWeight: 700,
                              }}
                            >
                              {item.assignedToName.charAt(0)}
                            </div>
                            <span style={{ fontWeight: 500 }}>{item.assignedToName}</span>
                          </div>
                        ) : (
                          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <i className="ti ti-map-pin" style={{ fontSize: '12px' }} />
                            {item.location || 'Studio'}
                          </span>
                        )}
                      </td>

                      {/* Due Back */}
                      <td
                        style={{
                          padding: '12px 16px',
                          color: isOverdue ? 'var(--color-danger)' : 'var(--color-foreground-muted)',
                          fontWeight: isOverdue ? 700 : 400,
                        }}
                      >
                        {item.status === 'out' ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            {isOverdue && <i className="ti ti-alert-triangle" style={{ fontSize: '13px' }} />}
                            <span>{formatShortDate(item.dueBackDate)}</span>
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>

                      {/* Status Badge */}
                      <td style={{ padding: '12px 16px' }}>
                        <Badge variant={item.status} />
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        {isAdminOrManager ? (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <button
                              type="button"
                              title="Edit Equipment"
                              onClick={() => {
                                setEditingItem(item)
                                setIsAddModalOpen(true)
                              }}
                              style={{
                                width: '30px',
                                height: '30px',
                                borderRadius: '6px',
                                background: 'transparent',
                                border: '0.5px solid var(--color-border)',
                                color: 'var(--color-foreground-muted)',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              <i className="ti ti-edit" style={{ fontSize: '14px' }} />
                            </button>

                            {item.status !== 'retired' && (
                              <button
                                type="button"
                                title="Retire / Dispose"
                                onClick={() => setRetiringItem(item)}
                                style={{
                                  width: '30px',
                                  height: '30px',
                                  borderRadius: '6px',
                                  background: 'transparent',
                                  border: '0.5px solid var(--color-border)',
                                  color: 'var(--color-foreground-subtle)',
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                <i className="ti ti-archive" style={{ fontSize: '14px' }} />
                              </button>
                            )}

                            <button
                              type="button"
                              title="Delete Equipment"
                              onClick={() => setDeletingItem(item)}
                              style={{
                                width: '30px',
                                height: '30px',
                                borderRadius: '6px',
                                background: 'transparent',
                                border: '0.5px solid var(--color-border)',
                                color: 'var(--color-danger)',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              <i className="ti ti-trash" style={{ fontSize: '14px' }} />
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            {item.status === 'available' ? (
                              <Link
                                href="/erp/equipment/checkout"
                                style={{
                                  padding: '4px 10px',
                                  borderRadius: '6px',
                                  background: 'var(--color-secondary-muted)',
                                  border: '0.5px solid var(--color-secondary)',
                                  color: 'var(--color-secondary)',
                                  fontSize: 'var(--text-xs)',
                                  fontWeight: 600,
                                  textDecoration: 'none',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                }}
                              >
                                <i className="ti ti-arrow-right-circle" style={{ fontSize: '13px' }} />
                                <span>Check out</span>
                              </Link>
                            ) : item.status === 'out' ? (
                              isItemAssignedToUser(item) ? (
                                <Link
                                  href="/erp/equipment/held"
                                  style={{
                                    padding: '4px 10px',
                                    borderRadius: '6px',
                                    background: 'var(--color-accent-muted)',
                                    border: '0.5px solid var(--color-accent)',
                                    color: 'var(--color-accent)',
                                    fontSize: 'var(--text-xs)',
                                    fontWeight: 600,
                                    textDecoration: 'none',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                  }}
                                >
                                  <i className="ti ti-arrow-back-up" style={{ fontSize: '13px' }} />
                                  <span>Check in</span>
                                </Link>
                              ) : (
                                <span
                                  style={{
                                    fontSize: 'var(--text-xs)',
                                    color: 'var(--color-foreground-subtle)',
                                    whiteSpace: 'nowrap',
                                  }}
                                  title={`Held by ${item.assignedToName || 'staff'}`}
                                >
                                  Held by {item.assignedToName?.split(' ')[0] || 'staff'}
                                </span>
                              )
                            ) : (
                              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>
                                —
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* MOBILE RESPONSIVE CARDS VIEW (block on mobile < 768px) */}
          <div className="flex flex-col gap-3 md:hidden">
            {paginatedItems.map((item) => {
              const now = new Date()
              const isOverdue =
                item.status === 'out' &&
                item.dueBackDate &&
                item.dueBackDate.getTime() < now.getTime()

              return (
                <div
                  key={item.itemId}
                  style={{
                    background: 'var(--color-surface)',
                    border: '0.5px solid var(--color-border)',
                    borderLeft: `4px solid ${
                      isOverdue
                        ? 'var(--color-danger)'
                        : item.status === 'available'
                        ? 'var(--color-success)'
                        : item.status === 'out'
                        ? 'var(--color-secondary)'
                        : 'var(--color-border)'
                    }`,
                    borderRadius: '12px',
                    padding: '14px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  {/* Top Bar: Code Tag + Status Badge */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <span
                      style={{
                        fontFamily: 'monospace',
                        fontWeight: 700,
                        fontSize: '11px',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: 'var(--color-surface-raised)',
                        border: '0.5px solid var(--color-border)',
                        color: 'var(--color-foreground-muted)',
                      }}
                    >
                      {item.itemCode}
                    </span>
                    <Badge variant={item.status} />
                  </div>

                  {/* Title & Brand */}
                  <div>
                    <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 700, margin: 0, color: 'var(--color-foreground)' }}>
                      {item.name}
                    </h3>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>
                      {item.brand} {item.model ? `· ${item.model}` : ''}
                    </span>
                  </div>

                  {/* Metadata Row: Category & Location */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>
                    <span style={{ textTransform: 'capitalize' }}>
                      {item.category} · Condition: <b>{item.condition}</b>
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                      <i className="ti ti-map-pin" style={{ fontSize: '12px' }} />
                      {item.location || 'Studio'}
                    </span>
                  </div>

                  {/* Holder Info if Out */}
                  {item.status === 'out' && (
                    <div
                      style={{
                        background: isOverdue ? 'var(--color-danger-muted)' : 'var(--color-surface-raised)',
                        border: `0.5px solid ${isOverdue ? 'var(--color-danger)' : 'var(--color-border)'}`,
                        borderRadius: '8px',
                        padding: '8px 10px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: 'var(--text-xs)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <i className="ti ti-user" style={{ fontSize: '13px', color: 'var(--color-primary)' }} />
                        <span style={{ fontWeight: 600 }}>{item.assignedToName || 'Assigned Crew'}</span>
                      </div>
                      <span style={{ color: isOverdue ? 'var(--color-danger)' : 'var(--color-foreground-muted)', fontWeight: isOverdue ? 700 : 500 }}>
                        {isOverdue ? 'OVERDUE: ' : 'Due: '}
                        {formatShortDate(item.dueBackDate)}
                      </span>
                    </div>
                  )}

                  {/* Card Actions Footer */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'flex-end',
                      gap: '8px',
                      paddingTop: '8px',
                      borderTop: '0.5px solid var(--color-border)',
                    }}
                  >
                    {isAdminOrManager ? (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingItem(item)
                            setIsAddModalOpen(true)
                          }}
                          style={{
                            height: '36px',
                            padding: '0 14px',
                            borderRadius: '8px',
                            background: 'transparent',
                            border: '0.5px solid var(--color-border)',
                            color: 'var(--color-foreground)',
                            fontSize: 'var(--text-xs)',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                          }}
                        >
                          <i className="ti ti-edit" />
                          <span>Edit</span>
                        </button>

                        {item.status !== 'retired' && (
                          <button
                            type="button"
                            onClick={() => setRetiringItem(item)}
                            style={{
                              height: '36px',
                              padding: '0 12px',
                              borderRadius: '8px',
                              background: 'transparent',
                              border: '0.5px solid var(--color-border)',
                              color: 'var(--color-foreground-subtle)',
                              fontSize: 'var(--text-xs)',
                              fontWeight: 500,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                            }}
                          >
                            <i className="ti ti-archive" />
                            <span>Retire</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => setDeletingItem(item)}
                          style={{
                            height: '36px',
                            padding: '0 12px',
                            borderRadius: '8px',
                            background: 'transparent',
                            border: '0.5px solid var(--color-border)',
                            color: 'var(--color-danger)',
                            fontSize: 'var(--text-xs)',
                            fontWeight: 500,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                          }}
                        >
                          <i className="ti ti-trash" />
                          <span>Delete</span>
                        </button>
                      </>
                    ) : (
                      <>
                        {item.status === 'available' ? (
                          <Link
                            href="/erp/equipment/checkout"
                            style={{
                              height: '36px',
                              padding: '0 14px',
                              borderRadius: '8px',
                              background: 'var(--color-secondary-muted)',
                              border: '0.5px solid var(--color-secondary)',
                              color: 'var(--color-secondary)',
                              fontSize: 'var(--text-xs)',
                              fontWeight: 600,
                              textDecoration: 'none',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                            }}
                          >
                            <i className="ti ti-arrow-right-circle" />
                            <span>Check out</span>
                          </Link>
                        ) : item.status === 'out' ? (
                          isItemAssignedToUser(item) ? (
                            <Link
                              href="/erp/equipment/held"
                              style={{
                                height: '36px',
                                padding: '0 14px',
                                borderRadius: '8px',
                                background: 'var(--color-accent-muted)',
                                border: '0.5px solid var(--color-accent)',
                                color: 'var(--color-accent)',
                                fontSize: 'var(--text-xs)',
                                fontWeight: 600,
                                textDecoration: 'none',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                              }}
                            >
                              <i className="ti ti-arrow-back-up" />
                              <span>Check in</span>
                            </Link>
                          ) : (
                            <span
                              style={{
                                fontSize: 'var(--text-xs)',
                                color: 'var(--color-foreground-subtle)',
                                padding: '8px 0',
                              }}
                            >
                              Held by {item.assignedToName || 'staff'}
                            </span>
                          )
                        ) : null}
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* ─── PAGINATION BAR ───────────────────────────────────────── */}
          {filteredItems.length > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px',
                padding: '12px 16px',
                background: 'var(--color-surface)',
                border: '0.5px solid var(--color-border)',
                borderRadius: '12px',
                marginTop: '12px',
              }}
            >
              {/* Left: Showing info & Rows per page */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>
                  Showing <b>{Math.min(filteredItems.length, (safeCurrentPage - 1) * pageSize + 1)}</b>–<b>{Math.min(filteredItems.length, safeCurrentPage * pageSize)}</b> of <b>{filteredItems.length}</b> items
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>Rows:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value))
                      setCurrentPage(1)
                    }}
                    style={{
                      fontFamily: 'var(--font-inter)',
                      height: '30px',
                      background: 'var(--color-surface-raised)',
                      border: '0.5px solid var(--color-border)',
                      borderRadius: '6px',
                      padding: '0 8px',
                      fontSize: 'var(--text-xs)',
                      color: 'var(--color-foreground)',
                      outline: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    <option value={10}>10</option>
                    <option value={15}>15</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                  </select>
                </div>
              </div>

              {/* Right: Prev, Page X of Y, Next */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }} className="sm:!w-auto justify-between sm:justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={safeCurrentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  style={{
                    height: '34px',
                    padding: '0 12px',
                    fontSize: 'var(--text-xs)',
                    gap: '4px',
                  }}
                >
                  <i className="ti ti-chevron-left" />
                  Prev
                </Button>

                <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, padding: '0 8px', color: 'var(--color-foreground)', whiteSpace: 'nowrap' }}>
                  Page {safeCurrentPage} of {totalPages}
                </span>

                <Button
                  variant="outline"
                  size="sm"
                  disabled={safeCurrentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  style={{
                    height: '34px',
                    padding: '0 12px',
                    fontSize: 'var(--text-xs)',
                    gap: '4px',
                  }}
                >
                  Next
                  <i className="ti ti-chevron-right" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ─── ADD / EDIT MODAL ─────────────────────────────────────────── */}
      <AddEquipmentModal
        open={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false)
          setEditingItem(null)
          if (typeof window !== 'undefined' && window.location.search.includes('action=new')) {
            window.history.replaceState(null, '', window.location.pathname)
          }
        }}
        onSave={handleSaveEquipment}
        existingEquipment={equipmentList}
        initialItem={editingItem}
      />

      {/* ─── RETIRE MODAL ─────────────────────────────────────────────── */}
      <RetireEquipmentModal
        open={Boolean(retiringItem)}
        item={retiringItem}
        onClose={() => setRetiringItem(null)}
        onConfirm={handleRetireEquipment}
      />

      {/* ─── DELETE CONFIRM MODAL ─────────────────────────────────────── */}
      <ConfirmModal
        open={Boolean(deletingItem)}
        title="Delete Equipment Item"
        description={`Are you sure you want to delete ${deletingItem?.itemCode} (${deletingItem?.name})? This item will be removed from your active equipment inventory.`}
        confirmLabel="Delete Equipment"
        cancelLabel="Cancel"
        variant="danger"
        loading={deleteSubmitting}
        onConfirm={handleDeleteEquipment}
        onCancel={() => setDeletingItem(null)}
      />
    </div>
  )
}

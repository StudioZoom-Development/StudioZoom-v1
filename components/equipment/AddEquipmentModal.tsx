'use client'

import React, { useState, useEffect } from 'react'
import type { Equipment, EquipmentCategory, EquipmentCondition, EquipmentStatus } from '@/types'
import { DateField } from '@/components/shared/DateField'
import {
  generateSuggestedCode,
  saveCustomEquipmentCategoryToFirestore,
  subscribeCustomEquipmentCategories,
} from '@/lib/firebase/queries/equipment'

interface AddEquipmentModalProps {
  open: boolean
  onClose: () => void
  onSave: (data: {
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
  }) => Promise<void>
  existingEquipment?: Equipment[]
  initialItem?: Equipment | null
}

const CATEGORIES: { key: EquipmentCategory; label: string; icon: string }[] = [
  { key: 'camera', label: 'Camera Body', icon: 'ti-camera' },
  { key: 'lens', label: 'Lens', icon: 'ti-aperture' },
  { key: 'light', label: 'Continuous Light', icon: 'ti-bulb' },
  { key: 'flash', label: 'Flash / Strobe', icon: 'ti-bolt' },
  { key: 'drone', label: 'Drone', icon: 'ti-drone' },
  { key: 'gimbal', label: 'Gimbal / Stabilizer', icon: 'ti-rotate-360' },
  { key: 'tripod', label: 'Tripod / Monopod', icon: 'ti-components' },
  { key: 'backdrop', label: 'Backdrop / Stand', icon: 'ti-wallpaper' },
  { key: 'sdCard', label: 'Memory Card', icon: 'ti-device-sd-card' },
  { key: 'battery', label: 'Battery', icon: 'ti-battery-charging' },
  { key: 'charger', label: 'Charger', icon: 'ti-plug' },
  { key: 'wire', label: 'Wire / Cable', icon: 'ti-cable' },
  { key: 'camcorder', label: 'Camcorder', icon: 'ti-video' },
  { key: 'other', label: 'Other Gear', icon: 'ti-box' },
]

const CONDITIONS: { key: EquipmentCondition; label: string; desc: string }[] = [
  { key: 'excellent', label: 'Excellent', desc: 'Like new, zero flaws' },
  { key: 'good', label: 'Good', desc: 'Normal wear, 100% operational' },
  { key: 'canUse', label: 'Can Use', desc: 'Minor cosmetic marks' },
  { key: 'service', label: 'Needs Service', desc: 'Requires maintenance' },
  { key: 'damaged', label: 'Damaged', desc: 'Faulty, not for shoot' },
]

function EquipmentModalContent({
  onClose,
  onSave,
  existingEquipment,
  initialItem,
}: {
  onClose: () => void
  onSave: AddEquipmentModalProps['onSave']
  existingEquipment: Equipment[]
  initialItem?: Equipment | null
}) {
  const isEditing = Boolean(initialItem)
  const defaultCat: EquipmentCategory = initialItem?.category || 'camera'

  const [categories, setCategories] = useState<{ key: EquipmentCategory; label: string; icon: string }[]>(() => {
    const list = [...CATEGORIES]
    const existingKeys = new Set(list.map((c) => c.key))

    if (existingEquipment) {
      existingEquipment.forEach((item) => {
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
    }

    try {
      const stored = typeof window !== 'undefined' ? localStorage.getItem('studio_custom_equipment_categories') : null
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed)) {
          parsed.forEach((cat) => {
            if (cat && cat.key && !existingKeys.has(cat.key)) {
              existingKeys.add(cat.key)
              list.push(cat)
            }
          })
        }
      }
    } catch {
      // ignore storage errors
    }

    return list
  })

  const [category, setCategory] = useState<EquipmentCategory>(defaultCat)
  const [isAddingCategory, setIsAddingCategory] = useState<boolean>(false)
  const [newCategoryName, setNewCategoryName] = useState<string>('')

  const [itemCode, setItemCode] = useState<string>(() =>
    initialItem ? initialItem.itemCode : generateSuggestedCode(defaultCat, existingEquipment)
  )
  const [name, setName] = useState<string>(() => initialItem?.name || '')
  const [brand, setBrand] = useState<string>(() => initialItem?.brand || '')
  const [model, setModel] = useState<string>(() => initialItem?.model || '')
  const [serialNumber, setSerialNumber] = useState<string>(() => initialItem?.serialNumber || '')
  const [purchaseDateStr, setPurchaseDateStr] = useState<string>(() =>
    initialItem?.purchaseDate
      ? initialItem.purchaseDate.toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0]
  )
  const [purchasePrice, setPurchasePrice] = useState<string>(() =>
    initialItem?.purchasePrice ? String(initialItem.purchasePrice) : ''
  )
  const [vendor, setVendor] = useState<string>(() => initialItem?.vendor || '')
  const [warrantyDateStr, setWarrantyDateStr] = useState<string>(() =>
    initialItem?.warrantyExpiry ? initialItem.warrantyExpiry.toISOString().split('T')[0] : ''
  )
  const [condition, setCondition] = useState<EquipmentCondition>(() => initialItem?.condition || 'good')
  const [location, setLocation] = useState<string>(() => initialItem?.location || 'Equipment Room')
  const [notes, setNotes] = useState<string>(() => initialItem?.notes || '')
  const [photoUrl, setPhotoUrl] = useState<string>(() => initialItem?.photoUrl || '')
  const [status] = useState<EquipmentStatus>(() => initialItem?.status || 'available')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCategoryChange = (newCat: EquipmentCategory) => {
    setCategory(newCat)
    if (!isEditing) {
      setItemCode(generateSuggestedCode(newCat, existingEquipment))
    }
  }

  // Subscribe to real-time custom categories from Firestore
  useEffect(() => {
    const unsub = subscribeCustomEquipmentCategories((firestoreCats) => {
      if (firestoreCats.length === 0) return
      setCategories((prev) => {
        const existingKeys = new Set(prev.map((c) => c.key))
        const toAdd = firestoreCats.filter((fc) => !existingKeys.has(fc.key as EquipmentCategory))
        if (toAdd.length === 0) return prev
        return [
          ...prev,
          ...toAdd.map((fc) => ({
            key: fc.key as EquipmentCategory,
            label: fc.label,
            icon: fc.icon || 'ti-tag',
          })),
        ]
      })
    })
    return () => unsub()
  }, [])

  const handleCreateCategory = () => {
    const trimmed = newCategoryName.trim()
    if (!trimmed) return

    const key = (
      trimmed
        .replace(/[^a-zA-Z0-9 ]/g, '')
        .split(' ')
        .filter(Boolean)
        .map((w, idx) => (idx === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
        .join('') || trimmed.toLowerCase().replace(/\s+/g, '_')
    ) as EquipmentCategory

    const newCatItem = {
      key,
      label: trimmed,
      icon: 'ti-tag',
    }

    setCategories((prev) => {
      if (prev.some((c) => c.key === key || c.label.toLowerCase() === trimmed.toLowerCase())) {
        return prev
      }
      const next = [...prev, newCatItem]
      try {
        const customOnly = next.filter((n) => !CATEGORIES.some((d) => d.key === n.key))
        localStorage.setItem('studio_custom_equipment_categories', JSON.stringify(customOnly))
      } catch {
        // ignore storage errors
      }
      return next
    })

    // Save to Cloud Firestore in /studioSettings/equipmentCategories so all team members have it
    saveCustomEquipmentCategoryToFirestore(newCatItem)

    handleCategoryChange(key)
    setIsAddingCategory(false)
    setNewCategoryName('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError('Equipment name is required')
      return
    }
    if (!brand.trim()) {
      setError('Brand is required')
      return
    }
    if (!serialNumber.trim()) {
      setError('Serial number is required')
      return
    }
    if (!location.trim()) {
      setError('Location / Storage bay is required')
      return
    }

    try {
      setLoading(true)
      setError(null)

      const purchaseDate = purchaseDateStr ? new Date(purchaseDateStr) : undefined
      const warrantyExpiry = warrantyDateStr ? new Date(warrantyDateStr) : undefined

      await onSave({
        itemCode: itemCode.trim(),
        name: name.trim(),
        category,
        brand: brand.trim(),
        model: model.trim(),
        serialNumber: serialNumber.trim(),
        purchaseDate,
        purchasePrice: Number(purchasePrice) || 0,
        vendor: vendor.trim() || undefined,
        warrantyExpiry,
        condition,
        location: location.trim(),
        photoUrl: photoUrl.trim() || undefined,
        status: isEditing ? status : 'available',
        notes: notes.trim() || undefined,
      })

      onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save equipment'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        width: '100%',
        maxWidth: '720px',
        maxHeight: '92vh',
        background: 'var(--color-surface)',
        border: '0.5px solid var(--color-border)',
        borderRadius: '16px',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
        overflow: 'hidden',
        fontFamily: 'var(--font-inter)',
        color: 'var(--color-foreground)',
      }}
    >
      {/* Modal Header */}
      <div
        style={{
          padding: '18px 24px',
          borderBottom: '0.5px solid var(--color-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--color-surface)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              background: 'var(--color-accent-muted)',
              color: 'var(--color-accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '20px',
            }}
          >
            <i className="ti ti-tools" />
          </div>
          <div>
            <h2
              style={{
                fontSize: 'var(--text-lg)',
                fontWeight: 700,
                margin: 0,
                lineHeight: 1.2,
              }}
            >
              {isEditing ? 'Edit Equipment Asset' : 'Add New Equipment'}
            </h2>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>
              {isEditing ? `Editing ${initialItem?.itemCode}` : 'Register studio cameras, lenses, lights & accessories'}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--color-foreground-muted)',
            display: 'flex',
            padding: '6px',
            borderRadius: '6px',
          }}
        >
          <i className="ti ti-x" style={{ fontSize: '20px' }} />
        </button>
      </div>

      {/* Modal Body / Form */}
      <form
        onSubmit={handleSubmit}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '18px',
        }}
      >
        {error && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: '8px',
              background: 'var(--color-danger-muted)',
              border: '0.5px solid var(--color-danger)',
              color: 'var(--color-danger)',
              fontSize: 'var(--text-xs)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <i className="ti ti-alert-circle" style={{ fontSize: '16px' }} />
            <span>{error}</span>
          </div>
        )}

        {/* Asset ID Banner (QR code removed) */}
        <div
          style={{
            background: 'var(--color-surface-raised)',
            border: '0.5px solid var(--color-border)',
            borderRadius: '12px',
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-foreground-subtle)', fontWeight: 600 }}>
              Unique Asset Tag
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="text"
                value={itemCode}
                onChange={(e) => setItemCode(e.target.value.toUpperCase())}
                placeholder="CAM-001"
                style={{
                  fontFamily: 'monospace',
                  fontWeight: 700,
                  fontSize: 'var(--text-base)',
                  background: 'var(--color-surface)',
                  border: '0.5px solid var(--color-border)',
                  borderRadius: '6px',
                  padding: '4px 10px',
                  color: 'var(--color-foreground)',
                  width: '140px',
                  letterSpacing: '0.05em',
                }}
              />
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>
                Auto-formatted tag
              </span>
            </div>
          </div>
        </div>

        {/* Category Selector with Add Category button */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
            <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-foreground-subtle)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Category
            </label>
            {!isAddingCategory && (
              <button
                type="button"
                onClick={() => setIsAddingCategory(true)}
                style={{
                  height: '26px',
                  padding: '0 10px',
                  borderRadius: '6px',
                  background: 'var(--color-primary-muted)',
                  border: '0.5px solid var(--color-primary)',
                  color: 'var(--color-primary)',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  transition: 'all 0.15s ease',
                }}
              >
                <i className="ti ti-plus" style={{ fontSize: '12px' }} />
                <span>Add Category</span>
              </button>
            )}
          </div>

          {/* Inline Add Category Form */}
          {isAddingCategory && (
            <div
              style={{
                background: 'var(--color-surface-raised)',
                border: '0.5px solid var(--color-primary)',
                borderRadius: '8px',
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                flexWrap: 'wrap',
              }}
            >
              <i className="ti ti-folder-plus" style={{ fontSize: '18px', color: 'var(--color-primary)' }} />
              <input
                type="text"
                autoFocus
                placeholder="Enter new category name (e.g. Audio Recorder, Fog Machine)..."
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleCreateCategory()
                  } else if (e.key === 'Escape') {
                    setIsAddingCategory(false)
                    setNewCategoryName('')
                  }
                }}
                style={{
                  flex: 1,
                  minWidth: '200px',
                  height: '32px',
                  padding: '0 10px',
                  borderRadius: '6px',
                  background: 'var(--color-surface)',
                  border: '0.5px solid var(--color-border)',
                  fontSize: 'var(--text-xs)',
                  color: 'var(--color-foreground)',
                  outline: 'none',
                }}
              />
              <button
                type="button"
                onClick={handleCreateCategory}
                style={{
                  height: '32px',
                  padding: '0 14px',
                  borderRadius: '6px',
                  background: 'var(--color-primary)',
                  border: 'none',
                  color: '#ffffff',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <i className="ti ti-check" />
                <span>Save</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsAddingCategory(false)
                  setNewCategoryName('')
                }}
                style={{
                  height: '32px',
                  padding: '0 10px',
                  borderRadius: '6px',
                  background: 'transparent',
                  border: '0.5px solid var(--color-border)',
                  color: 'var(--color-foreground-muted)',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          )}

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
              gap: '8px',
            }}
          >
            {categories.map((cat) => {
              const isSelected = category === cat.key
              return (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => handleCategoryChange(cat.key)}
                  style={{
                    padding: '8px 10px',
                    borderRadius: '8px',
                    border: `0.5px solid ${isSelected ? 'var(--color-primary)' : 'var(--color-border)'}`,
                    background: isSelected ? 'var(--color-primary-muted)' : 'var(--color-surface-raised)',
                    color: isSelected ? 'var(--color-primary)' : 'var(--color-foreground-muted)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: 'var(--text-xs)',
                    fontWeight: isSelected ? 700 : 500,
                    textAlign: 'left',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <i className={`ti ${cat.icon}`} style={{ fontSize: '15px' }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {cat.label}
                  </span>
                </button>
              )
            })}

            {/* Plus Tile in the category grid */}
            {!isAddingCategory && (
              <button
                type="button"
                onClick={() => setIsAddingCategory(true)}
                style={{
                  padding: '8px 10px',
                  borderRadius: '8px',
                  border: '1px dashed var(--color-primary)',
                  background: 'var(--color-surface)',
                  color: 'var(--color-primary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  transition: 'all 0.15s ease',
                }}
              >
                <i className="ti ti-plus" style={{ fontSize: '14px' }} />
                <span>Add Type</span>
              </button>
            )}
          </div>
        </div>

        {/* 2-Column Responsive Form Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Equipment Name */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-foreground)' }}>
              Equipment Name <span style={{ color: 'var(--color-danger)' }}>*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sony A7 IV, 24-70mm f/2.8 GM"
              style={{
                height: '38px',
                borderRadius: '8px',
                background: 'var(--color-surface-raised)',
                border: '0.5px solid var(--color-border)',
                padding: '0 12px',
                fontSize: 'var(--text-sm)',
                color: 'var(--color-foreground)',
                outline: 'none',
              }}
            />
          </div>

          {/* Brand */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-foreground)' }}>
              Brand / Manufacturer <span style={{ color: 'var(--color-danger)' }}>*</span>
            </label>
            <input
              type="text"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="e.g. Sony, Canon, Godox, Aputure, DJI"
              style={{
                height: '38px',
                borderRadius: '8px',
                background: 'var(--color-surface-raised)',
                border: '0.5px solid var(--color-border)',
                padding: '0 12px',
                fontSize: 'var(--text-sm)',
                color: 'var(--color-foreground)',
                outline: 'none',
              }}
            />
          </div>

          {/* Model */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-foreground)' }}>
              Model Number
            </label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="e.g. ILCE-7M4, SEL2470GM2"
              style={{
                height: '38px',
                borderRadius: '8px',
                background: 'var(--color-surface-raised)',
                border: '0.5px solid var(--color-border)',
                padding: '0 12px',
                fontSize: 'var(--text-sm)',
                color: 'var(--color-foreground)',
                outline: 'none',
              }}
            />
          </div>

          {/* Serial Number */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-foreground)' }}>
              Serial Number <span style={{ color: 'var(--color-danger)' }}>*</span>
            </label>
            <input
              type="text"
              value={serialNumber}
              onChange={(e) => setSerialNumber(e.target.value)}
              placeholder="e.g. S/N 49830219"
              style={{
                height: '38px',
                borderRadius: '8px',
                background: 'var(--color-surface-raised)',
                border: '0.5px solid var(--color-border)',
                padding: '0 12px',
                fontSize: 'var(--text-sm)',
                color: 'var(--color-foreground)',
                outline: 'none',
              }}
            />
          </div>

          {/* Location / Storage Bay */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-foreground)' }}>
              Storage Location / Bay <span style={{ color: 'var(--color-danger)' }}>*</span>
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Shelf A1, Lens Locker 2, Pelican Case #3"
              style={{
                height: '38px',
                borderRadius: '8px',
                background: 'var(--color-surface-raised)',
                border: '0.5px solid var(--color-border)',
                padding: '0 12px',
                fontSize: 'var(--text-sm)',
                color: 'var(--color-foreground)',
                outline: 'none',
              }}
            />
          </div>

          {/* Purchase Price */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-foreground)' }}>
              Purchase Price (₹)
            </label>
            <div style={{ position: 'relative' }}>
              <span
                style={{
                  position: 'absolute',
                  left: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--color-foreground-muted)',
                  fontSize: 'var(--text-sm)',
                }}
              >
                ₹
              </span>
              <input
                type="number"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value)}
                placeholder="0.00"
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  height: '38px',
                  borderRadius: '8px',
                  background: 'var(--color-surface-raised)',
                  border: '0.5px solid var(--color-border)',
                  padding: '0 12px 0 28px',
                  fontSize: 'var(--text-sm)',
                  color: 'var(--color-foreground)',
                  outline: 'none',
                }}
              />
            </div>
          </div>

          {/* Purchase Date */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-foreground)' }}>
              Purchase Date
            </label>
            <DateField
              value={purchaseDateStr}
              onChange={(val) => setPurchaseDateStr(val)}
              placeholder="Purchase Date"
              allowEmpty={true}
            />
          </div>

          {/* Warranty Expiry */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-foreground)' }}>
              Warranty Expiry Date
            </label>
            <DateField
              value={warrantyDateStr}
              onChange={(val) => setWarrantyDateStr(val)}
              placeholder="Warranty Expiry"
              allowEmpty={true}
            />
          </div>

          {/* Vendor / Supplier */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-foreground)' }}>
              Vendor / Supplier
            </label>
            <input
              type="text"
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
              placeholder="e.g. Soniq World, Fotocenter Chennai"
              style={{
                height: '38px',
                borderRadius: '8px',
                background: 'var(--color-surface-raised)',
                border: '0.5px solid var(--color-border)',
                padding: '0 12px',
                fontSize: 'var(--text-sm)',
                color: 'var(--color-foreground)',
                outline: 'none',
              }}
            />
          </div>

          {/* Photo URL */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-foreground)' }}>
              Photo URL
            </label>
            <input
              type="text"
              value={photoUrl}
              onChange={(e) => setPhotoUrl(e.target.value)}
              placeholder="https://..."
              style={{
                height: '38px',
                borderRadius: '8px',
                background: 'var(--color-surface-raised)',
                border: '0.5px solid var(--color-border)',
                padding: '0 12px',
                fontSize: 'var(--text-sm)',
                color: 'var(--color-foreground)',
                outline: 'none',
              }}
            />
          </div>
        </div>

        {/* Condition Selector */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-foreground-subtle)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Current Physical Condition
          </label>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
              gap: '8px',
            }}
          >
            {CONDITIONS.map((cond) => {
              const isSelected = condition === cond.key
              return (
                <button
                  key={cond.key}
                  type="button"
                  onClick={() => setCondition(cond.key)}
                  style={{
                    padding: '8px 10px',
                    borderRadius: '8px',
                    border: `0.5px solid ${isSelected ? 'var(--color-accent)' : 'var(--color-border)'}`,
                    background: isSelected ? 'var(--color-accent-muted)' : 'var(--color-surface-raised)',
                    color: isSelected ? 'var(--color-accent)' : 'var(--color-foreground)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px',
                    textAlign: 'left',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700 }}>{cond.label}</span>
                  <span style={{ fontSize: '10px', color: 'var(--color-foreground-subtle)' }}>{cond.desc}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Notes */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-foreground)' }}>
            Included Accessories / Special Notes
          </label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. 2x NP-FZ100 batteries, body cap, dual charger included in pouch."
            style={{
              borderRadius: '8px',
              background: 'var(--color-surface-raised)',
              border: '0.5px solid var(--color-border)',
              padding: '8px 12px',
              fontSize: 'var(--text-sm)',
              color: 'var(--color-foreground)',
              outline: 'none',
              resize: 'vertical',
              fontFamily: 'var(--font-inter)',
            }}
          />
        </div>

        {/* Modal Footer */}
        <div
          style={{
            paddingTop: '16px',
            borderTop: '0.5px solid var(--color-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '10px',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            style={{
              height: '38px',
              padding: '0 16px',
              borderRadius: '8px',
              background: 'transparent',
              border: '0.5px solid var(--color-border)',
              color: 'var(--color-foreground)',
              fontSize: 'var(--text-sm)',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            style={{
              height: '38px',
              padding: '0 20px',
              borderRadius: '8px',
              background: 'var(--color-primary)',
              border: 'none',
              color: '#ffffff',
              fontSize: 'var(--text-sm)',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            {loading && <i className="ti ti-loader animate-spin" />}
            <span>{isEditing ? 'Save Changes' : 'Add Equipment'}</span>
          </button>
        </div>
      </form>
    </div>
  )
}

export function AddEquipmentModal({
  open,
  onClose,
  onSave,
  existingEquipment = [],
  initialItem,
}: AddEquipmentModalProps) {
  if (!open) return null

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9990,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        overflowY: 'auto',
      }}
    >
      <EquipmentModalContent
        key={initialItem?.itemId || 'new-equipment'}
        onClose={onClose}
        onSave={onSave}
        existingEquipment={existingEquipment}
        initialItem={initialItem}
      />
    </div>
  )
}

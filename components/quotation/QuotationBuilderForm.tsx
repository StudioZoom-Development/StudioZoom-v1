'use client'

import React, { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { Quotation, QuotationTemplateId, LineItem } from '@/types'
import { createQuotation, updateQuotation } from '@/lib/firebase/queries/quotations'
import { subscribeToClients } from '@/lib/firebase/queries/clients'
import { subscribeToPackageConfig, type PackageTemplate } from '@/lib/firebase/queries/settings'
import { formatIndianCurrency, numberToWordsINR } from '@/lib/payroll/calculator'
import { renderQuotationHtml, normalizeTemplateKey } from '@/lib/quotation/htmlTemplateEngine'
import { DateField } from '@/components/shared/DateField'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuthStore } from '@/store/authStore'
import { format } from 'date-fns'

interface TemplateOption {
  id: QuotationTemplateId
  name: string
  subtitle: string
  thumbnailUrl: string
  tag: string
}

const TEMPLATE_OPTIONS: TemplateOption[] = [
  {
    id: 'package1',
    name: 'Package 1',
    subtitle: 'Photo collage header, Line items, Contact & Instagram footer',
    thumbnailUrl: '/templates/quotations/thumbnail-1.jpg',
    tag: 'Wedding Editorial',
  },
  {
    id: 'package2',
    name: 'Package 2',
    subtitle: 'StudioZoom logo header, Place & Date, Respected Sir/Mam greeting, Office footer',
    thumbnailUrl: '/templates/quotations/thumbnail-2.jpg',
    tag: 'Media Production Estimation',
  },
  {
    id: 'package3',
    name: 'Package 3',
    subtitle: 'Floral cream paper, Great Opportunity greeting, [Date - Event], Dedicated Add-ons',
    thumbnailUrl: '/templates/quotations/thumbnail-3.jpg',
    tag: 'Royal Wedding & Add-ons',
  },
]

const EVENT_TYPE_PRESETS = [
  'Wedding & Reception',
  'Pre-Wedding Shoot',
  'Engagement Ceremony',
  'Corporate Film / Ad',
  'Maternity & Baby Shoot',
  'Fashion & Portfolio',
  'Birthday & Celebration',
]

interface QuotationBuilderFormProps {
  initialQuotation?: Quotation | null
  initialQuotationNumber?: string
  isEditMode?: boolean
}

export function QuotationBuilderForm({
  initialQuotation,
  initialQuotationNumber = 'ZS-Q-2026-001',
  isEditMode = false,
}: QuotationBuilderFormProps) {
  const router = useRouter()
  const appUser = useAuthStore((s) => s.appUser)

  // ─── FORM STATE ────────────────────────────────────────────────────────────
  const [templateId, setTemplateId] = useState<QuotationTemplateId>(
    initialQuotation?.templateId ? normalizeTemplateKey(initialQuotation.templateId) : 'package1'
  )
  const [quotationNumber] = useState<string>(
    initialQuotation?.quotationNumber || initialQuotationNumber
  )
  const [clientName, setClientName] = useState<string>(initialQuotation?.clientName || '')
  const [clientId, setClientId] = useState<string | undefined>(initialQuotation?.clientId)
  const [contact, setContact] = useState<string>(initialQuotation?.contact || '')
  const [email, setEmail] = useState<string>(initialQuotation?.email || '')
  const [place, setPlace] = useState<string>(initialQuotation?.place || 'Chennai')
  const [eventType, setEventType] = useState<string>(
    initialQuotation?.eventType || 'Wedding & Reception'
  )
  const [eventDate, setEventDate] = useState<Date | undefined>(
    initialQuotation?.eventDate ? new Date(initialQuotation.eventDate) : new Date()
  )
  const [validityDate, setValidityDate] = useState<Date>(() => {
    if (initialQuotation?.validityDate) {
      return new Date(initialQuotation.validityDate)
    }
    const d = new Date()
    d.setDate(d.getDate() + 15)
    return d
  })

  // Line items state (Primary services)
  const [lineItems, setLineItems] = useState<LineItem[]>(() => {
    if (initialQuotation?.lineItems && initialQuotation.lineItems.length > 0) {
      return initialQuotation.lineItems
    }
    return [
      { id: '1', description: 'Candid Wedding Photography (Full Day)', qty: 1, rate: 45000, amount: 45000 },
      { id: '2', description: 'Traditional HD Videography (Full Day)', qty: 1, rate: 35000, amount: 35000 },
      { id: '3', description: 'Cinematic Teaser & Highlight Reel', qty: 1, rate: 25000, amount: 25000 },
    ]
  })

  // Separate Add-ons state (Specially for Package 3 or custom add-on deliverables)
  const [addons, setAddons] = useState<LineItem[]>(() => {
    if (initialQuotation?.addons && initialQuotation.addons.length > 0) {
      return initialQuotation.addons
    }
    return []
  })

  // GST Switch State
  const [gstEnabled, setGstEnabled] = useState<boolean>(
    initialQuotation ? Boolean(initialQuotation.gstEnabled) : true
  )
  const [termsAndConditions, setTermsAndConditions] = useState<string>(
    initialQuotation?.termsAndConditions ||
    '1. 50% advance upon confirmation.\n2. Final deliverables dispatched within 3-4 weeks post shoot.'
  )
  const [status] = useState<Quotation['status']>(
    initialQuotation?.status || 'draft'
  )

  // Clients & Package presets
  const [existingClients, setExistingClients] = useState<Array<{ id: string; name: string; contact?: string; email?: string }>>([])
  const [packageTemplates, setPackageTemplates] = useState<PackageTemplate[]>([])

  // UI state
  const [isSaving, setIsSaving] = useState(false)
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false)
  const [activeTab, setActiveTab] = useState<'editor' | 'preview'>('editor')
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  // Live HTML Preview & Capacity Guard
  const [previewHtml, setPreviewHtml] = useState<string>('')
  const [previewScale, setPreviewScale] = useState<number>(0.6)
  const [isOverflowing, setIsOverflowing] = useState<boolean>(false)
  const previewContainerRef = React.useRef<HTMLDivElement>(null)
  const iframeRef = React.useRef<HTMLIFrameElement>(null)

  // Measure container and scale 794x1123 iframe to fit
  useEffect(() => {
    const el = previewContainerRef.current
    if (!el) return
    const updateScale = () => {
      const width = el.getBoundingClientRect().width
      if (width > 0) {
        setPreviewScale(width / 794)
      }
    }
    updateScale()
    const observer = new ResizeObserver(updateScale)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMsg({ text, type })
    setTimeout(() => setToastMsg(null), 3500)
  }

  // Load clients and package presets
  useEffect(() => {
    const unsubClients = subscribeToClients({}, (clients) => {
      setExistingClients(
        clients.map((c) => ({
          id: c.clientId,
          name: c.name,
          contact: c.contact || '',
          email: c.email || '',
        }))
      )
    })

    const unsubPackages = subscribeToPackageConfig((cfg) => {
      if (cfg?.packages) {
        setPackageTemplates(cfg.packages)
      }
    })

    return () => {
      unsubClients()
      unsubPackages()
    }
  }, [])

  // ─── FINANCIAL CALCULATIONS ────────────────────────────────────────────────
  const lineItemsSubtotal = useMemo(() => {
    return lineItems.reduce((acc, item) => acc + (Number(item.amount) || 0), 0)
  }, [lineItems])

  const addonsSubtotal = useMemo(() => {
    return addons.reduce((acc, item) => acc + (Number(item.amount) || 0), 0)
  }, [addons])

  const subtotal = useMemo(() => {
    return lineItemsSubtotal + addonsSubtotal
  }, [lineItemsSubtotal, addonsSubtotal])

  const cgst = useMemo(() => {
    if (!gstEnabled) return 0
    return Math.round(subtotal * 0.09)
  }, [subtotal, gstEnabled])

  const sgst = useMemo(() => {
    if (!gstEnabled) return 0
    return Math.round(subtotal * 0.09)
  }, [subtotal, gstEnabled])

  const grandTotal = useMemo(() => {
    if (!gstEnabled) return subtotal
    return subtotal + cgst + sgst
  }, [subtotal, cgst, sgst, gstEnabled])

  // Current Quotation snapshot for Preview and Generation
  const quotationSnapshot = useMemo<Quotation>(() => {
    return {
      quotationId: initialQuotation?.quotationId || 'temp-id',
      quotationNumber,
      templateId,
      clientId,
      clientName: clientName.trim(),
      contact,
      email,
      place,
      eventType,
      eventDate,
      validityDate,
      lineItems,
      addons,
      subtotal,
      gstEnabled,
      gstRate: 18,
      cgst,
      sgst,
      grandTotal,
      status,
      termsAndConditions,
      createdBy: appUser?.uid || 'admin',
      createdAt: initialQuotation?.createdAt || new Date(),
    }
  }, [
    initialQuotation,
    quotationNumber,
    templateId,
    clientId,
    clientName,
    contact,
    email,
    place,
    eventType,
    eventDate,
    validityDate,
    lineItems,
    addons,
    subtotal,
    gstEnabled,
    cgst,
    sgst,
    grandTotal,
    status,
    termsAndConditions,
    appUser,
  ])

  // Re-render preview on form change debounced 150ms
  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const html = await renderQuotationHtml(quotationSnapshot)
        setPreviewHtml(html)
      } catch (err) {
        console.error('[Preview generation error]:', err)
      }
    }, 150)
    return () => clearTimeout(timer)
  }, [quotationSnapshot])

  // Check overflow inside iframe content
  const checkOverflow = () => {
    try {
      const iframeDoc = iframeRef.current?.contentDocument
      if (!iframeDoc) return
      const contentEl = iframeDoc.querySelector('.content') as HTMLElement | null
      if (contentEl) {
        setIsOverflowing(contentEl.scrollHeight > contentEl.clientHeight + 2)
      }
    } catch {
      // ignore
    }
  }

  // ─── LINE ITEM HANDLERS ────────────────────────────────────────────────────
  const handleItemChange = (
    index: number,
    field: keyof LineItem,
    val: string | number,
    isAddon: boolean = false
  ) => {
    const setter = isAddon ? setAddons : setLineItems
    setter((prev) => {
      const copy = [...prev]
      const current = { ...copy[index] }

      if (field === 'description') {
        current.description = String(val)
      } else if (field === 'qty') {
        const qty = Math.max(1, Number(val) || 1)
        current.qty = qty
        current.amount = qty * current.rate
      } else if (field === 'rate') {
        const rate = Math.max(0, Number(val) || 0)
        current.rate = rate
        current.amount = current.qty * rate
      } else if (field === 'amount') {
        current.amount = Math.max(0, Number(val) || 0)
      }

      copy[index] = current
      return copy
    })
  }

  const handleAddLineItem = () => {
    setLineItems((prev) => [
      ...prev,
      {
        id: `item-${prev.length + 1}-${Math.random().toString(36).slice(2, 7)}`,
        description: '',
        qty: 1,
        rate: 0,
        amount: 0,
      },
    ])
  }

  const handleRemoveLineItem = (index: number) => {
    setLineItems((prev) => prev.filter((_, i) => i !== index))
  }

  const handleAddAddon = () => {
    setAddons((prev) => [
      ...prev,
      {
        id: `addon-${prev.length + 1}-${Math.random().toString(36).slice(2, 7)}`,
        description: '',
        qty: 1,
        rate: 0,
        amount: 0,
      },
    ])
  }

  const handleRemoveAddon = (index: number) => {
    setAddons((prev) => prev.filter((_, i) => i !== index))
  }

  const handleApplyPackage = (pkg: PackageTemplate) => {
    if (pkg.lineItems && pkg.lineItems.length > 0) {
      setLineItems(
        pkg.lineItems.map((item, idx) => ({
          id: `${pkg.id}-${idx}`,
          description: item.description,
          qty: item.qty || 1,
          rate: item.rate || 0,
          amount: item.amount || (item.qty || 1) * (item.rate || 0),
        }))
      )
      showToast(`Applied package: ${pkg.name}`)
    } else {
      setLineItems([
        {
          id: `${pkg.id}-pkg`,
          description: `${pkg.name} Package`,
          qty: 1,
          rate: pkg.price || 0,
          amount: pkg.price || 0,
        },
      ])
      showToast(`Applied package: ${pkg.name}`)
    }
  }

  // ─── ACTIONS: SAVE / DOWNLOAD / PREVIEW ─────────────────────────────────────
  const handleSave = async (targetStatus?: Quotation['status']) => {
    if (!clientName.trim()) {
      showToast('Please enter the client name.', 'error')
      return
    }

    try {
      setIsSaving(true)
      const saveStatus = targetStatus || status

      if (isEditMode && initialQuotation?.quotationId) {
        await updateQuotation(initialQuotation.quotationId, {
          templateId,
          clientId,
          clientName: clientName.trim(),
          contact,
          email,
          place,
          eventType,
          eventDate,
          validityDate,
          lineItems,
          addons,
          subtotal,
          gstEnabled,
          cgst,
          sgst,
          grandTotal,
          status: saveStatus,
          termsAndConditions,
        })
        showToast('Quotation updated successfully!')
      } else {
        await createQuotation({
          quotationNumber,
          templateId,
          clientId,
          clientName: clientName.trim(),
          contact,
          email,
          place,
          eventType,
          eventDate,
          validityDate,
          lineItems,
          addons,
          subtotal,
          gstEnabled,
          gstRate: 18,
          cgst,
          sgst,
          grandTotal,
          status: saveStatus,
          termsAndConditions,
          createdBy: appUser?.uid || 'admin',
        })
        showToast('Quotation created successfully!')
      }

      setTimeout(() => {
        router.push('/erp/quotations')
      }, 700)
    } catch (err) {
      console.error('[Save Quotation Error]:', err)
      showToast('Failed to save quotation', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDownloadPdf = async () => {
    try {
      setIsGeneratingPdf(true)
      const res = await fetch('/api/quotations/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quotation: quotationSnapshot }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Failed to generate PDF')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Quotation_${quotationNumber}_${(clientName || 'Draft').replace(/\s+/g, '_')}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 20000)
      showToast('Quotation PDF downloaded!')
    } catch (err: unknown) {
      console.error('[PDF Download Error]:', err)
      showToast(err instanceof Error ? err.message : 'Failed to generate PDF', 'error')
    } finally {
      setIsGeneratingPdf(false)
    }
  }

  const handlePreviewPdf = async () => {
    try {
      setIsGeneratingPdf(true)
      const res = await fetch('/api/quotations/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quotation: quotationSnapshot }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Failed to generate PDF')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch (err: unknown) {
      console.error('[PDF Preview Error]:', err)
      showToast(err instanceof Error ? err.message : 'Failed to open PDF preview', 'error')
    } finally {
      setIsGeneratingPdf(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', fontFamily: 'var(--font-inter)' }}>
      {/* TOAST FEEDBACK */}
      {toastMsg && (
        <div
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            zIndex: 10000,
            padding: '12px 20px',
            borderRadius: '8px',
            backgroundColor: toastMsg.type === 'error' ? 'var(--color-danger)' : 'var(--color-surface-raised)',
            border: `0.5px solid ${toastMsg.type === 'error' ? 'var(--color-danger)' : 'var(--color-primary)'}`,
            color: toastMsg.type === 'error' ? '#ffffff' : 'var(--color-foreground)',
            fontSize: 'var(--text-sm)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <i className={`ti ${toastMsg.type === 'error' ? 'ti-alert-circle' : 'ti-check'}`} />
          <span>{toastMsg.text}</span>
        </div>
      )}

      {/* HEADER BAR */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '14px',
          paddingBottom: '16px',
          borderBottom: '0.5px solid var(--color-border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={() => router.push('/erp/quotations')}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--color-foreground-muted)',
              fontSize: '20px',
              padding: '6px',
              display: 'flex',
              alignItems: 'center',
            }}
            title="Back to quotations"
          >
            <i className="ti ti-arrow-left" />
          </button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h1 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, margin: 0, color: 'var(--color-foreground)' }}>
                {isEditMode ? `Edit Quotation ${quotationNumber}` : 'New Quotation Builder'}
              </h1>
              <span
                style={{
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '6px',
                  backgroundColor: 'var(--color-primary-muted)',
                  color: 'var(--color-primary)',
                  border: '0.5px solid var(--color-primary)',
                }}
              >
                {quotationNumber}
              </span>
            </div>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)', margin: '4px 0 0 0' }}>
              Select Package 1, 2, or 3, customize deliverables and add-ons, toggle GST, and download print-ready PDF.
            </p>
          </div>
        </div>

        {/* TOP ACTIONS */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Button
            variant="outline"
            size="sm"
            onClick={handlePreviewPdf}
            disabled={isGeneratingPdf}
            style={{ fontSize: 'var(--text-xs)', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <i className="ti ti-eye" />
            <span>Preview PDF</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadPdf}
            disabled={isGeneratingPdf}
            style={{ fontSize: 'var(--text-xs)', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <i className="ti ti-download" />
            <span>Download PDF</span>
          </Button>

          <Button
            size="sm"
            onClick={() => handleSave('sent')}
            disabled={isSaving}
            style={{
              backgroundColor: 'var(--color-primary)',
              color: '#ffffff',
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            {isSaving ? <i className="ti ti-loader ti-spin" /> : <i className="ti ti-check" />}
            <span>Save & Finalize</span>
          </Button>
        </div>
      </div>

      {/* MOBILE TAB TOGGLE (< 768px) */}
      <div className="flex md:hidden" style={{ gap: '8px' }}>
        <button
          type="button"
          onClick={() => setActiveTab('editor')}
          style={{
            flex: 1,
            padding: '8px',
            borderRadius: '8px',
            border: '0.5px solid var(--color-border)',
            backgroundColor: activeTab === 'editor' ? 'var(--color-primary)' : 'var(--color-surface)',
            color: activeTab === 'editor' ? '#ffffff' : 'var(--color-foreground)',
            fontWeight: 600,
            fontSize: 'var(--text-xs)',
          }}
        >
          Quotation Editor
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('preview')}
          style={{
            flex: 1,
            padding: '8px',
            borderRadius: '8px',
            border: '0.5px solid var(--color-border)',
            backgroundColor: activeTab === 'preview' ? 'var(--color-primary)' : 'var(--color-surface)',
            color: activeTab === 'preview' ? '#ffffff' : 'var(--color-foreground)',
            fontWeight: 600,
            fontSize: 'var(--text-xs)',
          }}
        >
          Live A4 Preview
        </button>
      </div>

      {/* MAIN TWO-COLUMN SPLIT */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 58fr) minmax(0, 42fr)',
          gap: '24px',
          alignItems: 'start',
        }}
        className={activeTab === 'preview' ? 'hidden md:grid' : 'grid'}
      >
        {/* LEFT COLUMN: BUILDER CONTROLS */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* 1. TEMPLATE STATIONERY SELECTOR */}
          <div
            style={{
              backgroundColor: 'var(--color-surface)',
              border: '0.5px solid var(--color-border)',
              borderRadius: '12px',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-foreground)' }}>
                1. Select Quotation Package Template
              </span>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>
                Package 1, 2, or 3
              </span>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '12px',
              }}
            >
              {TEMPLATE_OPTIONS.map((tmpl) => {
                const isSelected = normalizeTemplateKey(tmpl.id) === normalizeTemplateKey(templateId)
                return (
                  <div
                    key={tmpl.id}
                    onClick={() => setTemplateId(tmpl.id)}
                    style={{
                      border: `1.5px solid ${isSelected ? 'var(--color-primary)' : 'var(--color-border)'}`,
                      borderRadius: '10px',
                      overflow: 'hidden',
                      cursor: 'pointer',
                      backgroundColor: isSelected ? 'var(--color-primary-muted)' : 'var(--color-surface-raised)',
                      transition: 'all 0.15s ease',
                      display: 'flex',
                      flexDirection: 'column',
                    }}
                  >
                    <div
                      style={{
                        height: '110px',
                        overflow: 'hidden',
                        position: 'relative',
                        backgroundColor: '#ffffff',
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={tmpl.thumbnailUrl}
                        alt={tmpl.name}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          objectPosition: 'top',
                        }}
                      />
                      {isSelected && (
                        <div
                          style={{
                            position: 'absolute',
                            top: '6px',
                            right: '6px',
                            backgroundColor: 'var(--color-primary)',
                            color: '#ffffff',
                            width: '20px',
                            height: '20px',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '12px',
                          }}
                        >
                          <i className="ti ti-check" />
                        </div>
                      )}
                    </div>
                    <div style={{ padding: '10px' }}>
                      <div
                        style={{
                          fontSize: 'var(--text-xs)',
                          fontWeight: 600,
                          color: isSelected ? 'var(--color-primary)' : 'var(--color-foreground)',
                          lineHeight: 1.3,
                        }}
                      >
                        {tmpl.name}
                      </div>
                      <div
                        style={{
                          fontSize: '0.65rem',
                          color: 'var(--color-foreground-muted)',
                          marginTop: '4px',
                        }}
                      >
                        {tmpl.tag}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* 2. ESSENTIAL CLIENT & EVENT DETAILS */}
          <div
            style={{
              backgroundColor: 'var(--color-surface)',
              border: '0.5px solid var(--color-border)',
              borderRadius: '12px',
              padding: '18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
            <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-foreground)' }}>
              2. Essential Details
            </span>

            {/* Client Search / Dropdown Quick Fill */}
            {existingClients.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--color-foreground-muted)' }}>
                  Load from Existing Client (Optional)
                </label>
                <select
                  onChange={(e) => {
                    const sel = existingClients.find((c) => c.id === e.target.value)
                    if (sel) {
                      setClientId(sel.id)
                      setClientName(sel.name)
                      if (sel.contact) setContact(sel.contact)
                      if (sel.email) setEmail(sel.email)
                    }
                  }}
                  defaultValue=""
                  style={{
                    height: '36px',
                    borderRadius: '8px',
                    backgroundColor: 'var(--color-surface-raised)',
                    border: '0.5px solid var(--color-border)',
                    color: 'var(--color-foreground)',
                    padding: '0 10px',
                    fontSize: 'var(--text-xs)',
                    fontFamily: 'var(--font-inter)',
                  }}
                >
                  <option value="" disabled>
                    -- Select Client --
                  </option>
                  {existingClients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.contact ? `(${c.contact})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--color-foreground-muted)' }}>
                  Client Name *
                </label>
                <Input
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="e.g. Meera & Vikram"
                  style={{ height: '36px', fontSize: 'var(--text-sm)' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--color-foreground-muted)' }}>
                  Phone / Contact
                </label>
                <Input
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder="e.g. +91 98765 43210"
                  style={{ height: '36px', fontSize: 'var(--text-sm)' }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--color-foreground-muted)' }}>
                  Event Type
                </label>
                <input
                  list="event-types-list"
                  value={eventType}
                  onChange={(e) => setEventType(e.target.value)}
                  placeholder="e.g. Wedding & Reception"
                  style={{
                    height: '36px',
                    borderRadius: '8px',
                    backgroundColor: 'var(--color-surface-raised)',
                    border: '0.5px solid var(--color-border)',
                    color: 'var(--color-foreground)',
                    padding: '0 10px',
                    fontSize: 'var(--text-sm)',
                    fontFamily: 'var(--font-inter)',
                  }}
                />
                <datalist id="event-types-list">
                  {EVENT_TYPE_PRESETS.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--color-foreground-muted)' }}>
                  Shoot Location / Place
                </label>
                <Input
                  value={place}
                  onChange={(e) => setPlace(e.target.value)}
                  placeholder="e.g. Chennai / Mahabalipuram"
                  style={{ height: '36px', fontSize: 'var(--text-sm)' }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--color-foreground-muted)' }}>
                  Event Date
                </label>
                <DateField
                  value={eventDate ? format(eventDate, 'yyyy-MM-dd') : ''}
                  onChange={(val) => setEventDate(val ? new Date(val) : undefined)}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--color-foreground-muted)' }}>
                  Quotation Valid Until
                </label>
                <DateField
                  value={format(validityDate, 'yyyy-MM-dd')}
                  onChange={(val) => setValidityDate(val ? new Date(val) : new Date(Date.now() + 15 * 86400000))}
                />
              </div>
            </div>
          </div>

          {/* 3. PRESET PACKAGE QUICK-ADD */}
          {packageTemplates.length > 0 && (
            <div
              style={{
                backgroundColor: 'var(--color-primary-muted)',
                borderRadius: '10px',
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '10px',
                border: '0.5px solid var(--color-primary)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="ti ti-package" style={{ fontSize: '18px', color: 'var(--color-primary)' }} />
                <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-primary)' }}>
                  Apply Studio Package:
                </span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {packageTemplates.map((pkg) => (
                  <button
                    key={pkg.id}
                    type="button"
                    onClick={() => handleApplyPackage(pkg)}
                    style={{
                      cursor: 'pointer',
                      fontSize: 'var(--text-xs)',
                      fontWeight: 600,
                      padding: '4px 12px',
                      borderRadius: '8px',
                      backgroundColor: 'var(--color-surface)',
                      color: 'var(--color-foreground)',
                      border: '0.5px solid var(--color-border)',
                    }}
                  >
                    {pkg.name} ({formatIndianCurrency(pkg.price)})
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 4. PRIMARY DELIVERABLES & SERVICES TABLE */}
          <div
            style={{
              backgroundColor: 'var(--color-surface)',
              border: '0.5px solid var(--color-border)',
              borderRadius: '12px',
              padding: '18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-foreground)' }}>
                3. Deliverables & Services (Line Items)
              </span>
              <button
                type="button"
                onClick={handleAddLineItem}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--color-accent)',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: 'var(--text-xs)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <i className="ti ti-plus" />
                <span>Add Item</span>
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {lineItems.map((item, idx) => (
                <div
                  key={item.id || idx}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 1fr) 60px 100px 90px 30px',
                    gap: '8px',
                    alignItems: 'center',
                    padding: '8px',
                    borderRadius: '8px',
                    backgroundColor: 'var(--color-surface-raised)',
                    border: '0.5px solid var(--color-border)',
                  }}
                >
                  <Input
                    placeholder="Deliverable description / service"
                    value={item.description}
                    onChange={(e) => handleItemChange(idx, 'description', e.target.value, false)}
                    style={{ height: '32px', fontSize: 'var(--text-xs)' }}
                  />

                  <Input
                    type="number"
                    min={1}
                    placeholder="Qty"
                    value={item.qty}
                    onChange={(e) => handleItemChange(idx, 'qty', e.target.value, false)}
                    style={{ height: '32px', fontSize: 'var(--text-xs)', textAlign: 'center' }}
                  />

                  <Input
                    type="number"
                    min={0}
                    placeholder="Rate"
                    value={item.rate || ''}
                    onChange={(e) => handleItemChange(idx, 'rate', e.target.value, false)}
                    style={{ height: '32px', fontSize: 'var(--text-xs)', textAlign: 'right' }}
                  />

                  <div style={{ textAlign: 'right', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-foreground)' }}>
                    ₹{item.amount.toLocaleString('en-IN')}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemoveLineItem(idx)}
                    disabled={lineItems.length <= 1}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: lineItems.length > 1 ? 'var(--color-danger)' : 'var(--color-foreground-subtle)',
                      cursor: lineItems.length > 1 ? 'pointer' : 'not-allowed',
                      fontSize: '14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: 0,
                    }}
                    title="Remove item"
                  >
                    <i className="ti ti-trash" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* 5. ADD-ONS SECTION (DEDICATED FOR PACKAGE 3 OR SPECIAL REQUESTS) */}
          <div
            style={{
              backgroundColor: 'var(--color-surface)',
              border: '0.5px solid var(--color-border)',
              borderRadius: '12px',
              padding: '18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-foreground)' }}>
                  4. Add-ons / Optional Services
                </span>
                <span style={{ fontSize: '0.65rem', color: 'var(--color-foreground-muted)', marginLeft: '8px' }}>
                  {templateId === 'floral' ? '(Rendered in Package 3 ADD ONS area)' : '(Optional additional equipment/service)'}
                </span>
              </div>
              <button
                type="button"
                onClick={handleAddAddon}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--color-accent)',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: 'var(--text-xs)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <i className="ti ti-plus" />
                <span>Add Add-on</span>
              </button>
            </div>

            {addons.length === 0 ? (
              <div
                style={{
                  padding: '12px',
                  borderRadius: '8px',
                  backgroundColor: 'var(--color-surface-raised)',
                  fontSize: 'var(--text-xs)',
                  color: 'var(--color-foreground-muted)',
                  textAlign: 'center',
                }}
              >
                No add-ons added yet. Click &quot;Add Add-on&quot; to include extra services (e.g. Drone, Live Streaming, Express Delivery).
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {addons.map((item, idx) => (
                  <div
                    key={item.id || idx}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(0, 1fr) 60px 100px 90px 30px',
                      gap: '8px',
                      alignItems: 'center',
                      padding: '8px',
                      borderRadius: '8px',
                      backgroundColor: 'var(--color-surface-raised)',
                      border: '0.5px solid var(--color-border)',
                    }}
                  >
                    <Input
                      placeholder="Add-on item (e.g. Drone Coverage, LED Wall)"
                      value={item.description}
                      onChange={(e) => handleItemChange(idx, 'description', e.target.value, true)}
                      style={{ height: '32px', fontSize: 'var(--text-xs)' }}
                    />

                    <Input
                      type="number"
                      min={1}
                      placeholder="Qty"
                      value={item.qty}
                      onChange={(e) => handleItemChange(idx, 'qty', e.target.value, true)}
                      style={{ height: '32px', fontSize: 'var(--text-xs)', textAlign: 'center' }}
                    />

                    <Input
                      type="number"
                      min={0}
                      placeholder="Rate"
                      value={item.rate || ''}
                      onChange={(e) => handleItemChange(idx, 'rate', e.target.value, true)}
                      style={{ height: '32px', fontSize: 'var(--text-xs)', textAlign: 'right' }}
                    />

                    <div style={{ textAlign: 'right', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-foreground)' }}>
                      ₹{item.amount.toLocaleString('en-IN')}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveAddon(idx)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--color-danger)',
                        cursor: 'pointer',
                        fontSize: '14px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 0,
                      }}
                      title="Remove add-on"
                    >
                      <i className="ti ti-trash" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 6. TOTALS & GST SWITCH */}
          <div
            style={{
              backgroundColor: 'var(--color-surface)',
              border: '0.5px solid var(--color-border)',
              borderRadius: '12px',
              padding: '18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)' }}>
              <span style={{ color: 'var(--color-foreground-muted)' }}>Deliverables Subtotal</span>
              <span style={{ fontWeight: 600, color: 'var(--color-foreground)' }}>
                ₹{lineItemsSubtotal.toLocaleString('en-IN')}
              </span>
            </div>

            {addonsSubtotal > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)' }}>
                <span style={{ color: 'var(--color-foreground-muted)' }}>Add-ons Subtotal</span>
                <span style={{ fontWeight: 600, color: 'var(--color-foreground)' }}>
                  ₹{addonsSubtotal.toLocaleString('en-IN')}
                </span>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)', borderTop: '0.5px solid var(--color-border)', paddingTop: '8px' }}>
              <span style={{ fontWeight: 600, color: 'var(--color-foreground)' }}>Total Subtotal</span>
              <span style={{ fontWeight: 700, color: 'var(--color-foreground)' }}>
                ₹{subtotal.toLocaleString('en-IN')}
              </span>
            </div>

            {/* GST SWITCH TOGGLE */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: 'var(--text-sm)',
                backgroundColor: 'var(--color-surface-raised)',
                padding: '8px 12px',
                borderRadius: '8px',
                border: '0.5px solid var(--color-border)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Switch checked={gstEnabled} onCheckedChange={setGstEnabled} />
                <div>
                  <span style={{ fontWeight: 600, color: 'var(--color-foreground)', fontSize: 'var(--text-xs)' }}>
                    Apply 18% GST
                  </span>
                  <div style={{ fontSize: '0.65rem', color: 'var(--color-foreground-muted)' }}>
                    {gstEnabled ? 'CGST 9% + SGST 9%' : 'No tax added to quotation'}
                  </div>
                </div>
              </div>

              {gstEnabled ? (
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>
                  CGST ₹{cgst.toLocaleString('en-IN')} + SGST ₹{sgst.toLocaleString('en-IN')}
                </span>
              ) : (
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>₹0 (Exempt)</span>
              )}
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                paddingTop: '6px',
              }}
            >
              <div>
                <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--color-foreground)' }}>
                  Grand Total
                </span>
                <div style={{ fontSize: '0.65rem', color: 'var(--color-foreground-muted)' }}>
                  ({numberToWordsINR(grandTotal)})
                </div>
              </div>
              <span style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: 'var(--color-primary)' }}>
                ₹{grandTotal.toLocaleString('en-IN')}
              </span>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: STICKY LIVE A4 PREVIEW (DESKTOP) */}
        <div
          style={{
            position: 'sticky',
            top: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
          className={activeTab === 'preview' ? 'block' : 'hidden md:flex'}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-foreground-subtle)' }}>
              Live A4 Preview · {TEMPLATE_OPTIONS.find((t) => normalizeTemplateKey(t.id) === normalizeTemplateKey(templateId))?.name}
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <Button
                variant="ghost"
                size="sm"
                onClick={handlePreviewPdf}
                disabled={isGeneratingPdf}
                style={{ fontSize: 'var(--text-xs)', height: '28px', padding: '0 8px' }}
              >
                <i className="ti ti-external-link" style={{ marginRight: '4px' }} /> Full PDF
              </Button>
            </div>
          </div>

          {/* CAPACITY WARNING IF OVERFLOWING */}
          {isOverflowing && (
            <div
              style={{
                padding: '8px 12px',
                backgroundColor: 'var(--color-danger-muted)',
                border: '0.5px solid var(--color-danger)',
                borderRadius: '6px',
                color: 'var(--color-danger)',
                fontSize: 'var(--text-xs)',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <i className="ti ti-alert-triangle" style={{ fontSize: '16px' }} />
              <span>
                Content exceeds single-page capacity and will clip when printed. Reduce line items or shorten descriptions.
              </span>
            </div>
          )}

          {/* A4 IFRAME CONTAINER */}
          <div
            ref={previewContainerRef}
            style={{
              position: 'relative',
              width: '100%',
              height: `${Math.round(1123 * previewScale)}px`,
              backgroundColor: '#ffffff',
              borderRadius: '8px',
              boxShadow: '0 12px 36px rgba(0,0,0,0.45)',
              overflow: 'hidden',
              border: '0.5px solid var(--color-border)',
            }}
          >
            {previewHtml && (
              <iframe
                ref={iframeRef}
                srcDoc={previewHtml}
                title="Quotation Live Preview"
                onLoad={checkOverflow}
                style={{
                  width: '794px',
                  height: '1123px',
                  border: 'none',
                  transform: `scale(${previewScale})`,
                  transformOrigin: 'top left',
                  pointerEvents: 'none',
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

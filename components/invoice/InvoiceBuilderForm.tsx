'use client'

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { addDays, format } from 'date-fns'
import type {
  Client,
  Invoice,
  InvoiceStatus,
  InvoicePaymentTerms,
  InvoiceLineItem,
  InvoicePaymentEntry,
  InvoicePaymentMode,
} from '@/types'
import {
  INDIAN_STATES,
  computeInvoiceTotals,
  createInvoice,
  updateInvoice,
  getNextInvoiceNumber,
  mapClientPaymentsToInvoicePayments,
} from '@/lib/firebase/queries/invoices'
import { subscribeToClients, subscribeToPayments, recordPayment } from '@/lib/firebase/queries/clients'
import {
  subscribeToBrandConfig,
  subscribeToActiveConfig,
  subscribeToNumberingConfig,
  subscribeToPackageConfig,
  type BrandConfig,
  type PackageTemplate,
  type StudioBranding,
} from '@/lib/firebase/queries/settings'
import { renderInvoiceHtml } from '@/lib/invoice/invoiceHtmlRenderer'
import { numberToWordsINR } from '@/lib/payroll/calculator'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/shared/Badge'
import { DateField } from '@/components/shared/DateField'

interface InvoiceBuilderFormProps {
  initialInvoice?: Invoice | null
  initialClientId?: string
}

const DEFAULT_TERMS =
  '1. Advance payment confirms the event booking dates.\n2. Final deliverables will be shared after full balance settlement.\n3. Travel and accommodation outside city limits are billed as actuals.'
const DEFAULT_THANK_YOU = 'Thank you for choosing Studio Zoom to capture your special moments!'

const TERMS_OPTIONS: Array<{ value: InvoicePaymentTerms; label: string }> = [
  { value: 'dueOnReceipt', label: 'Due on Receipt' },
  { value: 'net7', label: 'Net 7 Days' },
  { value: 'net15', label: 'Net 15 Days' },
  { value: 'net30', label: 'Net 30 Days' },
  { value: 'custom', label: 'Custom Date' },
]

function toIsoDate(d: Date): string {
  try {
    return format(d, 'yyyy-MM-dd')
  } catch {
    return format(new Date(), 'yyyy-MM-dd')
  }
}

function calcDueDateFromTerms(invoiceDateStr: string, terms: InvoicePaymentTerms, fallback: string): string {
  const base = invoiceDateStr ? new Date(invoiceDateStr) : new Date()
  if (Number.isNaN(base.getTime())) return fallback
  if (terms === 'dueOnReceipt') return toIsoDate(base)
  if (terms === 'net7') return toIsoDate(addDays(base, 7))
  if (terms === 'net15') return toIsoDate(addDays(base, 15))
  if (terms === 'net30') return toIsoDate(addDays(base, 30))
  return fallback
}

export function InvoiceBuilderForm({ initialInvoice, initialClientId }: InvoiceBuilderFormProps) {
  const router = useRouter()
  const appUser = useAuthStore((s) => s.appUser)
  const isEditing = Boolean(initialInvoice?.invoiceId)

  // Settings & Master Lists
  const [clients, setClients] = useState<Client[]>([])
  const [brandConfig, setBrandConfig] = useState<BrandConfig | null>(null)
  const [studioPackages, setStudioPackages] = useState<PackageTemplate[]>([])
  const [syncedClientPaymentIds, setSyncedClientPaymentIds] = useState<Set<string>>(new Set())

  // Studio & Header
  const [studioId, setStudioId] = useState<'studio-zoom' | 'studio-zoom-productions'>(
    initialInvoice?.studioId || 'studio-zoom'
  )
  const [invoiceNumber, setInvoiceNumber] = useState<string>(initialInvoice?.invoiceNumber || '')
  const [selectedClientId, setSelectedClientId] = useState<string>(
    initialInvoice?.clientId || initialClientId || ''
  )
  const [selectedProjectId, setSelectedProjectId] = useState<string>(initialInvoice?.projectId || '')
  const [invoiceDateStr, setInvoiceDateStr] = useState<string>(
    initialInvoice?.invoiceDate ? toIsoDate(initialInvoice.invoiceDate) : toIsoDate(new Date())
  )
  const [paymentTerms, setPaymentTerms] = useState<InvoicePaymentTerms>(
    initialInvoice?.paymentTerms || 'dueOnReceipt'
  )
  const [dueDateStr, setDueDateStr] = useState<string>(
    initialInvoice?.dueDate ? toIsoDate(initialInvoice.dueDate) : toIsoDate(new Date())
  )

  // Event Info (No Ship To)
  const [eventName, setEventName] = useState<string>(initialInvoice?.eventName || '')
  const [eventDateStr, setEventDateStr] = useState<string>(
    initialInvoice?.eventDate ? toIsoDate(initialInvoice.eventDate) : ''
  )
  const [eventVenue, setEventVenue] = useState<string>(initialInvoice?.eventVenue || '')

  // Client (Bill To)
  const [clientName, setClientName] = useState<string>(initialInvoice?.clientName || '')
  const [clientPhone, setClientPhone] = useState<string>(initialInvoice?.clientPhone || '')
  const [clientEmail, setClientEmail] = useState<string>(initialInvoice?.clientEmail || '')
  const [clientAddress, setClientAddress] = useState<string>(initialInvoice?.clientAddress || '')
  const [clientGstin, setClientGstin] = useState<string>(initialInvoice?.clientGstin || '')
  const [clientState, setClientState] = useState<string>(initialInvoice?.clientState || 'Tamil Nadu')

  // Line Items
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>(
    initialInvoice?.lineItems && initialInvoice.lineItems.length > 0
      ? initialInvoice.lineItems
      : [
          {
            id: 'item-1',
            description: 'Wedding Photography & Videography Coverage',
            subDescription: '',
            sacCode: '998386',
            qty: 1,
            rate: 0,
            discount: 0,
            amount: 0,
          },
        ]
  )

  // Discount & GST
  const [discountType, setDiscountType] = useState<'overall' | 'perLine'>(
    initialInvoice?.discountType || 'overall'
  )
  const [discountValue, setDiscountValue] = useState<number>(initialInvoice?.discountValue || 0)
  const [gstEnabled, setGstEnabled] = useState<boolean>(initialInvoice?.gstEnabled ?? false)
  const [gstRate, setGstRate] = useState<number>(initialInvoice?.gstRate ?? 18)

  // Advance Payments (max 3)
  const [payments, setPayments] = useState<InvoicePaymentEntry[]>(initialInvoice?.payments || [])
  const [paymentError, setPaymentError] = useState<string | null>(null)
  const [showAddPaymentRow, setShowAddPaymentRow] = useState<boolean>(false)
  const [newPayAmount, setNewPayAmount] = useState<string>('')
  const [newPayDateStr, setNewPayDateStr] = useState<string>(toIsoDate(new Date()))
  const [newPayMode, setNewPayMode] = useState<InvoicePaymentMode>('upi')
  const [newPayRef, setNewPayRef] = useState<string>('')

  // Status, Terms & Closing Note
  const [status] = useState<InvoiceStatus>(initialInvoice?.status || 'draft')
  const [termsOverride, setTermsOverride] = useState<string | null>(
    initialInvoice?.termsAndConditions ?? null
  )
  const [thankYouOverride, setThankYouOverride] = useState<string | null>(
    initialInvoice?.thankYouNote ?? null
  )

  // UI & Preview States
  const [isSaving, setIsSaving] = useState<boolean>(false)
  const [isPrinting, setIsPrinting] = useState<boolean>(false)
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [previewHtml, setPreviewHtml] = useState<string>('')
  const [previewScale, setPreviewScale] = useState<number>(0.62)
  const previewContainerRef = useRef<HTMLDivElement | null>(null)
  const prefilledClientRef = useRef<boolean>(false)
  const idCounterRef = useRef<number>(1)

  const nextUid = useCallback((prefix: string): string => {
    idCounterRef.current += 1
    return `${prefix}-${idCounterRef.current}`
  }, [])

  const showToast = useCallback((text: string, type: 'success' | 'error' = 'success'): void => {
    setToastMsg({ text, type })
    setTimeout(() => setToastMsg(null), 3500)
  }, [])

  // Subscribe to Clients, Settings & Packages
  useEffect(() => {
    const unsubClients = subscribeToClients({}, (list) => setClients(list))
    const unsubBrand = subscribeToBrandConfig((b) => setBrandConfig(b))
    const unsubPkg = subscribeToPackageConfig((p) => setStudioPackages(p?.packages || []))
    const unsubActive = subscribeToActiveConfig((a) => {
      if (!isEditing && a?.activeStudioId) {
        setStudioId(a.activeStudioId as 'studio-zoom' | 'studio-zoom-productions')
      }
    })
    const unsubNum = subscribeToNumberingConfig((n) => {
      if (!isEditing && n && initialInvoice == null) {
        setGstEnabled(Boolean(n.gstEnabled))
      }
    })

    return () => {
      unsubClients()
      unsubBrand()
      unsubPkg()
      unsubActive()
      unsubNum()
    }
  }, [isEditing, initialInvoice])

  // Generate invoice number preview for new invoice
  useEffect(() => {
    if (!isEditing && !invoiceNumber) {
      getNextInvoiceNumber().then((num) => setInvoiceNumber(num)).catch(() => {})
    }
  }, [isEditing, invoiceNumber])

  // Resolve active studio branding
  const activeBranding: StudioBranding | null = useMemo(() => {
    if (!brandConfig) return null
    return studioId === 'studio-zoom-productions'
      ? brandConfig.studioZoomProds || brandConfig.studioZoom || null
      : brandConfig.studioZoom || null
  }, [brandConfig, studioId])

  const termsAndConditions = termsOverride ?? activeBranding?.defaultTerms ?? DEFAULT_TERMS
  const thankYouNote = thankYouOverride ?? activeBranding?.thankYouNote ?? DEFAULT_THANK_YOU

  // Sync client payments when a client is selected
  useEffect(() => {
    if (!selectedClientId) return
    const unsub = subscribeToPayments(selectedClientId, (clientPayments) => {
      const mapped = mapClientPaymentsToInvoicePayments(clientPayments)
      setSyncedClientPaymentIds(new Set(clientPayments.map((p) => p.paymentId)))
      if (!isEditing) {
        setPayments(mapped)
      }
    })
    return () => unsub()
  }, [selectedClientId, isEditing])

  // Handler when user selects a Client / Project
  const applyClientSelection = useCallback(
    (client: Client): void => {
      setSelectedClientId(client.clientId)
      setSelectedProjectId(client.projectId || '')
      setClientName(client.name || '')
      setClientPhone(client.contact || '')
      setClientEmail(client.email || '')
      setClientAddress(client.location || '')
      setEventName(client.eventName || '')
      setEventDateStr(client.eventDate ? toIsoDate(client.eventDate) : '')
      setEventVenue(client.location || '')

      // Pre-fill line items from matching package or total booking amount
      const matchedPkg = studioPackages.find(
        (p) => p.name.toLowerCase() === (client.packageType || '').toLowerCase()
      )

      if (matchedPkg && matchedPkg.lineItems && matchedPkg.lineItems.length > 0) {
        setLineItems(
          matchedPkg.lineItems.map((it, idx) => ({
            id: nextUid(`pkg-${idx}`),
            description: it.description,
            subDescription: '',
            sacCode: '998386',
            qty: Number(it.qty) || 1,
            rate: Number(it.rate) || 0,
            discount: 0,
            amount: Number(it.amount) || (Number(it.qty) || 1) * (Number(it.rate) || 0),
          }))
        )
      } else {
        setLineItems([
          {
            id: nextUid('booking'),
            description: `${client.packageType || 'Photography & Videography'} Package — ${client.eventName || 'Event Coverage'}`,
            subDescription: client.notes || '',
            sacCode: '998386',
            qty: 1,
            rate: Number(client.totalAmount) || 0,
            discount: 0,
            amount: Number(client.totalAmount) || 0,
          },
        ])
      }
    },
    [studioPackages, nextUid]
  )

  // Auto-apply initialClientId if launched via /erp/invoices/new?clientId=...
  useEffect(() => {
    if (!isEditing && initialClientId && clients.length > 0 && !prefilledClientRef.current) {
      const target = clients.find((c) => c.clientId === initialClientId)
      if (target) {
        prefilledClientRef.current = true
        const timer = setTimeout(() => applyClientSelection(target), 0)
        return () => clearTimeout(timer)
      }
    }
  }, [isEditing, initialClientId, clients, applyClientSelection])

  // Auto-compute dueDate when invoiceDate or paymentTerms changes (unless custom)
  const handleTermsChange = (nextTerms: InvoicePaymentTerms): void => {
    setPaymentTerms(nextTerms)
    if (nextTerms !== 'custom') {
      setDueDateStr(calcDueDateFromTerms(invoiceDateStr, nextTerms, dueDateStr))
    }
  }

  const handleInvoiceDateChange = (nextDate: string): void => {
    setInvoiceDateStr(nextDate)
    if (paymentTerms !== 'custom') {
      setDueDateStr(calcDueDateFromTerms(nextDate, paymentTerms, dueDateStr))
    }
  }

  // Computed financial totals
  const computed = useMemo(() => {
    return computeInvoiceTotals({
      lineItems,
      discountType,
      discountValue,
      gstEnabled,
      gstRate,
      clientState,
      payments,
      currentStatus: status,
      dueDate: new Date(dueDateStr || invoiceDateStr),
    })
  }, [lineItems, discountType, discountValue, gstEnabled, gstRate, clientState, payments, status, dueDateStr, invoiceDateStr])

  // Line Item Helpers
  const handleAddItem = (): void => {
    setLineItems((prev) => [
      ...prev,
      {
        id: nextUid('item'),
        description: '',
        subDescription: '',
        sacCode: '998386',
        qty: 1,
        rate: 0,
        discount: 0,
        amount: 0,
      },
    ])
  }

  const handleUpdateItem = (
    id: string,
    field: keyof InvoiceLineItem,
    value: string | number
  ): void => {
    setLineItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item
        const updated: InvoiceLineItem = { ...item, [field]: value }
        const qty = Number(updated.qty) || 0
        const rate = Number(updated.rate) || 0
        const disc = Number(updated.discount) || 0
        updated.amount =
          discountType === 'perLine' ? Math.max(0, qty * rate - disc) : qty * rate
        return updated
      })
    )
  }

  const handleRemoveItem = (id: string): void => {
    if (lineItems.length <= 1) return
    setLineItems((prev) => prev.filter((item) => item.id !== id))
  }

  const handleMoveItem = (index: number, direction: -1 | 1): void => {
    const targetIdx = index + direction
    if (targetIdx < 0 || targetIdx >= lineItems.length) return
    setLineItems((prev) => {
      const next = [...prev]
      const [moved] = next.splice(index, 1)
      next.splice(targetIdx, 0, moved)
      return next
    })
  }

  const handleApplyPackage = (pkg: PackageTemplate): void => {
    if (pkg.lineItems && pkg.lineItems.length > 0) {
      setLineItems(
        pkg.lineItems.map((it, idx) => ({
          id: nextUid(`pkg-${idx}`),
          description: it.description,
          subDescription: '',
          sacCode: '998386',
          qty: Number(it.qty) || 1,
          rate: Number(it.rate) || 0,
          discount: 0,
          amount: Number(it.amount) || (Number(it.qty) || 1) * (Number(it.rate) || 0),
        }))
      )
    } else {
      setLineItems([
        {
          id: nextUid('pkg'),
          description: `${pkg.name} Package`,
          subDescription: pkg.items || '',
          sacCode: '998386',
          qty: 1,
          rate: Number(pkg.price) || 0,
          discount: 0,
          amount: Number(pkg.price) || 0,
        },
      ])
    }
    showToast(`Applied ${pkg.name} package deliverables`)
  }

  // Advance Payment Helpers (max 3, block overpayment)
  const handleAddAdvancePayment = (): void => {
    setPaymentError(null)
    if (payments.length >= 3) {
      setPaymentError('Maximum of 3 advance payments allowed per invoice.')
      return
    }
    const amt = parseFloat(newPayAmount)
    if (Number.isNaN(amt) || amt <= 0) {
      setPaymentError('Enter a valid positive payment amount.')
      return
    }
    if (computed.amountPaid + amt > computed.totalAmount) {
      const remaining = Math.max(0, computed.totalAmount - computed.amountPaid)
      setPaymentError(
        `Payment exceeds invoice total. Maximum allowed remaining balance is ₹${remaining.toLocaleString('en-IN')}.`
      )
      return
    }

    const entry: InvoicePaymentEntry = {
      id: nextUid('local'),
      amount: amt,
      date: newPayDateStr ? new Date(newPayDateStr) : new Date(),
      mode: newPayMode,
      reference: newPayRef.trim() || undefined,
    }

    setPayments((prev) => [...prev, entry])
    setNewPayAmount('')
    setNewPayRef('')
    setShowAddPaymentRow(false)
  }

  const handleRemovePayment = (payId: string): void => {
    setPayments((prev) => prev.filter((p) => p.id !== payId))
    setPaymentError(null)
  }

  // Snapshot for live preview & saving
  const invoiceSnapshot: Invoice = useMemo(() => {
    const safeInvDate = new Date(invoiceDateStr)
    const safeDueDate = new Date(dueDateStr || invoiceDateStr)
    return {
      invoiceId: initialInvoice?.invoiceId || 'preview',
      invoiceNumber: invoiceNumber || 'ZS-INV-2026-001',
      studioId,
      clientId: selectedClientId || undefined,
      projectId: selectedProjectId || undefined,
      invoiceDate: safeInvDate,
      dueDate: safeDueDate,
      paymentTerms,
      eventName,
      eventDate: eventDateStr ? new Date(eventDateStr) : undefined,
      eventVenue,
      clientName,
      clientPhone,
      clientEmail,
      clientAddress,
      clientGstin,
      clientState,
      lineItems,
      discountType,
      discountValue,
      discountAmount: computed.discountAmount,
      subtotal: computed.subtotal,
      taxableAmount: computed.taxableAmount,
      gstEnabled,
      gstRate,
      gstSplit: computed.gstSplit,
      cgst: computed.cgst,
      sgst: computed.sgst,
      igst: computed.igst,
      totalAmount: computed.totalAmount,
      payments,
      amountPaid: computed.amountPaid,
      balanceDue: computed.balanceDue,
      status: computed.derivedStatus,
      termsAndConditions: termsAndConditions || activeBranding?.defaultTerms || DEFAULT_TERMS,
      thankYouNote: thankYouNote || activeBranding?.thankYouNote || DEFAULT_THANK_YOU,
      createdBy: initialInvoice?.createdBy || appUser?.uid || 'admin',
      createdAt: initialInvoice?.createdAt || safeInvDate,
    }
  }, [
    initialInvoice,
    invoiceNumber,
    studioId,
    selectedClientId,
    selectedProjectId,
    invoiceDateStr,
    dueDateStr,
    paymentTerms,
    eventName,
    eventDateStr,
    eventVenue,
    clientName,
    clientPhone,
    clientEmail,
    clientAddress,
    clientGstin,
    clientState,
    lineItems,
    discountType,
    discountValue,
    computed,
    gstEnabled,
    gstRate,
    payments,
    termsAndConditions,
    thankYouNote,
    activeBranding,
    appUser?.uid,
  ])

  // Debounced live preview HTML rendering (150ms)
  useEffect(() => {
    let active = true
    const timer = setTimeout(async () => {
      try {
        const html = await renderInvoiceHtml(invoiceSnapshot, {
          branding: activeBranding,
          studioName:
            studioId === 'studio-zoom-productions' ? 'Studio Zoom Productions' : 'Studio Zoom',
        })
        if (active) setPreviewHtml(html)
      } catch (err) {
        console.error('[Invoice Preview Render Error]:', err)
      }
    }, 150)

    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [invoiceSnapshot, activeBranding, studioId])

  // ResizeObserver to scale 794px A4 iframe to column width cleanly
  useEffect(() => {
    const el = previewContainerRef.current
    if (!el) return

    const updateScale = (): void => {
      const width = el.clientWidth
      if (width > 0) {
        setPreviewScale(Math.min(1, width / 794))
      }
    }
    updateScale()

    const ro = new ResizeObserver(updateScale)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const handleSave = async (targetStatus: InvoiceStatus): Promise<void> => {
    if (!clientName.trim()) {
      showToast('Please enter or select a Client Name', 'error')
      return
    }
    if (lineItems.length === 0 || !lineItems.some((it) => it.description.trim())) {
      showToast('Add at least one line item with a description', 'error')
      return
    }
    if (computed.amountPaid > computed.totalAmount) {
      showToast('Advance payments exceed invoice Grand Total', 'error')
      return
    }

    setIsSaving(true)
    try {
      const finalComputed = computeInvoiceTotals({
        lineItems,
        discountType,
        discountValue,
        gstEnabled,
        gstRate,
        clientState,
        payments,
        currentStatus: targetStatus,
        dueDate: new Date(dueDateStr || Date.now()),
      })

      const payload: Omit<Invoice, 'invoiceId' | 'createdAt'> = {
        invoiceNumber: invoiceNumber || (await getNextInvoiceNumber()),
        studioId,
        clientId: selectedClientId || undefined,
        projectId: selectedProjectId || undefined,
        invoiceDate: new Date(invoiceDateStr || Date.now()),
        dueDate: new Date(dueDateStr || Date.now()),
        paymentTerms,
        eventName: eventName.trim() || 'Photography & Videography Services',
        eventDate: eventDateStr ? new Date(eventDateStr) : undefined,
        eventVenue: eventVenue.trim() || undefined,
        clientName: clientName.trim(),
        clientPhone: clientPhone.trim() || undefined,
        clientEmail: clientEmail.trim() || undefined,
        clientAddress: clientAddress.trim() || undefined,
        clientGstin: clientGstin.trim() || undefined,
        clientState: clientState || 'Tamil Nadu',
        lineItems,
        discountType,
        discountValue,
        discountAmount: finalComputed.discountAmount,
        subtotal: finalComputed.subtotal,
        taxableAmount: finalComputed.taxableAmount,
        gstEnabled,
        gstRate,
        gstSplit: finalComputed.gstSplit,
        cgst: finalComputed.cgst,
        sgst: finalComputed.sgst,
        igst: finalComputed.igst,
        totalAmount: finalComputed.totalAmount,
        payments,
        amountPaid: finalComputed.amountPaid,
        balanceDue: finalComputed.balanceDue,
        status: finalComputed.derivedStatus,
        termsAndConditions: termsAndConditions.trim() || activeBranding?.defaultTerms || DEFAULT_TERMS,
        thankYouNote: thankYouNote.trim() || activeBranding?.thankYouNote || DEFAULT_THANK_YOU,
        isDeleted: false,
        createdBy: initialInvoice?.createdBy || appUser?.uid || 'admin',
      }

      if (isEditing && initialInvoice?.invoiceId) {
        await updateInvoice(initialInvoice.invoiceId, payload)
        showToast('Invoice updated successfully!')
      } else {
        await createInvoice(payload)
        showToast('Invoice created successfully!')
      }

      // Sync any newly added advance payments to /clients/{clientId}/payments if linked
      if (selectedClientId) {
        const unsyncedPayments = payments.filter((p) => !syncedClientPaymentIds.has(p.id))
        for (let idx = 0; idx < unsyncedPayments.length; idx++) {
          const p = unsyncedPayments[idx]
          const modeMap: Record<InvoicePaymentMode, 'cash' | 'gpay' | 'bankTransfer'> = {
            cash: 'cash',
            upi: 'gpay',
            bank: 'bankTransfer',
          }
          await recordPayment(
            selectedClientId,
            {
              instalment: finalComputed.balanceDue <= 0 && idx === unsyncedPayments.length - 1
                ? 'Final Settlement'
                : `${payments.indexOf(p) + 1}st Instalment`.replace('2st', '2nd').replace('3st', '3rd'),
              amount: p.amount,
              date: p.date instanceof Date ? p.date : new Date(p.date),
              method: modeMap[p.mode],
              transactionId: p.reference || payload.invoiceNumber,
            },
            appUser?.uid || 'admin',
            appUser?.name || 'Studio Admin'
          )
        }
      }

      setTimeout(() => {
        router.push('/erp/invoices')
      }, 650)
    } catch (err) {
      console.error('[Save Invoice Error]:', err)
      showToast('Failed to save invoice', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const handleOpenPreviewTab = async (): Promise<void> => {
    setIsPrinting(true)
    try {
      const html = await renderInvoiceHtml(invoiceSnapshot, {
        branding: activeBranding,
        studioName:
          studioId === 'studio-zoom-productions' ? 'Studio Zoom Productions' : 'Studio Zoom',
      })
      const win = window.open('', '_blank')
      if (!win) {
        showToast('Please allow popups to preview invoice', 'error')
        return
      }
      win.document.open()
      win.document.write(html)
      win.document.close()
    } finally {
      setIsPrinting(false)
    }
  }

  const handlePrintPdf = async (): Promise<void> => {
    setIsPrinting(true)
    try {
      const html = await renderInvoiceHtml(invoiceSnapshot, {
        branding: activeBranding,
        studioName:
          studioId === 'studio-zoom-productions' ? 'Studio Zoom Productions' : 'Studio Zoom',
      })
      const printWin = window.open('', '_blank')
      if (!printWin) {
        showToast('Please allow popups to save/download PDF', 'error')
        return
      }
      const printableHtml = html.replace(
        '</body>',
        `<script>
          window.addEventListener('load', function() {
            setTimeout(function() {
              window.focus();
              window.print();
            }, 300);
          });
        </script></body>`
      )
      printWin.document.open()
      printWin.document.write(printableHtml)
      printWin.document.close()
      showToast('Opening print dialog — select "Save as PDF"')
    } finally {
      setIsPrinting(false)
    }
  }

  const syncPaymentsFromSelectedClient = (): void => {
    if (!selectedClientId) return
    const unsub = subscribeToPayments(selectedClientId, (clientPayments) => {
      const mapped = mapClientPaymentsToInvoicePayments(clientPayments)
      setSyncedClientPaymentIds(new Set(clientPayments.map((p) => p.paymentId)))
      setPayments(mapped)
      showToast(`Synced ${mapped.length} payment(s) from booking`)
      unsub()
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', fontFamily: 'var(--font-inter)' }}>
      {/* TOAST */}
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
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <i className={`ti ${toastMsg.type === 'error' ? 'ti-alert-circle' : 'ti-check'}`} />
          <span>{toastMsg.text}</span>
        </div>
      )}

      {/* TOP BAR */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          paddingBottom: '16px',
          borderBottom: '0.5px solid var(--color-border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            type="button"
            onClick={() => router.push('/erp/invoices')}
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
            title="Back to invoices"
          >
            <i className="ti ti-arrow-left" />
          </button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, margin: 0, color: 'var(--color-foreground)' }}>
                {isEditing ? 'Edit Invoice' : 'New Invoice'}
              </h1>
              <span
                style={{
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  padding: '3px 10px',
                  borderRadius: '6px',
                  backgroundColor: 'var(--color-surface-raised)',
                  border: '0.5px solid var(--color-border)',
                  color: 'var(--color-primary)',
                }}
              >
                {invoiceNumber || 'Auto'}
              </span>
              <Badge
                variant={
                  computed.derivedStatus === 'paid'
                    ? 'paid'
                    : computed.derivedStatus === 'partiallyPaid'
                      ? 'partial'
                      : computed.derivedStatus === 'overdue'
                        ? 'overdue'
                        : computed.derivedStatus === 'sent'
                          ? 'inProgress'
                          : 'todo'
                }
                label={
                  computed.derivedStatus === 'partiallyPaid'
                    ? 'PARTIALLY PAID'
                    : computed.derivedStatus.toUpperCase()
                }
              />
            </div>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)', margin: '2px 0 0 0' }}>
              Select a project/booking or enter client details, configure GST & advance payments, and print A4 Tax Invoice.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <Button
            type="button"
            variant="ghost"
            onClick={handleOpenPreviewTab}
            disabled={isPrinting}
            style={{ border: '0.5px solid var(--color-border)', fontSize: 'var(--text-xs)' }}
          >
            <i className="ti ti-eye" style={{ marginRight: '6px' }} /> Preview
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={handlePrintPdf}
            disabled={isPrinting}
            style={{ border: '0.5px solid var(--color-border)', fontSize: 'var(--text-xs)' }}
          >
            <i className="ti ti-printer" style={{ marginRight: '6px' }} /> Print / Save PDF
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => handleSave('draft')}
            disabled={isSaving}
            style={{
              backgroundColor: 'var(--color-surface-raised)',
              border: '0.5px solid var(--color-border)',
              color: 'var(--color-foreground)',
              fontSize: 'var(--text-xs)',
            }}
          >
            Save Draft
          </Button>
          <Button
            type="button"
            onClick={() => handleSave('sent')}
            disabled={isSaving}
            style={{
              backgroundColor: 'var(--color-primary)',
              color: '#ffffff',
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
            }}
          >
            <i className="ti ti-check" style={{ marginRight: '6px' }} />
            {isSaving ? 'Saving...' : isEditing ? 'Update Invoice' : 'Save & Finalize'}
          </Button>
        </div>
      </div>

      {/* MAIN SPLIT WORKSPACE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT PANE: FORM */}
        <div className="lg:col-span-7 flex flex-col gap-5">
          {/* 1. PROJECT / CLIENT LINK & STUDIO ENTITY */}
          <div style={CARD_STYLE}>
            <div style={CARD_HEADER_STYLE}>
              <span>1. Project / Booking & Invoice Header</span>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-primary)', fontWeight: 600 }}>
                {gstEnabled ? 'TAX INVOICE' : 'INVOICE'}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label style={LABEL_STYLE}>Select Project / Client Booking</label>
                <select
                  value={selectedClientId}
                  onChange={(e) => {
                    const id = e.target.value
                    if (!id) {
                      setSelectedClientId('')
                      setSelectedProjectId('')
                      setSyncedClientPaymentIds(new Set())
                      return
                    }
                    const match = clients.find((c) => c.clientId === id)
                    if (match) applyClientSelection(match)
                  }}
                  style={SELECT_STYLE}
                >
                  <option value="">— Standalone / Custom Client —</option>
                  {clients.map((c) => (
                    <option key={c.clientId} value={c.clientId}>
                      {c.name} · {c.eventName} (₹{(Number(c.totalAmount) || 0).toLocaleString('en-IN')})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label style={LABEL_STYLE}>Studio Brand Entity</label>
                <select
                  value={studioId}
                  onChange={(e) => setStudioId(e.target.value as 'studio-zoom' | 'studio-zoom-productions')}
                  style={SELECT_STYLE}
                >
                  <option value="studio-zoom">Studio Zoom (Weddings & Events)</option>
                  <option value="studio-zoom-productions">Studio Zoom Productions (Films & Commercial)</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label style={LABEL_STYLE}>Invoice Number</label>
                <Input
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  placeholder="ZS-INV-2026-001"
                  className="h-9"
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label style={LABEL_STYLE}>Payment Terms</label>
                <select
                  value={paymentTerms}
                  onChange={(e) => handleTermsChange(e.target.value as InvoicePaymentTerms)}
                  style={SELECT_STYLE}
                >
                  {TERMS_OPTIONS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label style={LABEL_STYLE}>Invoice Date</label>
                <DateField value={invoiceDateStr} onChange={handleInvoiceDateChange} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label style={LABEL_STYLE}>Due Date</label>
                <DateField
                  value={dueDateStr}
                  onChange={(val) => {
                    setPaymentTerms('custom')
                    setDueDateStr(val)
                  }}
                />
              </div>
            </div>

            {/* Event Details (replaces Ship To) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5" style={{ borderTop: '0.5px solid var(--color-border)', paddingTop: '14px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label style={LABEL_STYLE}>Event Name</label>
                <Input
                  value={eventName}
                  onChange={(e) => setEventName(e.target.value)}
                  placeholder="e.g. Meera & Vikram Wedding"
                  className="h-9"
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label style={LABEL_STYLE}>Event Date</label>
                <DateField value={eventDateStr} onChange={setEventDateStr} placeholder="Select event date" />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label style={LABEL_STYLE}>Event Venue</label>
                <Input
                  value={eventVenue}
                  onChange={(e) => setEventVenue(e.target.value)}
                  placeholder="e.g. Taj Coromandel, Chennai"
                  className="h-9"
                />
              </div>
            </div>
          </div>

          {/* 2. CLIENT (BILL TO) */}
          <div style={CARD_STYLE}>
            <div style={CARD_HEADER_STYLE}>
              <span>2. Client Details (Bill To)</span>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>
                State determines CGST+SGST vs IGST
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label style={LABEL_STYLE}>Client Name *</label>
                <Input
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="e.g. IHM School / Meera & Vikram"
                  className="h-9"
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label style={LABEL_STYLE}>Phone</label>
                <Input
                  value={clientPhone}
                  onChange={(e) => setClientPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="h-9"
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label style={LABEL_STYLE}>Email</label>
                <Input
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                  placeholder="client@example.com"
                  className="h-9"
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label style={LABEL_STYLE}>Client State (Place of Supply)</label>
                <select
                  value={clientState}
                  onChange={(e) => setClientState(e.target.value)}
                  style={SELECT_STYLE}
                >
                  {INDIAN_STATES.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label style={LABEL_STYLE}>Billing Address</label>
                <Input
                  value={clientAddress}
                  onChange={(e) => setClientAddress(e.target.value)}
                  placeholder="Street, City, Pincode"
                  className="h-9"
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label style={LABEL_STYLE}>Client GSTIN (Optional — Schools / Businesses)</label>
                <Input
                  value={clientGstin}
                  onChange={(e) => setClientGstin(e.target.value.toUpperCase())}
                  placeholder="e.g. 33ABCDE1234F1Z5"
                  className="h-9"
                />
              </div>
            </div>
          </div>

          {/* 3. LINE ITEMS & QUICK PACKAGES */}
          <div style={CARD_STYLE}>
            <div style={CARD_HEADER_STYLE}>
              <span>3. Line Items & Deliverables</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleAddItem}
                style={{ fontSize: 'var(--text-xs)', color: 'var(--color-primary)', height: '28px', padding: '0 10px' }}
              >
                <i className="ti ti-plus" style={{ marginRight: '4px' }} /> Add Row
              </Button>
            </div>

            {studioPackages.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>
                  Apply Studio Package:
                </span>
                {studioPackages.map((pkg) => (
                  <button
                    key={pkg.id}
                    type="button"
                    onClick={() => handleApplyPackage(pkg)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '6px',
                      border: '0.5px solid var(--color-border)',
                      backgroundColor: 'var(--color-surface-raised)',
                      color: 'var(--color-foreground)',
                      fontSize: 'var(--text-xs)',
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >
                    {pkg.name} (₹{Number(pkg.price || 0).toLocaleString('en-IN')})
                  </button>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {lineItems.map((item, idx) => (
                <div
                  key={item.id}
                  style={{
                    backgroundColor: 'var(--color-surface-raised)',
                    border: '0.5px solid var(--color-border)',
                    borderRadius: '10px',
                    padding: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                  }}
                >
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-center">
                    <div className="md:col-span-5">
                      <Input
                        value={item.description}
                        onChange={(e) => handleUpdateItem(item.id, 'description', e.target.value)}
                        placeholder={`Item #${idx + 1} title`}
                        className="h-9"
                      />
                    </div>
                    {gstEnabled && (
                      <div className="md:col-span-2">
                        <Input
                          value={item.sacCode || ''}
                          onChange={(e) => handleUpdateItem(item.id, 'sacCode', e.target.value)}
                          placeholder="SAC (e.g. 998386)"
                          className="h-9"
                        />
                      </div>
                    )}
                    <div className={gstEnabled ? 'md:col-span-1' : 'md:col-span-2'}>
                      <Input
                        type="number"
                        min={1}
                        value={item.qty}
                        onChange={(e) => handleUpdateItem(item.id, 'qty', Number(e.target.value) || 0)}
                        placeholder="Qty"
                        className="h-9"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Input
                        type="number"
                        min={0}
                        value={item.rate}
                        onChange={(e) => handleUpdateItem(item.id, 'rate', Number(e.target.value) || 0)}
                        placeholder="Rate ₹"
                        className="h-9"
                      />
                    </div>
                    <div className="md:col-span-2 flex items-center justify-between md:justify-end gap-1.5">
                      <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--color-foreground)' }}>
                        ₹{Math.round(item.amount).toLocaleString('en-IN')}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                        <button
                          type="button"
                          onClick={() => handleMoveItem(idx, -1)}
                          disabled={idx === 0}
                          title="Move up"
                          style={ICON_BTN_STYLE(idx === 0)}
                        >
                          <i className="ti ti-arrow-up" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveItem(idx, 1)}
                          disabled={idx === lineItems.length - 1}
                          title="Move down"
                          style={ICON_BTN_STYLE(idx === lineItems.length - 1)}
                        >
                          <i className="ti ti-arrow-down" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(item.id)}
                          disabled={lineItems.length <= 1}
                          title="Remove row"
                          style={{
                            ...ICON_BTN_STYLE(lineItems.length <= 1),
                            color: lineItems.length <= 1 ? 'var(--color-foreground-subtle)' : 'var(--color-danger)',
                          }}
                        >
                          <i className="ti ti-trash" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Optional 2nd line description & per-line discount */}
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5">
                    <div className={discountType === 'perLine' ? 'md:col-span-9' : 'md:col-span-12'}>
                      <Input
                        value={item.subDescription || ''}
                        onChange={(e) => handleUpdateItem(item.id, 'subDescription', e.target.value)}
                        placeholder="Optional 2nd line (e.g. 2 Candid Photographers + Raw & Edited Photos)"
                        className="h-8 text-xs"
                      />
                    </div>
                    {discountType === 'perLine' && (
                      <div className="md:col-span-3">
                        <Input
                          type="number"
                          min={0}
                          value={item.discount || 0}
                          onChange={(e) => handleUpdateItem(item.id, 'discount', Number(e.target.value) || 0)}
                          placeholder="Line Disc. ₹"
                          className="h-8 text-xs"
                        />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 4. DISCOUNT & GST */}
          <div style={CARD_STYLE}>
            <div style={CARD_HEADER_STYLE}>
              <span>4. Discount & GST Configuration</span>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>
                {gstEnabled
                  ? computed.gstSplit === 'cgst_sgst'
                    ? `Tamil Nadu: CGST ${gstRate / 2}% + SGST ${gstRate / 2}%`
                    : `Out of State (${clientState}): IGST ${gstRate}%`
                  : 'GST Off — Plain Invoice'}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Discount Box */}
              <div style={SUB_BOX_STYLE}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600 }}>Discount Mode</span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {(['overall', 'perLine'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => {
                          setDiscountType(mode)
                          setLineItems((prev) =>
                            prev.map((it) => ({
                              ...it,
                              amount:
                                mode === 'perLine'
                                  ? Math.max(0, it.qty * it.rate - (it.discount || 0))
                                  : it.qty * it.rate,
                            }))
                          )
                        }}
                        style={{
                          padding: '3px 8px',
                          borderRadius: '6px',
                          border: `0.5px solid ${discountType === mode ? 'var(--color-primary)' : 'var(--color-border)'}`,
                          backgroundColor: discountType === mode ? 'var(--color-primary-muted)' : 'transparent',
                          color: discountType === mode ? 'var(--color-primary)' : 'var(--color-foreground-muted)',
                          fontSize: 'var(--text-xs)',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        {mode === 'overall' ? 'Overall' : 'Per Line'}
                      </button>
                    ))}
                  </div>
                </div>
                {discountType === 'overall' ? (
                  <Input
                    type="number"
                    min={0}
                    value={discountValue}
                    onChange={(e) => setDiscountValue(Number(e.target.value) || 0)}
                    placeholder="Overall discount ₹"
                    className="h-9"
                  />
                ) : (
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>
                    Total per-line discount: ₹{computed.discountAmount.toLocaleString('en-IN')}
                  </div>
                )}
              </div>

              {/* GST Box */}
              <div style={SUB_BOX_STYLE}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Switch checked={gstEnabled} onCheckedChange={setGstEnabled} />
                    <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600 }}>
                      Apply GST ({gstRate}%)
                    </span>
                  </div>
                  {gstEnabled && (
                    <Input
                      type="number"
                      min={0}
                      max={28}
                      value={gstRate}
                      onChange={(e) => setGstRate(Number(e.target.value) || 0)}
                      className="h-7 w-16 text-xs text-right"
                    />
                  )}
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>
                  {gstEnabled
                    ? computed.gstSplit === 'cgst_sgst'
                      ? `CGST ₹${computed.cgst.toLocaleString('en-IN')} + SGST ₹${computed.sgst.toLocaleString('en-IN')}`
                      : `IGST ₹${computed.igst.toLocaleString('en-IN')}`
                    : 'No GST or GSTIN will appear on invoice'}
                </div>
              </div>
            </div>

            {/* Totals Summary Strip */}
            <div
              style={{
                backgroundColor: 'var(--color-surface-raised)',
                border: '0.5px solid var(--color-border)',
                borderRadius: '10px',
                padding: '12px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              <div style={TOTAL_ROW_STYLE}>
                <span>Subtotal</span>
                <span>₹{computed.subtotal.toLocaleString('en-IN')}</span>
              </div>
              {computed.discountAmount > 0 && (
                <div style={TOTAL_ROW_STYLE}>
                  <span>Discount</span>
                  <span>-₹{computed.discountAmount.toLocaleString('en-IN')}</span>
                </div>
              )}
              {gstEnabled && (
                <div style={TOTAL_ROW_STYLE}>
                  <span>{computed.gstSplit === 'cgst_sgst' ? `CGST + SGST (${gstRate}%)` : `IGST (${gstRate}%)`}</span>
                  <span>₹{(computed.cgst + computed.sgst + computed.igst).toLocaleString('en-IN')}</span>
                </div>
              )}
              <div style={{ ...TOTAL_ROW_STYLE, fontWeight: 700, fontSize: 'var(--text-base)', color: 'var(--color-foreground)', borderTop: '0.5px solid var(--color-border)', paddingTop: '6px' }}>
                <span>Grand Total</span>
                <span style={{ color: 'var(--color-primary)' }}>₹{computed.totalAmount.toLocaleString('en-IN')}</span>
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>
                {numberToWordsINR(computed.totalAmount)}
              </div>
            </div>
          </div>

          {/* 5. ADVANCE PAYMENTS (UP TO 3) */}
          <div style={CARD_STYLE}>
            <div style={CARD_HEADER_STYLE}>
              <span>5. Advance Payments ({payments.length}/3)</span>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {selectedClientId && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={syncPaymentsFromSelectedClient}
                    style={{ fontSize: 'var(--text-xs)', color: 'var(--color-accent)', height: '28px', padding: '0 8px' }}
                  >
                    <i className="ti ti-refresh" style={{ marginRight: '4px' }} /> Sync from Booking
                  </Button>
                )}
                {payments.length < 3 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setPaymentError(null)
                      setNewPayAmount(computed.balanceDue > 0 ? String(computed.balanceDue) : '')
                      setShowAddPaymentRow((prev) => !prev)
                    }}
                    style={{ fontSize: 'var(--text-xs)', color: 'var(--color-primary)', height: '28px', padding: '0 10px' }}
                  >
                    <i className="ti ti-plus" style={{ marginRight: '4px' }} /> Add Payment
                  </Button>
                )}
              </div>
            </div>

            {paymentError && (
              <div
                style={{
                  fontSize: 'var(--text-xs)',
                  color: 'var(--color-danger)',
                  backgroundColor: 'var(--color-danger-muted)',
                  borderRadius: '8px',
                  padding: '8px 12px',
                }}
              >
                {paymentError}
              </div>
            )}

            {showAddPaymentRow && payments.length < 3 && (
              <div
                style={{
                  backgroundColor: 'var(--color-surface-raised)',
                  border: '0.5px solid var(--color-primary)',
                  borderRadius: '10px',
                  padding: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5">
                  <div>
                    <label style={LABEL_STYLE}>Amount (₹)</label>
                    <Input
                      type="number"
                      min={1}
                      value={newPayAmount}
                      onChange={(e) => setNewPayAmount(e.target.value)}
                      placeholder="Amount"
                      className="h-9"
                    />
                  </div>
                  <div>
                    <label style={LABEL_STYLE}>Date</label>
                    <DateField value={newPayDateStr} onChange={setNewPayDateStr} />
                  </div>
                  <div>
                    <label style={LABEL_STYLE}>Mode</label>
                    <select
                      value={newPayMode}
                      onChange={(e) => setNewPayMode(e.target.value as InvoicePaymentMode)}
                      style={SELECT_STYLE}
                    >
                      <option value="upi">UPI</option>
                      <option value="bank">Bank Transfer</option>
                      <option value="cash">Cash</option>
                    </select>
                  </div>
                  <div>
                    <label style={LABEL_STYLE}>Reference (Optional)</label>
                    <Input
                      value={newPayRef}
                      onChange={(e) => setNewPayRef(e.target.value)}
                      placeholder="UTR / Ref #"
                      className="h-9"
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setShowAddPaymentRow(false)}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleAddAdvancePayment}
                    style={{ backgroundColor: 'var(--color-primary)', color: '#ffffff' }}
                  >
                    Record Advance
                  </Button>
                </div>
              </div>
            )}

            {payments.length === 0 ? (
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>
                No advance payments added yet. Invoice prints a single &quot;Advance Received&quot; summary line.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {payments.map((p, idx) => (
                  <div
                    key={p.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      backgroundColor: 'var(--color-surface-raised)',
                      border: '0.5px solid var(--color-border)',
                      fontSize: 'var(--text-xs)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700 }}>#{idx + 1}</span>
                      <span style={{ fontWeight: 700, color: 'var(--color-success)' }}>
                        ₹{p.amount.toLocaleString('en-IN')}
                      </span>
                      <span style={{ color: 'var(--color-foreground-muted)' }}>
                        {format(p.date instanceof Date ? p.date : new Date(p.date), 'dd MMM yyyy')}
                      </span>
                      <span style={{ textTransform: 'uppercase', fontWeight: 600 }}>{p.mode}</span>
                      {p.reference && (
                        <span style={{ color: 'var(--color-foreground-subtle)' }}>Ref: {p.reference}</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemovePayment(p.id)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--color-danger)',
                        cursor: 'pointer',
                        padding: '4px',
                      }}
                      title="Remove advance payment"
                    >
                      <i className="ti ti-trash" />
                    </button>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)', paddingTop: '4px', fontWeight: 600 }}>
                  <span>Advance Received: ₹{computed.amountPaid.toLocaleString('en-IN')}</span>
                  <span style={{ color: computed.balanceDue <= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                    {computed.balanceDue <= 0
                      ? 'PAID IN FULL'
                      : `Balance Due: ₹${computed.balanceDue.toLocaleString('en-IN')}`}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* 6. TERMS & PHOTO-STUDIO CLOSING NOTE */}
          <div style={CARD_STYLE}>
            <div style={CARD_HEADER_STYLE}>
              <span>6. Terms & Closing Note</span>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>
                Defaults loaded from Settings
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label style={LABEL_STYLE}>Terms & Conditions</label>
                <textarea
                  rows={3}
                  value={termsAndConditions}
                  onChange={(e) => setTermsOverride(e.target.value)}
                  style={TEXTAREA_STYLE}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label style={LABEL_STYLE}>Closing Note</label>
                <textarea
                  rows={3}
                  value={thankYouNote}
                  onChange={(e) => setThankYouOverride(e.target.value)}
                  style={TEXTAREA_STYLE}
                />
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT PANE: STICKY LIVE A4 PREVIEW */}
        <div className="lg:col-span-5 flex flex-col gap-3" style={{ position: 'sticky', top: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-foreground-subtle)' }}>
              Live A4 Preview · {gstEnabled ? 'Tax Invoice' : 'Invoice'}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleOpenPreviewTab}
              style={{ fontSize: 'var(--text-xs)', height: '28px', padding: '0 8px' }}
            >
              <i className="ti ti-external-link" style={{ marginRight: '4px' }} /> Full Page
            </Button>
          </div>

          <div
            ref={previewContainerRef}
            style={{
              position: 'relative',
              width: '100%',
              height: `${Math.round(1123 * previewScale)}px`,
              backgroundColor: 'var(--color-surface-raised)',
              borderRadius: '8px',
              boxShadow: '0 12px 32px rgba(0,0,0,0.35)',
              overflow: 'hidden',
              border: '0.5px solid var(--color-border)',
            }}
          >
            {previewHtml && (
              <iframe
                srcDoc={previewHtml}
                title="Invoice Live Preview"
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

const CARD_STYLE: React.CSSProperties = {
  backgroundColor: 'var(--color-surface)',
  border: '0.5px solid var(--color-border)',
  borderRadius: '12px',
  padding: '18px',
  display: 'flex',
  flexDirection: 'column',
  gap: '14px',
}

const CARD_HEADER_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  fontSize: 'var(--text-sm)',
  fontWeight: 700,
  color: 'var(--color-foreground)',
  borderBottom: '0.5px solid var(--color-border)',
  paddingBottom: '10px',
}

const LABEL_STYLE: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  fontWeight: 500,
  color: 'var(--color-foreground-muted)',
}

const SELECT_STYLE: React.CSSProperties = {
  height: '36px',
  padding: '0 10px',
  borderRadius: '8px',
  border: '0.5px solid var(--color-border)',
  backgroundColor: 'var(--color-surface-raised)',
  color: 'var(--color-foreground)',
  fontSize: 'var(--text-sm)',
  fontFamily: 'var(--font-inter)',
  width: '100%',
}

const TEXTAREA_STYLE: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: '8px',
  border: '0.5px solid var(--color-border)',
  backgroundColor: 'var(--color-surface-raised)',
  color: 'var(--color-foreground)',
  fontSize: 'var(--text-xs)',
  fontFamily: 'var(--font-inter)',
  resize: 'vertical',
}

const SUB_BOX_STYLE: React.CSSProperties = {
  backgroundColor: 'var(--color-surface-raised)',
  border: '0.5px solid var(--color-border)',
  borderRadius: '10px',
  padding: '12px',
}

const TOTAL_ROW_STYLE: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  fontSize: 'var(--text-xs)',
  color: 'var(--color-foreground-muted)',
}

function ICON_BTN_STYLE(disabled: boolean): React.CSSProperties {
  return {
    background: 'transparent',
    border: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.35 : 1,
    color: 'var(--color-foreground-muted)',
    padding: '4px',
    fontSize: '14px',
  }
}

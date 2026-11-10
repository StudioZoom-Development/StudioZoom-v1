import { generateQuotationPdf } from '../lib/quotation/pdfGenerator'
import type { Quotation } from '../types'
import * as fs from 'fs'
import * as path from 'path'

async function run() {
  const outDir = path.join(process.cwd(), 'test-output')
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true })
  }

  // 1. Standard Sample as requested by user
  const sampleQuotation: Quotation = {
    quotationId: 'test-1',
    quotationNumber: 'ZS-Q-2026-001',
    templateId: 'package1',
    clientId: 'client-ihm',
    clientName: 'IHM School',
    contact: '+91 99952 04915',
    place: 'Chennai',
    eventType: 'Wedding & Reception',
    eventDate: new Date('2026-11-09'),
    validityDate: new Date('2026-11-24'),
    lineItems: [
      { id: '1', description: 'Candid Wedding Photography (Full Day)', qty: 1, rate: 45000, amount: 45000 },
      { id: '2', description: 'Traditional HD Videography (Full Day)', qty: 1, rate: 35000, amount: 35000 },
      { id: '3', description: 'Cinematic Teaser & Highlight Reel', qty: 1, rate: 25000, amount: 25000 },
    ],
    addons: [],
    subtotal: 105000,
    gstEnabled: true,
    gstRate: 18,
    cgst: 9450,
    sgst: 9450,
    grandTotal: 123900,
    status: 'draft',
    createdBy: 'admin',
    createdAt: new Date('2026-11-09'),
  }

  // Test Package 1, 2, 3
  for (const pkg of ['package1', 'package2', 'package3'] as const) {
    const q: Quotation = { ...sampleQuotation, templateId: pkg }
    const pdfBytes = await generateQuotationPdf(q)
    const filePath = path.join(outDir, `${pkg}-sample.pdf`)
    fs.writeFileSync(filePath, Buffer.from(pdfBytes))
    console.log(`Generated ${filePath} (${pdfBytes.length} bytes)`)
  }

  // Test Package 3 with Add-ons
  const sampleWithAddons: Quotation = {
    ...sampleQuotation,
    templateId: 'package3',
    addons: [
      { id: 'a1', description: 'Drone Aerial 4K Coverage', qty: 1, rate: 15000, amount: 15000 },
      { id: 'a2', description: 'Same-Day Edit Video Reel', qty: 1, rate: 12000, amount: 12000 },
    ],
    subtotal: 132000,
    cgst: 11880,
    sgst: 11880,
    grandTotal: 155760,
  }
  const p3AddonsBytes = await generateQuotationPdf(sampleWithAddons)
  fs.writeFileSync(path.join(outDir, 'package3-with-addons.pdf'), Buffer.from(p3AddonsBytes))
  console.log('Generated package3-with-addons.pdf')

  // Test Empty Event Name (checking for dangling dashes or empty brackets)
  const sampleNoEvent: Quotation = {
    ...sampleQuotation,
    eventType: '',
  }
  for (const pkg of ['package1', 'package2', 'package3'] as const) {
    const q: Quotation = { ...sampleNoEvent, templateId: pkg }
    const pdfBytes = await generateQuotationPdf(q)
    fs.writeFileSync(path.join(outDir, `${pkg}-no-event.pdf`), Buffer.from(pdfBytes))
    console.log(`Generated ${pkg}-no-event.pdf`)
  }

  // Test Multi-page Pagination (14 line items)
  const manyItems = Array.from({ length: 14 }).map((_, i) => ({
    id: `item-${i + 1}`,
    description: `Deliverable Service Item #${i + 1} - Premium Wedding Coverage`,
    qty: 1,
    rate: 10000 + i * 2000,
    amount: 10000 + i * 2000,
  }))
  const subtotalMany = manyItems.reduce((acc, it) => acc + it.amount, 0)
  const cgstMany = Math.round(subtotalMany * 0.09)
  const sgstMany = Math.round(subtotalMany * 0.09)
  const grandTotalMany = subtotalMany + cgstMany + sgstMany

  const samplePaginated: Quotation = {
    ...sampleQuotation,
    lineItems: manyItems,
    subtotal: subtotalMany,
    cgst: cgstMany,
    sgst: sgstMany,
    grandTotal: grandTotalMany,
  }

  for (const pkg of ['package1', 'package2', 'package3'] as const) {
    const q: Quotation = { ...samplePaginated, templateId: pkg }
    const pdfBytes = await generateQuotationPdf(q)
    fs.writeFileSync(path.join(outDir, `${pkg}-paginated.pdf`), Buffer.from(pdfBytes))
    console.log(`Generated ${pkg}-paginated.pdf (${pdfBytes.length} bytes)`)
  }

  console.log('ALL PDF GENERATION TESTS PASSED!')
}

run().catch((err) => {
  console.error('Test failed:', err)
  process.exit(1)
})

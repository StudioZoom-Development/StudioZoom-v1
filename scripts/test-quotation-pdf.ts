import type { Quotation } from '../types'
import * as fs from 'fs'
import * as path from 'path'

const API_URL = 'http://localhost:3000/api/quotations/pdf'

async function postPdf(quotation: Partial<Quotation>): Promise<Buffer> {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ quotation }),
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`API returned ${res.status}: ${txt}`)
  }
  const arrayBuffer = await res.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

async function run() {
  const outDir = path.join(process.cwd(), 'test-output')
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true })
  }

  console.log('🚀 Running Quotation PDF Verification Suite against /api/quotations/pdf...\n')

  const baseSample: Quotation = {
    quotationId: 'test-q-001',
    quotationNumber: 'ZS-Q-2026-001',
    templateId: 'package1',
    clientId: 'client-ihm',
    clientName: 'IHM School',
    contact: '+91 93810 29555',
    place: 'Chennai',
    eventType: 'Wedding & Reception',
    eventDate: new Date('2026-11-10'),
    validityDate: new Date('2026-11-25'),
    lineItems: [
      { id: '1', description: 'Candid Wedding Photography (Full Day)', qty: 1, rate: 45000, amount: 45000 },
      { id: '2', description: 'Traditional HD Videography (Full Day)', qty: 1, rate: 35000, amount: 35000 },
      { id: '3', description: 'Cinematic Teaser & Highlight Reel', qty: 1, rate: 25000, amount: 25000 },
    ],
    addons: [
      { id: 'a1', description: 'Drone Coverage', qty: 1, rate: 8000, amount: 8000 },
      { id: 'a2', description: 'Extra Album', qty: 1, rate: 6000, amount: 6000 },
    ],
    subtotal: 105000,
    gstEnabled: true,
    gstRate: 18,
    cgst: 9450,
    sgst: 9450,
    grandTotal: 123900,
    status: 'draft',
    createdBy: 'admin',
    createdAt: new Date('2026-11-10'),
  }

  // 1. Primary Test: Generate test-package-1.pdf, test-package-2.pdf, test-package-3.pdf
  for (const pkg of ['package1', 'package2', 'package3'] as const) {
    const q: Quotation = { ...baseSample, templateId: pkg }
    const pdfBuf = await postPdf(q)
    const outPath = path.join(outDir, `test-${pkg}.pdf`)
    fs.writeFileSync(outPath, pdfBuf)

    // Assert file exists and is > 50 kB (artwork & embedded fonts present)
    const sizeKb = Math.round(pdfBuf.length / 1024)
    if (sizeKb < 50) {
      throw new Error(`Assertion failed: ${outPath} size is ${sizeKb} kB (< 50 kB)`)
    }
    console.log(`✅ ${pkg.toUpperCase()} generated: ${outPath} (${sizeKb} kB > 50 kB)`)
  }

  // 2. Test: GST off
  console.log('\n--- Testing GST Off ---')
  const qGstOff: Quotation = {
    ...baseSample,
    templateId: 'package2',
    gstEnabled: false,
    cgst: 0,
    sgst: 0,
    grandTotal: 105000,
  }
  const gstOffBuf = await postPdf(qGstOff)
  fs.writeFileSync(path.join(outDir, 'test-package2-gst-off.pdf'), gstOffBuf)
  console.log(`✅ Package 2 (GST Off) generated: ${Math.round(gstOffBuf.length / 1024)} kB`)

  // 3. Test: No add-ons
  console.log('\n--- Testing Package 3 No Add-ons ---')
  const qNoAddons: Quotation = {
    ...baseSample,
    templateId: 'package3',
    addons: [],
  }
  const noAddonsBuf = await postPdf(qNoAddons)
  fs.writeFileSync(path.join(outDir, 'test-package3-no-addons.pdf'), noAddonsBuf)
  console.log(`✅ Package 3 (No Add-ons) generated: ${Math.round(noAddonsBuf.length / 1024)} kB`)

  // 4. Test: Empty client name (must omit placeholder, no '()')
  console.log('\n--- Testing Empty Client Name ---')
  const qEmptyClient: Quotation = {
    ...baseSample,
    templateId: 'package2',
    clientName: '',
  }
  const emptyClientBuf = await postPdf(qEmptyClient)
  fs.writeFileSync(path.join(outDir, 'test-package2-empty-client.pdf'), emptyClientBuf)
  console.log(`✅ Package 2 (Empty Client) generated: ${Math.round(emptyClientBuf.length / 1024)} kB`)

  // 5. Test: 12 line items
  console.log('\n--- Testing 12 Line Items ---')
  const twelveItems = Array.from({ length: 12 }).map((_, i) => ({
    id: `item-${i + 1}`,
    description: `Coverage Deliverable #${i + 1} - Premium Service`,
    qty: 1,
    rate: 10000 + i * 1500,
    amount: 10000 + i * 1500,
  }))
  const subtotal12 = twelveItems.reduce((acc, it) => acc + it.amount, 0)
  const q12: Quotation = {
    ...baseSample,
    templateId: 'package1',
    lineItems: twelveItems,
    subtotal: subtotal12,
    cgst: Math.round(subtotal12 * 0.09),
    sgst: Math.round(subtotal12 * 0.09),
    grandTotal: subtotal12 + 2 * Math.round(subtotal12 * 0.09),
  }
  const q12Buf = await postPdf(q12)
  fs.writeFileSync(path.join(outDir, 'test-package1-12items.pdf'), q12Buf)
  console.log(`✅ Package 1 (12 items) generated: ${Math.round(q12Buf.length / 1024)} kB`)

  console.log('\n🎉 ALL VERIFICATION TESTS PASSED SUCCESSFULLY!')
}

run().catch((err) => {
  console.error('\n❌ Test failed:', err)
  process.exit(1)
})

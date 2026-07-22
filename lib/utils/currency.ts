/**
 * Format a number as Indian Rupees (₹)
 * e.g. 125000 → "₹1,25,000"
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

/**
 * Format a number with Indian comma grouping (no currency symbol)
 * e.g. 125000 → "1,25,000"
 */
export function formatNumber(amount: number): string {
  return new Intl.NumberFormat('en-IN').format(amount)
}

/**
 * Parse a currency string back to a number
 * e.g. "₹1,25,000" → 125000
 */
export function parseCurrency(value: string): number {
  return Number(value.replace(/[^0-9.-]/g, ''))
}

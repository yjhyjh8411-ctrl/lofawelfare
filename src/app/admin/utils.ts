export const statusInfo = (s: string) => {
  const map: Record<string, { text: string; color: string; bg: string }> = {
    pending:  { text: '검토중', color: '#92400e', bg: '#fef3c7' },
    approved: { text: '승인',   color: '#065f46', bg: '#d1fae5' },
    rejected: { text: '반려',   color: '#991b1b', bg: '#fee2e2' },
  }
  return map[s] || { text: s, color: '#374151', bg: '#f3f4f6' }
}

export function extractAmount(data?: Record<string, unknown>): number {
  if (!data) return 0
  for (const [k, v] of Object.entries(data)) {
    if (k.includes('금액') || k.includes('금')) {
      const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''))
      if (!isNaN(n) && n >= 0) return n
    }
  }
  for (const v of Object.values(data)) {
    if (typeof v === 'number' && v >= 0) return v
    if (typeof v === 'string') {
      const n = Number(v.replace(/,/g, ''))
      if (!isNaN(n) && n > 0 && n < 1e10) return n
    }
  }
  return 0
}

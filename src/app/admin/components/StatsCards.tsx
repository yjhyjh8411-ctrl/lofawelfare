'use client'

interface StatsCardsProps {
  totalCount: number
  pendingCount: number
  approvedCount: number
  rejectedCount: number
  selectedYear: number
}

export default function StatsCards({ totalCount, pendingCount, approvedCount, rejectedCount }: StatsCardsProps) {
  const stats = [
    { title: '전체 신청', value: totalCount, color: '#2563eb', bar: '#3b82f6' },
    { title: '승인 대기중 (처리 필요)', value: pendingCount, color: '#d97706', bar: '#f59e0b' },
    { title: '승인 완료', value: approvedCount, color: '#059669', bar: '#10b981' },
    { title: '반려 내역', value: rejectedCount, color: '#dc2626', bar: '#ef4444' },
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
      {stats.map(({ title, value, color, bar }) => (
        <div key={title} style={{ background: '#fff', borderRadius: 12, padding: '18px 22px', boxShadow: '0 1px 3px rgba(0,0,0,0.07)' }}>
          <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 6 }}>{title}</p>
          <p style={{ fontSize: 34, fontWeight: 700, color, lineHeight: 1 }}>{value}</p>
          <div style={{ height: 4, background: '#f3f4f6', borderRadius: 2, marginTop: 14 }}>
            <div style={{ height: '100%', width: value > 0 ? '70%' : '8%', background: bar, borderRadius: 2, transition: 'width 0.5s' }} />
          </div>
        </div>
      ))}
    </div>
  )
}

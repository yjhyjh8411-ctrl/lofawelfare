'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/lib/auth-context'
import Navbar from '@/components/Navbar'

interface SettlementRow {
  id: string
  category: string
  annualBudget: number
  monthly: number[]  // 12 months
  isSubItem?: boolean
  parentCategory?: string
  order: number
}

interface SettlementData {
  id: string
  year: number
  rows: SettlementRow[]
  updatedAt?: { toDate?: () => Date } | null
}

export default function SettlementPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [data, setData] = useState<SettlementData | null>(null)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [dataLoading, setDataLoading] = useState(true)
  const [years, setYears] = useState<number[]>([])

  useEffect(() => {
    if (!loading && !user) router.replace('/login')
  }, [user, loading, router])

  useEffect(() => {
    if (!user) return
    const load = async () => {
      setDataLoading(true)
      try {
        // Load all settlement documents to get available years
        const allSnap = await getDocs(collection(db, 'settlements'))
        const allDocs = allSnap.docs.map(d => ({ id: d.id, ...d.data() } as SettlementData))
        const availableYears = [...new Set(allDocs.map(d => d.year))].sort((a, b) => b - a)
        if (availableYears.length === 0) availableYears.push(new Date().getFullYear())
        setYears(availableYears)

        // Load selected year data
        const yearSnap = await getDocs(query(collection(db, 'settlements'), where('year', '==', selectedYear)))
        if (!yearSnap.empty) {
          const d = yearSnap.docs[0]
          setData({ id: d.id, ...d.data() } as SettlementData)
        } else {
          setData(null)
        }
      } catch (e) { console.error(e) }
      finally { setDataLoading(false) }
    }
    load()
  }, [user, selectedYear])

  if (loading) return <div style={loadingStyle}>로딩 중...</div>
  if (!user) return null

  const months = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월']

  return (
    <div style={{ minHeight: '100vh', background: '#f8f9fa', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <Navbar />
      <div style={{ maxWidth: 1300, margin: '0 auto', padding: '32px 20px 60px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#111827' }}>회계결산 현황</h1>
          <select
            value={selectedYear}
            onChange={e => setSelectedYear(Number(e.target.value))}
            style={{
              border: '1px solid #d1d5db',
              borderRadius: 8,
              padding: '8px 16px',
              fontSize: 14,
              fontWeight: 600,
              background: '#fff',
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            {years.map(y => (
              <option key={y} value={y}>{y}년</option>
            ))}
          </select>
        </div>
        <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 28 }}>월별 세입, 세출, 차기이월 금액을 확인할 수 있습니다.</p>

        {dataLoading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>로딩 중...</div>
        ) : !data || !data.rows || data.rows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af', background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb' }}>
            {selectedYear}년 회계결산 데이터가 없습니다.
          </div>
        ) : (
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 1200 }}>
              <thead>
                <tr style={{ background: '#1a56db' }}>
                  <th style={{ ...thStyle, position: 'sticky', left: 0, background: '#1a56db', zIndex: 1, minWidth: 120 }}>구분</th>
                  <th style={{ ...thStyle, minWidth: 100 }}>연간예산</th>
                  {months.map(m => (
                    <th key={m} style={{ ...thStyle, minWidth: 90 }}>{m}</th>
                  ))}
                  <th style={{ ...thStyle, minWidth: 100 }}>집행 합계</th>
                  <th style={{ ...thStyle, minWidth: 100 }}>집행잔액</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.sort((a, b) => a.order - b.order).map((row, idx) => {
                  const monthlyTotal = row.monthly.reduce((s, v) => s + (v || 0), 0)
                  const isHeader = !row.isSubItem
                  const isExpenseItem = row.category === '세출' || row.parentCategory === '세출'
                  const remaining = isExpenseItem ? row.annualBudget - monthlyTotal : 0
                  return (
                    <tr key={row.id || idx} style={{ borderBottom: '1px solid #f3f4f6', background: isHeader ? '#f9fafb' : '#fff' }}>
                      <td style={{
                        ...tdStyle,
                        position: 'sticky', left: 0, zIndex: 1,
                        background: isHeader ? '#f9fafb' : '#fff',
                        fontWeight: isHeader ? 700 : 400,
                        paddingLeft: row.isSubItem ? 28 : 16,
                        color: row.isSubItem ? '#6b7280' : '#111827',
                      }}>
                        {row.isSubItem ? `· ${row.category}` : row.category}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: isHeader ? 700 : 400 }}>
                        {row.annualBudget ? row.annualBudget.toLocaleString() : '-'}
                      </td>
                      {row.monthly.map((val, mi) => (
                        <td key={mi} style={{ ...tdStyle, textAlign: 'right', color: val ? '#111827' : '#d1d5db' }}>
                          {val ? val.toLocaleString() : '-'}
                        </td>
                      ))}
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: monthlyTotal > 0 ? '#1a56db' : '#d1d5db' }}>
                        {monthlyTotal > 0 ? monthlyTotal.toLocaleString() : '-'}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: isExpenseItem ? (remaining >= 0 ? '#059669' : '#dc2626') : '#d1d5db' }}>
                        {isExpenseItem ? remaining.toLocaleString() : '-'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {data?.updatedAt?.toDate && (
          <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 12, textAlign: 'right' }}>
            최종 수정: {data.updatedAt.toDate()?.toLocaleDateString('ko-KR')}
          </p>
        )}
      </div>
    </div>
  )
}

const thStyle: React.CSSProperties = {
  padding: '12px 12px',
  textAlign: 'center',
  fontWeight: 600,
  color: '#fff',
  fontSize: 13,
  whiteSpace: 'nowrap',
}

const tdStyle: React.CSSProperties = {
  padding: '11px 12px',
  fontSize: 13,
  whiteSpace: 'nowrap',
}

const loadingStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontSize: 14, color: '#9ca3af', background: '#f8f9fa' }

'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { collection, getDocs, query, where, getDoc, doc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/lib/auth-context'
import Navbar from '@/components/Navbar'
import QRCorner from '@/components/QRCorner'

interface FormConfig {
  id: string
  제목: string
  설명: string
  한도설명?: string
  icon?: string
  color?: string
  isActive: boolean
  order: number
  periods?: { year: number; start: string; end: string }[]
}

interface BudgetGroup {
  id: string
  name: string
  limitAmount: number
  period: 'annual' | 'monthly'
  formIds: string[]
}

export default function ApplyPage() {
  const { user, profile, loading } = useAuth()
  const router = useRouter()
  const [forms, setForms] = useState<FormConfig[]>([])
  const [approvedByForm, setApprovedByForm] = useState<Record<string, number>>({})
  const [budgetGroups, setBudgetGroups] = useState<BudgetGroup[]>([])
  const [dataLoading, setDataLoading] = useState(true)
  const [alertMsg, setAlertMsg] = useState('')

  useEffect(() => {
    if (!loading && !user) router.replace('/login')
  }, [user, loading, router])

  useEffect(() => {
    if (!user) return
    const load = async () => {
      try {
        const year = new Date().getFullYear()

        const formsSnap = await getDocs(collection(db, 'form_configs'))
        const formList = formsSnap.docs
          .map(d => ({ id: d.id, ...d.data() } as FormConfig))
          .filter(f => f.isActive)
          .sort((a, b) => (a.order || 0) - (b.order || 0))
        setForms(formList)

        const groupsSnap = await getDocs(collection(db, 'budget_groups'))
        setBudgetGroups(groupsSnap.docs.map(d => ({ id: d.id, ...d.data() } as BudgetGroup)))

        const userDocSnap = await getDoc(doc(db, 'users', user.uid))
        const employeeId = userDocSnap.exists() ? (userDocSnap.data()?.['사번'] || '') : ''
        const appsSnap = employeeId
          ? await getDocs(query(collection(db, 'applications'), where('applicant.사번', '==', employeeId)))
          : await getDocs(query(collection(db, 'applications'), where('user_id', '==', user.uid)))
        const yearApps = appsSnap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(a => {
            const d = (a as Record<string, unknown>).created_at as { toDate?: () => Date } | null
            return d?.toDate?.()?.getFullYear() === year
          })

        const byForm: Record<string, number> = {}
        yearApps.filter(a => (a as Record<string, unknown>).status === 'approved').forEach(a => {
          const data = (a as Record<string, unknown>).data as Record<string, unknown> | undefined
          const formId = (a as Record<string, unknown>).form_id as string
          const amt = extractAmount(data)
          byForm[formId] = (byForm[formId] || 0) + amt
        })
        setApprovedByForm(byForm)
      } catch (e) { console.error('Apply page load error:', e) }
      finally { setDataLoading(false) }
    }
    load()
  }, [user])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontSize: 14, color: '#9ca3af', background: '#f8f9fa' }}>
      로딩 중...
    </div>
  )
  if (!user) return null

  return (
    <div style={{ minHeight: '100vh', background: '#f8f9fa', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <Navbar />
      {alertMsg && (
        <div style={{ position: 'fixed', top: 72, left: '50%', transform: 'translateX(-50%)', background: '#dc2626', color: '#fff', padding: '12px 28px', borderRadius: 10, zIndex: 9999, fontWeight: 600, fontSize: 14, boxShadow: '0 4px 16px rgba(0,0,0,0.15)', whiteSpace: 'nowrap' }}>
          {alertMsg}
        </div>
      )}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 20px 60px' }}>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#111827', marginBottom: 6 }}>신청 가능한 복지 항목</h1>
          <p style={{ fontSize: 14, color: '#6b7280' }}>사내근로복지기금에서 신청 가능한 항목을 확인하고 신청하세요.</p>
        </div>

        {/* Budget group banners */}
        {budgetGroups.map(group => {
          const groupTotal = group.formIds.reduce((s, fid) => s + (approvedByForm[fid] || 0), 0)
          const remaining = group.limitAmount - groupTotal
          const pct = Math.min((groupTotal / group.limitAmount) * 100, 100)
          return (
            <div key={group.id} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10, background: '#fff', flexWrap: 'wrap' }}>
              <span style={{ background: '#fef3c7', color: '#92400e', padding: '2px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{group.name}</span>
              <span style={{ fontSize: 12, color: '#9ca3af' }}>
                {forms.filter(f => group.formIds.includes(f.id)).map(f => f.제목).join(' · ')}
              </span>
              <span style={{ marginLeft: 'auto', fontSize: 12, color: '#374151', whiteSpace: 'nowrap' }}>
                사용 <strong>{groupTotal.toLocaleString()}원</strong>
                <span style={{ color: '#9ca3af' }}> / 잔여 <strong style={{ color: remaining > 0 ? '#059669' : '#dc2626' }}>{remaining.toLocaleString()}원</strong></span>
                <span style={{ color: '#d1d5db' }}> (연 {group.limitAmount.toLocaleString()}원)</span>
              </span>
              <div style={{ width: '100%', height: 3, background: '#f3f4f6', borderRadius: 2 }}>
                <div style={{ height: '100%', width: `${pct}%`, background: pct >= 100 ? '#ef4444' : '#4285f4', borderRadius: 2, transition: 'width 0.4s' }} />
              </div>
            </div>
          )
        })}

        {/* Form cards grid */}
        {dataLoading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>로딩 중...</div>
        ) : forms.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af', background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb' }}>
            현재 신청 가능한 복지 항목이 없습니다.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16, marginTop: 16 }}>
            {forms.map(f => {
              const approved = approvedByForm[f.id] || 0
              const iconColor = f.color || '#4285f4'
              const now = new Date().toISOString().slice(0, 10)
              const periods = f.periods || []
              const activePeriod = periods.find(p => p.start && p.end && now >= p.start && now <= p.end)
              const nextPeriod = periods.filter(p => p.start && now < p.start).sort((a, b) => a.start.localeCompare(b.start))[0]
              const isInPeriod = !!activePeriod
              const hasPeriods = periods.length > 0

              const handleClick = () => {
                if (hasPeriods && !isInPeriod) {
                  if (nextPeriod) {
                    setAlertMsg(`현재 신청기간이 아닙니다. 다음 신청기간: ${nextPeriod.start} ~ ${nextPeriod.end}`)
                  } else {
                    setAlertMsg('현재 신청기간이 아닙니다.')
                  }
                  setTimeout(() => setAlertMsg(''), 3000)
                  return
                }
                router.push(`/apply/_/?formId=${f.id}`)
              }

              return (
                <div
                  key={f.id}
                  onClick={handleClick}
                  style={{ ...cardStyle, padding: '22px 24px', cursor: 'pointer', transition: 'box-shadow 0.15s, transform 0.15s', opacity: hasPeriods && !isInPeriod ? 0.6 : 1 }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLDivElement).style.boxShadow = '0 8px 24px rgba(0,0,0,0.1)'
                    ;(e.currentTarget as HTMLDivElement).style.transform = 'translateY(-3px)'
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 4px rgba(0,0,0,0.06)'
                    ;(e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: `${iconColor}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
                      {f.icon || '📋'}
                    </div>
                    {hasPeriods && (
                      <div style={{ fontSize: 11, lineHeight: 1.5, marginTop: 4 }}>
                        {activePeriod ? (
                          <span style={{ color: '#059669', fontWeight: 600 }}>
                            신청기간: {activePeriod.start.slice(5).replace('-','/')} ~ {activePeriod.end.slice(5).replace('-','/')}
                          </span>
                        ) : nextPeriod ? (
                          <span style={{ color: '#f59e0b', fontWeight: 600 }}>
                            다음 신청: {nextPeriod.start.slice(5).replace('-','/')} ~ {nextPeriod.end.slice(5).replace('-','/')}
                          </span>
                        ) : (
                          <span style={{ color: '#dc2626', fontWeight: 600 }}>신청 마감</span>
                        )}
                      </div>
                    )}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#111827', marginBottom: 6 }}>{f.제목}</div>
                  <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 16, lineHeight: 1.6 }}>{f.설명}</div>
                  <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                    <div>
                      <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 2 }}>올해 승인</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: approved > 0 ? '#4285f4' : '#9ca3af' }}>{approved.toLocaleString()}원</div>
                    </div>
                    {f.한도설명 && (
                      <div style={{ fontSize: 11, color: '#9ca3af', textAlign: 'right', maxWidth: 100, lineHeight: 1.4 }}>
                        한도: {f.한도설명}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
      <QRCorner url="/apply" caption="복지 신청 페이지" />
    </div>
  )
}

function extractAmount(data?: Record<string, unknown>): number {
  if (!data) return 0
  for (const [k, v] of Object.entries(data)) {
    if (k.includes('금액') || k === 'amount') {
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

const cardStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e5e7eb',
  borderRadius: 14,
  boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
}

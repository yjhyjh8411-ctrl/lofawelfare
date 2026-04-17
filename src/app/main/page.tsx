'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { collection, getDocs, query, where, orderBy, getDoc, doc, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/lib/auth-context'
import Navbar from '@/components/Navbar'

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

interface Application {
  id: string
  form_id: string
  status: string
  created_at: { toDate?: () => Date } | null
  data?: Record<string, unknown>
  formTitle?: string
  reject_reason?: string
}

interface BudgetGroup {
  id: string
  name: string
  limitAmount: number
  period: 'annual' | 'monthly'
  formIds: string[]
}

export default function MainPage() {
  return <Suspense fallback={null}><MainPageInner /></Suspense>
}

function MainPageInner() {
  const { user, profile, loading } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const isPreview = searchParams.get('preview') === '1'
  const [forms, setForms] = useState<FormConfig[]>([])
  const [myApps, setMyApps] = useState<Application[]>([])
  const [approvedByForm, setApprovedByForm] = useState<Record<string, number>>({})
  const [announcement, setAnnouncement] = useState('')
  const [popupNotice, setPopupNotice] = useState<{ 제목: string; 내용: string; 시작일: string; 종료일: string; 활성: boolean } | null>(null)
  const [showPopup, setShowPopup] = useState(false)
  const [regulations, setRegulations] = useState<{ id: string; 버전명: string; files: { name: string; url: string }[] }[]>([])
  const [budgetGroups, setBudgetGroups] = useState<BudgetGroup[]>([])
  const [alertMsg, setAlertMsg] = useState('')

  useEffect(() => {
    if (!loading && !user) router.replace('/login')
    if (!loading && profile?.isAdmin && !isPreview) router.replace('/admin')
  }, [user, profile, loading, router, isPreview])

  useEffect(() => {
    if (!user) return
    const load = async () => {
      try {
        const year = new Date().getFullYear()

        // Forms
        const formsSnap = await getDocs(collection(db, 'form_configs'))
        const formList = formsSnap.docs
          .map(d => ({ id: d.id, ...d.data() } as FormConfig))
          .filter(f => f.isActive)
          .sort((a, b) => (a.order || 0) - (b.order || 0))
        setForms(formList)

        // Budget groups
        const groupsSnap = await getDocs(collection(db, 'budget_groups'))
        setBudgetGroups(groupsSnap.docs.map(d => ({ id: d.id, ...d.data() } as BudgetGroup)))

        // My applications — 사번으로 조회 (마이그레이션 데이터 호환)
        const userDocSnap = await getDoc(doc(db, 'users', user.uid))
        const employeeId = userDocSnap.exists() ? (userDocSnap.data()?.['사번'] || '') : ''
        const appsSnap = employeeId
          ? await getDocs(query(collection(db, 'applications'), where('applicant.사번', '==', employeeId)))
          : await getDocs(query(collection(db, 'applications'), where('user_id', '==', user.uid)))
        const allApps = appsSnap.docs
          .map(d => ({ id: d.id, ...d.data() } as Application))
          .sort((a, b) => {
            const ta = a.created_at?.toDate?.()?.getTime() ?? 0
            const tb = b.created_at?.toDate?.()?.getTime() ?? 0
            return tb - ta
          })
        const yearApps = allApps.filter(a => {
          const d = a.created_at?.toDate?.()
          return d ? d.getFullYear() === year : false
        })
        setMyApps(yearApps.map(a => ({
          ...a,
          formTitle: formList.find(f => f.id === a.form_id)?.제목 || a.form_id,
        })))

        // Approved amounts per form
        const byForm: Record<string, number> = {}
        yearApps.filter(a => a.status === 'approved').forEach(a => {
          const amt = extractAmount(a.data)
          byForm[a.form_id] = (byForm[a.form_id] || 0) + amt
        })
        setApprovedByForm(byForm)

        // Announcement + Popup notice
        const settingsDoc = await getDoc(doc(db, 'settings', 'global'))
        if (settingsDoc.exists()) {
          setAnnouncement(settingsDoc.data()?.공지사항 || '')
          const popup = settingsDoc.data()?.팝업공지
          if (popup?.활성 && popup.시작일 && popup.종료일) {
            const today = new Date().toISOString().slice(0, 10)
            if (today >= popup.시작일 && today <= popup.종료일) {
              const dismissKey = `popup_dismissed_${popup.시작일}_${popup.종료일}`
              const dismissed = localStorage.getItem(dismissKey)
              if (!dismissed || Date.now() - Number(dismissed) > 24 * 60 * 60 * 1000) {
                setPopupNotice(popup)
                setShowPopup(true)
              }
            }
          }
        }

        // Regulations
        try {
          const regsSnap = await getDocs(query(collection(db, 'regulations'), orderBy('createdAt', 'desc')))
          setRegulations(regsSnap.docs.map(d => ({ id: d.id, ...d.data() } as { id: string; 버전명: string; files: { name: string; url: string }[] })))
        } catch { /* no regs */ }
      } catch (e) { console.error('Main page load error:', e) }
    }
    load()
  }, [user])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontSize: 14, color: '#9ca3af', background: '#f8f9fa' }}>
      로딩 중...
    </div>
  )
  if (!user) return null

  const year = new Date().getFullYear()

  const statusInfo = (s: string) => ({
    pending:  { text: '검토중', color: '#92400e', bg: '#fef3c7' },
    approved: { text: '승인',   color: '#065f46', bg: '#d1fae5' },
    rejected: { text: '반려',   color: '#991b1b', bg: '#fee2e2' },
  }[s] || { text: s, color: '#374151', bg: '#f3f4f6' })

  const card: React.CSSProperties = {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 14,
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8f9fa', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <Navbar />
      {alertMsg && (
        <div style={{ position: 'fixed', top: 72, left: '50%', transform: 'translateX(-50%)', background: '#dc2626', color: '#fff', padding: '12px 28px', borderRadius: 10, zIndex: 9999, fontWeight: 600, fontSize: 14, boxShadow: '0 4px 16px rgba(0,0,0,0.15)', whiteSpace: 'nowrap' }}>
          {alertMsg}
        </div>
      )}

      {/* Popup Notice Modal */}
      {showPopup && popupNotice && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 32, width: 480, maxWidth: '90vw', maxHeight: '80vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: '#111827', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 24 }}>📢</span> {popupNotice.제목}
            </h2>
            <p style={{ fontSize: 14, color: '#374151', lineHeight: 1.8, whiteSpace: 'pre-wrap', marginBottom: 24 }}>
              {popupNotice.내용}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, color: '#6b7280' }}>
                <input
                  type="checkbox"
                  onChange={e => {
                    if (e.target.checked && popupNotice) {
                      const dismissKey = `popup_dismissed_${popupNotice.시작일}_${popupNotice.종료일}`
                      localStorage.setItem(dismissKey, String(Date.now()))
                    }
                  }}
                />
                오늘 하루 안 보기
              </label>
              <button
                onClick={() => setShowPopup(false)}
                style={{ background: '#1a56db', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 28px', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 20px 60px' }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#111827', letterSpacing: -0.5, marginBottom: 4 }}>
            안녕하세요, {profile?.name || ''}님
          </h1>
          <p style={{ fontSize: 14, color: '#6b7280' }}>{year}년 복지기금 신청 시스템입니다.</p>
        </div>

        {/* MY APPLICATIONS */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: '#111827' }}>{year}년 내 신청 현황</h2>
            <button onClick={() => router.push('/my-status')} style={{ background: 'none', border: 'none', color: '#4285f4', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              전체보기 →
            </button>
          </div>

          {myApps.length === 0 ? (
            <div style={{ ...card, padding: '48px 20px', textAlign: 'center', color: '#9ca3af' }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>📭</div>
              <div style={{ fontSize: 15 }}>{year}년 신청 내역이 없습니다.</div>
            </div>
          ) : (
            <div style={{ ...card, overflow: 'hidden' }}>
              {/* 헤더 */}
              <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 130px 90px 1fr 80px', padding: '10px 20px', background: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>
                <span>신청일시</span><span>항목</span><span style={{ textAlign: 'right' }}>신청금액</span><span style={{ textAlign: 'center' }}>상태</span><span>비고</span><span style={{ textAlign: 'center' }}>관리</span>
              </div>
              {myApps.slice(0, 6).map(app => {
                const s = statusInfo(app.status)
                const date = app.created_at?.toDate?.()
                const amount = extractAmount(app.data)
                const note = app.status === 'pending' ? '검토 중입니다.'
                  : app.status === 'approved' ? '승인되었습니다.'
                  : app.status === 'rejected' ? (app.reject_reason || '반려되었습니다.')
                  : app.status === 'cancelled' ? '취소되었습니다.' : ''
                return (
                  <div key={app.id} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 130px 90px 1fr 80px', padding: '14px 20px', borderBottom: '1px solid #f3f4f6', alignItems: 'center', fontSize: 13 }}>
                    <span style={{ color: '#9ca3af', fontSize: 12 }}>
                      {date ? `${date.toLocaleDateString('ko-KR')} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}` : '-'}
                    </span>
                    <span style={{ fontWeight: 600, color: '#111827', cursor: 'pointer' }} onClick={() => router.push('/my-status')}>{app.formTitle}</span>
                    <span style={{ textAlign: 'right', fontWeight: 700, color: amount > 0 ? '#111827' : '#9ca3af' }}>
                      {amount > 0 ? `${amount.toLocaleString()}원` : '-'}
                    </span>
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                      <span style={{ background: s.bg, color: s.color, padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 700 }}>{s.text}</span>
                    </div>
                    <span style={{ color: app.status === 'rejected' ? '#dc2626' : '#6b7280', fontSize: 12 }}>{note}</span>
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                      {app.status === 'pending' && (
                        <button
                          onClick={async () => {
                            if (!confirm('신청을 취소하시겠습니까?')) return
                            await updateDoc(doc(db, 'applications', app.id), { status: 'cancelled' })
                            setMyApps(p => p.filter(a => a.id !== app.id))
                          }}
                          style={{ background: 'none', border: '1px solid #fca5a5', borderRadius: 6, color: '#ef4444', fontSize: 12, padding: '3px 10px', cursor: 'pointer' }}
                        >취소</button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* WELFARE SERVICES */}
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: '#111827', marginBottom: 12 }}>복지 항목 선택</h2>

          {/* Budget group banners — 작게 */}
          {budgetGroups.map(group => {
            const groupTotal = group.formIds.reduce((s, fid) => s + (approvedByForm[fid] || 0), 0)
            const remaining = group.limitAmount - groupTotal
            const pct = Math.min((groupTotal / group.limitAmount) * 100, 100)
            return (
              <div key={group.id} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 14px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10, background: '#fafafa', flexWrap: 'wrap' }}>
                <span style={{ background: '#fef3c7', color: '#92400e', padding: '1px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{group.name}</span>
                <span style={{ fontSize: 11, color: '#9ca3af' }}>
                  {forms.filter(f => group.formIds.includes(f.id)).map(f => f.제목).join(' · ')}
                </span>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: '#374151', whiteSpace: 'nowrap' }}>
                  사용 <strong>{groupTotal.toLocaleString()}원</strong>
                  <span style={{ color: '#9ca3af' }}> / 잔여 <strong style={{ color: remaining > 0 ? '#059669' : '#dc2626' }}>{remaining.toLocaleString()}원</strong></span>
                  <span style={{ color: '#d1d5db' }}> (연 {group.limitAmount.toLocaleString()}원)</span>
                </span>
                <div style={{ width: '100%', height: 2, background: '#f3f4f6', borderRadius: 2 }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: pct >= 100 ? '#ef4444' : '#4285f4', borderRadius: 2, transition: 'width 0.4s' }} />
                </div>
              </div>
            )
          })}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
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
                  style={{ ...card, padding: '18px 20px', cursor: 'pointer', transition: 'box-shadow 0.15s, transform 0.15s', opacity: hasPeriods && !isInPeriod ? 0.6 : 1 }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLDivElement).style.boxShadow = '0 6px 20px rgba(0,0,0,0.1)'
                    ;(e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 4px rgba(0,0,0,0.06)'
                    ;(e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: `${iconColor}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
                      {f.icon || '📋'}
                    </div>
                    {hasPeriods && (
                      <div style={{ fontSize: 11, marginTop: 4, lineHeight: 1.4 }}>
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
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 4 }}>{f.제목}</div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 14, lineHeight: 1.5 }}>{f.설명}</div>
                  <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                    <div>
                      <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 2 }}>올해 승인</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: approved > 0 ? '#4285f4' : '#9ca3af' }}>{approved.toLocaleString()}원</div>
                    </div>
                    {f.한도설명 && (
                      <div style={{ fontSize: 10, color: '#9ca3af', textAlign: 'right', maxWidth: 90, lineHeight: 1.4 }}>
                        한도: {f.한도설명}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* 공지사항 + 규정집 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div style={{ ...card, padding: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              📢 공지사항
            </h3>
            {announcement ? (
              <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{announcement}</p>
            ) : (
              <p style={{ fontSize: 13, color: '#9ca3af' }}>공지사항이 없습니다.</p>
            )}
          </div>

          <div style={{ ...card, padding: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
              📄 복지기금 규정집
            </h3>
            <p style={{ fontSize: 12, color: '#9ca3af', marginBottom: 14 }}>신청 전 규정집을 확인하여 누락 서류가 없도록 주의해 주세요.</p>
            {regulations.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {regulations.slice(0, 3).map(reg => (
                  <div key={reg.id} style={{ border: '1px solid #f3f4f6', borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#111827', marginBottom: 6 }}>{reg.버전명}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {reg.files.map((fi, i) => (
                        <a key={i} href={fi.url} target="_blank" rel="noopener noreferrer"
                          style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '2px 8px', borderRadius: 6, fontSize: 12, textDecoration: 'none' }}>
                          📎 {fi.name}
                        </a>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <button
                onClick={() => window.open('https://www.lofa.or.kr', '_blank')}
                style={{ width: '100%', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: 8, padding: '11px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                📋 규정집 전체 보기
              </button>
            )}
          </div>
        </div>

      </div>
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

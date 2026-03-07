'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/lib/auth-context'
import Navbar from '@/components/Navbar'

interface Application {
  id: string
  form_id: string
  status: string
  created_at: { toDate?: () => Date } | null
  data?: Record<string, unknown>
  formTitle?: string
  reject_reason?: string
}

interface FormConfig {
  id: string
  제목: string
}

const statusInfo = (s: string) => {
  const map: Record<string, { text: string; color: string; bg: string }> = {
    pending: { text: '검토중', color: '#92400e', bg: '#fef3c7' },
    approved: { text: '승인', color: '#065f46', bg: '#d1fae5' },
    rejected: { text: '반려', color: '#991b1b', bg: '#fee2e2' },
  }
  return map[s] || { text: s, color: '#374151', bg: '#f3f4f6' }
}

export default function MyStatusPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [apps, setApps] = useState<Application[]>([])
  const [dataLoading, setDataLoading] = useState(true)
  const [selected, setSelected] = useState<Application | null>(null)

  useEffect(() => {
    if (!loading && !user) router.replace('/login')
  }, [user, loading, router])

  useEffect(() => {
    if (!user) return
    const load = async () => {
      try {
        const formsSnap = await getDocs(collection(db, 'form_configs'))
        const formMap: Record<string, string> = {}
        formsSnap.docs.forEach(d => { formMap[d.id] = (d.data() as FormConfig).제목 })

        const appsSnap = await getDocs(
          query(collection(db, 'applications'), where('user_id', '==', user.uid))
        )
        const appList = appsSnap.docs
          .map(d => ({
            id: d.id,
            ...d.data(),
            formTitle: formMap[d.data().form_id] || d.data().form_id,
          } as Application))
          .sort((a, b) => {
            const ta = a.created_at?.toDate?.()?.getTime() ?? 0
            const tb = b.created_at?.toDate?.()?.getTime() ?? 0
            return tb - ta
          })
        setApps(appList)
      } catch (e) { console.error('my-status load error:', e) }
      finally { setDataLoading(false) }
    }
    load()
  }, [user])

  if (loading || dataLoading) return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6' }}>
      <Navbar />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>로딩 중...</div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6' }}>
      <Navbar />
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '32px 16px' }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 24, color: '#111827' }}>내 신청현황</h2>

        {apps.length === 0 ? (
          <div style={{
            background: '#fff', borderRadius: 12, padding: 48,
            textAlign: 'center', color: '#9ca3af', boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
          }}>
            신청 내역이 없습니다.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {apps.map(app => {
              const s = statusInfo(app.status)
              const date = app.created_at?.toDate?.()
              return (
                <div
                  key={app.id}
                  style={{
                    background: '#fff', borderRadius: 10, padding: '18px 20px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    border: '1px solid #e5e7eb',
                  }}
                >
                  <div onClick={() => setSelected(app)} style={{ cursor: 'pointer', flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 15, color: '#111827', marginBottom: 4 }}>
                      {app.formTitle}
                    </div>
                    <div style={{ color: '#6b7280', fontSize: 12 }}>
                      신청일: {date ? date.toLocaleDateString('ko-KR') : '-'}
                    </div>
                    {app.status === 'rejected' && app.reject_reason && (
                      <div style={{ color: '#dc2626', fontSize: 12, marginTop: 4 }}>
                        반려 사유: {app.reject_reason}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    {app.status === 'pending' && (
                      <button
                        onClick={() => router.push(`/apply/${app.form_id}?edit=${app.id}`)}
                        style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                      >
                        ✏️ 수정
                      </button>
                    )}
                    <span style={{
                      background: s.bg, color: s.color,
                      padding: '4px 12px', borderRadius: 20, fontSize: 13, fontWeight: 600,
                    }}>{s.text}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 상세 모달 */}
      {selected && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => setSelected(null)}
        >
          <div
            style={{ background: '#fff', borderRadius: 12, padding: 32, width: 480, maxHeight: '80vh', overflow: 'auto' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ fontSize: 18, fontWeight: 700 }}>{selected.formTitle}</h3>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6b7280' }}>✕</button>
            </div>
            {selected.data && Object.entries(selected.data).map(([k, v]) => (
              <div key={k} style={{ display: 'flex', gap: 12, marginBottom: 10, padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}>
                <span style={{ color: '#6b7280', minWidth: 100 }}>{k}</span>
                <span style={{ fontWeight: 500 }}>{String(v)}</span>
              </div>
            ))}
            {selected.status === 'rejected' && selected.reject_reason && (
              <div style={{ background: '#fef2f2', borderRadius: 8, padding: 12, marginTop: 12 }}>
                <span style={{ color: '#dc2626', fontWeight: 600 }}>반려 사유: </span>
                <span style={{ color: '#dc2626' }}>{selected.reject_reason}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

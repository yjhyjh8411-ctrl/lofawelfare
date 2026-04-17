'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { collection, getDocs, query, orderBy, getDoc, doc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/lib/auth-context'
import Navbar from '@/components/Navbar'

interface Notice {
  id: string
  title: string
  content: string
  author: string
  createdAt: { toDate?: () => Date } | null
  isPinned?: boolean
  files?: { name: string; url: string }[]
}

export default function NoticesPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [notices, setNotices] = useState<Notice[]>([])
  const [globalAnnouncement, setGlobalAnnouncement] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [dataLoading, setDataLoading] = useState(true)

  useEffect(() => {
    if (!loading && !user) router.replace('/login')
  }, [user, loading, router])

  useEffect(() => {
    if (!user) return
    const load = async () => {
      try {
        // Load notices collection
        try {
          const snap = await getDocs(query(collection(db, 'notices'), orderBy('createdAt', 'desc')))
          setNotices(snap.docs.map(d => ({ id: d.id, ...d.data() } as Notice)))
        } catch { /* collection may not exist yet */ }

        // Load global announcement from settings
        try {
          const settingsDoc = await getDoc(doc(db, 'settings', 'global'))
          if (settingsDoc.exists()) setGlobalAnnouncement(settingsDoc.data()?.공지사항 || '')
        } catch { /* */ }
      } catch (e) { console.error(e) }
      finally { setDataLoading(false) }
    }
    load()
  }, [user])

  if (loading) return <div style={loadingStyle}>로딩 중...</div>
  if (!user) return null

  const pinned = notices.filter(n => n.isPinned)
  const regular = notices.filter(n => !n.isPinned)

  return (
    <div style={{ minHeight: '100vh', background: '#f8f9fa', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <Navbar />
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 20px 60px' }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#111827', marginBottom: 6 }}>공지사항</h1>
        <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 28 }}>사내근로복지기금 관련 공지사항을 확인하세요.</p>

        {/* Global announcement banner */}
        {globalAnnouncement && (
          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12, padding: '16px 20px', marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1e40af', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
              📢 전체 공지
            </div>
            <p style={{ fontSize: 14, color: '#374151', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{globalAnnouncement}</p>
          </div>
        )}

        {dataLoading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>로딩 중...</div>
        ) : notices.length === 0 && !globalAnnouncement ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af', background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb' }}>
            등록된 공지사항이 없습니다.
          </div>
        ) : (
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr 120px 140px', padding: '12px 20px', background: '#f9fafb', borderBottom: '2px solid #e5e7eb', fontSize: 13, fontWeight: 600, color: '#6b7280' }}>
              <span style={{ textAlign: 'center' }}>번호</span>
              <span>제목</span>
              <span style={{ textAlign: 'center' }}>작성자</span>
              <span style={{ textAlign: 'center' }}>등록일</span>
            </div>
            {/* Pinned notices */}
            {pinned.map(n => (
              <NoticeRow key={n.id} notice={n} isPinned expanded={expandedId === n.id} onToggle={() => setExpandedId(expandedId === n.id ? null : n.id)} />
            ))}
            {/* Regular notices */}
            {regular.map((n, idx) => (
              <NoticeRow key={n.id} notice={n} index={regular.length - idx} expanded={expandedId === n.id} onToggle={() => setExpandedId(expandedId === n.id ? null : n.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function NoticeRow({ notice, isPinned, index, expanded, onToggle }: {
  notice: Notice; isPinned?: boolean; index?: number; expanded: boolean; onToggle: () => void
}) {
  const date = notice.createdAt?.toDate?.()
  return (
    <div style={{ borderBottom: '1px solid #f3f4f6' }}>
      <div
        onClick={onToggle}
        style={{
          display: 'grid',
          gridTemplateColumns: '60px 1fr 120px 140px',
          padding: '14px 20px',
          alignItems: 'center',
          fontSize: 14,
          cursor: 'pointer',
          background: isPinned ? '#fffbeb' : '#fff',
          transition: 'background 0.1s',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = isPinned ? '#fef9c3' : '#f9fafb' }}
        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = isPinned ? '#fffbeb' : '#fff' }}
      >
        <span style={{ textAlign: 'center', fontSize: 13, color: '#9ca3af' }}>
          {isPinned ? <span style={{ color: '#f59e0b', fontWeight: 700 }}>📌</span> : index}
        </span>
        <span style={{ fontWeight: 600, color: '#111827' }}>{notice.title}</span>
        <span style={{ textAlign: 'center', fontSize: 13, color: '#6b7280' }}>{notice.author || '관리자'}</span>
        <span style={{ textAlign: 'center', fontSize: 13, color: '#9ca3af' }}>
          {date ? date.toLocaleDateString('ko-KR') : '-'}
        </span>
      </div>
      {expanded && (
        <div style={{ padding: '16px 80px 20px', background: '#fafafa', borderTop: '1px solid #f3f4f6' }}>
          <div style={{ fontSize: 14, color: '#374151', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
            {notice.content || '내용이 없습니다.'}
          </div>
          {notice.files && notice.files.length > 0 && (
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 6 }}>첨부파일</div>
              {notice.files.map((f, i) => (
                <a key={i} href={f.url} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, color: '#1a56db', textDecoration: 'none', marginRight: 16, marginBottom: 4 }}>
                  📎 {f.name}
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const loadingStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontSize: 14, color: '#9ca3af', background: '#f8f9fa' }

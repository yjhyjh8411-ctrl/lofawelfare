'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { collection, getDocs, doc, setDoc, getDoc, deleteDoc, query, orderBy, serverTimestamp } from 'firebase/firestore'
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '@/lib/firebase'
import { useAuth } from '@/lib/auth-context'
import Navbar from '@/components/Navbar'

interface NoticeFile {
  name: string
  url: string
}

interface Notice {
  id: string
  title: string
  content: string
  author: string
  createdAt: { toDate?: () => Date } | null
  isPinned?: boolean
  files?: NoticeFile[]
}

interface FAQ {
  id: string
  question: string
  answer: string
  order: number
  category?: string
}

interface PopupNotice {
  id: string
  제목: string
  내용: string
  시작일: string
  종료일: string
  활성: boolean
}

const newPopupId = () => `popup_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

export default function AdminNoticesPage() {
  const { user, profile, loading } = useAuth()
  const router = useRouter()
  const [tab, setTab] = useState<'notices' | 'faq' | 'popup'>('notices')
  const [notices, setNotices] = useState<Notice[]>([])
  const [faqs, setFaqs] = useState<FAQ[]>([])
  const [dataLoading, setDataLoading] = useState(true)
  const [msg, setMsg] = useState('')

  // Notice modal state
  const [editNotice, setEditNotice] = useState<Partial<Notice> | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [noticeFiles, setNoticeFiles] = useState<File[]>([])
  const [noticeSaving, setNoticeSaving] = useState(false)

  // FAQ modal state
  const [editFaq, setEditFaq] = useState<Partial<FAQ> | null>(null)
  const [deleteFaqConfirm, setDeleteFaqConfirm] = useState<string | null>(null)

  // Popup notices state — 다수 팝업 지원
  const [popups, setPopups] = useState<PopupNotice[]>([])
  const [editPopup, setEditPopup] = useState<PopupNotice | null>(null)
  const [deletePopupId, setDeletePopupId] = useState<string | null>(null)
  const [popupSaving, setPopupSaving] = useState(false)

  useEffect(() => {
    if (!loading && (!user || !profile?.isAdmin)) router.replace('/main')
  }, [user, profile, loading, router])

  useEffect(() => {
    if (!profile?.isAdmin) return
    loadData()
    // Load popup notices — 신규 팝업공지목록 → 레거시 팝업공지 → 빈 배열 순으로
    getDoc(doc(db, 'settings', 'global')).then(snap => {
      if (!snap.exists()) return
      const d = snap.data()
      const list = d?.팝업공지목록
      if (Array.isArray(list)) {
        setPopups(list.map((p: PopupNotice) => ({ ...p, id: p.id || newPopupId() })))
        return
      }
      const legacy = d?.팝업공지
      if (legacy && typeof legacy === 'object' && legacy.제목) {
        setPopups([{ ...(legacy as PopupNotice), id: legacy.id || newPopupId() }])
      }
    })
  }, [profile])

  const loadData = async () => {
    setDataLoading(true)
    try {
      try {
        const noticesSnap = await getDocs(query(collection(db, 'notices'), orderBy('createdAt', 'desc')))
        setNotices(noticesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Notice)))
      } catch { /* */ }
      try {
        const faqsSnap = await getDocs(query(collection(db, 'faqs'), orderBy('order', 'asc')))
        setFaqs(faqsSnap.docs.map(d => ({ id: d.id, ...d.data() } as FAQ)))
      } catch { /* */ }
    } catch (e) { console.error(e) }
    finally { setDataLoading(false) }
  }

  const showMsg = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 3000) }

  // Notice CRUD
  const handleSaveNotice = async () => {
    if (!editNotice?.title?.trim()) return
    setNoticeSaving(true)
    try {
      // Upload new files
      const uploadedFiles: NoticeFile[] = []
      for (const file of noticeFiles) {
        const fileRef = storageRef(storage, `notices/${Date.now()}_${file.name}`)
        await uploadBytes(fileRef, file)
        uploadedFiles.push({ name: file.name, url: await getDownloadURL(fileRef) })
      }
      const existingFiles = editNotice.files || []
      const allFiles = [...existingFiles, ...uploadedFiles]

      const id = editNotice.id || `notice_${Date.now()}`
      await setDoc(doc(db, 'notices', id), {
        title: editNotice.title,
        content: editNotice.content || '',
        author: profile?.name || '관리자',
        isPinned: editNotice.isPinned || false,
        files: allFiles,
        createdAt: editNotice.id ? editNotice.createdAt : serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { merge: true })
      setEditNotice(null)
      setNoticeFiles([])
      showMsg(editNotice.id ? '공지사항이 수정되었습니다.' : '공지사항이 등록되었습니다.')
      loadData()
    } catch (e) { console.error(e); showMsg('저장 중 오류가 발생했습니다.') }
    finally { setNoticeSaving(false) }
  }

  const handleDeleteNotice = async () => {
    if (!deleteConfirm) return
    await deleteDoc(doc(db, 'notices', deleteConfirm))
    setDeleteConfirm(null)
    showMsg('공지사항이 삭제되었습니다.')
    loadData()
  }

  // FAQ CRUD
  const handleSaveFaq = async () => {
    if (!editFaq?.question?.trim()) return
    const id = editFaq.id || `faq_${Date.now()}`
    await setDoc(doc(db, 'faqs', id), {
      question: editFaq.question,
      answer: editFaq.answer || '',
      category: editFaq.category || '',
      order: editFaq.order ?? faqs.length + 1,
    })
    setEditFaq(null)
    showMsg(editFaq.id ? 'FAQ가 수정되었습니다.' : 'FAQ가 등록되었습니다.')
    loadData()
  }

  const handleDeleteFaq = async () => {
    if (!deleteFaqConfirm) return
    await deleteDoc(doc(db, 'faqs', deleteFaqConfirm))
    setDeleteFaqConfirm(null)
    showMsg('FAQ가 삭제되었습니다.')
    loadData()
  }

  const persistPopups = async (next: PopupNotice[]) => {
    setPopupSaving(true)
    try {
      await setDoc(doc(db, 'settings', 'global'), { 팝업공지목록: next }, { merge: true })
    } finally {
      setPopupSaving(false)
    }
  }

  const handleSaveEditPopup = async () => {
    if (!editPopup) return
    if (!editPopup.제목.trim() || !editPopup.시작일 || !editPopup.종료일) {
      showMsg('제목, 시작일, 종료일을 입력해주세요.')
      return
    }
    if (editPopup.시작일 > editPopup.종료일) {
      showMsg('시작일이 종료일보다 늦을 수 없습니다.')
      return
    }
    const exists = popups.some(p => p.id === editPopup.id)
    const next = exists
      ? popups.map(p => p.id === editPopup.id ? editPopup : p)
      : [...popups, editPopup]
    setPopups(next)
    await persistPopups(next)
    setEditPopup(null)
    showMsg(exists ? '팝업 공지가 수정되었습니다.' : '팝업 공지가 추가되었습니다.')
  }

  const handleTogglePopup = async (id: string) => {
    const next = popups.map(p => p.id === id ? { ...p, 활성: !p.활성 } : p)
    setPopups(next)
    await persistPopups(next)
  }

  const handleDeletePopup = async () => {
    if (!deletePopupId) return
    const next = popups.filter(p => p.id !== deletePopupId)
    setPopups(next)
    await persistPopups(next)
    setDeletePopupId(null)
    showMsg('팝업 공지가 삭제되었습니다.')
  }

  if (loading || !profile?.isAdmin) return null

  return (
    <div style={{ minHeight: '100vh', background: '#f8f9fa', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <Navbar />
      {msg && (
        <div style={{ position: 'fixed', top: 72, left: '50%', transform: 'translateX(-50%)', background: '#1a56db', color: '#fff', padding: '12px 24px', borderRadius: 8, zIndex: 9999, fontWeight: 600, boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>
          {msg}
        </div>
      )}

      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '32px 20px 60px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: '#111827', marginBottom: 6 }}>공지사항 관리</h1>
            <p style={{ fontSize: 14, color: '#6b7280' }}>공지사항과 자주하는 질문을 관리합니다.</p>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid #e5e7eb', marginBottom: 24 }}>
          {[
            { key: 'notices' as const, label: '공지사항', count: notices.length },
            { key: 'faq' as const, label: '자주하는 질문', count: faqs.length },
            { key: 'popup' as const, label: '팝업 공지', count: popups.filter(p => p.활성).length },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding: '12px 24px',
                border: 'none',
                background: 'transparent',
                borderBottom: tab === t.key ? '2px solid #1a56db' : '2px solid transparent',
                marginBottom: -2,
                color: tab === t.key ? '#1a56db' : '#6b7280',
                fontWeight: tab === t.key ? 700 : 500,
                fontSize: 15,
                cursor: 'pointer',
              }}
            >
              {t.label} ({t.count})
            </button>
          ))}
        </div>

        {/* Content */}
        {tab === 'notices' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
              <button
                onClick={() => { setEditNotice({ title: '', content: '', isPinned: false, files: [] }); setNoticeFiles([]) }}
                style={{ background: '#1a56db', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}
              >
                + 새 공지사항
              </button>
            </div>
            {dataLoading ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>로딩 중...</div>
            ) : notices.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af', background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb' }}>
                등록된 공지사항이 없습니다.
              </div>
            ) : (
              <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                {notices.map(n => {
                  const date = n.createdAt?.toDate?.()
                  return (
                    <div key={n.id} style={{ display: 'flex', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid #f3f4f6', gap: 12 }}>
                      {n.isPinned && <span style={{ color: '#f59e0b', fontWeight: 700, flexShrink: 0 }}>📌</span>}
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 14, color: '#111827' }}>{n.title}</div>
                        <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
                          {n.author} · {date ? date.toLocaleDateString('ko-KR') : '-'}
                          {n.files && n.files.length > 0 && <span style={{ marginLeft: 8, color: '#1a56db' }}>📎 {n.files.length}개 첨부</span>}
                        </div>
                      </div>
                      <button
                        onClick={() => { setEditNotice(n); setNoticeFiles([]) }}
                        style={{ background: '#eff6ff', color: '#1a56db', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                      >수정</button>
                      <button
                        onClick={() => setDeleteConfirm(n.id)}
                        style={{ background: '#fef2f2', color: '#dc2626', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                      >삭제</button>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}

        {tab === 'faq' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
              <button
                onClick={() => setEditFaq({ question: '', answer: '', category: '', order: faqs.length + 1 })}
                style={{ background: '#1a56db', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}
              >
                + 새 FAQ
              </button>
            </div>
            {dataLoading ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>로딩 중...</div>
            ) : faqs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af', background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb' }}>
                등록된 FAQ가 없습니다.
              </div>
            ) : (
              <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                {faqs.map(faq => (
                  <div key={faq.id} style={{ display: 'flex', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid #f3f4f6', gap: 12 }}>
                    <span style={{ color: '#1a56db', fontWeight: 800, fontSize: 15, flexShrink: 0 }}>Q</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: '#111827' }}>{faq.question}</div>
                      {faq.category && <span style={{ fontSize: 12, color: '#6b7280' }}>{faq.category}</span>}
                    </div>
                    <span style={{ fontSize: 12, color: '#9ca3af', flexShrink: 0 }}>순서: {faq.order}</span>
                    <button
                      onClick={() => setEditFaq(faq)}
                      style={{ background: '#eff6ff', color: '#1a56db', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                    >수정</button>
                    <button
                      onClick={() => setDeleteFaqConfirm(faq.id)}
                      style={{ background: '#fef2f2', color: '#dc2626', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                    >삭제</button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'popup' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <p style={{ fontSize: 13, color: '#6b7280' }}>메인 페이지 진입 시 팝업으로 표시할 공지를 여러 개 등록할 수 있습니다. 활성화된 항목 중 오늘 날짜가 기간 내인 가장 최근 항목이 노출됩니다.</p>
              <button
                onClick={() => setEditPopup({ id: newPopupId(), 제목: '', 내용: '', 시작일: '', 종료일: '', 활성: true })}
                style={{ background: '#1a56db', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 600, cursor: 'pointer', fontSize: 14, whiteSpace: 'nowrap', marginLeft: 16 }}
              >
                + 새 팝업 공지
              </button>
            </div>
            {popups.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af', background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb' }}>
                등록된 팝업 공지가 없습니다.
              </div>
            ) : (
              <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                {popups.map(p => {
                  const today = new Date().toISOString().slice(0, 10)
                  const inRange = p.시작일 && p.종료일 && today >= p.시작일 && today <= p.종료일
                  const status = !p.활성 ? '비활성' : inRange ? '노출중' : (p.시작일 && today < p.시작일 ? '예정' : '종료')
                  const statusColor = status === '노출중' ? '#059669' : status === '예정' ? '#f59e0b' : '#9ca3af'
                  return (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid #f3f4f6', gap: 12 }}>
                      <div
                        onClick={() => handleTogglePopup(p.id)}
                        title={p.활성 ? '비활성화' : '활성화'}
                        style={{ cursor: 'pointer', flexShrink: 0 }}
                      >
                        <div style={{
                          width: 36, height: 20, borderRadius: 10, padding: 2,
                          background: p.활성 ? '#059669' : '#d1d5db',
                          display: 'flex', alignItems: 'center',
                        }}>
                          <div style={{
                            width: 16, height: 16, borderRadius: '50%', background: '#fff',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                            transform: p.활성 ? 'translateX(16px)' : 'translateX(0)',
                            transition: 'transform 0.2s',
                          }} />
                        </div>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 14, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.제목 || '(제목 없음)'}</div>
                        <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
                          {p.시작일 || '시작일 미정'} ~ {p.종료일 || '종료일 미정'}
                        </div>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: statusColor, padding: '2px 8px', borderRadius: 6, background: statusColor === '#059669' ? '#d1fae5' : statusColor === '#f59e0b' ? '#fef3c7' : '#f3f4f6', flexShrink: 0 }}>{status}</span>
                      <button
                        onClick={() => setEditPopup(p)}
                        style={{ background: '#eff6ff', color: '#1a56db', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                      >수정</button>
                      <button
                        onClick={() => setDeletePopupId(p.id)}
                        style={{ background: '#fef2f2', color: '#dc2626', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                      >삭제</button>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* Notice edit modal */}
      {editNotice && (
        <ModalOverlay onClose={() => setEditNotice(null)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h3 style={{ fontSize: 18, fontWeight: 700 }}>{editNotice.id ? '공지사항 수정' : '새 공지사항'}</h3>
            <button onClick={() => setEditNotice(null)} style={closeBtnStyle}>✕</button>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>제목</label>
            <input
              value={editNotice.title || ''}
              onChange={e => setEditNotice(p => p ? { ...p, title: e.target.value } : p)}
              placeholder="공지사항 제목"
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>내용</label>
            <textarea
              value={editNotice.content || ''}
              onChange={e => setEditNotice(p => p ? { ...p, content: e.target.value } : p)}
              rows={8}
              placeholder="공지사항 내용을 입력하세요"
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>첨부파일</label>
            {editNotice.files && editNotice.files.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                {editNotice.files.map((f, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 13 }}>
                    <a href={f.url} target="_blank" rel="noopener noreferrer" style={{ color: '#1a56db', textDecoration: 'none' }}>📎 {f.name}</a>
                    <button onClick={() => setEditNotice(p => p ? { ...p, files: p.files?.filter((_, idx) => idx !== i) } : p)}
                      style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 12 }}>삭제</button>
                  </div>
                ))}
              </div>
            )}
            {noticeFiles.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                {noticeFiles.map((f, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 13, color: '#059669' }}>
                    📄 {f.name} (새 파일)
                    <button onClick={() => setNoticeFiles(prev => prev.filter((_, idx) => idx !== i))}
                      style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 12 }}>삭제</button>
                  </div>
                ))}
              </div>
            )}
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', border: '1px solid #d1d5db', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: '#374151' }}>
              📎 파일 선택
              <input type="file" multiple onChange={e => { if (e.target.files) setNoticeFiles(prev => [...prev, ...Array.from(e.target.files!)]); e.target.value = '' }} style={{ display: 'none' }} />
            </label>
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={!!editNotice.isPinned}
                onChange={e => setEditNotice(p => p ? { ...p, isPinned: e.target.checked } : p)}
              />
              <span style={{ fontWeight: 600, fontSize: 14 }}>상단 고정</span>
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleSaveNotice} disabled={noticeSaving} style={{ ...btnStyle, background: noticeSaving ? '#9ca3af' : '#1a56db' }}>{noticeSaving ? '저장 중...' : '저장'}</button>
            <button onClick={() => setEditNotice(null)} style={{ ...btnStyle, background: '#6b7280' }}>취소</button>
          </div>
        </ModalOverlay>
      )}

      {/* FAQ edit modal */}
      {editFaq && (
        <ModalOverlay onClose={() => setEditFaq(null)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h3 style={{ fontSize: 18, fontWeight: 700 }}>{editFaq.id ? 'FAQ 수정' : '새 FAQ'}</h3>
            <button onClick={() => setEditFaq(null)} style={closeBtnStyle}>✕</button>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>질문</label>
            <input
              value={editFaq.question || ''}
              onChange={e => setEditFaq(p => p ? { ...p, question: e.target.value } : p)}
              placeholder="질문을 입력하세요"
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>답변</label>
            <textarea
              value={editFaq.answer || ''}
              onChange={e => setEditFaq(p => p ? { ...p, answer: e.target.value } : p)}
              rows={6}
              placeholder="답변을 입력하세요"
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
            <div>
              <label style={labelStyle}>카테고리</label>
              <input
                value={editFaq.category || ''}
                onChange={e => setEditFaq(p => p ? { ...p, category: e.target.value } : p)}
                placeholder="예: 신청절차"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>정렬 순서</label>
              <input
                type="number"
                value={editFaq.order ?? 0}
                onChange={e => setEditFaq(p => p ? { ...p, order: Number(e.target.value) } : p)}
                style={inputStyle}
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleSaveFaq} style={{ ...btnStyle, background: '#1a56db' }}>저장</button>
            <button onClick={() => setEditFaq(null)} style={{ ...btnStyle, background: '#6b7280' }}>취소</button>
          </div>
        </ModalOverlay>
      )}

      {/* Delete confirm modals */}
      {deleteConfirm && (
        <ModalOverlay onClose={() => setDeleteConfirm(null)}>
          <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 12 }}>공지사항 삭제</h3>
          <p style={{ color: '#374151', marginBottom: 20 }}>이 공지사항을 삭제하시겠습니까?</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleDeleteNotice} style={{ ...btnStyle, background: '#dc2626' }}>삭제</button>
            <button onClick={() => setDeleteConfirm(null)} style={{ ...btnStyle, background: '#6b7280' }}>취소</button>
          </div>
        </ModalOverlay>
      )}

      {deleteFaqConfirm && (
        <ModalOverlay onClose={() => setDeleteFaqConfirm(null)}>
          <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 12 }}>FAQ 삭제</h3>
          <p style={{ color: '#374151', marginBottom: 20 }}>이 FAQ를 삭제하시겠습니까?</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleDeleteFaq} style={{ ...btnStyle, background: '#dc2626' }}>삭제</button>
            <button onClick={() => setDeleteFaqConfirm(null)} style={{ ...btnStyle, background: '#6b7280' }}>취소</button>
          </div>
        </ModalOverlay>
      )}

      {/* Popup edit modal */}
      {editPopup && (
        <ModalOverlay onClose={() => setEditPopup(null)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h3 style={{ fontSize: 18, fontWeight: 700 }}>{popups.some(p => p.id === editPopup.id) ? '팝업 공지 수정' : '새 팝업 공지'}</h3>
            <button onClick={() => setEditPopup(null)} style={closeBtnStyle}>✕</button>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>제목</label>
            <input
              value={editPopup.제목}
              onChange={e => setEditPopup(p => p ? { ...p, 제목: e.target.value } : p)}
              placeholder="팝업 공지 제목"
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>내용</label>
            <textarea
              value={editPopup.내용}
              onChange={e => setEditPopup(p => p ? { ...p, 내용: e.target.value } : p)}
              rows={6}
              placeholder="팝업 공지 내용"
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>시작일</label>
              <input
                type="date"
                value={editPopup.시작일}
                onChange={e => setEditPopup(p => p ? { ...p, 시작일: e.target.value } : p)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>종료일</label>
              <input
                type="date"
                value={editPopup.종료일}
                onChange={e => setEditPopup(p => p ? { ...p, 종료일: e.target.value } : p)}
                style={inputStyle}
              />
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={editPopup.활성}
              onChange={e => setEditPopup(p => p ? { ...p, 활성: e.target.checked } : p)}
              style={{ width: 16, height: 16, accentColor: '#1a56db' }}
            />
            <span style={{ fontSize: 14, fontWeight: 500 }}>활성화 (메인 페이지에 노출)</span>
          </label>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => setEditPopup(null)} style={{ ...btnStyle, background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db' }}>취소</button>
            <button onClick={handleSaveEditPopup} disabled={popupSaving} style={{ ...btnStyle, background: popupSaving ? '#9ca3af' : '#1a56db' }}>
              {popupSaving ? '저장 중...' : '저장'}
            </button>
          </div>
        </ModalOverlay>
      )}

      {/* Popup delete confirm */}
      {deletePopupId && (
        <ModalOverlay onClose={() => setDeletePopupId(null)}>
          <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 12 }}>팝업 공지 삭제</h3>
          <p style={{ color: '#374151', marginBottom: 20 }}>이 팝업 공지를 삭제하시겠습니까?</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleDeletePopup} style={{ ...btnStyle, background: '#dc2626' }}>삭제</button>
            <button onClick={() => setDeletePopupId(null)} style={{ ...btnStyle, background: '#6b7280' }}>취소</button>
          </div>
        </ModalOverlay>
      )}
    </div>
  )
}

function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 32, width: 560, maxHeight: '88vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = { display: 'block', fontWeight: 600, marginBottom: 6, fontSize: 13, color: '#374151' }
const inputStyle: React.CSSProperties = { width: '100%', border: '1px solid #d1d5db', borderRadius: 8, padding: '10px 14px', fontSize: 14, outline: 'none', boxSizing: 'border-box' }
const btnStyle: React.CSSProperties = { color: '#fff', border: 'none', borderRadius: 8, padding: '10px 24px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }
const closeBtnStyle: React.CSSProperties = { background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6b7280' }

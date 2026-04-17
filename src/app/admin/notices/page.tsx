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
  제목: string
  내용: string
  시작일: string
  종료일: string
  활성: boolean
}

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

  // Popup notice state
  const [popup, setPopup] = useState<PopupNotice>({ 제목: '', 내용: '', 시작일: '', 종료일: '', 활성: false })
  const [popupSaving, setPopupSaving] = useState(false)

  useEffect(() => {
    if (!loading && (!user || !profile?.isAdmin)) router.replace('/main')
  }, [user, profile, loading, router])

  useEffect(() => {
    if (!profile?.isAdmin) return
    loadData()
    // Load popup notice settings
    getDoc(doc(db, 'settings', 'global')).then(snap => {
      if (snap.exists() && snap.data()?.팝업공지) {
        setPopup(snap.data().팝업공지 as PopupNotice)
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

  const handleSavePopup = async () => {
    if (popup.활성 && (!popup.제목 || !popup.시작일 || !popup.종료일)) {
      showMsg('제목, 시작일, 종료일을 입력해주세요.')
      return
    }
    setPopupSaving(true)
    try {
      await setDoc(doc(db, 'settings', 'global'), { 팝업공지: popup }, { merge: true })
      showMsg('팝업 공지사항이 저장되었습니다.')
    } catch {
      showMsg('저장 중 오류가 발생했습니다.')
    } finally {
      setPopupSaving(false)
    }
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
            { key: 'popup' as const, label: '팝업 공지', count: popup.활성 ? 1 : 0 },
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
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>팝업 공지 설정</h3>
                <p style={{ fontSize: 13, color: '#6b7280' }}>메인 페이지에 팝업으로 표시되는 공지사항을 설정합니다.</p>
              </div>
              <div
                onClick={() => setPopup(p => ({ ...p, 활성: !p.활성 }))}
                style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
              >
                <span style={{ fontSize: 13, fontWeight: 600, color: popup.활성 ? '#059669' : '#9ca3af' }}>
                  {popup.활성 ? '활성' : '비활성'}
                </span>
                <div style={{
                  width: 44, height: 24, borderRadius: 12, padding: 2,
                  background: popup.활성 ? '#059669' : '#d1d5db',
                  transition: 'background 0.2s', display: 'flex', alignItems: 'center',
                }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: '50%', background: '#fff',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                    transform: popup.활성 ? 'translateX(20px)' : 'translateX(0)',
                    transition: 'transform 0.2s',
                  }} />
                </div>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>제목</label>
              <input
                value={popup.제목}
                onChange={e => setPopup(p => ({ ...p, 제목: e.target.value }))}
                placeholder="팝업 공지 제목을 입력하세요"
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>내용</label>
              <textarea
                value={popup.내용}
                onChange={e => setPopup(p => ({ ...p, 내용: e.target.value }))}
                placeholder="팝업 공지 내용을 입력하세요"
                rows={6}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 24 }}>
              <div>
                <label style={labelStyle}>시작일</label>
                <input
                  type="date"
                  value={popup.시작일}
                  onChange={e => setPopup(p => ({ ...p, 시작일: e.target.value }))}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>종료일</label>
                <input
                  type="date"
                  value={popup.종료일}
                  onChange={e => setPopup(p => ({ ...p, 종료일: e.target.value }))}
                  style={inputStyle}
                />
              </div>
            </div>

            <button onClick={handleSavePopup} disabled={popupSaving} style={{ ...btnStyle, background: popupSaving ? '#9ca3af' : '#1a56db' }}>
              {popupSaving ? '저장 중...' : '설정 저장'}
            </button>

            {popup.제목 && (
              <div style={{ marginTop: 24, borderTop: '1px solid #e5e7eb', paddingTop: 20 }}>
                <h4 style={{ fontSize: 13, fontWeight: 600, color: '#6b7280', marginBottom: 12 }}>미리보기</h4>
                <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 24, background: '#fafafa' }}>
                  <h3 style={{ fontSize: 18, fontWeight: 700, color: '#111827', marginBottom: 12 }}>{popup.제목}</h3>
                  <p style={{ fontSize: 14, color: '#374151', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{popup.내용}</p>
                  <div style={{ marginTop: 16, fontSize: 12, color: '#9ca3af' }}>
                    기간: {popup.시작일 || '미설정'} ~ {popup.종료일 || '미설정'}
                  </div>
                </div>
              </div>
            )}
          </div>
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

'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  collection, getDocs, doc, updateDoc, deleteDoc, orderBy, query, setDoc, getDoc, serverTimestamp,
} from 'firebase/firestore'
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { signOut } from 'firebase/auth'
import { auth as firebaseAuth, db, storage } from '@/lib/firebase'
import { useAuth } from '@/lib/auth-context'
import { useCallback } from 'react'

interface Application {
  id: string
  form_id: string
  user_id?: string
  status: string
  created_at: { toDate?: () => Date } | null
  applicant?: { 사번?: string; 성명?: string; 부서?: string; 직급?: string }
  data?: Record<string, unknown>
  reject_reason?: string
  formTitle?: string
}

interface UserDoc {
  id: string
  사번?: string
  성명?: string
  부서?: string
  직급?: string
  이메일?: string
  전화번호?: string
  입사일?: string
  isAdmin?: boolean
  status?: string
}

interface RegDoc {
  id: string
  버전명: string
  files: { name: string; url: string }[]
  createdAt: Date
}

interface FormConfig {
  id: string
  제목: string
  isActive: boolean
  order: number
}

const statusInfo = (s: string) => {
  const map: Record<string, { text: string; color: string; bg: string }> = {
    pending:  { text: '검토중', color: '#92400e', bg: '#fef3c7' },
    approved: { text: '승인',   color: '#065f46', bg: '#d1fae5' },
    rejected: { text: '반려',   color: '#991b1b', bg: '#fee2e2' },
  }
  return map[s] || { text: s, color: '#374151', bg: '#f3f4f6' }
}

function extractAmount(data?: Record<string, unknown>): number {
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

function AdminPageInner() {
  const { user, profile, loading } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [apps, setApps] = useState<Application[]>([])
  const [forms, setForms] = useState<FormConfig[]>([])
  const [users, setUsers] = useState<UserDoc[]>([])
  const [dataLoading, setDataLoading] = useState(true)
  const [msg, setMsg] = useState('')

  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [globalSearch, setGlobalSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all')

  const [announcement, setAnnouncement] = useState('')
  const [announcementSaving, setAnnouncementSaving] = useState(false)

  const [regVersion, setRegVersion] = useState('')
  const [regFiles, setRegFiles] = useState<File[]>([])
  const [regUploading, setRegUploading] = useState(false)
  const [regulations, setRegulations] = useState<RegDoc[]>([])

  // Attach modal
  const [attachModal, setAttachModal] = useState(false)
  const [attachSearch, setAttachSearch] = useState('')

  // Notify settings modals
  const [smsModal, setSmsModal] = useState(false)
  const [emailModal, setEmailModal] = useState(false)
  const [smsForm, setSmsForm] = useState({ apiKey: '', apiSecret: '', from: '' })
  const [emailForm, setEmailForm] = useState({ from: '', password: '' })
  const [gmailConnected, setGmailConnected] = useState<string | null>(null)
  const [solapiConnected, setSolapiConnected] = useState(false)
  const [notifySaving, setNotifySaving] = useState(false)

  // Modals
  const [detailModal, setDetailModal] = useState<Application | null>(null)
  const [rejectModal, setRejectModal] = useState<Application | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<Application | null>(null)
  const [decryptedValues, setDecryptedValues] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!loading && (!user || !profile?.isAdmin)) router.replace('/main')
  }, [user, profile, loading, router])

  useEffect(() => {
    const gmailConn = searchParams.get('gmail_connected')
    const gmailErr = searchParams.get('gmail_error')
    const solapiConn = searchParams.get('solapi_connected')
    const solapiErr = searchParams.get('solapi_error')
    if (gmailConn) {
      setGmailConnected(gmailConn)
      setEmailModal(true)
      showMsg(`Gmail 연동 완료: ${gmailConn}`)
      router.replace('/admin')
    } else if (gmailErr) {
      showMsg(`Gmail 연동 실패: ${gmailErr}`)
      router.replace('/admin')
    } else if (solapiConn) {
      setSolapiConnected(true)
      setSmsModal(true)
      showMsg('Solapi 연동 완료')
      router.replace('/admin')
    } else if (solapiErr) {
      showMsg(`Solapi 연동 실패: ${solapiErr}`)
      router.replace('/admin')
    }
  }, [searchParams, router])

  const loadData = useCallback(async () => {
    setDataLoading(true)
    try {
      const formsSnap = await getDocs(collection(db, 'form_configs'))
      const formMap: Record<string, string> = {}
      formsSnap.docs.forEach(d => { formMap[d.id] = (d.data() as { 제목: string }).제목 })
      const formList = formsSnap.docs
        .map(d => ({ id: d.id, ...d.data() } as FormConfig))
        .sort((a, b) => (a.order || 0) - (b.order || 0))
      setForms(formList)

      const appsSnap = await getDocs(query(collection(db, 'applications'), orderBy('created_at', 'desc')))
      setApps(appsSnap.docs.map(d => ({
        id: d.id, user_id: d.data().user_id, ...d.data(),
        formTitle: formMap[d.data().form_id] || d.data().form_id,
      } as Application)))

      try {
        const usersSnap = await getDocs(collection(db, 'users'))
        setUsers(usersSnap.docs
          .map(d => ({ id: d.id, ...d.data() } as UserDoc))
          .filter(u => u.status !== 'inactive')
          .sort((a, b) => (a.사번 || '').localeCompare(b.사번 || '')))
      } catch { /* no users yet */ }

      const settingsDoc = await getDoc(doc(db, 'settings', 'global'))
      if (settingsDoc.exists()) setAnnouncement(settingsDoc.data()?.공지사항 || '')

      try {
        const notifyDoc = await getDoc(doc(db, 'settings', 'notify'))
        if (notifyDoc.exists()) {
          const nd = notifyDoc.data()
          if (nd?.sms) {
            setSmsForm(f => ({ ...f, from: nd.sms.from || '' }))
            if (nd.sms.authType === 'oauth2') setSolapiConnected(true)
          }
          if (nd?.email?.from) {
            setEmailForm(f => ({ ...f, from: nd.email.from || '' }))
            if (nd.email.authType === 'oauth2') setGmailConnected(nd.email.from)
          }
        }
      } catch { /* no notify settings yet */ }

      try {
        const regsSnap = await getDocs(query(collection(db, 'regulations'), orderBy('createdAt', 'desc')))
        setRegulations(regsSnap.docs.map(d => {
          const data = d.data()
          return { id: d.id, 버전명: data.버전명, files: data.files || [], createdAt: data.createdAt?.toDate?.() || new Date() } as RegDoc
        }))
      } catch { /* no regulations yet */ }
    } catch (e) { console.error('Admin loadData error:', e) }
    finally { setDataLoading(false) }
  }, [])

  useEffect(() => {
    if (profile?.isAdmin) loadData()
  }, [profile, loadData])

  const showMsg = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 3000) }

  const handleSaveSmsSettings = async () => {
    setNotifySaving(true)
    const update: Record<string, unknown> = {}
    if (smsForm.apiKey) update['sms.apiKey'] = smsForm.apiKey
    if (smsForm.apiSecret) update['sms.apiSecret'] = smsForm.apiSecret
    if (smsForm.from) update['sms.from'] = smsForm.from
    await setDoc(doc(db, 'settings', 'notify'), update, { merge: true })
    setNotifySaving(false); setSmsModal(false)
    showMsg('SMS 설정이 저장되었습니다.')
  }

  const handleSaveEmailSettings = async () => {
    setNotifySaving(true)
    const update: Record<string, unknown> = {}
    if (emailForm.from) update['email.from'] = emailForm.from
    if (emailForm.password) update['email.password'] = emailForm.password
    await setDoc(doc(db, 'settings', 'notify'), update, { merge: true })
    setNotifySaving(false); setEmailModal(false)
    showMsg('이메일 설정이 저장되었습니다.')
  }

  const sendNotification = async (app: Application, status: 'approved' | 'rejected', rejectReason?: string) => {
    if (!app.user_id) return
    try {
      const userDoc = await getDoc(doc(db, 'users', app.user_id))
      if (!userDoc.exists()) return
      const u = userDoc.data() as { 전화번호?: string; 이메일?: string; 성명?: string }
      const name = u.성명 || app.applicant?.성명 || ''
      const phone = u.전화번호 || ''
      const email = u.이메일 || ''
      const statusText = status === 'approved' ? '승인' : '반려'
      const message = status === 'approved'
        ? `[LOFA 복지] ${name}님, ${app.formTitle} 신청이 ${statusText}되었습니다.`
        : `[LOFA 복지] ${name}님, ${app.formTitle} 신청이 ${statusText}되었습니다.${rejectReason ? ` 사유: ${rejectReason}` : ''}`
      const idToken = await user!.getIdToken()
      fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ type: 'both', to: phone, email, message, subject: `[LOFA 복지] 신청 ${statusText} 안내` }),
      }).catch(() => {})
    } catch { /* notification is best-effort */ }
  }

  // Filtered data
  const yearApps = apps.filter(a => {
    const d = a.created_at?.toDate?.()
    return d ? d.getFullYear() === selectedYear : false
  })
  const pendingApps = yearApps.filter(a => a.status === 'pending')
  const approvedCount = yearApps.filter(a => a.status === 'approved').length
  const rejectedCount = yearApps.filter(a => a.status === 'rejected').length

  const q = globalSearch.toLowerCase()
  const filteredApps = yearApps.filter(a =>
    !q ||
    a.applicant?.성명?.toLowerCase().includes(q) ||
    a.applicant?.사번?.toLowerCase().includes(q) ||
    a.formTitle?.toLowerCase().includes(q)
  ).filter(a => statusFilter === 'all' || a.status === statusFilter)

  // Handlers
  const handleApprove = async (app: Application) => {
    await updateDoc(doc(db, 'applications', app.id), { status: 'approved' })
    setApps(prev => prev.map(a => a.id === app.id ? { ...a, status: 'approved' } : a))
    showMsg('승인 처리되었습니다.')
    if (detailModal?.id === app.id) setDetailModal(prev => prev ? { ...prev, status: 'approved' } : null)
    sendNotification(app, 'approved')
  }

  const handleReject = async () => {
    if (!rejectModal) return
    await updateDoc(doc(db, 'applications', rejectModal.id), { status: 'rejected', reject_reason: rejectReason })
    setApps(prev => prev.map(a => a.id === rejectModal.id ? { ...a, status: 'rejected', reject_reason: rejectReason } : a))
    sendNotification(rejectModal, 'rejected', rejectReason)
    setRejectModal(null); setRejectReason('')
    showMsg('반려 처리되었습니다.')
  }

  const handleDeleteApp = async () => {
    if (!deleteConfirm) return
    await deleteDoc(doc(db, 'applications', deleteConfirm.id))
    setApps(prev => prev.filter(a => a.id !== deleteConfirm.id))
    setDeleteConfirm(null); setDetailModal(null)
    showMsg('삭제되었습니다.')
  }

  const handleDecrypt = async (key: string, encryptedValue: string) => {
    if (!user) return
    const idToken = await user.getIdToken()
    const res = await fetch('/api/decrypt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ value: encryptedValue }),
    })
    const json = await res.json()
    if (json.status === 'success') setDecryptedValues(prev => ({ ...prev, [key]: json.decrypted }))
  }

  const handleSaveAnnouncement = async () => {
    setAnnouncementSaving(true)
    await setDoc(doc(db, 'settings', 'global'), { 공지사항: announcement }, { merge: true })
    setAnnouncementSaving(false)
    showMsg('공지사항이 저장되었습니다.')
  }

  const handleUploadRegulation = async () => {
    if (!regVersion || regFiles.length === 0) { showMsg('버전명과 파일을 입력해주세요.'); return }
    setRegUploading(true)
    const uploaded: { name: string; url: string }[] = []
    for (const file of regFiles) {
      const fileRef = storageRef(storage, `regulations/${Date.now()}_${file.name}`)
      await uploadBytes(fileRef, file)
      uploaded.push({ name: file.name, url: await getDownloadURL(fileRef) })
    }
    const regDocRef = doc(collection(db, 'regulations'))
    await setDoc(regDocRef, { 버전명: regVersion, files: uploaded, createdAt: serverTimestamp() })
    const newReg: RegDoc = { id: regDocRef.id, 버전명: regVersion, files: uploaded, createdAt: new Date() }
    setRegulations(prev => [newReg, ...prev])
    setRegVersion(''); setRegFiles([])
    setRegUploading(false)
    showMsg('규정집이 업로드되었습니다.')
  }

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i)

  if (loading || !profile?.isAdmin) return <div style={{ textAlign: 'center', padding: '40px', fontSize: '18px' }}>Loading...</div>

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>

      {msg && (
        <div style={{ position: 'fixed', top: 66, left: '50%', transform: 'translateX(-50%)', background: '#1a56db', color: '#fff', padding: '12px 24px', borderRadius: 8, zIndex: 9999, fontWeight: 600, boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>
          {msg}
        </div>
      )}

      {/* ─── Navbar ─── */}
      <header style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', height: 56, padding: '0 20px', display: 'flex', alignItems: 'center', gap: 14, position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: '#111827', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 8 }}>
          🏛️ LOFA 복지기금 관리
          <span style={{ color: '#6b7280', fontWeight: 400, fontSize: 13 }}>({selectedYear}년도)</span>
        </div>

        <select
          value={selectedYear}
          onChange={e => setSelectedYear(Number(e.target.value))}
          style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: '5px 10px', fontSize: 13, background: '#fff', cursor: 'pointer', outline: 'none' }}
        >
          {years.map(y => <option key={y} value={y}>{y}년도</option>)}
        </select>

        <input
          value={globalSearch}
          onChange={e => setGlobalSearch(e.target.value)}
          placeholder="사번 또는 성명으로 검색..."
          style={{ flex: 1, maxWidth: 300, border: '1px solid #d1d5db', borderRadius: 8, padding: '6px 12px', fontSize: 13, outline: 'none' }}
        />

        <div style={{ flex: 1 }} />

        {(['💬', '✉️', '⚙️', '📎'] as const).map((icon, i) => (
          <button
            key={i}
            onClick={() => {
              if (i === 0) setSmsModal(true)
              else if (i === 1) setEmailModal(true)
              else if (i === 2) router.push('/admin/settings')
              else { setAttachSearch(''); setAttachModal(true) }
            }}
            style={{ background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 8, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 16 }}
          >{icon}</button>
        ))}

        <button
          onClick={() => router.push('/admin/employees')}
          style={{ background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          👥 직원관리
        </button>

        <button
          onClick={() => router.push('/admin/forms')}
          style={{ background: '#1a56db', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          📋 신청서 관리
        </button>

        <button
          onClick={() => {
            // 모든 신청의 data 필드 키 수집
            const dataKeys = new Set<string>()
            apps.forEach(a => { if (a.data) Object.keys(a.data).forEach(k => dataKeys.add(k)) })
            const extraCols = Array.from(dataKeys)
            const header = ['사번', '성명', '부서', '직급', '신청항목', '신청일', '상태', '반려사유', ...extraCols]
            const rows: string[][] = [header]
            apps.forEach(a => {
              const d = a.created_at?.toDate?.()
              const s = a.status === 'approved' ? '승인' : a.status === 'rejected' ? '반려' : '검토중'
              const base = [a.applicant?.사번||'', a.applicant?.성명||'', a.applicant?.부서||'', a.applicant?.직급||'', a.formTitle||'', d?d.toLocaleDateString('ko-KR'):'', s, a.reject_reason||'']
              const extra = extraCols.map(k => {
                const v = a.data?.[k]
                if (v === null || v === undefined) return ''
                if (typeof v === 'object' && !Array.isArray(v)) {
                  const obj = v as Record<string, unknown>
                  if (obj.name) return String(obj.name)
                  return JSON.stringify(v)
                }
                return String(v)
              })
              rows.push([...base, ...extra])
            })
            const csv = '\uFEFF' + rows.map(r => r.map(c => `"${c.replace(/"/g,'""')}"`).join(',')).join('\n')
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url; a.download = `welfare_${new Date().toISOString().split('T')[0]}.csv`
            a.click(); URL.revokeObjectURL(url)
          }}
          style={{ background: '#059669', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          📊 데이터 내보내기
        </button>

        <button
          onClick={async () => { await signOut(firebaseAuth); router.push('/login') }}
          style={{ background: '#fff', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          로그아웃
        </button>
      </header>

      <div style={{ maxWidth: 1500, margin: '0 auto', padding: '22px 18px' }}>

        {/* ─── Stats ─── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
          {[
            { title: '전체 신청', value: yearApps.length, color: '#2563eb', bar: '#3b82f6' },
            { title: '승인 대기중 (처리 필요)', value: pendingApps.length, color: '#d97706', bar: '#f59e0b' },
            { title: '승인 완료', value: approvedCount, color: '#059669', bar: '#10b981' },
            { title: '반려 내역', value: rejectedCount, color: '#dc2626', bar: '#ef4444' },
          ].map(({ title, value, color, bar }) => (
            <div key={title} style={{ background: '#fff', borderRadius: 12, padding: '18px 22px', boxShadow: '0 1px 3px rgba(0,0,0,0.07)' }}>
              <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 6 }}>{title}</p>
              <p style={{ fontSize: 34, fontWeight: 700, color, lineHeight: 1 }}>{value}</p>
              <div style={{ height: 4, background: '#f3f4f6', borderRadius: 2, marginTop: 14 }}>
                <div style={{ height: '100%', width: value > 0 ? '70%' : '8%', background: bar, borderRadius: 2, transition: 'width 0.5s' }} />
              </div>
            </div>
          ))}
        </div>

        {/* ─── Middle: Pending + Cross-table ─── */}
        <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 18, marginBottom: 18 }}>

          {/* Pending list */}
          <div style={{ background: '#fff', borderRadius: 12, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.07)', maxHeight: 380, overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>🔔 승인 대기 목록 ({pendingApps.length})</h3>
              <span style={{ fontSize: 11, color: '#9ca3af' }}>최신순</span>
            </div>
            {pendingApps.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#9ca3af', padding: '32px 0', fontSize: 13 }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>✔✔</div>
                처리할 내역이 없습니다.
              </div>
            ) : pendingApps.slice(0, 15).map(app => (
              <div key={app.id} onClick={() => setDetailModal(app)}
                style={{ padding: '9px 10px', borderRadius: 8, cursor: 'pointer', marginBottom: 4, border: '1px solid #f3f4f6' }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = '#eff6ff' }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = '' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#111827' }}>{app.applicant?.성명} · {app.formTitle}</div>
                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{app.created_at?.toDate?.()?.toLocaleDateString('ko-KR')}</div>
              </div>
            ))}
          </div>

          {/* Cross-table */}
          <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6' }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>📊 직원별 복지 신청 전체 내역 (사번/성명/직급/연락처 포함)</h3>
            </div>
            <div style={{ overflowX: 'auto', maxHeight: 330, overflowY: 'auto' }}>
              {dataLoading ? (
                <div style={{ padding: 32, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>로딩 중...</div>
              ) : (
                <table style={{ borderCollapse: 'collapse', fontSize: 12, minWidth: '100%' }}>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 5 }}>
                    <tr style={{ background: '#f9fafb' }}>
                      <th style={{ padding: '9px 14px', textAlign: 'left', fontWeight: 600, color: '#374151', borderBottom: '2px solid #e5e7eb', minWidth: 180, whiteSpace: 'nowrap', fontSize: 11 }}>직원 상세 정보</th>
                      {forms.map(f => (
                        <th key={f.id} style={{ padding: '9px 10px', textAlign: 'center', fontWeight: 600, color: '#374151', borderBottom: '2px solid #e5e7eb', minWidth: 90, maxWidth: 110, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 11 }}>
                          {f.제목.length > 6 ? f.제목.slice(0, 6) + '..' : f.제목}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {users.filter(u => u.status !== 'inactive').map((u, idx) => {
                      const userApps = yearApps.filter(a => a.applicant?.사번 === u.사번)
                      return (
                        <tr key={u.id} style={{ borderBottom: '1px solid #f3f4f6', background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                          <td style={{ padding: '8px 14px', verticalAlign: 'top' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                              <span style={{ fontWeight: 700, fontSize: 13, color: '#111827' }}>{u.성명}</span>
                              <span style={{ background: '#1a56db', color: '#fff', borderRadius: 4, padding: '1px 5px', fontSize: 10, fontWeight: 700 }}>{u.사번}</span>
                            </div>
                            <div style={{ color: '#6b7280', fontSize: 11 }}>■ {u.부서} / {u.직급}</div>
                            {u.전화번호 && <div style={{ color: '#6b7280', fontSize: 11 }}>📞 {u.전화번호}</div>}
                            {u.입사일 && <div style={{ color: '#6b7280', fontSize: 11 }}>🗓 입사: {u.입사일}</div>}
                          </td>
                          {forms.map(f => {
                            const appList = userApps.filter(a => a.form_id === f.id)
                            if (appList.length === 0) return <td key={f.id} />
                            const latest = appList[0]
                            const amount = extractAmount(latest.data)
                            const bg = latest.status === 'approved' ? '#d1fae5' : latest.status === 'rejected' ? '#fee2e2' : '#fef3c7'
                            const col = latest.status === 'approved' ? '#065f46' : latest.status === 'rejected' ? '#991b1b' : '#92400e'
                            return (
                              <td key={f.id} style={{ padding: '8px 6px', textAlign: 'center', verticalAlign: 'middle' }}>
                                <div
                                  onClick={() => setDetailModal(latest)}
                                  style={{ background: bg, color: col, borderRadius: 6, padding: '4px 6px', fontWeight: 700, cursor: 'pointer', fontSize: 12 }}
                                >
                                  {amount > 0 ? amount.toLocaleString() : '신청'}
                                </div>
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                    {users.filter(u => u.status !== 'inactive').length === 0 && (
                      <tr><td colSpan={forms.length + 1} style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>직원 데이터가 없습니다.</td></tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {/* ─── Main: All applications table ─── */}
        <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.07)', overflow: 'hidden', marginBottom: 18 }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 10 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#111827', flex: 1 }}>📋 신청 목록</h3>
            {(['all', 'pending', 'approved', 'rejected'] as const).map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                style={{
                  background: statusFilter === s ? '#1a56db' : '#f3f4f6',
                  color: statusFilter === s ? '#fff' : '#374151',
                  border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                }}
              >
                {s === 'all' ? `전체 (${yearApps.length})` : s === 'pending' ? `검토중 (${pendingApps.length})` : s === 'approved' ? `승인 (${approvedCount})` : `반려 (${rejectedCount})`}
              </button>
            ))}
          </div>

          <div style={{ overflowX: 'auto', maxHeight: 520, overflowY: 'auto' }}>
            {dataLoading ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af', fontSize: 13 }}>로딩 중...</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                  <tr style={{ background: '#f9fafb' }}>
                    {['사번', '성명', '부서', '신청항목', '신청일', '상태', '관리'].map(h => (
                      <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontWeight: 600, color: '#374151', borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap', fontSize: 12 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredApps.length === 0 ? (
                    <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>신청 내역이 없습니다.</td></tr>
                  ) : filteredApps.map((app, idx) => {
                    const date = app.created_at?.toDate?.()
                    const si = statusInfo(app.status)
                    return (
                      <tr
                        key={app.id}
                        onClick={() => setDetailModal(app)}
                        style={{ borderBottom: '1px solid #f3f4f6', background: idx % 2 === 0 ? '#fff' : '#fafafa', cursor: 'pointer' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = '#eff6ff' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = idx % 2 === 0 ? '#fff' : '#fafafa' }}
                      >
                        <td style={{ padding: '11px 14px', color: '#6b7280' }}>{app.applicant?.사번}</td>
                        <td style={{ padding: '11px 14px', fontWeight: 600, color: '#111827' }}>{app.applicant?.성명}</td>
                        <td style={{ padding: '11px 14px', color: '#374151' }}>{app.applicant?.부서}</td>
                        <td style={{ padding: '11px 14px' }}>
                          <span style={{ background: '#eff6ff', color: '#1a56db', padding: '2px 8px', borderRadius: 6, fontSize: 12, fontWeight: 600 }}>{app.formTitle}</span>
                        </td>
                        <td style={{ padding: '11px 14px', color: '#6b7280', whiteSpace: 'nowrap' }}>{date?.toLocaleDateString('ko-KR')}</td>
                        <td style={{ padding: '11px 14px' }}>
                          <span style={{ background: si.bg, color: si.color, padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>{si.text}</span>
                        </td>
                        <td style={{ padding: '11px 14px' }}>
                          {app.status === 'pending' && (
                            <div style={{ display: 'flex', gap: 5 }}>
                              <button
                                onClick={e => { e.stopPropagation(); handleApprove(app) }}
                                style={{ background: '#d1fae5', color: '#065f46', border: 'none', borderRadius: 5, padding: '3px 9px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                              >승인</button>
                              <button
                                onClick={e => { e.stopPropagation(); setRejectModal(app); setRejectReason('') }}
                                style={{ background: '#fee2e2', color: '#991b1b', border: 'none', borderRadius: 5, padding: '3px 9px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                              >반려</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* ─── Bottom 2-column ─── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>

          {/* Announcement */}
          <div id="announcement-section" style={{ background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.07)' }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 14, color: '#111827' }}>📢 실시간 공지사항 설정</h3>
            {announcement === '' && !announcementSaving && (
              <p style={{ fontSize: 12, color: '#9ca3af', marginBottom: 8 }}>공지사항이 없습니다.</p>
            )}
            <textarea
              value={announcement}
              onChange={e => setAnnouncement(e.target.value)}
              placeholder="공지사항을 입력하세요. 직원 메인 화면에 표시됩니다."
              rows={5}
              style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 8, padding: '10px 12px', fontSize: 13, resize: 'vertical', outline: 'none', marginBottom: 12, boxSizing: 'border-box' }}
            />
            <button
              onClick={handleSaveAnnouncement}
              disabled={announcementSaving}
              style={{ background: announcementSaving ? '#9ca3af' : '#1a56db', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 22px', fontWeight: 600, fontSize: 13, cursor: announcementSaving ? 'not-allowed' : 'pointer' }}
            >
              {announcementSaving ? '저장 중...' : '공지사항 저장'}
            </button>
          </div>

          {/* Regulations */}
          <div id="regulation-section" style={{ background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.07)' }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 14, color: '#111827' }}>📄 규정집 새 버전 등록 및 관리</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>버전명</label>
                <input
                  value={regVersion}
                  onChange={e => setRegVersion(e.target.value)}
                  placeholder="예: 2026년 개정판"
                  style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 10px', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>파일 첨부 (여러 개 선택 가능)</label>
                <input
                  type="file" multiple
                  onChange={e => setRegFiles(Array.from(e.target.files || []))}
                  style={{ width: '100%', fontSize: 12, paddingTop: 6 }}
                />
              </div>
            </div>
            {regFiles.length > 0 && (
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>
                선택: {regFiles.map(f => f.name).join(', ')}
              </div>
            )}
            <button
              onClick={handleUploadRegulation}
              disabled={regUploading}
              style={{ background: regUploading ? '#9ca3af' : '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', fontWeight: 600, fontSize: 13, cursor: regUploading ? 'not-allowed' : 'pointer', marginBottom: 16 }}
            >
              {regUploading ? '업로드 중...' : '규정집 등록'}
            </button>

            <div style={{ maxHeight: 180, overflowY: 'auto' }}>
              {regulations.length === 0 ? (
                <p style={{ color: '#9ca3af', fontSize: 13 }}>등록된 규정집이 없습니다.</p>
              ) : regulations.map(reg => (
                <div key={reg.id} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 12px', marginBottom: 8 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>{reg.버전명}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {reg.files.map((f, i) => (
                      <a key={i} href={f.url} target="_blank" rel="noopener noreferrer"
                        style={{ background: '#eff6ff', color: '#1a56db', padding: '2px 8px', borderRadius: 6, fontSize: 12, textDecoration: 'none' }}>
                        📎 {f.name}
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ─── Modals ─── */}

      {/* Detail modal */}
      {detailModal && (
        <ModalOverlay onClose={() => setDetailModal(null)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h3 style={{ fontSize: 18, fontWeight: 700 }}>{detailModal.formTitle} 상세</h3>
            <button onClick={() => setDetailModal(null)} style={closeBtn}>✕</button>
          </div>
          <div style={{ background: '#f9fafb', borderRadius: 8, padding: 14, marginBottom: 16 }}>
            <p style={{ fontWeight: 600, marginBottom: 6, fontSize: 13 }}>신청자</p>
            <p style={{ color: '#374151', fontSize: 13 }}>
              {detailModal.applicant?.성명} ({detailModal.applicant?.사번}) · {detailModal.applicant?.부서} · {detailModal.applicant?.직급}
            </p>
            <p style={{ color: '#9ca3af', fontSize: 12, marginTop: 4 }}>
              상태: <span style={statusInfo(detailModal.status) && { color: statusInfo(detailModal.status).color, fontWeight: 600 }}>
                {statusInfo(detailModal.status).text}
              </span>
              {detailModal.created_at?.toDate && ` · ${detailModal.created_at.toDate!().toLocaleDateString('ko-KR')}`}
            </p>
          </div>
          {detailModal.data && Object.entries(detailModal.data).map(([k, v]) => {
            // v가 직접 파일 객체인 경우 (Firestore에 {url, name}으로 저장됨)
            let fileInfo: { url: string; name: string; size?: number } | null = null
            if (v && typeof v === 'object' && !Array.isArray(v)) {
              const obj = v as Record<string, unknown>
              if (typeof obj.url === 'string' && typeof obj.name === 'string') {
                fileInfo = { url: obj.url, name: obj.name, size: typeof obj.size === 'number' ? obj.size : undefined }
              }
            }
            const strV = fileInfo ? '' : String(v)
            const isEnc = strV.startsWith('enc:')
            const decKey = `${detailModal.id}_${k}`
            const decrypted = decryptedValues[decKey]
            // 배열인 경우 (다중 파일 등)
            const isArray = Array.isArray(v)
            return (
              <div key={k} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid #f3f4f6', alignItems: 'flex-start' }}>
                <span style={{ color: '#6b7280', minWidth: 120, fontSize: 13, flexShrink: 0, paddingTop: 2 }}>{k}</span>
                {fileInfo ? (
                  <a href={fileInfo.url} target="_blank" rel="noopener noreferrer"
                    style={{ color: '#1a56db', fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6, background: '#eff6ff', padding: '4px 10px', borderRadius: 6, textDecoration: 'none' }}>
                    📎 {fileInfo.name}
                    {fileInfo.size && <span style={{ color: '#9ca3af', fontWeight: 400, fontSize: 11 }}>({(fileInfo.size / 1024).toFixed(1)} KB)</span>}
                  </a>
                ) : isArray ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {(v as unknown[]).map((item, i) => {
                      const obj = item as Record<string, unknown>
                      if (obj?.url && obj?.name) {
                        return (
                          <a key={i} href={String(obj.url)} target="_blank" rel="noopener noreferrer"
                            style={{ color: '#1a56db', fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4, background: '#eff6ff', padding: '4px 10px', borderRadius: 6, textDecoration: 'none' }}>
                            📎 {String(obj.name)}
                          </a>
                        )
                      }
                      return <span key={i} style={{ fontSize: 13 }}>{String(item)}</span>
                    })}
                  </div>
                ) : isEnc ? (
                  decrypted ? (
                    <span style={{ fontWeight: 500, fontSize: 13, color: '#dc2626' }}>{decrypted}</span>
                  ) : (
                    <button
                      onClick={() => handleDecrypt(decKey, strV)}
                      style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 6, padding: '3px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                    >🔒 보안처리됨 — 클릭하여 복호화</button>
                  )
                ) : (
                  <span style={{ fontWeight: 500, fontSize: 13 }}>{strV}</span>
                )}
              </div>
            )
          })}
          {detailModal.status === 'rejected' && detailModal.reject_reason && (
            <div style={{ background: '#fef2f2', borderRadius: 8, padding: 12, marginTop: 12 }}>
              <span style={{ color: '#dc2626', fontWeight: 600 }}>반려 사유: </span>
              <span style={{ color: '#dc2626' }}>{detailModal.reject_reason}</span>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
            {detailModal.status === 'pending' && (
              <>
                <button onClick={() => handleApprove(detailModal)} style={{ ...btnAction, background: '#059669' }}>승인</button>
                <button onClick={() => { setRejectModal(detailModal); setRejectReason('') }} style={{ ...btnAction, background: '#dc2626' }}>반려</button>
              </>
            )}
            <button onClick={() => setDeleteConfirm(detailModal)} style={{ ...btnAction, background: '#6b7280' }}>삭제</button>
          </div>
        </ModalOverlay>
      )}

      {rejectModal && (
        <ModalOverlay onClose={() => setRejectModal(null)}>
          <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 16 }}>반려 사유 입력</h3>
          <textarea
            value={rejectReason} onChange={e => setRejectReason(e.target.value)}
            placeholder="반려 사유를 입력하세요" rows={4}
            style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 8, padding: 10, fontSize: 14, marginBottom: 16, resize: 'vertical', boxSizing: 'border-box' }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleReject} style={{ ...btnAction, background: '#dc2626' }}>반려 처리</button>
            <button onClick={() => setRejectModal(null)} style={{ ...btnAction, background: '#6b7280' }}>취소</button>
          </div>
        </ModalOverlay>
      )}

      {deleteConfirm && (
        <ModalOverlay onClose={() => setDeleteConfirm(null)}>
          <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 12 }}>신청 삭제</h3>
          <p style={{ color: '#374151', marginBottom: 20 }}>
            [{deleteConfirm.formTitle}] 신청을 삭제하시겠습니까?<br />
            <span style={{ color: '#dc2626', fontSize: 13 }}>이 작업은 취소할 수 없습니다.</span>
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleDeleteApp} style={{ ...btnAction, background: '#dc2626' }}>삭제</button>
            <button onClick={() => setDeleteConfirm(null)} style={{ ...btnAction, background: '#6b7280' }}>취소</button>
          </div>
        </ModalOverlay>
      )}

      {/* 첨부파일 관리 모달 */}
      {attachModal && (() => {
        const allFiles = apps.flatMap(app => {
          if (!app.data) return []
          const files: { name: string; url: string; size?: number; date: Date | null }[] = []
          for (const v of Object.values(app.data)) {
            if (v && typeof v === 'object' && !Array.isArray(v)) {
              const obj = v as Record<string, unknown>
              if (typeof obj.url === 'string' && typeof obj.name === 'string') {
                files.push({ name: obj.name, url: obj.url, size: typeof obj.size === 'number' ? obj.size : undefined, date: app.created_at?.toDate?.() || null })
              }
            }
            if (Array.isArray(v)) {
              for (const item of v) {
                const obj = item as Record<string, unknown>
                if (obj?.url && obj?.name) {
                  files.push({ name: String(obj.name), url: String(obj.url), size: typeof obj.size === 'number' ? obj.size : undefined, date: app.created_at?.toDate?.() || null })
                }
              }
            }
          }
          return files
        })
        const q = attachSearch.toLowerCase()
        const filtered = allFiles.filter(f => !q || f.name.toLowerCase().includes(q))
        return (
          <ModalOverlay onClose={() => setAttachModal(false)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 18, fontWeight: 700 }}>📎 첨부파일 관리</h3>
              <button onClick={() => setAttachModal(false)} style={closeBtn}>✕</button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 12 }}>
              <input
                value={attachSearch}
                onChange={e => setAttachSearch(e.target.value)}
                placeholder="파일명 검색..."
                style={{ flex: 1, border: '1px solid #d1d5db', borderRadius: 8, padding: '7px 12px', fontSize: 13, outline: 'none' }}
              />
              <span style={{ fontSize: 13, color: '#6b7280', whiteSpace: 'nowrap' }}>총 {filtered.length}건</span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  {['파일명', '크기', '업로드일', '다운로드'].map(h => (
                    <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 600, color: '#374151', borderBottom: '2px solid #e5e7eb', fontSize: 12, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={4} style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>첨부파일이 없습니다.</td></tr>
                ) : filtered.map((f, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '9px 12px', maxWidth: 280 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>{f.name.endsWith('.pdf') ? '📄' : f.name.match(/\.(png|jpg|jpeg|gif)$/i) ? '🖼️' : '📎'}</span>
                        <span style={{ wordBreak: 'break-all', fontSize: 12, color: '#111827' }}>{f.name}</span>
                      </div>
                    </td>
                    <td style={{ padding: '9px 12px', color: '#6b7280', whiteSpace: 'nowrap' }}>{f.size ? `${(f.size / 1024 / 1024).toFixed(1)} MB` : '-'}</td>
                    <td style={{ padding: '9px 12px', color: '#6b7280', whiteSpace: 'nowrap' }}>{f.date?.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) || '-'}</td>
                    <td style={{ padding: '9px 12px' }}>
                      <a href={f.url} target="_blank" rel="noopener noreferrer"
                        style={{ background: '#eff6ff', color: '#1a56db', border: '1px solid #bfdbfe', borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                        ↓ 받기
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ModalOverlay>
        )
      })()}

      {/* SMS 설정 모달 */}
      {smsModal && (
        <ModalOverlay onClose={() => setSmsModal(false)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h3 style={{ fontSize: 18, fontWeight: 700 }}>💬 SMS 발송 설정</h3>
            <button onClick={() => setSmsModal(false)} style={closeBtn}>✕</button>
          </div>

          {solapiConnected ? (
            /* 연동된 상태 */
            <>
              <div style={{ background: '#d1fae5', borderRadius: 10, padding: '16px 18px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 24 }}>✅</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#065f46' }}>Solapi 연동됨</div>
                  <div style={{ fontSize: 13, color: '#047857', marginTop: 2 }}>OAuth2로 인증됩니다</div>
                </div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>발신번호</label>
                <input
                  type="text"
                  placeholder={smsForm.from || '01012345678'}
                  defaultValue={smsForm.from}
                  onChange={e => setSmsForm(f => ({ ...f, from: e.target.value }))}
                  style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <button onClick={handleSaveSmsSettings} disabled={notifySaving}
                  style={{ ...btnAction, background: notifySaving ? '#9ca3af' : '#1a56db', flex: 1 }}>
                  {notifySaving ? '저장 중...' : '💾 저장'}
                </button>
                <button onClick={() => { window.location.href = '/api/solapi-oauth' }}
                  style={{ ...btnAction, background: '#6b7280' }}>다른 계정</button>
                <button onClick={async () => {
                  await fetch('/api/solapi-oauth', { method: 'DELETE' })
                  setSolapiConnected(false)
                  showMsg('Solapi 연동이 해제되었습니다.')
                  setSmsModal(false)
                }} style={{ ...btnAction, background: '#dc2626' }}>연동 해제</button>
              </div>
            </>
          ) : (
            /* 미연동 상태 */
            <>
              <div style={{ background: '#fef9f0', border: '1px solid #fde68a', borderRadius: 10, padding: '14px 16px', marginBottom: 20, fontSize: 13, color: '#92400e' }}>
                Solapi 계정으로 로그인하면 API Key 없이 문자를 발송할 수 있습니다.
              </div>
              <button
                onClick={() => { window.location.href = '/api/solapi-oauth' }}
                style={{ width: '100%', background: '#fff', border: '2px solid #1a56db', borderRadius: 10, padding: '12px 16px', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 20, color: '#1a56db' }}
              >
                💬 Solapi 계정으로 로그인
              </button>
              <details style={{ marginBottom: 16 }}>
                <summary style={{ fontSize: 13, color: '#6b7280', cursor: 'pointer', marginBottom: 12 }}>API Key로 직접 설정</summary>
                <div style={{ paddingTop: 8 }}>
                  <div style={{ background: '#eff6ff', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#1e40af' }}>
                    <a href="https://console.solapi.com" target="_blank" rel="noopener noreferrer" style={{ color: '#1a56db' }}>Solapi 콘솔</a>에서 API Key를 확인하세요. 빈 칸은 기존 값을 유지합니다.
                  </div>
                  {[
                    { label: 'API Key', key: 'apiKey', placeholder: '미설정' },
                    { label: 'API Secret', key: 'apiSecret', placeholder: '미설정' },
                    { label: '발신번호', key: 'from', placeholder: smsForm.from || '01012345678' },
                  ].map(({ label, key, placeholder }) => (
                    <div key={key} style={{ marginBottom: 16 }}>
                      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>{label}</label>
                      <input
                        type={key === 'apiSecret' ? 'password' : 'text'}
                        placeholder={placeholder}
                        onChange={e => setSmsForm(f => ({ ...f, [key]: e.target.value }))}
                        style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                      />
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={handleSaveSmsSettings} disabled={notifySaving}
                      style={{ ...btnAction, background: notifySaving ? '#9ca3af' : '#1a56db', flex: 1 }}>
                      {notifySaving ? '저장 중...' : '💾 저장'}
                    </button>
                    <button onClick={() => setSmsModal(false)} style={{ ...btnAction, background: '#6b7280' }}>취소</button>
                  </div>
                </div>
              </details>
              {!solapiConnected && (
                <button onClick={() => setSmsModal(false)} style={{ ...btnAction, background: '#6b7280', width: '100%' }}>취소</button>
              )}
            </>
          )}
        </ModalOverlay>
      )}

      {/* 이메일 설정 모달 */}
      {emailModal && (
        <ModalOverlay onClose={() => setEmailModal(false)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h3 style={{ fontSize: 18, fontWeight: 700 }}>✉️ 이메일 발송 설정</h3>
            <button onClick={() => setEmailModal(false)} style={closeBtn}>✕</button>
          </div>

          {gmailConnected ? (
            /* 연결된 상태 */
            <>
              <div style={{ background: '#d1fae5', borderRadius: 10, padding: '16px 18px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 24 }}>✅</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#065f46' }}>Gmail 연동됨</div>
                  <div style={{ fontSize: 13, color: '#047857', marginTop: 2 }}>{gmailConnected}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => window.location.href = '/api/google-oauth'}
                  style={{ ...btnAction, background: '#1a56db', flex: 1 }}
                >
                  다른 계정으로 변경
                </button>
                <button
                  onClick={async () => {
                    await fetch('/api/google-oauth', { method: 'DELETE' })
                    setGmailConnected(null)
                    showMsg('Gmail 연동이 해제되었습니다.')
                    setEmailModal(false)
                  }}
                  style={{ ...btnAction, background: '#dc2626' }}
                >
                  연동 해제
                </button>
              </div>
            </>
          ) : (
            /* 미연결 상태 */
            <>
              <div style={{ background: '#fef9f0', border: '1px solid #fde68a', borderRadius: 10, padding: '14px 16px', marginBottom: 24, fontSize: 13, color: '#92400e' }}>
                Google 계정으로 로그인하면 앱 비밀번호 없이 이메일을 발송할 수 있습니다.
              </div>
              <button
                onClick={() => { window.location.href = '/api/google-oauth' }}
                style={{ width: '100%', background: '#fff', border: '1px solid #d1d5db', borderRadius: 10, padding: '12px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 16 }}
              >
                <svg width="20" height="20" viewBox="0 0 48 48"><path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"/><path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"/><path fill="#FBBC05" d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24c0 3.55.85 6.91 2.34 9.88l7.35-5.7z"/><path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"/></svg>
                Google 계정으로 로그인
              </button>
              <button onClick={() => setEmailModal(false)} style={{ ...btnAction, background: '#6b7280', width: '100%' }}>취소</button>
            </>
          )}
        </ModalOverlay>
      )}

    </div>
  )
}

function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 32, width: 520, maxHeight: '88vh', overflow: 'auto' }}
        onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

export default function AdminPage() {
  return (
    <Suspense fallback={null}>
      <AdminPageInner />
    </Suspense>
  )
}

const btnAction: React.CSSProperties = { color: '#fff', border: 'none', borderRadius: 8, padding: '9px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }
const closeBtn: React.CSSProperties = { background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6b7280' }
const labelS: React.CSSProperties = { display: 'block', fontWeight: 600, marginBottom: 5, fontSize: 13, color: '#374151' }
const inputS: React.CSSProperties = { width: '100%', border: '1px solid #d1d5db', borderRadius: 8, padding: '9px 12px', fontSize: 14, outline: 'none', boxSizing: 'border-box' }

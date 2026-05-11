'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  collection, getDocs, doc, updateDoc, deleteDoc, orderBy, query, setDoc, getDoc, serverTimestamp,
} from 'firebase/firestore'
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { getIdToken } from 'firebase/auth'
import { auth as firebaseAuth, db, storage } from '@/lib/firebase'
import { useAuth } from '@/lib/auth-context'
import Navbar from '@/components/Navbar'
import QRCorner from '@/components/QRCorner'
import StatsCards from './components/StatsCards'
import PendingList from './components/PendingList'
import CrossTable from './components/CrossTable'
import ApplicationTable from './components/ApplicationTable'
import { DetailModal, RejectModal, DeleteModal, AttachModal, ModalOverlay } from './components/Modals'
import type { Application, UserDoc, RegDoc, FormConfig, BudgetGroup } from './types'
import { screen } from '@/lib/auto-screen'

const btnAction: React.CSSProperties = { color: '#fff', border: 'none', borderRadius: 8, padding: '9px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }

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
  const [formFilter, setFormFilter] = useState<string>('all')

  const [announcement, setAnnouncement] = useState('')
  const [announcementSaving, setAnnouncementSaving] = useState(false)

  const [regVersion, setRegVersion] = useState('')
  const [regFiles, setRegFiles] = useState<File[]>([])
  const [regUploading, setRegUploading] = useState(false)
  const [regulations, setRegulations] = useState<RegDoc[]>([])

  const [attachModal, setAttachModal] = useState(false)
  const [attachSearch, setAttachSearch] = useState('')

  const [smsModal, setSmsModal] = useState(false)
  const [emailModal, setEmailModal] = useState(false)
  const [smsForm, setSmsForm] = useState({ apiKey: '', apiSecret: '', from: '' })
  const [emailForm, setEmailForm] = useState({ from: '', password: '' })
  const [gmailConnected, setGmailConnected] = useState<string | null>(null)
  const [solapiConnected, setSolapiConnected] = useState(false)
  const [notifySaving, setNotifySaving] = useState(false)

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
      const [formsSnap, appsSnap, budgetSnap] = await Promise.all([
        getDocs(collection(db, 'form_configs')),
        getDocs(query(collection(db, 'applications'), orderBy('created_at', 'desc'))),
        getDocs(collection(db, 'budget_groups')),
      ])

      const formMap: Record<string, string> = {}
      const formFullMap: Record<string, FormConfig> = {}
      formsSnap.docs.forEach(d => {
        const data = d.data()
        formMap[d.id] = (data as { 제목: string }).제목
        formFullMap[d.id] = { id: d.id, ...data } as FormConfig
      })
      setForms(formsSnap.docs
        .map(d => ({ id: d.id, ...d.data() } as FormConfig))
        .sort((a, b) => (a.order || 0) - (b.order || 0)))

      const budgetGroups = budgetSnap.docs.map(d => ({ id: d.id, ...d.data() } as BudgetGroup))

      const rawApps = appsSnap.docs.map(d => ({
        id: d.id, user_id: d.data().user_id, ...d.data(),
        formTitle: formMap[d.data().form_id] || d.data().form_id,
      } as Application))

      // 사용자별 신청 그룹화 (중복 검사용)
      const byUser: Record<string, Application[]> = {}
      for (const a of rawApps) {
        const k = a.user_id || a.applicant?.사번 || ''
        if (!k) continue
        if (!byUser[k]) byUser[k] = []
        byUser[k].push(a)
      }

      // 사용자 정보 미리 로드 (휴직자 검사용)
      let usersMap: Record<string, UserDoc> = {}
      try {
        const uSnap = await getDocs(collection(db, 'users'))
        usersMap = Object.fromEntries(uSnap.docs.map(u => [u.id, { id: u.id, ...u.data() } as UserDoc]))
      } catch { /* fallback: 빈 맵 */ }

      // 각 신청에 자동 사전심사 결과 첨부
      const screenedApps: Application[] = rawApps.map(a => {
        const userKey = a.user_id || a.applicant?.사번 || ''
        const userApps = byUser[userKey] || []
        const userDoc = a.user_id ? usersMap[a.user_id] : undefined
        const fullForm = formFullMap[a.form_id]
        const result = screen(a, {
          form: fullForm
            ? {
                id: fullForm.id,
                제목: fullForm.제목,
                fields: (fullForm.fields as { id: string; label: string; type: string; required?: boolean; options?: string[] | string }[]) || [],
                periods: fullForm.periods,
                대부동의필요: fullForm.대부동의필요,
                무주택서약필요: fullForm.무주택서약필요,
                무주택서약조건필드ID: fullForm.무주택서약조건필드ID,
                무주택서약조건값들: fullForm.무주택서약조건값들,
              }
            : null,
          user: userDoc ? { 사번: userDoc.사번, status: userDoc.status } : null,
          userApps,
          allApps: rawApps,
          budgetGroups,
        })
        return { ...a, screen: result }
      })

      setApps(screenedApps)

      const [usersResult, settingsResult, notifyResult, regsResult] = await Promise.allSettled([
        getDocs(collection(db, 'users')),
        getDoc(doc(db, 'settings', 'global')),
        getDoc(doc(db, 'settings', 'notify')),
        getDocs(query(collection(db, 'regulations'), orderBy('createdAt', 'desc'))),
      ])

      if (usersResult.status === 'fulfilled') {
        setUsers(usersResult.value.docs
          .map(d => ({ id: d.id, ...d.data() } as UserDoc))
          .filter(u => u.status !== 'inactive')
          .sort((a, b) => (a.사번 || '').localeCompare(b.사번 || '')))
      }
      if (settingsResult.status === 'fulfilled' && settingsResult.value.exists()) {
        setAnnouncement(settingsResult.value.data()?.공지사항 || '')
      }
      if (notifyResult.status === 'fulfilled' && notifyResult.value.exists()) {
        const nd = notifyResult.value.data()
        if (nd?.sms) {
          setSmsForm(f => ({ ...f, from: nd.sms.from || '' }))
          if (nd.sms.authType === 'oauth2') setSolapiConnected(true)
        }
        if (nd?.email?.from) {
          setEmailForm(f => ({ ...f, from: nd.email.from || '' }))
          if (nd.email.authType === 'oauth2') setGmailConnected(nd.email.from)
        }
      }
      if (regsResult.status === 'fulfilled') {
        setRegulations(regsResult.value.docs.map(d => {
          const data = d.data()
          return { id: d.id, 버전명: data.버전명, files: data.files || [], createdAt: data.createdAt?.toDate?.() || new Date() } as RegDoc
        }))
      }
    } catch (e) { console.error('Admin loadData error:', e) }
    finally { setDataLoading(false) }
  }, [])

  useEffect(() => {
    if (profile?.isAdmin) loadData()
  }, [profile, loadData])

  const showMsg = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 3000) }

  const sendNotification = async (app: Application, status: 'approved' | 'rejected', reason?: string) => {
    if (!app.user_id) return
    try {
      const userDoc = await getDoc(doc(db, 'users', app.user_id))
      if (!userDoc.exists()) return
      const u = userDoc.data() as { 전화번호?: string; 이메일?: string; 성명?: string }
      const name = u.성명 || app.applicant?.성명 || ''
      const statusText = status === 'approved' ? '승인' : '반려'
      const message = status === 'approved'
        ? `[한국지방재정공제회 복지]\n\n안녕하세요, ${name}님.\n\n신청하신 「${app.formTitle}」 건이 승인 처리되었음을 안내드립니다.\n자세한 내용은 복지포털에서 확인하실 수 있습니다.\n\n감사합니다.\n한국지방재정공제회 복지담당`
        : `[한국지방재정공제회 복지]\n\n안녕하세요, ${name}님.\n\n신청하신 「${app.formTitle}」 건이 검토 결과 반려 처리되었음을 안내드립니다.${reason ? `\n\n[반려 사유]\n${reason}` : ''}\n\n궁금하신 사항이 있으시면 복지담당자에게 문의해 주시기 바랍니다.\n\n감사합니다.\n한국지방재정공제회 복지담당`
      const subject = status === 'approved'
        ? `[한국지방재정공제회] ${name}님, 「${app.formTitle}」 신청 승인 안내`
        : `[한국지방재정공제회] ${name}님, 「${app.formTitle}」 신청 반려 안내`
      const idToken = await user!.getIdToken()
      fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ type: 'both', to: u.전화번호 || '', email: u.이메일 || '', message, subject }),
      }).catch(() => {})
    } catch { /* notification is best-effort */ }
  }

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
    setRegulations(prev => [{ id: regDocRef.id, 버전명: regVersion, files: uploaded, createdAt: new Date() }, ...prev])
    setRegVersion(''); setRegFiles([])
    setRegUploading(false)
    showMsg('규정집이 업로드되었습니다.')
  }

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

  const handleExportCSV = () => {
    // '신청금액' 카테고리: 의료비/문화/생활/예방접종 총액을 묶어 반려사유 바로 뒤에 고정 배치
    const AMOUNT_KEYS: { key: string; label: string }[] = [
      { key: '총금액', label: '[신청금액] 총금액(의료비지원)' },
      { key: '문화활동총액', label: '[신청금액] 문화활동총액' },
      { key: '생활복지총액', label: '[신청금액] 생활복지총액' },
      { key: '예방접종총액', label: '[신청금액] 예방접종총액' },
    ]
    const amountKeySet = new Set(AMOUNT_KEYS.map(a => a.key))
    const dataKeys = new Set<string>()
    apps.forEach(a => { if (a.data) Object.keys(a.data).forEach(k => dataKeys.add(k)) })
    const extraCols = Array.from(dataKeys).filter(k => !amountKeySet.has(k))
    const header = [
      '사번', '성명', '부서', '직급', '신청항목', '신청일', '상태', '반려사유',
      ...AMOUNT_KEYS.map(a => a.label),
      ...extraCols,
    ]
    const fmtValue = (v: unknown): string => {
      if (v === null || v === undefined) return ''
      if (Array.isArray(v)) {
        // 다중 첨부파일 등 {url,name} 배열은 파일명을 ; 로 연결
        const named = v.map(item => {
          const o = item as Record<string, unknown>
          if (o && typeof o === 'object' && typeof o.name === 'string') return String(o.name)
          return JSON.stringify(item)
        })
        return named.join('; ')
      }
      if (typeof v === 'object') {
        const obj = v as Record<string, unknown>
        if (obj.name) return String(obj.name)
        return JSON.stringify(v)
      }
      return String(v)
    }
    const rows: string[][] = [header]
    apps.forEach(a => {
      const d = a.created_at?.toDate?.()
      const s = a.status === 'approved' ? '승인' : a.status === 'rejected' ? '반려' : '검토중'
      const base = [a.applicant?.사번||'', a.applicant?.성명||'', a.applicant?.부서||'', a.applicant?.직급||'', a.formTitle||'', d?d.toLocaleDateString('ko-KR'):'', s, a.reject_reason||'']
      const amounts = AMOUNT_KEYS.map(({ key }) => fmtValue(a.data?.[key]))
      const extra = extraCols.map(k => fmtValue(a.data?.[k]))
      rows.push([...base, ...amounts, ...extra])
    })
    const csv = '\uFEFF' + rows.map(r => r.map(c => `"${c.replace(/"/g,'""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `welfare_${new Date().toISOString().split('T')[0]}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  // Derived data
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
    .filter(a => formFilter === 'all' || a.formTitle === formFilter)

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i)

  if (loading || !profile?.isAdmin) return <div style={{ textAlign: 'center', padding: '40px', fontSize: '18px' }}>Loading...</div>

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>

      {msg && (
        <div style={{ position: 'fixed', top: 66, left: '50%', transform: 'translateX(-50%)', background: '#1a56db', color: '#fff', padding: '12px 24px', borderRadius: 8, zIndex: 9999, fontWeight: 600, boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>
          {msg}
        </div>
      )}

      <Navbar />

      {/* Sub toolbar */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: '#111827', display: 'flex', alignItems: 'center', gap: 8 }}>
          신청내역 관리
          <span style={{ color: '#6b7280', fontWeight: 400, fontSize: 13 }}>({selectedYear}년도)</span>
        </div>
        <select
          value={selectedYear}
          onChange={e => setSelectedYear(Number(e.target.value))}
          style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: '6px 12px', fontSize: 13, background: '#fff', cursor: 'pointer', outline: 'none' }}
        >
          {years.map(y => <option key={y} value={y}>{y}년도</option>)}
        </select>
        <input
          value={globalSearch}
          onChange={e => setGlobalSearch(e.target.value)}
          placeholder="사번 또는 성명으로 검색..."
          style={{ flex: 1, maxWidth: 300, border: '1px solid #d1d5db', borderRadius: 8, padding: '7px 14px', fontSize: 13, outline: 'none' }}
        />
        <div style={{ flex: 1 }} />
        {(['👁️', '📎'] as const).map((icon, i) => (
          <button
            key={i}
            title={i === 0 ? '신청자 페이지 미리보기' : '첨부파일'}
            onClick={() => {
              if (i === 0) window.open('/main?preview=1', '_blank')
              else { setAttachSearch(''); setAttachModal(true) }
            }}
            style={{ background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 8, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 16 }}
          >{icon}</button>
        ))}
        <button
          onClick={handleExportCSV}
          style={{ background: '#059669', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          데이터 내보내기
        </button>
      </div>

      <div style={{ maxWidth: 1500, margin: '0 auto', padding: '22px 18px' }}>
        <StatsCards
          totalCount={yearApps.length}
          pendingCount={pendingApps.length}
          approvedCount={approvedCount}
          rejectedCount={rejectedCount}
          selectedYear={selectedYear}
        />

        <PendingList apps={pendingApps} onSelect={setDetailModal} />

        <ApplicationTable
          apps={filteredApps}
          yearApps={yearApps}
          pendingCount={pendingApps.length}
          approvedCount={approvedCount}
          rejectedCount={rejectedCount}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          formFilter={formFilter}
          onFormFilterChange={setFormFilter}
          forms={forms}
          dataLoading={dataLoading}
          onSelect={setDetailModal}
          onApprove={handleApprove}
          onReject={app => { setRejectModal(app); setRejectReason('') }}
        />

        <CrossTable users={users} forms={forms} yearApps={yearApps} dataLoading={dataLoading} onSelect={setDetailModal} />

      </div>

      {/* Modals */}
      {detailModal && (
        <DetailModal
          app={detailModal}
          decryptedValues={decryptedValues}
          onClose={() => setDetailModal(null)}
          onApprove={() => handleApprove(detailModal)}
          onReject={() => { setRejectModal(detailModal); setRejectReason('') }}
          onDelete={() => setDeleteConfirm(detailModal)}
          onDecrypt={handleDecrypt}
        />
      )}
      {rejectModal && (
        <RejectModal
          rejectReason={rejectReason}
          onReasonChange={setRejectReason}
          onConfirm={handleReject}
          onClose={() => setRejectModal(null)}
        />
      )}
      {deleteConfirm && (
        <DeleteModal
          app={deleteConfirm}
          onConfirm={handleDeleteApp}
          onClose={() => setDeleteConfirm(null)}
        />
      )}
      {attachModal && (
        <AttachModal
          apps={apps}
          search={attachSearch}
          onSearchChange={setAttachSearch}
          onClose={() => setAttachModal(false)}
        />
      )}

      {/* SMS 설정 모달 */}
      {smsModal && (
        <ModalOverlay onClose={() => setSmsModal(false)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h3 style={{ fontSize: 18, fontWeight: 700 }}>💬 SMS 발송 설정</h3>
            <button onClick={() => setSmsModal(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6b7280' }}>✕</button>
          </div>
          {solapiConnected ? (
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
                <input type="text" placeholder={smsForm.from || '01012345678'} defaultValue={smsForm.from}
                  onChange={e => setSmsForm(f => ({ ...f, from: e.target.value }))}
                  style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <button onClick={handleSaveSmsSettings} disabled={notifySaving}
                  style={{ ...btnAction, background: notifySaving ? '#9ca3af' : '#1a56db', flex: 1 }}>
                  {notifySaving ? '저장 중...' : '💾 저장'}
                </button>
                <button onClick={() => { window.location.href = '/api/solapi-oauth' }}
                  style={{ ...btnAction, background: '#6b7280' }}>다른 계정</button>
                <button onClick={async () => {
                  const token = user ? await getIdToken(user) : ''
                  await fetch('/api/solapi-oauth', { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } })
                  setSolapiConnected(false)
                  showMsg('Solapi 연동이 해제되었습니다.')
                  setSmsModal(false)
                }} style={{ ...btnAction, background: '#dc2626' }}>연동 해제</button>
              </div>
            </>
          ) : (
            <>
              <div style={{ background: '#fef9f0', border: '1px solid #fde68a', borderRadius: 10, padding: '14px 16px', marginBottom: 20, fontSize: 13, color: '#92400e' }}>
                Solapi 계정으로 로그인하면 API Key 없이 문자를 발송할 수 있습니다.
              </div>
              <button onClick={() => { window.location.href = '/api/solapi-oauth' }}
                style={{ width: '100%', background: '#fff', border: '2px solid #1a56db', borderRadius: 10, padding: '12px 16px', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 20, color: '#1a56db' }}>
                💬 Solapi 계정으로 로그인
              </button>
              <details style={{ marginBottom: 16 }}>
                <summary style={{ fontSize: 13, color: '#6b7280', cursor: 'pointer', marginBottom: 12 }}>API Key로 직접 설정</summary>
                <div style={{ paddingTop: 8 }}>
                  <div style={{ background: '#eff6ff', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#1e40af' }}>
                    <a href="https://console.solapi.com" target="_blank" rel="noopener noreferrer" style={{ color: '#1a56db' }}>Solapi 콘솔</a>에서 API Key를 확인하세요.
                  </div>
                  {[
                    { label: 'API Key', key: 'apiKey', placeholder: '미설정' },
                    { label: 'API Secret', key: 'apiSecret', placeholder: '미설정' },
                    { label: '발신번호', key: 'from', placeholder: smsForm.from || '01012345678' },
                  ].map(({ label, key, placeholder }) => (
                    <div key={key} style={{ marginBottom: 16 }}>
                      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>{label}</label>
                      <input type={key === 'apiSecret' ? 'password' : 'text'} placeholder={placeholder}
                        onChange={e => setSmsForm(f => ({ ...f, [key]: e.target.value }))}
                        style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
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
            <button onClick={() => setEmailModal(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6b7280' }}>✕</button>
          </div>
          {gmailConnected ? (
            <>
              <div style={{ background: '#d1fae5', borderRadius: 10, padding: '16px 18px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 24 }}>✅</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#065f46' }}>Gmail 연동됨</div>
                  <div style={{ fontSize: 13, color: '#047857', marginTop: 2 }}>{gmailConnected}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => window.location.href = '/api/google-oauth'}
                  style={{ ...btnAction, background: '#1a56db', flex: 1 }}>다른 계정으로 변경</button>
                <button onClick={async () => {
                  const token = user ? await getIdToken(user) : ''
                  await fetch('/api/google-oauth', { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } })
                  setGmailConnected(null)
                  showMsg('Gmail 연동이 해제되었습니다.')
                  setEmailModal(false)
                }} style={{ ...btnAction, background: '#dc2626' }}>연동 해제</button>
              </div>
            </>
          ) : (
            <>
              <div style={{ background: '#fef9f0', border: '1px solid #fde68a', borderRadius: 10, padding: '14px 16px', marginBottom: 24, fontSize: 13, color: '#92400e' }}>
                Google 계정으로 로그인하면 앱 비밀번호 없이 이메일을 발송할 수 있습니다.
              </div>
              <button onClick={() => { window.location.href = '/api/google-oauth' }}
                style={{ width: '100%', background: '#fff', border: '1px solid #d1d5db', borderRadius: 10, padding: '12px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 16 }}>
                <svg width="20" height="20" viewBox="0 0 48 48"><path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"/><path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"/><path fill="#FBBC05" d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24c0 3.55.85 6.91 2.34 9.88l7.35-5.7z"/><path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"/></svg>
                Google 계정으로 로그인
              </button>
              <button onClick={() => setEmailModal(false)} style={{ ...btnAction, background: '#6b7280', width: '100%' }}>취소</button>
            </>
          )}
        </ModalOverlay>
      )}
      <QRCorner url="/admin" caption="관리자 페이지" />
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

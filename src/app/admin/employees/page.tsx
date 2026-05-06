'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { collection, getDocs, doc, updateDoc, deleteDoc, query, where, writeBatch } from 'firebase/firestore'
import { getIdToken } from 'firebase/auth'
import { db } from '@/lib/firebase'
import { useAuth } from '@/lib/auth-context'
import Navbar from '@/components/Navbar'

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
  status?: string  // 'active' | 'inactive' | 'leave'
  leaveStart?: string
  leaveEnd?: string
}


export default function EmployeesPage() {
  const { user, profile, loading } = useAuth()
  const router = useRouter()

  const [users, setUsers] = useState<UserDoc[]>([])
  const [dataLoading, setDataLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [msg, setMsg] = useState('')

  const [userEditModal, setUserEditModal] = useState<UserDoc | null>(null)
  const [userEditData, setUserEditData] = useState<Partial<UserDoc>>({})
  const [userDeleteConfirm, setUserDeleteConfirm] = useState<UserDoc | null>(null)
  const [pwModal, setPwModal] = useState<UserDoc | null>(null)
  const [pwValue, setPwValue] = useState('')
  const [pwLoading, setPwLoading] = useState(false)
  const [pwMsg, setPwMsg] = useState('')
  const [leaveModal, setLeaveModal] = useState<UserDoc | null>(null)
  const [leaveStart, setLeaveStart] = useState('')
  const [leaveEnd, setLeaveEnd] = useState('')

  useEffect(() => {
    if (!loading && (!user || !profile?.isAdmin)) router.replace('/main')
  }, [user, profile, loading, router])

  useEffect(() => {
    if (!profile?.isAdmin) return
    const load = async () => {
      setDataLoading(true)
      try {
        const snap = await getDocs(collection(db, 'users'))
        setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() } as UserDoc)))
      } catch (e) { console.error(e) }
      finally { setDataLoading(false) }
    }
    load()
  }, [profile])

  const showMsg = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 3000) }

  /** 같은 이메일 또는 사번을 가진 중복 user 도큐먼트 그룹 찾기 */
  const duplicateGroups = (() => {
    const groups: { key: string; type: '이메일' | '사번'; users: UserDoc[] }[] = []
    const seenIds = new Set<string>()
    // 이메일 기준
    const emailMap = new Map<string, UserDoc[]>()
    for (const u of users) {
      const k = (u.이메일 || '').toLowerCase().trim()
      if (!k) continue
      if (!emailMap.has(k)) emailMap.set(k, [])
      emailMap.get(k)!.push(u)
    }
    for (const [k, arr] of emailMap) {
      if (arr.length > 1) {
        groups.push({ key: k, type: '이메일', users: arr })
        arr.forEach(u => seenIds.add(u.id))
      }
    }
    // 사번 기준 (이메일 그룹에 포함된 사용자 제외하고 사번만 같은 케이스 검출)
    const empMap = new Map<string, UserDoc[]>()
    for (const u of users) {
      const k = (u.사번 || '').trim()
      if (!k) continue
      if (!empMap.has(k)) empMap.set(k, [])
      empMap.get(k)!.push(u)
    }
    for (const [k, arr] of empMap) {
      if (arr.length > 1) {
        // 이미 이메일 그룹으로 잡힌 경우 중복 표시 안 함
        const newOnes = arr.filter(u => !seenIds.has(u.id))
        if (newOnes.length > 1 || (newOnes.length >= 1 && arr.some(u => seenIds.has(u.id)))) {
          groups.push({ key: k, type: '사번', users: arr })
        }
      }
    }
    return groups
  })()

  /** 중복 user 두 개 중 하나(secondary)의 신청 데이터를 primary 로 이관하고 secondary 삭제 */
  const mergeDuplicates = async (primaryId: string, secondaryId: string) => {
    if (primaryId === secondaryId) return
    if (!confirm(`이 작업은 되돌릴 수 없습니다.\n\n• ${secondaryId} 의 모든 신청 데이터를 ${primaryId} 로 이관\n• ${secondaryId} 사용자 문서 삭제\n\n계속할까요?`)) return
    try {
      // 신청 데이터 이관
      const appsSnap = await getDocs(query(collection(db, 'applications'), where('user_id', '==', secondaryId)))
      const batch = writeBatch(db)
      appsSnap.docs.forEach(d => batch.update(d.ref, { user_id: primaryId }))
      await batch.commit()
      // 사용자 문서 삭제
      await deleteDoc(doc(db, 'users', secondaryId))
      setUsers(prev => prev.filter(u => u.id !== secondaryId))
      showMsg(`병합 완료 — 신청 ${appsSnap.size}건 이관 + 중복 사용자 삭제`)
    } catch (e) {
      console.error(e)
      showMsg('병합 실패: ' + (e instanceof Error ? e.message : String(e)))
    }
  }

  const getToken = async () => {
    if (!user) throw new Error('로그인이 필요합니다.')
    return getIdToken(user)
  }

  const handleUserSave = async () => {
    if (!userEditModal) return
    await updateDoc(doc(db, 'users', userEditModal.id), {
      성명: userEditData.성명, 부서: userEditData.부서, 직급: userEditData.직급, isAdmin: userEditData.isAdmin,
    })
    if (userEditData.이메일 && userEditData.이메일 !== userEditModal.이메일) {
      const token = await getToken()
      await fetch('/api/update-email', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ uid: userEditModal.id, email: userEditData.이메일 }),
      })
    }
    setUsers(prev => prev.map(u => u.id === userEditModal.id ? { ...u, ...userEditData } : u))
    setUserEditModal(null)
    showMsg('직원 정보가 수정되었습니다.')
  }

  const handleDeactivate = async (u: UserDoc) => {
    const newStatus = u.status === 'inactive' ? 'active' : 'inactive'
    const update: Record<string, unknown> = { status: newStatus }
    if (newStatus === 'active') { update.leaveStart = ''; update.leaveEnd = '' }
    await updateDoc(doc(db, 'users', u.id), update)
    setUsers(prev => prev.map(x => x.id === u.id ? { ...x, status: newStatus, ...(newStatus === 'active' ? { leaveStart: '', leaveEnd: '' } : {}) } : x))
    showMsg(newStatus === 'inactive' ? '퇴사처리 되었습니다.' : '복직처리 되었습니다.')
    setUserEditModal(null)
  }

  const handleLeave = async () => {
    if (!leaveModal || !leaveStart || !leaveEnd) { showMsg('휴직 기간을 입력해주세요.'); return }
    await updateDoc(doc(db, 'users', leaveModal.id), { status: 'leave', leaveStart, leaveEnd })
    setUsers(prev => prev.map(x => x.id === leaveModal.id ? { ...x, status: 'leave', leaveStart, leaveEnd } : x))
    setLeaveModal(null); setLeaveStart(''); setLeaveEnd('')
    showMsg('휴직 처리되었습니다.')
    setUserEditModal(null)
  }

  const handleReturnFromLeave = async (u: UserDoc) => {
    await updateDoc(doc(db, 'users', u.id), { status: 'active', leaveStart: '', leaveEnd: '' })
    setUsers(prev => prev.map(x => x.id === u.id ? { ...x, status: 'active', leaveStart: '', leaveEnd: '' } : x))
    showMsg('복직 처리되었습니다.')
    setUserEditModal(null)
  }

  const handleDeleteUser = async () => {
    if (!userDeleteConfirm) return
    const token = await getToken()
    const res = await fetch('/api/delete-user', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ uid: userDeleteConfirm.id }),
    })
    if (res.ok) { setUsers(prev => prev.filter(u => u.id !== userDeleteConfirm.id)); showMsg('직원이 삭제되었습니다.') }
    else showMsg('삭제 중 오류가 발생했습니다.')
    setUserDeleteConfirm(null)
  }

  const handleResetPassword = async (reset: boolean) => {
    if (!pwModal) return
    const password = reset ? 'lofa1234!' : pwValue.trim()
    if (!password || password.length < 6) { setPwMsg('비밀번호는 6자 이상이어야 합니다.'); return }
    setPwLoading(true); setPwMsg('')
    const token = await getToken()
    const res = await fetch('/api/reset-password', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ uid: pwModal.id, password }),
    })
    if (res.ok) {
      // 비밀번호 변경 메일 발송
      const email = pwModal.이메일
      if (email) {
        const name = pwModal.성명 || ''
        fetch('/api/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({
            type: 'email',
            email,
            subject: '[한국지방재정공제회] 비밀번호가 초기화되었습니다',
            message: `${name}님, 비밀번호가 ${reset ? 'lofa1234!' : '관리자가 설정한 비밀번호'}로 초기화되었습니다.\n로그인 후 반드시 비밀번호를 변경해주세요.\n\n사이트: https://lofawelfare-3ae73.web.app`,
          }),
        }).catch(() => {})
      }
      setPwModal(null); setPwValue(''); showMsg(reset ? '비밀번호가 lofa1234!로 초기화되었습니다.' : '비밀번호가 변경되었습니다.')
    }
    else setPwMsg('오류가 발생했습니다.')
    setPwLoading(false)
  }

  const q = search.toLowerCase()
  const filtered = users.filter(u =>
    !q || u.성명?.toLowerCase().includes(q) || u.사번?.toLowerCase().includes(q) || u.부서?.toLowerCase().includes(q)
  )
  const [deptFilter, setDeptFilter] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const departments = [...new Set(users.map(u => u.부서).filter(Boolean) as string[])].sort()
  const finalFiltered = filtered
    .filter(u => !deptFilter || u.부서 === deptFilter)
    .filter(u => !roleFilter || (roleFilter === 'admin' ? u.isAdmin : !u.isAdmin))
    .filter(u => !statusFilter || u.status === statusFilter)

  const totalCount = users.length
  const employeeCount = users.filter(u => !u.isAdmin && u.status !== 'inactive' && u.status !== 'leave').length
  const adminCount = users.filter(u => u.isAdmin).length
  const leaveCount = users.filter(u => u.status === 'leave').length
  const inactiveCount = users.filter(u => u.status === 'inactive').length

  if (loading || !profile?.isAdmin) return null

  return (
    <div style={{ minHeight: '100vh', background: '#f8f9fa', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <Navbar />

      {msg && (
        <div style={{ position: 'fixed', top: 72, left: '50%', transform: 'translateX(-50%)', background: '#1a56db', color: '#fff', padding: '12px 24px', borderRadius: 8, zIndex: 9999, fontWeight: 600, boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>
          {msg}
        </div>
      )}

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 20px 60px' }}>

        {/* Page header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: '#111827', marginBottom: 6 }}>이용자관리</h1>
            <p style={{ fontSize: 14, color: '#6b7280' }}>사내근로복지기금 시스템 이용자를 관리합니다.</p>
          </div>
        </div>

        {/* 중복 사용자 경고 */}
        {duplicateGroups.length > 0 && (
          <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: '16px 20px', marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 18 }}>⚠️</span>
              <strong style={{ fontSize: 14, color: '#92400e' }}>중복 사용자 발견 — {duplicateGroups.length}건</strong>
              <span style={{ fontSize: 12, color: '#92400e', opacity: 0.8 }}>같은 이메일로 두 개 이상의 계정이 등록되어 있습니다.</span>
            </div>
            {duplicateGroups.map((group, gi) => (
              <div key={`${group.type}-${group.key}-${gi}`} style={{ background: '#fff', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px', marginBottom: 8 }}>
                <div style={{ fontSize: 13, color: '#92400e', fontWeight: 600, marginBottom: 6 }}>
                  {group.type === '이메일' ? '📧' : '🆔'} {group.type}: {group.key}
                </div>
                {group.users.map(u => {
                  const others = group.users.filter(x => x.id !== u.id)
                  return (
                    <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: 12, color: '#374151', flexWrap: 'wrap' }}>
                      <code style={{ background: '#f3f4f6', padding: '2px 8px', borderRadius: 4, fontSize: 11 }}>{u.id.slice(0, 16)}…</code>
                      <span>{u.성명 || '(이름없음)'} · {u.부서 || '-'} · {u.직급 || '-'}</span>
                      <span style={{ color: '#9ca3af' }}>사번: {u.사번 || '-'} · {u.이메일 || '-'}</span>
                      <div style={{ flex: 1 }} />
                      {others.map(o => (
                        <button
                          key={o.id}
                          onClick={() => mergeDuplicates(u.id, o.id)}
                          style={{ background: '#1a56db', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                        >
                          ← {o.id.slice(0, 8)}… 의 신청을 이쪽으로 병합
                        </button>
                      ))}
                    </div>
                  )
                })}
              </div>
            ))}
            <div style={{ fontSize: 11, color: '#92400e', marginTop: 6, opacity: 0.8 }}>
              💡 보존할 계정 행에서 병합 버튼을 누르면, 다른 계정의 신청 데이터를 그쪽으로 이관 후 중복 계정을 삭제합니다.
              Auth 계정 정리는 Firebase Console 에서 수동으로 진행하세요.
            </div>
          </div>
        )}

        {/* Stats cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14, marginBottom: 24 }}>
          <div style={statsCardStyle}>
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>전체 이용자</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#111827' }}>{totalCount}명</div>
          </div>
          <div style={statsCardStyle}>
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>직원</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#059669' }}>{employeeCount}명</div>
          </div>
          <div style={statsCardStyle}>
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>관리자</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#1a56db' }}>{adminCount}명</div>
          </div>
          <div style={statsCardStyle}>
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>휴직</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#f59e0b' }}>{leaveCount}명</div>
          </div>
          <div style={statsCardStyle}>
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>퇴사</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#dc2626' }}>{inactiveCount}명</div>
          </div>
        </div>

        {/* Search & Filters */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="이름, 사번으로 검색"
              style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 8, padding: '10px 14px', fontSize: 14, outline: 'none' }}
            />
          </div>
          <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)} style={filterSelectStyle}>
            <option value="">전체 부서</option>
            {departments.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} style={filterSelectStyle}>
            <option value="">전체 권한</option>
            <option value="admin">관리자</option>
            <option value="employee">직원</option>
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={filterSelectStyle}>
            <option value="">전체 상태</option>
            <option value="active">재직</option>
            <option value="leave">휴직</option>
            <option value="inactive">퇴사</option>
          </select>
          <button onClick={() => { setSearch(''); setDeptFilter(''); setRoleFilter(''); setStatusFilter('') }} style={{ background: '#1a56db', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>
            검색
          </button>
          <button onClick={() => { setSearch(''); setDeptFilter(''); setRoleFilter(''); setStatusFilter('') }} style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', fontSize: 16, color: '#6b7280' }}>
            ↻
          </button>
        </div>

        {/* Employee table */}
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#1a56db' }}>
                {['이름', '사번', '입사일자', '비밀번호', '부서', '권한', '승인', '관리'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', fontSize: 13 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dataLoading ? (
                <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>로딩 중...</td></tr>
              ) : finalFiltered.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>직원이 없습니다.</td></tr>
              ) : finalFiltered.map((u, idx) => {
                const statusLabel = u.status === 'inactive' ? '퇴사' : u.status === 'leave' ? '휴직' : '재직'
                const statusBg = u.status === 'inactive' ? '#fee2e2' : u.status === 'leave' ? '#fef3c7' : '#d1fae5'
                const statusColor = u.status === 'inactive' ? '#991b1b' : u.status === 'leave' ? '#92400e' : '#065f46'
                return (
                <tr key={u.id} style={{ borderBottom: '1px solid #f3f4f6', background: idx % 2 === 0 ? '#fff' : '#fafafa', opacity: u.status === 'inactive' ? 0.55 : u.status === 'leave' ? 0.75 : 1 }}>
                  <td style={{ padding: '12px 16px', fontWeight: 600, color: '#111827', textAlign: 'center' }}>{u.성명 || '-'}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'center', color: '#374151' }}>{u.사번 || '-'}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'center', color: '#6b7280' }}>{u.입사일 || '-'}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'center', color: '#9ca3af' }}>****</td>
                  <td style={{ padding: '12px 16px', textAlign: 'center', color: '#374151' }}>{u.부서 || '-'}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <span style={{
                      background: u.isAdmin ? '#dc2626' : '#059669',
                      color: '#fff',
                      padding: '3px 12px',
                      borderRadius: 12,
                      fontSize: 12,
                      fontWeight: 600,
                    }}>
                      {u.isAdmin ? '관리자' : '직원'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <span style={{
                      background: statusBg,
                      color: statusColor,
                      padding: '3px 12px',
                      borderRadius: 12,
                      fontSize: 12,
                      fontWeight: 600,
                    }}>
                      {statusLabel}
                    </span>
                    {u.status === 'leave' && u.leaveStart && (
                      <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>{u.leaveStart} ~ {u.leaveEnd}</div>
                    )}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <button
                      onClick={() => { setUserEditModal(u); setUserEditData({ 성명: u.성명, 부서: u.부서, 직급: u.직급, isAdmin: u.isAdmin, 이메일: u.이메일 }) }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#6b7280' }}
                    >···</button>
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
          <div style={{ padding: '12px 16px', borderTop: '1px solid #f3f4f6', color: '#6b7280', fontSize: 13 }}>
            총 {finalFiltered.length}명
          </div>
        </div>
      </div>

      {/* Edit modal */}
      {userEditModal && (
        <ModalOverlay onClose={() => setUserEditModal(null)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h3 style={{ fontSize: 17, fontWeight: 700 }}>직원 정보 수정</h3>
            <button onClick={() => setUserEditModal(null)} style={closeBtn}>✕</button>
          </div>
          {[
            { label: '이름', key: '성명' as const, type: 'text' },
            { label: '이메일 (로그인용)', key: '이메일' as const, type: 'email' },
          ].map(({ label, key, type }) => (
            <div key={key} style={{ marginBottom: 14 }}>
              <label style={labelS}>{label}</label>
              <input
                type={type} value={(userEditData[key] as string) || ''}
                onChange={e => setUserEditData(p => ({ ...p, [key]: e.target.value }))}
                style={inputS}
              />
            </div>
          ))}
          <div style={{ marginBottom: 14 }}>
            <label style={labelS}>부서</label>
            <input type="text" value={userEditData.부서 || ''} onChange={e => setUserEditData(p => ({ ...p, 부서: e.target.value }))} placeholder="부서명 입력" style={inputS} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelS}>직급</label>
            <input type="text" value={userEditData.직급 || ''} onChange={e => setUserEditData(p => ({ ...p, 직급: e.target.value }))} placeholder="직급 입력" style={inputS} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={!!userEditData.isAdmin} onChange={e => setUserEditData(p => ({ ...p, isAdmin: e.target.checked }))} />
              <span style={{ fontWeight: 600, fontSize: 13 }}>관리자 권한</span>
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button onClick={handleUserSave} style={{ ...btnAction, background: '#1a56db' }}>저장</button>
            <button onClick={() => { setPwModal(userEditModal); setUserEditModal(null); setPwValue(''); setPwMsg('') }} style={{ ...btnAction, background: '#7c3aed' }}>비밀번호</button>
            <button onClick={() => setUserEditModal(null)} style={{ ...btnAction, background: '#6b7280' }}>취소</button>
          </div>
          <div style={{ display: 'flex', gap: 8, paddingTop: 12, borderTop: '1px solid #f3f4f6', flexWrap: 'wrap' }}>
            {userEditModal.status === 'leave' ? (
              <button onClick={() => handleReturnFromLeave(userEditModal)} style={{ ...btnAction, background: '#059669', fontSize: 13 }}>
                복직 처리
              </button>
            ) : userEditModal.status === 'inactive' ? (
              <button onClick={() => handleDeactivate(userEditModal)} style={{ ...btnAction, background: '#059669', fontSize: 13 }}>
                복직 처리
              </button>
            ) : (
              <>
                <button onClick={() => { setLeaveModal(userEditModal); setLeaveStart(''); setLeaveEnd('') }} style={{ ...btnAction, background: '#f59e0b', fontSize: 13 }}>
                  휴직 처리
                </button>
                <button onClick={() => handleDeactivate(userEditModal)} style={{ ...btnAction, background: '#6b7280', fontSize: 13 }}>
                  퇴사 처리
                </button>
              </>
            )}
            <button onClick={() => { setUserDeleteConfirm(userEditModal); setUserEditModal(null) }} style={{ ...btnAction, background: '#dc2626', fontSize: 13 }}>삭제</button>
          </div>
        </ModalOverlay>
      )}

      {/* Password modal */}
      {pwModal && (
        <ModalOverlay onClose={() => { setPwModal(null); setPwValue(''); setPwMsg('') }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <h3 style={{ fontSize: 17, fontWeight: 700 }}>비밀번호 관리</h3>
            <button onClick={() => { setPwModal(null); setPwValue(''); setPwMsg('') }} style={closeBtn}>✕</button>
          </div>
          <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 20 }}>{pwModal.성명} ({pwModal.사번}) 의 비밀번호를 변경합니다.</p>
          <div style={{ marginBottom: 20, padding: 16, background: '#eff6ff', borderRadius: 8, border: '1px solid #bfdbfe' }}>
            <p style={{ fontWeight: 600, marginBottom: 8, color: '#1e40af' }}>기본값으로 초기화</p>
            <p style={{ color: '#374151', fontSize: 13, marginBottom: 12 }}>비밀번호를 <strong>lofa1234!</strong> 로 초기화합니다.</p>
            <button onClick={() => handleResetPassword(true)} disabled={pwLoading}
              style={{ background: '#1a56db', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 20px', fontWeight: 600, cursor: pwLoading ? 'not-allowed' : 'pointer', fontSize: 13 }}>
              {pwLoading ? '처리 중...' : 'lofa1234! 로 초기화'}
            </button>
          </div>
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontWeight: 600, marginBottom: 8, color: '#374151' }}>직접 비밀번호 설정</p>
            <input type="password" value={pwValue} onChange={e => setPwValue(e.target.value)}
              placeholder="새 비밀번호 (6자 이상)" style={{ ...inputS, marginBottom: 10 }} />
            <button onClick={() => handleResetPassword(false)} disabled={pwLoading}
              style={{ background: '#374151', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 20px', fontWeight: 600, cursor: pwLoading ? 'not-allowed' : 'pointer', fontSize: 13 }}>
              {pwLoading ? '처리 중...' : '비밀번호 설정'}
            </button>
          </div>
          {pwMsg && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: 10, color: '#dc2626', fontSize: 13 }}>{pwMsg}</div>}
        </ModalOverlay>
      )}

      {/* Leave modal */}
      {leaveModal && (
        <ModalOverlay onClose={() => setLeaveModal(null)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h3 style={{ fontSize: 17, fontWeight: 700 }}>휴직 처리</h3>
            <button onClick={() => setLeaveModal(null)} style={closeBtn}>✕</button>
          </div>
          <p style={{ color: '#374151', fontSize: 14, marginBottom: 20 }}>
            <strong>{leaveModal.성명}</strong> ({leaveModal.사번}) 님의 휴직 기간을 입력해주세요.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
            <div>
              <label style={labelS}>휴직 시작일</label>
              <input type="date" value={leaveStart} onChange={e => setLeaveStart(e.target.value)} style={inputS} />
            </div>
            <div>
              <label style={labelS}>휴직 종료일</label>
              <input type="date" value={leaveEnd} onChange={e => setLeaveEnd(e.target.value)} style={inputS} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleLeave} style={{ ...btnAction, background: '#f59e0b' }}>휴직 처리</button>
            <button onClick={() => setLeaveModal(null)} style={{ ...btnAction, background: '#6b7280' }}>취소</button>
          </div>
        </ModalOverlay>
      )}

      {/* Delete confirm modal */}
      {userDeleteConfirm && (
        <ModalOverlay onClose={() => setUserDeleteConfirm(null)}>
          <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 12 }}>직원 삭제</h3>
          <p style={{ color: '#374151', marginBottom: 20 }}>
            <strong>{userDeleteConfirm.성명}</strong> ({userDeleteConfirm.사번}) 을 삭제하시겠습니까?<br />
            <span style={{ color: '#dc2626', fontSize: 13 }}>로그인 계정과 모든 데이터가 삭제됩니다. 취소 불가.</span>
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleDeleteUser} style={{ ...btnAction, background: '#dc2626' }}>삭제</button>
            <button onClick={() => setUserDeleteConfirm(null)} style={{ ...btnAction, background: '#6b7280' }}>취소</button>
          </div>
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

const btnAction: React.CSSProperties = { color: '#fff', border: 'none', borderRadius: 8, padding: '9px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }
const closeBtn: React.CSSProperties = { background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6b7280' }
const labelS: React.CSSProperties = { display: 'block', fontWeight: 600, marginBottom: 5, fontSize: 13, color: '#374151' }
const inputS: React.CSSProperties = { width: '100%', border: '1px solid #d1d5db', borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none', boxSizing: 'border-box' }
const statsCardStyle: React.CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '20px 24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }
const filterSelectStyle: React.CSSProperties = { border: '1px solid #d1d5db', borderRadius: 8, padding: '10px 14px', fontSize: 14, background: '#fff', cursor: 'pointer', outline: 'none', minWidth: 120 }

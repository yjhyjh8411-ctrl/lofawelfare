'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { collection, getDocs, doc, updateDoc, deleteDoc } from 'firebase/firestore'
import { getIdToken } from 'firebase/auth'
import { db } from '@/lib/firebase'
import { useAuth } from '@/lib/auth-context'

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
    await updateDoc(doc(db, 'users', u.id), { status: newStatus })
    setUsers(prev => prev.map(x => x.id === u.id ? { ...x, status: newStatus } : x))
    showMsg(newStatus === 'inactive' ? '퇴사처리 되었습니다.' : '복직처리 되었습니다.')
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
    if (res.ok) { setPwModal(null); setPwValue(''); showMsg(reset ? '비밀번호가 lofa1234!로 초기화되었습니다.' : '비밀번호가 변경되었습니다.') }
    else setPwMsg('오류가 발생했습니다.')
    setPwLoading(false)
  }

  const q = search.toLowerCase()
  const filtered = users.filter(u =>
    !q || u.성명?.toLowerCase().includes(q) || u.사번?.toLowerCase().includes(q) || u.부서?.toLowerCase().includes(q)
  )

  if (loading || !profile?.isAdmin) return null

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>

      {msg && (
        <div style={{ position: 'fixed', top: 66, left: '50%', transform: 'translateX(-50%)', background: '#1a56db', color: '#fff', padding: '12px 24px', borderRadius: 8, zIndex: 9999, fontWeight: 600, boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>
          {msg}
        </div>
      )}

      {/* Navbar */}
      <header style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', height: 56, padding: '0 20px', display: 'flex', alignItems: 'center', gap: 14, position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
        <button
          onClick={() => router.push('/admin')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: 14, display: 'flex', alignItems: 'center', gap: 4 }}
        >
          ← 관리자 홈
        </button>
        <div style={{ width: 1, height: 20, background: '#e5e7eb' }} />
        <div style={{ fontWeight: 700, fontSize: 15, color: '#111827' }}>👥 직원 정보 관리</div>
        <div style={{ flex: 1 }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="사번 / 이름 / 부서 검색..."
          style={{ width: 240, border: '1px solid #d1d5db', borderRadius: 8, padding: '6px 12px', fontSize: 13, outline: 'none' }}
        />
      </header>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 18px' }}>

        {/* Employee table */}
        <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                {['사번', '이름', '부서', '직급', '입사일', '전화번호', '이메일', '관리'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap', fontSize: 13 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dataLoading ? (
                <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>로딩 중...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>직원이 없습니다.</td></tr>
              ) : filtered.map((u, idx) => (
                <tr key={u.id} style={{ borderBottom: '1px solid #f3f4f6', background: idx % 2 === 0 ? '#fff' : '#fafafa', opacity: u.status === 'inactive' ? 0.55 : 1 }}>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ background: u.isAdmin ? '#fef3c7' : '#eff6ff', color: u.isAdmin ? '#92400e' : '#1a56db', padding: '2px 8px', borderRadius: 8, fontSize: 12, fontWeight: 700 }}>
                      {u.사번 || '-'}
                    </span>
                    {u.status === 'inactive' && <span style={{ marginLeft: 6, background: '#fee2e2', color: '#991b1b', padding: '1px 6px', borderRadius: 6, fontSize: 11, fontWeight: 600 }}>퇴사</span>}
                  </td>
                  <td style={{ padding: '12px 16px', fontWeight: 600, color: '#111827' }}>{u.성명 || '-'}</td>
                  <td style={{ padding: '12px 16px', color: '#374151' }}>{u.부서 || '-'}</td>
                  <td style={{ padding: '12px 16px', color: '#374151' }}>{u.직급 || '-'}</td>
                  <td style={{ padding: '12px 16px', color: '#6b7280' }}>{u.입사일 || '-'}</td>
                  <td style={{ padding: '12px 16px', color: '#6b7280' }}>{u.전화번호 || '-'}</td>
                  <td style={{ padding: '12px 16px', color: '#6b7280' }}>{u.이메일 || '-'}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <button
                      onClick={() => { setUserEditModal(u); setUserEditData({ 성명: u.성명, 부서: u.부서, 직급: u.직급, isAdmin: u.isAdmin, 이메일: u.이메일 }) }}
                      style={{ background: '#eff6ff', color: '#1a56db', border: 'none', borderRadius: 6, padding: '4px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                    >수정</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ padding: '12px 16px', borderTop: '1px solid #f3f4f6', color: '#6b7280', fontSize: 13 }}>
            총 {filtered.length}명
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
          <div style={{ display: 'flex', gap: 8, paddingTop: 12, borderTop: '1px solid #f3f4f6' }}>
            <button onClick={() => handleDeactivate(userEditModal)} style={{ ...btnAction, background: userEditModal.status === 'inactive' ? '#059669' : '#f59e0b', fontSize: 13 }}>
              {userEditModal.status === 'inactive' ? '복직 처리' : '퇴사 처리'}
            </button>
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

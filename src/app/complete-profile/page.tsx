'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { doc, setDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase'
import { onAuthStateChanged, signOut, deleteUser } from 'firebase/auth'

export default function CompleteProfilePage() {
  // signup 페이지와 동일한 입력 항목·필수 검증으로 통일
  const [form, setForm] = useState({
    employeeId: '',
    name: '',
    department: '',
    position: '',
    phone: '',
    hireDate: '',
    email: '',
  })
  const [googleEmail, setGoogleEmail] = useState('')
  const [uid, setUid] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) { router.push('/login'); return }
      setUid(user.uid)
      setGoogleEmail(user.email || '')
      // sessionStorage 에 저장된 사번 (login Google 모달에서 입력된 값) prefill
      let prefillEmp = ''
      try { prefillEmp = sessionStorage.getItem('signup_emp_id') || '' } catch { /* */ }
      setForm(prev => ({
        ...prev,
        name: user.displayName || '',
        email: user.email || '',
        employeeId: prefillEmp || prev.employeeId,
      }))
    })
    return () => unsubscribe()
  }, [router])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.employeeId || !form.name || !form.department || !form.position
        || !form.phone || !form.hireDate || !form.email) {
      setError('모든 항목을 입력해주세요.')
      return
    }
    setLoading(true)
    setError('')
    try {
      // 같은 이메일 또는 사번으로 가입된 다른 사용자가 있는지 최종 확인
      const checkEmail = (form.email || googleEmail).trim().toLowerCase()
      const checkEmp = form.employeeId.trim()
      try {
        const allSnap = await getDocs(collection(db, 'users'))
        const dupByEmail = checkEmail
          ? allSnap.docs.find(d => d.id !== uid && (d.data().이메일 || '').toLowerCase().trim() === checkEmail)
          : null
        const dupByEmp = checkEmp
          ? allSnap.docs.find(d => d.id !== uid && (d.data().사번 || '').trim() === checkEmp)
          : null
        if (dupByEmp || dupByEmail) {
          // Auth 계정 자체를 삭제하여 깨끗하게 정리
          try { if (auth.currentUser) await deleteUser(auth.currentUser) } catch { /* 실패해도 계속 */ }
          try { await signOut(auth) } catch { /* */ }
          const reason = dupByEmp
            ? `사번 ${checkEmp} 으로 이미 가입된 계정이 있습니다.`
            : `이미 ${checkEmail} 으로 가입된 계정이 있습니다.`
          setError(`${reason}\n기존 계정으로 로그인 후 [내 정보 설정] → [로그인 방법]에서 Google 계정 연동을 사용해주세요.`)
          setLoading(false)
          setTimeout(() => router.push('/login'), 4000)
          return
        }
      } catch (err) {
        console.error('[complete-profile-dup-check] failed:', err)
      }
      await setDoc(doc(db, 'users', uid), {
        사번: form.employeeId,
        성명: form.name,
        부서: form.department,
        직급: form.position,
        전화번호: form.phone,
        입사일: form.hireDate,
        이메일: form.email || googleEmail,
        isAdmin: false,
        status: 'active',
        accountStatus: 'pending',
        createdAt: serverTimestamp(),
      })
      try { sessionStorage.removeItem('signup_emp_id') } catch { /* */ }
      // Google 가입 직후 즉시 로그아웃 — 관리자 승인 후 로그인 가능
      try { await signOut(auth) } catch { /* */ }
      try { sessionStorage.setItem('lofa_pending_reason', 'pending') } catch { /* */ }
      router.push('/login?pending=1')
    } catch {
      setError('프로필 저장 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #1a56db 0%, #1e429f 100%)',
      padding: 20,
    }}>
      <div style={{
        background: '#fff', borderRadius: 12, padding: '40px 36px',
        width: 460, boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
      }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6, textAlign: 'center' }}>
          추가 정보 입력
        </h1>
        <p style={{ color: '#6b7280', fontSize: 13, textAlign: 'center', marginBottom: 24 }}>
          한국지방재정공제회 복지시스템 — 직원 정보를 입력해주세요.
        </p>

        {googleEmail && (
          <div style={{
            background: '#f0f9ff', border: '1px solid #bae6fd',
            borderRadius: 8, padding: '10px 14px', marginBottom: 20, fontSize: 13, color: '#0369a1',
          }}>
            <strong>Google 계정:</strong> {googleEmail}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>사번</label>
            <input type="text" name="employeeId" value={form.employeeId} onChange={handleChange} placeholder="사번을 입력하세요" style={inputStyle} />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>이름</label>
            <input type="text" name="name" value={form.name} onChange={handleChange} placeholder="성명을 입력하세요" style={inputStyle} />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>부서</label>
            <input type="text" name="department" value={form.department} onChange={handleChange} placeholder="부서명을 입력하세요" style={inputStyle} />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>직급</label>
            <input type="text" name="position" value={form.position} onChange={handleChange} placeholder="직급을 입력하세요" style={inputStyle} />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>전화번호</label>
            <input type="tel" name="phone" value={form.phone} onChange={handleChange} placeholder="예: 010-1234-5678" style={inputStyle} />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>입사일</label>
            <input type="date" name="hireDate" value={form.hireDate} onChange={handleChange} style={inputStyle} />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>이메일 (실제 이메일 주소)</label>
            <input type="email" name="email" value={form.email} onChange={handleChange} placeholder="예: hong@lofa.or.kr" style={inputStyle} />
            <p style={{ color: '#9ca3af', fontSize: 11, marginTop: 4 }}>로그인·알림 발송에 사용됩니다.</p>
          </div>

          {error && (
            <div style={{
              background: '#fef2f2', border: '1px solid #fecaca',
              borderRadius: 6, padding: '10px 14px',
              color: '#dc2626', fontSize: 13, marginBottom: 14,
              whiteSpace: 'pre-line', lineHeight: 1.5,
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', background: loading ? '#93c5fd' : '#1a56db',
              color: '#fff', border: 'none', borderRadius: 8,
              padding: '12px', fontSize: 15, fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer', marginTop: 6,
            }}
          >
            {loading ? '저장 중...' : '완료하기'}
          </button>
        </form>
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontWeight: 600, marginBottom: 5, color: '#374151', fontSize: 13,
}
const inputStyle: React.CSSProperties = {
  width: '100%', border: '1px solid #d1d5db', borderRadius: 8,
  padding: '9px 12px', fontSize: 14, outline: 'none', background: '#fff',
}

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth'
import { doc, setDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase'

export default function SignupPage() {
  const [form, setForm] = useState({
    employeeId: '', name: '', department: '', position: '',
    phone: '', hireDate: '',
    email: '', password: '', confirm: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()


  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.employeeId || !form.name || !form.department || !form.position || !form.phone || !form.hireDate || !form.email || !form.password) {
      setError('모든 항목을 입력해주세요.')
      return
    }
    if (form.password !== form.confirm) {
      setError('비밀번호가 일치하지 않습니다.')
      return
    }
    if (form.password.length < 6) {
      setError('비밀번호는 6자 이상이어야 합니다.')
      return
    }
    setLoading(true)
    setError('')
    try {
      // 사전 중복 검사 — Functions endpoint 사용 (미인증 호출 가능, 5초 timeout). 사번 검사는 가입 후 어드민이 처리.
      try {
        const ac = new AbortController()
        const t = setTimeout(() => ac.abort(), 5000)
        const r = await fetch('/api/lookup-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: form.email.trim() }),
          signal: ac.signal,
        }).finally(() => clearTimeout(t))
        const data = await r.json().catch(() => ({}))
        if (data?.authEmail) {
          setError('이미 같은 이메일로 가입된 계정이 있습니다. 로그인 또는 [비밀번호 찾기]를 이용해주세요.')
          setLoading(false)
          return
        }
      } catch (err) {
        // lookup-email 실패해도 가입 진행 — createUserWithEmailAndPassword 가 firebase auth 레벨로 이중 차단
        console.warn('[signup] lookup-email skipped:', err)
      }
      const cred = await createUserWithEmailAndPassword(auth, form.email, form.password)
      await setDoc(doc(db, 'users', cred.user.uid), {
        사번: form.employeeId,
        성명: form.name,
        부서: form.department,
        직급: form.position,
        전화번호: form.phone,
        입사일: form.hireDate,
        이메일: form.email,
        외부이메일: form.email,  // 가입 이메일 = 외부 이메일 — MFA OTP 발송용
        isAdmin: false,
        status: 'active',
        accountStatus: 'pending',
        createdAt: serverTimestamp(),
      })
      // 가입 직후 즉시 로그아웃 — 관리자 승인 후 로그인 가능.
      // signOut 은 fire-and-forget — Firestore listen 채널 cleanup 대기로 hang 하는 케이스를 피해
      // 곧바로 hard navigation 실행. 페이지 새로 로드 시 firebase auth 상태가 재평가됨.
      try {
        sessionStorage.setItem('lofa_pending_reason', 'pending')
        sessionStorage.removeItem('lofa_profile_cache')
        sessionStorage.removeItem('lofa_mfa_pass')
      } catch { /* */ }
      signOut(auth).catch(() => {})
      window.location.replace('/login?pending=1')
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err) {
        const code = (err as { code: string }).code
        if (code === 'auth/email-already-in-use') {
          setError('이미 사용 중인 이메일입니다.')
        } else if (code === 'auth/invalid-email') {
          setError('올바른 이메일 형식을 입력해주세요.')
        } else {
          setError('회원가입 중 오류가 발생했습니다.')
        }
      } else {
        setError('회원가입 중 오류가 발생했습니다.')
      }
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
          회원가입
        </h1>
        <p style={{ color: '#6b7280', fontSize: 13, textAlign: 'center', marginBottom: 28 }}>
          한국지방재정공제회 복지시스템
        </p>

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
            <label style={labelStyle}>이메일 (개인/외부 이메일)</label>
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              placeholder="예: myname@gmail.com / naver.com / daum.net"
              style={inputStyle}
            />
            <p style={{ color: '#9ca3af', fontSize: 11, marginTop: 4 }}>
              ⚠️ 사내망 밖(휴대폰·집)에서도 받을 수 있는 <strong>개인 이메일</strong>로 가입해주세요. 로그인 시 이 메일로 2차 인증번호가 발송됩니다.
            </p>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>비밀번호</label>
            <input type="password" name="password" value={form.password} onChange={handleChange} placeholder="6자 이상 입력하세요" style={inputStyle} />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>비밀번호 확인</label>
            <input type="password" name="confirm" value={form.confirm} onChange={handleChange} placeholder="비밀번호를 다시 입력하세요" style={inputStyle} />
          </div>

          {error && (
            <div style={{
              background: '#fef2f2', border: '1px solid #fecaca',
              borderRadius: 6, padding: '10px 14px',
              color: '#dc2626', fontSize: 13, marginBottom: 14,
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
            {loading ? '가입 중...' : '가입하기'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button
            onClick={() => router.push('/login')}
            style={{ background: 'none', border: 'none', color: '#1a56db', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            ← 로그인으로 돌아가기
          </button>
        </div>
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

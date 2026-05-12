'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signOut } from 'firebase/auth'
import { auth } from '@/lib/firebase'

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
      // 가입은 Functions endpoint 가 admin SDK 로 원자적으로 처리 — 클라이언트 setDoc 의 long-polling 채널 이슈 회피
      const r = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.email.trim(),
          password: form.password,
          employeeId: form.employeeId.trim(),
          name: form.name.trim(),
          department: form.department.trim(),
          position: form.position.trim(),
          phone: form.phone.trim(),
          hireDate: form.hireDate,
        }),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) {
        setError(String(data?.error || '회원가입 중 오류가 발생했습니다.'))
        setLoading(false)
        return
      }
      // 가입 성공 — 어떤 클라이언트 firebase 세션도 만들지 않음 (서버에서만 처리됨)
      try {
        sessionStorage.setItem('lofa_pending_reason', 'pending')
        sessionStorage.removeItem('lofa_profile_cache')
        sessionStorage.removeItem('lofa_mfa_pass')
      } catch { /* */ }
      // 혹시 다른 흐름으로 firebase 세션이 살아있을 수도 있어 안전을 위해 signOut (fire-and-forget)
      signOut(auth).catch(() => {})
      window.location.replace('/login?pending=1')
    } catch {
      setError('회원가입 중 오류가 발생했습니다.')
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

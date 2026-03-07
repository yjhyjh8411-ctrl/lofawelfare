'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createUserWithEmailAndPassword } from 'firebase/auth'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase'

export default function SignupPage() {
  const [form, setForm] = useState({
    employeeId: '', name: '', department: '', position: '',
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
    if (!form.employeeId || !form.name || !form.department || !form.position || !form.email || !form.password) {
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
      const cred = await createUserWithEmailAndPassword(auth, form.email, form.password)
      await setDoc(doc(db, 'users', cred.user.uid), {
        사번: form.employeeId,
        성명: form.name,
        부서: form.department,
        직급: form.position,
        이메일: form.email,
        isAdmin: false,
        status: 'active',
        createdAt: serverTimestamp(),
      })
      router.push('/main')
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
            <label style={labelStyle}>이메일 (실제 이메일 주소)</label>
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              placeholder="예: hong@lofa.or.kr"
              style={inputStyle}
            />
            <p style={{ color: '#9ca3af', fontSize: 11, marginTop: 4 }}>로그인 시 사용할 이메일입니다.</p>
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

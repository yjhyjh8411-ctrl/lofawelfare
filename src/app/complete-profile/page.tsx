'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase'
import { onAuthStateChanged } from 'firebase/auth'

export default function CompleteProfilePage() {
  const [form, setForm] = useState({
    employeeId: '',
    name: '',
    email: '',
    department: '',
    departmentCustom: '',
    business: '',
    position: '',
    joinDate: '',
    phone: '',
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
      setForm(prev => ({
        ...prev,
        name: user.displayName || '',
        email: user.email || '',
      }))
    })
    return () => unsubscribe()
  }, [router])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.employeeId || !form.name || !form.department || !form.position) {
      setError('사번, 이름, 부서, 직급은 필수 항목입니다.')
      return
    }
    setLoading(true)
    setError('')
    try {
      await setDoc(doc(db, 'users', uid), {
        사번: form.employeeId,
        성명: form.name,
        부서: form.department,
        사업: form.business,
        직급: form.position,
        이메일: form.email || googleEmail,
        입사일: form.joinDate,
        전화번호: form.phone,
        isAdmin: false,
        status: 'active',
        createdAt: serverTimestamp(),
      })
      router.push('/main')
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
        width: 480, boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
      }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6, textAlign: 'center' }}>
          추가 정보 입력
        </h1>
        <p style={{ color: '#6b7280', fontSize: 13, textAlign: 'center', marginBottom: 24 }}>
          처음 로그인하셨습니다. 아래 정보를 입력해주세요.
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
          {/* 사번 */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>사번 <Required /></label>
            <input type="text" name="employeeId" value={form.employeeId} onChange={handleChange} placeholder="사번을 입력하세요" style={inputStyle} />
          </div>

          {/* 이름 */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>이름 <Required /></label>
            <input type="text" name="name" value={form.name} onChange={handleChange} placeholder="성명을 입력하세요" style={inputStyle} />
          </div>

          {/* 이메일 */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>이메일</label>
            <input type="email" name="email" value={form.email} onChange={handleChange} placeholder="이메일 주소" style={inputStyle} />
          </div>

          {/* 부서 */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>부서 <Required /></label>
            <input type="text" name="department" value={form.department} onChange={handleChange} placeholder="부서명을 입력하세요" style={inputStyle} />
          </div>

          {/* 사업 */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>사업</label>
            <input type="text" name="business" value={form.business} onChange={handleChange} placeholder="담당 사업명 (선택)" style={inputStyle} />
          </div>

          {/* 직급 */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>직급 <Required /></label>
            <input type="text" name="position" value={form.position} onChange={handleChange} placeholder="직급을 입력하세요" style={inputStyle} />
          </div>

          {/* 입사일 */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>입사일</label>
            <input type="date" name="joinDate" value={form.joinDate} onChange={handleChange} style={inputStyle} />
          </div>

          {/* 전화번호 */}
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>전화번호</label>
            <input type="tel" name="phone" value={form.phone} onChange={handleChange} placeholder="예: 010-1234-5678" style={inputStyle} />
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
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? '저장 중...' : '완료하기'}
          </button>
        </form>
      </div>
    </div>
  )
}

function Required() {
  return <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontWeight: 600, marginBottom: 5, color: '#374151', fontSize: 13,
}
const inputStyle: React.CSSProperties = {
  width: '100%', border: '1px solid #d1d5db', borderRadius: 8,
  padding: '9px 12px', fontSize: 14, outline: 'none', background: '#fff',
}

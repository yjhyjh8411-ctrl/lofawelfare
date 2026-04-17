'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) { setError('이메일과 비밀번호를 입력해주세요.'); return }
    setLoading(true); setError('')
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password)
      const ud = await getDoc(doc(db, 'users', cred.user.uid))
      router.push(ud.exists() && (ud.data()?.role === 'admin' || ud.data()?.isAdmin) ? '/admin' : '/main')
    } catch {
      try {
        const res = await fetch('/api/lookup-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        })
        const data = await res.json()
        if (data.authEmail && data.authEmail !== email) {
          const cred2 = await signInWithEmailAndPassword(auth, data.authEmail, password)
          const ud2 = await getDoc(doc(db, 'users', cred2.user.uid))
          router.push(ud2.exists() && ud2.data()?.role === 'admin' ? '/admin' : '/main')
          return
        }
      } catch { /* lookup 실패 시 무시 */ }
      setError('이메일 또는 비밀번호가 올바르지 않습니다.')
    }
    finally { setLoading(false) }
  }

  const handleGoogleLogin = async () => {
    setGoogleLoading(true); setError('')
    try {
      const result = await signInWithPopup(auth, new GoogleAuthProvider())
      const userDoc = await getDoc(doc(db, 'users', result.user.uid))
      const dest = !userDoc.exists() ? '/complete-profile' : (userDoc.data()?.role === 'admin' || userDoc.data()?.isAdmin) ? '/admin' : '/main'
      router.push(dest)
    } catch (err: unknown) {
      const code = err && typeof err === 'object' && 'code' in err ? (err as { code: string }).code : ''
      const msg = err && typeof err === 'object' && 'message' in err ? (err as { message: string }).message : String(err)
      if (code !== 'auth/popup-closed-by-user') {
        setError(`Google 로그인 오류: ${code || msg}`)
      }
    } finally { setGoogleLoading(false) }
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }}>
      <div style={{
        width: 420, background: '#fff', borderRadius: 16,
        boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
        padding: '48px 40px',
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%', background: '#1a56db',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px', color: '#fff', fontSize: 24, fontWeight: 800,
          }}>
            W
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: '#111827', marginBottom: 4 }}>
            한국지방재정공제회
          </h1>
          <p style={{ color: '#6b7280', fontSize: 14 }}>사내근로복지기금 시스템</p>
        </div>

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>이메일</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="이메일 주소를 입력하세요"
              style={inputStyle}
              onFocus={e => e.target.style.borderColor = '#1a56db'}
              onBlur={e => e.target.style.borderColor = '#d1d5db'}
            />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>비밀번호</label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="비밀번호를 입력하세요"
              style={inputStyle}
              onFocus={e => e.target.style.borderColor = '#1a56db'}
              onBlur={e => e.target.style.borderColor = '#d1d5db'}
            />
          </div>

          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', color: '#dc2626', fontSize: 13, marginBottom: 16 }}>
              {error}
            </div>
          )}

          <button
            type="submit" disabled={loading}
            style={{
              width: '100%', background: loading ? '#9ca3af' : '#1a56db',
              color: '#fff', border: 'none', borderRadius: 10,
              padding: '14px', fontSize: 15, fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s',
            }}
          >
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </form>

        <div style={{ display: 'flex', alignItems: 'center', margin: '20px 0' }}>
          <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
          <span style={{ margin: '0 12px', color: '#9ca3af', fontSize: 12 }}>또는</span>
          <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
        </div>

        <button
          onClick={handleGoogleLogin} disabled={googleLoading}
          style={{
            width: '100%', background: '#fff', color: '#374151',
            border: '1.5px solid #e5e7eb', borderRadius: 10,
            padding: '13px', fontSize: 14, fontWeight: 500,
            cursor: googleLoading ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            opacity: googleLoading ? 0.6 : 1, transition: 'all 0.2s',
          }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = '#1a56db')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = '#e5e7eb')}
        >
          <GoogleIcon />
          Google 계정으로 로그인
        </button>

        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <span style={{ color: '#9ca3af', fontSize: 13 }}>계정이 없으신가요? </span>
          <button
            onClick={() => router.push('/signup')}
            style={{ background: 'none', border: 'none', color: '#1a56db', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
          >
            회원가입
          </button>
        </div>
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"/>
      <path fill="#EA4335" d="M9 3.583c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.163 6.656 3.583 9 3.583z"/>
    </svg>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', background: '#f9fafb',
  border: '1.5px solid #d1d5db', borderRadius: 10,
  padding: '12px 14px', fontSize: 14, color: '#111827', outline: 'none',
  boxSizing: 'border-box', transition: 'border-color 0.2s',
}

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
      await signInWithEmailAndPassword(auth, email, password)
      router.push('/main')
    } catch { setError('이메일 또는 비밀번호가 올바르지 않습니다.') }
    finally { setLoading(false) }
  }

  const handleGoogleLogin = async () => {
    setGoogleLoading(true); setError('')
    try {
      const result = await signInWithPopup(auth, new GoogleAuthProvider())
      const userDoc = await getDoc(doc(db, 'users', result.user.uid))
      router.push(userDoc.exists() ? '/main' : '/complete-profile')
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err) {
        if ((err as { code: string }).code !== 'auth/popup-closed-by-user')
          setError('구글 로그인 중 오류가 발생했습니다.')
      }
    } finally { setGoogleLoading(false) }
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0a0a0f' }}>

      {/* ── Left: Spline 3D robot ── */}
      <div style={{
        flex: 1, position: 'relative', overflow: 'hidden',
        background: 'linear-gradient(135deg, #0a0a0f 0%, #0d1a2e 50%, #0a0a0f 100%)',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      }}>
        {/* Top label */}
        <div style={{ padding: '28px 36px', zIndex: 10, position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 9,
              background: 'linear-gradient(135deg, #4285f4, #34a853)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17,
            }}>🏛️</div>
            <span style={{ fontWeight: 700, fontSize: 15, color: '#fff', letterSpacing: -0.3 }}>
              한국지방재정공제회
            </span>
          </div>
        </div>

        {/* Spline scene */}
        <iframe
          src="https://my.spline.design/nexbotrobotcharacterconcept-yI384myqm3a8CG5evYyOeyWn/"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
          allow="autoplay"
        />

        {/* Bottom text */}
        <div style={{ padding: '32px 36px', zIndex: 10, position: 'relative' }}>
          <h2 style={{ fontSize: 28, fontWeight: 800, color: '#fff', letterSpacing: -0.8, marginBottom: 8, lineHeight: 1.3 }}>
            복지기금<br />신청 시스템
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, lineHeight: 1.6 }}>
            임직원 복지 서비스를 빠르고 편리하게
          </p>
        </div>
      </div>

      {/* ── Right: Login form ── */}
      <div style={{
        width: 440, flexShrink: 0,
        background: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '40px 48px',
      }}>
        <div style={{ width: '100%' }}>
          <div style={{ marginBottom: 36 }}>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: '#0d0d0d', marginBottom: 6, letterSpacing: -0.5 }}>
              로그인
            </h1>
            <p style={{ color: '#9ca3af', fontSize: 14 }}>복지신청 시스템에 오신 것을 환영합니다</p>
          </div>

          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: 14 }}>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="이메일 주소"
                style={{
                  width: '100%', background: '#f8f9fa',
                  border: '1.5px solid #e5e7eb', borderRadius: 10,
                  padding: '13px 15px', fontSize: 14, color: '#0d0d0d', outline: 'none',
                  boxSizing: 'border-box', transition: 'border-color 0.2s',
                }}
                onFocus={e => e.target.style.borderColor = '#4285f4'}
                onBlur={e => e.target.style.borderColor = '#e5e7eb'}
              />
            </div>
            <div style={{ marginBottom: 22 }}>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="비밀번호"
                style={{
                  width: '100%', background: '#f8f9fa',
                  border: '1.5px solid #e5e7eb', borderRadius: 10,
                  padding: '13px 15px', fontSize: 14, color: '#0d0d0d', outline: 'none',
                  boxSizing: 'border-box', transition: 'border-color 0.2s',
                }}
                onFocus={e => e.target.style.borderColor = '#4285f4'}
                onBlur={e => e.target.style.borderColor = '#e5e7eb'}
              />
            </div>

            {error && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 12px', color: '#dc2626', fontSize: 13, marginBottom: 16 }}>
                {error}
              </div>
            )}

            <button
              type="submit" disabled={loading}
              style={{
                width: '100%', background: loading ? '#6b7280' : '#0d0d0d',
                color: '#fff', border: 'none', borderRadius: 10,
                padding: '14px', fontSize: 15, fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s', letterSpacing: -0.2,
              }}
            >
              {loading ? '로그인 중...' : '로그인 →'}
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
            onMouseEnter={e => (e.currentTarget.style.borderColor = '#4285f4')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = '#e5e7eb')}
          >
            <GoogleIcon />
            {googleLoading ? '로그인 중...' : 'Google 계정으로 로그인'}
          </button>

          <div style={{ textAlign: 'center', marginTop: 24 }}>
            <span style={{ color: '#9ca3af', fontSize: 13 }}>계정이 없으신가요? </span>
            <button
              onClick={() => router.push('/signup')}
              style={{ background: 'none', border: 'none', color: '#4285f4', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
            >
              회원가입
            </button>
          </div>
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

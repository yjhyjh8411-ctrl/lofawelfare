'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { signOut, getIdToken } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { useAuth, markMfaPassedInSession } from '@/lib/auth-context'

export default function MfaPage() {
  const { user, profile, loading } = useAuth()
  const router = useRouter()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [hint, setHint] = useState('')
  const [autoSent, setAutoSent] = useState(false)

  useEffect(() => {
    if (!loading && !user) router.replace('/login')
  }, [loading, user, router])

  // 로딩 끝나고 mfaPreference 없으면 setup으로 자동 이동
  useEffect(() => {
    if (loading) return
    if (profile && !profile.mfaPreference) router.replace('/mfa/setup')
  }, [loading, profile, router])

  // 처음 진입 시 SMS/이메일이면 자동 발송
  useEffect(() => {
    if (!user || !profile || autoSent) return
    if (profile.mfaPreference === 'sms' || profile.mfaPreference === 'email') {
      setAutoSent(true)
      sendOtp()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, profile])

  const api = async (path: string, body?: object): Promise<{ ok: boolean; data: Record<string, unknown> }> => {
    if (!user) return { ok: false, data: { error: '로그인이 필요합니다.' } }
    const token = await getIdToken(user)
    const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body || {}) })
    const data = await r.json().catch(() => ({}))
    return { ok: r.ok, data }
  }

  const sendOtp = async () => {
    if (!profile || profile.mfaPreference === 'totp' || !profile.mfaPreference) return
    setBusy(true); setMsg(null)
    const r = await api('/api/mfa/send-otp', { channel: profile.mfaPreference })
    setBusy(false)
    if (!r.ok) { setMsg({ kind: 'err', text: String(r.data.error || '발송 실패') }); return }
    setHint(String(r.data.hint || ''))
    setMsg({ kind: 'ok', text: `${profile.mfaPreference === 'sms' ? '문자' : '이메일'}을 발송했습니다.` })
  }

  const verify = async () => {
    if (!profile?.mfaPreference) return
    setBusy(true); setMsg(null)
    const r = await api('/api/mfa/verify-otp', { code, mode: 'login', method: profile.mfaPreference })
    setBusy(false)
    if (!r.ok) { setMsg({ kind: 'err', text: String(r.data.error || '검증 실패') }); return }
    markMfaPassedInSession(user!.uid)
    router.replace(profile.isAdmin ? '/admin' : '/main')
  }

  const handleLogout = async () => {
    try { await signOut(auth) } catch { /* */ }
    router.replace('/login')
  }

  if (loading || !user || !profile) return <div style={center}>로딩 중...</div>

  const method = profile.mfaPreference
  if (!method) return <div style={center}>2차 인증 설정으로 이동 중...</div>

  return (
    <div style={pageWrap}>
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0, color: '#111827' }}>2차 인증</h1>
            <p style={{ fontSize: 13, color: '#6b7280', marginTop: 6, marginBottom: 0 }}>
              {method === 'totp' ? 'Google Authenticator 앱에 표시된 6자리 코드를 입력해주세요.'
                : method === 'sms' ? `등록된 휴대폰으로 6자리 인증번호를 발송했습니다.${hint ? ` (${hint})` : ''}`
                : `등록된 이메일로 6자리 인증번호를 발송했습니다.${hint ? ` (${hint})` : ''}`}
            </p>
          </div>
          <button onClick={handleLogout} style={textBtn}>로그아웃</button>
        </div>

        <input
          value={code} onChange={e => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
          placeholder="6자리 코드" inputMode="numeric" autoFocus
          style={otpInput}
        />
        {msg && (
          <div style={{ marginTop: 10, padding: '8px 12px', background: msg.kind === 'ok' ? '#f0fdf4' : '#fef2f2', border: `1px solid ${msg.kind === 'ok' ? '#bbf7d0' : '#fecaca'}`, color: msg.kind === 'ok' ? '#065f46' : '#991b1b', borderRadius: 8, fontSize: 12 }}>
            {msg.text}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button onClick={verify} disabled={busy || code.length !== 6} style={btnPrimary(busy || code.length !== 6)}>
            {busy ? '확인 중...' : '확인'}
          </button>
          {method !== 'totp' && (
            <button onClick={sendOtp} disabled={busy} style={btnSecondary}>재발송</button>
          )}
        </div>

        <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid #f3f4f6', fontSize: 11, color: '#9ca3af', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>현재 방식: {method === 'sms' ? '문자' : method === 'email' ? '이메일' : 'TOTP 앱'}</span>
          <button onClick={() => router.push('/mfa/setup')} style={{ background: 'none', border: 'none', color: '#1a56db', fontSize: 11, cursor: 'pointer', textDecoration: 'underline' }}>
            방식 변경
          </button>
        </div>
      </div>
    </div>
  )
}

const pageWrap: React.CSSProperties = {
  minHeight: '100vh',
  background: 'linear-gradient(135deg, #1a56db 0%, #1e429f 100%)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 20, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
}
const card: React.CSSProperties = {
  background: '#fff', borderRadius: 14, padding: '28px 28px 22px',
  width: 420, maxWidth: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
}
const otpInput: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  border: '1.5px solid #d1d5db', borderRadius: 10,
  padding: '14px 18px', fontSize: 22, letterSpacing: 8, textAlign: 'center', fontWeight: 700,
  outline: 'none',
}
const btnPrimary = (dis: boolean): React.CSSProperties => ({
  flex: 1, background: dis ? '#9ca3af' : '#1a56db', color: '#fff', border: 'none',
  borderRadius: 10, padding: '12px', fontSize: 14, fontWeight: 700,
  cursor: dis ? 'not-allowed' : 'pointer',
})
const btnSecondary: React.CSSProperties = { background: '#fff', color: '#1a56db', border: '1.5px solid #1a56db', borderRadius: 10, padding: '12px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }
const textBtn: React.CSSProperties = { background: 'none', border: 'none', color: '#6b7280', fontSize: 12, cursor: 'pointer', padding: 0 }
const center: React.CSSProperties = { textAlign: 'center', padding: 60, color: '#6b7280' }

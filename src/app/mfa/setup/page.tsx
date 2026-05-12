'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { doc, updateDoc } from 'firebase/firestore'
import { signOut, getIdToken } from 'firebase/auth'
import { auth, db } from '@/lib/firebase'
import { useAuth, markMfaPassedInSession } from '@/lib/auth-context'

type Stage = 'enter-email' | 'send' | 'verify'

export default function MfaSetupPage() {
  const { user, profile, loading, refreshProfile } = useAuth()
  const router = useRouter()
  const [stage, setStage] = useState<Stage>('send')
  const [personalEmail, setPersonalEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [hint, setHint] = useState('')
  const [autoSent, setAutoSent] = useState(false)

  useEffect(() => {
    if (!loading && !user) router.replace('/login')
  }, [loading, user, router])

  // 외부이메일이 없으면 우선 입력 단계로
  useEffect(() => {
    if (!profile) return
    if (!profile.personalEmail) {
      setStage('enter-email')
    } else {
      setStage('send')
    }
  }, [profile])

  // send 단계 진입 시 자동 OTP 발송 (한 번만)
  useEffect(() => {
    if (stage === 'send' && profile?.personalEmail && !autoSent && !busy) {
      setAutoSent(true)
      sendOtp()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, profile?.personalEmail])

  const api = async (path: string, body?: object): Promise<{ ok: boolean; data: Record<string, unknown> }> => {
    if (!user) return { ok: false, data: { error: '로그인이 필요합니다.' } }
    const token = await getIdToken(user)
    const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body || {}) })
    const data = await r.json().catch(() => ({}))
    return { ok: r.ok, data }
  }

  const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())

  const handleSavePersonalEmail = async () => {
    if (!user) return
    const trimmed = personalEmail.trim()
    if (!isValidEmail(trimmed)) { setMsg({ kind: 'err', text: '올바른 이메일 주소를 입력해주세요.' }); return }
    // 회사 이메일과 같은지 경고 (사내망에서 못 받는다는 취지)
    if (profile?.email && trimmed.toLowerCase() === profile.email.toLowerCase()) {
      if (!confirm('회사 이메일과 동일합니다. 사내망 밖(휴대폰)에서 받을 수 있는 개인 이메일을 권장합니다. 그래도 진행할까요?')) return
    }
    setBusy(true); setMsg(null)
    try {
      await updateDoc(doc(db, 'users', user.uid), { 외부이메일: trimmed })
      await refreshProfile()
      setStage('send')
      setAutoSent(false) // 다음 useEffect 가 자동 발송
    } catch (e) {
      setMsg({ kind: 'err', text: `저장 실패: ${e instanceof Error ? e.message : String(e)}` })
    } finally { setBusy(false) }
  }

  const sendOtp = async () => {
    setBusy(true); setMsg(null)
    const r = await api('/api/mfa/send-otp', { channel: 'email' })
    setBusy(false)
    if (!r.ok) {
      setMsg({ kind: 'err', text: String(r.data.error || '발송 실패') })
      return
    }
    setHint(String(r.data.hint || ''))
    setStage('verify')
    setMsg({ kind: 'ok', text: '인증번호를 발송했습니다. 메일함을 확인해주세요. (스팸함 포함)' })
  }

  const verifyOtp = async () => {
    setBusy(true); setMsg(null)
    const r = await api('/api/mfa/verify-otp', { code, mode: 'setup', method: 'email' })
    setBusy(false)
    if (!r.ok) { setMsg({ kind: 'err', text: String(r.data.error || '검증 실패') }); return }
    markMfaPassedInSession(user!.uid)
    await refreshProfile()
    setMsg({ kind: 'ok', text: '등록 완료. 잠시 후 이동합니다.' })
    setTimeout(() => router.replace(profile?.isAdmin ? '/admin' : '/main'), 800)
  }

  const handleLogout = async () => {
    try { await signOut(auth) } catch { /* */ }
    router.replace('/login')
  }

  if (loading || !user || !profile) return <div style={center}>로딩 중...</div>

  return (
    <div style={pageWrap}>
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: '#111827' }}>로그인 2차 인증 등록</h1>
            <p style={{ fontSize: 13, color: '#6b7280', marginTop: 6, marginBottom: 0 }}>
              계정 안전을 위해 이메일로 6자리 인증번호를 한 번 더 확인합니다.
            </p>
          </div>
          <button onClick={handleLogout} style={textBtn}>로그아웃</button>
        </div>

        {/* enter-email: 외부이메일 등록 */}
        {stage === 'enter-email' && (
          <div>
            <div style={infoBox}>
              <strong>외부 이메일 등록이 필요합니다.</strong>
              <p style={{ margin: '6px 0 0', fontSize: 12, lineHeight: 1.55 }}>
                사내망 밖(휴대폰·집)에서도 받을 수 있는 <strong>개인 이메일</strong>을 등록해주세요.<br/>
                회사 이메일은 사내망에서만 열리므로 외부 인증에 부적합합니다.
              </p>
            </div>
            <label style={lbl}>외부(개인) 이메일</label>
            <input
              type="email"
              value={personalEmail}
              onChange={e => setPersonalEmail(e.target.value)}
              placeholder="예: myname@gmail.com / naver.com / daum.net"
              style={inputBox}
              autoFocus
            />
            {msg && <MsgBox msg={msg} />}
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button onClick={handleSavePersonalEmail} disabled={busy} style={btnPrimary(busy)}>
                {busy ? '저장 중...' : '저장하고 인증번호 받기'}
              </button>
            </div>
            <div style={{ marginTop: 14, fontSize: 11, color: '#9ca3af' }}>
              💡 등록한 이메일은 향후 로그인 시마다 인증번호 받는 곳, 신청 결과 알림 받는 곳으로 사용됩니다.
            </div>
          </div>
        )}

        {/* send: 자동 발송 진행중 */}
        {stage === 'send' && (
          <div>
            <div style={infoBox}>
              📧 외부이메일 <strong>{profile.personalEmail}</strong>{hint && ` (${hint})`} 로 인증번호를 발송합니다.
            </div>
            {msg && <MsgBox msg={msg} />}
            {busy && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 12 }}>발송 중...</div>}
          </div>
        )}

        {/* verify: OTP 입력 */}
        {stage === 'verify' && (
          <div>
            <div style={infoBox}>
              📧 <strong>{profile.personalEmail}</strong>{hint && ` (${hint})`} 로 6자리 인증번호를 발송했습니다.
            </div>
            <input
              value={code}
              onChange={e => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
              placeholder="6자리 인증번호"
              inputMode="numeric"
              autoFocus
              style={otpInput}
            />
            {msg && <MsgBox msg={msg} />}
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button onClick={verifyOtp} disabled={busy || code.length !== 6} style={btnPrimary(busy || code.length !== 6)}>
                {busy ? '확인 중...' : '확인'}
              </button>
              <button onClick={sendOtp} disabled={busy} style={btnSecondary}>재발송</button>
              <button onClick={() => { setStage('enter-email'); setAutoSent(false); setMsg(null) }} disabled={busy} style={btnTertiary}>이메일 변경</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function MsgBox({ msg }: { msg: { kind: 'ok' | 'err'; text: string } }) {
  const bg = msg.kind === 'ok' ? '#f0fdf4' : '#fef2f2'
  const bd = msg.kind === 'ok' ? '#bbf7d0' : '#fecaca'
  const fg = msg.kind === 'ok' ? '#065f46' : '#991b1b'
  return (
    <div style={{ marginTop: 10, padding: '8px 12px', background: bg, border: `1px solid ${bd}`, color: fg, borderRadius: 8, fontSize: 12, whiteSpace: 'pre-line' }}>
      {msg.text}
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
  background: '#fff', borderRadius: 14, padding: '28px 28px 24px',
  width: 460, maxWidth: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
}
const infoBox: React.CSSProperties = {
  background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e40af',
  borderRadius: 10, padding: '12px 14px', fontSize: 13, marginBottom: 14, lineHeight: 1.55,
}
const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }
const inputBox: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  border: '1.5px solid #d1d5db', borderRadius: 10,
  padding: '12px 14px', fontSize: 14,
  outline: 'none',
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
const btnTertiary: React.CSSProperties = { background: '#fff', color: '#6b7280', border: '1px solid #d1d5db', borderRadius: 10, padding: '12px 14px', fontSize: 13, cursor: 'pointer' }
const textBtn: React.CSSProperties = { background: 'none', border: 'none', color: '#6b7280', fontSize: 12, cursor: 'pointer', padding: 0 }
const center: React.CSSProperties = { textAlign: 'center', padding: 60, color: '#6b7280' }

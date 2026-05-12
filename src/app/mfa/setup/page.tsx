'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { QRCodeSVG } from 'qrcode.react'
import { auth } from '@/lib/firebase'
import { signOut } from 'firebase/auth'
import { getIdToken } from 'firebase/auth'
import { useAuth, MfaMethod, markMfaPassedInSession } from '@/lib/auth-context'

type Stage = 'pick' | 'sms' | 'email' | 'totp'

export default function MfaSetupPage() {
  const { user, profile, loading, refreshProfile } = useAuth()
  const router = useRouter()
  const [stage, setStage] = useState<Stage>('pick')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [hint, setHint] = useState('')
  // TOTP
  const [totpUri, setTotpUri] = useState('')
  const [totpSecret, setTotpSecret] = useState('')

  useEffect(() => {
    if (!loading && !user) router.replace('/login')
  }, [loading, user, router])

  const api = async (path: string, body?: object): Promise<{ ok: boolean; data: Record<string, unknown> }> => {
    if (!user) return { ok: false, data: { error: '로그인이 필요합니다.' } }
    const token = await getIdToken(user)
    const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body || {}) })
    const data = await r.json().catch(() => ({}))
    return { ok: r.ok, data }
  }

  const sendOtp = async (channel: 'sms' | 'email') => {
    setBusy(true); setMsg(null)
    const r = await api('/api/mfa/send-otp', { channel })
    setBusy(false)
    if (!r.ok) { setMsg({ kind: 'err', text: String(r.data.error || '발송 실패') }); return }
    setHint(String(r.data.hint || ''))
    setMsg({ kind: 'ok', text: `${channel === 'sms' ? '문자' : '이메일'}을 발송했습니다.` })
  }

  const verifyOtp = async (method: MfaMethod) => {
    setBusy(true); setMsg(null)
    const r = await api('/api/mfa/verify-otp', { code, mode: 'setup', method })
    setBusy(false)
    if (!r.ok) { setMsg({ kind: 'err', text: String(r.data.error || '검증 실패') }); return }
    markMfaPassedInSession(user!.uid)
    await refreshProfile()
    setMsg({ kind: 'ok', text: '등록 완료. 잠시 후 이동합니다.' })
    setTimeout(() => router.replace(profile?.isAdmin ? '/admin' : '/main'), 800)
  }

  const startTotp = async () => {
    setBusy(true); setMsg(null); setCode('')
    const r = await api('/api/mfa/totp-setup')
    setBusy(false)
    if (!r.ok) { setMsg({ kind: 'err', text: String(r.data.error || 'TOTP 등록 실패') }); return }
    setTotpUri(String(r.data.otpauth || ''))
    setTotpSecret(String(r.data.secret || ''))
    setStage('totp')
  }

  const handleLogout = async () => {
    try { await signOut(auth) } catch { /* */ }
    router.replace('/login')
  }

  if (loading || !user) return <div style={center}>로딩 중...</div>

  return (
    <div style={pageWrap}>
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: '#111827' }}>로그인 2차 인증 등록</h1>
            <p style={{ fontSize: 13, color: '#6b7280', marginTop: 6, marginBottom: 0 }}>
              계정 안전을 위해 추가 인증 방식을 등록해주세요. 등록 후 로그인 시 이 방식으로 코드를 한 번 더 확인합니다.
            </p>
          </div>
          <button onClick={handleLogout} style={textBtn}>로그아웃</button>
        </div>

        {profile?.mfaPreference && (
          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e40af', borderRadius: 8, padding: '8px 12px', fontSize: 12, marginBottom: 14 }}>
            현재 등록된 방식: <strong>{label(profile.mfaPreference)}</strong> — 새 방식을 등록하면 교체됩니다.
          </div>
        )}

        {stage === 'pick' && (
          <div style={{ display: 'grid', gap: 12 }}>
            <MethodCard
              icon="📱"
              title="SMS OTP"
              desc={`등록된 휴대폰(${maskPhone(profile?.phone)})으로 6자리 인증번호를 받습니다.`}
              recommended
              disabled={!profile?.phone}
              disabledHint="전화번호가 없습니다 — [내 정보 설정]에서 먼저 등록해주세요."
              onClick={() => { setStage('sms'); setCode(''); setMsg(null); setHint('') }}
            />
            <MethodCard
              icon="📧"
              title="이메일 OTP"
              desc={`등록된 이메일(${maskEmail(profile?.email)})로 6자리 인증번호를 받습니다.`}
              onClick={() => { setStage('email'); setCode(''); setMsg(null); setHint('') }}
            />
            <MethodCard
              icon="🔐"
              title="TOTP (Google Authenticator)"
              desc="Google Authenticator / Authy 같은 앱에서 30초마다 회전하는 6자리 코드를 사용합니다. 보안 최강."
              onClick={startTotp}
            />
          </div>
        )}

        {stage === 'sms' && (
          <OtpForm
            title="SMS 인증"
            description={`등록된 휴대폰으로 6자리 인증번호를 발송했습니다.${hint ? ` (${hint})` : ''}`}
            code={code} setCode={setCode}
            busy={busy}
            onSend={() => sendOtp('sms')}
            onVerify={() => verifyOtp('sms')}
            onBack={() => { setStage('pick'); setCode(''); setMsg(null) }}
            msg={msg}
            sendLabel="문자 발송"
            autoSend
          />
        )}

        {stage === 'email' && (
          <OtpForm
            title="이메일 인증"
            description={`등록된 이메일로 6자리 인증번호를 발송했습니다.${hint ? ` (${hint})` : ''}`}
            code={code} setCode={setCode}
            busy={busy}
            onSend={() => sendOtp('email')}
            onVerify={() => verifyOtp('email')}
            onBack={() => { setStage('pick'); setCode(''); setMsg(null) }}
            msg={msg}
            sendLabel="이메일 발송"
            autoSend
          />
        )}

        {stage === 'totp' && (
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 8px' }}>TOTP 앱 등록</h3>
            <p style={{ fontSize: 12, color: '#6b7280', marginTop: 0, marginBottom: 14 }}>
              1) Google Authenticator / Authy 앱 설치 → 2) 아래 QR 스캔(또는 키 입력) → 3) 앱에 표시된 6자리 코드 입력
            </p>
            {totpUri && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: 16, background: '#f9fafb', borderRadius: 10, marginBottom: 12 }}>
                <QRCodeSVG value={totpUri} size={180} includeMargin />
                <div style={{ fontSize: 11, color: '#6b7280' }}>QR 스캔이 어렵다면 키를 직접 입력</div>
                <code style={{ fontSize: 12, background: '#fff', padding: '6px 10px', borderRadius: 6, border: '1px solid #e5e7eb', letterSpacing: 1, wordBreak: 'break-all', textAlign: 'center' }}>{totpSecret}</code>
              </div>
            )}
            <input
              value={code} onChange={e => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
              placeholder="앱에 표시된 6자리"
              inputMode="numeric"
              style={otpInput}
            />
            {msg && <MsgBox msg={msg} />}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button onClick={() => verifyOtp('totp')} disabled={busy || code.length !== 6} style={btnPrimary(busy || code.length !== 6)}>
                {busy ? '확인 중...' : '확인 및 등록'}
              </button>
              <button onClick={() => { setStage('pick'); setCode(''); setMsg(null); setTotpUri(''); setTotpSecret('') }} style={btnSecondary}>← 다른 방식 선택</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

interface MethodCardProps {
  icon: string
  title: string
  desc: string
  onClick: () => void
  recommended?: boolean
  disabled?: boolean
  disabledHint?: string
}
function MethodCard({ icon, title, desc, onClick, recommended, disabled, disabledHint }: MethodCardProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        textAlign: 'left',
        background: disabled ? '#f9fafb' : '#fff',
        border: '1px solid',
        borderColor: recommended ? '#1a56db' : '#e5e7eb',
        borderRadius: 10,
        padding: '14px 16px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        display: 'flex', gap: 12, alignItems: 'center',
      }}
    >
      <div style={{ fontSize: 24, flexShrink: 0 }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', display: 'flex', gap: 6, alignItems: 'center' }}>
          {title}
          {recommended && <span style={{ background: '#1a56db', color: '#fff', borderRadius: 4, fontSize: 10, padding: '1px 6px', fontWeight: 700 }}>추천</span>}
        </div>
        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{disabled ? (disabledHint || desc) : desc}</div>
      </div>
      <div style={{ color: '#9ca3af', fontSize: 18 }}>›</div>
    </button>
  )
}

interface OtpFormProps {
  title: string
  description: string
  code: string; setCode: (v: string) => void
  busy: boolean
  onSend: () => void
  onVerify: () => void
  onBack: () => void
  msg: { kind: 'ok' | 'err'; text: string } | null
  sendLabel: string
  autoSend?: boolean
}
function OtpForm({ title, description, code, setCode, busy, onSend, onVerify, onBack, msg, sendLabel, autoSend }: OtpFormProps) {
  const sent = useEffectFire(autoSend === true, onSend)
  return (
    <div>
      <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 6px' }}>{title}</h3>
      <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 14px' }}>{description}</p>
      <input
        value={code} onChange={e => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
        placeholder="6자리 인증번호" inputMode="numeric"
        style={otpInput}
      />
      {msg && <MsgBox msg={msg} />}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button onClick={onVerify} disabled={busy || code.length !== 6} style={btnPrimary(busy || code.length !== 6)}>
          {busy ? '확인 중...' : '확인'}
        </button>
        <button onClick={onSend} disabled={busy} style={btnSecondary}>
          {sent ? '재발송' : sendLabel}
        </button>
        <button onClick={onBack} disabled={busy} style={btnTertiary}>← 뒤로</button>
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

// 1회성 effect — autoSend true 면 한 번만 호출, 반환은 호출됐는지 여부
function useEffectFire(cond: boolean, cb: () => void): boolean {
  const [fired, setFired] = useState(false)
  useEffect(() => {
    if (cond && !fired) { setFired(true); cb() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cond])
  return fired
}

function label(m: MfaMethod | null): string {
  if (m === 'sms') return '문자 (SMS OTP)'
  if (m === 'email') return '이메일 OTP'
  if (m === 'totp') return 'TOTP 앱'
  return '없음'
}
function maskPhone(p?: string): string {
  if (!p) return '-'
  const digits = p.replace(/[^0-9]/g, '')
  if (digits.length < 4) return p
  return digits.slice(0, 3) + '-****-' + digits.slice(-4)
}
function maskEmail(e?: string): string {
  if (!e) return '-'
  const at = e.indexOf('@')
  if (at <= 1) return e
  return e.slice(0, 2) + '*'.repeat(Math.max(at - 2, 1)) + e.slice(at)
}

const pageWrap: React.CSSProperties = {
  minHeight: '100vh',
  background: 'linear-gradient(135deg, #1a56db 0%, #1e429f 100%)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 20, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
}
const card: React.CSSProperties = {
  background: '#fff', borderRadius: 14, padding: '28px 28px 24px',
  width: 480, maxWidth: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
}
const otpInput: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  border: '1.5px solid #d1d5db', borderRadius: 10,
  padding: '14px 18px', fontSize: 20, letterSpacing: 6, textAlign: 'center', fontWeight: 700,
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

'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { collection, getDocs, doc, setDoc, updateDoc } from 'firebase/firestore'
import { getIdToken } from 'firebase/auth'
import { db } from '@/lib/firebase'
import { useAuth } from '@/lib/auth-context'
import Navbar from '@/components/Navbar'

export default function AdminSettingsPage() {
  const { user, profile, loading } = useAuth()
  const router = useRouter()
  const [msg, setMsg] = useState('')

  // Email notification settings
  const [emailFrom, setEmailFrom] = useState('')
  const [emailPassword, setEmailPassword] = useState('')
  const [emailSaving, setEmailSaving] = useState(false)
  const [emailTestResult, setEmailTestResult] = useState('')

  // SMS settings
  const [smsForm, setSmsForm] = useState({ apiKey: '', apiSecret: '', from: '' })
  const [solapiConnected, setSolapiConnected] = useState(false)
  const [smsSaving, setSmsSaving] = useState(false)

  // 회계결산 공개 설정
  const [settlementPublic, setSettlementPublic] = useState(false)
  const [settlementSaving, setSettlementSaving] = useState(false)

  // Migration state
  const [migrOpen, setMigrOpen] = useState(false)
  const [newProjectId, setNewProjectId] = useState('')
  const [newClientEmail, setNewClientEmail] = useState('')
  const [newPrivateKey, setNewPrivateKey] = useState('')
  const [migrating, setMigrating] = useState(false)
  const [migrResult, setMigrResult] = useState<{ status: string; message: string; results?: Record<string, number> } | null>(null)

  useEffect(() => {
    if (!loading && !profile?.isAdmin) router.replace('/main')
  }, [profile, loading, router])

  useEffect(() => {
    if (!profile?.isAdmin) return
    // Check OAuth callback
    const params = new URLSearchParams(window.location.search)
    const gmailConn = params.get('gmail_connected')
    if (gmailConn) {
      showMsg('Gmail이 연동되었습니다: ' + gmailConn)
      window.history.replaceState({}, '', '/admin/settings/')
    }
    const solapiConn = params.get('solapi_connected')
    if (solapiConn) {
      setSolapiConnected(true)
      showMsg('Solapi가 연동되었습니다.')
      window.history.replaceState({}, '', '/admin/settings/')
    }

    getDocs(collection(db, 'settings')).then(snap => {
      const notifyDoc = snap.docs.find(d => d.id === 'notify')
      if (notifyDoc) {
        const nd = notifyDoc.data()
        setEmailFrom(nd.email?.from || '')
        setEmailPassword(nd.email?.password || '')
        if (nd.sms) {
          setSmsForm(f => ({ ...f, from: nd.sms.from || '' }))
          if (nd.sms.authType === 'oauth2') setSolapiConnected(true)
        }
      }
      const globalDoc = snap.docs.find(d => d.id === 'global')
      if (globalDoc) {
        setSettlementPublic(!!globalDoc.data()?.회계결산공개)
      }
    })
  }, [profile])

  const showMsg = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 3000) }

  const getToken = async () => {
    if (!user) throw new Error('로그인이 필요합니다.')
    return getIdToken(user)
  }

  const handleEmailSave = async () => {
    if (!emailFrom) { showMsg('발신 이메일을 입력해주세요.'); return }
    setEmailSaving(true)
    try {
      await setDoc(doc(db, 'settings', 'notify'), {
        email: { from: emailFrom, password: emailPassword, authType: 'password' },
      }, { merge: true })
      showMsg('이메일 설정이 저장되었습니다.')
    } catch { showMsg('저장 중 오류가 발생했습니다.') }
    finally { setEmailSaving(false) }
  }

  const handleEmailTest = async () => {
    setEmailTestResult('발송 중...')
    try {
      const token = await getToken()
      const res = await fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ type: 'email', email: emailFrom, subject: '[한국지방재정공제회] 테스트 메일', message: '이메일 발송 테스트입니다. 이 메일이 수신되면 정상적으로 설정된 것입니다.' }),
      })
      const data = await res.json()
      if (data.errors?.length) setEmailTestResult(`실패: ${data.errors.join(', ')}`)
      else if (data.results?.length) setEmailTestResult('✅ 테스트 메일 발송 성공!')
      else setEmailTestResult(`결과: ${data.message || JSON.stringify(data)}`)
    } catch (e) { setEmailTestResult(`오류: ${e instanceof Error ? e.message : String(e)}`) }
  }

  const handleSaveSmsSettings = async () => {
    setSmsSaving(true)
    try {
      const update: Record<string, string> = {}
      if (smsForm.apiKey) update['sms.apiKey'] = smsForm.apiKey
      if (smsForm.apiSecret) update['sms.apiSecret'] = smsForm.apiSecret
      if (smsForm.from) update['sms.from'] = smsForm.from
      await updateDoc(doc(db, 'settings', 'notify'), update)
      showMsg('SMS 설정이 저장되었습니다.')
    } catch { showMsg('저장 중 오류가 발생했습니다.') }
    finally { setSmsSaving(false) }
  }

  const handleSettlementToggle = async () => {
    setSettlementSaving(true)
    const newValue = !settlementPublic
    try {
      await setDoc(doc(db, 'settings', 'global'), { 회계결산공개: newValue }, { merge: true })
      setSettlementPublic(newValue)
      showMsg(newValue ? '회계결산이 공개로 설정되었습니다.' : '회계결산이 비공개로 설정되었습니다.')
    } catch {
      showMsg('저장 중 오류가 발생했습니다.')
    } finally {
      setSettlementSaving(false)
    }
  }

  const handleMigrate = async () => {
    if (!newProjectId || !newClientEmail || !newPrivateKey) {
      setMigrResult({ status: 'error', message: '모든 항목을 입력해주세요.' })
      return
    }
    if (!confirm('현재 데이터를 새 Firebase 프로젝트로 복사합니다. 계속하시겠습니까?')) return
    setMigrating(true)
    setMigrResult(null)
    try {
      const token = await getToken()
      const res = await fetch('/api/migrate-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          targetProjectId: newProjectId,
          targetClientEmail: newClientEmail,
          targetPrivateKey: newPrivateKey,
        }),
      })
      const data = await res.json()
      setMigrResult(data)
    } catch {
      setMigrResult({ status: 'error', message: '마이그레이션 중 오류가 발생했습니다.' })
    } finally {
      setMigrating(false)
    }
  }

  if (loading) return null

  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6' }}>
      <Navbar />
      {msg && (
        <div style={{ position: 'fixed', top: 72, left: '50%', transform: 'translateX(-50%)', background: '#1a56db', color: '#fff', padding: '12px 24px', borderRadius: 8, zIndex: 9999, fontWeight: 600 }}>
          {msg}
        </div>
      )}
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '32px 16px' }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', color: '#1a56db', cursor: 'pointer', fontSize: 13, marginBottom: 16 }}>← 관리자</button>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: '#111827', marginBottom: 24 }}>시스템 설정</h2>

        {/* 이메일 알림 설정 */}
        <div style={{ background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', marginBottom: 20 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>📧 이메일 알림 설정</h3>
          <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 16 }}>
            승인/반려 알림, 비밀번호 초기화 안내 등을 이메일로 발송합니다.
            <br />Gmail 앱 비밀번호가 필요합니다. (Google 계정 &gt; 보안 &gt; 2단계 인증 &gt; 앱 비밀번호)
          </p>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>발신 Gmail 주소</label>
            <input value={emailFrom} onChange={e => setEmailFrom(e.target.value)} placeholder="example@gmail.com" style={inputStyle} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>앱 비밀번호 (16자리)</label>
            <input type="password" value={emailPassword} onChange={e => setEmailPassword(e.target.value)} placeholder="xxxx xxxx xxxx xxxx" style={inputStyle} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleEmailSave} disabled={emailSaving} style={btnPrimary}>
              {emailSaving ? '저장 중...' : '설정 저장'}
            </button>
            <button onClick={handleEmailTest} disabled={!emailFrom} style={{ ...btnPrimary, background: '#059669' }}>
              테스트 메일 발송
            </button>
          </div>
          {emailTestResult && (
            <div style={{ marginTop: 12, padding: 12, borderRadius: 8, background: emailTestResult.startsWith('✅') ? '#f0fdf4' : '#fef2f2', fontSize: 13, color: emailTestResult.startsWith('✅') ? '#065f46' : '#dc2626' }}>
              {emailTestResult}
            </div>
          )}
        </div>

        {/* SMS 발송 설정 */}
        <div style={{ background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', marginBottom: 20 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>💬 SMS 발송 설정</h3>
          <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 16 }}>
            승인/반려 알림을 문자로도 발송할 수 있습니다.
          </p>
          {solapiConnected ? (
            <>
              <div style={{ background: '#d1fae5', borderRadius: 10, padding: '16px 18px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 24 }}>✅</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#065f46' }}>Solapi 연동됨</div>
                  <div style={{ fontSize: 13, color: '#047857', marginTop: 2 }}>OAuth2로 인증됩니다</div>
                </div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>발신번호</label>
                <input type="text" placeholder={smsForm.from || '01012345678'} defaultValue={smsForm.from}
                  onChange={e => setSmsForm(f => ({ ...f, from: e.target.value }))}
                  style={inputStyle} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleSaveSmsSettings} disabled={smsSaving}
                  style={{ ...btnPrimary, flex: 1 }}>
                  {smsSaving ? '저장 중...' : '저장'}
                </button>
                <button onClick={() => { window.location.href = '/api/solapi-oauth' }}
                  style={{ ...btnPrimary, background: '#6b7280' }}>다른 계정</button>
                <button onClick={async () => {
                  const token = await getToken()
                  await fetch('/api/solapi-oauth', { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } })
                  setSolapiConnected(false)
                  showMsg('Solapi 연동이 해제되었습니다.')
                }} style={{ ...btnPrimary, background: '#dc2626' }}>연동 해제</button>
              </div>
            </>
          ) : (
            <>
              <div style={{ background: '#fef9f0', border: '1px solid #fde68a', borderRadius: 10, padding: '14px 16px', marginBottom: 20, fontSize: 13, color: '#92400e' }}>
                Solapi 계정으로 로그인하면 API Key 없이 문자를 발송할 수 있습니다.
              </div>
              <button onClick={() => { window.location.href = '/api/solapi-oauth' }}
                style={{ width: '100%', background: '#fff', border: '2px solid #1a56db', borderRadius: 10, padding: '12px 16px', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 20, color: '#1a56db' }}>
                💬 Solapi 계정으로 로그인
              </button>
              <details style={{ marginBottom: 16 }}>
                <summary style={{ fontSize: 13, color: '#6b7280', cursor: 'pointer', marginBottom: 12 }}>API Key로 직접 설정</summary>
                <div style={{ paddingTop: 8 }}>
                  <div style={{ background: '#eff6ff', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#1e40af' }}>
                    <a href="https://console.solapi.com" target="_blank" rel="noopener noreferrer" style={{ color: '#1a56db' }}>Solapi 콘솔</a>에서 API Key를 확인하세요.
                  </div>
                  {[
                    { label: 'API Key', key: 'apiKey', placeholder: '미설정' },
                    { label: 'API Secret', key: 'apiSecret', placeholder: '미설정' },
                    { label: '발신번호', key: 'from', placeholder: smsForm.from || '01012345678' },
                  ].map(({ label, key, placeholder }) => (
                    <div key={key} style={{ marginBottom: 16 }}>
                      <label style={labelStyle}>{label}</label>
                      <input type={key === 'apiSecret' ? 'password' : 'text'} placeholder={placeholder}
                        onChange={e => setSmsForm(f => ({ ...f, [key]: e.target.value }))}
                        style={inputStyle} />
                    </div>
                  ))}
                  <button onClick={handleSaveSmsSettings} disabled={smsSaving}
                    style={{ ...btnPrimary, width: '100%' }}>
                    {smsSaving ? '저장 중...' : '저장'}
                  </button>
                </div>
              </details>
            </>
          )}
        </div>

        {/* 회계결산 공개 설정 */}
        <div style={{ background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', marginBottom: 20 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>📊 회계결산 공개 설정</h3>
          <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 16 }}>
            회계결산 현황을 일반 사용자에게 공개할지 설정합니다. 비공개 시 일반 사용자의 게시판 메뉴에서 숨겨집니다.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', background: settlementPublic ? '#f0fdf4' : '#f9fafb', border: `1px solid ${settlementPublic ? '#a7f3d0' : '#e5e7eb'}`, borderRadius: 10 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, color: settlementPublic ? '#065f46' : '#374151' }}>
                {settlementPublic ? '공개 상태' : '비공개 상태'}
              </div>
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                {settlementPublic ? '일반 사용자가 게시판에서 회계결산 현황을 볼 수 있습니다.' : '관리자만 회계결산 현황에 접근할 수 있습니다.'}
              </div>
            </div>
            <div
              onClick={settlementSaving ? undefined : handleSettlementToggle}
              style={{
                width: 50, height: 28, borderRadius: 14, padding: 3,
                background: settlementPublic ? '#059669' : '#d1d5db',
                cursor: settlementSaving ? 'default' : 'pointer',
                transition: 'background 0.2s', display: 'flex', alignItems: 'center',
                opacity: settlementSaving ? 0.5 : 1,
              }}
            >
              <div style={{
                width: 22, height: 22, borderRadius: '50%', background: '#fff',
                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                transform: settlementPublic ? 'translateX(22px)' : 'translateX(0)',
                transition: 'transform 0.2s',
              }} />
            </div>
          </div>
        </div>

        {/* Firebase 프로젝트 마이그레이션 */}
        <div style={{ background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <div
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', cursor: 'pointer' }}
            onClick={() => setMigrOpen(!migrOpen)}
          >
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700 }}>🔄 Firebase 프로젝트 전환 (데이터 마이그레이션)</h3>
              <p style={{ color: '#6b7280', fontSize: 12, marginTop: 4 }}>새 Firebase 프로젝트로 모든 데이터와 계정을 복사합니다.</p>
            </div>
            <span style={{ fontSize: 18, color: '#9ca3af' }}>{migrOpen ? '▲' : '▼'}</span>
          </div>

          {migrOpen && (
            <div style={{ marginTop: 20 }}>
              <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, padding: 12, marginBottom: 20 }}>
                <p style={{ color: '#92400e', fontSize: 13, fontWeight: 600 }}>⚠️ 주의사항</p>
                <ul style={{ color: '#92400e', fontSize: 12, marginTop: 6, paddingLeft: 16 }}>
                  <li>새 Firebase 프로젝트에서 Firestore와 Authentication을 먼저 활성화하세요.</li>
                  <li>마이그레이션 후 모든 직원 비밀번호가 lofa1234!로 초기화됩니다.</li>
                  <li>새 프로젝트의 서비스 계정(JSON) 정보가 필요합니다.</li>
                  <li>완료 후 새 프로젝트 정보로 .env.local 업데이트 및 재배포가 필요합니다.</li>
                </ul>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>새 프로젝트 ID</label>
                <input value={newProjectId} onChange={e => setNewProjectId(e.target.value)} placeholder="예: myproject-abc12" style={inputStyle} />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>서비스 계정 이메일 (client_email)</label>
                <input value={newClientEmail} onChange={e => setNewClientEmail(e.target.value)} placeholder="firebase-adminsdk-xxxxx@project-id.iam.gserviceaccount.com" style={inputStyle} />
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>서비스 계정 Private Key (private_key)</label>
                <textarea
                  value={newPrivateKey}
                  onChange={e => setNewPrivateKey(e.target.value)}
                  placeholder={'-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----'}
                  rows={5}
                  style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: 12 }}
                />
              </div>

              <button
                onClick={handleMigrate}
                disabled={migrating}
                style={{ ...btnPrimary, background: migrating ? '#9ca3af' : '#dc2626' }}
              >
                {migrating ? '마이그레이션 진행 중... (수 분 소요)' : '데이터 마이그레이션 시작'}
              </button>

              {migrResult && (
                <div style={{
                  marginTop: 16,
                  background: migrResult.status === 'success' ? '#f0fdf4' : '#fef2f2',
                  border: `1px solid ${migrResult.status === 'success' ? '#a7f3d0' : '#fecaca'}`,
                  borderRadius: 8, padding: 16,
                }}>
                  <p style={{ fontWeight: 700, color: migrResult.status === 'success' ? '#065f46' : '#dc2626', marginBottom: 8 }}>
                    {migrResult.status === 'success' ? '✅ 마이그레이션 완료' : '❌ 오류 발생'}
                  </p>
                  <p style={{ fontSize: 13, color: '#374151', marginBottom: 8 }}>{migrResult.message}</p>
                  {migrResult.results && (
                    <div style={{ fontSize: 12, color: '#6b7280' }}>
                      {Object.entries(migrResult.results).map(([k, v]) => (
                        <div key={k}>• {k}: {v}건 복사 완료</div>
                      ))}
                    </div>
                  )}
                  {migrResult.status === 'success' && (
                    <div style={{ marginTop: 10, padding: 10, background: '#eff6ff', borderRadius: 6, fontSize: 12, color: '#1e40af' }}>
                      <strong>다음 단계:</strong> 새 Firebase 프로젝트의 웹앱 Config와 Admin SDK 정보로 .env.local을 업데이트하고 재배포해주세요.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = { display: 'block', fontWeight: 600, marginBottom: 5, fontSize: 13, color: '#374151' }
const inputStyle: React.CSSProperties = { width: '100%', border: '1px solid #d1d5db', borderRadius: 8, padding: '9px 12px', fontSize: 14, outline: 'none', boxSizing: 'border-box' }
const btnPrimary: React.CSSProperties = { background: '#1a56db', color: '#fff', border: 'none', borderRadius: 8, padding: '11px 28px', fontWeight: 600, cursor: 'pointer' }

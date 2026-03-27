'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { collection, getDocs, doc, setDoc } from 'firebase/firestore'
import { getIdToken } from 'firebase/auth'
import { db } from '@/lib/firebase'
import { useAuth } from '@/lib/auth-context'
import Navbar from '@/components/Navbar'

export default function AdminSettingsPage() {
  const { user, profile, loading } = useAuth()
  const router = useRouter()
  const [annualBudget, setAnnualBudget] = useState('')
  const [usedBudget, setUsedBudget] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [settingsId, setSettingsId] = useState<string>('global')

  // Email sync state
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<{ status: string; message: string; results?: { uid: string; email: string; status: string; error?: string }[] } | null>(null)

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
    getDocs(collection(db, 'settings')).then(snap => {
      if (!snap.empty) {
        const d = snap.docs[0]
        setSettingsId(d.id)
        const data = d.data()
        setAnnualBudget(String(data['연간예산'] || 0))
        setUsedBudget(String(data['사용예산'] || 0))
      }
    })
  }, [profile])

  const showMsg = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 3000) }

  const getToken = async () => {
    if (!user) throw new Error('로그인이 필요합니다.')
    return getIdToken(user)
  }

  const handleSyncEmails = async () => {
    if (!confirm('Firestore의 이메일을 Firebase Auth 로그인 이메일로 동기화합니다. 계속하시겠습니까?')) return
    setSyncing(true)
    setSyncResult(null)
    try {
      const token = await getToken()
      const res = await fetch('/api/sync-emails', { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } })
      const data = await res.json()
      setSyncResult(data)
    } catch {
      setSyncResult({ status: 'error', message: '동기화 중 오류가 발생했습니다.' })
    } finally {
      setSyncing(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    await setDoc(doc(db, 'settings', settingsId), {
      연간예산: Number(annualBudget),
      사용예산: Number(usedBudget),
    }, { merge: true })
    setSaving(false)
    showMsg('설정이 저장되었습니다.')
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

  const annual = Number(annualBudget) || 0
  const used = Number(usedBudget) || 0
  const remaining = annual - used
  const pct = annual > 0 ? Math.min((used / annual) * 100, 100) : 0

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

        {/* 예산 설정 */}
        <div style={{ background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', marginBottom: 20 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>복지예산 설정</h3>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>연간 예산 (원)</label>
            <input type="number" value={annualBudget} onChange={e => setAnnualBudget(e.target.value)} placeholder="0" style={inputStyle} />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={labelStyle}>사용 예산 (원)</label>
            <input type="number" value={usedBudget} onChange={e => setUsedBudget(e.target.value)} placeholder="0" style={inputStyle} />
          </div>
          <div style={{ background: '#f9fafb', borderRadius: 8, padding: 16, marginBottom: 20 }}>
            <p style={{ fontWeight: 600, marginBottom: 10, color: '#374151' }}>미리보기</p>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}>
              <span style={{ color: '#6b7280' }}>사용: {used.toLocaleString()}원</span>
              <span style={{ color: '#6b7280' }}>총액: {annual.toLocaleString()}원</span>
            </div>
            <div style={{ background: '#e5e7eb', borderRadius: 8, height: 10, overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: pct > 80 ? '#ef4444' : '#1a56db', borderRadius: 8 }} />
            </div>
            <p style={{ color: '#6b7280', fontSize: 12, marginTop: 6 }}>
              잔여: {remaining.toLocaleString()}원 ({(100 - pct).toFixed(1)}%)
            </p>
          </div>
          <button onClick={handleSave} disabled={saving} style={btnPrimary}>
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>

        {/* 이메일 동기화 */}
        <div style={{ background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', marginBottom: 20 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>로그인 이메일 동기화</h3>
          <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 16 }}>
            Firestore에 저장된 각 직원의 실제 이메일로 Firebase 로그인 이메일을 업데이트합니다.
            <br />기존에 <code style={{ background: '#f3f4f6', padding: '1px 5px', borderRadius: 4 }}>사번@lofa.local</code> 형식으로 등록된 계정도 실제 이메일로 로그인할 수 있게 됩니다.
          </p>
          <button onClick={handleSyncEmails} disabled={syncing} style={{ ...btnPrimary, background: syncing ? '#9ca3af' : '#059669' }}>
            {syncing ? '동기화 중...' : '이메일 동기화 실행'}
          </button>
          {syncResult && (
            <div style={{
              marginTop: 16,
              background: syncResult.status === 'success' ? '#f0fdf4' : '#fef2f2',
              border: `1px solid ${syncResult.status === 'success' ? '#a7f3d0' : '#fecaca'}`,
              borderRadius: 8, padding: 16,
            }}>
              <p style={{ fontWeight: 700, color: syncResult.status === 'success' ? '#065f46' : '#dc2626', marginBottom: 8 }}>
                {syncResult.status === 'success' ? '✅ 동기화 완료' : '❌ 오류'}
              </p>
              <p style={{ fontSize: 13, color: '#374151', marginBottom: 8 }}>{syncResult.message}</p>
              {syncResult.results && (
                <div style={{ fontSize: 12, color: '#6b7280', maxHeight: 150, overflowY: 'auto' }}>
                  {syncResult.results.filter(r => r.status === 'updated').map(r => (
                    <div key={r.uid}>✅ {r.email} → 업데이트 완료</div>
                  ))}
                  {syncResult.results.filter(r => r.status === 'error').map(r => (
                    <div key={r.uid} style={{ color: '#dc2626' }}>❌ {r.email}: {r.error}</div>
                  ))}
                </div>
              )}
            </div>
          )}
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
const inputStyle: React.CSSProperties = { width: '100%', border: '1px solid #d1d5db', borderRadius: 8, padding: '9px 12px', fontSize: 14, outline: 'none' }
const btnPrimary: React.CSSProperties = { background: '#1a56db', color: '#fff', border: 'none', borderRadius: 8, padding: '11px 28px', fontWeight: 600, cursor: 'pointer' }

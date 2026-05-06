'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { doc, getDoc, updateDoc } from 'firebase/firestore'
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword, GoogleAuthProvider, linkWithPopup, unlink } from 'firebase/auth'
import { db, auth } from '@/lib/firebase'
import { useAuth } from '@/lib/auth-context'
import Navbar from '@/components/Navbar'

export default function ProfilePage() {
  const { user, profile, loading, refreshProfile } = useAuth()
  const router = useRouter()
  const [form, setForm] = useState({
    성명: '', 부서: '', 직급: '', 이메일: '', 전화번호: '', 입사일: '',
  })
  const [pw, setPw] = useState({ current: '', newPw: '', confirm: '' })
  const [msg, setMsg] = useState('')
  const [pwMsg, setPwMsg] = useState('')
  const [saving, setSaving] = useState(false)
  const [changingPw, setChangingPw] = useState(false)
  const [dataLoaded, setDataLoaded] = useState(false)
  const [linkProviders, setLinkProviders] = useState<string[]>([])
  const [linkBusy, setLinkBusy] = useState(false)
  const [linkMsg, setLinkMsg] = useState<{ type: 'ok' | 'err' | 'info'; text: string } | null>(null)

  useEffect(() => {
    if (!loading && !user) router.replace('/login')
  }, [user, loading, router])

  useEffect(() => {
    if (!user) return
    const load = async () => {
      const snap = await getDoc(doc(db, 'users', user.uid))
      if (snap.exists()) {
        const d = snap.data()
        setForm({
          성명: d['성명'] || '',
          부서: d['부서'] || '',
          직급: d['직급'] || '',
          이메일: d['이메일'] || '',
          전화번호: d['전화번호'] || '',
          입사일: d['입사일'] || '',
        })
      }
      setDataLoaded(true)
      setLinkProviders((auth.currentUser?.providerData || []).map(p => p.providerId))
    }
    load()
  }, [user])

  const refreshProviders = () => {
    setLinkProviders((auth.currentUser?.providerData || []).map(p => p.providerId))
  }

  const handleLinkGoogle = async () => {
    if (!auth.currentUser) return
    setLinkBusy(true); setLinkMsg(null)
    try {
      const result = await linkWithPopup(auth.currentUser, new GoogleAuthProvider())
      const linkedEmail = result.user.providerData.find(p => p.providerId === 'google.com')?.email
      refreshProviders()
      setLinkMsg({ type: 'ok', text: `Google 계정 연동 완료${linkedEmail ? ` — ${linkedEmail}` : ''}. 이제 두 가지 방법 모두로 로그인 가능합니다.` })
    } catch (err: unknown) {
      const code = err && typeof err === 'object' && 'code' in err ? (err as { code: string }).code : ''
      if (code === 'auth/popup-closed-by-user') {
        setLinkMsg(null)
      } else if (code === 'auth/credential-already-in-use' || code === 'auth/email-already-in-use') {
        setLinkMsg({ type: 'err', text: '해당 Google 계정은 이미 다른 사용자에 연결되어 있습니다. 다른 Google 계정을 사용해주세요.' })
      } else if (code === 'auth/provider-already-linked') {
        setLinkMsg({ type: 'info', text: '이미 Google 계정이 연동되어 있습니다.' })
        refreshProviders()
      } else {
        setLinkMsg({ type: 'err', text: '연동에 실패했습니다. 잠시 후 다시 시도해주세요.' })
      }
    } finally { setLinkBusy(false) }
  }

  const handleUnlinkGoogle = async () => {
    if (!auth.currentUser) return
    if (!confirm('Google 계정 연동을 해제하시겠습니까? 이후에는 이메일·비밀번호로만 로그인할 수 있습니다.')) return
    setLinkBusy(true); setLinkMsg(null)
    try {
      await unlink(auth.currentUser, 'google.com')
      refreshProviders()
      setLinkMsg({ type: 'ok', text: 'Google 계정 연동을 해제했습니다.' })
    } catch {
      setLinkMsg({ type: 'err', text: '연동 해제에 실패했습니다.' })
    } finally { setLinkBusy(false) }
  }

  const showMsg = (setter: (v: string) => void, m: string) => {
    setter(m)
    setTimeout(() => setter(''), 3000)
  }

  const handleSave = async () => {
    if (!user) return
    setSaving(true)
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        성명: form.성명,
        부서: form.부서,
        직급: form.직급,
        이메일: form.이메일,
        전화번호: form.전화번호,
        입사일: form.입사일,
      })
      await refreshProfile()
      showMsg(setMsg, '저장되었습니다.')
    } catch {
      showMsg(setMsg, '저장 중 오류가 발생했습니다.')
    } finally { setSaving(false) }
  }

  const handleChangePassword = async () => {
    if (!pw.current || !pw.newPw) { showMsg(setPwMsg, '현재 비밀번호와 새 비밀번호를 입력해주세요.'); return }
    if (pw.newPw !== pw.confirm) { showMsg(setPwMsg, '새 비밀번호가 일치하지 않습니다.'); return }
    if (pw.newPw.length < 6) { showMsg(setPwMsg, '비밀번호는 6자 이상이어야 합니다.'); return }
    setChangingPw(true)
    try {
      const currentUser = auth.currentUser
      if (!currentUser || !currentUser.email) throw new Error('no user')
      const credential = EmailAuthProvider.credential(currentUser.email, pw.current)
      await reauthenticateWithCredential(currentUser, credential)
      await updatePassword(currentUser, pw.newPw)
      setPw({ current: '', newPw: '', confirm: '' })
      showMsg(setPwMsg, '비밀번호가 변경되었습니다.')
    } catch (err: unknown) {
      const code = err && typeof err === 'object' && 'code' in err ? (err as { code: string }).code : ''
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        showMsg(setPwMsg, '현재 비밀번호가 올바르지 않습니다.')
      } else {
        showMsg(setPwMsg, '비밀번호 변경 중 오류가 발생했습니다.')
      }
    } finally { setChangingPw(false) }
  }

  // 비밀번호 변경은 password provider 연결된 경우만 가능
  // (Google 단독 사용자는 변경 불가, password+google 둘 다 있으면 가능)
  const hasPasswordProvider = linkProviders.includes('password')
  const isGoogleUser = !hasPasswordProvider && linkProviders.includes('google.com')

  if (loading || !dataLoaded) return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5' }}>
      <Navbar />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 36, height: 36, border: '3px solid #e5e7eb', borderTopColor: '#e8922a', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
          <span style={{ fontSize: 14, color: '#6b7280' }}>로딩 중...</span>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5' }}>
      <style>{`
        @keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        .profile-input { width: 100%; background: #f8f9fa; border: 1.5px solid #e5e7eb; border-radius: 10px; padding: 12px 14px; font-size: 14px; color: #111; outline: none; box-sizing: border-box; transition: border-color 0.2s; }
        .profile-input:focus { border-color: #e8922a; }
      `}</style>
      <Navbar />
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '32px 20px 60px' }}>

        <div style={{ marginBottom: 24, animation: 'fadeUp 0.4s ease-out' }}>
          <button onClick={() => router.back()} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 13, marginBottom: 12 }}>← 뒤로</button>
          <h2 style={{ fontSize: 24, fontWeight: 800, color: '#111827' }}>내 정보 설정</h2>
        </div>

        {/* 개인정보 수정 */}
        <div style={{ background: '#fff', borderRadius: 16, padding: '28px 28px', border: '1px solid #e5e7eb', marginBottom: 20, animation: 'fadeUp 0.4s ease-out 0.05s both' }}>
          <h3 style={{ fontSize: 17, fontWeight: 700, color: '#111827', marginBottom: 20 }}>개인정보</h3>

          {profile && (
            <div style={{ background: '#f8f9fa', borderRadius: 10, padding: '10px 14px', marginBottom: 20, fontSize: 13, color: '#6b7280' }}>
              사번: <strong style={{ color: '#111' }}>{profile.employeeId}</strong>
              <span style={{ margin: '0 10px', color: '#d1d5db' }}>|</span>
              로그인 이메일: <strong style={{ color: '#111' }}>{auth.currentUser?.email}</strong>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>성명</label>
              <input value={form.성명} onChange={e => setForm(p => ({ ...p, 성명: e.target.value }))} className="profile-input" />
            </div>
            <div>
              <label style={labelStyle}>부서</label>
              <input value={form.부서} onChange={e => setForm(p => ({ ...p, 부서: e.target.value }))} className="profile-input" />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>직급</label>
              <input value={form.직급} onChange={e => setForm(p => ({ ...p, 직급: e.target.value }))} className="profile-input" />
            </div>
            <div>
              <label style={labelStyle}>입사일</label>
              <input type="date" value={form.입사일} onChange={e => setForm(p => ({ ...p, 입사일: e.target.value }))} className="profile-input" />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
            <div>
              <label style={labelStyle}>회사 이메일</label>
              <input type="email" value={form.이메일} onChange={e => setForm(p => ({ ...p, 이메일: e.target.value }))} className="profile-input" />
            </div>
            <div>
              <label style={labelStyle}>전화번호</label>
              <input type="tel" value={form.전화번호} onChange={e => setForm(p => ({ ...p, 전화번호: e.target.value }))} className="profile-input" placeholder="010-1234-5678" />
            </div>
          </div>

          {msg && (
            <div style={{ background: msg.includes('오류') ? '#fef2f2' : '#f0fdf4', border: `1px solid ${msg.includes('오류') ? '#fecaca' : '#a7f3d0'}`, borderRadius: 10, padding: '10px 14px', fontSize: 13, color: msg.includes('오류') ? '#dc2626' : '#065f46', marginBottom: 14 }}>
              {msg}
            </div>
          )}

          <button onClick={handleSave} disabled={saving}
            style={{ background: saving ? '#9ca3af' : '#111827', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 28px', fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', transition: 'all 0.2s' }}>
            {saving ? '저장 중...' : '저장하기'}
          </button>
        </div>

        {/* 비밀번호 변경 */}
        <div style={{ background: '#fff', borderRadius: 16, padding: '28px 28px', border: '1px solid #e5e7eb', animation: 'fadeUp 0.4s ease-out 0.1s both' }}>
          <h3 style={{ fontSize: 17, fontWeight: 700, color: '#111827', marginBottom: 8 }}>비밀번호 변경</h3>

          {isGoogleUser ? (
            <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 10, padding: '14px 16px', fontSize: 13, color: '#0369a1', marginTop: 12 }}>
              Google 계정으로 로그인하셨습니다. 비밀번호는 Google 계정 설정에서 변경해주세요.
            </div>
          ) : (
            <>
              <p style={{ fontSize: 13, color: '#9ca3af', marginBottom: 16 }}>비밀번호를 변경하려면 현재 비밀번호를 먼저 입력해주세요.</p>
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>현재 비밀번호</label>
                <input type="password" value={pw.current} onChange={e => setPw(p => ({ ...p, current: e.target.value }))} className="profile-input" placeholder="현재 비밀번호" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
                <div>
                  <label style={labelStyle}>새 비밀번호</label>
                  <input type="password" value={pw.newPw} onChange={e => setPw(p => ({ ...p, newPw: e.target.value }))} className="profile-input" placeholder="6자 이상" />
                </div>
                <div>
                  <label style={labelStyle}>새 비밀번호 확인</label>
                  <input type="password" value={pw.confirm} onChange={e => setPw(p => ({ ...p, confirm: e.target.value }))} className="profile-input" placeholder="다시 입력" />
                </div>
              </div>

              {pwMsg && (
                <div style={{ background: pwMsg.includes('변경되었') ? '#f0fdf4' : '#fef2f2', border: `1px solid ${pwMsg.includes('변경되었') ? '#a7f3d0' : '#fecaca'}`, borderRadius: 10, padding: '10px 14px', fontSize: 13, color: pwMsg.includes('변경되었') ? '#065f46' : '#dc2626', marginBottom: 14 }}>
                  {pwMsg}
                </div>
              )}

              <button onClick={handleChangePassword} disabled={changingPw}
                style={{ background: changingPw ? '#9ca3af' : '#dc2626', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 28px', fontSize: 14, fontWeight: 700, cursor: changingPw ? 'not-allowed' : 'pointer', transition: 'all 0.2s' }}>
                {changingPw ? '변경 중...' : '비밀번호 변경'}
              </button>
            </>
          )}
        </div>

        {/* 로그인 방법 / 계정 연동 */}
        <div style={{ background: '#fff', borderRadius: 16, padding: '28px 28px', border: '1px solid #e5e7eb', marginTop: 20, animation: 'fadeUp 0.4s ease-out 0.15s both' }}>
          <h3 style={{ fontSize: 17, fontWeight: 700, color: '#111827', marginBottom: 8 }}>로그인 방법</h3>
          <p style={{ fontSize: 13, color: '#9ca3af', marginBottom: 16 }}>
            연동된 로그인 방법을 확인하고 추가/해제할 수 있습니다.
          </p>

          {/* 이메일/비밀번호 행 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: '#f8f9fa', borderRadius: 10, marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 22 }}>📧</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>이메일 · 비밀번호</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>{auth.currentUser?.email || '-'}</div>
              </div>
            </div>
            {linkProviders.includes('password') ? (
              <span style={{ fontSize: 12, fontWeight: 700, color: '#15803d', background: '#dcfce7', padding: '4px 12px', borderRadius: 999 }}>✓ 연결됨</span>
            ) : (
              <span style={{ fontSize: 12, color: '#9ca3af' }}>미사용</span>
            )}
          </div>

          {/* Google 행 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: '#f8f9fa', borderRadius: 10, marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <GoogleSmall />
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>Google 계정</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>
                  {linkProviders.includes('google.com')
                    ? (auth.currentUser?.providerData.find(p => p.providerId === 'google.com')?.email || '연결된 Google 계정')
                    : '연동되지 않음'}
                </div>
              </div>
            </div>
            {linkProviders.includes('google.com') ? (
              linkProviders.includes('password') ? (
                <button
                  onClick={handleUnlinkGoogle}
                  disabled={linkBusy}
                  style={{ background: '#fff', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: linkBusy ? 'not-allowed' : 'pointer' }}
                >
                  {linkBusy ? '처리 중...' : '연동 해제'}
                </button>
              ) : (
                <span style={{ fontSize: 11, color: '#9ca3af' }}>유일한 로그인 수단 — 해제 불가</span>
              )
            ) : (
              <button
                onClick={handleLinkGoogle}
                disabled={linkBusy}
                style={{ background: '#1a56db', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 12, fontWeight: 700, cursor: linkBusy ? 'not-allowed' : 'pointer' }}
              >
                {linkBusy ? '연동 중...' : '+ Google 계정 연동'}
              </button>
            )}
          </div>

          {linkMsg && (
            <div style={{
              background: linkMsg.type === 'ok' ? '#f0fdf4' : linkMsg.type === 'info' ? '#f0f9ff' : '#fef2f2',
              border: `1px solid ${linkMsg.type === 'ok' ? '#a7f3d0' : linkMsg.type === 'info' ? '#bae6fd' : '#fecaca'}`,
              color: linkMsg.type === 'ok' ? '#065f46' : linkMsg.type === 'info' ? '#0369a1' : '#dc2626',
              borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 4,
            }}>
              {linkMsg.text}
            </div>
          )}

          <div style={{ marginTop: 12, padding: '10px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, fontSize: 12, color: '#92400e', lineHeight: 1.6 }}>
            💡 <strong>Tip</strong> — 이메일·비밀번호로 가입한 계정에 같은 사람의 Google 계정을 연동하면, 두 가지 방법 모두로 같은 계정에 로그인할 수 있습니다. (Google 가입자도 동일하게 비밀번호 추가 가능)
          </div>
        </div>
      </div>
    </div>
  )
}

function GoogleSmall() {
  return (
    <svg width="22" height="22" viewBox="0 0 18 18">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"/>
      <path fill="#EA4335" d="M9 3.583c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.163 6.656 3.583 9 3.583z"/>
    </svg>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontWeight: 600, marginBottom: 5, color: '#374151', fontSize: 12,
}

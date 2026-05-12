import { onRequest } from 'firebase-functions/v2/https'
import * as admin from 'firebase-admin'
import express from 'express'
import { createHmac, randomBytes, createCipheriv, createDecipheriv, createHash, timingSafeEqual } from 'crypto'
import nodemailer from 'nodemailer'
import { FieldValue } from 'firebase-admin/firestore'

admin.initializeApp()
const db = admin.firestore()
const auth = admin.auth()

const app = express()
app.use(express.json())

const BASE_URL = 'https://lofawelfare-3ae73.web.app'

// ─── Auth helpers ─────────────────────────────────────────────────────────────

async function verifyToken(req: express.Request): Promise<admin.auth.DecodedIdToken | null> {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) return null
  try { return await auth.verifyIdToken(header.slice(7)) } catch { return null }
}

async function requireAuth(req: express.Request, res: express.Response): Promise<admin.auth.DecodedIdToken | false> {
  const decoded = await verifyToken(req)
  if (!decoded) { res.status(401).json({ error: '인증이 필요합니다.' }); return false }
  return decoded
}

async function requireAdmin(req: express.Request, res: express.Response): Promise<admin.auth.DecodedIdToken | false> {
  const decoded = await verifyToken(req)
  if (!decoded) { res.status(401).json({ error: '인증이 필요합니다.' }); return false }
  const userDoc = await db.collection('users').doc(decoded.uid).get()
  if (!userDoc.exists || !userDoc.data()?.isAdmin) {
    res.status(403).json({ error: '관리자 권한이 필요합니다.' }); return false
  }
  return decoded
}

// ─── Encryption ───────────────────────────────────────────────────────────────

const ALGORITHM = 'aes-256-gcm'

function getKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY
  if (!key || key.length !== 64) throw new Error('ENCRYPTION_KEY가 설정되지 않았습니다.')
  return Buffer.from(key, 'hex')
}

function encrypt(plaintext: string): string {
  const key = getKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `enc:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

function decrypt(ciphertext: string): string {
  const key = getKey()
  const parts = ciphertext.split(':')
  if (parts[0] !== 'enc' || parts.length !== 4) throw new Error('Invalid encrypted format')
  const iv = Buffer.from(parts[1], 'hex')
  const authTag = Buffer.from(parts[2], 'hex')
  const encrypted = Buffer.from(parts[3], 'hex')
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  return decipher.update(encrypted).toString('utf8') + decipher.final('utf8')
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// POST /api/encrypt
app.post('/api/encrypt', async (req, res) => {
  const decoded = await requireAuth(req, res)
  if (!decoded) return
  try {
    const { value } = req.body
    if (!value) { res.status(400).json({ status: 'error', message: 'value가 필요합니다.' }); return }
    res.json({ status: 'success', encrypted: encrypt(String(value)) })
  } catch (err) {
    res.status(500).json({ status: 'error', message: err instanceof Error ? err.message : 'Unknown' })
  }
})

// POST /api/decrypt
app.post('/api/decrypt', async (req, res) => {
  const decoded = await requireAdmin(req, res)
  if (!decoded) return
  try {
    const { value } = req.body
    if (!value) { res.status(400).json({ status: 'error', message: 'value가 필요합니다.' }); return }
    res.json({ status: 'success', decrypted: decrypt(String(value)) })
  } catch (err) {
    res.status(500).json({ status: 'error', message: err instanceof Error ? err.message : 'Unknown' })
  }
})

// POST /api/set-password
app.post('/api/set-password', async (req, res) => {
  const decoded = await requireAuth(req, res)
  if (!decoded) return
  try {
    const { password } = req.body
    if (!password || password.length < 6) { res.status(400).json({ status: 'error', message: '비밀번호는 6자 이상이어야 합니다.' }); return }
    await auth.updateUser(decoded.uid, { password })
    res.json({ status: 'success' })
  } catch (err) {
    res.status(500).json({ status: 'error', message: err instanceof Error ? err.message : 'Unknown' })
  }
})

// POST /api/lookup-email
app.post('/api/lookup-email', async (req, res) => {
  try {
    const { email } = req.body
    if (!email) { res.status(400).json({ error: 'email required' }); return }

    const snap = await db.collection('users').where('이메일', '==', email).limit(1).get()
    if (!snap.empty) {
      try { const u = await auth.getUser(snap.docs[0].id); res.json({ authEmail: u.email }); return } catch { /* continue */ }
    }
    const snap2 = await db.collection('users').where('구글이메일', '==', email).limit(1).get()
    if (!snap2.empty) {
      try { const u = await auth.getUser(snap2.docs[0].id); res.json({ authEmail: u.email }); return } catch { /* continue */ }
    }
    try { const u = await auth.getUserByEmail(email); res.json({ authEmail: u.email }); return } catch { /* continue */ }
    res.json({ authEmail: null })
  } catch { res.status(500).json({ error: 'lookup failed' }) }
})

// POST /api/notify
app.post('/api/notify', async (req, res) => {
  const decoded = await requireAdmin(req, res)
  if (!decoded) return
  try {
    const { type, to, email, message, subject } = req.body
    const notifyDoc = await db.collection('settings').doc('notify').get()
    const settings = (notifyDoc.exists ? notifyDoc.data() : {}) as {
      sms?: { apiKey?: string; apiSecret?: string; from: string; accessToken?: string; authType?: string }
      email?: { from: string; password?: string; accessToken?: string; refreshToken?: string; authType?: string }
    }

    const results: string[] = []
    const errors: string[] = []

    const smsReady = settings.sms?.from && (
      (settings.sms.authType === 'oauth2' && settings.sms.accessToken) ||
      (settings.sms.apiKey && settings.sms.apiSecret)
    )
    if ((type === 'sms' || type === 'both') && smsReady && to) {
      try {
        let authorization: string
        if (settings.sms!.authType === 'oauth2') {
          authorization = `Bearer ${settings.sms!.accessToken}`
        } else {
          const date = new Date().toISOString()
          const salt = randomBytes(16).toString('hex')
          const sig = createHmac('sha256', settings.sms!.apiSecret!).update(date + salt).digest('hex')
          authorization = `HMAC-SHA256 apiKey=${settings.sms!.apiKey}, date=${date}, salt=${salt}, signature=${sig}`
        }
        const smsRes = await fetch('https://api.solapi.com/messages/v4/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: authorization },
          body: JSON.stringify({ message: { to, from: settings.sms!.from, text: message } }),
        })
        if (!smsRes.ok) throw new Error(await smsRes.text())
        results.push('SMS 발송 완료')
      } catch (e) { errors.push(`SMS 실패: ${e instanceof Error ? e.message : String(e)}`) }
    }

    const emailReady = settings.email?.from && (settings.email.authType === 'oauth2' ? !!settings.email.refreshToken : !!settings.email.password)
    if ((type === 'email' || type === 'both') && emailReady && email) {
      try {
        const transporter = settings.email!.authType === 'oauth2' && settings.email!.refreshToken
          ? nodemailer.createTransport({ service: 'gmail', auth: { type: 'OAuth2', user: settings.email!.from, clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET, refreshToken: settings.email!.refreshToken, accessToken: settings.email!.accessToken } })
          : nodemailer.createTransport({ host: 'smtp.gmail.com', port: 587, secure: false, auth: { user: settings.email!.from, pass: settings.email!.password } })
        await transporter.sendMail({ from: `LOFA 복지 <${settings.email!.from}>`, to: email, subject: subject || '[LOFA 복지] 알림', text: message })
        results.push('이메일 발송 완료')
      } catch (e) { errors.push(`이메일 실패: ${e instanceof Error ? e.message : String(e)}`) }
    }

    if (results.length === 0 && errors.length === 0) { res.json({ status: 'skipped', message: '설정된 발송 수단이 없습니다.' }); return }
    res.json({ status: errors.length === 0 ? 'success' : 'partial', results, errors })
  } catch (err) {
    res.status(500).json({ status: 'error', message: err instanceof Error ? err.message : 'Unknown' })
  }
})

// GET /api/excel
app.get('/api/excel', async (req, res) => {
  const decoded = await requireAdmin(req, res)
  if (!decoded) return
  try {
    const formsSnap = await db.collection('form_configs').get()
    const formMap: Record<string, string> = {}
    formsSnap.docs.forEach(d => { formMap[d.id] = d.data()['제목'] || d.id })
    const appsSnap = await db.collection('applications').orderBy('created_at', 'desc').get()
    const rows: string[][] = [['사번', '성명', '부서', '직급', '신청항목', '신청일', '상태', '반려사유']]
    appsSnap.docs.forEach(d => {
      const data = d.data()
      const applicant = data['applicant'] || {}
      const createdAt = data['created_at']?.toDate?.()
      const status = data['status']
      const statusLabel = status === 'approved' ? '승인' : status === 'rejected' ? '반려' : '검토중'
      rows.push([applicant['사번'] || '', applicant['성명'] || '', applicant['부서'] || '', applicant['직급'] || '', formMap[data['form_id']] || data['form_id'] || '', createdAt ? createdAt.toLocaleDateString('ko-KR') : '', statusLabel, data['reject_reason'] || ''])
    })
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="welfare_applications_${new Date().toISOString().split('T')[0]}.csv"`)
    res.send('\uFEFF' + csv)
  } catch (err) {
    res.status(500).json({ status: 'error', message: err instanceof Error ? err.message : 'Unknown' })
  }
})

// POST /api/delete-user
app.post('/api/delete-user', async (req, res) => {
  const decoded = await requireAdmin(req, res)
  if (!decoded) return
  try {
    const { uid } = req.body
    if (!uid) { res.status(400).json({ status: 'error', message: 'uid is required' }); return }
    try { await auth.deleteUser(uid) } catch (e: any) { if (e?.code !== 'auth/user-not-found') throw e }
    await db.collection('users').doc(uid).delete()
    res.json({ status: 'success' })
  } catch (err) {
    res.status(500).json({ status: 'error', message: err instanceof Error ? err.message : 'Unknown' })
  }
})

// POST /api/reset-password
app.post('/api/reset-password', async (req, res) => {
  const decoded = await requireAdmin(req, res)
  if (!decoded) return
  try {
    const { uid, password } = req.body
    if (!uid) { res.status(400).json({ status: 'error', message: 'uid is required' }); return }
    const newPassword = password || 'lofa1234!'
    if (newPassword.length < 6) { res.status(400).json({ status: 'error', message: '비밀번호는 6자 이상이어야 합니다.' }); return }
    await auth.updateUser(uid, { password: newPassword })
    res.json({ status: 'success' })
  } catch (err) {
    res.status(500).json({ status: 'error', message: err instanceof Error ? err.message : 'Unknown' })
  }
})

// POST /api/update-email
app.post('/api/update-email', async (req, res) => {
  const decoded = await requireAdmin(req, res)
  if (!decoded) return
  try {
    const { uid, email } = req.body
    if (!uid || !email) { res.status(400).json({ status: 'error', message: 'uid와 email이 필요합니다.' }); return }
    await auth.updateUser(uid, { email })
    await db.collection('users').doc(uid).update({ 이메일: email })
    res.json({ status: 'success' })
  } catch (err) {
    res.status(500).json({ status: 'error', message: err instanceof Error ? err.message : 'Unknown' })
  }
})

// POST /api/sync-emails
app.post('/api/sync-emails', async (req, res) => {
  const decoded = await requireAdmin(req, res)
  if (!decoded) return
  try {
    const usersSnap = await db.collection('users').get()
    const results: { uid: string; email: string; status: string; error?: string }[] = []
    for (const docSnap of usersSnap.docs) {
      const data = docSnap.data()
      const realEmail = data['이메일'] as string | undefined
      const uid = docSnap.id
      if (!realEmail) { results.push({ uid, email: '', status: 'skipped', error: '이메일 없음' }); continue }
      try {
        const currentUser = await auth.getUser(uid)
        if (currentUser.email === realEmail) { results.push({ uid, email: realEmail, status: 'already_synced' }) }
        else { await auth.updateUser(uid, { email: realEmail }); results.push({ uid, email: realEmail, status: 'updated' }) }
      } catch (e: any) {
        if (e?.code === 'auth/user-not-found') {
          try { await auth.createUser({ uid, email: realEmail, password: 'lofa1234!', displayName: data['성명'] }); results.push({ uid, email: realEmail, status: 'recreated' }) }
          catch (ce) { results.push({ uid, email: realEmail, status: 'error', error: ce instanceof Error ? ce.message : 'Unknown' }) }
        } else { results.push({ uid, email: realEmail, status: 'error', error: e instanceof Error ? e.message : 'Unknown' }) }
      }
    }
    const updated = results.filter(r => r.status === 'updated').length
    const recreated = results.filter(r => r.status === 'recreated').length
    const skipped = results.filter(r => r.status === 'already_synced').length
    const failed = results.filter(r => r.status === 'error').length
    res.json({ status: 'success', message: `총 ${results.length}명 처리: ${recreated}명 복구, ${updated}명 업데이트, ${skipped}명 동기화됨, ${failed}명 실패`, results })
  } catch (err) {
    res.status(500).json({ status: 'error', message: err instanceof Error ? err.message : 'Unknown' })
  }
})

// POST /api/restore-accounts
app.post('/api/restore-accounts', async (req, res) => {
  const SECRET = process.env.ENCRYPTION_KEY?.slice(0, 16)
  const { secret } = req.body
  if (!secret || secret !== SECRET) { res.status(403).json({ status: 'error', message: '인증 실패' }); return }
  try {
    const usersSnap = await db.collection('users').get()
    const results: { email: string; name: string; status: string; error?: string }[] = []
    for (const docSnap of usersSnap.docs) {
      const data = docSnap.data()
      const uid = docSnap.id
      const email = data['이메일'] as string | undefined
      const name = data['성명'] as string | undefined
      if (!email) { results.push({ email: '', name: name || uid, status: 'skipped', error: '이메일 없음' }); continue }
      try { await auth.getUser(uid); results.push({ email, name: name || '', status: 'already_exists' }) }
      catch {
        try { await auth.createUser({ uid, email, password: 'lofa1234!', displayName: name }); results.push({ email, name: name || '', status: 'created' }) }
        catch (ce) { results.push({ email, name: name || '', status: 'error', error: ce instanceof Error ? ce.message : 'Unknown' }) }
      }
    }
    const created = results.filter(r => r.status === 'created').length
    const exists = results.filter(r => r.status === 'already_exists').length
    const failed = results.filter(r => r.status === 'error').length
    res.json({ status: 'success', message: `복구 완료: ${created}명 생성, ${exists}명 이미 존재, ${failed}명 실패. 초기 비밀번호: lofa1234!`, results })
  } catch (err) {
    res.status(500).json({ status: 'error', message: err instanceof Error ? err.message : 'Unknown' })
  }
})

// POST /api/migrate-project
app.post('/api/migrate-project', async (req, res) => {
  const decoded = await requireAdmin(req, res)
  if (!decoded) return
  const { targetProjectId, targetClientEmail, targetPrivateKey } = req.body
  if (!targetProjectId || !targetClientEmail || !targetPrivateKey) {
    res.status(400).json({ status: 'error', message: '새 프로젝트 정보를 모두 입력해주세요.' }); return
  }
  const targetAppName = `migration-target-${Date.now()}`
  let targetApp: admin.app.App | null = null
  try {
    targetApp = admin.initializeApp({ credential: admin.credential.cert({ projectId: targetProjectId, clientEmail: targetClientEmail, privateKey: targetPrivateKey.replace(/\\n/g, '\n') }) }, targetAppName)
    const targetDb = targetApp.firestore()
    const targetAuth = targetApp.auth()
    const results: Record<string, number> = {}
    for (const col of ['users', 'applications', 'form_configs', 'settings']) {
      const snap = await db.collection(col).get()
      let count = 0
      for (const d of snap.docs) { await targetDb.collection(col).doc(d.id).set(d.data()); count++ }
      results[col] = count
    }
    let authCount = 0; let pageToken: string | undefined
    do {
      const listResult = await auth.listUsers(1000, pageToken)
      for (const u of listResult.users) {
        try { await targetAuth.createUser({ uid: u.uid, email: u.email, displayName: u.displayName, disabled: u.disabled }); authCount++ }
        catch (e: any) { if (e?.code !== 'auth/uid-already-exists') { /* skip */ } }
      }
      pageToken = listResult.pageToken
    } while (pageToken)
    const allUsers = await targetAuth.listUsers(1000)
    for (const u of allUsers.users) { await targetAuth.updateUser(u.uid, { password: 'lofa1234!' }) }
    results['auth_accounts'] = authCount
    res.json({ status: 'success', message: '마이그레이션이 완료되었습니다. 비밀번호는 모두 lofa1234!로 설정되었습니다.', results })
  } catch (err) {
    res.status(500).json({ status: 'error', message: err instanceof Error ? err.message : 'Unknown' })
  } finally {
    if (targetApp) { try { await admin.app(targetAppName).delete() } catch { /* ignore */ } }
  }
})

// GET /api/google-oauth
app.get('/api/google-oauth', async (req, res) => {
  const REDIRECT_URI = `${BASE_URL}/api/google-oauth`
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) { res.redirect(`${BASE_URL}/admin?gmail_error=missing_credentials`); return }
  const code = req.query.code as string | undefined
  const error = req.query.error as string | undefined
  if (!code) {
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    authUrl.searchParams.set('client_id', clientId); authUrl.searchParams.set('redirect_uri', REDIRECT_URI)
    authUrl.searchParams.set('response_type', 'code'); authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/gmail.send')
    authUrl.searchParams.set('access_type', 'offline'); authUrl.searchParams.set('prompt', 'consent')
    res.redirect(authUrl.toString()); return
  }
  if (error) { res.redirect(`${BASE_URL}/admin?gmail_error=${encodeURIComponent(error)}`); return }
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: REDIRECT_URI, grant_type: 'authorization_code' }) })
    if (!tokenRes.ok) { res.redirect(`${BASE_URL}/admin?gmail_error=token_exchange_failed`); return }
    const tokens = await tokenRes.json() as { access_token: string; refresh_token?: string; expires_in: number }
    const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: `Bearer ${tokens.access_token}` } })
    const userInfo = await userInfoRes.json() as { email?: string }
    const update: Record<string, unknown> = { 'email.from': userInfo.email || '', 'email.accessToken': tokens.access_token, 'email.tokenExpiry': Date.now() + tokens.expires_in * 1000, 'email.authType': 'oauth2' }
    if (tokens.refresh_token) update['email.refreshToken'] = tokens.refresh_token
    await db.collection('settings').doc('notify').set(update, { merge: true })
    res.redirect(`${BASE_URL}/admin?gmail_connected=${encodeURIComponent(userInfo.email || '')}`)
  } catch { res.redirect(`${BASE_URL}/admin?gmail_error=unknown`) }
})

// DELETE /api/google-oauth
app.delete('/api/google-oauth', async (req, res) => {
  const decoded = await requireAdmin(req, res)
  if (!decoded) return
  try { await db.collection('settings').doc('notify').set({ email: null }, { merge: true }); res.json({ status: 'success' }) }
  catch (e) { res.status(500).json({ status: 'error', message: String(e) }) }
})

// GET /api/solapi-oauth
app.get('/api/solapi-oauth', async (req, res) => {
  const REDIRECT_URI = `${BASE_URL}/api/solapi-oauth`
  const clientId = process.env.SOLAPI_CLIENT_ID
  const clientSecret = process.env.SOLAPI_CLIENT_SECRET
  if (!clientId || !clientSecret) { res.redirect(`${BASE_URL}/admin?solapi_error=missing_credentials`); return }
  const code = req.query.code as string | undefined
  const error = req.query.error as string | undefined
  if (!code) {
    const authUrl = new URL('https://api.solapi.com/oauth2/v1/authorize')
    authUrl.searchParams.set('client_id', clientId); authUrl.searchParams.set('redirect_uri', REDIRECT_URI); authUrl.searchParams.set('response_type', 'code')
    res.redirect(authUrl.toString()); return
  }
  if (error) { res.redirect(`${BASE_URL}/admin?solapi_error=${encodeURIComponent(error)}`); return }
  try {
    const tokenRes = await fetch('https://api.solapi.com/oauth2/v1/access_token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: REDIRECT_URI, grant_type: 'authorization_code' }) })
    if (!tokenRes.ok) { res.redirect(`${BASE_URL}/admin?solapi_error=token_exchange_failed`); return }
    const tokens = await tokenRes.json() as { access_token: string; refresh_token?: string; expires_in?: number }
    const update: Record<string, unknown> = { 'sms.accessToken': tokens.access_token, 'sms.authType': 'oauth2' }
    if (tokens.refresh_token) update['sms.refreshToken'] = tokens.refresh_token
    if (tokens.expires_in) update['sms.tokenExpiry'] = Date.now() + tokens.expires_in * 1000
    await db.collection('settings').doc('notify').set(update, { merge: true })
    res.redirect(`${BASE_URL}/admin?solapi_connected=true`)
  } catch { res.redirect(`${BASE_URL}/admin?solapi_error=unknown`) }
})

// DELETE /api/solapi-oauth
app.delete('/api/solapi-oauth', async (req, res) => {
  const decoded = await requireAdmin(req, res)
  if (!decoded) return
  try {
    await db.collection('settings').doc('notify').update({ 'sms.accessToken': FieldValue.delete(), 'sms.authType': FieldValue.delete(), 'sms.refreshToken': FieldValue.delete(), 'sms.tokenExpiry': FieldValue.delete() })
    res.json({ status: 'success' })
  } catch (e) { res.status(500).json({ status: 'error', message: String(e) }) }
})

// ─── MFA (2-Factor Authentication) ────────────────────────────────────────────
// 1차 로그인 후 추가 인증. 3가지 지원: SMS OTP / 이메일 OTP / TOTP (RFC 6238)
// 데이터:
//   users/{uid}.mfaPreference: 'sms' | 'email' | 'totp' | null
//   users/{uid}.totpSecret: enc:... (TOTP secret base32, 암호화 저장)
//   users/{uid}.totpPendingSecret: 등록 중 임시 secret (확인 성공 시 totpSecret 으로 이동)
//   users/{uid}.lastMfaAt: Timestamp
//   mfa_codes/{uid}: { hash, channel, expiresAt, attempts, lastSentAt }
// 보안 기준: OTP 5분 유효, 5회 시도 제한, 30초 재발송 throttle.

const OTP_LENGTH = 6
const OTP_TTL_MS = 5 * 60 * 1000
const OTP_MAX_ATTEMPTS = 5
const OTP_RESEND_THROTTLE_MS = 30 * 1000

function generateOtp(): string {
  // 6자리 랜덤 숫자 — 0xff 마스킹 후 modulo 사용 (편향 무시 — 분포는 충분)
  let n = 0
  while (n < 100000) n = randomBytes(4).readUInt32BE(0) % 1000000
  return String(n).padStart(OTP_LENGTH, '0')
}

function hashOtp(uid: string, otp: string): string {
  // HMAC-SHA256(uid, otp) — DB에는 hash만 저장
  return createHmac('sha256', uid).update(otp).digest('hex')
}

// RFC 6238 TOTP (SHA-1, 30 sec step, 6 digits)
function base32Encode(buf: Buffer): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = '', out = ''
  for (const b of buf) bits += b.toString(2).padStart(8, '0')
  for (let i = 0; i + 5 <= bits.length; i += 5) out += alphabet[parseInt(bits.slice(i, i + 5), 2)]
  return out
}
function base32Decode(s: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const clean = s.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '')
  let bits = ''
  for (const ch of clean) {
    const v = alphabet.indexOf(ch)
    if (v < 0) throw new Error('Invalid base32')
    bits += v.toString(2).padStart(5, '0')
  }
  const bytes: number[] = []
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2))
  return Buffer.from(bytes)
}
function totpAt(secret: string, timestampMs: number): string {
  const counter = Math.floor(timestampMs / 1000 / 30)
  const buf = Buffer.alloc(8)
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0)
  buf.writeUInt32BE(counter & 0xffffffff, 4)
  const hmac = createHmac('sha1', base32Decode(secret)).update(buf).digest()
  const offset = hmac[hmac.length - 1] & 0xf
  const code = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16)
    | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff)
  return String(code % 1000000).padStart(6, '0')
}
function totpVerify(secret: string, code: string, windowSize = 1): boolean {
  const now = Date.now()
  for (let w = -windowSize; w <= windowSize; w++) {
    const candidate = totpAt(secret, now + w * 30 * 1000)
    try {
      if (candidate.length === code.length && timingSafeEqual(Buffer.from(candidate), Buffer.from(code))) return true
    } catch { /* */ }
  }
  return false
}

async function sendOtpViaSms(phone: string, otp: string): Promise<void> {
  const notifyDoc = await db.collection('settings').doc('notify').get()
  const s = (notifyDoc.exists ? notifyDoc.data() : {}) as { sms?: { apiKey?: string; apiSecret?: string; from?: string; accessToken?: string; authType?: string } }
  if (!s.sms?.from || (!s.sms.accessToken && !(s.sms.apiKey && s.sms.apiSecret))) throw new Error('SMS 발송 설정이 완료되지 않았습니다.')
  let authorization: string
  if (s.sms.authType === 'oauth2') {
    authorization = `Bearer ${s.sms.accessToken}`
  } else {
    const date = new Date().toISOString()
    const salt = randomBytes(16).toString('hex')
    const sig = createHmac('sha256', s.sms.apiSecret!).update(date + salt).digest('hex')
    authorization = `HMAC-SHA256 apiKey=${s.sms.apiKey}, date=${date}, salt=${salt}, signature=${sig}`
  }
  const text = `[LOFA 복지] 로그인 인증번호: ${otp} (5분 이내 입력)`
  const r = await fetch('https://api.solapi.com/messages/v4/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authorization },
    body: JSON.stringify({ message: { to: phone, from: s.sms.from, text } }),
  })
  if (!r.ok) throw new Error(`SMS 발송 실패: ${await r.text()}`)
}

async function sendOtpViaEmail(toEmail: string, otp: string): Promise<void> {
  const notifyDoc = await db.collection('settings').doc('notify').get()
  const s = (notifyDoc.exists ? notifyDoc.data() : {}) as { email?: { from?: string; password?: string; accessToken?: string; refreshToken?: string; authType?: string } }
  if (!s.email?.from) throw new Error('이메일 발송 설정이 완료되지 않았습니다.')
  const transporter = s.email.authType === 'oauth2' && s.email.refreshToken
    ? nodemailer.createTransport({ service: 'gmail', auth: { type: 'OAuth2', user: s.email.from, clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET, refreshToken: s.email.refreshToken, accessToken: s.email.accessToken } })
    : nodemailer.createTransport({ host: 'smtp.gmail.com', port: 587, secure: false, auth: { user: s.email.from, pass: s.email.password } })
  await transporter.sendMail({
    from: `LOFA 복지 <${s.email.from}>`,
    to: toEmail,
    subject: '[LOFA 복지] 로그인 인증번호',
    text: `로그인 인증번호: ${otp}\n5분 이내에 화면에 입력해주세요. 본인이 요청하지 않았다면 비밀번호를 즉시 변경해주세요.`,
  })
}

// POST /api/mfa/send-otp { channel: 'sms'|'email' }
app.post('/api/mfa/send-otp', async (req, res) => {
  const decoded = await requireAuth(req, res)
  if (!decoded) return
  try {
    const channel = String(req.body?.channel || '')
    if (channel !== 'sms' && channel !== 'email') { res.status(400).json({ error: 'channel 은 sms 또는 email' }); return }
    const userDoc = await db.collection('users').doc(decoded.uid).get()
    if (!userDoc.exists) { res.status(404).json({ error: '사용자 정보가 없습니다.' }); return }
    const u = userDoc.data() as Record<string, unknown>
    // throttle
    const existingSnap = await db.collection('mfa_codes').doc(decoded.uid).get()
    if (existingSnap.exists) {
      const last = (existingSnap.data()?.lastSentAt as admin.firestore.Timestamp | undefined)?.toMillis() || 0
      if (Date.now() - last < OTP_RESEND_THROTTLE_MS) {
        res.status(429).json({ error: '잠시 후 다시 시도해주세요.', retryAfter: Math.ceil((OTP_RESEND_THROTTLE_MS - (Date.now() - last)) / 1000) }); return
      }
    }
    const otp = generateOtp()
    const hash = hashOtp(decoded.uid, otp)
    const expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + OTP_TTL_MS)
    await db.collection('mfa_codes').doc(decoded.uid).set({
      hash, channel, expiresAt, attempts: 0, lastSentAt: FieldValue.serverTimestamp(),
    })
    if (channel === 'sms') {
      const phone = String(u['전화번호'] || u['phone'] || '').replace(/[^0-9]/g, '')
      if (!phone) throw new Error('등록된 전화번호가 없습니다.')
      await sendOtpViaSms(phone, otp)
      res.json({ status: 'sent', channel, hint: phone.slice(-4).padStart(phone.length, '*') })
    } else {
      const emailAddr = String(u['이메일'] || u['email'] || decoded.email || '')
      if (!emailAddr) throw new Error('등록된 이메일이 없습니다.')
      await sendOtpViaEmail(emailAddr, otp)
      const at = emailAddr.indexOf('@')
      const hint = at > 0 ? emailAddr.slice(0, 2) + '*'.repeat(Math.max(at - 2, 1)) + emailAddr.slice(at) : emailAddr
      res.json({ status: 'sent', channel, hint })
    }
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'send failed' })
  }
})

// POST /api/mfa/verify-otp { code: '123456', mode: 'login'|'setup', method?: 'sms'|'email'|'totp' }
app.post('/api/mfa/verify-otp', async (req, res) => {
  const decoded = await requireAuth(req, res)
  if (!decoded) return
  try {
    const code = String(req.body?.code || '').trim()
    const mode = req.body?.mode === 'setup' ? 'setup' : 'login'
    const method = String(req.body?.method || '') as 'sms' | 'email' | 'totp' | ''
    if (!/^\d{6}$/.test(code)) { res.status(400).json({ error: '6자리 숫자를 입력해주세요.' }); return }

    const userRef = db.collection('users').doc(decoded.uid)
    const userDoc = await userRef.get()
    const u = (userDoc.exists ? userDoc.data() : {}) as Record<string, unknown>

    // 검증 방식 결정: 명시 > 사용자 기본 설정
    const effectiveMethod = method || (u['mfaPreference'] as 'sms' | 'email' | 'totp' | undefined) || ''
    if (!effectiveMethod) { res.status(400).json({ error: '인증 방식 정보가 없습니다.' }); return }

    if (effectiveMethod === 'totp') {
      const encSecret = mode === 'setup'
        ? (u['totpPendingSecret'] as string | undefined)
        : (u['totpSecret'] as string | undefined)
      if (!encSecret) { res.status(400).json({ error: 'TOTP 설정이 없습니다. 다시 등록해주세요.' }); return }
      const secret = decrypt(encSecret)
      if (!totpVerify(secret, code)) { res.status(400).json({ error: '인증번호가 올바르지 않습니다.' }); return }
      if (mode === 'setup') {
        await userRef.update({
          mfaPreference: 'totp',
          totpSecret: encSecret,
          totpPendingSecret: FieldValue.delete(),
          lastMfaAt: FieldValue.serverTimestamp(),
        })
      } else {
        await userRef.update({ lastMfaAt: FieldValue.serverTimestamp() })
      }
      res.json({ status: 'ok', method: 'totp' })
      return
    }

    // sms / email 코드 검증
    const codeRef = db.collection('mfa_codes').doc(decoded.uid)
    const codeSnap = await codeRef.get()
    if (!codeSnap.exists) { res.status(400).json({ error: '발송된 인증번호가 없습니다.' }); return }
    const data = codeSnap.data() as { hash: string; channel: string; expiresAt: admin.firestore.Timestamp; attempts: number }
    if (data.channel !== effectiveMethod) { res.status(400).json({ error: '다른 인증 방식의 코드입니다.' }); return }
    if (data.expiresAt.toMillis() < Date.now()) { await codeRef.delete(); res.status(400).json({ error: '인증번호가 만료되었습니다. 다시 요청해주세요.' }); return }
    if (data.attempts >= OTP_MAX_ATTEMPTS) { res.status(429).json({ error: '시도 횟수를 초과했습니다. 새 인증번호를 요청해주세요.' }); return }
    const expectedHash = hashOtp(decoded.uid, code)
    const ok = expectedHash === data.hash
    if (!ok) {
      await codeRef.update({ attempts: FieldValue.increment(1) })
      res.status(400).json({ error: '인증번호가 올바르지 않습니다.', remainingAttempts: OTP_MAX_ATTEMPTS - data.attempts - 1 })
      return
    }
    // 성공 — 코드 삭제, lastMfaAt 기록, (setup 모드면 preference 저장)
    await codeRef.delete()
    const update: Record<string, unknown> = { lastMfaAt: FieldValue.serverTimestamp() }
    if (mode === 'setup') update.mfaPreference = effectiveMethod
    await userRef.update(update)
    res.json({ status: 'ok', method: effectiveMethod })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'verify failed' })
  }
})

// POST /api/mfa/totp-setup — 새 secret 생성 후 임시 저장, otpauth URI 반환
app.post('/api/mfa/totp-setup', async (req, res) => {
  const decoded = await requireAuth(req, res)
  if (!decoded) return
  try {
    const userDoc = await db.collection('users').doc(decoded.uid).get()
    const u = (userDoc.exists ? userDoc.data() : {}) as Record<string, unknown>
    const secretRaw = randomBytes(20) // 160 bits
    const secret = base32Encode(secretRaw)
    const account = encodeURIComponent(String(u['이메일'] || u['email'] || decoded.email || decoded.uid))
    const issuer = encodeURIComponent('LOFA 복지')
    const otpauth = `otpauth://totp/${issuer}:${account}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`
    await db.collection('users').doc(decoded.uid).update({ totpPendingSecret: encrypt(secret) })
    res.json({ status: 'ok', secret, otpauth })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'setup failed' })
  }
})

// POST /api/mfa/set-preference { method: 'sms'|'email'|'totp' } — TOTP 외 방식 등록 시 즉시 등록 (sms/email 은 verify-otp 의 setup 모드로 자동 등록되지만, 메뉴얼 변경용)
app.post('/api/mfa/set-preference', async (req, res) => {
  const decoded = await requireAuth(req, res)
  if (!decoded) return
  try {
    const method = String(req.body?.method || '')
    if (!['sms', 'email', 'totp'].includes(method)) { res.status(400).json({ error: 'method invalid' }); return }
    await db.collection('users').doc(decoded.uid).update({ mfaPreference: method })
    res.json({ status: 'ok', method })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'set failed' })
  }
})

// POST /api/mfa/reset — 본인이 자기 MFA 재설정 (모든 mfa 필드 삭제). 관리자도 호출 가능 (target uid)
app.post('/api/mfa/reset', async (req, res) => {
  const decoded = await requireAuth(req, res)
  if (!decoded) return
  try {
    const target = String(req.body?.uid || decoded.uid)
    if (target !== decoded.uid) {
      const adminDoc = await db.collection('users').doc(decoded.uid).get()
      if (!adminDoc.exists || !adminDoc.data()?.isAdmin) { res.status(403).json({ error: '관리자 권한이 필요합니다.' }); return }
    }
    await db.collection('users').doc(target).update({
      mfaPreference: FieldValue.delete(),
      totpSecret: FieldValue.delete(),
      totpPendingSecret: FieldValue.delete(),
      lastMfaAt: FieldValue.delete(),
    })
    await db.collection('mfa_codes').doc(target).delete().catch(() => {})
    res.json({ status: 'ok' })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'reset failed' })
  }
})

// ─── Export ───────────────────────────────────────────────────────────────────

export const api = onRequest({ region: 'us-central1', memory: '256MiB', timeoutSeconds: 60, cors: true }, app)

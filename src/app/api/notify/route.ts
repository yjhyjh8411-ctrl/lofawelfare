import { NextRequest, NextResponse } from 'next/server'
import { createHmac, randomBytes } from 'crypto'
import * as nodemailer from 'nodemailer'
import { getAdminDb } from '@/lib/firebase-admin'
import { getAdminAuth } from '@/lib/firebase-admin'

export const dynamic = 'force-dynamic'

async function verifyadmin(request: NextRequest): Promise<boolean> {
  try {
    const auth = request.headers.get('Authorization')
    if (!auth?.startsWith('Bearer ')) return false
    const token = auth.slice(7)
    const decoded = await getAdminAuth().verifyIdToken(token)
    const db = getAdminDb()
    const userDoc = await db.collection('users').doc(decoded.uid).get()
    return userDoc.exists && userDoc.data()?.isAdmin === true
  } catch { return false }
}

async function sendSms(
  settings: { apiKey?: string; apiSecret?: string; from: string; accessToken?: string; authType?: string },
  to: string,
  text: string
) {
  let authorization: string
  if (settings.authType === 'oauth2' && settings.accessToken) {
    authorization = `Bearer ${settings.accessToken}`
  } else {
    const date = new Date().toISOString()
    const salt = randomBytes(16).toString('hex')
    const sig = createHmac('sha256', settings.apiSecret!)
      .update(date + salt)
      .digest('hex')
    authorization = `HMAC-SHA256 apiKey=${settings.apiKey}, date=${date}, salt=${salt}, signature=${sig}`
  }
  const res = await fetch('https://api.solapi.com/messages/v4/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authorization },
    body: JSON.stringify({ message: { to, from: settings.from, text } }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Solapi error: ${err}`)
  }
}

async function sendEmail(
  settings: { from: string; password?: string; accessToken?: string; refreshToken?: string; authType?: string },
  to: string, subject: string, text: string
) {
  const transporter = settings.authType === 'oauth2' && settings.refreshToken
    ? nodemailer.createTransport({
        service: 'gmail',
        auth: {
          type: 'OAuth2',
          user: settings.from,
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          refreshToken: settings.refreshToken,
          accessToken: settings.accessToken,
        },
      })
    : nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        auth: { user: settings.from, pass: settings.password },
      })
  await transporter.sendMail({ from: `LOFA 복지 <${settings.from}>`, to, subject, text })
}

export async function POST(request: NextRequest) {
  try {
    const isAdmin = await verifyadmin(request)
    if (!isAdmin) return NextResponse.json({ status: 'error', message: 'Unauthorized' }, { status: 401 })

    const { type, to, email, message, subject } = await request.json()

    const db = getAdminDb()
    const notifyDoc = await db.collection('settings').doc('notify').get()
    const settings = notifyDoc.exists ? notifyDoc.data() as {
      sms?: { apiKey?: string; apiSecret?: string; from: string; accessToken?: string; authType?: string }
      email?: { from: string; password?: string; accessToken?: string; refreshToken?: string; tokenExpiry?: number; authType?: string }
    } : {}

    const results: string[] = []
    const errors: string[] = []

    const smsReady = settings.sms?.from && (
      (settings.sms.authType === 'oauth2' && settings.sms.accessToken) ||
      (settings.sms.apiKey && settings.sms.apiSecret)
    )
    if ((type === 'sms' || type === 'both') && smsReady && to) {
      try {
        await sendSms(settings.sms!, to, message)
        results.push('SMS 발송 완료')
      } catch (e) {
        errors.push(`SMS 실패: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    const emailReady = settings.email?.from && (settings.email.authType === 'oauth2' ? !!settings.email.refreshToken : !!settings.email.password)
    if ((type === 'email' || type === 'both') && emailReady && email) {
      try {
        await sendEmail(settings.email!, email, subject || '[LOFA 복지] 알림', message)
        results.push('이메일 발송 완료')
      } catch (e) {
        errors.push(`이메일 실패: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    if (results.length === 0 && errors.length === 0) {
      return NextResponse.json({ status: 'skipped', message: '설정된 발송 수단이 없습니다.' })
    }

    return NextResponse.json({ status: errors.length === 0 ? 'success' : 'partial', results, errors })
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ status: 'error', message: errMsg }, { status: 500 })
  }
}

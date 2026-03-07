import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'

export const dynamic = 'force-dynamic'

const BASE_URL = 'https://lofawelfare-3ae73.web.app'
const REDIRECT_URI = `${BASE_URL}/api/google-oauth`
const SCOPE = 'https://www.googleapis.com/auth/gmail.send'

function redirect(path: string) {
  return NextResponse.redirect(`${BASE_URL}${path}`, { status: 302 })
}

export async function GET(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get('code')
    const error = request.nextUrl.searchParams.get('error')

    const clientId = process.env.GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      return redirect('/admin?gmail_error=missing_credentials')
    }

    // Step 1: No code yet → redirect to Google consent screen
    if (!code) {
      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
      authUrl.searchParams.set('client_id', clientId)
      authUrl.searchParams.set('redirect_uri', REDIRECT_URI)
      authUrl.searchParams.set('response_type', 'code')
      authUrl.searchParams.set('scope', SCOPE)
      authUrl.searchParams.set('access_type', 'offline')
      authUrl.searchParams.set('prompt', 'consent')
      return NextResponse.redirect(authUrl.toString(), { status: 302 })
    }

    // Step 2: Got error from Google
    if (error) {
      return redirect(`/admin?gmail_error=${encodeURIComponent(error)}`)
    }

    // Step 3: Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    })

    if (!tokenRes.ok) {
      const err = await tokenRes.text()
      console.error('Token exchange error:', err)
      return redirect('/admin?gmail_error=token_exchange_failed')
    }

    const tokens = await tokenRes.json() as {
      access_token: string
      refresh_token?: string
      expires_in: number
      token_type: string
    }

    // Get Gmail address from Google userinfo
    const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    const userInfo = await userInfoRes.json() as { email?: string }

    // Save to Firestore settings/notify
    const db = getAdminDb()
    const update: Record<string, unknown> = {
      'email.from': userInfo.email || '',
      'email.accessToken': tokens.access_token,
      'email.tokenExpiry': Date.now() + tokens.expires_in * 1000,
      'email.authType': 'oauth2',
    }
    if (tokens.refresh_token) {
      update['email.refreshToken'] = tokens.refresh_token
    }
    await db.collection('settings').doc('notify').set(update, { merge: true })

    return redirect(`/admin?gmail_connected=${encodeURIComponent(userInfo.email || '')}`)
  } catch (e) {
    console.error('Google OAuth error:', e)
    return redirect('/admin?gmail_error=unknown')
  }
}

// Disconnect: clear Gmail OAuth tokens
export async function DELETE() {
  try {
    const db = getAdminDb()
    await db.collection('settings').doc('notify').set({
      email: null,
    }, { merge: true })
    return NextResponse.json({ status: 'success' })
  } catch (e) {
    return NextResponse.json({ status: 'error', message: String(e) }, { status: 500 })
  }
}

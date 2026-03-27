import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { getAdminDb } from '@/lib/firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'

export const dynamic = 'force-dynamic'

const BASE_URL = 'https://lofawelfare-3ae73.web.app'
const REDIRECT_URI = `${BASE_URL}/api/solapi-oauth`
const AUTH_URL = 'https://api.solapi.com/oauth2/v1/authorize'
const TOKEN_URL = 'https://api.solapi.com/oauth2/v1/access_token'

function redirect(path: string) {
  return NextResponse.redirect(`${BASE_URL}${path}`, { status: 302 })
}

export async function GET(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get('code')
    const error = request.nextUrl.searchParams.get('error')

    const clientId = process.env.SOLAPI_CLIENT_ID
    const clientSecret = process.env.SOLAPI_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      return redirect('/admin?solapi_error=missing_credentials')
    }

    if (!code) {
      const authUrl = new URL(AUTH_URL)
      authUrl.searchParams.set('client_id', clientId)
      authUrl.searchParams.set('redirect_uri', REDIRECT_URI)
      authUrl.searchParams.set('response_type', 'code')
      return NextResponse.redirect(authUrl.toString(), { status: 302 })
    }

    if (error) {
      return redirect(`/admin?solapi_error=${encodeURIComponent(error)}`)
    }

    const tokenRes = await fetch(TOKEN_URL, {
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
      console.error('Solapi token exchange error:', err)
      return redirect('/admin?solapi_error=token_exchange_failed')
    }

    const tokens = await tokenRes.json() as {
      access_token: string
      refresh_token?: string
      expires_in?: number
    }

    const db = getAdminDb()
    const update: Record<string, unknown> = {
      'sms.accessToken': tokens.access_token,
      'sms.authType': 'oauth2',
    }
    if (tokens.refresh_token) update['sms.refreshToken'] = tokens.refresh_token
    if (tokens.expires_in) update['sms.tokenExpiry'] = Date.now() + tokens.expires_in * 1000

    await db.collection('settings').doc('notify').set(update, { merge: true })

    return redirect('/admin?solapi_connected=true')
  } catch (e) {
    console.error('Solapi OAuth error:', e)
    return redirect('/admin?solapi_error=unknown')
  }
}

// Disconnect: clear Solapi OAuth tokens
export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (auth instanceof NextResponse) return auth

  try {
    const db = getAdminDb()
    await db.collection('settings').doc('notify').update({
      'sms.accessToken': FieldValue.delete(),
      'sms.authType': FieldValue.delete(),
      'sms.refreshToken': FieldValue.delete(),
      'sms.tokenExpiry': FieldValue.delete(),
    })
    return NextResponse.json({ status: 'success' })
  } catch (e) {
    return NextResponse.json({ status: 'error', message: String(e) }, { status: 500 })
  }
}

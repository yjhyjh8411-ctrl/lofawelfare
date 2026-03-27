import { NextRequest, NextResponse } from 'next/server'
import { getAdminAuth, getAdminDb } from './firebase-admin'

interface AuthResult {
  uid: string
  email: string
  isAdmin: boolean
}

/**
 * API 요청에서 Firebase ID Token을 검증하고 사용자 정보를 반환합니다.
 * Authorization: Bearer <token> 헤더가 필요합니다.
 */
export async function verifyAuth(req: NextRequest): Promise<AuthResult | null> {
  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) return null

    const token = authHeader.slice(7)
    const decoded = await getAdminAuth().verifyIdToken(token)

    const userDoc = await getAdminDb().collection('users').doc(decoded.uid).get()
    const isAdmin = userDoc.exists && userDoc.data()?.isAdmin === true

    return { uid: decoded.uid, email: decoded.email || '', isAdmin }
  } catch {
    return null
  }
}

/** 인증된 사용자만 허용. 실패 시 401 응답 반환 */
export async function requireAuth(req: NextRequest): Promise<AuthResult | NextResponse> {
  const auth = await verifyAuth(req)
  if (!auth) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  return auth
}

/** 관리자만 허용. 실패 시 401/403 응답 반환 */
export async function requireAdmin(req: NextRequest): Promise<AuthResult | NextResponse> {
  const auth = await verifyAuth(req)
  if (!auth) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  if (!auth.isAdmin) return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 })
  return auth
}

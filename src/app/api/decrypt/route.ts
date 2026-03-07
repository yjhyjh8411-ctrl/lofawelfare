import { NextRequest, NextResponse } from 'next/server'
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin'
import { decrypt } from '@/lib/encryption'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ status: 'error', message: '인증이 필요합니다.' }, { status: 401 })
    }
    const token = authHeader.slice(7)
    const adminAuth = getAdminAuth()
    const decoded = await adminAuth.verifyIdToken(token)

    // Admin check
    const db = getAdminDb()
    const userDoc = await db.collection('users').doc(decoded.uid).get()
    const isAdmin = userDoc.exists && (userDoc.data()?.['isAdmin'] === true || decoded.uid === 'admin')
    if (!isAdmin) {
      return NextResponse.json({ status: 'error', message: '관리자만 접근 가능합니다.' }, { status: 403 })
    }

    const { value } = await request.json()
    if (!value) return NextResponse.json({ status: 'error', message: 'value가 필요합니다.' }, { status: 400 })

    const decrypted = decrypt(String(value))
    return NextResponse.json({ status: 'success', decrypted })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ status: 'error', message }, { status: 500 })
  }
}

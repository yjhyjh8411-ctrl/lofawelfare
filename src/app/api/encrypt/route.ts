import { NextRequest, NextResponse } from 'next/server'
import { getAdminAuth } from '@/lib/firebase-admin'
import { encrypt } from '@/lib/encryption'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ status: 'error', message: '인증이 필요합니다.' }, { status: 401 })
    }
    const token = authHeader.slice(7)
    const adminAuth = getAdminAuth()
    await adminAuth.verifyIdToken(token)

    const { value } = await request.json()
    if (!value) return NextResponse.json({ status: 'error', message: 'value가 필요합니다.' }, { status: 400 })

    const encrypted = encrypt(String(value))
    return NextResponse.json({ status: 'success', encrypted })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ status: 'error', message }, { status: 500 })
  }
}

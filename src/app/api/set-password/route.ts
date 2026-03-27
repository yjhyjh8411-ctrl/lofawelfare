import { NextRequest, NextResponse } from 'next/server'
import { getAdminAuth } from '@/lib/firebase-admin'
import { requireAuth } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const authCheck = await requireAuth(request)
  if (authCheck instanceof NextResponse) return authCheck

  try {
    const { password } = await request.json()
    if (!password || password.length < 6) {
      return NextResponse.json({ status: 'error', message: '비밀번호는 6자 이상이어야 합니다.' }, { status: 400 })
    }

    const adminAuth = getAdminAuth()
    await adminAuth.updateUser(authCheck.uid, { password })

    return NextResponse.json({ status: 'success' })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ status: 'error', message }, { status: 500 })
  }
}

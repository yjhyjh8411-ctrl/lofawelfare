import { NextRequest, NextResponse } from 'next/server'
import { getAdminAuth } from '@/lib/firebase-admin'

export const dynamic = 'force-dynamic'

const DEFAULT_PASSWORD = 'lofa1234!'

export async function POST(request: NextRequest) {
  try {
    const { uid, password } = await request.json()
    if (!uid) {
      return NextResponse.json({ status: 'error', message: 'uid is required' }, { status: 400 })
    }

    const newPassword = password || DEFAULT_PASSWORD
    if (newPassword.length < 6) {
      return NextResponse.json({ status: 'error', message: '비밀번호는 6자 이상이어야 합니다.' }, { status: 400 })
    }

    const auth = getAdminAuth()
    await auth.updateUser(uid, { password: newPassword })

    return NextResponse.json({ status: 'success' })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ status: 'error', message }, { status: 500 })
  }
}

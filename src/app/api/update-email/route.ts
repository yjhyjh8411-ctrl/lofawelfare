import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (auth instanceof NextResponse) return auth

  try {
    const { uid, email } = await request.json()
    if (!uid || !email) {
      return NextResponse.json({ status: 'error', message: 'uid와 email이 필요합니다.' }, { status: 400 })
    }

    const adminAuth = getAdminAuth()
    const db = getAdminDb()

    await adminAuth.updateUser(uid, { email })
    await db.collection('users').doc(uid).update({ 이메일: email })

    return NextResponse.json({ status: 'success' })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ status: 'error', message }, { status: 500 })
  }
}

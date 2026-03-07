import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb, getAdminAuth } from '@/lib/firebase-admin'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const { uid } = await request.json()
    if (!uid) {
      return NextResponse.json({ status: 'error', message: 'uid is required' }, { status: 400 })
    }

    const auth = getAdminAuth()
    const db = getAdminDb()

    try {
      await auth.deleteUser(uid)
    } catch (err: unknown) {
      if (!err || typeof err !== 'object' || !('code' in err) || (err as { code: string }).code !== 'auth/user-not-found') {
        throw err
      }
    }

    await db.collection('users').doc(uid).delete()

    return NextResponse.json({ status: 'success' })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ status: 'error', message }, { status: 500 })
  }
}

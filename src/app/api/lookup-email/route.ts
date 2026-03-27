import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb, getAdminAuth } from '@/lib/firebase-admin'

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json()
    if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 })

    const db = getAdminDb()

    // 1. Firestore에서 이메일(회사) 필드로 검색
    const snap = await db.collection('users').where('이메일', '==', email).limit(1).get()
    if (!snap.empty) {
      const uid = snap.docs[0].id
      try {
        const authUser = getAdminAuth().getUser(uid)
        return NextResponse.json({ authEmail: (await authUser).email })
      } catch { /* uid에 해당하는 Auth 유저 없음 */ }
    }

    // 2. 구글이메일 필드로 검색
    const snap2 = await db.collection('users').where('구글이메일', '==', email).limit(1).get()
    if (!snap2.empty) {
      const uid = snap2.docs[0].id
      try {
        const authUser = getAdminAuth().getUser(uid)
        return NextResponse.json({ authEmail: (await authUser).email })
      } catch { /* */ }
    }

    // 3. Firebase Auth에서 직접 검색
    try {
      const authUser = await getAdminAuth().getUserByEmail(email)
      return NextResponse.json({ authEmail: authUser.email })
    } catch { /* */ }

    return NextResponse.json({ authEmail: null })
  } catch {
    return NextResponse.json({ error: 'lookup failed' }, { status: 500 })
  }
}

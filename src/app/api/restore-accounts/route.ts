import { NextRequest, NextResponse } from 'next/server'
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin'

export const dynamic = 'force-dynamic'

// 일회성 복구 엔드포인트 — 사용 후 삭제 권장
const SECRET = process.env.ENCRYPTION_KEY?.slice(0, 16) // 복구 비밀키 (암호화키 앞 16자)

export async function POST(request: NextRequest) {
  try {
    const { secret } = await request.json()
    if (!secret || secret !== SECRET) {
      return NextResponse.json({ status: 'error', message: '인증 실패' }, { status: 403 })
    }

    const auth = getAdminAuth()
    const db = getAdminDb()

    const usersSnap = await db.collection('users').get()
    const results: { email: string; name: string; status: string; error?: string }[] = []

    for (const docSnap of usersSnap.docs) {
      const data = docSnap.data()
      const uid = docSnap.id
      const email = data['이메일'] as string | undefined
      const name = data['성명'] as string | undefined

      if (!email) {
        results.push({ email: '', name: name || uid, status: 'skipped', error: '이메일 없음' })
        continue
      }

      try {
        await auth.getUser(uid)
        results.push({ email, name: name || '', status: 'already_exists' })
      } catch {
        // 계정 없음 → 생성
        try {
          await auth.createUser({ uid, email, password: 'lofa1234!', displayName: name })
          results.push({ email, name: name || '', status: 'created' })
        } catch (createErr) {
          const msg = createErr instanceof Error ? createErr.message : 'Unknown'
          results.push({ email, name: name || '', status: 'error', error: msg })
        }
      }
    }

    const created = results.filter(r => r.status === 'created').length
    const exists = results.filter(r => r.status === 'already_exists').length
    const failed = results.filter(r => r.status === 'error').length

    return NextResponse.json({
      status: 'success',
      message: `복구 완료: ${created}명 생성, ${exists}명 이미 존재, ${failed}명 실패. 초기 비밀번호: lofa1234!`,
      results,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ status: 'error', message }, { status: 500 })
  }
}

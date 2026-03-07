import { NextResponse } from 'next/server'
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const auth = getAdminAuth()
    const db = getAdminDb()

    const usersSnap = await db.collection('users').get()
    const results: { uid: string; email: string; status: string; error?: string }[] = []

    for (const docSnap of usersSnap.docs) {
      const data = docSnap.data()
      const realEmail = data['이메일'] as string | undefined
      const uid = docSnap.id

      if (!realEmail) {
        results.push({ uid, email: '', status: 'skipped', error: '이메일 없음' })
        continue
      }

      try {
        // Try to get existing Auth user
        const currentUser = await auth.getUser(uid)
        if (currentUser.email === realEmail) {
          results.push({ uid, email: realEmail, status: 'already_synced' })
        } else {
          await auth.updateUser(uid, { email: realEmail })
          results.push({ uid, email: realEmail, status: 'updated' })
        }
      } catch (e) {
        const errCode = (e as { code?: string }).code
        if (errCode === 'auth/user-not-found') {
          // Auth account was deleted — recreate with uid
          try {
            await auth.createUser({
              uid,
              email: realEmail,
              password: 'lofa1234!',
              displayName: data['성명'] as string | undefined,
            })
            results.push({ uid, email: realEmail, status: 'recreated' })
          } catch (createErr) {
            const msg = createErr instanceof Error ? createErr.message : 'Unknown error'
            results.push({ uid, email: realEmail, status: 'error', error: msg })
          }
        } else {
          const msg = e instanceof Error ? e.message : 'Unknown error'
          results.push({ uid, email: realEmail, status: 'error', error: msg })
        }
      }
    }

    const updated = results.filter(r => r.status === 'updated').length
    const recreated = results.filter(r => r.status === 'recreated').length
    const skipped = results.filter(r => r.status === 'already_synced').length
    const failed = results.filter(r => r.status === 'error').length

    return NextResponse.json({
      status: 'success',
      message: `총 ${results.length}명 처리: ${recreated}명 계정 복구, ${updated}명 이메일 업데이트, ${skipped}명 이미 동기화됨, ${failed}명 실패`,
      results,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ status: 'error', message }, { status: 500 })
  }
}

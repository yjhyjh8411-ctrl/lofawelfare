import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { initializeApp, cert, getApps, deleteApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (auth instanceof NextResponse) return auth

  try {
    const body = await request.json()
    const { targetProjectId, targetClientEmail, targetPrivateKey } = body

    if (!targetProjectId || !targetClientEmail || !targetPrivateKey) {
      return NextResponse.json({ status: 'error', message: '새 프로젝트 정보를 모두 입력해주세요.' }, { status: 400 })
    }

    const { getAdminDb, getAdminAuth } = await import('@/lib/firebase-admin')
    const sourceDb = getAdminDb()
    const sourceAuth = getAdminAuth()

    const targetAppName = `migration-target-${Date.now()}`
    const targetApp = initializeApp(
      {
        credential: cert({
          projectId: targetProjectId,
          clientEmail: targetClientEmail,
          privateKey: targetPrivateKey.replace(/\\n/g, '\n'),
        }),
      },
      targetAppName
    )
    const targetDb = getFirestore(targetApp)
    const targetAuth = getAuth(targetApp)

    const results: Record<string, number> = {}

    const collections = ['users', 'applications', 'form_configs', 'settings']
    for (const col of collections) {
      const snap = await sourceDb.collection(col).get()
      let count = 0
      for (const d of snap.docs) {
        await targetDb.collection(col).doc(d.id).set(d.data())
        count++
      }
      results[col] = count
    }

    let authCount = 0
    let pageToken: string | undefined
    do {
      const listResult = await sourceAuth.listUsers(1000, pageToken)
      for (const u of listResult.users) {
        try {
          await targetAuth.createUser({
            uid: u.uid,
            email: u.email,
            displayName: u.displayName,
            disabled: u.disabled,
          })
          authCount++
        } catch (e: unknown) {
          if (!e || typeof e !== 'object' || !('code' in e) || (e as { code: string }).code !== 'auth/uid-already-exists') {
            // skip if exists
          }
        }
      }
      pageToken = listResult.pageToken
    } while (pageToken)

    const allUsers = await targetAuth.listUsers(1000)
    for (const u of allUsers.users) {
      await targetAuth.updateUser(u.uid, { password: 'lofa1234!' })
    }

    results['auth_accounts'] = authCount

    await deleteApp(targetApp)

    return NextResponse.json({
      status: 'success',
      message: '마이그레이션이 완료되었습니다. 비밀번호는 모두 lofa1234!로 설정되었습니다.',
      results,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ status: 'error', message }, { status: 500 })
  }
}

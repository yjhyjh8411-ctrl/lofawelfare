import { initializeApp, cert, getApps, App, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'

let adminApp: App

function getAdminApp(): App {
  if (adminApp) return adminApp
  const existing = getApps().find(a => a.name === 'admin')
  if (existing) {
    adminApp = existing
    return adminApp
  }
  const privateKey = process.env.FIREBASE_PRIVATE_KEY
  if (privateKey) {
    // 로컬 개발: 서비스 계정 키 사용
    adminApp = initializeApp(
      {
        credential: cert({
          projectId: process.env.FIREBASE_PROJECT_ID!,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
          privateKey: privateKey.replace(/\\n/g, '\n'),
        }),
      },
      'admin'
    )
  } else {
    // Cloud Run/Firebase Functions: Application Default Credentials 사용
    adminApp = initializeApp(
      {
        credential: applicationDefault(),
        projectId: process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      },
      'admin'
    )
  }
  return adminApp
}

export function getAdminDb() {
  return getFirestore(getAdminApp())
}

export function getAdminAuth() {
  return getAuth(getAdminApp())
}

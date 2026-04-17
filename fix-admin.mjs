import { initializeApp, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

const app = initializeApp({
  credential: cert({
    projectId: 'lofawelfare-3ae73',
    clientEmail: 'firebase-adminsdk-fbsvc@lofawelfare-3ae73.iam.gserviceaccount.com',
    privateKey: `-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDuw6dVr3xv/lbj\nBsUxqOoL1Y+tCpuaGLOBXI1DK7uwQ7puSdc8YhGE8Ma+vb7GW/ueCkGOZ7HrDwkG\njhMDMjShUXIZaDohH3gDhA4GKH0cbEy/i9NtDZWoqJTlKghQNuRTQVdB9WbSti8c\nq4gRJ7mYr+1Hfza2TaVSL7A9cgnRBA52KiKmxsuUOAsgb2nzElzZdVx8eJmGRF7s\ng9FKc1rb6eO70Qo0nzSMjHO53ePNexPTiFAON42c2CkTqJetaTk2MDuV8Y6VBwrA\nP5VVhsP67/HpfaHGFB+AATkNdKb4QMkyNxD8cEZZqotiP6oDB3E5qu/tH4Imd7O4\nm7YY6gBhAgMBAAECggEAXBXhp85ys87oO88Upr565e2L6DU7Jgd409+aK9nmHWlB\nsd+Qv50jHJ6wSEhuF5rKRH24IvAjUoEN/hU1h/oJCl6bHulv4e59Hv4DWqSq/BdY\n0ldfR6QBoHbEVk4LvsQs8180BCBdc88IBIqzg8pKbnULkpOhylXP+Q6jbk9ZMd8b\n7PjgXSCBSDvyPv6HspBRFdGvxu/f/Jf6MWz6Yz88NJ435ay1l6/tPg5ewSvRT0aN\nNsgXY7R6J5vhrXnimNdkiQujyULZppGBGRL66VduzDMDISRXN1v7fwujShgEOBeF\n/LjZGI1s3/03/Rsb/I9OqVAwikVQl+3T+a4+eTJasQKBgQD6EkT1gqtbhImsh9/S\nc8WtyVUgcvEBsanPRHAxPg5DrSnA30LrKof3qL6pNgosTFB6aPJx5AwiQBdZAhjR\nSIxROpmCCpG4mMquQNYNTjXr2F5HI7PLoIrEKGq320szh4Yip10ORq3ngcFtjZJU\nPSZZih0fDoazonKGKhL+tiJgMwKBgQD0bMJnIo8TxAgKIzpoIHWGNFtTkZ2P2EAR\nZ5a57wwW8OdOiQ1hEjfsFl4hN4P2bhYYSes/J39DDSABMmGhVnXzCc6VW4CKaifI\nwxu033fQ7XBAOPi0xGUmZt63GdIfYBS61jeTnCEyQ9sZbo25W0wik9B7KQABECEX\nmpWZDCe5GwKBgQC3NlFdijmfWFBBnl7GYlmvBHWgy3V1Z0Pg/eQwv6VVwfV4QFpX\nzxZExVXCxTvYzqSbum3+MTUOluREKvwhwMRE8ujq1HGEzDSaTBhHMUjiHOiduDOO\n+XURWAcv4rOK8jy9AN91iST6Gx+q8vEFVLPXIBBL46mezGKZlxPJl4lB7wKBgQCV\nA9WFcTFPeJz6KT4Li3Z7CmJ/UXCA6PMuaTwgQVfaiKZMYAvzGVtUqNJcZ+8hBz6b\nMj2ktBzHMTJI6IFTDlY8hMcYkb+NI2j74c97dx4iFw/vZ4xhELcmMWMouCo9jKM2\nwTEC4hXvAiWKnLb0wW9qSTm6TGW/QCkcrdb0hs+U7wKBgGhfNnbtKqlZoI2zGEQN\nTXOAmQFHE5XNPocSF2N1bHxvvcOtUCuyENcZcW7teVJxTv8UqhOcJaH2rjkmd3Fs\nXrcf9yzKdkVm2/SO9nV4DCI8Cd7EyrKFPiGPbAWBuR3++EE0hSgiojBTMpwQLpoJ\nN1zxYPqFJaLfLNJKfjuH7BFw\n-----END PRIVATE KEY-----\n`
  })
})

const auth = getAuth(app)
const db = getFirestore(app)

const newUid = 'iWFhjI5p2zY8elcyDkVw3uWgoWg1'

// 새 Auth 계정 정보 조회
const user = await auth.getUser(newUid)
console.log('Auth 계정:', user.email, '/', user.displayName)

// 기존 admin Firestore 문서 찾기
const snap = await db.collection('users').where('isAdmin', '==', true).get()
let oldData = {}
if (!snap.empty) {
  oldData = snap.docs[0].data()
  console.log('기존 admin 문서 UID:', snap.docs[0].id, '이메일:', oldData['이메일'])
} else {
  console.log('기존 admin 문서 없음')
}

// 새 UID로 admin 문서 생성
await db.collection('users').doc(newUid).set({
  ...oldData,
  이메일: user.email || oldData['이메일'] || '',
  isAdmin: true,
  status: 'active',
})
console.log('완료: 새 admin 문서 생성됨 -', newUid)
process.exit(0)

'use client'

import { createContext, useContext, useEffect, useState, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { User, onAuthStateChanged, signOut } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase'

export type AccountStatus = 'pending' | 'approved' | 'rejected'

/** accountStatus 미설정 = 기존 사용자 → 'approved' 로 간주 (역호환) */
export function resolveAccountStatus(data: Record<string, unknown> | undefined, isAdmin: boolean): AccountStatus {
  if (isAdmin) return 'approved'
  const v = data?.['accountStatus']
  if (v === 'pending' || v === 'rejected' || v === 'approved') return v
  return 'approved'
}

const PROFILE_CACHE_KEY = 'lofa_profile_cache'
const PROFILE_CACHE_TTL = 5 * 60 * 1000 // 5분

export type MfaMethod = 'sms' | 'email' | 'totp'

interface UserProfile {
  uid: string
  employeeId: string
  name: string
  department: string
  position: string
  email: string           // 회사 이메일
  personalEmail: string   // 외부(개인) 이메일 — MFA OTP·신청 알림 발송용
  isAdmin: boolean
  status: string
  accountStatus: AccountStatus
  mfaPreference: MfaMethod | null
  hireDate?: string
  phone?: string
}

/** MFA 세션 통과 여부 — sessionStorage 기반 (탭 닫히면 풀림) */
export const MFA_SESSION_KEY = 'lofa_mfa_pass'
export function isMfaPassedInSession(uid: string): boolean {
  if (typeof window === 'undefined') return false
  try {
    const v = sessionStorage.getItem(MFA_SESSION_KEY)
    if (!v) return false
    const { uid: storedUid, ts } = JSON.parse(v)
    if (storedUid !== uid) return false
    // 12시간 한도
    return Date.now() - ts < 12 * 60 * 60 * 1000
  } catch { return false }
}
export function markMfaPassedInSession(uid: string) {
  try { sessionStorage.setItem(MFA_SESSION_KEY, JSON.stringify({ uid, ts: Date.now() })) } catch { /* */ }
}
export function clearMfaSession() {
  try { sessionStorage.removeItem(MFA_SESSION_KEY) } catch { /* */ }
}

/** MFA 가드 면제 경로 — 로그인 자체 흐름 페이지 (trailingSlash 호환) */
const MFA_EXEMPT_PATHS = ['/login', '/signup', '/complete-profile', '/mfa', '/mfa/setup']
function isExemptPath(pathname: string): boolean {
  if (pathname === '/' || pathname === '') return true
  return MFA_EXEMPT_PATHS.some(p => pathname === p || pathname === p + '/' || pathname.startsWith(p + '/'))
}

interface AuthContextType {
  user: User | null
  profile: UserProfile | null
  loading: boolean
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({ user: null, profile: null, loading: true, refreshProfile: async () => {} })

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const lastFetchedUid = useRef<string | null>(null)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser)
      if (firebaseUser) {
        // 같은 유저면 캐시 사용 (Firestore 읽기 절약)
        if (lastFetchedUid.current === firebaseUser.uid && profile) {
          setLoading(false)
          return
        }
        // sessionStorage 캐시 확인
        try {
          const cached = sessionStorage.getItem(PROFILE_CACHE_KEY)
          if (cached) {
            const { data: cachedProfile, ts } = JSON.parse(cached)
            if (cachedProfile.uid === firebaseUser.uid && Date.now() - ts < PROFILE_CACHE_TTL) {
              setProfile(cachedProfile)
              lastFetchedUid.current = firebaseUser.uid
              setLoading(false)
              return
            }
          }
        } catch { /* ignore cache errors */ }

        try {
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid))
          if (userDoc.exists()) {
            const data = userDoc.data()
            const isAdmin = data['isAdmin'] === true || userDoc.id === 'admin'
            const accountStatus = resolveAccountStatus(data, isAdmin)
            // 미승인/거부 계정은 즉시 강제 로그아웃 (관리자 제외)
            if (!isAdmin && accountStatus !== 'approved') {
              try { sessionStorage.setItem('lofa_pending_reason', accountStatus) } catch { /* */ }
              await signOut(auth)
              setProfile(null)
              lastFetchedUid.current = null
              setLoading(false)
              return
            }
            const mfaPrefRaw = data['mfaPreference']
            const mfaPreference: MfaMethod | null = mfaPrefRaw === 'sms' || mfaPrefRaw === 'email' || mfaPrefRaw === 'totp' ? mfaPrefRaw : null
            const p: UserProfile = {
              uid: firebaseUser.uid,
              employeeId: data['사번'] || data['employeeId'] || '',
              name: data['성명'] || data['이름'] || data['name'] || '',
              department: data['부서'] || data['department'] || '',
              position: data['직급'] || data['position'] || '',
              email: data['이메일'] || data['email'] || firebaseUser.email || '',
              personalEmail: data['외부이메일'] || data['개인이메일'] || data['personalEmail'] || '',
              isAdmin,
              status: data['status'] || 'active',
              accountStatus,
              mfaPreference,
              hireDate: data['입사일'] || data['hireDate'] || '',
              phone: data['전화번호'] || data['phone'] || '',
            }
            setProfile(p)
            lastFetchedUid.current = firebaseUser.uid
            try { sessionStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({ data: p, ts: Date.now() })) } catch { /* */ }
          }
        } catch (e) {
          console.error('Failed to load user profile:', e)
        }
      } else {
        setProfile(null)
        lastFetchedUid.current = null
        try { sessionStorage.removeItem(PROFILE_CACHE_KEY) } catch { /* */ }
        clearMfaSession()
      }
      setLoading(false)
    })
    return () => unsubscribe()
  }, [])

  const refreshProfile = async () => {
    if (!user) return
    try {
      const userDoc = await getDoc(doc(db, 'users', user.uid))
      if (userDoc.exists()) {
        const data = userDoc.data()
        const isAdmin = data['isAdmin'] === true || userDoc.id === 'admin'
        const accountStatus = resolveAccountStatus(data, isAdmin)
        if (!isAdmin && accountStatus !== 'approved') {
          try { sessionStorage.setItem('lofa_pending_reason', accountStatus) } catch { /* */ }
          await signOut(auth)
          setProfile(null)
          lastFetchedUid.current = null
          return
        }
        const mfaPrefRaw = data['mfaPreference']
        const mfaPreference: MfaMethod | null = mfaPrefRaw === 'sms' || mfaPrefRaw === 'email' || mfaPrefRaw === 'totp' ? mfaPrefRaw : null
        const p: UserProfile = {
          uid: user.uid,
          employeeId: data['사번'] || data['employeeId'] || '',
          name: data['성명'] || data['이름'] || data['name'] || '',
          department: data['부서'] || data['department'] || '',
          position: data['직급'] || data['position'] || '',
          email: data['이메일'] || data['email'] || user.email || '',
          personalEmail: data['외부이메일'] || data['개인이메일'] || data['personalEmail'] || '',
          isAdmin,
          status: data['status'] || 'active',
          accountStatus,
          mfaPreference,
          hireDate: data['입사일'] || data['hireDate'] || '',
          phone: data['전화번호'] || data['phone'] || '',
        }
        setProfile(p)
        lastFetchedUid.current = user.uid
        try { sessionStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({ data: p, ts: Date.now() })) } catch { /* */ }
      }
    } catch (e) { console.error('Failed to refresh profile:', e) }
  }

  // ─── Route Gate — 보호 페이지 접근 가드 ──────────────────────────────────────
  const router = useRouter()
  const pathname = usePathname()
  useEffect(() => {
    if (loading) return
    if (typeof window === 'undefined') return
    // 면제 경로면 무조건 통과
    if (isExemptPath(pathname)) return
    // 미로그인 → /login
    if (!user) { router.replace('/login'); return }
    // 'admin' uid 는 긴급 백도어 — 면제
    if (user.uid === 'admin') return
    // user 는 있는데 profile 로드 실패/지연 → 안전을 위해 /login 으로 강제
    if (!profile) { router.replace('/login'); return }
    // 계정 미승인 (예: signup race condition으로 onAuthStateChanged 강제 logout 못 한 경우 보강)
    if (!profile.isAdmin && profile.accountStatus !== 'approved') {
      try { sessionStorage.setItem('lofa_pending_reason', profile.accountStatus) } catch { /* */ }
      signOut(auth).finally(() => router.replace('/login'))
      return
    }
    // MFA 세션 통과면 OK
    if (isMfaPassedInSession(user.uid)) return
    // 외부이메일 미등록 또는 mfaPreference 미설정 → setup, 둘 다 있으면 /mfa
    const needSetup = !profile.personalEmail || !profile.mfaPreference
    router.replace(needSetup ? '/mfa/setup' : '/mfa')
  }, [user, profile, loading, pathname, router])

  return (
    <AuthContext.Provider value={{ user, profile, loading, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}

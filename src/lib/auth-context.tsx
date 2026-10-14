'use client'

import { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react'
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
// [무과금 최적화] 사내 인사정보는 자주 바뀌지 않으므로 5분 → 30분으로 늘려 Firestore 무료 Read 할당량 절약
// (사용자가 직접 프로필이나 MFA를 수정할 때는 refreshProfile()이 호출되어 즉시 캐시가 갱신됨)
const PROFILE_CACHE_TTL = 30 * 60 * 1000 // 30분

export type MfaMethod = 'sms' | 'email' | 'totp'

export interface UserProfile {
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

/** Firestore 문서 데이터를 UserProfile 객체로 변환하는 공통 헬퍼 */
function buildUserProfile(uid: string, authEmail: string | null, data: Record<string, unknown>, isAdmin: boolean, accountStatus: AccountStatus): UserProfile {
  const mfaPrefRaw = data['mfaPreference']
  const mfaPreference: MfaMethod | null = mfaPrefRaw === 'sms' || mfaPrefRaw === 'email' || mfaPrefRaw === 'totp' ? mfaPrefRaw : null
  return {
    uid,
    employeeId: String(data['사번'] || data['employeeId'] || ''),
    name: String(data['성명'] || data['이름'] || data['name'] || ''),
    department: String(data['부서'] || data['department'] || ''),
    position: String(data['직급'] || data['position'] || ''),
    email: String(data['이메일'] || data['email'] || authEmail || ''),
    personalEmail: String(data['외부이메일'] || data['개인이메일'] || data['personalEmail'] || ''),
    isAdmin,
    status: String(data['status'] || 'active'),
    accountStatus,
    mfaPreference,
    hireDate: String(data['입사일'] || data['hireDate'] || ''),
    phone: String(data['전화번호'] || data['phone'] || ''),
  }
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
  const [missingDoc, setMissingDoc] = useState(false) // [패치] 소셜 로그인 직후 DB 문서 미생성 상태 추적
  const [loading, setLoading] = useState(true)

  const lastFetchedUid = useRef<string | null>(null)
  const profileRef = useRef<UserProfile | null>(null) // [패치] Stale Closure 방지용 Ref

  const updateProfileState = useCallback((p: UserProfile | null) => {
    profileRef.current = p
    setProfile(p)
  }, [])

  /** Firestore에서 프로필을 읽어와 상태 및 캐시를 갱신하는 단일 함수 */
  const fetchAndSetProfile = useCallback(async (firebaseUser: User) => {
    const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid))
    if (!userDoc.exists()) {
      // Google 로그인 등 Auth 계정은 있으나 아직 users 문서가 없는 경우
      updateProfileState(null)
      setMissingDoc(true)
      lastFetchedUid.current = firebaseUser.uid
      return
    }

    setMissingDoc(false)
    const data = userDoc.data()
    const isAdmin = data['isAdmin'] === true || userDoc.id === 'admin'
    const accountStatus = resolveAccountStatus(data, isAdmin)

    // 미승인/거부 계정은 즉시 강제 로그아웃 (관리자 제외)
    if (!isAdmin && accountStatus !== 'approved') {
      try { sessionStorage.setItem('lofa_pending_reason', accountStatus) } catch { /* */ }
      await signOut(auth)
      updateProfileState(null)
      lastFetchedUid.current = null
      try { sessionStorage.removeItem(PROFILE_CACHE_KEY) } catch { /* */ }
      return
    }

    const p = buildUserProfile(firebaseUser.uid, firebaseUser.email, data, isAdmin, accountStatus)
    updateProfileState(p)
    lastFetchedUid.current = firebaseUser.uid
    try { sessionStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({ data: p, ts: Date.now() })) } catch { /* */ }
  }, [updateProfileState])

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser)
      if (firebaseUser) {
        // 1단계: 메모리 캐시 확인 (profileRef.current 사용으로 클로저 버그 완벽 해결)
        if (lastFetchedUid.current === firebaseUser.uid && profileRef.current) {
          setLoading(false)
          return
        }
        // 2단계: sessionStorage 캐시 확인 (Firestore 읽기 비용 절약)
        try {
          const cached = sessionStorage.getItem(PROFILE_CACHE_KEY)
          if (cached) {
            const { data: cachedProfile, ts } = JSON.parse(cached)
            if (cachedProfile?.uid === firebaseUser.uid && Date.now() - ts < PROFILE_CACHE_TTL) {
              updateProfileState(cachedProfile)
              setMissingDoc(false)
              lastFetchedUid.current = firebaseUser.uid
              setLoading(false)
              return
            }
          }
        } catch { /* ignore cache errors */ }

        // 3단계: 캐시 미스 시에만 실제 Firestore 조회 (1 Read 발생)
        try {
          await fetchAndSetProfile(firebaseUser)
        } catch (e) {
          console.error('Failed to load user profile:', e)
        }
      } else {
        updateProfileState(null)
        setMissingDoc(false)
        lastFetchedUid.current = null
        try { sessionStorage.removeItem(PROFILE_CACHE_KEY) } catch { /* */ }
        clearMfaSession()
      }
      setLoading(false)
    })
    return () => unsubscribe()
  }, [fetchAndSetProfile, updateProfileState])

  const refreshProfile = useCallback(async () => {
    const currentUser = auth.currentUser || user
    if (!currentUser) return
    try {
      await fetchAndSetProfile(currentUser)
    } catch (e) {
      console.error('Failed to refresh profile:', e)
    }
  }, [user, fetchAndSetProfile])

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

    // [패치] 소셜 로그인 후 아직 프로필 문서가 없는 경우 → /complete-profile 로 안내
    if (missingDoc) {
      router.replace('/complete-profile')
      return
    }

    // user 는 있는데 네트워크 오류 등으로 profile 로드 실패 → 안전을 위해 /login 으로 강제
    if (!profile) { router.replace('/login'); return }

    // 계정 미승인 보강 가드
    if (!profile.isAdmin && profile.accountStatus !== 'approved') {
      try { sessionStorage.setItem('lofa_pending_reason', profile.accountStatus) } catch { /* */ }
      signOut(auth).finally(() => router.replace('/login'))
      return
    }

    // MFA 세션 통과 여부 확인
    if (!isMfaPassedInSession(user.uid)) {
      const needSetup = !profile.personalEmail || !profile.mfaPreference
      router.replace(needSetup ? '/mfa/setup' : '/mfa')
      return
    }

    // [패치] 일반 사용자가 /admin 경로에 접근 시도할 경우 차단 (불필요한 어드민 쿼리 과금 및 노출 방지)
    if ((pathname === '/admin' || pathname.startsWith('/admin/')) && !profile.isAdmin) {
      router.replace('/main')
      return
    }
  }, [user, profile, missingDoc, loading, pathname, router])

  return (
    <AuthContext.Provider value={{ user, profile, loading, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}

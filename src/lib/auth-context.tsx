'use client'

import { createContext, useContext, useEffect, useState, useRef } from 'react'
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

interface UserProfile {
  uid: string
  employeeId: string
  name: string
  department: string
  position: string
  email: string
  isAdmin: boolean
  status: string
  accountStatus: AccountStatus
  hireDate?: string
  phone?: string
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
            const p: UserProfile = {
              uid: firebaseUser.uid,
              employeeId: data['사번'] || data['employeeId'] || '',
              name: data['성명'] || data['이름'] || data['name'] || '',
              department: data['부서'] || data['department'] || '',
              position: data['직급'] || data['position'] || '',
              email: data['이메일'] || data['email'] || firebaseUser.email || '',
              isAdmin,
              status: data['status'] || 'active',
              accountStatus,
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
        const p: UserProfile = {
          uid: user.uid,
          employeeId: data['사번'] || data['employeeId'] || '',
          name: data['성명'] || data['이름'] || data['name'] || '',
          department: data['부서'] || data['department'] || '',
          position: data['직급'] || data['position'] || '',
          email: data['이메일'] || data['email'] || user.email || '',
          isAdmin,
          status: data['status'] || 'active',
          accountStatus,
          hireDate: data['입사일'] || data['hireDate'] || '',
          phone: data['전화번호'] || data['phone'] || '',
        }
        setProfile(p)
        lastFetchedUid.current = user.uid
        try { sessionStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({ data: p, ts: Date.now() })) } catch { /* */ }
      }
    } catch (e) { console.error('Failed to refresh profile:', e) }
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}

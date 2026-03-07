'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { User, onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase'

interface UserProfile {
  uid: string
  employeeId: string
  name: string
  department: string
  position: string
  email: string
  isAdmin: boolean
  status: string
  hireDate?: string
  phone?: string
}

interface AuthContextType {
  user: User | null
  profile: UserProfile | null
  loading: boolean
}

const AuthContext = createContext<AuthContextType>({ user: null, profile: null, loading: true })

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser)
      if (firebaseUser) {
        try {
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid))
          if (userDoc.exists()) {
            const data = userDoc.data()
            setProfile({
              uid: firebaseUser.uid,
              employeeId: data['사번'] || data['employeeId'] || '',
              name: data['성명'] || data['이름'] || data['name'] || '',
              department: data['부서'] || data['department'] || '',
              position: data['직급'] || data['position'] || '',
              email: data['이메일'] || data['email'] || firebaseUser.email || '',
              isAdmin: data['isAdmin'] === true || userDoc.id === 'admin',
              status: data['status'] || 'active',
              hireDate: data['입사일'] || data['hireDate'] || '',
              phone: data['전화번호'] || data['phone'] || '',
            })
          }
        } catch (e) {
          console.error('Failed to load user profile:', e)
        }
      } else {
        setProfile(null)
      }
      setLoading(false)
    })
    return () => unsubscribe()
  }, [])

  return (
    <AuthContext.Provider value={{ user, profile, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}

'use client'

import { useState } from 'react'
import { AuthProvider } from '@/lib/auth-context'
import AntigravityEffect from '@/components/AntigravityEffect'

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const [isAntigravityOn, setIsAntigravityOn] = useState(false)

  const toggleAntigravity = () => {
    setIsAntigravityOn(prev => !prev)
  }

  return (
    <AuthProvider>
      {children}
      {isAntigravityOn && <AntigravityEffect />}
    </AuthProvider>
  )
}

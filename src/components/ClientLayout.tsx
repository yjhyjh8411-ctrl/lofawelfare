'use client'

import { useState, lazy, Suspense } from 'react'
import { AuthProvider } from '@/lib/auth-context'

const AntigravityEffect = lazy(() => import('@/components/AntigravityEffect'))

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const [isAntigravityOn, setIsAntigravityOn] = useState(false)

  return (
    <AuthProvider>
      {children}
      {isAntigravityOn && (
        <Suspense fallback={null}>
          <AntigravityEffect />
        </Suspense>
      )}
    </AuthProvider>
  )
}

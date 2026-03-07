'use client'

import { useState } from 'react'
import type { Metadata } from 'next'
import { AuthProvider } from '@/lib/auth-context'
import AntigravityEffect from '@/components/AntigravityEffect'
import './globals.css'

// Metadata cannot be defined in a client component, so we export it separately.
export const metadata: Metadata = {
  title: '한국지방재정공제회 복지시스템',
  description: 'LOFA 복지신청 시스템',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const [isAntigravityOn, setIsAntigravityOn] = useState(false)

  const toggleAntigravity = () => {
    setIsAntigravityOn(prev => !prev)
  }

  return (
    <html lang="ko">
      <body>
        <AuthProvider>
          {children}
          {isAntigravityOn && <AntigravityEffect />}
        </AuthProvider>

        {/* Antigravity Toggle Button */}
        <button
          onClick={toggleAntigravity}
          style={{
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            zIndex: 10000,
            padding: '10px 15px',
            fontSize: '14px',
            backgroundColor: isAntigravityOn ? '#ef4444' : '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(0,0,0,0.2)',
            transition: 'background-color 0.3s ease',
          }}
          title={isAntigravityOn ? '중력 효과 끄기' : '중력 효과 켜기'}
        >
          {isAntigravityOn ? 'Stop Gravity' : 'Start Gravity'}
        </button>
      </body>
    </html>
  )
}

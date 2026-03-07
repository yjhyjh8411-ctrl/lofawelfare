'use client'

import { useRouter } from 'next/navigation'
import { signOut } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { useAuth } from '@/lib/auth-context'

export default function Navbar() {
  const { profile } = useAuth()
  const router = useRouter()

  const handleLogout = async () => {
    await signOut(auth)
    router.push('/login')
  }

  return (
    <nav style={{
      background: '#1a56db',
      color: '#fff',
      padding: '0 24px',
      height: 56,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        <span
          style={{ fontWeight: 700, fontSize: 18, cursor: 'pointer' }}
          onClick={() => router.push('/main')}
        >
          한국지방재정공제회 복지시스템
        </span>
        <button onClick={() => router.push('/main')} style={navBtnStyle}>홈</button>
        <button onClick={() => router.push('/my-status')} style={navBtnStyle}>내 신청현황</button>
        {profile?.isAdmin && (
          <button onClick={() => router.push('/admin')} style={navBtnStyle}>관리자</button>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {profile && (
          <span style={{ fontSize: 14 }}>
            {profile.name} ({profile.department}){' '}
            {profile.isAdmin && (
              <span style={{
                background: '#fbbf24',
                color: '#78350f',
                fontSize: 11,
                fontWeight: 700,
                padding: '2px 6px',
                borderRadius: 4,
                marginLeft: 4,
              }}>관리자</span>
            )}
          </span>
        )}
        <button onClick={handleLogout} style={{
          background: 'rgba(255,255,255,0.15)',
          color: '#fff',
          border: '1px solid rgba(255,255,255,0.3)',
          borderRadius: 6,
          padding: '5px 14px',
          cursor: 'pointer',
          fontSize: 13,
        }}>로그아웃</button>
      </div>
    </nav>
  )
}

const navBtnStyle: React.CSSProperties = {
  background: 'transparent',
  color: 'rgba(255,255,255,0.85)',
  border: 'none',
  cursor: 'pointer',
  fontSize: 14,
  padding: '4px 8px',
  borderRadius: 4,
}

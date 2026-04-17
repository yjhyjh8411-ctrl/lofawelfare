'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { signOut } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase'
import { useAuth } from '@/lib/auth-context'

interface DropdownItem {
  label: string
  href: string
}

const baseBoardMenu: DropdownItem[] = [
  { label: '공지사항', href: '/board/notices' },
  { label: '자주하는 질문', href: '/board/faq' },
]

const adminMenu = [
  { label: '신청내역', href: '/admin', icon: '📋' },
  { label: '이용자', href: '/admin/employees', icon: '👥' },
  { label: '공지사항', href: '/admin/notices', icon: '📢' },
  { label: '규정집', href: '/admin/regulations', icon: '📄' },
  { label: '복지사업', href: '/admin/forms', icon: '📝' },
  { label: '예산', href: '/admin/budget', icon: '💰' },
  { label: '회계결산', href: '/admin/settlement', icon: '📊' },
  { label: '설정', href: '/admin/settings', icon: '⚙️' },
]

export default function Navbar() {
  const { profile } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
  const [settlementPublic, setSettlementPublic] = useState(false)
  const navRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpenDropdown(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    getDoc(doc(db, 'settings', 'global')).then(snap => {
      if (snap.exists()) setSettlementPublic(!!snap.data()?.회계결산공개)
    })
  }, [])

  const handleLogout = async () => {
    await signOut(auth)
    router.push('/login')
  }

  const navigate = (href: string) => {
    setOpenDropdown(null)
    router.push(href)
  }

  const toggleDropdown = (name: string) => {
    setOpenDropdown(prev => prev === name ? null : name)
  }

  const isActive = (href: string) => pathname === href
  const isInGroup = (items: DropdownItem[]) => items.some(item => pathname.startsWith(item.href))

  return (
    <nav
      ref={navRef}
      style={{
        background: '#fff',
        borderBottom: '1px solid #e5e7eb',
        height: 60,
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      {/* Left: Logo + Menu */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Logo */}
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginRight: 16 }}
          onClick={() => navigate('/main')}
        >
          <div style={{
            width: 36, height: 36, borderRadius: '50%', background: '#1a56db',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 16, fontWeight: 800,
          }}>
            W
          </div>
          <div style={{ lineHeight: 1.2 }}>
            <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 500 }}>한국지방재정공제회</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>사내근로복지기금</div>
          </div>
        </div>

        {/* Nav Links - 일반 사용자만 */}
        {!profile?.isAdmin && (
          <>
            <NavLink label="신청 가능한 복지 항목" active={isActive('/apply') || isActive('/main')} onClick={() => navigate('/apply')} />
            <NavLink label="나의 신청 현황" active={isActive('/my-status')} onClick={() => navigate('/my-status')} />

            {/* 게시판 Dropdown */}
            {(() => {
              const boardMenu = settlementPublic
                ? [...baseBoardMenu, { label: '회계결산 현황', href: '/board/settlement' }]
                : baseBoardMenu
              return (
                <div style={{ position: 'relative' }}>
                  <button
                    onClick={() => toggleDropdown('board')}
                    style={{
                      ...navLinkStyle,
                      color: isInGroup(boardMenu) ? '#1a56db' : openDropdown === 'board' ? '#1a56db' : '#374151',
                      borderBottom: isInGroup(boardMenu) ? '2px solid #1a56db' : '2px solid transparent',
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}
                  >
                    게시판
                    <span style={{ fontSize: 10, transition: 'transform 0.2s', transform: openDropdown === 'board' ? 'rotate(180deg)' : 'rotate(0)' }}>▼</span>
                  </button>
                  {openDropdown === 'board' && (
                    <DropdownPanel items={boardMenu} onSelect={navigate} currentPath={pathname} />
                  )}
                </div>
              )
            })()}
          </>
        )}

        {/* 관리자 메뉴 - 가로 아이콘 나열 */}
        {profile?.isAdmin && adminMenu.map(item => {
          const active = item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href)
          return (
            <button
              key={item.href}
              onClick={() => navigate(item.href)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                padding: '8px 10px', borderRadius: 8,
                color: active ? '#1a56db' : '#6b7280',
                position: 'relative',
              }}
              title={item.label}
            >
              <span style={{ fontSize: 18 }}>{item.icon}</span>
              <span style={{ fontSize: 10, fontWeight: active ? 700 : 500, whiteSpace: 'nowrap' }}>{item.label}</span>
              {active && <div style={{ position: 'absolute', bottom: 0, left: '20%', right: '20%', height: 2, background: '#1a56db', borderRadius: 1 }} />}
            </button>
          )
        })}
      </div>

      {/* Right: User Info */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {profile && (
          <>
            <button
              onClick={() => navigate('/profile')}
              style={{
                background: '#1a56db',
                color: '#fff',
                border: 'none',
                borderRadius: 20,
                padding: '6px 16px',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {profile.name}
            </button>
            <button
              onClick={() => navigate('/profile')}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 4,
                display: 'flex',
                alignItems: 'center',
                color: '#6b7280',
              }}
              title="프로필"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </button>
            <button
              onClick={handleLogout}
              style={{
                background: '#fff',
                color: '#dc2626',
                border: '1px solid #fca5a5',
                borderRadius: 8,
                padding: '6px 14px',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              로그아웃
            </button>
          </>
        )}
      </div>
    </nav>
  )
}

function NavLink({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        ...navLinkStyle,
        color: active ? '#1a56db' : '#374151',
        borderBottom: active ? '2px solid #1a56db' : '2px solid transparent',
      }}
    >
      {label}
    </button>
  )
}

function DropdownPanel({ items, onSelect, currentPath }: { items: DropdownItem[]; onSelect: (href: string) => void; currentPath: string }) {
  return (
    <div style={{
      position: 'absolute',
      top: '100%',
      left: 0,
      marginTop: 4,
      background: '#fff',
      border: '1px solid #e5e7eb',
      borderRadius: 8,
      boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
      minWidth: 180,
      overflow: 'hidden',
      zIndex: 200,
    }}>
      {items.map(item => (
        <button
          key={item.href}
          onClick={() => onSelect(item.href)}
          style={{
            display: 'block',
            width: '100%',
            textAlign: 'left',
            padding: '11px 18px',
            border: 'none',
            background: currentPath === item.href ? '#eff6ff' : '#fff',
            color: currentPath === item.href ? '#1a56db' : '#374151',
            fontSize: 14,
            cursor: 'pointer',
            fontWeight: currentPath === item.href ? 600 : 400,
            borderBottom: '1px solid #f3f4f6',
          }}
          onMouseEnter={e => {
            if (currentPath !== item.href) (e.currentTarget as HTMLButtonElement).style.background = '#f9fafb'
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = currentPath === item.href ? '#eff6ff' : '#fff'
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}

const navLinkStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  fontSize: 14,
  fontWeight: 500,
  padding: '18px 12px',
  borderRadius: 0,
  transition: 'color 0.15s',
  whiteSpace: 'nowrap',
}

'use client'

import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'

interface QRCornerProps {
  /** QR 에 인코딩할 절대 URL. 미지정 시 현재 페이지 주소. */
  url?: string
  /** QR 카드 캡션 (예: "로그인 페이지") */
  caption?: string
  /** 위치: 기본 우하단 */
  position?: 'bottom-right' | 'bottom-left'
}

const SITE_BASE = 'https://lofawelfare-3ae73.web.app'

export default function QRCorner({ url, caption = '모바일로 열기', position = 'bottom-right' }: QRCornerProps) {
  const [resolved, setResolved] = useState<string>('')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (url) {
      // 상대경로면 사이트 도메인 앞에 붙이기
      setResolved(url.startsWith('http') ? url : `${SITE_BASE}${url.startsWith('/') ? url : `/${url}`}`)
      return
    }
    if (typeof window !== 'undefined') {
      // 로컬/스테이징 등 비프로덕션 도메인은 SITE_BASE + path 로 강제 (사내망에서 핸드폰으로 옮겨도 동작)
      const host = window.location.host
      if (host.includes('lofawelfare-3ae73.web.app') || host.includes('lofawelfare.firebaseapp.com')) {
        setResolved(window.location.origin + window.location.pathname)
      } else {
        setResolved(SITE_BASE + window.location.pathname)
      }
    }
  }, [url])

  if (!resolved) return null

  const posStyle: React.CSSProperties = position === 'bottom-left'
    ? { bottom: 16, left: 16 }
    : { bottom: 16, right: 16 }

  return (
    <>
      <div
        onClick={() => setOpen(true)}
        title="클릭하면 QR 크게 보기"
        style={{
          position: 'fixed',
          zIndex: 50,
          ...posStyle,
          background: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: 12,
          padding: 10,
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 4,
          userSelect: 'none',
        }}
      >
        <QRCodeSVG value={resolved} size={84} level="M" includeMargin={false} />
        <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 600 }}>📱 {caption}</span>
      </div>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: 16, padding: 24,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
              maxWidth: 360, width: '100%',
            }}
          >
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#111827' }}>{caption}</h3>
            <p style={{ fontSize: 12, color: '#6b7280', margin: 0, textAlign: 'center' }}>
              핸드폰 카메라로 QR을 찍으면 이 페이지로 바로 이동합니다.
            </p>
            <QRCodeSVG value={resolved} size={256} level="M" includeMargin={true} />
            <a href={resolved} style={{ fontSize: 12, color: '#1d4ed8', wordBreak: 'break-all', textAlign: 'center', textDecoration: 'none' }}>
              {resolved}
            </a>
            <button
              onClick={() => setOpen(false)}
              style={{
                marginTop: 4, background: '#1a56db', color: '#fff', border: 'none',
                borderRadius: 8, padding: '8px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
            >닫기</button>
          </div>
        </div>
      )}
    </>
  )
}

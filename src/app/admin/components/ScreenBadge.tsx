'use client'

import type { ScreenResult } from '@/lib/auto-screen'

interface Props {
  result?: ScreenResult
  size?: 'sm' | 'md'
}

export function ScreenBadge({ result, size = 'sm' }: Props) {
  if (!result) return null
  const isSm = size === 'sm'
  if (result.level === 'pass') {
    return (
      <span
        title="자동 사전심사 통과"
        style={{
          background: '#d1fae5',
          color: '#065f46',
          fontSize: isSm ? 10 : 11,
          fontWeight: 700,
          padding: isSm ? '1px 6px' : '2px 8px',
          borderRadius: 6,
          whiteSpace: 'nowrap',
        }}
      >✓ 통과</span>
    )
  }
  if (result.level === 'warn') {
    return (
      <span
        title={result.flags.map(f => `${f.label}${f.detail ? ' — ' + f.detail : ''}`).join('\n')}
        style={{
          background: '#fef3c7',
          color: '#92400e',
          fontSize: isSm ? 10 : 11,
          fontWeight: 700,
          padding: isSm ? '1px 6px' : '2px 8px',
          borderRadius: 6,
          whiteSpace: 'nowrap',
        }}
      >⚠ 경고 {result.flags.length}</span>
    )
  }
  return (
    <span
      title={result.flags.map(f => `${f.label}${f.detail ? ' — ' + f.detail : ''}`).join('\n')}
      style={{
        background: '#fee2e2',
        color: '#991b1b',
        fontSize: isSm ? 10 : 11,
        fontWeight: 700,
        padding: isSm ? '1px 6px' : '2px 8px',
        borderRadius: 6,
        whiteSpace: 'nowrap',
      }}
    >🚫 차단 {result.flags.length}</span>
  )
}

/** Detail Modal 안에 펼쳐서 보여줄 카드 */
export function ScreenPanel({ result }: { result?: ScreenResult }) {
  if (!result) return null
  const headerColor = result.level === 'pass' ? '#059669' : result.level === 'warn' ? '#92400e' : '#991b1b'
  const headerBg = result.level === 'pass' ? '#d1fae5' : result.level === 'warn' ? '#fef3c7' : '#fee2e2'
  const title = result.level === 'pass' ? '✓ 자동 사전심사 통과' : result.level === 'warn' ? `⚠ 자동 사전심사 — 경고 ${result.flags.length}건` : `🚫 자동 사전심사 — 차단 ${result.flags.length}건`
  return (
    <div style={{ borderRadius: 8, marginBottom: 16, border: `1px solid ${headerBg}`, overflow: 'hidden' }}>
      <div style={{ background: headerBg, color: headerColor, fontSize: 13, fontWeight: 700, padding: '8px 12px' }}>
        {title}
      </div>
      {result.flags.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: '8px 12px' }}>
          {result.flags.map((f, i) => {
            const color = f.level === 'block' ? '#991b1b' : f.level === 'warn' ? '#92400e' : '#065f46'
            const icon = f.level === 'block' ? '🚫' : f.level === 'warn' ? '⚠' : '✓'
            return (
              <li key={i} style={{ fontSize: 12, color: '#374151', padding: '4px 0', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                <span style={{ color, fontWeight: 700, flexShrink: 0 }}>{icon}</span>
                <span>
                  <strong style={{ color }}>{f.label}</strong>
                  {f.detail && <span style={{ color: '#6b7280', marginLeft: 6 }}>— {f.detail}</span>}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

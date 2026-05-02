'use client'

import type { Application } from '../types'
import { ScreenBadge } from './ScreenBadge'

interface PendingListProps {
  apps: Application[]
  onSelect: (app: Application) => void
}

const screenWeight = (s?: Application['screen']): number => {
  if (!s) return 0
  if (s.level === 'block') return 2
  if (s.level === 'warn') return 1
  return 0
}

export default function PendingList({ apps, onSelect }: PendingListProps) {
  // 자동심사 차단 → 경고 → 통과 순으로 정렬
  const sorted = [...apps].sort((a, b) => screenWeight(b.screen) - screenWeight(a.screen))
  const blockCnt = apps.filter(a => a.screen?.level === 'block').length
  const warnCnt = apps.filter(a => a.screen?.level === 'warn').length
  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.07)', maxHeight: 380, overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>🔔 승인 대기 목록 ({apps.length})</h3>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {blockCnt > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: '#991b1b', background: '#fee2e2', padding: '1px 6px', borderRadius: 6 }}>🚫 차단 {blockCnt}</span>}
          {warnCnt > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: '#92400e', background: '#fef3c7', padding: '1px 6px', borderRadius: 6 }}>⚠ 경고 {warnCnt}</span>}
          <span style={{ fontSize: 11, color: '#9ca3af' }}>심사 우선순</span>
        </div>
      </div>
      {apps.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#9ca3af', padding: '32px 0', fontSize: 13 }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>✔✔</div>
          처리할 내역이 없습니다.
        </div>
      ) : sorted.slice(0, 15).map(app => (
        <div key={app.id} onClick={() => onSelect(app)}
          style={{ padding: '9px 10px', borderRadius: 8, cursor: 'pointer', marginBottom: 4, border: '1px solid #f3f4f6' }}
          onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = '#eff6ff' }}
          onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = '' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'space-between' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{app.applicant?.성명} · {app.formTitle}</div>
            <ScreenBadge result={app.screen} />
          </div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{app.created_at?.toDate?.()?.toLocaleDateString('ko-KR')}</div>
        </div>
      ))}
    </div>
  )
}

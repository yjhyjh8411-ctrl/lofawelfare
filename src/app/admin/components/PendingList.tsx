'use client'

import type { Application } from '../types'

interface PendingListProps {
  apps: Application[]
  onSelect: (app: Application) => void
}

export default function PendingList({ apps, onSelect }: PendingListProps) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.07)', maxHeight: 380, overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>🔔 승인 대기 목록 ({apps.length})</h3>
        <span style={{ fontSize: 11, color: '#9ca3af' }}>최신순</span>
      </div>
      {apps.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#9ca3af', padding: '32px 0', fontSize: 13 }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>✔✔</div>
          처리할 내역이 없습니다.
        </div>
      ) : apps.slice(0, 15).map(app => (
        <div key={app.id} onClick={() => onSelect(app)}
          style={{ padding: '9px 10px', borderRadius: 8, cursor: 'pointer', marginBottom: 4, border: '1px solid #f3f4f6' }}
          onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = '#eff6ff' }}
          onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = '' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#111827' }}>{app.applicant?.성명} · {app.formTitle}</div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{app.created_at?.toDate?.()?.toLocaleDateString('ko-KR')}</div>
        </div>
      ))}
    </div>
  )
}

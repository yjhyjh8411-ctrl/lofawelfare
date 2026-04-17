'use client'

import type { Application, FormConfig } from '../types'
import { statusInfo } from '../utils'

interface ApplicationTableProps {
  apps: Application[]
  yearApps: Application[]
  pendingCount: number
  approvedCount: number
  rejectedCount: number
  statusFilter: 'all' | 'pending' | 'approved' | 'rejected'
  onStatusFilterChange: (s: 'all' | 'pending' | 'approved' | 'rejected') => void
  formFilter: string
  onFormFilterChange: (s: string) => void
  forms: FormConfig[]
  dataLoading: boolean
  onSelect: (app: Application) => void
  onApprove: (app: Application) => void
  onReject: (app: Application) => void
}

export default function ApplicationTable({
  apps, yearApps, pendingCount, approvedCount, rejectedCount,
  statusFilter, onStatusFilterChange,
  formFilter, onFormFilterChange, forms,
  dataLoading, onSelect, onApprove, onReject,
}: ApplicationTableProps) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.07)', overflow: 'hidden', marginBottom: 18 }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginRight: 4 }}>📋 신청 목록</h3>
        <select
          value={formFilter}
          onChange={e => onFormFilterChange(e.target.value)}
          style={{
            border: '1px solid #d1d5db', borderRadius: 6, padding: '4px 10px', fontSize: 12,
            fontWeight: 600, background: '#fff', cursor: 'pointer', outline: 'none', color: '#374151',
          }}
        >
          <option value="all">전체 신청서</option>
          {forms.map(f => (
            <option key={f.id} value={f.제목}>{f.제목}</option>
          ))}
        </select>
        <div style={{ flex: 1 }} />
        {(['all', 'pending', 'approved', 'rejected'] as const).map(s => (
          <button
            key={s}
            onClick={() => onStatusFilterChange(s)}
            style={{
              background: statusFilter === s ? '#1a56db' : '#f3f4f6',
              color: statusFilter === s ? '#fff' : '#374151',
              border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}
          >
            {s === 'all' ? `전체 (${yearApps.length})` : s === 'pending' ? `검토중 (${pendingCount})` : s === 'approved' ? `승인 (${approvedCount})` : `반려 (${rejectedCount})`}
          </button>
        ))}
      </div>

      <div style={{ overflowX: 'auto', maxHeight: 520, overflowY: 'auto' }}>
        {dataLoading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af', fontSize: 13 }}>로딩 중...</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
              <tr style={{ background: '#f9fafb' }}>
                {['사번', '성명', '부서', '신청항목', '신청일', '상태', '관리'].map(h => (
                  <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontWeight: 600, color: '#374151', borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap', fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {apps.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>신청 내역이 없습니다.</td></tr>
              ) : apps.map((app, idx) => {
                const date = app.created_at?.toDate?.()
                const si = statusInfo(app.status)
                return (
                  <tr
                    key={app.id}
                    onClick={() => onSelect(app)}
                    style={{ borderBottom: '1px solid #f3f4f6', background: idx % 2 === 0 ? '#fff' : '#fafafa', cursor: 'pointer' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = '#eff6ff' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = idx % 2 === 0 ? '#fff' : '#fafafa' }}
                  >
                    <td style={{ padding: '11px 14px', color: '#6b7280' }}>{app.applicant?.사번}</td>
                    <td style={{ padding: '11px 14px', fontWeight: 600, color: '#111827' }}>{app.applicant?.성명}</td>
                    <td style={{ padding: '11px 14px', color: '#374151' }}>{app.applicant?.부서}</td>
                    <td style={{ padding: '11px 14px' }}>
                      <span style={{ background: '#eff6ff', color: '#1a56db', padding: '2px 8px', borderRadius: 6, fontSize: 12, fontWeight: 600 }}>{app.formTitle}</span>
                    </td>
                    <td style={{ padding: '11px 14px', color: '#6b7280', whiteSpace: 'nowrap' }}>{date?.toLocaleDateString('ko-KR')}</td>
                    <td style={{ padding: '11px 14px' }}>
                      <span style={{ background: si.bg, color: si.color, padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>{si.text}</span>
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      {app.status === 'pending' && (
                        <div style={{ display: 'flex', gap: 5 }}>
                          <button
                            onClick={e => { e.stopPropagation(); onApprove(app) }}
                            style={{ background: '#d1fae5', color: '#065f46', border: 'none', borderRadius: 5, padding: '3px 9px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                          >승인</button>
                          <button
                            onClick={e => { e.stopPropagation(); onReject(app) }}
                            style={{ background: '#fee2e2', color: '#991b1b', border: 'none', borderRadius: 5, padding: '3px 9px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                          >반려</button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

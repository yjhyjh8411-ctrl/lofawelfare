'use client'

import type { Application, UserDoc, FormConfig } from '../types'
import { extractAmount } from '../utils'

interface CrossTableProps {
  users: UserDoc[]
  forms: FormConfig[]
  yearApps: Application[]
  dataLoading: boolean
  onSelect: (app: Application) => void
}

export default function CrossTable({ users, forms, yearApps, dataLoading, onSelect }: CrossTableProps) {
  const activeUsers = users.filter(u => u.status !== 'inactive')

  return (
    <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6' }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>📊 직원별 복지 신청 전체 내역 (사번/성명/직급/연락처 포함)</h3>
      </div>
      <div style={{ overflowX: 'auto', maxHeight: 330, overflowY: 'auto' }}>
        {dataLoading ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>로딩 중...</div>
        ) : (
          <table style={{ borderCollapse: 'collapse', fontSize: 12, minWidth: '100%' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 5 }}>
              <tr style={{ background: '#f9fafb' }}>
                <th style={{ padding: '9px 14px', textAlign: 'left', fontWeight: 600, color: '#374151', borderBottom: '2px solid #e5e7eb', minWidth: 180, whiteSpace: 'nowrap', fontSize: 11 }}>직원 상세 정보</th>
                {forms.map(f => (
                  <th key={f.id} style={{ padding: '9px 10px', textAlign: 'center', fontWeight: 600, color: '#374151', borderBottom: '2px solid #e5e7eb', minWidth: 90, maxWidth: 110, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 11 }}>
                    {f.제목.length > 6 ? f.제목.slice(0, 6) + '..' : f.제목}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activeUsers.map((u, idx) => {
                const userApps = yearApps.filter(a => a.applicant?.사번 === u.사번)
                return (
                  <tr key={u.id} style={{ borderBottom: '1px solid #f3f4f6', background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ padding: '8px 14px', verticalAlign: 'top' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <span style={{ fontWeight: 700, fontSize: 13, color: '#111827' }}>{u.성명}</span>
                        <span style={{ background: '#1a56db', color: '#fff', borderRadius: 4, padding: '1px 5px', fontSize: 10, fontWeight: 700 }}>{u.사번}</span>
                      </div>
                      <div style={{ color: '#6b7280', fontSize: 11 }}>■ {u.부서} / {u.직급}</div>
                      {u.전화번호 && <div style={{ color: '#6b7280', fontSize: 11 }}>📞 {u.전화번호}</div>}
                      {u.입사일 && <div style={{ color: '#6b7280', fontSize: 11 }}>🗓 입사: {u.입사일}</div>}
                    </td>
                    {forms.map(f => {
                      const appList = userApps.filter(a => a.form_id === f.id)
                      if (appList.length === 0) return <td key={f.id} />
                      const latest = appList[0]
                      const amount = extractAmount(latest.data)
                      const bg = latest.status === 'approved' ? '#d1fae5' : latest.status === 'rejected' ? '#fee2e2' : '#fef3c7'
                      const col = latest.status === 'approved' ? '#065f46' : latest.status === 'rejected' ? '#991b1b' : '#92400e'
                      return (
                        <td key={f.id} style={{ padding: '8px 6px', textAlign: 'center', verticalAlign: 'middle' }}>
                          <div
                            onClick={() => onSelect(latest)}
                            style={{ background: bg, color: col, borderRadius: 6, padding: '4px 6px', fontWeight: 700, cursor: 'pointer', fontSize: 12 }}
                          >
                            {amount > 0 ? amount.toLocaleString() : '신청'}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
              {activeUsers.length === 0 && (
                <tr><td colSpan={forms.length + 1} style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>직원 데이터가 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

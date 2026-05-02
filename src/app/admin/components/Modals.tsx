'use client'

import type { Application } from '../types'
import { statusInfo } from '../utils'
import { ScreenPanel } from './ScreenBadge'

// Shared styles
const btnAction: React.CSSProperties = { color: '#fff', border: 'none', borderRadius: 8, padding: '9px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }
const closeBtn: React.CSSProperties = { background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6b7280' }

export function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 32, width: 520, maxHeight: '88vh', overflow: 'auto' }}
        onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

interface DetailModalProps {
  app: Application
  decryptedValues: Record<string, string>
  onClose: () => void
  onApprove: () => void
  onReject: () => void
  onDelete: () => void
  onDecrypt: (key: string, value: string) => void
}

export function DetailModal({ app, decryptedValues, onClose, onApprove, onReject, onDelete, onDecrypt }: DetailModalProps) {
  return (
    <ModalOverlay onClose={onClose}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h3 style={{ fontSize: 18, fontWeight: 700 }}>{app.formTitle} 상세</h3>
        <button onClick={onClose} style={closeBtn}>✕</button>
      </div>
      <div style={{ background: '#f9fafb', borderRadius: 8, padding: 14, marginBottom: 16 }}>
        <p style={{ fontWeight: 600, marginBottom: 6, fontSize: 13 }}>신청자</p>
        <p style={{ color: '#374151', fontSize: 13 }}>
          {app.applicant?.성명} ({app.applicant?.사번}) · {app.applicant?.부서} · {app.applicant?.직급}
        </p>
        <p style={{ color: '#9ca3af', fontSize: 12, marginTop: 4 }}>
          상태: <span style={{ color: statusInfo(app.status).color, fontWeight: 600 }}>
            {statusInfo(app.status).text}
          </span>
          {app.created_at?.toDate && ` · ${app.created_at.toDate!().toLocaleDateString('ko-KR')}`}
        </p>
      </div>
      <ScreenPanel result={app.screen} />
      {app.data && Object.entries(app.data).map(([k, v]) => {
        let fileInfo: { url: string; name: string; size?: number } | null = null
        if (v && typeof v === 'object' && !Array.isArray(v)) {
          const obj = v as Record<string, unknown>
          if (typeof obj.url === 'string' && typeof obj.name === 'string') {
            fileInfo = { url: obj.url, name: obj.name, size: typeof obj.size === 'number' ? obj.size : undefined }
          }
        }
        const strV = fileInfo ? '' : String(v)
        const isEnc = strV.startsWith('enc:')
        const decKey = `${app.id}_${k}`
        const decrypted = decryptedValues[decKey]
        const isArray = Array.isArray(v)
        return (
          <div key={k} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid #f3f4f6', alignItems: 'flex-start' }}>
            <span style={{ color: '#6b7280', minWidth: 120, fontSize: 13, flexShrink: 0, paddingTop: 2 }}>{k}</span>
            {fileInfo ? (
              <a href={fileInfo.url} target="_blank" rel="noopener noreferrer"
                style={{ color: '#1a56db', fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6, background: '#eff6ff', padding: '4px 10px', borderRadius: 6, textDecoration: 'none' }}>
                📎 {fileInfo.name}
                {fileInfo.size && <span style={{ color: '#9ca3af', fontWeight: 400, fontSize: 11 }}>({(fileInfo.size / 1024).toFixed(1)} KB)</span>}
              </a>
            ) : isArray ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(v as unknown[]).map((item, i) => {
                  const obj = item as Record<string, unknown>
                  if (obj?.url && obj?.name) {
                    return (
                      <a key={i} href={String(obj.url)} target="_blank" rel="noopener noreferrer"
                        style={{ color: '#1a56db', fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4, background: '#eff6ff', padding: '4px 10px', borderRadius: 6, textDecoration: 'none' }}>
                        📎 {String(obj.name)}
                      </a>
                    )
                  }
                  return <span key={i} style={{ fontSize: 13 }}>{String(item)}</span>
                })}
              </div>
            ) : isEnc ? (
              decrypted ? (
                <span style={{ fontWeight: 500, fontSize: 13, color: '#dc2626' }}>{decrypted}</span>
              ) : (
                <button
                  onClick={() => onDecrypt(decKey, strV)}
                  style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 6, padding: '3px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                >🔒 보안처리됨 — 클릭하여 복호화</button>
              )
            ) : (
              <span style={{ fontWeight: 500, fontSize: 13 }}>{strV}</span>
            )}
          </div>
        )
      })}
      {app.status === 'rejected' && app.reject_reason && (
        <div style={{ background: '#fef2f2', borderRadius: 8, padding: 12, marginTop: 12 }}>
          <span style={{ color: '#dc2626', fontWeight: 600 }}>반려 사유: </span>
          <span style={{ color: '#dc2626' }}>{app.reject_reason}</span>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
        {app.status === 'pending' && (
          <>
            <button onClick={onApprove} style={{ ...btnAction, background: '#059669' }}>승인</button>
            <button onClick={onReject} style={{ ...btnAction, background: '#dc2626' }}>반려</button>
          </>
        )}
        <button onClick={onDelete} style={{ ...btnAction, background: '#6b7280' }}>삭제</button>
      </div>
    </ModalOverlay>
  )
}

interface RejectModalProps {
  rejectReason: string
  onReasonChange: (r: string) => void
  onConfirm: () => void
  onClose: () => void
}

export function RejectModal({ rejectReason, onReasonChange, onConfirm, onClose }: RejectModalProps) {
  return (
    <ModalOverlay onClose={onClose}>
      <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 16 }}>반려 사유 입력</h3>
      <textarea
        value={rejectReason} onChange={e => onReasonChange(e.target.value)}
        placeholder="반려 사유를 입력하세요" rows={4}
        style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 8, padding: 10, fontSize: 14, marginBottom: 16, resize: 'vertical', boxSizing: 'border-box' }}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onConfirm} style={{ ...btnAction, background: '#dc2626' }}>반려 처리</button>
        <button onClick={onClose} style={{ ...btnAction, background: '#6b7280' }}>취소</button>
      </div>
    </ModalOverlay>
  )
}

interface DeleteModalProps {
  app: Application
  onConfirm: () => void
  onClose: () => void
}

export function DeleteModal({ app, onConfirm, onClose }: DeleteModalProps) {
  return (
    <ModalOverlay onClose={onClose}>
      <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 12 }}>신청 삭제</h3>
      <p style={{ color: '#374151', marginBottom: 20 }}>
        [{app.formTitle}] 신청을 삭제하시겠습니까?<br />
        <span style={{ color: '#dc2626', fontSize: 13 }}>이 작업은 취소할 수 없습니다.</span>
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onConfirm} style={{ ...btnAction, background: '#dc2626' }}>삭제</button>
        <button onClick={onClose} style={{ ...btnAction, background: '#6b7280' }}>취소</button>
      </div>
    </ModalOverlay>
  )
}

interface AttachModalProps {
  apps: Application[]
  search: string
  onSearchChange: (s: string) => void
  onClose: () => void
}

export function AttachModal({ apps, search, onSearchChange, onClose }: AttachModalProps) {
  const allFiles = apps.flatMap(app => {
    if (!app.data) return []
    const files: { name: string; url: string; size?: number; date: Date | null }[] = []
    for (const v of Object.values(app.data)) {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        const obj = v as Record<string, unknown>
        if (typeof obj.url === 'string' && typeof obj.name === 'string') {
          files.push({ name: obj.name, url: obj.url, size: typeof obj.size === 'number' ? obj.size : undefined, date: app.created_at?.toDate?.() || null })
        }
      }
      if (Array.isArray(v)) {
        for (const item of v) {
          const obj = item as Record<string, unknown>
          if (obj?.url && obj?.name) {
            files.push({ name: String(obj.name), url: String(obj.url), size: typeof obj.size === 'number' ? obj.size : undefined, date: app.created_at?.toDate?.() || null })
          }
        }
      }
    }
    return files
  })
  const q = search.toLowerCase()
  const filtered = allFiles.filter(f => !q || f.name.toLowerCase().includes(q))

  return (
    <ModalOverlay onClose={onClose}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ fontSize: 18, fontWeight: 700 }}>📎 첨부파일 관리</h3>
        <button onClick={onClose} style={closeBtn}>✕</button>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 12 }}>
        <input
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="파일명 검색..."
          style={{ flex: 1, border: '1px solid #d1d5db', borderRadius: 8, padding: '7px 12px', fontSize: 13, outline: 'none' }}
        />
        <span style={{ fontSize: 13, color: '#6b7280', whiteSpace: 'nowrap' }}>총 {filtered.length}건</span>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: '#f9fafb' }}>
            {['파일명', '크기', '업로드일', '다운로드'].map(h => (
              <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 600, color: '#374151', borderBottom: '2px solid #e5e7eb', fontSize: 12, whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr><td colSpan={4} style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>첨부파일이 없습니다.</td></tr>
          ) : filtered.map((f, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
              <td style={{ padding: '9px 12px', maxWidth: 280 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>{f.name.endsWith('.pdf') ? '📄' : f.name.match(/\.(png|jpg|jpeg|gif)$/i) ? '🖼️' : '📎'}</span>
                  <span style={{ wordBreak: 'break-all', fontSize: 12, color: '#111827' }}>{f.name}</span>
                </div>
              </td>
              <td style={{ padding: '9px 12px', color: '#6b7280', whiteSpace: 'nowrap' }}>{f.size ? `${(f.size / 1024 / 1024).toFixed(1)} MB` : '-'}</td>
              <td style={{ padding: '9px 12px', color: '#6b7280', whiteSpace: 'nowrap' }}>{f.date?.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) || '-'}</td>
              <td style={{ padding: '9px 12px' }}>
                <a href={f.url} target="_blank" rel="noopener noreferrer"
                  style={{ background: '#eff6ff', color: '#1a56db', border: '1px solid #bfdbfe', borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                  ↓ 받기
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ModalOverlay>
  )
}

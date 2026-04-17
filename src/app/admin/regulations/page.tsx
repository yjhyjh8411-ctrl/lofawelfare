'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { collection, getDocs, doc, deleteDoc, setDoc, orderBy, query, serverTimestamp } from 'firebase/firestore'
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '@/lib/firebase'
import { useAuth } from '@/lib/auth-context'
import Navbar from '@/components/Navbar'

interface RegFile { name: string; url: string }
interface RegDoc { id: string; 버전명: string; files: RegFile[]; createdAt?: unknown }

export default function AdminRegulationsPage() {
  const { user, profile, loading } = useAuth()
  const router = useRouter()
  const [regulations, setRegulations] = useState<RegDoc[]>([])
  const [dataLoading, setDataLoading] = useState(true)
  const [regVersion, setRegVersion] = useState('')
  const [regFiles, setRegFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (!loading && (!user || !profile?.isAdmin)) router.replace('/main')
  }, [user, profile, loading, router])

  useEffect(() => {
    if (!profile?.isAdmin) return
    getDocs(query(collection(db, 'regulations'), orderBy('createdAt', 'desc'))).then(snap => {
      setRegulations(snap.docs.map(d => ({ id: d.id, ...d.data() } as RegDoc)))
    }).finally(() => setDataLoading(false))
  }, [profile])

  const showMsg = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 3000) }

  const handleUpload = async () => {
    if (!regVersion || regFiles.length === 0) { showMsg('버전명과 파일을 입력해주세요.'); return }
    setUploading(true)
    try {
      const uploaded: RegFile[] = []
      for (const file of regFiles) {
        const fileRef = storageRef(storage, `regulations/${Date.now()}_${file.name}`)
        await uploadBytes(fileRef, file)
        uploaded.push({ name: file.name, url: await getDownloadURL(fileRef) })
      }
      const regDocRef = doc(collection(db, 'regulations'))
      await setDoc(regDocRef, { 버전명: regVersion, files: uploaded, createdAt: serverTimestamp() })
      setRegulations(prev => [{ id: regDocRef.id, 버전명: regVersion, files: uploaded }, ...prev])
      setRegVersion('')
      setRegFiles([])
      showMsg('규정집이 등록되었습니다.')
    } catch { showMsg('업로드 중 오류가 발생했습니다.') }
    finally { setUploading(false) }
  }

  const handleDelete = async (reg: RegDoc) => {
    if (!confirm(`"${reg.버전명}" 규정집을 삭제하시겠습니까?`)) return
    await deleteDoc(doc(db, 'regulations', reg.id))
    setRegulations(prev => prev.filter(r => r.id !== reg.id))
    showMsg('규정집이 삭제되었습니다.')
  }

  if (loading || !profile?.isAdmin) return null

  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6' }}>
      <Navbar />
      {msg && (
        <div style={{ position: 'fixed', top: 72, left: '50%', transform: 'translateX(-50%)', background: '#1a56db', color: '#fff', padding: '12px 24px', borderRadius: 8, zIndex: 9999, fontWeight: 600 }}>
          {msg}
        </div>
      )}
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 16px' }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: '#111827', marginBottom: 24 }}>📄 규정집 관리</h2>

        {/* 등록 폼 */}
        <div style={{ background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', marginBottom: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>새 규정집 등록</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>버전명</label>
              <input value={regVersion} onChange={e => setRegVersion(e.target.value)} placeholder="예: 2026년 개정판" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>파일 첨부 (여러 개 선택 가능)</label>
              <input type="file" multiple onChange={e => setRegFiles(Array.from(e.target.files || []))} style={{ width: '100%', fontSize: 13, paddingTop: 8 }} />
            </div>
          </div>
          {regFiles.length > 0 && (
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 12 }}>선택된 파일: {regFiles.map(f => f.name).join(', ')}</div>
          )}
          <button onClick={handleUpload} disabled={uploading}
            style={{ background: uploading ? '#9ca3af' : '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 24px', fontWeight: 600, fontSize: 14, cursor: uploading ? 'not-allowed' : 'pointer' }}>
            {uploading ? '업로드 중...' : '규정집 등록'}
          </button>
        </div>

        {/* 목록 */}
        <div style={{ background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>등록된 규정집 ({regulations.length})</h3>
          {dataLoading ? (
            <p style={{ color: '#9ca3af', fontSize: 13 }}>로딩 중...</p>
          ) : regulations.length === 0 ? (
            <p style={{ color: '#9ca3af', fontSize: 13 }}>등록된 규정집이 없습니다.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {regulations.map(reg => (
                <div key={reg.id} style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>{reg.버전명}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {reg.files.map((f, i) => (
                        <a key={i} href={f.url} target="_blank" rel="noopener noreferrer"
                          style={{ background: '#eff6ff', color: '#1a56db', padding: '3px 10px', borderRadius: 6, fontSize: 12, textDecoration: 'none' }}>
                          📎 {f.name}
                        </a>
                      ))}
                    </div>
                  </div>
                  <button onClick={() => handleDelete(reg)}
                    style={{ background: '#fee2e2', color: '#991b1b', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
                    삭제
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = { display: 'block', fontWeight: 600, marginBottom: 5, fontSize: 13, color: '#374151' }
const inputStyle: React.CSSProperties = { width: '100%', border: '1px solid #d1d5db', borderRadius: 8, padding: '9px 12px', fontSize: 14, outline: 'none', boxSizing: 'border-box' }

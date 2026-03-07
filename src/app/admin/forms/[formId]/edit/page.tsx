'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { doc, getDoc, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/lib/auth-context'
import Navbar from '@/components/Navbar'

interface FormField {
  id: string
  label: string
  type: 'text' | 'number' | 'date' | 'select' | 'textarea' | 'file'
  required: boolean
  sensitive?: boolean
  options?: string
}

export default function FormEditPage() {
  const { formId } = useParams()
  const { profile, loading } = useAuth()
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [fields, setFields] = useState<FormField[]>([])
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (!loading && !profile?.isAdmin) router.replace('/main')
  }, [profile, loading, router])

  useEffect(() => {
    if (!formId) return
    getDoc(doc(db, 'form_configs', String(formId))).then(snap => {
      if (snap.exists()) {
        const d = snap.data()
        setTitle(d.제목 || '')
        setDesc(d.설명 || '')
        setFields((d.fields || []).map((f: FormField & { options?: string[] | string }) => ({
          ...f,
          options: Array.isArray(f.options) ? f.options.join('\n') : (f.options || ''),
        })))
      }
    })
  }, [formId])

  const addField = () => {
    setFields(prev => [...prev, {
      id: `field_${Date.now()}`,
      label: '',
      type: 'text',
      required: false,
      sensitive: false,
      options: '',
    }])
  }

  const updateField = (idx: number, key: keyof FormField, value: string | boolean) => {
    setFields(prev => prev.map((f, i) => i === idx ? { ...f, [key]: value } : f))
  }

  const removeField = (idx: number) => {
    setFields(prev => prev.filter((_, i) => i !== idx))
  }

  const handleSave = async () => {
    if (!formId) return
    setSaving(true)
    const saveFields = fields.map(f => ({
      id: f.id,
      label: f.label,
      type: f.type,
      required: f.required,
      sensitive: f.sensitive || false,
      ...(f.type === 'select' ? { options: f.options?.split('\n').filter(Boolean) } : {}),
    }))
    await updateDoc(doc(db, 'form_configs', String(formId)), {
      제목: title,
      설명: desc,
      fields: saveFields,
    })
    setSaving(false)
    setMsg('저장되었습니다.')
    setTimeout(() => setMsg(''), 3000)
  }

  if (loading) return null

  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6' }}>
      <Navbar />
      {msg && (
        <div style={{ position: 'fixed', top: 72, left: '50%', transform: 'translateX(-50%)', background: '#1a56db', color: '#fff', padding: '12px 24px', borderRadius: 8, zIndex: 9999, fontWeight: 600 }}>
          {msg}
        </div>
      )}
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '32px 16px' }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', color: '#1a56db', cursor: 'pointer', fontSize: 13, marginBottom: 16 }}>← 폼 목록</button>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: '#111827', marginBottom: 24 }}>폼 편집</h2>

        <div style={{ background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', marginBottom: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>기본 정보</h3>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>폼 제목</label>
            <input value={title} onChange={e => setTitle(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>설명</label>
            <input value={desc} onChange={e => setDesc(e.target.value)} style={inputStyle} />
          </div>
        </div>

        <div style={{ background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700 }}>입력 필드 ({fields.length}개)</h3>
            <button onClick={addField} style={{ background: '#1a56db', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 16px', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
              + 필드 추가
            </button>
          </div>

          {fields.map((f, idx) => (
            <div key={f.id} style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 16, marginBottom: 12 }}>
              <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                <div style={{ flex: 2 }}>
                  <label style={labelStyle}>필드 이름</label>
                  <input
                    value={f.label}
                    onChange={e => updateField(idx, 'label', e.target.value)}
                    placeholder="예: 신청금액"
                    style={inputStyle}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>타입</label>
                  <select value={f.type} onChange={e => updateField(idx, 'type', e.target.value)} style={inputStyle}>
                    <option value="text">텍스트</option>
                    <option value="number">숫자</option>
                    <option value="date">날짜</option>
                    <option value="select">선택</option>
                    <option value="textarea">장문</option>
                    <option value="file">📎 파일첨부</option>
                  </select>
                </div>
              </div>

              {f.type === 'select' && (
                <div style={{ marginBottom: 10 }}>
                  <label style={labelStyle}>선택 옵션 (줄마다 입력)</label>
                  <textarea
                    value={f.options || ''}
                    onChange={e => updateField(idx, 'options', e.target.value)}
                    placeholder="옵션1&#10;옵션2&#10;옵션3"
                    rows={3}
                    style={{ ...inputStyle, resize: 'vertical' }}
                  />
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 16 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                    <input type="checkbox" checked={f.required} onChange={e => updateField(idx, 'required', e.target.checked)} />
                    <span>필수 항목</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                    <input type="checkbox" checked={f.sensitive || false} onChange={e => updateField(idx, 'sensitive', e.target.checked)} />
                    <span style={{ color: '#dc2626', fontWeight: 600 }}>🔒 개인정보 암호화</span>
                  </label>
                </div>
                <button
                  onClick={() => removeField(idx)}
                  style={{ background: '#fee2e2', color: '#991b1b', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                >
                  삭제
                </button>
              </div>
            </div>
          ))}

          {fields.length === 0 && (
            <div style={{ textAlign: 'center', color: '#9ca3af', padding: '20px 0' }}>필드를 추가하세요.</div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ background: saving ? '#93c5fd' : '#1a56db', color: '#fff', border: 'none', borderRadius: 8, padding: '11px 28px', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}
          >
            {saving ? '저장 중...' : '저장'}
          </button>
          <button onClick={() => router.back()} style={{ background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 8, padding: '11px 28px', fontWeight: 600, cursor: 'pointer' }}>
            취소
          </button>
        </div>
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = { display: 'block', fontWeight: 600, marginBottom: 5, fontSize: 13, color: '#374151' }
const inputStyle: React.CSSProperties = { width: '100%', border: '1px solid #d1d5db', borderRadius: 8, padding: '9px 12px', fontSize: 14, outline: 'none' }

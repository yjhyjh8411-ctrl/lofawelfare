'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { doc, getDoc, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/lib/auth-context'
import Navbar from '@/components/Navbar'

interface FormField {
  id: string
  label: string
  type: 'text' | 'number' | 'amount' | 'date' | 'select' | 'textarea' | 'file' | 'account' | 'radio' | 'medical_records' | 'scholarship_records' | 'children_records' | 'loan_agreement' | 'housing_agreement' | 'vaccination_records' | 'living_records' | 'cultural_records'
  required: boolean
  sensitive?: boolean
  options?: string
  hint?: string
}

export default function FormEditPage() {
  const params = useParams()
  const { profile, loading } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const formId = searchParams.get('formId') || (params.formId === '_' ? null : params.formId)
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [icon, setIcon] = useState('')
  const [color, setColor] = useState('')
  const [limitDesc, setLimitDesc] = useState('')
  const [contentNote, setContentNote] = useState('')
  const [requireLoan, setRequireLoan] = useState(false)
  const [requireHousing, setRequireHousing] = useState(false)
  const [housingTriggerFieldId, setHousingTriggerFieldId] = useState('')
  const [housingTriggerValues, setHousingTriggerValues] = useState<string[]>([])
  const [fields, setFields] = useState<FormField[]>([])
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)

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
        setIcon(d.icon || '')
        setColor(d.color || '')
        setLimitDesc(d.한도설명 || '')
        setContentNote(d.신청내용주석 || '')
        setRequireLoan(d.대부동의필요 === true)
        setRequireHousing(d.무주택서약필요 === true)
        setHousingTriggerFieldId(d.무주택서약조건필드ID || '')
        setHousingTriggerValues(Array.isArray(d.무주택서약조건값들) ? d.무주택서약조건값들 : [])
        setFields((d.fields || []).map((f: FormField & { options?: string[] | string; hint?: string }) => ({
          ...f,
          options: Array.isArray(f.options) ? f.options.join('\n') : (f.options || ''),
          hint: f.hint || '',
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
      hint: '',
    }])
  }

  const updateField = (idx: number, key: keyof FormField, value: string | boolean) => {
    setFields(prev => prev.map((f, i) => i === idx ? { ...f, [key]: value } : f))
  }

  const removeField = (idx: number) => {
    setFields(prev => prev.filter((_, i) => i !== idx))
  }

  const moveField = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= fields.length || to >= fields.length) return
    setFields(prev => {
      const arr = [...prev]
      const [moved] = arr.splice(from, 1)
      arr.splice(to, 0, moved)
      return arr
    })
  }

  const handleFieldDragStart = (idx: number) => (e: React.DragEvent) => {
    setDragIdx(idx)
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
  }
  const handleFieldDragOver = (idx: number) => (e: React.DragEvent) => {
    e.preventDefault()
    if (dragIdx !== null && idx !== dragIdx) setDragOverIdx(idx)
  }
  const handleFieldDrop = (idx: number) => () => {
    if (dragIdx !== null) moveField(dragIdx, idx)
    setDragIdx(null)
    setDragOverIdx(null)
  }
  const handleFieldDragEnd = () => {
    setDragIdx(null)
    setDragOverIdx(null)
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
      hint: f.hint || '',
      ...((f.type === 'select' || f.type === 'radio') ? { options: f.options?.split('\n').filter(Boolean) } : {}),
    }))
    await updateDoc(doc(db, 'form_configs', String(formId)), {
      제목: title,
      설명: desc,
      icon,
      color,
      한도설명: limitDesc,
      신청내용주석: contentNote,
      대부동의필요: requireLoan,
      무주택서약필요: requireHousing,
      무주택서약조건필드ID: housingTriggerFieldId || '',
      무주택서약조건값들: housingTriggerValues,
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
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>설명</label>
            <input value={desc} onChange={e => setDesc(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>아이콘 (이모지)</label>
              <input value={icon} onChange={e => setIcon(e.target.value)} placeholder="예: 🏠" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>색상 코드</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input value={color} onChange={e => setColor(e.target.value)} placeholder="예: #4285f4" style={{ ...inputStyle, flex: 1 }} />
                {color && <div style={{ width: 32, height: 32, borderRadius: 6, background: color, border: '1px solid #d1d5db', flexShrink: 0 }} />}
              </div>
            </div>
          </div>
          <div>
            <label style={labelStyle}>한도 설명 (카드 하단 표시 · 최대 2줄, 각 줄 18자)</label>
            <textarea
              value={limitDesc}
              onChange={e => {
                const lines = e.target.value.split('\n').slice(0, 2).map(l => l.slice(0, 18))
                setLimitDesc(lines.join('\n'))
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' && limitDesc.split('\n').length >= 2) {
                  e.preventDefault()
                }
              }}
              placeholder={'예: 연 300만원\n(미취학/장애인)'}
              rows={2}
              style={{ ...inputStyle, maxWidth: 320, resize: 'none', fontFamily: 'inherit', lineHeight: 1.5 }}
            />
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
              {limitDesc.split('\n').length} / 2줄 · 줄당 {Math.max(...limitDesc.split('\n').map(l => l.length), 0)} / 18자
            </div>
          </div>
          {(formId === 'loan-application' || /대부/.test(title)) && (
          <div style={{ marginTop: 18, padding: 14, background: '#f9fafb', borderRadius: 8, border: '1px solid #e5e7eb' }}>
            <label style={{ ...labelStyle, marginBottom: 8 }}>🏦 대부신청 폼 전용 — 자동 동의 섹션</label>
            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 10 }}>
              주택구입자금·주택임차자금·생활안정자금 신청 시 사용자에게 노출될 자동 동의 섹션입니다.
            </div>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', marginBottom: 6 }}>
              <input
                type="checkbox"
                checked={requireLoan}
                onChange={e => setRequireLoan(e.target.checked)}
                style={{ marginTop: 3 }}
              />
              <span style={{ fontSize: 13, lineHeight: 1.5 }}>
                <strong style={{ color: '#1a56db' }}>📝 [서식2] 대부규정 준수 및 이자비용 등 공제납부 동의서</strong>
                <span style={{ color: '#6b7280', fontSize: 12, display: 'block' }}>주택구입자금·주택임차자금·생활안정자금 모두 필수 (전체 대부)</span>
              </span>
            </label>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={requireHousing}
                onChange={e => setRequireHousing(e.target.checked)}
                style={{ marginTop: 3 }}
              />
              <span style={{ fontSize: 13, lineHeight: 1.5 }}>
                <strong style={{ color: '#1a56db' }}>🏠 [서식3] 무주택·1주택 서약서</strong>
                <span style={{ color: '#6b7280', fontSize: 12, display: 'block' }}>주택구입자금·주택임차자금만 필수 (생활안정 제외) — 아래에서 조건 필드 지정</span>
              </span>
            </label>
            {requireHousing && (
              <div style={{ marginTop: 10, padding: 12, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                  서식3 노출 조건 — 어떤 라디오/드롭다운 필드의 어떤 값을 선택했을 때 서약서를 요구할지
                </div>
                <select
                  value={housingTriggerFieldId}
                  onChange={e => { setHousingTriggerFieldId(e.target.value); setHousingTriggerValues([]) }}
                  style={{ ...inputStyle, marginBottom: 8 }}
                >
                  <option value="">-- 조건 미설정 (항상 서식3 표시) --</option>
                  {fields.filter(f => f.type === 'radio' || f.type === 'select').map(f => (
                    <option key={f.id} value={f.id}>{f.label || '(이름 없음)'} ({f.type === 'radio' ? '라디오' : '드롭다운'})</option>
                  ))}
                </select>
                {housingTriggerFieldId && (() => {
                  const tf = fields.find(f => f.id === housingTriggerFieldId)
                  const opts = (tf?.options || '').split('\n').map(s => s.trim()).filter(Boolean)
                  if (opts.length === 0) return <div style={{ fontSize: 11, color: '#dc2626' }}>선택한 필드에 옵션이 없습니다. 먼저 필드의 선택 옵션을 입력하세요.</div>
                  return (
                    <div>
                      <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>다음 값 선택 시 서식3 노출:</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {opts.map(opt => (
                          <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '4px 10px', background: housingTriggerValues.includes(opt) ? '#dbeafe' : '#f3f4f6', borderRadius: 6, cursor: 'pointer', border: housingTriggerValues.includes(opt) ? '1px solid #1a56db' : '1px solid #e5e7eb' }}>
                            <input
                              type="checkbox"
                              checked={housingTriggerValues.includes(opt)}
                              onChange={e => {
                                if (e.target.checked) setHousingTriggerValues(prev => [...prev, opt])
                                else setHousingTriggerValues(prev => prev.filter(v => v !== opt))
                              }}
                              style={{ margin: 0 }}
                            />
                            {opt}
                          </label>
                        ))}
                      </div>
                    </div>
                  )
                })()}
              </div>
            )}
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 8 }}>
              체크 시 사용자 신청서에 개인정보 동의처럼 자동 섹션으로 추가됩니다.
            </div>
          </div>
          )}
          <div style={{ marginTop: 14 }}>
            <label style={labelStyle}>신청 내용 하단 안내문 (2번 섹션 하단 노란박스 표시 · 최대 2줄)</label>
            <textarea
              value={contentNote}
              onChange={e => {
                const lines = e.target.value.split('\n').slice(0, 2)
                setContentNote(lines.join('\n'))
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' && contentNote.split('\n').length >= 2) {
                  e.preventDefault()
                }
              }}
              placeholder={'예: 본인, 배우자, 직계존비속 명의 영수증만 인정\n신청 전 담당자에게 사전 문의 바랍니다'}
              rows={2}
              style={{ ...inputStyle, resize: 'none', fontFamily: 'inherit', lineHeight: 1.5 }}
            />
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
              {contentNote.split('\n').length} / 2줄 · 사용자 신청서 화면 「② 신청 내용」 하단에 노란 안내박스로 표시됩니다
            </div>
          </div>
        </div>

        <div style={{ background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700 }}>입력 필드 ({fields.length}개)</h3>
            <button onClick={addField} style={{ background: '#1a56db', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 16px', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
              + 필드 추가
            </button>
          </div>

          {fields.length > 0 && (
            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 8 }}>
              ⋮⋮ 좌측 핸들을 드래그하여 필드 순서를 변경할 수 있습니다.
            </div>
          )}
          {fields.map((f, idx) => (
            <div
              key={f.id}
              draggable
              onDragStart={handleFieldDragStart(idx)}
              onDragOver={handleFieldDragOver(idx)}
              onDrop={handleFieldDrop(idx)}
              onDragEnd={handleFieldDragEnd}
              style={{
                border: dragOverIdx === idx ? '2px solid #1a56db' : '1px solid #e5e7eb',
                borderRadius: 10,
                padding: 16,
                marginBottom: 12,
                opacity: dragIdx === idx ? 0.4 : 1,
                transition: 'border-color 0.15s, opacity 0.15s',
                background: '#fff',
                position: 'relative',
              }}
            >
              <div style={{ display: 'flex', gap: 10, marginBottom: 10, alignItems: 'flex-start' }}>
                <div
                  style={{
                    cursor: 'grab',
                    color: '#9ca3af',
                    fontSize: 14,
                    padding: '8px 4px',
                    userSelect: 'none',
                    lineHeight: 1,
                    fontWeight: 700,
                    letterSpacing: -1,
                    alignSelf: 'center',
                  }}
                  title="드래그하여 순서 변경"
                >⋮⋮</div>
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
                    <option value="amount">금액 (원)</option>
                    <option value="date">날짜</option>
                    <option value="select">드롭다운 선택</option>
                    <option value="radio">라디오 선택</option>
                    <option value="textarea">장문</option>
                    <option value="file">📎 파일첨부</option>
                    <option value="account">🏦 계좌번호 (은행/계좌/예금주)</option>
                    <option value="medical_records">🏥 의료비 내역 (표)</option>
                    <option value="vaccination_records">💉 예방접종 내역 (표)</option>
                    <option value="scholarship_records">🎓 장학금 내역 (표)</option>
                    <option value="living_records">🛍️ 생활복지 내역 (표)</option>
                    <option value="cultural_records">🎭 문화활동 내역 (표)</option>
                    <option value="children_records">👶 자녀 정보 (표)</option>
                    {/* 대부/주택 동의는 상단 체크박스로 자동 처리 — 필드 타입은 구버전 호환만 유지 */}
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: 10 }}>
                <label style={labelStyle}>주석 (사용자에게 표시되는 안내문)</label>
                <input
                  value={f.hint || ''}
                  onChange={e => updateField(idx, 'hint', e.target.value)}
                  placeholder="예: 본인 부담금만 입력해주세요"
                  style={{ ...inputStyle, fontSize: 13, color: '#6b7280' }}
                />
              </div>

              {(f.type === 'select' || f.type === 'radio') && (
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

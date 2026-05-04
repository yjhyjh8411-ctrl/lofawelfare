'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  collection, getDocs, doc, updateDoc, deleteDoc, addDoc, orderBy, query,
  setDoc, getDoc, serverTimestamp, writeBatch,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/lib/auth-context'
import Navbar from '@/components/Navbar'

interface FormConfig {
  id: string
  제목: string
  설명: string
  isActive: boolean
  order: number
  fields?: unknown[]
  icon?: string
  color?: string
  periods?: { year: number; start: string; end: string }[]
}

interface BudgetGroup {
  id: string
  name: string
  limitAmount: number
  period: 'annual' | 'monthly'
  formIds: string[]
}

const emptyGroup = (): Omit<BudgetGroup, 'id'> => ({
  name: '',
  limitAmount: 0,
  period: 'annual',
  formIds: [],
})

export default function AdminFormsPage() {
  const { profile, loading } = useAuth()
  const router = useRouter()
  const [forms, setForms] = useState<FormConfig[]>([])
  const [groups, setGroups] = useState<BudgetGroup[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [newForm, setNewForm] = useState({ 제목: '', 설명: '' })
  const [copySourceId, setCopySourceId] = useState<string | null>(null)
  const [msg, setMsg] = useState('')

  // Group modal
  const [groupModal, setGroupModal] = useState<BudgetGroup | null>(null) // null = add new, non-null = edit
  const [groupModalOpen, setGroupModalOpen] = useState(false)
  const [groupData, setGroupData] = useState<Omit<BudgetGroup, 'id'>>(emptyGroup())
  const [groupSaving, setGroupSaving] = useState(false)

  // Drag and drop
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)

  useEffect(() => {
    if (!loading && !profile?.isAdmin) router.replace('/main')
  }, [profile, loading, router])

  useEffect(() => {
    if (!profile?.isAdmin) return
    getDocs(query(collection(db, 'form_configs'), orderBy('order'))).then(snap => {
      setForms(snap.docs.map(d => ({ id: d.id, ...d.data() } as FormConfig)))
    })
    getDocs(collection(db, 'budget_groups')).then(snap => {
      setGroups(snap.docs.map(d => ({ id: d.id, ...d.data() } as BudgetGroup)))
    })
  }, [profile])

  const showMsg = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 3000) }

  const toggleActive = async (f: FormConfig) => {
    await updateDoc(doc(db, 'form_configs', f.id), { isActive: !f.isActive })
    setForms(prev => prev.map(x => x.id === f.id ? { ...x, isActive: !f.isActive } : x))
  }

  const handleDelete = async (f: FormConfig) => {
    if (!confirm(`'${f.제목}' 복지사업을 삭제하시겠습니까?`)) return
    await deleteDoc(doc(db, 'form_configs', f.id))
    setForms(prev => prev.filter(x => x.id !== f.id))
    showMsg('삭제되었습니다.')
  }

  const handleAdd = async () => {
    if (!newForm.제목.trim()) return
    const newOrder = forms.length > 0 ? Math.max(...forms.map(f => f.order || 0)) + 1 : 1

    // Copy fields from source if selected
    let copiedData: Record<string, unknown> = {}
    if (copySourceId) {
      const sourceSnap = await getDoc(doc(db, 'form_configs', copySourceId))
      if (sourceSnap.exists()) {
        const d = sourceSnap.data()
        copiedData = {
          fields: d.fields || [],
          icon: d.icon || '',
          color: d.color || '',
          한도설명: d.한도설명 || '',
        }
      }
    }

    const ref = await addDoc(collection(db, 'form_configs'), {
      제목: newForm.제목,
      설명: newForm.설명,
      isActive: false,
      order: newOrder,
      fields: [],
      ...copiedData,
    })
    setForms(prev => [...prev, { id: ref.id, ...newForm, isActive: false, order: newOrder, fields: copiedData.fields as unknown[] || [] }])
    setNewForm({ 제목: '', 설명: '' })
    setCopySourceId(null)
    setShowAdd(false)
    showMsg(copySourceId ? '기존 사업을 복사하여 추가되었습니다.' : '복지사업이 추가되었습니다.')
  }

  const openAddGroup = () => {
    setGroupModal(null)
    setGroupData(emptyGroup())
    setGroupModalOpen(true)
  }

  const openEditGroup = (g: BudgetGroup) => {
    setGroupModal(g)
    setGroupData({ name: g.name, limitAmount: g.limitAmount, period: g.period, formIds: [...g.formIds] })
    setGroupModalOpen(true)
  }

  const handleSaveGroup = async () => {
    if (!groupData.name.trim()) return
    setGroupSaving(true)
    try {
      if (groupModal) {
        // Edit
        await setDoc(doc(db, 'budget_groups', groupModal.id), { ...groupData, updatedAt: serverTimestamp() }, { merge: true })
        setGroups(prev => prev.map(g => g.id === groupModal.id ? { ...g, ...groupData } : g))
        showMsg('그룹이 수정되었습니다.')
      } else {
        // Add
        const ref = await addDoc(collection(db, 'budget_groups'), { ...groupData, createdAt: serverTimestamp() })
        setGroups(prev => [...prev, { id: ref.id, ...groupData }])
        showMsg('그룹이 추가되었습니다.')
      }
      setGroupModalOpen(false)
    } finally { setGroupSaving(false) }
  }

  const handleDeleteGroup = async () => {
    if (!groupModal || !confirm(`'${groupModal.name}' 그룹을 삭제하시겠습니까?`)) return
    await deleteDoc(doc(db, 'budget_groups', groupModal.id))
    setGroups(prev => prev.filter(g => g.id !== groupModal.id))
    setGroupModalOpen(false)
    showMsg('그룹이 삭제되었습니다.')
  }

  const moveForm = async (idx: number, dir: -1 | 1) => {
    const target = idx + dir
    if (target < 0 || target >= forms.length) return
    const a = forms[idx]
    const b = forms[target]
    const reordered = [...forms]
    reordered[idx] = b
    reordered[target] = a
    const renumbered = reordered.map((f, i) => ({ ...f, order: i + 1 }))
    setForms(renumbered)
    const batch = writeBatch(db)
    batch.update(doc(db, 'form_configs', a.id), { order: renumbered.findIndex(x => x.id === a.id) + 1 })
    batch.update(doc(db, 'form_configs', b.id), { order: renumbered.findIndex(x => x.id === b.id) + 1 })
    await batch.commit()
  }

  const reorderForms = async (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= forms.length || to >= forms.length) return
    const reordered = [...forms]
    const [moved] = reordered.splice(from, 1)
    reordered.splice(to, 0, moved)
    const renumbered = reordered.map((f, i) => ({ ...f, order: i + 1 }))
    setForms(renumbered)
    const batch = writeBatch(db)
    renumbered.forEach((f, i) => batch.update(doc(db, 'form_configs', f.id), { order: i + 1 }))
    await batch.commit()
    showMsg('순서가 저장되었습니다.')
  }

  const handleFormDragStart = (idx: number) => (e: React.DragEvent) => {
    setDragIdx(idx)
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
  }
  const handleFormDragOver = (idx: number) => (e: React.DragEvent) => {
    e.preventDefault()
    if (dragIdx !== null && idx !== dragIdx) setDragOverIdx(idx)
  }
  const handleFormDrop = (idx: number) => () => {
    if (dragIdx !== null) reorderForms(dragIdx, idx)
    setDragIdx(null)
    setDragOverIdx(null)
  }
  const handleFormDragEnd = () => {
    setDragIdx(null)
    setDragOverIdx(null)
  }

  /** 일회성 마이그레이션: 경조비지원 폼 신청금액 위에 대상자/관계/지원대상 3필드 추가 */
  const handleMigrateCondolenceFields = async () => {
    try {
      const target = forms.find(f => f.id === 'condolence-support' || f.제목 === '경조비지원')
      if (!target) {
        showMsg('경조비지원 폼을 찾을 수 없습니다.')
        return
      }
      const snap = await getDoc(doc(db, 'form_configs', target.id))
      if (!snap.exists()) {
        showMsg('경조비지원 폼 데이터를 읽지 못했습니다.')
        return
      }
      const data = snap.data()
      const existing: { id: string; label: string; type: string; required?: boolean; sensitive?: boolean; options?: string[] | string }[] =
        Array.isArray(data.fields) ? data.fields : []

      const newFields = [
        { id: 'target_name', label: '대상자 성명', type: 'text', required: true, sensitive: false },
        { id: 'target_relation', label: '신청인과의 관계', type: 'select', required: true, sensitive: false, options: ['본인', '배우자', '자녀', '부', '모', '형제자매', '조부모', '기타'] },
        { id: 'event_target', label: '지원대상 경조사', type: 'select', required: true, sensitive: false, options: ['본인 결혼', '자녀 결혼', '출산', '부모상', '배우자상', '자녀상', '형제자매상', '조부모상', '기타'] },
      ]

      // 이미 추가되어 있는지 검사
      const existingIds = new Set(existing.map(f => f.id))
      const toInsert = newFields.filter(f => !existingIds.has(f.id))
      if (toInsert.length === 0) {
        showMsg('이미 추가된 필드입니다.')
        return
      }

      // amount 필드 위치 찾기 (없으면 끝에 추가)
      const amountIdx = existing.findIndex(f => f.id === 'amount' || /신청\s*금액|amount/i.test(f.label))
      const insertAt = amountIdx >= 0 ? amountIdx : existing.length
      const merged = [...existing.slice(0, insertAt), ...toInsert, ...existing.slice(insertAt)]

      await updateDoc(doc(db, 'form_configs', target.id), { fields: merged })
      showMsg(`${toInsert.length}개 필드 추가 완료 — ${toInsert.map(f => f.label).join(', ')}`)
    } catch (e) {
      console.error(e)
      showMsg('필드 추가 실패: ' + (e instanceof Error ? e.message : String(e)))
    }
  }

  const updateFormPeriods = async (formId: string, periods: { year: number; start: string; end: string }[]) => {
    await updateDoc(doc(db, 'form_configs', formId), { periods })
    setForms(prev => prev.map(f => f.id === formId ? { ...f, periods } : f))
  }

  const addPeriod = (formId: string, existing: { year: number; start: string; end: string }[]) => {
    const currentYear = new Date().getFullYear()
    updateFormPeriods(formId, [...existing, { year: currentYear, start: '', end: '' }])
  }

  const removePeriod = (formId: string, existing: { year: number; start: string; end: string }[], idx: number) => {
    updateFormPeriods(formId, existing.filter((_, i) => i !== idx))
  }

  const updatePeriodField = (formId: string, existing: { year: number; start: string; end: string }[], idx: number, field: 'year' | 'start' | 'end', value: string | number) => {
    const updated = existing.map((p, i) => i === idx ? { ...p, [field]: value } : p)
    updateFormPeriods(formId, updated)
  }

  const toggleFormInGroup = (formId: string) => {
    setGroupData(p => ({
      ...p,
      formIds: p.formIds.includes(formId)
        ? p.formIds.filter(id => id !== formId)
        : [...p.formIds, formId],
    }))
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
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '32px 16px' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <button onClick={() => router.back()} style={{ background: 'none', border: 'none', color: '#1a56db', cursor: 'pointer', fontSize: 13, marginBottom: 8 }}>← 관리자</button>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: '#111827' }}>신청서 관리</h2>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleMigrateCondolenceFields}
              title="경조비지원 폼에 대상자/관계/지원대상 필드를 신청금액 위에 추가"
              style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}
            >
              🔧 경조비지원 필드 동기화
            </button>
            <button
              onClick={() => setShowAdd(!showAdd)}
              style={{ background: '#1a56db', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 600, cursor: 'pointer' }}
            >
              + 복지사업 추가
            </button>
          </div>
        </div>

        {/* Add form */}
        {showAdd && (
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, marginBottom: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>새 복지사업 추가</h3>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>기존 사업에서 불러오기</label>
              <select
                onChange={async e => {
                  const id = e.target.value
                  if (!id) return
                  const snap = await getDoc(doc(db, 'form_configs', id))
                  if (snap.exists()) {
                    const d = snap.data()
                    setNewForm({ 제목: (d.제목 || '') + ' (복사)', 설명: d.설명 || '' })
                    setCopySourceId(id)
                  }
                  e.target.value = ''
                }}
                style={inputStyle}
              >
                <option value="">-- 기존 사업 선택 (선택사항) --</option>
                {forms.map(f => (
                  <option key={f.id} value={f.id}>{f.제목}</option>
                ))}
              </select>
              {copySourceId && (
                <div style={{ marginTop: 6, fontSize: 12, color: '#059669' }}>
                  ✓ 기존 폼의 필드와 설정을 복사합니다. 제목과 설명을 수정 후 추가하세요.
                </div>
              )}
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>제목 *</label>
              <input
                value={newForm.제목}
                onChange={e => setNewForm(p => ({ ...p, 제목: e.target.value }))}
                placeholder="폼 제목"
                style={inputStyle}
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>설명</label>
              <input
                value={newForm.설명}
                onChange={e => setNewForm(p => ({ ...p, 설명: e.target.value }))}
                placeholder="폼 설명 (선택)"
                style={inputStyle}
              />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleAdd} style={{ background: '#1a56db', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 20px', fontWeight: 600, cursor: 'pointer' }}>추가</button>
              <button onClick={() => { setShowAdd(false); setCopySourceId(null) }} style={{ background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: 8, padding: '9px 20px', fontWeight: 600, cursor: 'pointer' }}>취소</button>
            </div>
          </div>
        )}

        {/* Forms list */}
        {forms.length > 0 && (
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>
            ⋮⋮ 좌측 핸들을 드래그하거나 ▲▼ 버튼으로 사용자 메인 화면의 카드 노출 순서를 변경할 수 있습니다.
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 36 }}>
          {forms.map((f, fIdx) => {
            const currentYear = new Date().getFullYear()
            const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - 1 + i)
            const isFirst = fIdx === 0
            const isLast = fIdx === forms.length - 1
            return (
              <div
                key={f.id}
                draggable
                onDragStart={handleFormDragStart(fIdx)}
                onDragOver={handleFormDragOver(fIdx)}
                onDrop={handleFormDrop(fIdx)}
                onDragEnd={handleFormDragEnd}
                style={{
                  background: '#fff',
                  borderRadius: 10,
                  padding: '16px 20px',
                  boxShadow: dragOverIdx === fIdx ? '0 0 0 2px #1a56db' : '0 1px 3px rgba(0,0,0,0.06)',
                  opacity: dragIdx === fIdx ? 0.4 : (f.isActive ? 1 : 0.65),
                  transition: 'box-shadow 0.15s, opacity 0.15s',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div
                      style={{ cursor: 'grab', color: '#9ca3af', fontSize: 14, padding: '4px 2px', userSelect: 'none', lineHeight: 1, fontWeight: 700, letterSpacing: -1 }}
                      title="드래그하여 순서 변경"
                    >⋮⋮</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <button
                        onClick={() => moveForm(fIdx, -1)}
                        disabled={isFirst}
                        title="위로 이동"
                        style={{
                          background: isFirst ? '#f3f4f6' : '#fff',
                          border: '1px solid #d1d5db',
                          borderRadius: 4,
                          padding: '2px 6px',
                          fontSize: 11,
                          color: isFirst ? '#d1d5db' : '#374151',
                          cursor: isFirst ? 'not-allowed' : 'pointer',
                          lineHeight: 1,
                        }}
                      >▲</button>
                      <button
                        onClick={() => moveForm(fIdx, 1)}
                        disabled={isLast}
                        title="아래로 이동"
                        style={{
                          background: isLast ? '#f3f4f6' : '#fff',
                          border: '1px solid #d1d5db',
                          borderRadius: 4,
                          padding: '2px 6px',
                          fontSize: 11,
                          color: isLast ? '#d1d5db' : '#374151',
                          cursor: isLast ? 'not-allowed' : 'pointer',
                          lineHeight: 1,
                        }}
                      >▼</button>
                    </div>
                    <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 700, minWidth: 20, textAlign: 'center' }}>{fIdx + 1}</span>
                    {f.icon && <span style={{ fontSize: 22 }}>{f.icon}</span>}
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 15, color: '#111827' }}>{f.제목}</div>
                      <div style={{ color: '#6b7280', fontSize: 13 }}>{f.설명}</div>
                      <div style={{ marginTop: 5, display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{
                          background: f.isActive ? '#d1fae5' : '#f3f4f6',
                          color: f.isActive ? '#065f46' : '#6b7280',
                          padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600,
                        }}>
                          {f.isActive ? '활성' : '비활성'}
                        </span>
                        <span style={{ color: '#9ca3af', fontSize: 11 }}>필드 {(f.fields || []).length}개</span>
                        {groups.some(g => g.formIds.includes(f.id)) && (
                          <span style={{ background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600 }}>
                            {groups.find(g => g.formIds.includes(f.id))?.name}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => router.push(`/admin/forms/_/edit/?formId=${f.id}`)} style={btnOutline}>편집</button>
                    <button onClick={() => toggleActive(f)} style={{ ...btnOutline, color: f.isActive ? '#dc2626' : '#059669', borderColor: f.isActive ? '#fecaca' : '#a7f3d0' }}>
                      {f.isActive ? '비활성화' : '활성화'}
                    </button>
                    <button onClick={() => handleDelete(f)} style={{ ...btnOutline, color: '#dc2626', borderColor: '#fecaca' }}>삭제</button>
                  </div>
                </div>
                {/* 신청기간 설정 (다수) */}
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #f3f4f6' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#6b7280' }}>신청기간</label>
                    <button
                      onClick={() => addPeriod(f.id, f.periods || [])}
                      style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: 6, padding: '3px 10px', fontSize: 11, color: '#374151', cursor: 'pointer', fontWeight: 600 }}
                    >
                      + 기간 추가
                    </button>
                  </div>
                  {(f.periods || []).length === 0 && (
                    <div style={{ fontSize: 12, color: '#9ca3af' }}>설정된 신청기간이 없습니다.</div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {(f.periods || []).map((p, idx) => {
                      const now = new Date().toISOString().slice(0, 10)
                      const status = p.start && p.end ? (now < p.start ? '예정' : now > p.end ? '마감' : '진행중') : null
                      const statusColor = status === '예정' ? '#f59e0b' : status === '마감' ? '#dc2626' : '#059669'
                      return (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <select
                            value={p.year}
                            onChange={e => updatePeriodField(f.id, f.periods || [], idx, 'year', Number(e.target.value))}
                            style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '4px 8px', fontSize: 12, outline: 'none', width: 80 }}
                          >
                            {yearOptions.map(y => (
                              <option key={y} value={y}>{y}년</option>
                            ))}
                          </select>
                          <input
                            type="date"
                            value={p.start}
                            onChange={e => updatePeriodField(f.id, f.periods || [], idx, 'start', e.target.value)}
                            style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '4px 8px', fontSize: 12, outline: 'none' }}
                          />
                          <span style={{ fontSize: 12, color: '#9ca3af' }}>~</span>
                          <input
                            type="date"
                            value={p.end}
                            onChange={e => updatePeriodField(f.id, f.periods || [], idx, 'end', e.target.value)}
                            style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '4px 8px', fontSize: 12, outline: 'none' }}
                          />
                          {status && (
                            <span style={{ fontSize: 11, fontWeight: 600, color: statusColor }}>{status}</span>
                          )}
                          <button
                            onClick={() => removePeriod(f.id, f.periods || [], idx)}
                            style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 14, padding: '0 4px' }}
                          >
                            ✕
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )
          })}
          {forms.length === 0 && (
            <div style={{ textAlign: 'center', color: '#9ca3af', padding: 40 }}>등록된 복지사업이 없습니다.</div>
          )}
        </div>

        {/* Budget Groups */}
        <div style={{ borderTop: '2px solid #e5e7eb', paddingTop: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: '#111827', marginBottom: 2 }}>예산 공유 그룹</h3>
              <p style={{ fontSize: 12, color: '#9ca3af' }}>여러 신청서가 하나의 한도를 공유하는 그룹을 설정합니다.</p>
            </div>
            <button
              onClick={openAddGroup}
              style={{ background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}
            >
              + 그룹 추가
            </button>
          </div>

          {groups.length === 0 ? (
            <div style={{ background: '#fff', borderRadius: 10, padding: '24px 20px', textAlign: 'center', color: '#9ca3af', fontSize: 13, border: '1px dashed #d1d5db' }}>
              등록된 예산 공유 그룹이 없습니다.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {groups.map(g => {
                const groupForms = forms.filter(f => g.formIds.includes(f.id))
                return (
                  <div key={g.id} style={{ background: '#fff', borderRadius: 10, padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#92400e', background: '#fef3c7', padding: '2px 10px', borderRadius: 8 }}>{g.name}</span>
                        <span style={{ fontSize: 12, color: '#6b7280' }}>{g.period === 'annual' ? '연간' : '월간'} {g.limitAmount.toLocaleString()}원</span>
                      </div>
                      <div style={{ fontSize: 12, color: '#9ca3af' }}>
                        포함: {groupForms.length > 0 ? groupForms.map(f => f.제목).join(' · ') : '(없음)'}
                      </div>
                    </div>
                    <button onClick={() => openEditGroup(g)} style={btnOutline}>편집</button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Group modal */}
      {groupModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => setGroupModalOpen(false)}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 32, width: 520, maxHeight: '88vh', overflow: 'auto' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ fontSize: 17, fontWeight: 700 }}>예산 공유 그룹 {groupModal ? '편집' : '추가'}</h3>
              <button onClick={() => setGroupModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6b7280' }}>✕</button>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>그룹 이름 *</label>
              <input
                value={groupData.name}
                onChange={e => setGroupData(p => ({ ...p, name: e.target.value }))}
                placeholder="예: 통합한도"
                style={inputStyle}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div>
                <label style={labelStyle}>공유 한도 금액 (원)</label>
                <input
                  type="number"
                  value={groupData.limitAmount || ''}
                  onChange={e => setGroupData(p => ({ ...p, limitAmount: Number(e.target.value) }))}
                  placeholder="예: 4800000"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>한도 주기</label>
                <select
                  value={groupData.period}
                  onChange={e => setGroupData(p => ({ ...p, period: e.target.value as 'annual' | 'monthly' }))}
                  style={inputStyle}
                >
                  <option value="annual">연간</option>
                  <option value="monthly">월간</option>
                </select>
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>포함 신청서</label>
              <div style={{ border: '1px solid #d1d5db', borderRadius: 8, maxHeight: 200, overflowY: 'auto', padding: '8px 12px' }}>
                {forms.map(f => (
                  <label key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', cursor: 'pointer', fontSize: 13, color: '#374151' }}>
                    <input
                      type="checkbox"
                      checked={groupData.formIds.includes(f.id)}
                      onChange={() => toggleFormInGroup(f.id)}
                    />
                    {f.제목} <span style={{ color: '#9ca3af', fontSize: 11 }}>({f.id})</span>
                  </label>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              {groupModal && (
                <button onClick={handleDeleteGroup} style={{ background: '#fff', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 8, padding: '9px 16px', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
                  삭제
                </button>
              )}
              <div style={{ flex: 1 }} />
              <button onClick={() => setGroupModalOpen(false)} style={{ background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: 8, padding: '9px 18px', fontWeight: 600, cursor: 'pointer' }}>취소</button>
              <button onClick={handleSaveGroup} disabled={groupSaving} style={{ background: '#1a56db', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 22px', fontWeight: 600, cursor: groupSaving ? 'not-allowed' : 'pointer' }}>
                {groupSaving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const labelStyle: React.CSSProperties = { display: 'block', fontWeight: 600, marginBottom: 5, fontSize: 13, color: '#374151' }
const inputStyle: React.CSSProperties = { width: '100%', border: '1px solid #d1d5db', borderRadius: 8, padding: '9px 12px', fontSize: 14, outline: 'none', boxSizing: 'border-box' }
const btnOutline: React.CSSProperties = { background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }

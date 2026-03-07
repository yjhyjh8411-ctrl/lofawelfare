'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  collection, getDocs, doc, updateDoc, deleteDoc, addDoc, orderBy, query,
  setDoc, serverTimestamp,
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
  const [msg, setMsg] = useState('')

  // Group modal
  const [groupModal, setGroupModal] = useState<BudgetGroup | null>(null) // null = add new, non-null = edit
  const [groupModalOpen, setGroupModalOpen] = useState(false)
  const [groupData, setGroupData] = useState<Omit<BudgetGroup, 'id'>>(emptyGroup())
  const [groupSaving, setGroupSaving] = useState(false)

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
    if (!confirm(`'${f.제목}' 폼을 삭제하시겠습니까?`)) return
    await deleteDoc(doc(db, 'form_configs', f.id))
    setForms(prev => prev.filter(x => x.id !== f.id))
    showMsg('삭제되었습니다.')
  }

  const handleAdd = async () => {
    if (!newForm.제목.trim()) return
    const newOrder = forms.length > 0 ? Math.max(...forms.map(f => f.order || 0)) + 1 : 1
    const ref = await addDoc(collection(db, 'form_configs'), {
      제목: newForm.제목,
      설명: newForm.설명,
      isActive: false,
      order: newOrder,
      fields: [],
    })
    setForms(prev => [...prev, { id: ref.id, ...newForm, isActive: false, order: newOrder, fields: [] }])
    setNewForm({ 제목: '', 설명: '' })
    setShowAdd(false)
    showMsg('폼이 추가되었습니다.')
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
          <button
            onClick={() => setShowAdd(!showAdd)}
            style={{ background: '#1a56db', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 600, cursor: 'pointer' }}
          >
            + 폼 추가
          </button>
        </div>

        {/* Add form */}
        {showAdd && (
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, marginBottom: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>새 폼 추가</h3>
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
              <button onClick={() => setShowAdd(false)} style={{ background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: 8, padding: '9px 20px', fontWeight: 600, cursor: 'pointer' }}>취소</button>
            </div>
          </div>
        )}

        {/* Forms list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 36 }}>
          {forms.map(f => (
            <div key={f.id} style={{
              background: '#fff', borderRadius: 10, padding: '16px 20px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              opacity: f.isActive ? 1 : 0.65,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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
                <button onClick={() => router.push(`/admin/forms/${f.id}/edit`)} style={btnOutline}>편집</button>
                <button onClick={() => toggleActive(f)} style={{ ...btnOutline, color: f.isActive ? '#dc2626' : '#059669', borderColor: f.isActive ? '#fecaca' : '#a7f3d0' }}>
                  {f.isActive ? '비활성화' : '활성화'}
                </button>
                <button onClick={() => handleDelete(f)} style={{ ...btnOutline, color: '#dc2626', borderColor: '#fecaca' }}>삭제</button>
              </div>
            </div>
          ))}
          {forms.length === 0 && (
            <div style={{ textAlign: 'center', color: '#9ca3af', padding: 40 }}>등록된 폼이 없습니다.</div>
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

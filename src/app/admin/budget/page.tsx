'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { collection, getDocs, doc, setDoc, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/lib/auth-context'
import Navbar from '@/components/Navbar'

interface FormConfig {
  id: string
  제목: string
  isActive: boolean
}

interface BudgetItem {
  id: string
  category: string
  annualBudget: number
  formId?: string
}

export default function BudgetManagementPage() {
  const { user, profile, loading } = useAuth()
  const router = useRouter()
  const [forms, setForms] = useState<FormConfig[]>([])
  const [budgetItems, setBudgetItems] = useState<BudgetItem[]>([])
  const [approvedByForm, setApprovedByForm] = useState<Record<string, number>>({})
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [budgetYear, setBudgetYear] = useState(new Date().getFullYear())
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [dataLoading, setDataLoading] = useState(true)

  useEffect(() => {
    if (!loading && (!user || !profile?.isAdmin)) router.replace('/main')
  }, [user, profile, loading, router])

  useEffect(() => {
    if (!profile?.isAdmin) return
    const load = async () => {
      setDataLoading(true)
      try {
        // Load forms
        const formsSnap = await getDocs(collection(db, 'form_configs'))
        const formList = formsSnap.docs
          .map(d => ({ id: d.id, ...d.data() } as FormConfig))
          .filter(f => f.isActive)
        setForms(formList)

        // Load budget config for selected year
        try {
          const budgetSnap = await getDocs(query(collection(db, 'budgets'), where('year', '==', selectedYear)))
          if (!budgetSnap.empty) {
            const budgetData = budgetSnap.docs[0].data()
            setBudgetItems(budgetData.items || [])
            setBudgetYear(budgetData.budgetYear || selectedYear)
          } else {
            // Initialize from form_configs
            setBudgetItems(formList.map(f => ({
              id: f.id,
              category: f.제목,
              annualBudget: 0,
              formId: f.id,
            })))
            setBudgetYear(selectedYear)
          }
        } catch {
          setBudgetItems(formList.map(f => ({
            id: f.id,
            category: f.제목,
            annualBudget: 0,
            formId: f.id,
          })))
        }

        // Load approved amounts for selected year
        const appsSnap = await getDocs(collection(db, 'applications'))
        const byForm: Record<string, number> = {}
        appsSnap.docs.forEach(d => {
          const app = d.data()
          if (app.status !== 'approved') return
          const created = app.created_at?.toDate?.()
          if (!created || created.getFullYear() !== selectedYear) return
          const amt = extractAmount(app.data)
          byForm[app.form_id] = (byForm[app.form_id] || 0) + amt
        })
        setApprovedByForm(byForm)
      } catch (e) { console.error(e) }
      finally { setDataLoading(false) }
    }
    load()
  }, [profile, selectedYear])

  const showMsg = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 3000) }

  const handleBudgetChange = (idx: number, value: string) => {
    const num = Number(value.replace(/,/g, ''))
    setBudgetItems(prev => prev.map((item, i) => i === idx ? { ...item, annualBudget: isNaN(num) ? 0 : num } : item))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await setDoc(doc(db, 'budgets', `${selectedYear}`), {
        year: selectedYear,
        budgetYear: budgetYear,
        items: budgetItems,
        updatedAt: new Date(),
      })
      showMsg('예산이 저장되었습니다.')
    } catch (e) {
      console.error(e)
      showMsg('저장 중 오류가 발생했습니다.')
    }
    finally { setSaving(false) }
  }

  if (loading || !profile?.isAdmin) return null

  const totalBudgetSum = budgetItems.reduce((s, item) => s + item.annualBudget, 0)
  const totalUsed = Object.values(approvedByForm).reduce((s, v) => s + v, 0)

  const yearOptions = []
  for (let y = new Date().getFullYear() + 1; y >= 2020; y--) yearOptions.push(y)

  return (
    <div style={{ minHeight: '100vh', background: '#f8f9fa', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <Navbar />
      {msg && (
        <div style={{ position: 'fixed', top: 72, left: '50%', transform: 'translateX(-50%)', background: '#1a56db', color: '#fff', padding: '12px 24px', borderRadius: 8, zIndex: 9999, fontWeight: 600, boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>
          {msg}
        </div>
      )}

      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '32px 20px 60px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: '#111827', marginBottom: 6 }}>예산관리</h1>
            <p style={{ fontSize: 14, color: '#6b7280' }}>예산기수는 사용자에게 노출되는 연도입니다. 연도를 선택해 예산을 편집하고 저장합니다.</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 500 }}>예산기수</span>
              <select value={budgetYear} onChange={e => setBudgetYear(Number(e.target.value))} style={selectStyle}>
                {yearOptions.map(y => <option key={y} value={y}>{y}년</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 500 }}>연도</span>
              <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} style={selectStyle}>
                {yearOptions.map(y => <option key={y} value={y}>{y}년</option>)}
              </select>
            </div>
            <button onClick={handleSave} disabled={saving} style={{
              background: '#1a56db', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 24px',
              fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontSize: 14,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>

        {/* Summary cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, margin: '24px 0' }}>
          <div style={summaryCardStyle}>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>카테고리별 총예산 합계</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#111827' }}>{totalBudgetSum.toLocaleString()}원</div>
          </div>
          <div style={summaryCardStyle}>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>집행액</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#f59e0b' }}>{totalUsed.toLocaleString()}원</div>
          </div>
          <div style={summaryCardStyle}>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>잔여 예산</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: (totalBudgetSum - totalUsed) >= 0 ? '#059669' : '#dc2626' }}>
              {(totalBudgetSum - totalUsed).toLocaleString()}원
            </div>
            {totalBudgetSum > 0 && (
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                집행률 {((totalUsed / totalBudgetSum) * 100).toFixed(1)}%
              </div>
            )}
          </div>
        </div>

        {/* Budget table */}
        {dataLoading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>로딩 중...</div>
        ) : (
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                  <th style={{ padding: '14px 20px', textAlign: 'left', fontWeight: 600, color: '#374151', fontSize: 14 }}>카테고리</th>
                  <th style={{ padding: '14px 20px', textAlign: 'center', fontWeight: 600, color: '#374151', fontSize: 14, width: 220 }}>총예산 (원)</th>
                  <th style={{ padding: '14px 20px', textAlign: 'right', fontWeight: 600, color: '#374151', fontSize: 14, width: 160 }}>집행액</th>
                  <th style={{ padding: '14px 20px', textAlign: 'right', fontWeight: 600, color: '#374151', fontSize: 14, width: 120 }}>잔여</th>
                  <th style={{ padding: '14px 20px', textAlign: 'right', fontWeight: 600, color: '#374151', fontSize: 14, width: 100 }}>집행률</th>
                </tr>
              </thead>
              <tbody>
                {budgetItems.map((item, idx) => {
                  const used = approvedByForm[item.formId || item.id] || 0
                  const remaining = item.annualBudget - used
                  const rate = item.annualBudget > 0 ? (used / item.annualBudget) * 100 : 0
                  return (
                    <tr key={item.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '14px 20px' }}>
                        <span style={{ color: '#1a56db', fontWeight: 500, fontSize: 14 }}>{item.category}</span>
                      </td>
                      <td style={{ padding: '14px 20px', textAlign: 'center' }}>
                        <input
                          type="text"
                          value={item.annualBudget.toLocaleString()}
                          onChange={e => handleBudgetChange(idx, e.target.value)}
                          style={{
                            width: 170,
                            border: '1px solid #d1d5db',
                            borderRadius: 8,
                            padding: '8px 14px',
                            fontSize: 14,
                            textAlign: 'right',
                            outline: 'none',
                          }}
                        />
                      </td>
                      <td style={{ padding: '14px 20px', textAlign: 'right', fontSize: 14, color: used > 0 ? '#111827' : '#9ca3af' }}>
                        {used > 0 ? `${used.toLocaleString()}원` : '-'}
                      </td>
                      <td style={{ padding: '14px 20px', textAlign: 'right', fontSize: 14, fontWeight: 600, color: remaining >= 0 ? '#059669' : '#dc2626' }}>
                        {item.annualBudget > 0 ? `${remaining.toLocaleString()}원` : '-'}
                      </td>
                      <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                        {item.annualBudget > 0 ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                            <div style={{ width: 40, height: 6, background: '#f3f4f6', borderRadius: 3, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${Math.min(rate, 100)}%`, background: rate > 80 ? '#ef4444' : rate > 50 ? '#f59e0b' : '#10b981', borderRadius: 3 }} />
                            </div>
                            <span style={{ fontSize: 12, color: rate > 80 ? '#dc2626' : '#6b7280', fontWeight: 600 }}>{rate.toFixed(0)}%</span>
                          </div>
                        ) : (
                          <span style={{ fontSize: 12, color: '#d1d5db' }}>-</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
                {/* 합계 행 */}
                <tr style={{ background: '#f9fafb', borderTop: '2px solid #e5e7eb' }}>
                  <td style={{ padding: '14px 20px', fontWeight: 700, fontSize: 14, color: '#111827' }}>합계</td>
                  <td style={{ padding: '14px 20px', textAlign: 'center', fontWeight: 700, fontSize: 14, color: '#111827' }}>{totalBudgetSum.toLocaleString()}원</td>
                  <td style={{ padding: '14px 20px', textAlign: 'right', fontWeight: 700, fontSize: 14, color: '#f59e0b' }}>{totalUsed.toLocaleString()}원</td>
                  <td style={{ padding: '14px 20px', textAlign: 'right', fontWeight: 700, fontSize: 14, color: (totalBudgetSum - totalUsed) >= 0 ? '#059669' : '#dc2626' }}>{(totalBudgetSum - totalUsed).toLocaleString()}원</td>
                  <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                    {totalBudgetSum > 0 && (
                      <span style={{ fontSize: 13, fontWeight: 700, color: (totalUsed / totalBudgetSum * 100) > 80 ? '#dc2626' : '#059669' }}>
                        {(totalUsed / totalBudgetSum * 100).toFixed(1)}%
                      </span>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function extractAmount(data?: Record<string, unknown>): number {
  if (!data) return 0
  for (const [k, v] of Object.entries(data)) {
    if (k.includes('금액') || k === 'amount') {
      const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''))
      if (!isNaN(n) && n >= 0) return n
    }
  }
  return 0
}

const selectStyle: React.CSSProperties = {
  border: '1px solid #d1d5db',
  borderRadius: 8,
  padding: '8px 12px',
  fontSize: 14,
  fontWeight: 600,
  background: '#fff',
  cursor: 'pointer',
  outline: 'none',
}

const summaryCardStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  padding: '20px 24px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
}

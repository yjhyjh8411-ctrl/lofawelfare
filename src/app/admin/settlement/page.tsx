'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { collection, getDocs, doc, setDoc, deleteDoc, query, where } from 'firebase/firestore'
import * as XLSX from 'xlsx'
import { db } from '@/lib/firebase'
import { useAuth } from '@/lib/auth-context'
import Navbar from '@/components/Navbar'

interface SettlementRow {
  id: string
  category: string
  annualBudget: number
  monthly: number[]
  isSubItem?: boolean
  parentCategory?: string
  order: number
}

interface SettlementData {
  id: string
  year: number
  rows: SettlementRow[]
}

const MONTHS = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월']

export default function AdminSettlementPage() {
  const { user, profile, loading } = useAuth()
  const router = useRouter()
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [rows, setRows] = useState<SettlementRow[]>([])
  const [dataLoading, setDataLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [editMode, setEditMode] = useState(false)
  const [docId, setDocId] = useState<string | null>(null)

  // Add row modal
  const [addModal, setAddModal] = useState(false)
  const [newCategory, setNewCategory] = useState('')
  const [newIsSubItem, setNewIsSubItem] = useState(false)
  const [newParent, setNewParent] = useState('')

  useEffect(() => {
    if (!loading && (!user || !profile?.isAdmin)) router.replace('/main')
  }, [user, profile, loading, router])

  useEffect(() => {
    if (!profile?.isAdmin) return
    loadData()
  }, [profile, selectedYear])

  const loadData = async () => {
    setDataLoading(true)
    try {
      const snap = await getDocs(query(collection(db, 'settlements'), where('year', '==', selectedYear)))
      if (!snap.empty) {
        const d = snap.docs[0]
        const data = d.data() as SettlementData
        setRows(data.rows || [])
        setDocId(d.id)
      } else {
        setRows([])
        setDocId(null)
      }
    } catch (e) { console.error(e) }
    finally { setDataLoading(false) }
  }

  const showMsg = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 3000) }

  const handleCellChange = (rowIdx: number, field: 'annualBudget' | number, value: string) => {
    const num = Number(value.replace(/,/g, ''))
    setRows(prev => prev.map((row, i) => {
      if (i !== rowIdx) return row
      if (field === 'annualBudget') {
        return { ...row, annualBudget: isNaN(num) ? 0 : num }
      }
      const monthly = [...row.monthly]
      monthly[field as number] = isNaN(num) ? 0 : num
      return { ...row, monthly }
    }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const id = docId || `settlement_${selectedYear}`
      await setDoc(doc(db, 'settlements', id), {
        year: selectedYear,
        rows,
        updatedAt: new Date(),
      })
      setDocId(id)
      setEditMode(false)
      showMsg('회계결산 데이터가 저장되었습니다.')
    } catch (e) {
      console.error(e)
      showMsg('저장 중 오류가 발생했습니다.')
    }
    finally { setSaving(false) }
  }

  const handleAddRow = () => {
    if (!newCategory.trim()) return
    const newRow: SettlementRow = {
      id: `row_${Date.now()}`,
      category: newCategory.trim(),
      annualBudget: 0,
      monthly: Array(12).fill(0),
      isSubItem: newIsSubItem,
      parentCategory: newIsSubItem ? newParent : undefined,
      order: rows.length,
    }
    setRows(prev => [...prev, newRow])
    setNewCategory('')
    setNewIsSubItem(false)
    setNewParent('')
    setAddModal(false)
  }

  const handleDeleteRow = (idx: number) => {
    if (!confirm('이 항목을 삭제하시겠습니까?')) return
    setRows(prev => prev.filter((_, i) => i !== idx))
  }

  const handleDeleteAll = async () => {
    if (!confirm(`${selectedYear}년 회계결산 데이터를 모두 삭제하시겠습니까?`)) return
    if (docId) {
      await deleteDoc(doc(db, 'settlements', docId))
      setDocId(null)
    }
    setRows([])
    showMsg('삭제되었습니다.')
  }

  const handleExcelDownload = () => {
    const header = ['구분', '연간예산', ...MONTHS, '집행 합계', '집행잔액']
    const csvRows: string[][] = [header]
    rows.forEach(row => {
      const total = row.monthly.reduce((s, v) => s + (v || 0), 0)
      const isExpenseItem = row.category === '세출' || row.parentCategory === '세출'
      const prefix = row.isSubItem ? '· ' : ''
      csvRows.push([
        prefix + row.category,
        String(row.annualBudget || ''),
        ...row.monthly.map(v => v ? String(v) : ''),
        total > 0 ? String(total) : '',
        isExpenseItem ? String(row.annualBudget - total) : '',
      ])
    })
    const csv = '\uFEFF' + csvRows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `회계결산_${selectedYear}년.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const data = new Uint8Array(ev.target?.result as ArrayBuffer)
      const wb = XLSX.read(data, { type: 'array' })

      // Check if it's a monthly-sheet format (sheets named 1월, 2월, ...)
      const monthSheetNames = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월']
      const hasMonthSheets = monthSheetNames.some(m => wb.SheetNames.includes(m))

      if (hasMonthSheets) {
        // Parse monthly detail sheets
        const incomeByCategory: Record<string, number[]> = {}
        const expenseByCategory: Record<string, number[]> = {}

        for (let mi = 0; mi < 12; mi++) {
          const ws = wb.Sheets[monthSheetNames[mi]]
          if (!ws) continue
          const rows2d = XLSX.utils.sheet_to_json<(string | number | null)[]>(ws, { header: 1 })
          for (const row of rows2d) {
            // Income: cols 1(금액), 3(예산과목)
            if (row[1] && row[3] && typeof row[1] === 'number' && row[3] !== '예산과목') {
              const cat = String(row[3]).trim()
              if (!incomeByCategory[cat]) incomeByCategory[cat] = Array(12).fill(0)
              incomeByCategory[cat][mi] += row[1]
            }
            // Expense: cols 5(금액), 7(예산과목)
            if (row[5] && row[7] && typeof row[5] === 'number' && row[7] !== '예산과목') {
              const cat = String(row[7]).trim()
              if (!expenseByCategory[cat]) expenseByCategory[cat] = Array(12).fill(0)
              expenseByCategory[cat][mi] += row[5]
            }
          }
        }

        // Build rows: merge with existing rows (keep annualBudget) or create new
        const existingMap: Record<string, SettlementRow> = {}
        rows.forEach(r => { existingMap[r.category] = r })

        const newRows: SettlementRow[] = []
        let order = 0

        // 세입 header
        const incomeMonthly = Array(12).fill(0)
        Object.values(incomeByCategory).forEach(m => m.forEach((v, i) => { incomeMonthly[i] += v }))
        newRows.push({
          id: 'row_income', category: '세입',
          annualBudget: existingMap['세입']?.annualBudget || 0,
          monthly: incomeMonthly, isSubItem: false, order: order++,
        })

        // Merge 조합비 sub-categories
        const combinedIncome: Record<string, number[]> = {}
        for (const [cat, monthly] of Object.entries(incomeByCategory)) {
          const normalized = cat.startsWith('조합비') ? '조합비' : cat
          if (!combinedIncome[normalized]) combinedIncome[normalized] = Array(12).fill(0)
          monthly.forEach((v, i) => { combinedIncome[normalized][i] += v })
        }

        for (const [cat, monthly] of Object.entries(combinedIncome)) {
          newRows.push({
            id: `row_income_${order}`, category: cat,
            annualBudget: existingMap[cat]?.annualBudget || 0,
            monthly, isSubItem: true, parentCategory: '세입', order: order++,
          })
        }
        // Add existing income sub-items with no data (이자수입, 잡수입 etc)
        rows.filter(r => r.parentCategory === '세입' && !combinedIncome[r.category]).forEach(r => {
          newRows.push({ ...r, order: order++ })
        })

        // 세출 header
        const expenseMonthly = Array(12).fill(0)
        Object.values(expenseByCategory).forEach(m => m.forEach((v, i) => { expenseMonthly[i] += v }))
        newRows.push({
          id: 'row_expense', category: '세출',
          annualBudget: existingMap['세출']?.annualBudget || 0,
          monthly: expenseMonthly, isSubItem: false, order: order++,
        })

        for (const [cat, monthly] of Object.entries(expenseByCategory)) {
          newRows.push({
            id: `row_expense_${order}`, category: cat,
            annualBudget: existingMap[cat]?.annualBudget || 0,
            monthly, isSubItem: true, parentCategory: '세출', order: order++,
          })
        }
        // Add existing expense sub-items with no data
        rows.filter(r => r.parentCategory === '세출' && !expenseByCategory[r.category]).forEach(r => {
          newRows.push({ ...r, order: order++ })
        })

        setRows(newRows)
        showMsg(`엑셀에서 ${Object.keys(incomeByCategory).length + Object.keys(expenseByCategory).length}개 항목을 불러왔습니다. 저장 버튼을 눌러주세요.`)
        setEditMode(true)
      } else {
        // Fallback: simple CSV-like first sheet
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows2d = XLSX.utils.sheet_to_json<(string | number | null)[]>(ws, { header: 1 })
        if (rows2d.length < 2) return
        const parsed: SettlementRow[] = []
        for (let i = 1; i < rows2d.length; i++) {
          const cols = rows2d[i]
          if (!cols[0]) continue
          const cellStr = String(cols[0])
          const isSubItem = cellStr.startsWith('· ') || cellStr.startsWith('·')
          const category = cellStr.replace(/^[·\s]+/, '').trim()
          const annualBudget = Number(String(cols[1] || '').replace(/,/g, '')) || 0
          const monthly = Array(12).fill(0).map((_, mi) => Number(String(cols[2 + mi] || '').replace(/,/g, '')) || 0)
          parsed.push({ id: `row_${Date.now()}_${i}`, category, annualBudget, monthly, isSubItem, order: parsed.length })
        }
        if (parsed.length > 0) {
          setRows(parsed)
          showMsg(`${parsed.length}개 항목을 불러왔습니다. 저장 버튼을 눌러주세요.`)
          setEditMode(true)
        }
      }
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  if (loading || !profile?.isAdmin) return null

  const parentCategories = rows.filter(r => !r.isSubItem).map(r => r.category)
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

      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '32px 20px 60px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: '#111827', marginBottom: 6 }}>회계결산 현황</h1>
            <p style={{ fontSize: 14, color: '#6b7280' }}>월별 세입, 세출, 차기이월 금액을 편집하고 관리합니다.</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} style={selectStyle}>
              {yearOptions.map(y => <option key={y} value={y}>{y}년</option>)}
            </select>
            <button onClick={() => setEditMode(!editMode)} style={{ ...btnStyle, background: editMode ? '#6b7280' : '#fff', color: editMode ? '#fff' : '#374151', border: editMode ? 'none' : '1px solid #d1d5db' }}>
              ✏️ {editMode ? '편집 취소' : '수정'}
            </button>
            <label style={{ ...btnStyle, background: '#fff', color: '#374151', border: '1px solid #d1d5db', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
              📤 엑셀 업로드
              <input type="file" accept=".csv,.txt,.xlsx,.xls" onChange={handleExcelUpload} style={{ display: 'none' }} />
            </label>
            {docId && (
              <button onClick={handleDeleteAll} style={{ ...btnStyle, background: '#fff', color: '#374151', border: '1px solid #d1d5db' }}>
                🗑️ 기존 파일 삭제
              </button>
            )}
            <button onClick={() => setAddModal(true)} style={{ ...btnStyle, background: '#1a56db' }}>
              + 추가
            </button>
          </div>
        </div>

        {/* Table */}
        {dataLoading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>로딩 중...</div>
        ) : rows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af', background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb', marginTop: 24 }}>
            {selectedYear}년 데이터가 없습니다. &quot;+ 추가&quot; 또는 &quot;엑셀 업로드&quot;로 데이터를 입력하세요.
          </div>
        ) : (
          <>
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'auto', marginTop: 24 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 1300 }}>
                <thead>
                  <tr style={{ background: '#1a56db' }}>
                    <th style={{ ...thStyle, position: 'sticky', left: 0, background: '#1a56db', zIndex: 1, minWidth: 130 }}>구분</th>
                    <th style={{ ...thStyle, minWidth: 100 }}>연간예산</th>
                    {MONTHS.map(m => <th key={m} style={{ ...thStyle, minWidth: 85 }}>{m}</th>)}
                    <th style={{ ...thStyle, minWidth: 100 }}>집행 합계</th>
                    <th style={{ ...thStyle, minWidth: 100 }}>집행잔액</th>
                    {editMode && <th style={{ ...thStyle, minWidth: 50 }}>삭제</th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => {
                    const monthlyTotal = row.monthly.reduce((s, v) => s + (v || 0), 0)
                    const isHeader = !row.isSubItem
                    const isExpenseItem = row.category === '세출' || row.parentCategory === '세출'
                    const remaining = isExpenseItem ? row.annualBudget - monthlyTotal : 0
                    return (
                      <tr key={row.id || idx} style={{ borderBottom: '1px solid #f3f4f6', background: isHeader ? '#f9fafb' : '#fff' }}>
                        <td style={{
                          ...tdStyle,
                          position: 'sticky', left: 0, zIndex: 1,
                          background: isHeader ? '#f9fafb' : '#fff',
                          fontWeight: isHeader ? 700 : 400,
                          paddingLeft: row.isSubItem ? 28 : 14,
                          color: row.isSubItem ? '#6b7280' : '#111827',
                        }}>
                          {row.isSubItem ? `· ${row.category}` : row.category}
                        </td>
                        <CellInput
                          value={row.annualBudget}
                          editMode={editMode}
                          isHeader={isHeader}
                          onChange={v => handleCellChange(idx, 'annualBudget', v)}
                        />
                        {row.monthly.map((val, mi) => (
                          <CellInput
                            key={mi}
                            value={val}
                            editMode={editMode}
                            isHeader={false}
                            onChange={v => handleCellChange(idx, mi, v)}
                          />
                        ))}
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: monthlyTotal > 0 ? '#1a56db' : '#d1d5db' }}>
                          {monthlyTotal > 0 ? monthlyTotal.toLocaleString() : '-'}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: isExpenseItem ? (remaining >= 0 ? '#059669' : '#dc2626') : '#d1d5db' }}>
                          {isExpenseItem ? remaining.toLocaleString() : '-'}
                        </td>
                        {editMode && (
                          <td style={{ ...tdStyle, textAlign: 'center' }}>
                            <button onClick={() => handleDeleteRow(idx)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 14 }}>✕</button>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {editMode && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                <button onClick={handleSave} disabled={saving} style={{ ...btnStyle, background: '#1a56db', padding: '12px 36px', fontSize: 15 }}>
                  {saving ? '저장 중...' : '저장'}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Add row modal */}
      {addModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setAddModal(false)}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 32, width: 440 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ fontSize: 18, fontWeight: 700 }}>항목 추가</h3>
              <button onClick={() => setAddModal(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6b7280' }}>✕</button>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>항목명</label>
              <input value={newCategory} onChange={e => setNewCategory(e.target.value)} placeholder="예: 세입, 조합비, 업무추진비" style={inputStyle} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={newIsSubItem} onChange={e => setNewIsSubItem(e.target.checked)} />
                <span style={{ fontWeight: 600, fontSize: 14 }}>하위 항목 (들여쓰기)</span>
              </label>
            </div>
            {newIsSubItem && parentCategories.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>상위 항목</label>
                <select value={newParent} onChange={e => setNewParent(e.target.value)} style={inputStyle}>
                  <option value="">선택</option>
                  {parentCategories.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleAddRow} style={{ ...btnStyle, background: '#1a56db' }}>추가</button>
              <button onClick={() => setAddModal(false)} style={{ ...btnStyle, background: '#6b7280' }}>취소</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function CellInput({ value, editMode, isHeader, onChange }: {
  value: number; editMode: boolean; isHeader: boolean; onChange: (v: string) => void
}) {
  if (!editMode) {
    return (
      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: isHeader ? 700 : 400, color: value ? '#111827' : '#d1d5db' }}>
        {value ? value.toLocaleString() : '-'}
      </td>
    )
  }
  return (
    <td style={{ ...tdStyle, textAlign: 'right', padding: '4px 4px' }}>
      <input
        type="text"
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        style={{
          width: '100%', border: '1px solid #e5e7eb', borderRadius: 4,
          padding: '5px 8px', fontSize: 12, textAlign: 'right', outline: 'none',
          background: '#fafafa', boxSizing: 'border-box',
        }}
        onFocus={e => e.target.style.borderColor = '#1a56db'}
        onBlur={e => e.target.style.borderColor = '#e5e7eb'}
      />
    </td>
  )
}

const thStyle: React.CSSProperties = { padding: '12px 10px', textAlign: 'center', fontWeight: 600, color: '#fff', fontSize: 13, whiteSpace: 'nowrap' }
const tdStyle: React.CSSProperties = { padding: '10px 10px', fontSize: 13, whiteSpace: 'nowrap' }
const selectStyle: React.CSSProperties = { border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 12px', fontSize: 14, fontWeight: 600, background: '#fff', cursor: 'pointer', outline: 'none' }
const btnStyle: React.CSSProperties = { color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontWeight: 600, cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap' }
const labelStyle: React.CSSProperties = { display: 'block', fontWeight: 600, marginBottom: 6, fontSize: 13, color: '#374151' }
const inputStyle: React.CSSProperties = { width: '100%', border: '1px solid #d1d5db', borderRadius: 8, padding: '10px 14px', fontSize: 14, outline: 'none', boxSizing: 'border-box' }

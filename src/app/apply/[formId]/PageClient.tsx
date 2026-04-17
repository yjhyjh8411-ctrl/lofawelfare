'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { doc, getDoc, addDoc, updateDoc, collection, serverTimestamp } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '@/lib/firebase'
import { useAuth } from '@/lib/auth-context'

type FieldType = 'text' | 'number' | 'amount' | 'date' | 'select' | 'textarea' | 'file'
  | 'account' | 'radio' | 'medical_records' | 'scholarship_records' | 'children_records' | 'loan_agreement'
  | 'living_records' | 'cultural_records'

interface FormField {
  id: string
  label: string
  type: FieldType
  required: boolean
  options?: string[]
  placeholder?: string
  hint?: string
  section?: string
}

interface FormConfig {
  제목: string
  설명: string
  한도설명?: string
  fields: FormField[]
  icon?: string
}

const BANKS = ['국민은행', '신한은행', '우리은행', '하나은행', '농협은행', '기업은행', '카카오뱅크', '토스뱅크',
  '우체국', '새마을금고', '신협', '부산은행', '대구은행', '광주은행', '전북은행', '경남은행', '수협']

const LOAN_TEXT = `상기 본인은 한국지방재정공제회 사내근로복지기금에서 시행하는 기금운영 규정 및 대부계획에 정해진 모든 조건을 수락하며 위 금액을 대부받으므로 다음 사항을 성실히 이행할 것에 동의합니다.

첫째, 다음과 같은 사유가 발생하였을 경우 기금법인의 요청에 따라 대부원금과 연체이자를 즉시 납부하여야 합니다.
1. 퇴직(임기만료) 시 5영업일 전까지 대부금 전액 상환 필수 (미상환 시 퇴직금에서 우선 공제)
2. 대부금을 신청 목적 외의 용도로 사용한 것이 적발되었을 경우
3. 대부금 관련 제출한 서류 및 사실에 허위 기타 부정한 방법을 사용하였음이 적발된 경우
4. 본인의 귀책사유에 의해 대부이자의 납입이 3개월 이상 연체되었을 경우 (연체이율 연 5.0% 적용)

둘째, 주택자금 대부 후 2주택이 된 경우 1년 이내에 반드시 1주택을 매도하여야 하며, 미이행 시 원금 회수 및 연체이자가 부과됩니다.

셋째, 휴직자/파면/해임/정직 중인 직원은 대부사업 신청이 제한됩니다. (제7조 1항)

넷째, 대부 단위는 100만원이며, 잔여 예산에 따라 중복 대부도 가능합니다.`

const PRIVACY_TEXT = `한국지방재정공제회 사내근로복지기금 지원 신청과 관련하여 아래와 같이 귀하의 개인정보를 수집 및 이용하고자 합니다.

• 수집항목: 성명, 사번, 부서, 직급, 전화번호, 입사일, 계좌번호, 신청 금액 및 사유, 증빙서류 내 포함된 개인정보
• 수집목적: 복지기금 지원 대상 확인, 지급 심사 및 처리, 결과 통지, 기금 운영 통계 분석
• 보유기간: 지원 종료 후 5년간 보관 후 파기
• 동의를 거부할 권리가 있으나, 거부 시 복지기금 지원 신청이 제한될 수 있습니다.
• 본 시스템상 전자적 방법(전자결재 등)으로 모든 서류 제출이 가능합니다. (제70조)`

function getEmptyRow(type: string): Record<string, string> {
  if (type === 'medical_records') return { 기관: '', 일자: '', 금액: '' }
  if (type === 'scholarship_records') return { 성명: '', 관계: '자녀', 학교급학년: '', 금액: '' }
  if (type === 'children_records') return { 성명: '', 생년월일: '', 비고: '' }
  if (type === 'living_records') return { 사용처: '', 사용일자: '', 금액: '' }
  if (type === 'cultural_records') return { 활동내용: '', 사용일자: '', 금액: '' }
  return {}
}

const DYNAMIC_TYPES = ['medical_records', 'scholarship_records', 'children_records', 'living_records', 'cultural_records']

export default function ApplyPage() {
  const params = useParams()
  const { user, profile, loading, refreshProfile } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const paramId = params.formId === '_' ? null : params.formId
  const formId = searchParams.get('formId') || paramId
  const editId = searchParams.get('edit')

  const [formConfig, setFormConfig] = useState<FormConfig | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [fileValues, setFileValues] = useState<Record<string, File>>({})
  const [existingFiles, setExistingFiles] = useState<Record<string, { url: string; name: string }>>({})
  const [dynRows, setDynRows] = useState<Record<string, Record<string, string>[]>>({})
  const [privacyConsent, setPrivacyConsent] = useState(false)
  const [loanConsent, setLoanConsent] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!loading && !user) router.replace('/login')
  }, [user, loading, router])

  // 프로필이 빈 값이면 갱신
  useEffect(() => {
    if (profile && !profile.name && user) refreshProfile()
  }, [profile, user, refreshProfile])

  useEffect(() => {
    if (!formId) return
    const load = async () => {
      const snap = await getDoc(doc(db, 'form_configs', String(formId)))
      if (!snap.exists()) return
      const cfg = snap.data() as FormConfig
      setFormConfig(cfg)

      const initDyn: Record<string, Record<string, string>[]> = {}
      for (const f of cfg.fields) {
        if (DYNAMIC_TYPES.includes(f.type)) initDyn[f.id] = [getEmptyRow(f.type)]
      }

      if (editId) {
        const appSnap = await getDoc(doc(db, 'applications', editId))
        if (appSnap.exists()) {
          const appData = appSnap.data().data as Record<string, unknown>
          const initVals: Record<string, string> = {}
          const initFiles: Record<string, { url: string; name: string }> = {}
          for (const f of cfg.fields) {
            const val = appData[f.label]
            if (f.type === 'account' && typeof val === 'string') {
              const m = val.match(/^(.+?) (.+?) \((.+)\)$/)
              if (m) {
                initVals[f.id + '_bank'] = m[1]
                initVals[f.id + '_number'] = m[2]
                initVals[f.id + '_holder'] = m[3]
              }
            } else if (f.type === 'file' && val && typeof val === 'object') {
              initFiles[f.id] = val as { url: string; name: string }
            } else if (DYNAMIC_TYPES.includes(f.type)) {
              if (Array.isArray(val) && val.length > 0) initDyn[f.id] = val as Record<string, string>[]
            } else if (typeof val === 'string') {
              initVals[f.id] = val
            }
          }
          setValues(initVals)
          setExistingFiles(initFiles)
          setPrivacyConsent(true)
          if (cfg.fields.some(f => f.type === 'loan_agreement')) setLoanConsent(true)
        }
      }
      setDynRows(initDyn)
    }
    load()
  }, [formId, editId])

  const set = (k: string, v: string) => setValues(p => ({ ...p, [k]: v }))

  const updateRow = (fid: string, idx: number, key: string, val: string) =>
    setDynRows(p => { const rows = [...(p[fid] || [])]; rows[idx] = { ...rows[idx], [key]: val }; return { ...p, [fid]: rows } })

  const addRow = (fid: string, type: string) =>
    setDynRows(p => ({ ...p, [fid]: [...(p[fid] || []), getEmptyRow(type)] }))

  const removeRow = (fid: string, idx: number) =>
    setDynRows(p => ({ ...p, [fid]: (p[fid] || []).filter((_, i) => i !== idx) }))

  const getSections = (): [string, FormField[]][] => {
    if (!formConfig) return []
    const map = new Map<string, FormField[]>()
    for (const f of formConfig.fields) {
      const sec = f.section || '신청 내용'
      if (!map.has(sec)) map.set(sec, [])
      map.get(sec)!.push(f)
    }
    return Array.from(map.entries())
  }

  const hasLoan = formConfig?.fields.some(f => f.type === 'loan_agreement') ?? false

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !profile || !formConfig) return
    const showError = (msg: string) => {
      setError(msg)
      setTimeout(() => document.getElementById('submit-error')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100)
    }
    if (hasLoan && profile?.status === 'leave') { showError('휴직 중인 직원은 대부사업 신청이 제한됩니다. (제7조 1항)'); return }
    if (hasLoan && !loanConsent) { showError('대부 이행 사항에 동의해주세요.'); return }
    if (!privacyConsent) { showError('개인정보 수집 및 이용에 동의해주세요.'); return }

    for (const f of formConfig.fields) {
      if (!f.required) continue
      if (f.type === 'file' && !fileValues[f.id] && !existingFiles[f.id]) { showError(`'${f.label}' 파일을 첨부해주세요.`); return }
      if (f.type === 'account' && (!values[f.id + '_bank'] || !values[f.id + '_number'] || !values[f.id + '_holder'])) {
        showError('지급 계좌번호를 모두 입력해주세요.'); return
      }
      if (DYNAMIC_TYPES.includes(f.type) && !(dynRows[f.id] || []).some(r => Object.values(r).some(v => v))) {
        showError(`'${f.label}'을 입력해주세요.`); return
      }
      if (!['file', 'account', ...DYNAMIC_TYPES, 'loan_agreement'].includes(f.type) && !values[f.id]) {
        showError(`'${f.label}' 항목을 입력해주세요.`); return
      }
    }

    setSubmitting(true); setError('')
    try {
      const appData: Record<string, unknown> = {}
      for (const f of formConfig.fields) {
        if (f.type === 'file') {
          const file = fileValues[f.id]
          if (file) {
            const now = new Date()
            const ts = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}${String(now.getSeconds()).padStart(2,'0')}`
            const prefix = `${profile.employeeId}_${profile.name}_${profile.department}_${formConfig.제목}`
            const storedName = `${prefix}_${ts}_${file.name}`
            const path = `applications/${user.uid}/${storedName}`
            await uploadBytes(ref(storage, path), file)
            appData[f.label] = { url: await getDownloadURL(ref(storage, path)), name: storedName, size: file.size }
          } else if (existingFiles[f.id]) {
            appData[f.label] = existingFiles[f.id]
          }
        } else if (f.type === 'account') {
          appData[f.label] = `${values[f.id + '_bank']} ${values[f.id + '_number']} (${values[f.id + '_holder']})`
        } else if (DYNAMIC_TYPES.includes(f.type)) {
          const rows = (dynRows[f.id] || []).filter(r => Object.values(r).some(v => v))
          appData[f.label] = rows
          if (f.type === 'medical_records') appData['총금액'] = rows.reduce((s, r) => s + (parseInt(r.금액) || 0), 0)
          if (f.type === 'scholarship_records') appData['장학금총액'] = rows.reduce((s, r) => s + (parseInt(r.금액) || 0), 0)
          if (f.type === 'living_records') appData['생활복지총액'] = rows.reduce((s, r) => s + (parseInt(r.금액) || 0), 0)
          if (f.type === 'cultural_records') appData['문화활동총액'] = rows.reduce((s, r) => s + (parseInt(r.금액) || 0), 0)
        } else if (f.type === 'loan_agreement') {
          appData[f.label] = '동의함'
        } else {
          appData[f.label] = values[f.id] || ''
        }
      }
      if (editId) {
        await updateDoc(doc(db, 'applications', editId), {
          status: 'pending',
          updated_at: serverTimestamp(),
          data: appData,
        })
      } else {
        await addDoc(collection(db, 'applications'), {
          user_id: user.uid,
          form_id: String(formId),
          status: 'pending',
          created_at: serverTimestamp(),
          applicant: {
            사번: profile.employeeId, 성명: profile.name, 부서: profile.department,
            직급: profile.position, 입사일: profile.hireDate || '', 전화번호: profile.phone || '',
          },
          data: appData,
        })
      }
      setSubmitted(true)
    } catch (err) {
      const message = err instanceof Error ? err.message : '알 수 없는 오류'
      showError(`신청 중 오류가 발생했습니다: ${message}`)
    }
    finally { setSubmitting(false) }
  }

  if (!formId) {
    return <div style={{ minHeight: '100vh', background: '#f5f6f8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ color: '#6b7280' }}>신청서를 찾을 수 없습니다.</span></div>
  }
  if (loading || (!formConfig && !error)) {
    return <div style={{ minHeight: '100vh', background: '#f5f6f8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ color: '#6b7280' }}>로딩 중...</span></div>
  }

  if (submitted) {
    return (
      <div style={{ minHeight: '100vh', background: '#f5f6f8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: '#fff', borderRadius: 16, padding: '48px 40px', textAlign: 'center', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', maxWidth: 420, width: '100%', margin: 16 }}>
          <div style={{ fontSize: 52, marginBottom: 16 }}>✅</div>
          <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>{editId ? '수정이 완료되었습니다' : '신청이 완료되었습니다'}</h2>
          <p style={{ color: '#6b7280', marginBottom: 28 }}>사내근로복지기금 담당자 검토 후 결과를 안내해드립니다.</p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button onClick={() => router.push('/my-status')} style={btnPrimary}>내 신청현황</button>
            <button onClick={() => router.push('/main')} style={btnSecondary}>홈으로</button>
          </div>
        </div>
      </div>
    )
  }

  if (!formConfig) return null

  const sections = getSections()
  const privacyNum = sections.length + 2

  const renderField = (field: FormField) => {
    switch (field.type) {
      case 'medical_records': {
        const rows = dynRows[field.id] || [{ 기관: '', 일자: '', 금액: '' }]
        const total = rows.reduce((s, r) => s + (parseInt(r.금액) || 0), 0)
        return (
          <div key={field.id}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
              <button type="button" onClick={() => addRow(field.id, field.type)} style={addRowBtn}>+ 내역 추가</button>
            </div>
            <div style={tblWrap}>
              <div style={{ ...tblHead, gridTemplateColumns: '1fr 140px 110px 32px' }}>
                <span>진료기관</span><span>진료일자</span><span>금액</span><span></span>
              </div>
              {rows.map((row, i) => (
                <div key={i} style={{ ...tblRow, gridTemplateColumns: '1fr 140px 110px 32px' }}>
                  <input type="text" value={row.기관} placeholder="기관명" onChange={e => updateRow(field.id, i, '기관', e.target.value)} style={cellInput} />
                  <input type="date" value={row.일자} onChange={e => updateRow(field.id, i, '일자', e.target.value)} style={cellInput} />
                  <input type="number" value={row.금액} placeholder="0" min="0" onChange={e => updateRow(field.id, i, '금액', e.target.value)} style={{ ...cellInput, textAlign: 'right' }} />
                  <button type="button" onClick={() => removeRow(field.id, i)} disabled={rows.length <= 1} style={delRowBtn(rows.length > 1)}>×</button>
                </div>
              ))}
              <div style={{ ...tblRow, gridTemplateColumns: '1fr 140px 110px 32px', background: '#f9fafb', fontWeight: 700 }}>
                <span style={{ gridColumn: '1/3', fontSize: 13 }}>총 합계</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#1a56db' }}>
                  <span style={{ fontSize: 12, fontWeight: 400, color: '#6b7280' }}>₩</span>{total.toLocaleString()}<span style={{ fontSize: 12, fontWeight: 400, color: '#6b7280' }}>원</span>
                </div>
                <div />
              </div>
            </div>
          </div>
        )
      }

      case 'scholarship_records': {
        const rows = dynRows[field.id] || [{ 성명: '', 관계: '자녀', 학교급학년: '', 금액: '' }]
        const total = rows.reduce((s, r) => s + (parseInt(r.금액) || 0), 0)
        return (
          <div key={field.id}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
              <button type="button" onClick={() => addRow(field.id, field.type)} style={addRowBtn}>+ 내역 추가</button>
            </div>
            <div style={tblWrap}>
              <div style={{ ...tblHead, gridTemplateColumns: '1fr 80px 1fr 100px 32px' }}>
                <span>대상자 성명</span><span>관계</span><span>학교급 및 학년</span><span>신청 금액</span><span></span>
              </div>
              {rows.map((row, i) => (
                <div key={i} style={{ ...tblRow, gridTemplateColumns: '1fr 80px 1fr 100px 32px' }}>
                  <input type="text" value={row.성명} placeholder="성명" onChange={e => updateRow(field.id, i, '성명', e.target.value)} style={cellInput} />
                  <select value={row.관계} onChange={e => updateRow(field.id, i, '관계', e.target.value)} style={{ ...cellInput, background: '#fff' }}>
                    <option value="자녀">자녀</option><option value="본인">본인</option>
                  </select>
                  <input type="text" value={row.학교급학년} placeholder="예: 초1" onChange={e => updateRow(field.id, i, '학교급학년', e.target.value)} style={cellInput} />
                  <input type="number" value={row.금액} placeholder="0" min="0" onChange={e => updateRow(field.id, i, '금액', e.target.value)} style={{ ...cellInput, textAlign: 'right' }} />
                  <button type="button" onClick={() => removeRow(field.id, i)} disabled={rows.length <= 1} style={delRowBtn(rows.length > 1)}>×</button>
                </div>
              ))}
              <div style={{ ...tblRow, gridTemplateColumns: '1fr 80px 1fr 100px 32px', background: '#f9fafb', fontWeight: 700 }}>
                <span style={{ gridColumn: '1/4', fontSize: 13 }}>총 합계</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#1a56db' }}>
                  <span style={{ fontSize: 12, fontWeight: 400, color: '#6b7280' }}>₩</span>{total.toLocaleString()}<span style={{ fontSize: 12, fontWeight: 400, color: '#6b7280' }}>원</span>
                </div>
                <div />
              </div>
            </div>
          </div>
        )
      }

      case 'children_records': {
        const rows = dynRows[field.id] || [{ 성명: '', 생년월일: '', 비고: '' }]
        return (
          <div key={field.id}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
              <button type="button" onClick={() => addRow(field.id, field.type)} style={addRowBtn}>+ 자녀 추가</button>
            </div>
            <div style={tblWrap}>
              <div style={{ ...tblHead, gridTemplateColumns: '1fr 1fr 1fr 32px' }}>
                <span>자녀 성명</span><span>생년월일</span><span>비고</span><span></span>
              </div>
              {rows.map((row, i) => (
                <div key={i} style={{ ...tblRow, gridTemplateColumns: '1fr 1fr 1fr 32px' }}>
                  <input type="text" value={row.성명} placeholder="성명" onChange={e => updateRow(field.id, i, '성명', e.target.value)} style={cellInput} />
                  <input type="date" value={row.생년월일} onChange={e => updateRow(field.id, i, '생년월일', e.target.value)} style={cellInput} />
                  <input type="text" value={row.비고} placeholder="비고" onChange={e => updateRow(field.id, i, '비고', e.target.value)} style={cellInput} />
                  <button type="button" onClick={() => removeRow(field.id, i)} disabled={rows.length <= 1} style={delRowBtn(rows.length > 1)}>×</button>
                </div>
              ))}
            </div>
          </div>
        )
      }

      case 'living_records': {
        const rows = dynRows[field.id] || [{ 사용처: '', 사용일자: '', 금액: '' }]
        const total = rows.reduce((s, r) => s + (parseInt(r.금액) || 0), 0)
        return (
          <div key={field.id}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
              <button type="button" onClick={() => addRow(field.id, field.type)} style={addRowBtn}>+ 내역 추가</button>
            </div>
            <div style={tblWrap}>
              <div style={{ ...tblHead, gridTemplateColumns: '1fr 140px 110px 32px' }}>
                <span>사용처</span><span>사용일자</span><span>금액</span><span></span>
              </div>
              {rows.map((row, i) => (
                <div key={i} style={{ ...tblRow, gridTemplateColumns: '1fr 140px 110px 32px' }}>
                  <input type="text" value={row.사용처} placeholder="사용처" onChange={e => updateRow(field.id, i, '사용처', e.target.value)} style={cellInput} />
                  <input type="date" value={row.사용일자} onChange={e => updateRow(field.id, i, '사용일자', e.target.value)} style={cellInput} />
                  <input type="number" value={row.금액} placeholder="0" min="0" onChange={e => updateRow(field.id, i, '금액', e.target.value)} style={{ ...cellInput, textAlign: 'right' }} />
                  <button type="button" onClick={() => removeRow(field.id, i)} disabled={rows.length <= 1} style={delRowBtn(rows.length > 1)}>×</button>
                </div>
              ))}
              <div style={{ ...tblRow, gridTemplateColumns: '1fr 140px 110px 32px', background: '#f9fafb', fontWeight: 700 }}>
                <span style={{ gridColumn: '1/3', fontSize: 13 }}>총 합계</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#1a56db' }}>
                  <span style={{ fontSize: 12, fontWeight: 400, color: '#6b7280' }}>₩</span>{total.toLocaleString()}<span style={{ fontSize: 12, fontWeight: 400, color: '#6b7280' }}>원</span>
                </div>
                <div />
              </div>
            </div>
          </div>
        )
      }

      case 'cultural_records': {
        const rows = dynRows[field.id] || [{ 활동내용: '', 사용일자: '', 금액: '' }]
        const total = rows.reduce((s, r) => s + (parseInt(r.금액) || 0), 0)
        return (
          <div key={field.id}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
              <button type="button" onClick={() => addRow(field.id, field.type)} style={addRowBtn}>+ 내역 추가</button>
            </div>
            <div style={tblWrap}>
              <div style={{ ...tblHead, gridTemplateColumns: '1fr 140px 110px 32px' }}>
                <span>활동내용</span><span>사용일자</span><span>금액</span><span></span>
              </div>
              {rows.map((row, i) => (
                <div key={i} style={{ ...tblRow, gridTemplateColumns: '1fr 140px 110px 32px' }}>
                  <input type="text" value={row.활동내용} placeholder="활동내용" onChange={e => updateRow(field.id, i, '활동내용', e.target.value)} style={cellInput} />
                  <input type="date" value={row.사용일자} onChange={e => updateRow(field.id, i, '사용일자', e.target.value)} style={cellInput} />
                  <input type="number" value={row.금액} placeholder="0" min="0" onChange={e => updateRow(field.id, i, '금액', e.target.value)} style={{ ...cellInput, textAlign: 'right' }} />
                  <button type="button" onClick={() => removeRow(field.id, i)} disabled={rows.length <= 1} style={delRowBtn(rows.length > 1)}>×</button>
                </div>
              ))}
              <div style={{ ...tblRow, gridTemplateColumns: '1fr 140px 110px 32px', background: '#f9fafb', fontWeight: 700 }}>
                <span style={{ gridColumn: '1/3', fontSize: 13 }}>총 합계</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#1a56db' }}>
                  <span style={{ fontSize: 12, fontWeight: 400, color: '#6b7280' }}>₩</span>{total.toLocaleString()}<span style={{ fontSize: 12, fontWeight: 400, color: '#6b7280' }}>원</span>
                </div>
                <div />
              </div>
            </div>
          </div>
        )
      }

      case 'account':
        return (
          <div key={field.id} style={{ marginBottom: 20 }}>
            <label style={fldLabel}>{field.label} {field.required && <span style={req}>*</span>}</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <select value={values[field.id + '_bank'] || ''} onChange={e => set(field.id + '_bank', e.target.value)}
                style={{ flex: '0 0 150px', border: '1px solid #d1d5db', borderRadius: 6, padding: '8px 10px', fontSize: 14, outline: 'none', background: '#fff' }}>
                <option value="">-- 은행 선택 --</option>
                {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
              <input type="text" placeholder="계좌번호 (숫자만)" value={values[field.id + '_number'] || ''}
                onChange={e => set(field.id + '_number', e.target.value.replace(/\D/g, ''))}
                style={{ flex: 1, border: '1px solid #d1d5db', borderRadius: 6, padding: '8px 12px', fontSize: 14, outline: 'none' }} />
              <input type="text" placeholder="예금주" value={values[field.id + '_holder'] || ''}
                onChange={e => set(field.id + '_holder', e.target.value)}
                style={{ flex: '0 0 90px', border: '1px solid #d1d5db', borderRadius: 6, padding: '8px 12px', fontSize: 14, outline: 'none' }} />
            </div>
            <div style={hint}>① 은행 선택 → 계좌번호 입력 → 예금주 입력</div>
          </div>
        )

      case 'amount':
        return (
          <div key={field.id} style={{ marginBottom: 20 }}>
            <label style={fldLabel}>{field.label} {field.required && <span style={req}>*</span>}</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14, color: '#6b7280' }}>₩</span>
              <input type="number" min="0" value={values[field.id] || ''} placeholder="0"
                onChange={e => set(field.id, e.target.value)}
                style={{ flex: 1, border: '1px solid #d1d5db', borderRadius: 6, padding: '8px 12px', fontSize: 14, outline: 'none', textAlign: 'right' }} />
              <span style={{ fontSize: 14, color: '#6b7280' }}>원</span>
            </div>
          </div>
        )

      case 'radio':
        return (
          <div key={field.id} style={{ marginBottom: 20 }}>
            <label style={fldLabel}>{field.label} {field.required && <span style={req}>*</span>}</label>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              {field.options?.map(opt => (
                <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 14 }}>
                  <input type="radio" name={field.id} value={opt} checked={values[field.id] === opt}
                    onChange={() => set(field.id, opt)} style={{ accentColor: '#1a56db' }} />
                  {opt}
                </label>
              ))}
            </div>
          </div>
        )

      case 'file':
        return (
          <div key={field.id} style={{ marginBottom: 20 }}>
            <label style={fldLabel}>{field.label} {field.required && !existingFiles[field.id] && <span style={req}>*</span>}</label>
            {field.hint && (
              <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#1e40af', marginBottom: 10 }}>
                ① {field.hint}
              </div>
            )}
            {existingFiles[field.id] && !fileValues[field.id] && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, padding: '6px 10px', marginBottom: 8, fontSize: 12 }}>
                <span style={{ color: '#059669' }}>📎 기존 파일:</span>
                <a href={existingFiles[field.id].url} target="_blank" rel="noopener noreferrer" style={{ color: '#1d4ed8', textDecoration: 'none', fontWeight: 600 }}>
                  {existingFiles[field.id].name}
                </a>
                <span style={{ color: '#6b7280' }}>(새 파일 선택 시 교체됩니다)</span>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <label style={{ background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 6, padding: '8px 14px', fontSize: 13, cursor: 'pointer', color: '#374151', flexShrink: 0 }}>
                파일 선택
                <input type="file" style={{ display: 'none' }} accept=".jpg,.jpeg,.png,.pdf,.doc,.docx"
                  onChange={e => { const f = e.target.files?.[0]; if (f) setFileValues(p => ({ ...p, [field.id]: f })) }} />
              </label>
              <span style={{ fontSize: 13, color: fileValues[field.id] ? '#059669' : '#9ca3af' }}>
                {fileValues[field.id] ? fileValues[field.id].name : '선택된 파일 없음'}
              </span>
            </div>
            <div style={hint}>① JPG, PNG, PDF 등 파일 첨부 가능 · 최대 32MB</div>
          </div>
        )

      case 'select':
        return (
          <div key={field.id} style={{ marginBottom: 20 }}>
            <label style={fldLabel}>{field.label} {field.required && <span style={req}>*</span>}</label>
            <select value={values[field.id] || ''} onChange={e => set(field.id, e.target.value)}
              style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 6, padding: '8px 12px', fontSize: 14, outline: 'none', background: '#fff', boxSizing: 'border-box' }}>
              <option value="">-- 선택하세요 --</option>
              {field.options?.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        )

      case 'textarea':
        return (
          <div key={field.id} style={{ marginBottom: 20 }}>
            <label style={fldLabel}>{field.label} {field.required && <span style={req}>*</span>}</label>
            <textarea value={values[field.id] || ''} placeholder={field.placeholder || ''} rows={3}
              onChange={e => set(field.id, e.target.value)}
              style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 6, padding: '8px 12px', fontSize: 14, outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
          </div>
        )

      case 'loan_agreement':
        return null

      default:
        return (
          <div key={field.id} style={{ marginBottom: 20 }}>
            <label style={fldLabel}>{field.label} {field.required && <span style={req}>*</span>}</label>
            <input type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'}
              value={values[field.id] || ''} placeholder={field.placeholder || ''}
              onChange={e => set(field.id, e.target.value)}
              style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 6, padding: '8px 12px', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
          </div>
        )
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f5f6f8' }}>
      <div style={{ background: 'linear-gradient(135deg, #1e3a8a 0%, #1a56db 70%, #2563eb 100%)', padding: '20px 24px 32px' }}>
        <button onClick={() => router.push('/main')}
          style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, padding: '6px 14px', cursor: 'pointer', marginBottom: 16 }}>
          &lt; 메인으로
        </button>
        <div style={{ display: 'inline-flex', background: 'rgba(255,255,255,0.2)', borderRadius: 4, padding: '3px 10px', fontSize: 11, color: '#e0e7ff', marginBottom: 10 }}>
          한국지방재정공제회 사내근로복지기금
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: '#fff', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span>{formConfig.icon || '📋'}</span> {formConfig.제목}
        </h1>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.75)' }}>{formConfig.설명}</p>
      </div>

      <div style={{ maxWidth: 680, margin: '0 auto', padding: '24px 16px 48px' }}>
        <form onSubmit={handleSubmit}>
          <div style={card}>
            <div style={secHdr}><CircNum n={1} /> 신청인 정보</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {([['성명', profile?.name], ['사번', profile?.employeeId], ['부서', profile?.department],
                ['직급', profile?.position], ['입사일', profile?.hireDate], ['전화번호', profile?.phone]] as [string, string | undefined][]).map(([lbl, val]) => (
                <div key={lbl}>
                  <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>{lbl}</div>
                  <input readOnly value={val || '-'} style={{ width: '100%', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 6, padding: '8px 12px', fontSize: 14, color: '#374151', outline: 'none', boxSizing: 'border-box' }} />
                </div>
              ))}
            </div>
          </div>

          {sections.map(([secTitle, fields], idx) => {
            const isLoanSec = fields.every(f => f.type === 'loan_agreement')
            const isLastSec = idx === sections.length - 1
            return (
              <div key={secTitle} style={card}>
                <div style={secHdr}><CircNum n={idx + 2} /> {secTitle}</div>
                {isLoanSec ? (
                  <>
                    <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '14px 16px', fontSize: 12, color: '#374151', lineHeight: 1.8, background: '#fafafa', maxHeight: 200, overflowY: 'auto', whiteSpace: 'pre-wrap', marginBottom: 12 }}>
                      {LOAN_TEXT}
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                      <input type="checkbox" checked={loanConsent} onChange={e => setLoanConsent(e.target.checked)} style={{ width: 16, height: 16, accentColor: '#1a56db' }} />
                      <span style={{ fontSize: 13, fontWeight: 600 }}>위 대부 이행 사항을 확인하였으며 이에 동의합니다. (필수)</span>
                    </label>
                  </>
                ) : (
                  <>
                    {fields.map(f => renderField(f))}
                    {isLastSec && formConfig.한도설명 && (
                      <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#1e40af', marginTop: 4 }}>
                        ① {formConfig.한도설명}
                      </div>
                    )}
                  </>
                )}
              </div>
            )
          })}

          <div style={card}>
            <div style={secHdr}><CircNum n={privacyNum} /> 개인정보 수집 및 이용 동의</div>
            <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '14px 16px', fontSize: 12, color: '#374151', lineHeight: 1.8, background: '#fafafa', maxHeight: 160, overflowY: 'auto', whiteSpace: 'pre-wrap', marginBottom: 12 }}>
              {PRIVACY_TEXT}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={privacyConsent} onChange={e => setPrivacyConsent(e.target.checked)} style={{ width: 16, height: 16, accentColor: '#1a56db' }} />
              <span style={{ fontSize: 13, fontWeight: 500 }}>위의 개인정보 수집 및 이용에 동의합니다. (필수)</span>
            </label>
          </div>

          {error && (
            <div id="submit-error" style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', color: '#dc2626', fontSize: 13, marginBottom: 16 }}>{error}</div>
          )}

          <div style={{ display: 'flex', gap: 12 }}>
            <button type="submit" disabled={submitting} style={{ ...btnPrimary, flex: 1, padding: '14px', fontSize: 15 }}>
              {submitting ? (editId ? '수정 중...' : '제출 중...') : (editId ? '✏️ 수정 완료' : '✈ 신청서 제출')}
            </button>
            <button type="button" onClick={() => router.push('/main')} style={btnSecondary}>
              뒤로 돌아가기
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function CircNum({ n }: { n: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: '50%', background: '#1a56db', color: '#fff', fontSize: 13, fontWeight: 700, marginRight: 8, flexShrink: 0 }}>{n}</span>
  )
}

const card: React.CSSProperties = { background: '#fff', borderRadius: 12, padding: 24, marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }
const secHdr: React.CSSProperties = { fontSize: 15, fontWeight: 700, color: '#111827', marginBottom: 20, display: 'flex', alignItems: 'center' }
const fldLabel: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }
const req: React.CSSProperties = { color: '#ef4444', marginLeft: 2 }
const hint: React.CSSProperties = { fontSize: 11, color: '#9ca3af', marginTop: 4 }
const tblWrap: React.CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }
const tblHead: React.CSSProperties = { display: 'grid', background: '#f9fafb', padding: '8px 12px', fontSize: 12, color: '#6b7280', fontWeight: 600, gap: 6, alignItems: 'center' }
const tblRow: React.CSSProperties = { display: 'grid', padding: '8px 12px', gap: 6, borderTop: '1px solid #f3f4f6', alignItems: 'center' }
const cellInput: React.CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 6, padding: '6px 8px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' }
const addRowBtn: React.CSSProperties = { background: 'none', border: '1px solid #1a56db', borderRadius: 6, color: '#1a56db', fontSize: 12, padding: '4px 10px', cursor: 'pointer' }
const delRowBtn = (active: boolean): React.CSSProperties => ({ background: 'none', border: 'none', color: active ? '#9ca3af' : '#e5e7eb', cursor: active ? 'pointer' : 'default', fontSize: 16 })
const btnPrimary: React.CSSProperties = { background: '#1a56db', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 28px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }
const btnSecondary: React.CSSProperties = { background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 10, padding: '12px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }

'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { doc, getDoc, addDoc, updateDoc, collection, serverTimestamp } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '@/lib/firebase'
import { useAuth } from '@/lib/auth-context'
import { formatMoney, normalizeMoney } from '@/lib/money'

type FieldType = 'text' | 'number' | 'amount' | 'date' | 'select' | 'textarea' | 'file'
  | 'account' | 'radio' | 'medical_records' | 'scholarship_records' | 'children_records' | 'loan_agreement' | 'housing_agreement'
  | 'living_records' | 'cultural_records' | 'vaccination_records'

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
  신청내용주석?: string
  대부동의필요?: boolean
  무주택서약필요?: boolean
  무주택서약조건필드ID?: string
  무주택서약조건값들?: string[]
  fields: FormField[]
  icon?: string
}

const BANKS = ['국민은행', '신한은행', '우리은행', '하나은행', '농협은행', '기업은행', '카카오뱅크', '토스뱅크',
  '우체국', '새마을금고', '신협', '부산은행', '대구은행', '광주은행', '전북은행', '경남은행', '수협']

const LOAN_TEXT = `[서식2] 대부규정 준수 및 이자비용 등 공제납부 동의서

상기 본인은 한국지방재정공제회 사내근로복지기금에서 시행하는 기금운영규정 및 대부계획에 정해진 모든 조건을 수락하고 위 금액을 대부받았으므로 다음 사항을 성실히 이행할 것에 동의합니다.

첫째, 다음과 같은 사유가 발생하였을 경우 기금법인의 요청에 따라 대부원금과 연체이자를 즉시 납부하겠음
1. 퇴직할 경우(사망·해임·파면시 동일), 단, 이 경우에는 퇴직금 지급일로부터 5영업일까지 유예가능
2. 대부금을 신청목적 외의 용도로 사용한 것이 적발되었을 경우
3. 대부를 위해 제출한 서류 및 사유에 허위 기타 부정한 방법을 사용하였음이 적발된 경우
4. 본인의 귀책사유에 의해 대부이자의 납입이 3개월 이상 연체되었을 경우
5. 기타 기금운영규정 제8조 1항에 의거 이사회에서 대부금의 회수를 결정하였을 경우

둘째, 기금운영규정에 의거 매월 급여 지급시 월이자를 급여공제하여 납부하는 것에 동의하며, 급여공제 납부가 불가한 사정이 있을시 매월 급여일까지 월간 이자를 납입하겠음

셋째, 퇴직시 대부금 미상환액이 남아있는 경우 퇴직금에서 공제하여 납부하고 대부잔액이 퇴직금을 초과하는 경우 퇴직금 지급을 유예할 것에 동의함`

const HOUSING_TEXT_TEMPLATE = `[서식3] 무주택·1주택 서약서

상기 본인은 주택자금 대부를 신청함에 있어서 본인 및 부양가족 전원이 주택자금 대부신청일 기준으로 ({years})년 ({months})개월 전부터 무주택자(1주택자)임을 서약합니다.
(무주택 기산일은 만 30세가 된 날 혹은 혼인신고를 한 날 중 빠른 날)

만일 대부 이후 위 기간 내에 본인 및 부양가족 중 1인이라도 주택을 소유한 사실이 판명되었을 시 대부취소 및 대부금 환수처리에 대해 이의를 제기하지 아니할 것이며, 대부받은 금액(규정에 따른 연체이자 포함)을 즉시 일시 상환할 것을 서약합니다.

만약 일시적으로 2주택을 소유하게 된 경우 지원일로부터 1년 이내에 반드시 1주택을 매도할 것이며, 그러지 못할 경우 기금운영규정에 따라 대부받은 원리금과 연체이자를 납부하겠습니다.`

function buildHousingText(years: number | string, months: number | string) {
  return HOUSING_TEXT_TEMPLATE
    .replace('{years}', String(years || '   '))
    .replace('{months}', String(months || '   '))
}

/** YYYY-MM 두 시점 사이를 년/개월 단위로 계산 */
function diffYearsMonths(start: string, end: string): { years: number; months: number; valid: boolean } {
  const m1 = start.match(/^(\d{4})-(\d{2})/)
  const m2 = end.match(/^(\d{4})-(\d{2})/)
  if (!m1 || !m2) return { years: 0, months: 0, valid: false }
  const y1 = parseInt(m1[1]), mo1 = parseInt(m1[2])
  const y2 = parseInt(m2[1]), mo2 = parseInt(m2[2])
  const total = (y2 - y1) * 12 + (mo2 - mo1)
  if (total < 0) return { years: 0, months: 0, valid: false }
  return { years: Math.floor(total / 12), months: total % 12, valid: true }
}

const PRIVACY_TEXT = `한국지방재정공제회 사내근로복지기금 지원 신청과 관련하여 아래와 같이 귀하의 개인정보를 수집 및 이용하고자 합니다.

• 수집항목: 성명, 사번, 부서, 직급, 전화번호, 입사일, 계좌번호, 신청 금액 및 사유, 증빙서류 내 포함된 개인정보
• 수집목적: 복지기금 지원 대상 확인, 지급 심사 및 처리, 결과 통지, 기금 운영 통계 분석
• 보유기간: 지원 종료 후 5년간 보관 후 파기
• 동의를 거부할 권리가 있으나, 거부 시 복지기금 지원 신청이 제한될 수 있습니다.
• 본 시스템상 전자적 방법(전자결재 등)으로 모든 서류 제출이 가능합니다. (제70조)`

function getEmptyRow(type: string): Record<string, string> {
  if (type === 'medical_records') return { 대상자: '', 기관: '', 일자: '', 금액: '' }
  if (type === 'scholarship_records') return { 성명: '', 관계: '자녀', 학교급학년: '', 금액: '' }
  if (type === 'children_records') return { 성명: '', 생년월일: '', 비고: '' }
  if (type === 'living_records') return { 대상자: '', 사용처: '', 사용일자: '', 금액: '' }
  if (type === 'cultural_records') return { 대상자: '', 활동내용: '', 사용일자: '', 금액: '' }
  if (type === 'vaccination_records') return { 대상자: '', 접종항목: '', 접종일: '', 금액: '' }
  return {}
}

const DYNAMIC_TYPES = ['medical_records', 'scholarship_records', 'children_records', 'living_records', 'cultural_records', 'vaccination_records']

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
  const [fileValues, setFileValues] = useState<Record<string, File[]>>({})
  const [existingFiles, setExistingFiles] = useState<Record<string, { url: string; name: string; size?: number }[]>>({})

  // 첨부파일 총 용량 제한 (32MB)
  const MAX_TOTAL_BYTES = 32 * 1024 * 1024
  const [dynRows, setDynRows] = useState<Record<string, Record<string, string>[]>>({})
  const [privacyConsent, setPrivacyConsent] = useState(false)
  const [loanConsent, setLoanConsent] = useState(false)
  const [housingConsent, setHousingConsent] = useState(false)
  const [housingRegion, setHousingRegion] = useState('')
  const [housingAddress, setHousingAddress] = useState('')
  const [housingStart, setHousingStart] = useState('')
  const [housingEnd, setHousingEnd] = useState('')
  const [editLocked, setEditLocked] = useState(false)
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
          const rawDoc = appSnap.data()
          // 승인 완료된 신청서는 수정 차단
          if (rawDoc.status === 'approved') {
            setEditLocked(true)
            setError('이미 승인 완료된 신청서는 수정할 수 없습니다.')
            return
          }
          const appData = rawDoc.data as Record<string, unknown>
          const initVals: Record<string, string> = {}
          const initFiles: Record<string, { url: string; name: string; size?: number }[]> = {}
          for (const f of cfg.fields) {
            const val = appData[f.label]
            if (f.type === 'account' && typeof val === 'string') {
              const m = val.match(/^(.+?) (.+?) \((.+)\)$/)
              if (m) {
                initVals[f.id + '_bank'] = m[1]
                initVals[f.id + '_number'] = m[2]
                initVals[f.id + '_holder'] = m[3]
              }
            } else if (f.type === 'file' && val) {
              if (Array.isArray(val)) {
                initFiles[f.id] = (val as Record<string, unknown>[])
                  .filter(o => o && typeof o.url === 'string' && typeof o.name === 'string')
                  .map(o => ({ url: String(o.url), name: String(o.name), size: typeof o.size === 'number' ? o.size : undefined }))
              } else if (typeof val === 'object') {
                const o = val as Record<string, unknown>
                if (typeof o.url === 'string' && typeof o.name === 'string') {
                  initFiles[f.id] = [{ url: String(o.url), name: String(o.name), size: typeof o.size === 'number' ? o.size : undefined }]
                }
              }
            } else if (DYNAMIC_TYPES.includes(f.type)) {
              if (Array.isArray(val) && val.length > 0) initDyn[f.id] = val as Record<string, string>[]
            } else if (typeof val === 'string') {
              initVals[f.id] = val
            }
          }
          setValues(initVals)
          setExistingFiles(initFiles)
          setPrivacyConsent(true)
          if (cfg.fields.some(f => f.type === 'loan_agreement') || cfg.대부동의필요) setLoanConsent(true)
          if (cfg.fields.some(f => f.type === 'housing_agreement') || cfg.무주택서약필요) setHousingConsent(true)
          if (typeof appData?.['주택구입(임차)지역'] === 'string') setHousingRegion(appData['주택구입(임차)지역'] as string)
          if (typeof appData?.['주택자금 주소'] === 'string') setHousingAddress(appData['주택자금 주소'] as string)
          if (typeof appData?.['무주택기간 시작'] === 'string') setHousingStart(appData['무주택기간 시작'] as string)
          if (typeof appData?.['무주택기간 종료'] === 'string') setHousingEnd(appData['무주택기간 종료'] as string)
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
      // loan_agreement, housing_agreement 는 하단 전용 섹션에서 통합 렌더링하므로 일반 섹션에서 제외 (중복 방지)
      if (f.type === 'loan_agreement' || f.type === 'housing_agreement') continue
      const sec = f.section || '신청 내용'
      if (!map.has(sec)) map.set(sec, [])
      map.get(sec)!.push(f)
    }
    return Array.from(map.entries())
  }

  const hasLoan = (formConfig?.대부동의필요 === true) || (formConfig?.fields.some(f => f.type === 'loan_agreement') ?? false)
  const hasHousing = (formConfig?.무주택서약필요 === true) || (formConfig?.fields.some(f => f.type === 'housing_agreement') ?? false)

  const triggerFieldId = formConfig?.무주택서약조건필드ID
  const triggerValues = formConfig?.무주택서약조건값들 || []
  const housingTriggered = hasHousing && (
    !triggerFieldId ? true : triggerValues.includes(values[triggerFieldId] || '')
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !profile || !formConfig) return
    const showError = (msg: string) => {
      setError(msg)
      setTimeout(() => document.getElementById('submit-error')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100)
    }
    if (editLocked) { showError('이미 승인 완료된 신청서는 수정할 수 없습니다.'); return }
    if (hasLoan && profile?.status === 'leave') { showError('휴직 중인 직원은 대부사업 신청이 제한됩니다. (제7조 1항)'); return }
    if (hasLoan && !loanConsent) { showError('[서식2] 대부규정 준수 동의서에 동의해주세요.'); return }

    if (housingTriggered) {
      if (!housingRegion.trim()) { showError('주택구입(임차) 지역을 입력해주세요.'); return }
      if (!housingAddress.trim()) { showError('주소를 입력해주세요.'); return }
      if (!housingStart || !housingEnd) { showError('무주택(1주택) 기간을 입력해주세요.'); return }
      const dur = diffYearsMonths(housingStart, housingEnd)
      if (!dur.valid) { showError('무주택(1주택) 기간이 올바르지 않습니다. 시작·종료 순서를 확인해주세요.'); return }
      if (!housingConsent) { showError('[서식3] 무주택·1주택 서약서에 동의해주세요.'); return }
    }
    if (!privacyConsent) { showError('개인정보 수집 및 이용에 동의해주세요.'); return }

    for (const f of formConfig.fields) {
      if (!f.required) continue
      if (f.type === 'file' && !(fileValues[f.id]?.length) && !(existingFiles[f.id]?.length)) { showError(`'${f.label}' 파일을 첨부해주세요.`); return }
      if (f.type === 'account' && (!values[f.id + '_bank'] || !values[f.id + '_number'] || !values[f.id + '_holder'])) {
        showError('지급 계좌번호를 모두 입력해주세요.'); return
      }
      if (DYNAMIC_TYPES.includes(f.type) && !(dynRows[f.id] || []).some(r => Object.values(r).some(v => v))) {
        showError(`'${f.label}'을 입력해주세요.`); return
      }
      if (!['file', 'account', ...DYNAMIC_TYPES, 'loan_agreement', 'housing_agreement'].includes(f.type) && !values[f.id]) {
        showError(`'${f.label}' 항목을 입력해주세요.`); return
      }
    }

    // 첨부파일 용량 검증 (필드별 합계 및 개별 파일 32MB 이내)
    for (const f of formConfig.fields) {
      if (f.type !== 'file') continue
      const pending = fileValues[f.id] || []
      const existing = existingFiles[f.id] || []
      const overSingle = pending.find(file => file.size > MAX_TOTAL_BYTES)
      if (overSingle) {
        showError(`'${overSingle.name}' 파일 크기가 32MB를 초과합니다.`)
        return
      }
      const total = pending.reduce((s, file) => s + file.size, 0)
        + existing.reduce((s, ef) => s + (ef.size || 0), 0)
      if (total > MAX_TOTAL_BYTES) {
        showError(`'${f.label}' 첨부파일 합계가 ${(MAX_TOTAL_BYTES / 1024 / 1024).toFixed(0)}MB 를 초과합니다. (현재 ${(total / 1024 / 1024).toFixed(1)}MB)`)
        return
      }
    }

    setSubmitting(true); setError('')
    try {
      const appData: Record<string, unknown> = {}
      for (const f of formConfig.fields) {
        if (f.type === 'file') {
          const uploaded: { url: string; name: string; size: number }[] = []
          for (const ef of (existingFiles[f.id] || [])) {
            uploaded.push({ url: ef.url, name: ef.name, size: ef.size ?? 0 })
          }
          const newFiles = fileValues[f.id] || []
          for (let idx = 0; idx < newFiles.length; idx++) {
            const file = newFiles[idx]
            const now = new Date()
            const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`
            const prefix = `${profile.employeeId}_${profile.name}_${profile.department}_${formConfig.제목}`
            const storedName = `${prefix}_${ts}_${idx + 1}_${file.name}`
            const path = `applications/${user.uid}/${storedName}`
            await uploadBytes(ref(storage, path), file)
            uploaded.push({ url: await getDownloadURL(ref(storage, path)), name: storedName, size: file.size })
          }
          if (uploaded.length > 0) appData[f.label] = uploaded
        } else if (f.type === 'account') {
          appData[f.label] = `${values[f.id + '_bank']} ${values[f.id + '_number']} (${values[f.id + '_holder']})`
        } else if (DYNAMIC_TYPES.includes(f.type)) {
          const rows = (dynRows[f.id] || []).filter(r => Object.values(r).some(v => v))
          appData[f.label] = rows
          if (f.type === 'medical_records') appData['총금액'] = rows.reduce((s, r) => s + (parseInt(r.금액) || 0), 0)
          if (f.type === 'scholarship_records') appData['장학금총액'] = rows.reduce((s, r) => s + (parseInt(r.금액) || 0), 0)
          if (f.type === 'living_records') appData['생활복지총액'] = rows.reduce((s, r) => s + (parseInt(r.금액) || 0), 0)
          if (f.type === 'cultural_records') appData['문화활동총액'] = rows.reduce((s, r) => s + (parseInt(r.금액) || 0), 0)
          if (f.type === 'vaccination_records') appData['예방접종총액'] = rows.reduce((s, r) => s + (parseInt(r.금액) || 0), 0)
        } else if (f.type === 'loan_agreement') {
          appData[f.label] = '동의함'
        } else if (f.type === 'housing_agreement') {
          appData[f.label] = '동의함'
        } else {
          appData[f.label] = values[f.id] || ''
        }
      }
      if (hasLoan) appData['대부규정 준수 동의'] = '동의함'
      if (housingTriggered) {
        appData['무주택·1주택 서약'] = '동의함'
        if (housingRegion.trim()) appData['주택구입(임차)지역'] = housingRegion.trim()
        if (housingAddress.trim()) appData['주택자금 주소'] = housingAddress.trim()
        if (housingStart) appData['무주택기간 시작'] = housingStart
        if (housingEnd) appData['무주택기간 종료'] = housingEnd
        if (housingStart && housingEnd) {
          const d = diffYearsMonths(housingStart, housingEnd)
          if (d.valid) appData['무주택기간 (년/개월)'] = `${d.years}년 ${d.months}개월`
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
  let nextSecNum = sections.length + 2
  const loanNum = hasLoan ? nextSecNum++ : null
  const housingNum = housingTriggered ? nextSecNum++ : null
  const privacyNum = nextSecNum

  const renderField = (field: FormField) => {
    switch (field.type) {
      case 'medical_records': {
        const rows = dynRows[field.id] || [{ 대상자: '', 기관: '', 일자: '', 금액: '' }]
        const total = rows.reduce((s, r) => s + (parseInt(r.금액) || 0), 0)
        return (
          <div key={field.id}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
              <button type="button" onClick={() => addRow(field.id, field.type)} style={addRowBtn}>+ 내역 추가</button>
            </div>
            <div style={tblWrap}>
              <div style={{ ...tblHead, gridTemplateColumns: '110px 1fr 140px 110px 32px' }}>
                <span>대상자</span><span>진료기관</span><span>진료일자</span><span>금액</span><span></span>
              </div>
              {rows.map((row, i) => (
                <div key={i} style={{ ...tblRow, gridTemplateColumns: '110px 1fr 140px 110px 32px' }}>
                  <input type="text" value={row.대상자 || ''} placeholder="성명" onChange={e => updateRow(field.id, i, '대상자', e.target.value)} style={cellInput} />
                  <input type="text" value={row.기관} placeholder="기관명" onChange={e => updateRow(field.id, i, '기관', e.target.value)} style={cellInput} />
                  <input type="date" value={row.일자} onChange={e => updateRow(field.id, i, '일자', e.target.value)} style={cellInput} />
                  <input type="text" inputMode="numeric" value={formatMoney(row.금액)} placeholder="0" onChange={e => updateRow(field.id, i, '금액', normalizeMoney(e.target.value))} style={{ ...cellInput, textAlign: 'right' }} />
                  <button type="button" onClick={() => removeRow(field.id, i)} disabled={rows.length <= 1} style={delRowBtn(rows.length > 1)}>×</button>
                </div>
              ))}
              <div style={{ ...tblRow, gridTemplateColumns: '110px 1fr 140px 110px 32px', background: '#f9fafb', fontWeight: 700 }}>
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
                  <input type="text" inputMode="numeric" value={formatMoney(row.금액)} placeholder="0" onChange={e => updateRow(field.id, i, '금액', normalizeMoney(e.target.value))} style={{ ...cellInput, textAlign: 'right' }} />
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
        const rows = dynRows[field.id] || [{ 대상자: '', 사용처: '', 사용일자: '', 금액: '' }]
        const total = rows.reduce((s, r) => s + (parseInt(r.금액) || 0), 0)
        return (
          <div key={field.id}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
              <button type="button" onClick={() => addRow(field.id, field.type)} style={addRowBtn}>+ 내역 추가</button>
            </div>
            <div style={tblWrap}>
              <div style={{ ...tblHead, gridTemplateColumns: '110px 1fr 140px 110px 32px' }}>
                <span>대상자</span><span>사용처</span><span>사용일자</span><span>금액</span><span></span>
              </div>
              {rows.map((row, i) => (
                <div key={i} style={{ ...tblRow, gridTemplateColumns: '110px 1fr 140px 110px 32px' }}>
                  <input type="text" value={row.대상자 || ''} placeholder="성명" onChange={e => updateRow(field.id, i, '대상자', e.target.value)} style={cellInput} />
                  <input type="text" value={row.사용처} placeholder="사용처" onChange={e => updateRow(field.id, i, '사용처', e.target.value)} style={cellInput} />
                  <input type="date" value={row.사용일자} onChange={e => updateRow(field.id, i, '사용일자', e.target.value)} style={cellInput} />
                  <input type="text" inputMode="numeric" value={formatMoney(row.금액)} placeholder="0" onChange={e => updateRow(field.id, i, '금액', normalizeMoney(e.target.value))} style={{ ...cellInput, textAlign: 'right' }} />
                  <button type="button" onClick={() => removeRow(field.id, i)} disabled={rows.length <= 1} style={delRowBtn(rows.length > 1)}>×</button>
                </div>
              ))}
              <div style={{ ...tblRow, gridTemplateColumns: '110px 1fr 140px 110px 32px', background: '#f9fafb', fontWeight: 700 }}>
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

      case 'cultural_records': {
        const rows = dynRows[field.id] || [{ 대상자: '', 활동내용: '', 사용일자: '', 금액: '' }]
        const total = rows.reduce((s, r) => s + (parseInt(r.금액) || 0), 0)
        return (
          <div key={field.id}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
              <button type="button" onClick={() => addRow(field.id, field.type)} style={addRowBtn}>+ 내역 추가</button>
            </div>
            <div style={tblWrap}>
              <div style={{ ...tblHead, gridTemplateColumns: '110px 1fr 140px 110px 32px' }}>
                <span>대상자</span><span>활동내용</span><span>사용일자</span><span>금액</span><span></span>
              </div>
              {rows.map((row, i) => (
                <div key={i} style={{ ...tblRow, gridTemplateColumns: '110px 1fr 140px 110px 32px' }}>
                  <input type="text" value={row.대상자 || ''} placeholder="성명" onChange={e => updateRow(field.id, i, '대상자', e.target.value)} style={cellInput} />
                  <input type="text" value={row.활동내용} placeholder="활동내용" onChange={e => updateRow(field.id, i, '활동내용', e.target.value)} style={cellInput} />
                  <input type="date" value={row.사용일자} onChange={e => updateRow(field.id, i, '사용일자', e.target.value)} style={cellInput} />
                  <input type="text" inputMode="numeric" value={formatMoney(row.금액)} placeholder="0" onChange={e => updateRow(field.id, i, '금액', normalizeMoney(e.target.value))} style={{ ...cellInput, textAlign: 'right' }} />
                  <button type="button" onClick={() => removeRow(field.id, i)} disabled={rows.length <= 1} style={delRowBtn(rows.length > 1)}>×</button>
                </div>
              ))}
              <div style={{ ...tblRow, gridTemplateColumns: '110px 1fr 140px 110px 32px', background: '#f9fafb', fontWeight: 700 }}>
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

      case 'vaccination_records': {
        const rows = dynRows[field.id] || [{ 대상자: '', 접종항목: '', 접종일: '', 금액: '' }]
        const total = rows.reduce((s, r) => s + (parseInt(r.금액) || 0), 0)
        return (
          <div key={field.id}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
              <button type="button" onClick={() => addRow(field.id, field.type)} style={addRowBtn}>+ 내역 추가</button>
            </div>
            <div style={tblWrap}>
              <div style={{ ...tblHead, gridTemplateColumns: '110px 1fr 140px 110px 32px' }}>
                <span>대상자</span><span>접종 항목</span><span>접종일</span><span>금액</span><span></span>
              </div>
              {rows.map((row, i) => (
                <div key={i} style={{ ...tblRow, gridTemplateColumns: '110px 1fr 140px 110px 32px' }}>
                  <input type="text" value={row.대상자} placeholder="성명" onChange={e => updateRow(field.id, i, '대상자', e.target.value)} style={cellInput} />
                  <input type="text" value={row.접종항목} placeholder="예: 독감 예방접종" onChange={e => updateRow(field.id, i, '접종항목', e.target.value)} style={cellInput} />
                  <input type="date" value={row.접종일} onChange={e => updateRow(field.id, i, '접종일', e.target.value)} style={cellInput} />
                  <input type="text" inputMode="numeric" value={formatMoney(row.금액)} placeholder="0" onChange={e => updateRow(field.id, i, '금액', normalizeMoney(e.target.value))} style={{ ...cellInput, textAlign: 'right' }} />
                  <button type="button" onClick={() => removeRow(field.id, i)} disabled={rows.length <= 1} style={delRowBtn(rows.length > 1)}>×</button>
                </div>
              ))}
              <div style={{ ...tblRow, gridTemplateColumns: '110px 1fr 140px 110px 32px', background: '#f9fafb', fontWeight: 700 }}>
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
            <label style={fldLabel}>
              {field.label} {field.required && <span style={req}>*</span>}
              <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 400, marginLeft: 6 }}>(단위: 원)</span>
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14, color: '#6b7280' }}>₩</span>
              <input type="text" inputMode="numeric" value={formatMoney(values[field.id] || '')} placeholder="0"
                onChange={e => set(field.id, normalizeMoney(e.target.value))}
                style={{ flex: 1, border: '1px solid #d1d5db', borderRadius: 6, padding: '8px 12px', fontSize: 14, outline: 'none', textAlign: 'right' }} />
              <span style={{ fontSize: 14, color: '#6b7280' }}>원</span>
            </div>
          </div>
        )

      case 'radio': {
        const radioOpts = Array.isArray(field.options)
          ? field.options
          : (typeof field.options === 'string' ? (field.options as string).split('\n').filter(Boolean) : [])
        return (
          <div key={field.id} style={{ marginBottom: 20 }}>
            <label style={fldLabel}>{field.label} {field.required && <span style={req}>*</span>}</label>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              {radioOpts.map(opt => (
                <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 14 }}>
                  <input type="radio" name={field.id} value={opt} checked={values[field.id] === opt}
                    onChange={() => set(field.id, opt)} style={{ accentColor: '#1a56db' }} />
                  {opt}
                </label>
              ))}
            </div>
          </div>
        )
      }

      case 'file':
        return (
          <div key={field.id} style={{ marginBottom: 20 }}>
            <label style={fldLabel}>{field.label} {field.required && !(existingFiles[field.id]?.length) && <span style={req}>*</span>}</label>
            {field.hint && (
              <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#1e40af', marginBottom: 10 }}>
                ① {field.hint}
              </div>
            )}
            {(existingFiles[field.id] || []).map((ef, i) => (
              <div key={`ex-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, padding: '6px 10px', marginBottom: 6, fontSize: 12 }}>
                <span style={{ color: '#059669' }}>📎 기존:</span>
                <a href={ef.url} target="_blank" rel="noopener noreferrer" style={{ color: '#1d4ed8', textDecoration: 'none', fontWeight: 600, flex: 1, wordBreak: 'break-all' }}>
                  {ef.name}
                </a>
                {ef.size != null && <span style={{ color: '#9ca3af', fontSize: 11 }}>({(ef.size / 1024).toFixed(0)} KB)</span>}
                <button type="button" onClick={() => setExistingFiles(p => ({ ...p, [field.id]: (p[field.id] || []).filter((_, idx) => idx !== i) }))}
                  style={{ background: 'transparent', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 14, padding: '0 4px', flexShrink: 0 }}>✕</button>
              </div>
            ))}
            {(fileValues[field.id] || []).map((file, i) => (
              <div key={`new-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, padding: '6px 10px', marginBottom: 6, fontSize: 12 }}>
                <span style={{ color: '#1d4ed8' }}>➕ 신규:</span>
                <span style={{ color: '#1f2937', fontWeight: 600, flex: 1, wordBreak: 'break-all' }}>{file.name}</span>
                <span style={{ color: '#9ca3af', fontSize: 11 }}>({(file.size / 1024).toFixed(0)} KB)</span>
                <button type="button" onClick={() => setFileValues(p => ({ ...p, [field.id]: (p[field.id] || []).filter((_, idx) => idx !== i) }))}
                  style={{ background: 'transparent', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 14, padding: '0 4px', flexShrink: 0 }}>✕</button>
              </div>
            ))}
            {(() => {
              const totalBytes = (fileValues[field.id] || []).reduce((s, f) => s + f.size, 0)
                + (existingFiles[field.id] || []).reduce((s, ef) => s + (ef.size || 0), 0)
              const totalCount = (fileValues[field.id]?.length || 0) + (existingFiles[field.id]?.length || 0)
              const over = totalBytes > MAX_TOTAL_BYTES
              return totalCount > 0 ? (
                <div style={{ fontSize: 11, color: over ? '#dc2626' : '#6b7280', marginBottom: 6 }}>
                  합계 {totalCount}개 · {(totalBytes / 1024 / 1024).toFixed(2)} MB / 32 MB {over && '(초과)'}
                </div>
              ) : null
            })()}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <label style={{ background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 6, padding: '8px 14px', fontSize: 13, cursor: 'pointer', color: '#374151', flexShrink: 0 }}>
                파일 추가
                <input type="file" multiple style={{ display: 'none' }} accept=".jpg,.jpeg,.png,.pdf,.doc,.docx,.heic,.heif"
                  onChange={e => {
                    const picked = Array.from(e.target.files || [])
                    if (picked.length === 0) return
                    setFileValues(p => ({ ...p, [field.id]: [...(p[field.id] || []), ...picked] }))
                    e.target.value = ''
                  }} />
              </label>
              <span style={{ fontSize: 12, color: '#6b7280' }}>
                여러 장 한 번에 선택 가능 (휴대폰 사진 OK)
              </span>
            </div>
            <div style={hint}>① JPG, PNG, PDF 등 여러 장 첨부 가능 · 합계 최대 32MB</div>
          </div>
        )

      case 'select': {
        const selectOpts = Array.isArray(field.options)
          ? field.options
          : (typeof field.options === 'string' ? (field.options as string).split('\n').filter(Boolean) : [])
        return (
          <div key={field.id} style={{ marginBottom: 20 }}>
            <label style={fldLabel}>{field.label} {field.required && <span style={req}>*</span>}</label>
            <select value={values[field.id] || ''} onChange={e => set(field.id, e.target.value)}
              style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 6, padding: '8px 12px', fontSize: 14, outline: 'none', background: '#fff', boxSizing: 'border-box' }}>
              <option value="">-- 선택하세요 --</option>
              {selectOpts.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        )
      }

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
      case 'housing_agreement':
        return null

      default: {
        const isMoney = field.type === 'number' && /금액|amount/i.test(field.label)
        if (isMoney) {
          return (
            <div key={field.id} style={{ marginBottom: 20 }}>
              <label style={fldLabel}>
                {field.label} {field.required && <span style={req}>*</span>}
                <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 400, marginLeft: 6 }}>(단위: 원)</span>
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14, color: '#6b7280' }}>₩</span>
                <input type="text" inputMode="numeric" value={formatMoney(values[field.id] || '')} placeholder="0"
                  onChange={e => set(field.id, normalizeMoney(e.target.value))}
                  style={{ flex: 1, border: '1px solid #d1d5db', borderRadius: 6, padding: '8px 12px', fontSize: 14, outline: 'none', textAlign: 'right' }} />
                <span style={{ fontSize: 14, color: '#6b7280' }}>원</span>
              </div>
            </div>
          )
        }
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

          {sections.map(([secTitle, fields], idx) => (
            <div key={secTitle} style={card}>
              <div style={secHdr}><CircNum n={idx + 2} /> {secTitle}</div>
              {idx === 0 && (formConfig.신청내용주석 || formConfig.한도설명) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                  {formConfig.신청내용주석 && (
                    <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '10px 14px', fontSize: 12, color: '#92400e', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
                      💡 {formConfig.신청내용주석}
                    </div>
                  )}
                  {formConfig.한도설명 && (
                    <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#1e40af', whiteSpace: 'pre-line' }}>
                      ① {formConfig.한도설명}
                    </div>
                  )}
                </div>
              )}
              {fields.map(f => renderField(f))}
            </div>
          ))}

          {hasLoan && loanNum !== null && (
            <div style={card}>
              <div style={secHdr}><CircNum n={loanNum} /> 대부규정 준수 및 이자비용 등 공제납부 동의</div>
              <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '14px 16px', fontSize: 12, color: '#374151', lineHeight: 1.8, background: '#fafafa', maxHeight: 240, overflowY: 'auto', whiteSpace: 'pre-wrap', marginBottom: 12 }}>
                {LOAN_TEXT}
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={loanConsent} onChange={e => setLoanConsent(e.target.checked)} style={{ width: 16, height: 16, accentColor: '#1a56db' }} />
                <span style={{ fontSize: 13, fontWeight: 600 }}>위 [서식2] 대부규정 준수 및 이자비용 등 공제납부 동의서를 확인하였으며 이에 동의합니다. (필수)</span>
              </label>
            </div>
          )}

          {housingTriggered && housingNum !== null && (() => {
            const dur = diffYearsMonths(housingStart, housingEnd)
            const housingText = buildHousingText(dur.valid ? dur.years : '   ', dur.valid ? dur.months : '   ')
            const inputBox: React.CSSProperties = { width: '100%', border: '1px solid #d1d5db', borderRadius: 6, padding: '8px 12px', fontSize: 14, outline: 'none', boxSizing: 'border-box' }
            return (
              <div style={card}>
                <div style={secHdr}><CircNum n={housingNum} /> 무주택·1주택 서약</div>

                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: 14, marginBottom: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#92400e', marginBottom: 10 }}>📋 주택자금 추가 정보 입력</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                    <div>
                      <label style={{ ...fldLabel, fontSize: 12 }}>주택구입(임차) 지역 <span style={req}>*</span></label>
                      <input
                        value={housingRegion}
                        onChange={e => setHousingRegion(e.target.value)}
                        placeholder="예: 서울시 강남구"
                        style={inputBox}
                      />
                    </div>
                    <div>
                      <label style={{ ...fldLabel, fontSize: 12 }}>주소 <span style={req}>*</span></label>
                      <input
                        value={housingAddress}
                        onChange={e => setHousingAddress(e.target.value)}
                        placeholder="예: 강남구 테헤란로 123, 101동 1001호"
                        style={inputBox}
                      />
                    </div>
                  </div>
                  <div>
                    <label style={{ ...fldLabel, fontSize: 12 }}>무주택(1주택) 기간 <span style={req}>*</span></label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <input
                        type="month"
                        value={housingStart}
                        onChange={e => setHousingStart(e.target.value)}
                        style={{ ...inputBox, width: 'auto', flex: '0 1 auto' }}
                      />
                      <span style={{ color: '#6b7280', fontSize: 13 }}>~</span>
                      <input
                        type="month"
                        value={housingEnd}
                        onChange={e => setHousingEnd(e.target.value)}
                        style={{ ...inputBox, width: 'auto', flex: '0 1 auto' }}
                      />
                      <div style={{ background: '#fff', border: '1px solid #fde68a', borderRadius: 6, padding: '7px 12px', fontSize: 13, fontWeight: 700, color: '#92400e' }}>
                        {dur.valid ? `${dur.years}년 ${dur.months}개월` : '— 년 — 개월'}
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: '#92400e', marginTop: 6 }}>
                      ⓘ 무주택 기산일은 만 30세가 된 날 또는 혼인신고일 중 빠른 날입니다. 입력한 기간은 아래 서약서 ( )년 ( )개월 자리에 자동으로 반영됩니다.
                    </div>
                  </div>
                </div>

                <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '14px 16px', fontSize: 12, color: '#374151', lineHeight: 1.8, background: '#fafafa', maxHeight: 280, overflowY: 'auto', whiteSpace: 'pre-wrap', marginBottom: 12 }}>
                  {housingText}
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={housingConsent} onChange={e => setHousingConsent(e.target.checked)} style={{ width: 16, height: 16, accentColor: '#1a56db' }} />
                  <span style={{ fontSize: 13, fontWeight: 600 }}>위 [서식3] 무주택·1주택 서약서를 확인하였으며 이에 서약합니다. (필수)</span>
                </label>
              </div>
            )
          })()}

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
            <button type="submit" disabled={submitting || editLocked} style={{ ...btnPrimary, flex: 1, padding: '14px', fontSize: 15, opacity: (submitting || editLocked) ? 0.5 : 1 }}>
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

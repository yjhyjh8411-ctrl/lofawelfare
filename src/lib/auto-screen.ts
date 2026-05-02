/**
 * 자동 사전심사 룰 엔진
 *
 * 신청서가 들어오면 룰 기반으로 검토하여 통과/경고/차단 플래그를 반환.
 * 외부 API 호출 없이 결정론적 룰만 사용 — 비용 0원.
 *
 * 입력: 신청 1건 + 컨텍스트 (폼 설정, 사용자 정보, 같은 사용자의 다른 신청)
 * 출력: { level: 'pass' | 'warn' | 'block', flags: ScreenFlag[] }
 */

export type ScreenLevel = 'pass' | 'warn' | 'block'

export interface ScreenFlag {
  level: ScreenLevel
  code: string
  label: string
  detail?: string
}

export interface ScreenResult {
  level: ScreenLevel
  flags: ScreenFlag[]
}

interface ScreenApp {
  id: string
  form_id: string
  user_id?: string
  status: string
  created_at: { toDate?: () => Date } | null
  applicant?: { 사번?: string; 성명?: string; 부서?: string }
  data?: Record<string, unknown>
}

interface ScreenFormField {
  id: string
  label: string
  type: string
  required?: boolean
  options?: string[] | string
}

interface ScreenFormConfig {
  id: string
  제목: string
  fields?: ScreenFormField[]
  periods?: { year: number; start: string; end: string }[]
  대부동의필요?: boolean
  무주택서약필요?: boolean
  무주택서약조건필드ID?: string
  무주택서약조건값들?: string[]
}

interface ScreenUser {
  사번?: string
  status?: string
}

interface ScreenBudgetGroup {
  id: string
  name: string
  limitAmount: number
  period: 'annual' | 'monthly'
  formIds: string[]
}

export interface ScreenContext {
  form: ScreenFormConfig | null
  user: ScreenUser | null
  /** 같은 신청자의 모든 신청 (현재 신청 포함) */
  userApps: ScreenApp[]
  /** 전체 신청 (예산 그룹 합산용) */
  allApps: ScreenApp[]
  budgetGroups: ScreenBudgetGroup[]
}

const ROW_TYPES = new Set([
  'medical_records',
  'scholarship_records',
  'living_records',
  'cultural_records',
  'vaccination_records',
])

/** 신청 데이터에서 합계 금액 추출 (테이블형 필드의 금액 합계 또는 amount 필드) */
function extractAmount(data: Record<string, unknown> | undefined, form: ScreenFormConfig | null): number {
  if (!data) return 0
  let sum = 0
  // 합계 키들 우선
  const totalKeys = ['총금액', '장학금총액', '생활복지총액', '문화활동총액', '예방접종총액']
  for (const k of totalKeys) {
    const v = data[k]
    if (typeof v === 'number') sum = Math.max(sum, v)
    else if (typeof v === 'string') {
      const n = parseInt(v.replace(/[^\d]/g, ''))
      if (!isNaN(n)) sum = Math.max(sum, n)
    }
  }
  if (sum > 0) return sum
  // 일반 amount 필드
  if (form?.fields) {
    for (const f of form.fields) {
      if (f.type === 'amount' || f.type === 'number') {
        if (!/금액|amount/i.test(f.label) && !/금액|amount/i.test(f.id)) continue
        const v = data[f.label]
        if (typeof v === 'number') return v
        if (typeof v === 'string') {
          const n = parseInt(v.replace(/[^\d]/g, ''))
          if (!isNaN(n)) return n
        }
      }
    }
  }
  return 0
}

/** 행 단위 테이블 필드의 row 합 vs 데이터에 저장된 합계 비교 */
function checkRowSumMismatch(data: Record<string, unknown> | undefined, form: ScreenFormConfig | null): ScreenFlag | null {
  if (!data || !form?.fields) return null
  for (const f of form.fields) {
    if (!ROW_TYPES.has(f.type)) continue
    const rows = data[f.label]
    if (!Array.isArray(rows)) continue
    const rowSum = rows.reduce((s, r) => {
      if (r && typeof r === 'object') {
        const v = (r as Record<string, unknown>).금액
        const n = typeof v === 'number' ? v : (typeof v === 'string' ? parseInt(v.replace(/[^\d]/g, '')) : 0)
        return s + (isNaN(n) ? 0 : n)
      }
      return s
    }, 0)
    // 같은 폼에 저장된 총합 확인
    const totalKeys: Record<string, string> = {
      medical_records: '총금액',
      scholarship_records: '장학금총액',
      living_records: '생활복지총액',
      cultural_records: '문화활동총액',
      vaccination_records: '예방접종총액',
    }
    const tk = totalKeys[f.type]
    if (tk) {
      const stored = data[tk]
      const storedNum = typeof stored === 'number' ? stored : (typeof stored === 'string' ? parseInt(String(stored).replace(/[^\d]/g, '')) : NaN)
      if (!isNaN(storedNum) && storedNum !== rowSum) {
        return {
          level: 'warn',
          code: 'AMOUNT_MISMATCH',
          label: '금액 합계 불일치',
          detail: `${f.label}: 행 합계 ${rowSum.toLocaleString()}원 ≠ 저장 합계 ${storedNum.toLocaleString()}원`,
        }
      }
    }
  }
  return null
}

/** 라벨 정규화 — 공백 제거 + NFC 정규화 후 비교 */
function normalize(s: string): string {
  return s.normalize('NFC').replace(/\s+/g, '').toLowerCase()
}

/** 신청 데이터에서 필드 값을 찾는다.
 *  1) label 직접 매칭 → 2) 정규화 매칭 → 3) id 매칭 (혹시 옛 데이터)
 *  match 우선순위로 첫 hit 반환. 못 찾으면 undefined.
 */
function findFieldValue(data: Record<string, unknown> | undefined, f: ScreenFormField): unknown {
  if (!data) return undefined
  if (f.label in data) return data[f.label]
  const dataKeys = Object.keys(data)
  const nLabel = normalize(f.label)
  // 정규화 비교
  const fuzzyKey = dataKeys.find(k => normalize(k) === nLabel)
  if (fuzzyKey) return data[fuzzyKey]
  // ID 매칭 (구버전 호환)
  if (f.id in data) return data[f.id]
  return undefined
}

/** 값이 "비어있는지" 판정 — 0, false 는 유효한 값으로 인정 */
function isEmpty(v: unknown): boolean {
  if (v === undefined || v === null) return true
  if (typeof v === 'string') return v.trim() === ''
  if (Array.isArray(v)) {
    if (v.length === 0) return true
    return v.every(r => {
      if (r === null || r === undefined) return true
      if (typeof r !== 'object') return !r
      // 행 객체: 모든 값이 빈 문자열이거나 nullish 일 때만 빈 행
      const vals = Object.values(r as Record<string, unknown>)
      return vals.every(x => x === undefined || x === null || (typeof x === 'string' && x.trim() === ''))
    })
  }
  if (typeof v === 'object') return Object.keys(v as Record<string, unknown>).length === 0
  return false
}

/** 필수 필드 누락 검사 — 결과는 warn 레벨 (라벨 변경/필드 추가 등 구조적 이슈 가능성)
 *  단, 신청 데이터 자체가 완전히 비어있는 경우만 block
 */
function checkRequired(app: ScreenApp, form: ScreenFormConfig): ScreenFlag | null {
  if (!form.fields) return null
  const dataEmpty = !app.data || Object.keys(app.data).length === 0
  if (dataEmpty) {
    return {
      level: 'block',
      code: 'EMPTY_DATA',
      label: '신청 데이터 없음',
      detail: '저장된 신청 내용이 비어있습니다.',
    }
  }
  const missing: string[] = []
  for (const f of form.fields) {
    if (!f.required) continue
    // 시스템 자동 처리 필드는 검사 제외
    if (f.type === 'loan_agreement' || f.type === 'housing_agreement') continue
    const v = findFieldValue(app.data, f)
    if (isEmpty(v)) missing.push(f.label)
  }
  if (missing.length === 0) return null
  // 보수적 판정: 차단이 아닌 경고로 노출 (라벨 변경/늦게 추가된 필수 등 가능성)
  return {
    level: 'warn',
    code: 'MISSING_REQUIRED',
    label: `필수 항목 ${missing.length}건 미확인`,
    detail: `${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ` 외 ${missing.length - 5}건` : ''}. 폼 편집 후 라벨이 바뀌었거나 새 필수 항목이 추가됐을 수 있습니다.`,
  }
}

/** 신청기간 검사 — 신청일이 폼의 어떤 신청기간에도 포함되지 않으면 경고 */
function checkPeriod(app: ScreenApp, form: ScreenFormConfig): ScreenFlag | null {
  const periods = form.periods || []
  if (periods.length === 0) return null
  const created = app.created_at?.toDate?.()
  if (!created) return null
  const ymd = created.toISOString().slice(0, 10)
  const inAny = periods.some(p => p.start && p.end && ymd >= p.start && ymd <= p.end)
  if (inAny) return null
  return {
    level: 'warn',
    code: 'OUT_OF_PERIOD',
    label: '신청기간 외 접수',
    detail: `신청일 ${ymd} — 정기 신청기간(${periods.map(p => `${p.start}~${p.end}`).join(', ')}) 밖`,
  }
}

/** 휴직자 대부 — 현재 휴직 상태일 때 경고 (신청 시점에는 휴직이 아니었을 수 있음) */
function checkLeaveLoan(form: ScreenFormConfig, user: ScreenUser | null): ScreenFlag | null {
  if (!form.대부동의필요) return null
  if (user?.status !== 'leave') return null
  return {
    level: 'warn',
    code: 'LEAVE_LOAN',
    label: '신청자 현재 휴직 중',
    detail: '대부사업 제한 대상 (제7조 1항). 신청 시점 상태를 확인 후 처리 바랍니다.',
  }
}

/** 무주택 서약 조건 일치 vs 동의 누락 검사 */
function checkHousingOath(app: ScreenApp, form: ScreenFormConfig): ScreenFlag | null {
  if (!form.무주택서약필요) return null
  const tf = form.무주택서약조건필드ID
  const tv = form.무주택서약조건값들 || []
  if (!tf) return null
  const tField = form.fields?.find(f => f.id === tf)
  if (!tField) return null
  const userValue = findFieldValue(app.data, tField)
  if (typeof userValue !== 'string') return null
  if (tv.length > 0 && !tv.includes(userValue)) return null
  // 조건이 매칭되었는데 서약값이 누락
  const data = app.data || {}
  const oathKeys = Object.keys(data).filter(k => /무주택|1주택|서약/.test(k))
  if (oathKeys.some(k => !!data[k])) return null
  return {
    level: 'warn',
    code: 'HOUSING_OATH_MISSING',
    label: '[서식3] 무주택·1주택 서약 누락',
    detail: `대부 종류 "${userValue}" 선택 시 무주택·1주택 서약이 필요합니다.`,
  }
}

/** 같은 사용자의 같은 폼에 대한 중복(연도 단위) 신청 */
function checkDuplicate(app: ScreenApp, ctx: ScreenContext): ScreenFlag | null {
  const created = app.created_at?.toDate?.()
  const year = created?.getFullYear()
  if (!year) return null
  const others = ctx.userApps.filter(a =>
    a.id !== app.id &&
    a.form_id === app.form_id &&
    (a.status === 'pending' || a.status === 'approved') &&
    a.created_at?.toDate?.()?.getFullYear() === year,
  )
  if (others.length === 0) return null
  return {
    level: 'warn',
    code: 'DUPLICATE',
    label: '중복 신청 가능성',
    detail: `${year}년 동일 신청서 ${others.length}건 (${others.map(o => o.status === 'approved' ? '승인됨' : '검토중').join(', ')})`,
  }
}

/** 0원 신청 의심 */
function checkZeroAmount(app: ScreenApp, form: ScreenFormConfig): ScreenFlag | null {
  // 대부 신청은 0원 정상 가능 (생활안정 등) → 스킵
  if (form.대부동의필요) return null
  // 행 단위 필드가 있을 경우만 의미가 있음
  const hasRows = form.fields?.some(f => ROW_TYPES.has(f.type))
  if (!hasRows) return null
  const amount = extractAmount(app.data, form)
  if (amount > 0) return null
  return {
    level: 'warn',
    code: 'ZERO_AMOUNT',
    label: '신청 금액 0원',
    detail: '내역의 금액이 모두 비어있거나 0원입니다.',
  }
}

/** 예산 그룹 한도 초과 */
function checkBudgetExceeded(app: ScreenApp, ctx: ScreenContext): ScreenFlag | null {
  const group = ctx.budgetGroups.find(g => g.formIds.includes(app.form_id))
  if (!group || !group.limitAmount) return null
  const created = app.created_at?.toDate?.()
  if (!created) return null
  const isAnnual = group.period === 'annual'
  const sameUser = ctx.userApps.filter(a => a.user_id === app.user_id || (a.applicant?.사번 && a.applicant?.사번 === app.applicant?.사번))
  // 그룹 내 폼들에 대해 같은 기간 승인 합산
  const periodOf = (d: Date) => isAnnual ? d.getFullYear().toString() : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  const thisPeriod = periodOf(created)
  let approvedSum = 0
  for (const a of sameUser) {
    if (!group.formIds.includes(a.form_id)) continue
    if (a.id === app.id) continue
    if (a.status !== 'approved') continue
    const ad = a.created_at?.toDate?.()
    if (!ad) continue
    if (periodOf(ad) !== thisPeriod) continue
    approvedSum += extractAmount(a.data, ctx.form)
  }
  const thisAmount = extractAmount(app.data, ctx.form)
  const total = approvedSum + thisAmount
  if (total <= group.limitAmount) return null
  return {
    level: 'warn',
    code: 'BUDGET_EXCEEDED',
    label: `${group.name} 한도 초과`,
    detail: `${isAnnual ? '연간' : '월간'} 한도 ${group.limitAmount.toLocaleString()}원 — 기존 승인 ${approvedSum.toLocaleString()}원 + 이번 ${thisAmount.toLocaleString()}원 = ${total.toLocaleString()}원`,
  }
}

export function screen(app: ScreenApp, ctx: ScreenContext): ScreenResult {
  const flags: ScreenFlag[] = []
  if (!ctx.form) {
    return { level: 'warn', flags: [{ level: 'warn', code: 'NO_FORM', label: '신청서 정의를 찾을 수 없음' }] }
  }
  // 룰 실행 (블록 룰 우선)
  const checks = [
    () => checkRequired(app, ctx.form!),
    () => checkLeaveLoan(ctx.form!, ctx.user),
    () => checkPeriod(app, ctx.form!),
    () => checkHousingOath(app, ctx.form!),
    () => checkDuplicate(app, ctx),
    () => checkRowSumMismatch(app.data, ctx.form),
    () => checkZeroAmount(app, ctx.form!),
    () => checkBudgetExceeded(app, ctx),
  ]
  for (const c of checks) {
    try {
      const f = c()
      if (f) flags.push(f)
    } catch {
      /* 룰 자체 오류는 무시하고 다음 룰 진행 */
    }
  }
  // 종합 판정
  let level: ScreenLevel = 'pass'
  if (flags.some(f => f.level === 'block')) level = 'block'
  else if (flags.some(f => f.level === 'warn')) level = 'warn'
  return { level, flags }
}

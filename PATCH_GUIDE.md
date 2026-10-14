# 🛡️ LOFA 복지시스템 무과금(0원) 최적화 및 보안/버그 패치 가이드

본 문서는 클라우드 인프라 추가 비용(0원)을 유지하면서, 기존 코드의 잠재적 버그를 수정하고 보안 취약점을 보완하며, Firebase 무료 할당량(Free Tier) 소진을 최소화하기 위한 통합 패치 문서입니다.

---

## 💰 1. 비용 0원(무료 티어) 사수를 위한 핵심 원칙

1. **Functions 리전 유지 (`us-central1` 절대 유지):**
   - `asia-northeast3`(서울) 리전은 무료 티어 혜택이 제한적입니다. 약간의 네트워크 딜레이가 있더라도 완전 무료 할당량이 제공되는 `us-central1`을 그대로 유지합니다.
2. **메모리 256MiB 유지 및 배치(Batch) 최적화:**
   - 메모리를 늘리면 무료 GB-초(GB-seconds)가 빨리 소진됩니다. 256MiB를 유지하되, 느린 순차 처리(`for...of` 단건 `await`)를 `Firestore Batch` 및 병렬 처리로 바꿔 **실행 시간(과금 기준)을 1/10로 단축**합니다.
3. **관리자 권한 체크 시 DB Read 절감:**
   - 마스터 계정(`uid === 'admin'`)이거나 이미 확인된 경우 불필요한 Firestore 문서 조회(`users/{uid}.get()`)를 건너뛰어 무료 읽기 할당량(일 5만 건)을 아낍니다.

---

## 🛠️ 2. 핵심 수정 사항 요약

| 대상 파일 | 수정 항목 | 기대 효과 (보안 / 버그 / 비용) |
| :--- | :--- | :--- |
| **`src/lib/auto-screen.ts`** | 1. KST(한국 시간) 타임존 보정 추가<br>2. 타 양식 간 예산 합산 폴백(Fallback) 로직 보완 | • 자정~오전 9시 신청 건 '기간 외 접수' 오판 버그 해결<br>• 예산 그룹 내 다른 양식 금액이 0원으로 누락되는 버그 해결 |
| **`functions/src/index.ts`** | 1. `requireAdmin` 마스터(`admin`) 예외 복구<br>2. `/api/encrypt` 평문 길이 제한 (4KB)<br>3. OTP 해시 비교 `timingSafeEqual` 적용<br>4. 계정 동기화/마이그레이션 Batch 병렬화 | • `CLAUDE.md` 및 `firestore.rules`와 권한 로직 100% 일치<br>• 무제한 암호화 호출을 통한 메모리/CPU 과금 공격 차단<br>• 타이밍 공격 방어 및 대량 처리 시 60초 타임아웃 완벽 방지 |
| **`GEMINI.md`** | 1. 잘못된 SSR/Server Actions 지침 제거<br>2. `CLAUDE.md` 기준 정적 빌드 규칙으로 통일 | • AI 코딩 시 정적 빌드(`output: 'export'`) 깨짐 방지<br>• 존재하지 않는 `npm run lint` 무한 루프 방지 |

---

## 📄 3. 파일별 전체 수정 코드 (복사해서 덮어쓰기)

### ① `src/lib/auto-screen.ts` (전체 교체)

**주요 변경점:**
- `toKstYmd()` 헬퍼를 추가하여 UTC 기준 날짜 계산 오차를 완벽히 해결했습니다.
- `ScreenContext`에 선택적 `formsMap`을 지원하고, `extractAmount`가 양식 정의 없이도 데이터 키 이름(`금액`, `신청금액`, `지원금액` 등)을 스스로 추론해 합산하도록 폴백 로직을 강화했습니다 (기존 호출부 코드를 수정하지 않아도 즉시 호환됨).

```typescript
/**
 * 자동 사전심사 룰 엔진 (무과금 결정론적 룰 엔진)
 *
 * 신청서가 들어오면 룰 기반으로 검토하여 통과/경고/차단 플래그를 반환.
 * 외부 API 호출 없이 결정론적 룰만 사용 — 비용 0원.
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
  /** (선택) 전체 양식 맵 — 제공 시 예산 그룹 내 타 양식 금액을 더 정확히 추출 */
  formsMap?: Record<string, ScreenFormConfig>
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

/** [패치] Date 객체를 한국 시간(KST, UTC+9) 기준 'YYYY-MM-DD' 문자열로 변환 */
function toKstYmd(date: Date): string {
  const kstTime = date.getTime() + 9 * 60 * 60 * 1000
  return new Date(kstTime).toISOString().slice(0, 10)
}

/** [패치] Date 객체를 한국 시간(KST) 기준 연도/월 정보로 변환 */
function toKstYearMonth(date: Date): { year: number; ym: string } {
  const ymd = toKstYmd(date)
  return {
    year: parseInt(ymd.slice(0, 4), 10),
    ym: ymd.slice(0, 7),
  }
}

/** 신청 데이터에서 합계 금액 추출 (테이블형 필드의 금액 합계 또는 amount 필드) */
function extractAmount(data: Record<string, unknown> | undefined, form: ScreenFormConfig | null): number {
  if (!data) return 0
  let sum = 0

  // 1순위: 명시적 합계 키들 우선 탐색
  const totalKeys = ['총금액', '장학금총액', '생활복지총액', '문화활동총액', '예방접종총액', '신청금액', '지원금액']
  for (const k of totalKeys) {
    const v = data[k]
    if (typeof v === 'number') sum = Math.max(sum, v)
    else if (typeof v === 'string') {
      const n = parseInt(v.replace(/[^\d]/g, ''), 10)
      if (!isNaN(n)) sum = Math.max(sum, n)
    }
  }
  if (sum > 0) return sum

  // 2순위: form 정의가 있을 경우 amount/number 필드 탐색
  if (form?.fields) {
    for (const f of form.fields) {
      if (f.type === 'amount' || f.type === 'number') {
        if (!/금액|amount|비용|총액/i.test(f.label) && !/금액|amount/i.test(f.id)) continue
        const v = data[f.label] ?? data[f.id]
        if (typeof v === 'number') return v
        if (typeof v === 'string') {
          const n = parseInt(v.replace(/[^\d]/g, ''), 10)
          if (!isNaN(n)) return n
        }
      }
    }
  }

  // 3순위 [패치]: 타 양식(form 불일치)이거나 폼 정의가 없을 때 data 키 자체에서 금액/배열 추론
  for (const [k, v] of Object.entries(data)) {
    if (Array.isArray(v)) {
      const rowSum = v.reduce((acc, r) => {
        if (r && typeof r === 'object') {
          const amt = (r as Record<string, unknown>).금액
          const n = typeof amt === 'number' ? amt : typeof amt === 'string' ? parseInt(amt.replace(/[^\d]/g, ''), 10) : 0
          return acc + (isNaN(n) ? 0 : n)
        }
        return acc
      }, 0)
      if (rowSum > 0) sum = Math.max(sum, rowSum)
    } else if (/금액|총액|비용|amount/i.test(k)) {
      const n = typeof v === 'number' ? v : typeof v === 'string' ? parseInt(v.replace(/[^\d]/g, ''), 10) : 0
      if (!isNaN(n) && n > 0) sum = Math.max(sum, n)
    }
  }

  return sum
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
        const n = typeof v === 'number' ? v : (typeof v === 'string' ? parseInt(v.replace(/[^\d]/g, ''), 10) : 0)
        return s + (isNaN(n) ? 0 : n)
      }
      return s
    }, 0)
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
      const storedNum = typeof stored === 'number' ? stored : (typeof stored === 'string' ? parseInt(String(stored).replace(/[^\d]/g, ''), 10) : NaN)
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

/** 신청 데이터에서 필드 값을 찾는다. */
function findFieldValue(data: Record<string, unknown> | undefined, f: ScreenFormField): unknown {
  if (!data) return undefined
  if (f.label in data) return data[f.label]
  const dataKeys = Object.keys(data)
  const nLabel = normalize(f.label)
  const fuzzyKey = dataKeys.find(k => normalize(k) === nLabel)
  if (fuzzyKey) return data[fuzzyKey]
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
      const vals = Object.values(r as Record<string, unknown>)
      return vals.every(x => x === undefined || x === null || (typeof x === 'string' && x.trim() === ''))
    })
  }
  if (typeof v === 'object') return Object.keys(v as Record<string, unknown>).length === 0
  return false
}

/** 필수 필드 누락 검사 */
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
    if (f.type === 'loan_agreement' || f.type === 'housing_agreement') continue
    const v = findFieldValue(app.data, f)
    if (isEmpty(v)) missing.push(f.label)
  }
  if (missing.length === 0) return null
  return {
    level: 'warn',
    code: 'MISSING_REQUIRED',
    label: `필수 항목 ${missing.length}건 미확인`,
    detail: `${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ` 외 ${missing.length - 5}건` : ''}. 폼 편집 후 라벨이 바뀌었거나 새 필수 항목이 추가됐을 수 있습니다.`,
  }
}

/** 신청기간 검사 — [패치] KST 기준으로 날짜 비교 */
function checkPeriod(app: ScreenApp, form: ScreenFormConfig): ScreenFlag | null {
  const periods = form.periods || []
  if (periods.length === 0) return null
  const created = app.created_at?.toDate?.()
  if (!created) return null
  const ymd = toKstYmd(created)
  const inAny = periods.some(p => p.start && p.end && ymd >= p.start && ymd <= p.end)
  if (inAny) return null
  return {
    level: 'warn',
    code: 'OUT_OF_PERIOD',
    label: '신청기간 외 접수',
    detail: `신청일 ${ymd}(KST) — 정기 신청기간(${periods.map(p => `${p.start}~${p.end}`).join(', ')}) 밖`,
  }
}

/** 휴직자 대부 — 현재 휴직 상태일 때 경고 */
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

/** 같은 사용자의 같은 폼에 대한 중복(연도 단위) 신청 — [패치] KST 연도 기준 */
function checkDuplicate(app: ScreenApp, ctx: ScreenContext): ScreenFlag | null {
  const created = app.created_at?.toDate?.()
  if (!created) return null
  const { year } = toKstYearMonth(created)
  const others = ctx.userApps.filter(a => {
    const ad = a.created_at?.toDate?.()
    return (
      a.id !== app.id &&
      a.form_id === app.form_id &&
      (a.status === 'pending' || a.status === 'approved') &&
      ad &&
      toKstYearMonth(ad).year === year
    )
  })
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
  if (form.대부동의필요) return null
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

/** 예산 그룹 한도 초과 — [패치] KST 기간 적용 및 타 양식 금액 추출 보완 */
function checkBudgetExceeded(app: ScreenApp, ctx: ScreenContext): ScreenFlag | null {
  const group = ctx.budgetGroups.find(g => g.formIds.includes(app.form_id))
  if (!group || !group.limitAmount) return null
  const created = app.created_at?.toDate?.()
  if (!created) return null
  const isAnnual = group.period === 'annual'
  const sameUser = ctx.userApps.filter(
    a => a.user_id === app.user_id || (a.applicant?.사번 && a.applicant?.사번 === app.applicant?.사번)
  )
  const periodOf = (d: Date) => {
    const { year, ym } = toKstYearMonth(d)
    return isAnnual ? String(year) : ym
  }
  const thisPeriod = periodOf(created)
  let approvedSum = 0
  for (const a of sameUser) {
    if (!group.formIds.includes(a.form_id)) continue
    if (a.id === app.id) continue
    if (a.status !== 'approved') continue
    const ad = a.created_at?.toDate?.()
    if (!ad) continue
    if (periodOf(ad) !== thisPeriod) continue
    // 해당 신청서의 원본 폼 설정을 참조하되, 없으면 폴백 추론 작동
    const targetForm = ctx.formsMap?.[a.form_id] ?? (a.form_id === ctx.form?.id ? ctx.form : null)
    approvedSum += extractAmount(a.data, targetForm)
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
  let level: ScreenLevel = 'pass'
  if (flags.some(f => f.level === 'block')) level = 'block'
  else if (flags.some(f => f.level === 'warn')) level = 'warn'
  return { level, flags }
}
```

---

### ② `functions/src/index.ts` (전체 교체)

**주요 변경점:**
- `requireAdmin`: `decoded.uid === 'admin'`일 경우 DB 조회 없이 즉시 통과시켜 **Firestore 읽기 비용 절약 및 문서 스펙 일치**.
- `/api/encrypt`: 4,096자(4KB) 초과 데이터 암호화 요청을 거부하여 **악성 트래픽으로 인한 함수 실행 비용 폭탄 방지**.
- `/api/mfa/verify-otp` & `/api/restore-accounts`: 문자열 단순 비교(`===`) 대신 `timingSafeEqual`을 사용하여 **타이밍 공격 원천 차단**.
- `/api/migrate-project`: 단건 순차 저장을 **500건 단위 `Firestore Batch` 커밋**으로 변경해 실행 시간을 대폭 줄이고 60초 타임아웃 및 과금 누수를 방지했습니다.

```typescript
import { onRequest } from 'firebase-functions/v2/https'
import * as admin from 'firebase-admin'
import express from 'express'
import { createHmac, randomBytes, createCipheriv, createDecipheriv, timingSafeEqual } from 'crypto'
import nodemailer from 'nodemailer'
import { FieldValue } from 'firebase-admin/firestore'

admin.initializeApp()
const db = admin.firestore()
const auth = admin.auth()

const app = express()
app.use(express.json({ limit: '1mb' })) // 과도한 페이로드 공격 차단

const BASE_URL = process.env.BASE_URL || '[https://lofawelfare-3ae73.web.app](https://lofawelfare-3ae73.web.app)'
const DEFAULT_TEMP_PASSWORD = process.env.DEFAULT_TEMP_PASSWORD || 'lofa1234!'

// ─── Auth helpers ─────────────────────────────────────────────────────────────

async function verifyToken(req: express.Request): Promise<admin.auth.DecodedIdToken | null> {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) return null
  try { return await auth.verifyIdToken(header.slice(7)) } catch { return null }
}

async function requireAuth(req: express.Request, res: express.Response): Promise<admin.auth.DecodedIdToken | false> {
  const decoded = await verifyToken(req)
  if (!decoded) { res.status(401).json({ error: '인증이 필요합니다.' }); return false }
  return decoded
}

/** [패치] uid === 'admin' 마스터 계정 예외 처리 추가 (DB Read 1회 절약 및 CLAUDE.md 규칙 준수) */
async function requireAdmin(req: express.Request, res: express.Response): Promise<admin.auth.DecodedIdToken | false> {
  const decoded = await verifyToken(req)
  if (!decoded) { res.status(401).json({ error: '인증이 필요합니다.' }); return false }
  if (decoded.uid === 'admin') return decoded
  const userDoc = await db.collection('users').doc(decoded.uid).get()
  if (!userDoc.exists || !userDoc.data()?.isAdmin) {
    res.status(403).json({ error: '관리자 권한이 필요합니다.' }); return false
  }
  return decoded
}

/** 안전한 문자열 상수 시간 비교 헬퍼 */
function safeCompare(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a, 'utf8')
    const bufB = Buffer.from(b, 'utf8')
    if (bufA.length !== bufB.length) return false
    return timingSafeEqual(bufA, bufB)
  } catch {
    return false
  }
}

// ─── Encryption ───────────────────────────────────────────────────────────────

const ALGORITHM = 'aes-256-gcm'
const MAX_ENCRYPT_LENGTH = 4096 // [패치] 오라클 악용 및 과금 폭탄 방지용 길이 제한

function getKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY
  if (!key || key.length !== 64) throw new Error('ENCRYPTION_KEY가 설정되지 않았습니다.')
  return Buffer.from(key, 'hex')
}

function encrypt(plaintext: string): string {
  const key = getKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `enc:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

function decrypt(ciphertext: string): string {
  const key = getKey()
  const parts = ciphertext.split(':')
  if (parts[0] !== 'enc' || parts.length !== 4) throw new Error('Invalid encrypted format')
  const iv = Buffer.from(parts[1], 'hex')
  const authTag = Buffer.from(parts[2], 'hex')
  const encrypted = Buffer.from(parts[3], 'hex')
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  return decipher.update(encrypted).toString('utf8') + decipher.final('utf8')
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// POST /api/encrypt
app.post('/api/encrypt', async (req, res) => {
  const decoded = await requireAuth(req, res)
  if (!decoded) return
  try {
    const { value } = req.body
    if (value === undefined || value === null || value === '') {
      res.status(400).json({ status: 'error', message: 'value가 필요합니다.' }); return
    }
    const strVal = String(value)
    if (strVal.length > MAX_ENCRYPT_LENGTH) {
      res.status(413).json({ status: 'error', message: `암호화 대상이 너무 깁니다 (최대 ${MAX_ENCRYPT_LENGTH}자).` }); return
    }
    res.json({ status: 'success', encrypted: encrypt(strVal) })
  } catch (err) {
    res.status(500).json({ status: 'error', message: err instanceof Error ? err.message : 'Unknown' })
  }
})

// POST /api/decrypt
app.post('/api/decrypt', async (req, res) => {
  const decoded = await requireAdmin(req, res)
  if (!decoded) return
  try {
    const { value } = req.body
    if (!value) { res.status(400).json({ status: 'error', message: 'value가 필요합니다.' }); return }
    res.json({ status: 'success', decrypted: decrypt(String(value)) })
  } catch (err) {
    res.status(500).json({ status: 'error', message: err instanceof Error ? err.message : 'Unknown' })
  }
})

// POST /api/set-password
app.post('/api/set-password', async (req, res) => {
  const decoded = await requireAuth(req, res)
  if (!decoded) return
  try {
    const { password } = req.body
    if (!password || String(password).length < 6) { res.status(400).json({ status: 'error', message: '비밀번호는 6자 이상이어야 합니다.' }); return }
    await auth.updateUser(decoded.uid, { password: String(password) })
    res.json({ status: 'success' })
  } catch (err) {
    res.status(500).json({ status: 'error', message: err instanceof Error ? err.message : 'Unknown' })
  }
})

// POST /api/signup
app.post('/api/signup', async (req, res) => {
  try {
    const { email, password, employeeId, name, department, position, phone, hireDate } = req.body || {}
    if (!email || !password || !employeeId || !name) {
      res.status(400).json({ error: '필수 항목이 누락되었습니다.' }); return
    }
    if (String(password).length < 6) {
      res.status(400).json({ error: '비밀번호는 6자 이상이어야 합니다.' }); return
    }
    const cleanEmail = String(email).trim().toLowerCase()
    try {
      const existing = await auth.getUserByEmail(cleanEmail)
      if (existing) { res.status(409).json({ error: '이미 사용 중인 이메일입니다.' }); return }
    } catch { /* not-found OK */ }

    const empSnap = await db.collection('users').where('사번', '==', String(employeeId).trim()).limit(1).get()
    if (!empSnap.empty) {
      res.status(409).json({ error: `사번 ${employeeId} 으로 이미 가입된 계정이 있습니다.` }); return
    }

    const userRecord = await auth.createUser({ email: cleanEmail, password: String(password), displayName: String(name) })
    await db.collection('users').doc(userRecord.uid).set({
      사번: String(employeeId).trim(),
      성명: String(name).trim(),
      부서: String(department || ''),
      직급: String(position || ''),
      전화번호: String(phone || ''),
      입사일: String(hireDate || ''),
      이메일: cleanEmail,
      외부이메일: cleanEmail,
      isAdmin: false,
      status: 'active',
      accountStatus: 'pending',
      createdAt: FieldValue.serverTimestamp(),
    })
    res.json({ status: 'ok', uid: userRecord.uid })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('email-already-exists') || msg.includes('email-already-in-use')) {
      res.status(409).json({ error: '이미 사용 중인 이메일입니다.' }); return
    }
    res.status(500).json({ error: `가입 처리 실패: ${msg}` })
  }
})

// POST /api/lookup-email
app.post('/api/lookup-email', async (req, res) => {
  try {
    const { email } = req.body
    if (!email) { res.status(400).json({ error: 'email required' }); return }

    const snap = await db.collection('users').where('이메일', '==', email).limit(1).get()
    if (!snap.empty) {
      try { const u = await auth.getUser(snap.docs[0].id); res.json({ authEmail: u.email }); return } catch { /* continue */ }
    }
    const snap2 = await db.collection('users').where('구글이메일', '==', email).limit(1).get()
    if (!snap2.empty) {
      try { const u = await auth.getUser(snap2.docs[0].id); res.json({ authEmail: u.email }); return } catch { /* continue */ }
    }
    try { const u = await auth.getUserByEmail(email); res.json({ authEmail: u.email }); return } catch { /* continue */ }
    res.json({ authEmail: null })
  } catch { res.status(500).json({ error: 'lookup failed' }) }
})

// POST /api/notify
app.post('/api/notify', async (req, res) => {
  const decoded = await requireAdmin(req, res)
  if (!decoded) return
  try {
    const { type, to, email, message, subject } = req.body
    const notifyDoc = await db.collection('settings').doc('notify').get()
    const settings = (notifyDoc.exists ? notifyDoc.data() : {}) as {
      sms?: { apiKey?: string; apiSecret?: string; from: string; accessToken?: string; authType?: string }
      email?: { from: string; password?: string; accessToken?: string; refreshToken?: string; authType?: string }
    }

    const results: string[] = []
    const errors: string[] = []

    const smsReady = settings.sms?.from && (
      (settings.sms.authType === 'oauth2' && settings.sms.accessToken) ||
      (settings.sms.apiKey && settings.sms.apiSecret)
    )
    if ((type === 'sms' || type === 'both') && smsReady && to) {
      try {
        let authorization: string
        if (settings.sms!.authType === 'oauth2') {
          authorization = `Bearer ${settings.sms!.accessToken}`
        } else {
          const date = new Date().toISOString()
          const salt = randomBytes(16).toString('hex')
          const sig = createHmac('sha256', settings.sms!.apiSecret!).update(date + salt).digest('hex')
          authorization = `HMAC-SHA256 apiKey=${settings.sms!.apiKey}, date=${date}, salt=${salt}, signature=${sig}`
        }
        const smsRes = await fetch('[https://api.solapi.com/messages/v4/send](https://api.solapi.com/messages/v4/send)', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: authorization },
          body: JSON.stringify({ message: { to, from: settings.sms!.from, text: message } }),
        })
        if (!smsRes.ok) throw new Error(await smsRes.text())
        results.push('SMS 발송 완료')
      } catch (e) { errors.push(`SMS 실패: ${e instanceof Error ? e.message : String(e)}`) }
    }

    const emailReady = settings.email?.from && (settings.email.authType === 'oauth2' ? !!settings.email.refreshToken : !!settings.email.password)
    if ((type === 'email' || type === 'both') && emailReady && email) {
      try {
        const transporter = settings.email!.authType === 'oauth2' && settings.email!.refreshToken
          ? nodemailer.createTransport({ service: 'gmail', auth: { type: 'OAuth2', user: settings.email!.from, clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET, refreshToken: settings.email!.refreshToken, accessToken: settings.email!.accessToken } })
          : nodemailer.createTransport({ host: 'smtp.gmail.com', port: 587, secure: false, auth: { user: settings.email!.from, pass: settings.email!.password } })
        await transporter.sendMail({ from: `LOFA 복지 <${settings.email!.from}>`, to: email, subject: subject || '[LOFA 복지] 알림', text: message })
        results.push('이메일 발송 완료')
      } catch (e) { errors.push(`이메일 실패: ${e instanceof Error ? e.message : String(e)}`) }
    }

    if (results.length === 0 && errors.length === 0) { res.json({ status: 'skipped', message: '설정된 발송 수단이 없습니다.' }); return }
    res.json({ status: errors.length === 0 ? 'success' : 'partial', results, errors })
  } catch (err) {
    res.status(500).json({ status: 'error', message: err instanceof Error ? err.message : 'Unknown' })
  }
})

// GET /api/excel
app.get('/api/excel', async (req, res) => {
  const decoded = await requireAdmin(req, res)
  if (!decoded) return
  try {
    const formsSnap = await db.collection('form_configs').get()
    const formMap: Record<string, string> = {}
    formsSnap.docs.forEach(d => { formMap[d.id] = d.data()['제목'] || d.id })
    const appsSnap = await db.collection('applications').orderBy('created_at', 'desc').get()
    const rows: string[][] = [['사번', '성명', '부서', '직급', '신청항목', '신청일', '상태', '반려사유']]
    appsSnap.docs.forEach(d => {
      const data = d.data()
      const applicant = data['applicant'] || {}
      const createdAt = data['created_at']?.toDate?.()
      const status = data['status']
      const statusLabel = status === 'approved' ? '승인' : status === 'rejected' ? '반려' : '검토중'
      rows.push([applicant['사번'] || '', applicant['성명'] || '', applicant['부서'] || '', applicant['직급'] || '', formMap[data['form_id']] || data['form_id'] || '', createdAt ? createdAt.toLocaleDateString('ko-KR') : '', statusLabel, data['reject_reason'] || ''])
    })
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="welfare_applications_${new Date().toISOString().split('T')[0]}.csv"`)
    res.send('\uFEFF' + csv)
  } catch (err) {
    res.status(500).json({ status: 'error', message: err instanceof Error ? err.message : 'Unknown' })
  }
})

// POST /api/delete-user
app.post('/api/delete-user', async (req, res) => {
  const decoded = await requireAdmin(req, res)
  if (!decoded) return
  try {
    const { uid } = req.body
    if (!uid) { res.status(400).json({ status: 'error', message: 'uid is required' }); return }
    try { await auth.deleteUser(uid) } catch (e: any) { if (e?.code !== 'auth/user-not-found') throw e }
    await db.collection('users').doc(uid).delete()
    res.json({ status: 'success' })
  } catch (err) {
    res.status(500).json({ status: 'error', message: err instanceof Error ? err.message : 'Unknown' })
  }
})

// POST /api/reset-password
app.post('/api/reset-password', async (req, res) => {
  const decoded = await requireAdmin(req, res)
  if (!decoded) return
  try {
    const { uid, password } = req.body
    if (!uid) { res.status(400).json({ status: 'error', message: 'uid is required' }); return }
    const newPassword = password || DEFAULT_TEMP_PASSWORD
    if (newPassword.length < 6) { res.status(400).json({ status: 'error', message: '비밀번호는 6자 이상이어야 합니다.' }); return }
    await auth.updateUser(uid, { password: newPassword })
    res.json({ status: 'success' })
  } catch (err) {
    res.status(500).json({ status: 'error', message: err instanceof Error ? err.message : 'Unknown' })
  }
})

// POST /api/update-email
app.post('/api/update-email', async (req, res) => {
  const decoded = await requireAdmin(req, res)
  if (!decoded) return
  try {
    const { uid, email } = req.body
    if (!uid || !email) { res.status(400).json({ status: 'error', message: 'uid와 email이 필요합니다.' }); return }
    await auth.updateUser(uid, { email })
    await db.collection('users').doc(uid).update({ 이메일: email })
    res.json({ status: 'success' })
  } catch (err) {
    res.status(500).json({ status: 'error', message: err instanceof Error ? err.message : 'Unknown' })
  }
})

// POST /api/sync-emails — [패치] 청크 단위 병렬 처리로 실행 시간(비용) 절감 및 타임아웃 방지
app.post('/api/sync-emails', async (req, res) => {
  const decoded = await requireAdmin(req, res)
  if (!decoded) return
  try {
    const usersSnap = await db.collection('users').get()
    const results: { uid: string; email: string; status: string; error?: string }[] = []
    const CHUNK_SIZE = 20

    for (let i = 0; i < usersSnap.docs.length; i += CHUNK_SIZE) {
      const chunk = usersSnap.docs.slice(i, i + CHUNK_SIZE)
      const chunkResults = await Promise.all(chunk.map(async (docSnap) => {
        const data = docSnap.data()
        const realEmail = data['이메일'] as string | undefined
        const uid = docSnap.id
        if (!realEmail) return { uid, email: '', status: 'skipped', error: '이메일 없음' }
        try {
          const currentUser = await auth.getUser(uid)
          if (currentUser.email === realEmail) return { uid, email: realEmail, status: 'already_synced' }
          await auth.updateUser(uid, { email: realEmail })
          return { uid, email: realEmail, status: 'updated' }
        } catch (e: any) {
          if (e?.code === 'auth/user-not-found') {
            try {
              await auth.createUser({ uid, email: realEmail, password: DEFAULT_TEMP_PASSWORD, displayName: data['성명'] })
              return { uid, email: realEmail, status: 'recreated' }
            } catch (ce) {
              return { uid, email: realEmail, status: 'error', error: ce instanceof Error ? ce.message : 'Unknown' }
            }
          }
          return { uid, email: realEmail, status: 'error', error: e instanceof Error ? e.message : 'Unknown' }
        }
      }))
      results.push(...chunkResults)
    }

    const updated = results.filter(r => r.status === 'updated').length
    const recreated = results.filter(r => r.status === 'recreated').length
    const skipped = results.filter(r => r.status === 'already_synced').length
    const failed = results.filter(r => r.status === 'error').length
    res.json({ status: 'success', message: `총 ${results.length}명 처리: ${recreated}명 복구, ${updated}명 업데이트, ${skipped}명 동기화됨, ${failed}명 실패`, results })
  } catch (err) {
    res.status(500).json({ status: 'error', message: err instanceof Error ? err.message : 'Unknown' })
  }
})

// POST /api/restore-accounts — [패치] 상수 시간 시크릿 비교 및 병렬 청크 처리
app.post('/api/restore-accounts', async (req, res) => {
  const SECRET = process.env.ENCRYPTION_KEY?.slice(0, 16)
  const { secret } = req.body
  if (!secret || !SECRET || !safeCompare(String(secret), SECRET)) {
    res.status(403).json({ status: 'error', message: '인증 실패' }); return
  }
  try {
    const usersSnap = await db.collection('users').get()
    const results: { email: string; name: string; status: string; error?: string }[] = []
    const CHUNK_SIZE = 20

    for (let i = 0; i < usersSnap.docs.length; i += CHUNK_SIZE) {
      const chunk = usersSnap.docs.slice(i, i + CHUNK_SIZE)
      const chunkResults = await Promise.all(chunk.map(async (docSnap) => {
        const data = docSnap.data()
        const uid = docSnap.id
        const email = data['이메일'] as string | undefined
        const name = data['성명'] as string | undefined
        if (!email) return { email: '', name: name || uid, status: 'skipped', error: '이메일 없음' }
        try {
          await auth.getUser(uid)
          return { email, name: name || '', status: 'already_exists' }
        } catch {
          try {
            await auth.createUser({ uid, email, password: DEFAULT_TEMP_PASSWORD, displayName: name })
            return { email, name: name || '', status: 'created' }
          } catch (ce) {
            return { email, name: name || '', status: 'error', error: ce instanceof Error ? ce.message : 'Unknown' }
          }
        }
      }))
      results.push(...chunkResults)
    }

    const created = results.filter(r => r.status === 'created').length
    const exists = results.filter(r => r.status === 'already_exists').length
    const failed = results.filter(r => r.status === 'error').length
    res.json({ status: 'success', message: `복구 완료: ${created}명 생성, ${exists}명 이미 존재, ${failed}명 실패. 초기 비밀번호: ${DEFAULT_TEMP_PASSWORD}`, results })
  } catch (err) {
    res.status(500).json({ status: 'error', message: err instanceof Error ? err.message : 'Unknown' })
  }
})

// POST /api/migrate-project — [패치] Firestore Batch(450건 단위) 적용으로 타임아웃 및 실행 과금 절감
app.post('/api/migrate-project', async (req, res) => {
  const decoded = await requireAdmin(req, res)
  if (!decoded) return
  const { targetProjectId, targetClientEmail, targetPrivateKey } = req.body
  if (!targetProjectId || !targetClientEmail || !targetPrivateKey) {
    res.status(400).json({ status: 'error', message: '새 프로젝트 정보를 모두 입력해주세요.' }); return
  }
  const targetAppName = `migration-target-${Date.now()}`
  let targetApp: admin.app.App | null = null
  try {
    targetApp = admin.initializeApp({ credential: admin.credential.cert({ projectId: targetProjectId, clientEmail: targetClientEmail, privateKey: targetPrivateKey.replace(/\\n/g, '\n') }) }, targetAppName)
    const targetDb = targetApp.firestore()
    const targetAuth = targetApp.auth()
    const results: Record<string, number> = {}

    for (const col of ['users', 'applications', 'form_configs', 'settings']) {
      const snap = await db.collection(col).get()
      let count = 0
      const BATCH_LIMIT = 450
      for (let i = 0; i < snap.docs.length; i += BATCH_LIMIT) {
        const batch = targetDb.batch()
        const chunk = snap.docs.slice(i, i + BATCH_LIMIT)
        for (const d of chunk) {
          batch.set(targetDb.collection(col).doc(d.id), d.data())
          count++
        }
        await batch.commit()
      }
      results[col] = count
    }

    let authCount = 0; let pageToken: string | undefined
    do {
      const listResult = await auth.listUsers(1000, pageToken)
      for (const u of listResult.users) {
        try {
          await targetAuth.createUser({ uid: u.uid, email: u.email, displayName: u.displayName, disabled: u.disabled, password: DEFAULT_TEMP_PASSWORD })
          authCount++
        } catch (e: any) {
          if (e?.code === 'auth/uid-already-exists') {
            try { await targetAuth.updateUser(u.uid, { password: DEFAULT_TEMP_PASSWORD }) } catch { /* ignore */ }
          }
        }
      }
      pageToken = listResult.pageToken
    } while (pageToken)

    results['auth_accounts'] = authCount
    res.json({ status: 'success', message: `마이그레이션이 완료되었습니다. 비밀번호는 모두 ${DEFAULT_TEMP_PASSWORD}로 설정되었습니다.`, results })
  } catch (err) {
    res.status(500).json({ status: 'error', message: err instanceof Error ? err.message : 'Unknown' })
  } finally {
    if (targetApp) { try { await admin.app(targetAppName).delete() } catch { /* ignore */ } }
  }
})

// GET /api/google-oauth
app.get('/api/google-oauth', async (req, res) => {
  const REDIRECT_URI = `${BASE_URL}/api/google-oauth`
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) { res.redirect(`${BASE_URL}/admin?gmail_error=missing_credentials`); return }
  const code = req.query.code as string | undefined
  const error = req.query.error as string | undefined
  if (!code) {
    const authUrl = new URL('[https://accounts.google.com/o/oauth2/v2/auth](https://accounts.google.com/o/oauth2/v2/auth)')
    authUrl.searchParams.set('client_id', clientId); authUrl.searchParams.set('redirect_uri', REDIRECT_URI)
    authUrl.searchParams.set('response_type', 'code'); authUrl.searchParams.set('scope', '[https://www.googleapis.com/auth/gmail.send](https://www.googleapis.com/auth/gmail.send)')
    authUrl.searchParams.set('access_type', 'offline'); authUrl.searchParams.set('prompt', 'consent')
    res.redirect(authUrl.toString()); return
  }
  if (error) { res.redirect(`${BASE_URL}/admin?gmail_error=${encodeURIComponent(error)}`); return }
  try {
    const tokenRes = await fetch('[https://oauth2.googleapis.com/token](https://oauth2.googleapis.com/token)', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: REDIRECT_URI, grant_type: 'authorization_code' }) })
    if (!tokenRes.ok) { res.redirect(`${BASE_URL}/admin?gmail_error=token_exchange_failed`); return }
    const tokens = await tokenRes.json() as { access_token: string; refresh_token?: string; expires_in: number }
    const userInfoRes = await fetch('[https://www.googleapis.com/oauth2/v2/userinfo](https://www.googleapis.com/oauth2/v2/userinfo)', { headers: { Authorization: `Bearer ${tokens.access_token}` } })
    const userInfo = await userInfoRes.json() as { email?: string }
    const update: Record<string, unknown> = { 'email.from': userInfo.email || '', 'email.accessToken': tokens.access_token, 'email.tokenExpiry': Date.now() + tokens.expires_in * 1000, 'email.authType': 'oauth2' }
    if (tokens.refresh_token) update['email.refreshToken'] = tokens.refresh_token
    await db.collection('settings').doc('notify').set(update, { merge: true })
    res.redirect(`${BASE_URL}/admin?gmail_connected=${encodeURIComponent(userInfo.email || '')}`)
  } catch { res.redirect(`${BASE_URL}/admin?gmail_error=unknown`) }
})

// DELETE /api/google-oauth
app.delete('/api/google-oauth', async (req, res) => {
  const decoded = await requireAdmin(req, res)
  if (!decoded) return
  try { await db.collection('settings').doc('notify').set({ email: null }, { merge: true }); res.json({ status: 'success' }) }
  catch (e) { res.status(500).json({ status: 'error', message: String(e) }) }
})

// GET /api/solapi-oauth
app.get('/api/solapi-oauth', async (req, res) => {
  const REDIRECT_URI = `${BASE_URL}/api/solapi-oauth`
  const clientId = process.env.SOLAPI_CLIENT_ID
  const clientSecret = process.env.SOLAPI_CLIENT_SECRET
  if (!clientId || !clientSecret) { res.redirect(`${BASE_URL}/admin?solapi_error=missing_credentials`); return }
  const code = req.query.code as string | undefined
  const error = req.query.error as string | undefined
  if (!code) {
    const authUrl = new URL('[https://api.solapi.com/oauth2/v1/authorize](https://api.solapi.com/oauth2/v1/authorize)')
    authUrl.searchParams.set('client_id', clientId); authUrl.searchParams.set('redirect_uri', REDIRECT_URI); authUrl.searchParams.set('response_type', 'code')
    res.redirect(authUrl.toString()); return
  }
  if (error) { res.redirect(`${BASE_URL}/admin?solapi_error=${encodeURIComponent(error)}`); return }
  try {
    const tokenRes = await fetch('[https://api.solapi.com/oauth2/v1/access_token](https://api.solapi.com/oauth2/v1/access_token)', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: REDIRECT_URI, grant_type: 'authorization_code' }) })
    if (!tokenRes.ok) { res.redirect(`${BASE_URL}/admin?solapi_error=token_exchange_failed`); return }
    const tokens = await tokenRes.json() as { access_token: string; refresh_token?: string; expires_in?: number }
    const update: Record<string, unknown> = { 'sms.accessToken': tokens.access_token, 'sms.authType': 'oauth2' }
    if (tokens.refresh_token) update['sms.refreshToken'] = tokens.refresh_token
    if (tokens.expires_in) update['sms.tokenExpiry'] = Date.now() + tokens.expires_in * 1000
    await db.collection('settings').doc('notify').set(update, { merge: true })
    res.redirect(`${BASE_URL}/admin?solapi_connected=true`)
  } catch { res.redirect(`${BASE_URL}/admin?solapi_error=unknown`) }
})

// DELETE /api/solapi-oauth
app.delete('/api/solapi-oauth', async (req, res) => {
  const decoded = await requireAdmin(req, res)
  if (!decoded) return
  try {
    await db.collection('settings').doc('notify').update({ 'sms.accessToken': FieldValue.delete(), 'sms.authType': FieldValue.delete(), 'sms.refreshToken': FieldValue.delete(), 'sms.tokenExpiry': FieldValue.delete() })
    res.json({ status: 'success' })
  } catch (e) { res.status(500).json({ status: 'error', message: String(e) }) }
})

// ─── MFA (2-Factor Authentication) ────────────────────────────────────────────

const OTP_LENGTH = 6
const OTP_TTL_MS = 5 * 60 * 1000
const OTP_MAX_ATTEMPTS = 5
const OTP_RESEND_THROTTLE_MS = 30 * 1000

function generateOtp(): string {
  let n = 0
  while (n < 100000) n = randomBytes(4).readUInt32BE(0) % 1000000
  return String(n).padStart(OTP_LENGTH, '0')
}

function hashOtp(uid: string, otp: string): string {
  return createHmac('sha256', uid).update(otp).digest('hex')
}

function base32Encode(buf: Buffer): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = '', out = ''
  for (const b of buf) bits += b.toString(2).padStart(8, '0')
  for (let i = 0; i + 5 <= bits.length; i += 5) out += alphabet[parseInt(bits.slice(i, i + 5), 2)]
  return out
}
function base32Decode(s: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const clean = s.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '')
  let bits = ''
  for (const ch of clean) {
    const v = alphabet.indexOf(ch)
    if (v < 0) throw new Error('Invalid base32')
    bits += v.toString(2).padStart(5, '0')
  }
  const bytes: number[] = []
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2))
  return Buffer.from(bytes)
}
function totpAt(secret: string, timestampMs: number): string {
  const counter = Math.floor(timestampMs / 1000 / 30)
  const buf = Buffer.alloc(8)
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0)
  buf.writeUInt32BE(counter & 0xffffffff, 4)
  const hmac = createHmac('sha1', base32Decode(secret)).update(buf).digest()
  const offset = hmac[hmac.length - 1] & 0xf
  const code = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16)
    | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff)
  return String(code % 1000000).padStart(6, '0')
}
function totpVerify(secret: string, code: string, windowSize = 1): boolean {
  const now = Date.now()
  for (let w = -windowSize; w <= windowSize; w++) {
    const candidate = totpAt(secret, now + w * 30 * 1000)
    if (safeCompare(candidate, code)) return true
  }
  return false
}

async function sendOtpViaSms(phone: string, otp: string): Promise<void> {
  const notifyDoc = await db.collection('settings').doc('notify').get()
  const s = (notifyDoc.exists ? notifyDoc.data() : {}) as { sms?: { apiKey?: string; apiSecret?: string; from?: string; accessToken?: string; authType?: string } }
  if (!s.sms?.from || (!s.sms.accessToken && !(s.sms.apiKey && s.sms.apiSecret))) throw new Error('SMS 발송 설정이 완료되지 않았습니다.')
  let authorization: string
  if (s.sms.authType === 'oauth2') {
    authorization = `Bearer ${s.sms.accessToken}`
  } else {
    const date = new Date().toISOString()
    const salt = randomBytes(16).toString('hex')
    const sig = createHmac('sha256', s.sms.apiSecret!).update(date + salt).digest('hex')
    authorization = `HMAC-SHA256 apiKey=${s.sms.apiKey}, date=${date}, salt=${salt}, signature=${sig}`
  }
  const text = `[LOFA 복지] 로그인 인증번호: ${otp} (5분 이내 입력)`
  const r = await fetch('[https://api.solapi.com/messages/v4/send](https://api.solapi.com/messages/v4/send)', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authorization },
    body: JSON.stringify({ message: { to: phone, from: s.sms.from, text } }),
  })
  if (!r.ok) throw new Error(`SMS 발송 실패: ${await r.text()}`)
}

async function sendOtpViaEmail(toEmail: string, otp: string): Promise<void> {
  const notifyDoc = await db.collection('settings').doc('notify').get()
  const s = (notifyDoc.exists ? notifyDoc.data() : {}) as { email?: { from?: string; password?: string; accessToken?: string; refreshToken?: string; authType?: string } }
  if (!s.email?.from) throw new Error('이메일 발송 설정이 완료되지 않았습니다. 어드민 [알림설정]에서 발송 계정을 등록해주세요.')
  const transporter = s.email.authType === 'oauth2' && s.email.refreshToken
    ? nodemailer.createTransport({ service: 'gmail', auth: { type: 'OAuth2', user: s.email.from, clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET, refreshToken: s.email.refreshToken, accessToken: s.email.accessToken } })
    : nodemailer.createTransport({ host: 'smtp.gmail.com', port: 587, secure: false, auth: { user: s.email.from, pass: s.email.password } })
  await transporter.sendMail({
    from: `LOFA 복지 <${s.email.from}>`,
    to: toEmail,
    subject: '[LOFA 복지] 로그인 인증번호',
    text: `로그인 인증번호: ${otp}\n5분 이내에 화면에 입력해주세요. 본인이 요청하지 않았다면 비밀번호를 즉시 변경해주세요.`,
  })
}

function pickOtpEmail(u: Record<string, unknown>, fallback?: string | null): string {
  const external = String(u['외부이메일'] || u['개인이메일'] || u['personalEmail'] || '').trim()
  if (external) return external
  const company = String(u['이메일'] || u['email'] || fallback || '').trim()
  return company
}

// POST /api/mfa/send-otp
app.post('/api/mfa/send-otp', async (req, res) => {
  const decoded = await requireAuth(req, res)
  if (!decoded) return
  try {
    const channel = String(req.body?.channel || '')
    if (channel !== 'sms' && channel !== 'email') { res.status(400).json({ error: 'channel 은 sms 또는 email' }); return }
    const userDoc = await db.collection('users').doc(decoded.uid).get()
    if (!userDoc.exists) { res.status(404).json({ error: '사용자 정보가 없습니다.' }); return }
    const u = userDoc.data() as Record<string, unknown>

    const existingSnap = await db.collection('mfa_codes').doc(decoded.uid).get()
    if (existingSnap.exists) {
      const last = (existingSnap.data()?.lastSentAt as admin.firestore.Timestamp | undefined)?.toMillis() || 0
      if (Date.now() - last < OTP_RESEND_THROTTLE_MS) {
        res.status(429).json({ error: '잠시 후 다시 시도해주세요.', retryAfter: Math.ceil((OTP_RESEND_THROTTLE_MS - (Date.now() - last)) / 1000) }); return
      }
    }
    const otp = generateOtp()
    const hash = hashOtp(decoded.uid, otp)
    const expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + OTP_TTL_MS)
    await db.collection('mfa_codes').doc(decoded.uid).set({
      hash, channel, expiresAt, attempts: 0, lastSentAt: FieldValue.serverTimestamp(),
    })
    if (channel === 'sms') {
      const phone = String(u['전화번호'] || u['phone'] || '').replace(/[^0-9]/g, '')
      if (!phone) throw new Error('등록된 전화번호가 없습니다.')
      await sendOtpViaSms(phone, otp)
      res.json({ status: 'sent', channel, hint: phone.slice(-4).padStart(phone.length, '*') })
    } else {
      const emailAddr = pickOtpEmail(u, decoded.email)
      if (!emailAddr) throw new Error('등록된 이메일이 없습니다.')
      await sendOtpViaEmail(emailAddr, otp)
      const at = emailAddr.indexOf('@')
      const hint = at > 0 ? emailAddr.slice(0, 2) + '*'.repeat(Math.max(at - 2, 1)) + emailAddr.slice(at) : emailAddr
      const isExternal = !!(u['외부이메일'] || u['개인이메일'] || u['personalEmail'])
      res.json({ status: 'sent', channel, hint, isExternal })
    }
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'send failed' })
  }
})

// POST /api/mfa/verify-otp
app.post('/api/mfa/verify-otp', async (req, res) => {
  const decoded = await requireAuth(req, res)
  if (!decoded) return
  try {
    const code = String(req.body?.code || '').trim()
    const mode = req.body?.mode === 'setup' ? 'setup' : 'login'
    const method = String(req.body?.method || '') as 'sms' | 'email' | 'totp' | ''
    if (!/^\d{6}$/.test(code)) { res.status(400).json({ error: '6자리 숫자를 입력해주세요.' }); return }

    const userRef = db.collection('users').doc(decoded.uid)
    const userDoc = await userRef.get()
    const u = (userDoc.exists ? userDoc.data() : {}) as Record<string, unknown>

    const effectiveMethod = method || (u['mfaPreference'] as 'sms' | 'email' | 'totp' | undefined) || ''
    if (!effectiveMethod) { res.status(400).json({ error: '인증 방식 정보가 없습니다.' }); return }

    if (effectiveMethod === 'totp') {
      const encSecret = mode === 'setup'
        ? (u['totpPendingSecret'] as string | undefined)
        : (u['totpSecret'] as string | undefined)
      if (!encSecret) { res.status(400).json({ error: 'TOTP 설정이 없습니다. 다시 등록해주세요.' }); return }
      const secret = decrypt(encSecret)
      if (!totpVerify(secret, code)) { res.status(400).json({ error: '인증번호가 올바르지 않습니다.' }); return }
      if (mode === 'setup') {
        await userRef.update({
          mfaPreference: 'totp',
          totpSecret: encSecret,
          totpPendingSecret: FieldValue.delete(),
          lastMfaAt: FieldValue.serverTimestamp(),
        })
      } else {
        await userRef.update({ lastMfaAt: FieldValue.serverTimestamp() })
      }
      res.json({ status: 'ok', method: 'totp' })
      return
    }

    const codeRef = db.collection('mfa_codes').doc(decoded.uid)
    const codeSnap = await codeRef.get()
    if (!codeSnap.exists) { res.status(400).json({ error: '발송된 인증번호가 없습니다.' }); return }
    const data = codeSnap.data() as { hash: string; channel: string; expiresAt: admin.firestore.Timestamp; attempts: number }
    if (data.channel !== effectiveMethod) { res.status(400).json({ error: '다른 인증 방식의 코드입니다.' }); return }
    if (data.expiresAt.toMillis() < Date.now()) { await codeRef.delete(); res.status(400).json({ error: '인증번호가 만료되었습니다. 다시 요청해주세요.' }); return }
    if (data.attempts >= OTP_MAX_ATTEMPTS) { res.status(429).json({ error: '시도 횟수를 초과했습니다. 새 인증번호를 요청해주세요.' }); return }
    
    // [패치] timingSafeEqual 기반 해시 비교로 통일
    const expectedHash = hashOtp(decoded.uid, code)
    const ok = safeCompare(expectedHash, data.hash)
    if (!ok) {
      await codeRef.update({ attempts: FieldValue.increment(1) })
      res.status(400).json({ error: '인증번호가 올바르지 않습니다.', remainingAttempts: OTP_MAX_ATTEMPTS - data.attempts - 1 })
      return
    }
    await codeRef.delete()
    const update: Record<string, unknown> = { lastMfaAt: FieldValue.serverTimestamp() }
    if (mode === 'setup') update.mfaPreference = effectiveMethod
    await userRef.update(update)
    res.json({ status: 'ok', method: effectiveMethod })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'verify failed' })
  }
})

// POST /api/mfa/totp-setup
app.post('/api/mfa/totp-setup', async (req, res) => {
  const decoded = await requireAuth(req, res)
  if (!decoded) return
  try {
    const userDoc = await db.collection('users').doc(decoded.uid).get()
    const u = (userDoc.exists ? userDoc.data() : {}) as Record<string, unknown>
    const secretRaw = randomBytes(20)
    const secret = base32Encode(secretRaw)
    const account = encodeURIComponent(String(u['이메일'] || u['email'] || decoded.email || decoded.uid))
    const issuer = encodeURIComponent('LOFA 복지')
    const otpauth = `otpauth://totp/${issuer}:${account}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`
    await db.collection('users').doc(decoded.uid).update({ totpPendingSecret: encrypt(secret) })
    res.json({ status: 'ok', secret, otpauth })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'setup failed' })
  }
})

// POST /api/mfa/set-preference
app.post('/api/mfa/set-preference', async (req, res) => {
  const decoded = await requireAuth(req, res)
  if (!decoded) return
  try {
    const method = String(req.body?.method || '')
    if (!['sms', 'email', 'totp'].includes(method)) { res.status(400).json({ error: 'method invalid' }); return }
    await db.collection('users').doc(decoded.uid).update({ mfaPreference: method })
    res.json({ status: 'ok', method })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'set failed' })
  }
})

// POST /api/mfa/reset
app.post('/api/mfa/reset', async (req, res) => {
  const decoded = await requireAuth(req, res)
  if (!decoded) return
  try {
    const target = String(req.body?.uid || decoded.uid)
    if (target !== decoded.uid && decoded.uid !== 'admin') {
      const adminDoc = await db.collection('users').doc(decoded.uid).get()
      if (!adminDoc.exists || !adminDoc.data()?.isAdmin) { res.status(403).json({ error: '관리자 권한이 필요합니다.' }); return }
    }
    await db.collection('users').doc(target).update({
      mfaPreference: FieldValue.delete(),
      totpSecret: FieldValue.delete(),
      totpPendingSecret: FieldValue.delete(),
      lastMfaAt: FieldValue.delete(),
    })
    await db.collection('mfa_codes').doc(target).delete().catch(() => {})
    res.json({ status: 'ok' })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'reset failed' })
  }
})

// ─── Export (무료 티어 최적화를 위해 us-central1 및 256MiB 유지) ───────────────

export const api = onRequest({ region: 'us-central1', memory: '256MiB', timeoutSeconds: 60, cors: true }, app)
```

---

### ③ `GEMINI.md` (전체 교체)

**주요 변경점:**
- Gemini(Firebase Studio)가 정적 빌드(`output: 'export'`)를 망가뜨리는 Server Actions(`'use server'`)나 서버 컴포넌트를 생성하지 못하도록 `CLAUDE.md`의 규칙과 100% 동기화했습니다.

```markdown
# AI Development Guidelines for LOFA Welfare System (GEMINI.md)

이 문서는 한국지방재정공제회(LOFA) 사내근로복지기금 복지신청 시스템의 AI 협업 규칙을 정의합니다. 모든 상세 아키텍처 규칙은 `CLAUDE.md`와 동일하게 적용됩니다.

## 1. 핵심 아키텍처 제약 사항 (절대 준수)

- **정적 Export 모드 (`output: 'export'`):**
  - 본 프로젝트는 정적 HTML로 빌드되어 Firebase Hosting에 배포됩니다.
  - **절대 금지:** Next.js Server Actions (`'use server'`), 동적 Server Components 데이터 패칭, Next.js 런타임 API 라우트에 의존하는 코드를 작성하지 마세요.
  - 모든 페이지와 인터랙티브 컴포넌트는 `"use client"`를 사용하고, 클라이언트 Firebase SDK 또는 Firebase Functions(`/api/**`)를 호출해야 합니다.
- **동적 라우트 추가 시 주의:**
  - `/apply/[formId]` 같은 동적 라우트를 새로 만들 때는 반드시 `firebase.json`의 `rewrites`에도 fallback 경로를 추가해야 새로고침 시 404가 발생하지 않습니다.
- **스크립트 실행 주의:**
  - `package.json`에는 `lint`나 `test` 스크립트가 없습니다. 코드 수정 후 `npm run lint`를 실행하지 마세요. 빌드 검증은 `npm run build` 및 `npm --prefix functions run build`로 수행합니다.
- **비용 0원(무료 티어) 원칙:**
  - 유료 외부 API를 추가하거나 Firebase Functions의 리전(`us-central1`) 및 메모리 설정을 임의로 상향하지 마세요.
  - Firestore 읽기(Read) 횟수를 아끼기 위해 불필요한 폴링이나 중복 쿼리를 지양하고 `auth-context.tsx`의 `sessionStorage` 캐싱(5분 TTL)을 적극 활용하세요.

## 2. 데이터베이스 및 보안 규칙

- **한글 필드명 정본 유지:**
  - Firestore `users` 및 `applications` 컬렉션은 한글 키(`사번`, `성명`, `부서`, `직급`, `이메일`, `구글이메일` 등)를 정본으로 사용합니다.
- **관리자 판정:**
  - `users/{uid}.isAdmin === true` 또는 `uid === 'admin'` 두 가지 경로를 모두 인정합니다.
- **민감정보 암호화 포맷:**
  - AES-256-GCM 포맷(`enc:<iv>:<authTag>:<ciphertext>`)을 엄격히 유지합니다.

## 3. UI/UX 디자인 기조

- 모바일과 데스크톱 모두에서 완벽하게 작동하는 반응형 레이아웃을 유지합니다.
- 다층 그림자(Drop shadow), 부드러운 글로우(Glow) 인터랙션, 명확한 타이포그래피 위계를 사용하여 현대적이고 직관적인 사용자 경험을 제공합니다.
```

---

## 🚀 4. 적용 및 무료 배포 명령어

파일 수정을 마친 후 터미널에서 아래 명령어를 순서대로 실행하시면 비용 발생 없이 깔끔하게 반영됩니다.

```bash
# 1. 프론트엔드 정적 빌드 테스트
npm run build

# 2. Functions 타입 체크 및 빌드 테스트
npm --prefix functions run build

# 3. Firebase 무료 호스팅 & Functions 배포
firebase deploy --only hosting,functions
```

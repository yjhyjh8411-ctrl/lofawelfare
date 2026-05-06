/**
 * 금액 입력·표시 유틸
 *  - 입력값에서 숫자만 추출하여 1,000 단위 콤마로 포맷
 *  - 저장 시에는 plain string of digits ('1000000') 그대로 유지하여 기존 데이터 호환
 */

/** 문자열/숫자에서 숫자만 추출 (콤마, 공백, 통화기호 등 제거) */
export function digitsOnly(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  return s.replace(/[^\d]/g, '')
}

/** 숫자/문자열을 1,000 단위 콤마로 포맷한 문자열 반환 */
export function formatMoney(v: unknown): string {
  const d = digitsOnly(v)
  if (!d) return ''
  return Number(d).toLocaleString()
}

/** 입력값(콤마 포함)을 저장용 plain digits 문자열로 정규화 */
export function normalizeMoney(v: unknown): string {
  return digitsOnly(v)
}

/** 표시용: number/string → '1,000,000원'  (값이 비어있으면 '0원') */
export function displayWithUnit(v: unknown): string {
  const d = digitsOnly(v)
  return `${d ? Number(d).toLocaleString() : 0}원`
}

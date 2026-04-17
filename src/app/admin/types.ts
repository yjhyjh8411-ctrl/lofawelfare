export interface Application {
  id: string
  form_id: string
  user_id?: string
  status: string
  created_at: { toDate?: () => Date } | null
  applicant?: { 사번?: string; 성명?: string; 부서?: string; 직급?: string }
  data?: Record<string, unknown>
  reject_reason?: string
  formTitle?: string
}

export interface UserDoc {
  id: string
  사번?: string
  성명?: string
  부서?: string
  직급?: string
  이메일?: string
  전화번호?: string
  입사일?: string
  isAdmin?: boolean
  status?: string
}

export interface RegDoc {
  id: string
  버전명: string
  files: { name: string; url: string }[]
  createdAt: Date
}

export interface FormConfig {
  id: string
  제목: string
  isActive: boolean
  order: number
}

import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const app = initializeApp({
  credential: cert({
    projectId: 'lofawelfare-3ae73',
    clientEmail: 'firebase-adminsdk-fbsvc@lofawelfare-3ae73.iam.gserviceaccount.com',
    privateKey: `-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDuw6dVr3xv/lbj\nBsUxqOoL1Y+tCpuaGLOBXI1DK7uwQ7puSdc8YhGE8Ma+vb7GW/ueCkGOZ7HrDwkG\njhMDMjShUXIZaDohH3gDhA4GKH0cbEy/i9NtDZWoqJTlKghQNuRTQVdB9WbSti8c\nq4gRJ7mYr+1Hfza2TaVSL7A9cgnRBA52KiKmxsuUOAsgb2nzElzZdVx8eJmGRF7s\ng9FKc1rb6eO70Qo0nzSMjHO53ePNexPTiFAON42c2CkTqJetaTk2MDuV8Y6VBwrA\nP5VVhsP67/HpfaHGFB+AATkNdKb4QMkyNxD8cEZZqotiP6oDB3E5qu/tH4Imd7O4\nm7YY6gBhAgMBAAECggEAXBXhp85ys87oO88Upr565e2L6DU7Jgd409+aK9nmHWlB\nsd+Qv50jHJ6wSEhuF5rKRH24IvAjUoEN/hU1h/oJCl6bHulv4e59Hv4DWqSq/BdY\n0ldfR6QBoHbEVk4LvsQs8180BCBdc88IBIqzg8pKbnULkpOhylXP+Q6jbk9ZMd8b\n7PjgXSCBSDvyPv6HspBRFdGvxu/f/Jf6MWz6Yz88NJ435ay1l6/tPg5ewSvRT0aN\nNsgXY7R6J5vhrXnimNdkiQujyULZppGBGRL66VduzDMDISRXN1v7fwujShgEOBeF\n/LjZGI1s3/03/Rsb/I9OqVAwikVQl+3T+a4+eTJasQKBgQD6EkT1gqtbhImsh9/S\nc8WtyVUgcvEBsanPRHAxPg5DrSnA30LrKof3qL6pNgosTFB6aPJx5AwiQBdZAhjR\nSIxROpmCCpG4mMquQNYNTjXr2F5HI7PLoIrEKGq320szh4Yip10ORq3ngcFtjZJU\nPSZZih0fDoazonKGKhL+tiJgMwKBgQD0bMJnIo8TxAgKIzpoIHWGNFtTkZ2P2EAR\nZ5a57wwW8OdOiQ1hEjfsFl4hN4P2bhYYSes/J39DDSABMmGhVnXzCc6VW4CKaifI\nwxu033fQ7XBAOPi0xGUmZt63GdIfYBS61jeTnCEyQ9sZbo25W0wik9B7KQABECEX\nmpWZDCe5GwKBgQC3NlFdijmfWFBBnl7GYlmvBHWgy3V1Z0Pg/eQwv6VVwfV4QFpX\nzxZExVXCxTvYzqSbum3+MTUOluREKvwhwMRE8ujq1HGEzDSaTBhHMUjiHOiduDOO\n+XURWAcv4rOK8jy9AN91iST6Gx+q8vEFVLPXIBBL46mezGKZlxPJl4lB7wKBgQCV\nA9WFcTFPeJz6KT4Li3Z7CmJ/UXCA6PMuaTwgQVfaiKZMYAvzGVtUqNJcZ+8hBz6b\nMj2ktBzHMTJI6IFTDlY8hMcYkb+NI2j74c97dx4iFw/vZ4xhELcmMWMouCo9jKM2\nwTEC4hXvAiWKnLb0wW9qSTm6TGW/QCkcrdb0hs+U7wKBgGhfNnbtKqlZoI2zGEQN\nTXOAmQFHE5XNPocSF2N1bHxvvcOtUCuyENcZcW7teVJxTv8UqhOcJaH2rjkmd3Fs\nXrcf9yzKdkVm2/SO9nV4DCI8Cd7EyrKFPiGPbAWBuR3++EE0hSgiojBTMpwQLpoJ\nN1zxYPqFJaLfLNJKfjuH7BFw\n-----END PRIVATE KEY-----\n`
  })
})

const db = getFirestore(app)

// 기존 폼 전체 삭제 후 재생성
const existing = await db.collection('form_configs').get()
for (const d of existing.docs) {
  await d.ref.delete()
  console.log('삭제:', d.id)
}

const commonAccountFields = [
  { id: 'bank', label: '은행명', type: 'text', required: true, sensitive: false },
  { id: 'account', label: '계좌번호', type: 'text', required: true, sensitive: true },
  { id: 'attachment', label: '증빙서류', type: 'file', required: false, sensitive: false },
]

const forms = [
  // ──── 통합한도 그룹 (주택지원 + 복지연금 + 의료비지원) ────
  {
    id: 'housing-support',
    제목: '주택지원',
    설명: '구입비용 이자 지원',
    한도설명: '기금운용규정',
    icon: '🏠',
    color: '#3b82f6',
    isActive: true,
    order: 1,
    grouped: true,
    fields: [
      { id: 'purpose', label: '신청사유', type: 'textarea', required: true, sensitive: false },
      { id: 'amount', label: '신청금액', type: 'number', required: true, sensitive: false },
      { id: 'address', label: '주택 주소', type: 'text', required: true, sensitive: false },
      ...commonAccountFields,
    ]
  },
  {
    id: 'welfare-pension',
    제목: '복지연금',
    설명: '개인연금 납입금 지원',
    한도설명: '기금운용규정',
    icon: '🏦',
    color: '#6366f1',
    isActive: true,
    order: 2,
    grouped: true,
    fields: [
      { id: 'pension_type', label: '연금 종류', type: 'text', required: true, sensitive: false },
      { id: 'amount', label: '납입금액', type: 'number', required: true, sensitive: false },
      { id: 'insurance_co', label: '보험사명', type: 'text', required: true, sensitive: false },
      ...commonAccountFields,
    ]
  },
  {
    id: 'medical-support',
    제목: '의료비지원',
    설명: '본인 및 가족 의료비',
    한도설명: '기금운용규정',
    icon: '💊',
    color: '#ef4444',
    isActive: true,
    order: 3,
    grouped: true,
    fields: [
      { id: 'patient', label: '환자 (본인/가족)', type: 'select', required: true, sensitive: false, options: ['본인', '배우자', '자녀', '부모'] },
      { id: 'diagnosis', label: '진단명/치료내용', type: 'textarea', required: true, sensitive: false },
      { id: 'hospital', label: '병원명', type: 'text', required: true, sensitive: false },
      { id: 'amount', label: '신청금액', type: 'number', required: true, sensitive: false },
      ...commonAccountFields,
    ]
  },
  // ──── 개별 항목 ────
  {
    id: 'living-welfare',
    제목: '생활복지지원',
    설명: '학원, 수강료 등 복지',
    한도설명: '연 10만원 ~ 최 120만원',
    icon: '🎁',
    color: '#10b981',
    isActive: true,
    order: 4,
    grouped: false,
    fields: [
      { id: 'living_detail', label: '생활복지 사용내역', type: 'living_records', required: true, sensitive: false },
      { id: 'purpose', label: '신청내용 (추가설명)', type: 'textarea', required: false, sensitive: false },
      ...commonAccountFields,
    ]
  },
  {
    id: 'cultural-activity',
    제목: '근로자가족문화활동비',
    설명: '공연, 영화, 전시 등 지원',
    한도설명: '반기 13만원 ~ 연 60만원',
    icon: '🎭',
    color: '#8b5cf6',
    isActive: true,
    order: 5,
    grouped: false,
    fields: [
      { id: 'cultural_detail', label: '문화활동 사용내역', type: 'cultural_records', required: true, sensitive: false },
      { id: 'detail', label: '상세 내용 (추가설명)', type: 'textarea', required: false, sensitive: false },
      ...commonAccountFields,
    ]
  },
  {
    id: 'loan-application',
    제목: '대부신청',
    설명: '주택자금 및 생활안정 대부',
    한도설명: '기금운용규정 및 대부계획',
    icon: '💰',
    color: '#f59e0b',
    isActive: true,
    order: 6,
    grouped: false,
    fields: [
      { id: 'loan_type', label: '대부 종류', type: 'select', required: true, sensitive: false, options: ['주택구입자금', '주택임차자금', '생활안정자금', '의료비', '재해대부', '기타'] },
      { id: 'purpose', label: '대부목적', type: 'textarea', required: true, sensitive: false },
      { id: 'amount', label: '신청금액', type: 'number', required: true, sensitive: false },
      { id: 'period', label: '상환기간 (개월)', type: 'number', required: true, sensitive: false },
      ...commonAccountFields,
    ]
  },
  {
    id: 'condolence-support',
    제목: '경조비지원',
    설명: '결혼, 조의 등 경조사 지원',
    한도설명: '기금운용규정(지급기준)',
    icon: '💕',
    color: '#ec4899',
    isActive: true,
    order: 7,
    grouped: false,
    fields: [
      { id: 'event_type', label: '경조사 구분', type: 'select', required: true, sensitive: false, options: ['본인 결혼', '자녀 결혼', '출산', '부모상', '배우자상', '자녀상', '기타'] },
      { id: 'event_date', label: '경조사 일자', type: 'date', required: true, sensitive: false },
      { id: 'amount', label: '신청금액', type: 'number', required: true, sensitive: false },
      ...commonAccountFields,
    ]
  },
  {
    id: 'vaccination',
    제목: '정기예방접종',
    설명: '독감, 대상포진 등 지원',
    한도설명: '연 15만원',
    icon: '💉',
    color: '#06b6d4',
    isActive: true,
    order: 8,
    grouped: false,
    fields: [
      { id: 'vaccine_type', label: '접종 종류', type: 'select', required: true, sensitive: false, options: ['독감(인플루엔자)', '대상포진', '폐렴구균', '기타'] },
      { id: 'hospital', label: '접종 기관', type: 'text', required: true, sensitive: false },
      { id: 'amount', label: '신청금액', type: 'number', required: true, sensitive: false },
      ...commonAccountFields,
    ]
  },
  {
    id: 'scholarship',
    제목: '장학금지원',
    설명: '자녀 학자금 및 등록금',
    한도설명: '학기당 250만원',
    icon: '🎓',
    color: '#3b82f6',
    isActive: true,
    order: 9,
    grouped: false,
    fields: [
      { id: 'child_name', label: '자녀 성명', type: 'text', required: true, sensitive: false },
      { id: 'school', label: '학교명', type: 'text', required: true, sensitive: false },
      { id: 'grade', label: '학년', type: 'text', required: true, sensitive: false },
      { id: 'semester', label: '학기', type: 'select', required: true, sensitive: false, options: ['1학기', '2학기'] },
      { id: 'amount', label: '신청금액', type: 'number', required: true, sensitive: false },
      { id: 'attachment', label: '재학증명서/납입영수증', type: 'file', required: true, sensitive: false },
      { id: 'bank', label: '은행명', type: 'text', required: true, sensitive: false },
      { id: 'account', label: '계좌번호', type: 'text', required: true, sensitive: true },
    ]
  },
  {
    id: 'multi-children',
    제목: '다자녀가정지원',
    설명: '미취학 자녀 양육비',
    한도설명: '1인 10만 · 2인 50만 · 3인 70만원/년',
    icon: '👨‍👩‍👧‍👦',
    color: '#10b981',
    isActive: true,
    order: 10,
    grouped: false,
    fields: [
      { id: 'children_count', label: '미취학 자녀 수', type: 'select', required: true, sensitive: false, options: ['1명', '2명', '3명 이상'] },
      { id: 'children_info', label: '자녀 성명 및 생년월일', type: 'textarea', required: true, sensitive: false },
      { id: 'amount', label: '신청금액', type: 'number', required: true, sensitive: false },
      { id: 'attachment', label: '가족관계증명서', type: 'file', required: true, sensitive: false },
      { id: 'bank', label: '은행명', type: 'text', required: true, sensitive: false },
      { id: 'account', label: '계좌번호', type: 'text', required: true, sensitive: true },
    ]
  },
  {
    id: 'industry-tour',
    제목: '선진산업시찰',
    설명: '산업시설 견학 지원',
    한도설명: '500만원',
    icon: '✈️',
    color: '#6366f1',
    isActive: true,
    order: 11,
    grouped: false,
    fields: [
      { id: 'destination', label: '시찰 지역/국가', type: 'text', required: true, sensitive: false },
      { id: 'purpose', label: '시찰 목적', type: 'textarea', required: true, sensitive: false },
      { id: 'period', label: '기간', type: 'text', required: true, sensitive: false },
      { id: 'amount', label: '신청금액', type: 'number', required: true, sensitive: false },
      ...commonAccountFields,
    ]
  },
  {
    id: 'maternity-support',
    제목: '모성보호지원',
    설명: '임신 및 난임치료비',
    한도설명: '200만원',
    icon: '🤱',
    color: '#ec4899',
    isActive: true,
    order: 12,
    grouped: false,
    fields: [
      { id: 'support_type', label: '지원 구분', type: 'select', required: true, sensitive: false, options: ['임신 관련 의료비', '난임치료비', '출산 관련 비용', '기타'] },
      { id: 'detail', label: '상세 내용', type: 'textarea', required: true, sensitive: false },
      { id: 'amount', label: '신청금액', type: 'number', required: true, sensitive: false },
      { id: 'attachment', label: '진단서/영수증', type: 'file', required: true, sensitive: false },
      { id: 'bank', label: '은행명', type: 'text', required: true, sensitive: false },
      { id: 'account', label: '계좌번호', type: 'text', required: true, sensitive: true },
    ]
  },
  {
    id: 'consolation-payment',
    제목: '위로금지원',
    설명: '환병 및 장애 위로금',
    한도설명: '1회 150만원 / 장기 50만원',
    icon: '❤️‍🩹',
    color: '#f43f5e',
    isActive: true,
    order: 13,
    grouped: false,
    fields: [
      { id: 'reason', label: '신청 사유', type: 'select', required: true, sensitive: false, options: ['장기입원(7일 이상)', '장애 발생', '재해/재난', '기타'] },
      { id: 'detail', label: '상세 내용', type: 'textarea', required: true, sensitive: false },
      { id: 'amount', label: '신청금액', type: 'number', required: true, sensitive: false },
      { id: 'attachment', label: '진단서/증빙서류', type: 'file', required: true, sensitive: false },
      { id: 'bank', label: '은행명', type: 'text', required: true, sensitive: false },
      { id: 'account', label: '계좌번호', type: 'text', required: true, sensitive: true },
    ]
  },
]

console.log(`총 ${forms.length}개 폼 생성 시작...`)
for (const form of forms) {
  const { id, ...data } = form
  await db.collection('form_configs').doc(id).set(data)
  console.log(`✅ ${data.제목} (${id})`)
}
console.log('\n모든 신청서 폼 생성 완료!')
process.exit(0)

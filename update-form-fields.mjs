import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { readFileSync } from 'fs'

const env = readFileSync('.env.local', 'utf8')
const get = (k) => { const m = env.match(new RegExp(`^${k}=(.+)$`, 'm')); return m ? m[1].trim().replace(/^"|"$/g, '') : '' }

initializeApp({ credential: cert({
  projectId: get('FIREBASE_PROJECT_ID'),
  clientEmail: get('FIREBASE_CLIENT_EMAIL'),
  privateKey: get('FIREBASE_PRIVATE_KEY').replace(/\\n/g, '\n'),
}) })

const db = getFirestore()

const forms = {
  'housing-support': {
    한도설명: null,
    fields: [
      { id: 'supportType', label: '지원구분', type: 'select', section: '신청 내용', required: true, options: ['전세자금', '월세', '주택구입', '기타'] },
      { id: 'amount', label: '신청금액', type: 'amount', section: '신청 내용', required: true },
      { id: 'account', label: '지급 계좌번호', type: 'account', section: '신청 내용', required: true },
      { id: 'attachment', label: '증빙서류 첨부', type: 'file', section: '신청 내용', required: true },
    ]
  },
  'welfare-pension': {
    한도설명: null,
    fields: [
      { id: 'itemName', label: '지원항목명', type: 'text', section: '신청 내용', required: true },
      { id: 'institution', label: '금융기관명', type: 'text', section: '신청 내용', required: true },
      { id: 'selfAmount', label: '본인납입금액', type: 'amount', section: '신청 내용', required: true },
      { id: 'requestAmount', label: '지원신청금액', type: 'amount', section: '신청 내용', required: true },
      { id: 'account', label: '지급 계좌번호', type: 'account', section: '신청 내용', required: true },
      { id: 'attachment', label: '증빙서류 첨부', type: 'file', section: '신청 내용', required: true },
    ]
  },
  'medical-support': {
    한도설명: null,
    fields: [
      { id: 'medical_records', label: '진료 상세내역', type: 'medical_records', section: '진료 상세내역', required: true },
      { id: 'account', label: '지급 계좌번호', type: 'account', section: '계좌 및 첨부', required: true },
      { id: 'attachment', label: '증빙서류 첨부', type: 'file', section: '계좌 및 첨부', required: true, hint: '진단서(요소 소견서), 진료비 영수증 등 의료비 지출을 확인할 수 있는 증빙. 본인 또는 직계존비속 중 장애인이 있는 경우 장애인 의료비는 별도 지원신청서를 작성(장애등급을 확인할 수 있는 서류 첨부)' },
    ]
  },
  'living-welfare': {
    한도설명: '월 10만원 한도 / 연간 120만원 한도',
    fields: [
      { id: 'targetName', label: '대상자 성명', type: 'text', section: '신청 내용', required: true, placeholder: '예: 본인' },
      { id: 'supportItem', label: '지원 항목', type: 'text', section: '신청 내용', required: true, placeholder: '예: 영어학원 수강료, 도서구입비 등' },
      { id: 'amount', label: '신청 금액', type: 'amount', section: '신청 내용', required: true },
      { id: 'account', label: '지급 계좌번호', type: 'account', section: '신청 내용', required: true },
      { id: 'attachment', label: '증빙서류 첨부', type: 'file', section: '신청 내용', required: false, hint: '영수증, 수강 등록확인서 등' },
    ]
  },
  'cultural-activity': {
    한도설명: '반기 30만원 한도 / 연간 60만원 한도',
    fields: [
      { id: 'targetName', label: '대상자 성명 (관계)', type: 'text', section: '신청 내용', required: true, placeholder: '예: 본인 또는 배우자(홍길동)' },
      { id: 'activityContent', label: '문화활동 내용', type: 'text', section: '신청 내용', required: true, placeholder: '예: 뮤지컬 시카고 관람' },
      { id: 'amount', label: '신청 금액', type: 'amount', section: '신청 내용', required: true },
      { id: 'account', label: '지급 계좌번호', type: 'account', section: '신청 내용', required: true },
      { id: 'attachment', label: '증빙서류 첨부', type: 'file', section: '신청 내용', required: false, hint: '영수증, 티켓, 온라인결제내역 등' },
    ]
  },
  'loan-application': {
    한도설명: null,
    fields: [
      { id: 'loanPurpose', label: '대부 용도', type: 'radio', section: '대부 신청 내용', required: true, options: ['주택구입', '주택임차', '생활안정'] },
      { id: 'isHousehold', label: '세대주 여부', type: 'radio', section: '대부 신청 내용', required: true, options: ['세대주', '세대주아님'] },
      { id: 'dependentChildren', label: '무양 자녀수', type: 'number', section: '대부 신청 내용', required: true, placeholder: '0' },
      { id: 'amount', label: '신청 금액', type: 'amount', section: '대부 신청 내용', required: true },
      { id: 'account', label: '지급 계좌번호', type: 'account', section: '대부 신청 내용', required: true },
      { id: 'attachment', label: '증빙서류 첨부', type: 'file', section: '대부 신청 내용', required: false, hint: '대부 용도에 따른 증빙 서류 등' },
      { id: 'loan_agreement', label: '대부 이행 동의', type: 'loan_agreement', section: '대부 이행 동의서', required: true },
    ]
  },
  'condolence-support': {
    한도설명: null,
    fields: [
      { id: 'content', label: '지원 내용', type: 'textarea', section: '경조 상세내역', required: true, placeholder: '예: 본인 결혼에 따른 경조비 지원 신청' },
      { id: 'targetName', label: '대상자 성명', type: 'text', section: '경조 상세내역', required: true, placeholder: '예: 홍길동' },
      { id: 'relationship', label: '신청인과의 관계', type: 'text', section: '경조 상세내역', required: true, placeholder: '예: 본인, 자녀, 부모 등' },
      { id: 'eventType', label: '지원 대상 경조사', type: 'select', section: '경조 상세내역', required: true, options: ['결혼', '출산', '부모상', '배우자부모상', '조부모상', '자녀상', '본인상', '기타'] },
      { id: 'eventDate', label: '경조 발생 일자', type: 'date', section: '경조 상세내역', required: true },
      { id: 'amount', label: '신청 금액', type: 'amount', section: '경조 상세내역', required: true },
      { id: 'account', label: '지급 계좌번호', type: 'account', section: '경조 상세내역', required: true },
      { id: 'attachment', label: '증빙서류', type: 'file', section: '증빙서류 첨부', required: true, hint: '청첩장, 부고장, 사망진단서, 가족관계증명서 등 증빙 가능한 서류를 첨부해 주세요.' },
    ]
  },
  'vaccination': {
    한도설명: '연간 15만원 한도 · 금액이 기재된 보험 영수증(또는 진료비 세부내역서)를 반드시 첨부해 주세요.',
    fields: [
      { id: 'vaccination_records', label: '예방접종 상세내역', type: 'vaccination_records', section: '예방접종 상세내역', required: true },
      { id: 'account', label: '지급 계좌번호', type: 'account', section: '계좌 및 첨부', required: true },
      { id: 'attachment', label: '증빙서류 첨부', type: 'file', section: '계좌 및 첨부', required: true, hint: '접종 영수증 또는 진료비 세부내역서 등 증빙서류를 첨부해 주세요.' },
    ]
  },
  'scholarship': {
    한도설명: null,
    fields: [
      { id: 'scholarship_records', label: '장학금 상세 내역', type: 'scholarship_records', section: '장학금 상세 내역 (자녀/본인)', required: true },
      { id: 'account', label: '지급 계좌번호', type: 'account', section: '계좌 및 첨부', required: true },
      { id: 'attachment', label: '증빙서류 첨부', type: 'file', section: '계좌 및 첨부', required: true, hint: '재학증명서 및 등록금 납부영수증을 첨부해 주세요. (파일이 여러 개인 경우 하나의 PDF로 묶어서 제출)' },
    ]
  },
  'multi-children': {
    한도설명: null,
    fields: [
      { id: 'children_records', label: '지원 대상 자녀 정보', type: 'children_records', section: '지원 대상 자녀 정보', required: true },
      { id: 'amount', label: '신청 금액', type: 'amount', section: '지원금 선정 정보', required: true },
      { id: 'account', label: '지급 계좌번호', type: 'account', section: '지원금 선정 정보', required: true },
      { id: 'attachment', label: '증빙서류 첨부', type: 'file', section: '지원금 선정 정보', required: false, hint: '가족관계증명서 또는 기타관련증명서' },
    ]
  },
  'industry-tour': {
    한도설명: null,
    fields: [
      { id: 'destination', label: '시찰 장소 (국가/도시)', type: 'text', section: '시찰 상세내역', required: true, placeholder: '예: 독일 뮌헨' },
      { id: 'purpose', label: '시찰 일정 및 목적', type: 'textarea', section: '시찰 상세내역', required: true, placeholder: '시찰 일정, 방문 기관, 목적 등을 상세히 기재해 주세요' },
      { id: 'amount', label: '신청 금액', type: 'amount', section: '시찰 상세내역', required: true },
      { id: 'account', label: '지급 계좌번호', type: 'account', section: '시찰 상세내역', required: true },
      { id: 'attachment', label: '증빙서류 첨부', type: 'file', section: '시찰 상세내역', required: false, hint: '시찰계획서, 항공권 등 증빙서류 첨부' },
    ]
  },
  'maternity-support': {
    한도설명: '가족문화생활비 및 태아도수 각종 모성보호로 지원 항목입니다.',
    fields: [
      { id: 'supportType', label: '지원 구분', type: 'select', section: '지원 신청 내용', required: true, options: ['가족문화생활비', '태아도수', '산전검사', '출산용품', '기타'] },
      { id: 'amount', label: '신청 금액', type: 'amount', section: '지원 신청 내용', required: true },
      { id: 'account', label: '지급 계좌번호', type: 'account', section: '지원 신청 내용', required: true },
      { id: 'attachment', label: '증빙서류 첨부', type: 'file', section: '지원 신청 내용', required: false, hint: '진통분만실 사용확인서, 산전검사확인서, 판매증빙 등' },
    ]
  },
  'consolation-payment': {
    한도설명: '금증 증빙서류(성명, 사고일, 화재일 등) 및 구급대에 따른 첨부서식을 첨부해 주세요.',
    fields: [
      { id: 'supportType', label: '지원 구분', type: 'select', section: '위로금 상세내용', required: true, options: ['질병', '사고', '재해', '기타'] },
      { id: 'reason', label: '위로금 사유', type: 'textarea', section: '위로금 상세내용', required: true, placeholder: '구체적인 사유를 기재해 주세요' },
      { id: 'amount', label: '신청 금액', type: 'amount', section: '위로금 상세내용', required: true },
      { id: 'account', label: '지급 계좌번호', type: 'account', section: '위로금 상세내용', required: true },
      { id: 'attachment', label: '증빙서류 첨부', type: 'file', section: '위로금 상세내용', required: false, hint: '진단서, 사고증명서, 재해증명서 등' },
    ]
  },
}

async function run() {
  let updated = 0
  for (const [id, data] of Object.entries(forms)) {
    const update = { fields: data.fields }
    if (data.한도설명 !== null) update.한도설명 = data.한도설명
    await db.collection('form_configs').doc(id).update(update)
    console.log(`✓ Updated ${id}`)
    updated++
  }
  console.log(`\nDone: ${updated} forms updated`)
}

run().catch(console.error)

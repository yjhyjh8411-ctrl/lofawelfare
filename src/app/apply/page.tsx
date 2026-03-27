'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { handleSubmit } from '@/app/actions'
import Link from 'next/link'

const initialState = {
  message: '',
}

function SubmitButton() {
  const { pending } = useFormStatus()

  return (
    <button 
      type="submit" 
      aria-disabled={pending}
      className="w-full px-6 py-3 text-lg font-semibold text-white bg-indigo-600 rounded-lg shadow-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all duration-300 disabled:bg-gray-400 disabled:cursor-not-allowed"
    >
      {pending ? '처리 중...' : '제출하기'}
    </button>
  )
}

export default function ApplyPage() {
  const [state, formAction] = useFormState(handleSubmit, initialState)

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
       <div className="w-full max-w-2xl mx-auto bg-white rounded-2xl shadow-xl p-8 md:p-12">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-gray-800">복지혜택 신청</h1>
          <p className="mt-2 text-gray-500">필요한 정보를 입력하고 신청서를 제출해주세요.</p>
        </div>

        {state?.message ? (
          <div className="text-center p-6 bg-green-100 text-green-800 rounded-lg mb-6">
            <p className="font-semibold text-lg">{state.message}</p>
            <Link href="/dashboard" className="mt-4 inline-block text-indigo-600 hover:text-indigo-800 font-semibold">
              대시보드로 돌아가기
            </Link>
          </div>
        ) : (
          <form action={formAction} className="space-y-6">
            <div>
              <label htmlFor="applicantName" className="block text-sm font-medium text-gray-700 mb-1">신청자 이름</label>
              <input
                type="text"
                id="applicantName"
                name="applicantName"
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div>
              <label htmlFor="employeeId" className="block text-sm font-medium text-gray-700 mb-1">사원번호</label>
              <input
                type="text"
                id="employeeId"
                name="employeeId"
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div>
              <label htmlFor="benefitType" className="block text-sm font-medium text-gray-700 mb-1">복지혜택 종류</label>
              <select
                id="benefitType"
                name="benefitType"
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="">선택하세요...</option>
                <option value="의료비 지원">의료비 지원</option>
                <option value="자녀 학자금 지원">자녀 학자금 지원</option>
                <option value="주택자금 대출이자 지원">주택자금 대출이자 지원</option>
                <option value="경조사비 지원">경조사비 지원</option>
                <option value="자기계발비 지원">자기계발비 지원</option>
              </select>
            </div>

            <div>
              <label htmlFor="amount" className="block text-sm font-medium text-gray-700 mb-1">신청 금액</label>
              <input
                type="number"
                id="amount"
                name="amount"
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="숫자만 입력하세요"
              />
            </div>

            <div>
              <label htmlFor="reason" className="block text-sm font-medium text-gray-700 mb-1">신청 사유</label>
              <textarea
                id="reason"
                name="reason"
                rows={4}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
              ></textarea>
            </div>

            <SubmitButton />
          </form>
        )}

        {!state?.message && (
            <div className="mt-6 text-center">
                <Link href="/dashboard" className="text-sm text-gray-600 hover:text-indigo-500">
                    취소하고 대시보드로 돌아가기
                </Link>
            </div>
        )}
      </div>
    </div>
  )
}

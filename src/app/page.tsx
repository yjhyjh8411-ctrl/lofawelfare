'use client'

import { useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const { login } = useAuth()
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await login(email, password)
      router.push('/dashboard')
    } catch (err) {
      setError('이메일 또는 비밀번호가 잘못되었습니다.')
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="w-full max-w-md p-8 space-y-8 bg-white rounded-xl shadow-lg">
        <div data-antigravity-body className="text-center">
          <h1 className="text-4xl font-bold text-gray-800">LOFA</h1>
          <p className="mt-2 text-lg text-gray-600">복지 신청 시스템</p>
        </div>

        <form data-antigravity-body onSubmit={handleSubmit} className="space-y-6">
          <div className="relative">
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 text-gray-800 bg-gray-100 border-2 border-transparent rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition duration-300"
              placeholder="이메일 주소"
            />
          </div>

          <div className="relative">
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 text-gray-800 bg-gray-100 border-2 border-transparent rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition duration-300"
              placeholder="비밀번호"
            />
          </div>

          {error && <p data-antigravity-body className="text-sm text-red-500 text-center">{error}</p>}

          <div>
            <button
              data-antigravity-body
              type="submit"
              className="w-full px-4 py-3 font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition duration-300 shadow-md"
            >
              로그인
            </button>
          </div>
        </form>

        <p data-antigravity-body className="text-xs text-center text-gray-400">
          © 2024 한국지방재정공제회. All Rights Reserved.
        </p>
      </div>
    </div>
  )
}

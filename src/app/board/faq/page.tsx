'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { collection, getDocs, query, orderBy } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/lib/auth-context'
import Navbar from '@/components/Navbar'

interface FAQ {
  id: string
  question: string
  answer: string
  order: number
  category?: string
}

export default function FAQPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [faqs, setFaqs] = useState<FAQ[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [dataLoading, setDataLoading] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState<string>('전체')

  useEffect(() => {
    if (!loading && !user) router.replace('/login')
  }, [user, loading, router])

  useEffect(() => {
    if (!user) return
    const load = async () => {
      try {
        const snap = await getDocs(query(collection(db, 'faqs'), orderBy('order', 'asc')))
        setFaqs(snap.docs.map(d => ({ id: d.id, ...d.data() } as FAQ)))
      } catch { /* collection may not exist yet */ }
      finally { setDataLoading(false) }
    }
    load()
  }, [user])

  if (loading) return <div style={loadingStyle}>로딩 중...</div>
  if (!user) return null

  const categories = ['전체', ...Array.from(new Set(faqs.map(f => f.category).filter(Boolean) as string[]))]
  const filtered = selectedCategory === '전체' ? faqs : faqs.filter(f => f.category === selectedCategory)

  return (
    <div style={{ minHeight: '100vh', background: '#f8f9fa', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <Navbar />
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 20px 60px' }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#111827', marginBottom: 6 }}>자주하는 질문</h1>
        <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 28 }}>복지기금 신청과 관련된 자주 묻는 질문을 확인하세요.</p>

        {/* Category filter */}
        {categories.length > 1 && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                style={{
                  padding: '6px 16px',
                  borderRadius: 20,
                  border: '1px solid',
                  borderColor: selectedCategory === cat ? '#1a56db' : '#e5e7eb',
                  background: selectedCategory === cat ? '#1a56db' : '#fff',
                  color: selectedCategory === cat ? '#fff' : '#374151',
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {dataLoading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>로딩 중...</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af', background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb' }}>
            등록된 FAQ가 없습니다.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map(faq => {
              const isOpen = expandedId === faq.id
              return (
                <div key={faq.id} style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                  <button
                    onClick={() => setExpandedId(isOpen ? null : faq.id)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '18px 24px',
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      fontSize: 15,
                    }}
                  >
                    <span style={{ color: '#1a56db', fontWeight: 800, fontSize: 16, flexShrink: 0 }}>Q</span>
                    <span style={{ fontWeight: 600, color: '#111827', flex: 1 }}>{faq.question}</span>
                    {faq.category && (
                      <span style={{ background: '#f3f4f6', color: '#6b7280', padding: '2px 10px', borderRadius: 12, fontSize: 12, flexShrink: 0 }}>
                        {faq.category}
                      </span>
                    )}
                    <span style={{
                      fontSize: 12,
                      color: '#9ca3af',
                      transition: 'transform 0.2s',
                      transform: isOpen ? 'rotate(180deg)' : 'rotate(0)',
                      flexShrink: 0,
                    }}>▼</span>
                  </button>
                  {isOpen && (
                    <div style={{ padding: '0 24px 20px 52px', borderTop: '1px solid #f3f4f6' }}>
                      <div style={{ display: 'flex', gap: 12, paddingTop: 16 }}>
                        <span style={{ color: '#f59e0b', fontWeight: 800, fontSize: 16, flexShrink: 0 }}>A</span>
                        <div style={{ fontSize: 14, color: '#374151', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
                          {faq.answer}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

const loadingStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontSize: 14, color: '#9ca3af', background: '#f8f9fa' }

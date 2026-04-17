import { Suspense } from 'react'
import ApplyPage from './PageClient'

export function generateStaticParams() {
  return [{ formId: '_' }]
}

export default function Page() {
  return (
    <Suspense>
      <ApplyPage />
    </Suspense>
  )
}

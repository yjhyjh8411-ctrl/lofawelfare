import { Suspense } from 'react'
import FormEditPage from './PageClient'

export function generateStaticParams() {
  return [{ formId: '_' }]
}

export default function Page() {
  return <Suspense><FormEditPage /></Suspense>
}

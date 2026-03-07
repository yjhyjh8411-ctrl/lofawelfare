import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const db = getAdminDb()

    // Load form configs
    const formsSnap = await db.collection('form_configs').get()
    const formMap: Record<string, string> = {}
    formsSnap.docs.forEach(d => { formMap[d.id] = d.data()['제목'] || d.id })

    // Load all applications
    const appsSnap = await db.collection('applications').orderBy('created_at', 'desc').get()

    // Build CSV rows
    const rows: string[][] = [
      ['사번', '성명', '부서', '직급', '신청항목', '신청일', '상태', '반려사유'],
    ]

    appsSnap.docs.forEach(d => {
      const data = d.data()
      const applicant = data['applicant'] || {}
      const createdAt = data['created_at']?.toDate?.()
      const status = data['status']
      const statusLabel = status === 'approved' ? '승인' : status === 'rejected' ? '반려' : '검토중'
      rows.push([
        applicant['사번'] || '',
        applicant['성명'] || '',
        applicant['부서'] || '',
        applicant['직급'] || '',
        formMap[data['form_id']] || data['form_id'] || '',
        createdAt ? createdAt.toLocaleDateString('ko-KR') : '',
        statusLabel,
        data['reject_reason'] || '',
      ])
    })

    // Generate CSV
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const bom = '\uFEFF'

    return new NextResponse(bom + csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="welfare_applications_${new Date().toISOString().split('T')[0]}.csv"`,
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ status: 'error', message }, { status: 500 })
  }
}

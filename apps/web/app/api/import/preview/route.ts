import Papa from 'papaparse'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { autoDetectMappings } from '@/lib/import/fields'

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 // 10MB
const PREVIEW_ROWS = 5

export async function POST(request: NextRequest) {
  // Verify the requester is an authenticated staff member
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const formData = await request.formData()
  const file = formData.get('file')
  const campId = formData.get('camp_id')

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }
  if (typeof campId !== 'string') {
    return NextResponse.json({ error: 'camp_id is required' }, { status: 400 })
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json({ error: 'File exceeds 10MB limit' }, { status: 400 })
  }

  // Verify the user has an admin role at this camp
  const { data: role } = await supabase
    .from('staff_camp_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('camp_id', campId)
    .in('role', ['super_admin', 'admin', 'staff_admin'])
    .single()

  if (!role) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const text = await file.text()

  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    preview: PREVIEW_ROWS + 1, // +1 so we can show the row count is larger
  })

  if (result.errors.length > 0) {
    const fatal = result.errors.find((e) => e.type === 'Delimiter')
    if (fatal) {
      return NextResponse.json(
        { error: 'Could not parse CSV. Make sure the file is a valid CSV.' },
        { status: 400 }
      )
    }
  }

  const headers = result.meta.fields ?? []
  if (headers.length === 0) {
    return NextResponse.json({ error: 'CSV has no column headers' }, { status: 400 })
  }

  // Count total rows without loading everything into memory
  const totalRows = (text.match(/\n/g) ?? []).length // approximate

  return NextResponse.json({
    headers,
    previewRows: result.data.slice(0, PREVIEW_ROWS),
    totalRows: Math.max(totalRows - 1, result.data.length), // subtract header row
    suggestedMappings: autoDetectMappings(headers),
  })
}

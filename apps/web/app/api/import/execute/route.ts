import Papa from 'papaparse'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { REQUIRED_FIELDS, type ImportFieldKey } from '@/lib/import/fields'

type FieldMapping = Partial<Record<ImportFieldKey, string>>

interface ImportRequest {
  campId: string
  programId: string
  csv: string
  mapping: FieldMapping
}

interface ImportResult {
  householdsCreated: number
  campersCreated: number
  enrollmentsCreated: number
  contactsImported: number
  skipped: number
  errors: string[]
}

/** Normalize an email for consistent comparison */
function normalizeEmail(email: string): string {
  return email.toLowerCase().trim()
}

/** Loosely parse a date string into ISO format (YYYY-MM-DD). Returns null if unparseable. */
function parseDate(value: string): string | null {
  if (!value?.trim()) return null
  const d = new Date(value.trim())
  if (isNaN(d.getTime())) return null
  return d.toISOString().split('T')[0]
}

/** Extract a mapped value from a CSV row, trimmed. */
function get(row: Record<string, string>, mapping: FieldMapping, field: ImportFieldKey): string {
  const col = mapping[field]
  return col ? (row[col] ?? '').trim() : ''
}

export async function POST(request: NextRequest) {
  // 1. Auth — must be an authenticated user
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body: ImportRequest = await request.json()
  const { campId, programId, csv, mapping } = body

  if (!campId || !programId || !csv || !mapping) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // 2. Authz — must be admin at this camp
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

  // 3. Validate required field mappings are present
  const missingFields = REQUIRED_FIELDS.filter((f) => !mapping[f])
  if (missingFields.length > 0) {
    return NextResponse.json(
      { error: `Missing required field mappings: ${missingFields.join(', ')}` },
      { status: 400 }
    )
  }

  // 4. Parse CSV — full file this time
  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
  })

  if (parsed.data.length === 0) {
    return NextResponse.json({ error: 'CSV contains no data rows' }, { status: 400 })
  }

  // 5. Use service client for writes — we've verified authorization above
  const service = createServiceClient()

  const result: ImportResult = {
    householdsCreated: 0,
    campersCreated: 0,
    enrollmentsCreated: 0,
    contactsImported: 0,
    skipped: 0,
    errors: [],
  }

  // Track households by account_id (preferred) or guardian email (fallback)
  // so siblings get grouped into the same household
  const householdCache = new Map<string, string>() // groupKey → household.id

  for (let i = 0; i < parsed.data.length; i++) {
    const row = parsed.data[i]
    const rowNum = i + 2 // 1-indexed + header row

    const camperFirst = get(row, mapping, 'camper_first_name')
    const camperLast = get(row, mapping, 'camper_last_name')
    const guardianEmail = normalizeEmail(get(row, mapping, 'guardian_email'))

    // Skip rows missing required fields
    if (!camperFirst || !camperLast || !guardianEmail) {
      result.skipped++
      result.errors.push(
        `Row ${rowNum}: skipped — missing ${[
          !camperFirst && 'camper first name',
          !camperLast && 'camper last name',
          !guardianEmail && 'guardian email',
        ]
          .filter(Boolean)
          .join(', ')}`
      )
      continue
    }

    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guardianEmail)) {
      result.skipped++
      result.errors.push(`Row ${rowNum}: skipped — invalid email "${guardianEmail}"`)
      continue
    }

    try {
      // ── Household grouping ────────────────────────────────────────────────
      const accountId = get(row, mapping, 'account_id')
      const groupKey = accountId || guardianEmail

      const cachedId = householdCache.get(groupKey)
      let resolvedHouseholdId: string

      if (cachedId) {
        resolvedHouseholdId = cachedId
      } else {
        // Check if a household already exists for this guardian email at this camp
        const { data: existingContact } = await service
          .from('imported_contacts')
          .select('household_id')
          .eq('camp_id', campId)
          .eq('email', guardianEmail)
          .not('household_id', 'is', null)
          .maybeSingle()

        if (existingContact?.household_id) {
          resolvedHouseholdId = existingContact.household_id as string
        } else {
          // Create a new household named after the camper's family
          const guardianLast = get(row, mapping, 'guardian_last_name') || camperLast
          const { data: household, error: householdErr } = await service
            .from('households')
            .insert({ camp_id: campId, name: `${guardianLast} Family` })
            .select('id')
            .single()

          if (householdErr || !household) {
            result.errors.push(`Row ${rowNum}: failed to create household — ${householdErr?.message}`)
            result.skipped++
            continue
          }

          resolvedHouseholdId = household.id
          result.householdsCreated++
        }

        householdCache.set(groupKey, resolvedHouseholdId)
      }

      // ── Camper ────────────────────────────────────────────────────────────
      const dobRaw = get(row, mapping, 'camper_date_of_birth')
      const dob = parseDate(dobRaw)

      if (dobRaw && !dob) {
        result.errors.push(`Row ${rowNum}: unrecognized date format "${dobRaw}" — date of birth left blank`)
      }

      const { data: camper, error: camperErr } = await service
        .from('campers')
        .insert({
          camp_id: campId,
          household_id: resolvedHouseholdId,
          first_name: camperFirst,
          last_name: camperLast,
          date_of_birth: dob ?? '2000-01-01', // placeholder if not provided
        })
        .select('id')
        .single()

      if (camperErr || !camper) {
        result.errors.push(`Row ${rowNum}: failed to create camper — ${camperErr?.message}`)
        result.skipped++
        continue
      }

      result.campersCreated++

      // ── Enrollment ────────────────────────────────────────────────────────
      const { error: enrollErr } = await service
        .from('enrollments')
        .insert({
          camper_id: camper.id,
          program_id: programId,
          status: 'pending', // activated by trigger when parent registers
        })
        .select('id')
        .single()

      if (enrollErr) {
        result.errors.push(`Row ${rowNum}: failed to create enrollment — ${enrollErr.message}`)
      } else {
        result.enrollmentsCreated++
      }

      // ── Imported contacts (guardian 1) ────────────────────────────────────
      const guardian1 = {
        camp_id: campId,
        program_id: programId,
        household_id: resolvedHouseholdId,
        email: guardianEmail,
        first_name: get(row, mapping, 'guardian_first_name') || 'Unknown',
        last_name: get(row, mapping, 'guardian_last_name') || camperLast,
        role: 'guardian' as const,
        imported_by_user_id: user.id,
      }

      const { error: g1Err } = await service
        .from('imported_contacts')
        .upsert(guardian1, { onConflict: 'camp_id,program_id,email', ignoreDuplicates: true })

      if (!g1Err) result.contactsImported++

      // ── Imported contacts (guardian 2, if provided) ───────────────────────
      const guardian2Email = normalizeEmail(get(row, mapping, 'guardian_2_email'))
      if (guardian2Email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guardian2Email)) {
        const guardian2 = {
          camp_id: campId,
          program_id: programId,
          household_id: resolvedHouseholdId,
          email: guardian2Email,
          first_name: get(row, mapping, 'guardian_2_first_name') || 'Unknown',
          last_name: get(row, mapping, 'guardian_2_last_name') || camperLast,
          role: 'guardian' as const,
          imported_by_user_id: user.id,
        }

        const { error: g2Err } = await service
          .from('imported_contacts')
          .upsert(guardian2, { onConflict: 'camp_id,program_id,email', ignoreDuplicates: true })

        if (!g2Err) result.contactsImported++
      }
    } catch (err) {
      result.errors.push(`Row ${rowNum}: unexpected error — ${err instanceof Error ? err.message : String(err)}`)
      result.skipped++
    }
  }

  return NextResponse.json(result)
}

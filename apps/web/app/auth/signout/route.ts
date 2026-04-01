import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  await supabase.auth.signOut()

  const origin =
    process.env.APP_URL ??
    (request.headers.get('x-forwarded-proto') && request.headers.get('x-forwarded-host')
      ? `${request.headers.get('x-forwarded-proto')}://${request.headers.get('x-forwarded-host')}`
      : new URL(request.url).origin)

  return NextResponse.redirect(`${origin.replace(/\/$/, '')}/login`, { status: 302 })
}

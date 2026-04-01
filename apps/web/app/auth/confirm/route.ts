import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const next = searchParams.get('next') ?? '/dashboard'

  // Use APP_URL env var so Railway's internal proxy doesn't affect the redirect.
  // Falls back to the forwarded host header, then the request origin.
  const host =
    process.env.APP_URL ??
    (request.headers.get('x-forwarded-proto') && request.headers.get('x-forwarded-host')
      ? `${request.headers.get('x-forwarded-proto')}://${request.headers.get('x-forwarded-host')}`
      : new URL(request.url).origin)
  const origin = host.replace(/\/$/, '')

  // PKCE flow (default with new Supabase publishable keys)
  const code = searchParams.get('code')
  // Legacy OTP flow (token_hash + type)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null

  if (!code && (!token_hash || !type)) {
    return NextResponse.redirect(`${origin}/login?error=missing_token`)
  }

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : await supabase.auth.verifyOtp({ type: type!, token_hash: token_hash! })

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=invalid_token`)
  }

  return NextResponse.redirect(`${origin}${next}`)
}

# Kamper — Claude Code Context

## Project Overview

Kamper is a mobile-first (iOS/Android) + web app for summer camps to share activities and media with parents/guardians of campers. Modeled loosely on Procare Solutions and Remind but camp-specific.

**Pilot:** One camp, summer 2026. Multi-tenant from day one — architecture must support many camps.

**Core features:**
- Activity/media feed (global camp-wide and per-camper/tagged)
- Direct messaging (staff ↔ parent/guardian, not camper)
- Check-in/check-out with passcode or signature + pickup person w/ photo ID verification
- Recurring daily activity logging (meals, meds, swimming, etc.)
- Medical/health logging (nurse visits, medication distribution)
- Summary email on checkout
- QR code + invite link registration flow for parents
- Push, email, SMS notification preferences per parent
- CSV roster import from any camp management software
- Multiple parents/guardians per household; parents can be linked to multiple camps

**Roles:** Super admin, Admin, Staff admin, Staff, Health

## Stack

| | |
|---|---|
| Web app | Next.js 16 (app router) → Railway |
| Mobile | React Native + Expo (not yet built) |
| Database / Auth / Realtime | Supabase (PostgreSQL + RLS) |
| Shared types | `@kamper/shared` (packages/shared) |
| Package manager | pnpm workspaces + Turborepo |
| Language | TypeScript |

**Production:** https://happykamper.app
**Supabase project:** https://nfhvgaiqmktbbwhzqnzp.supabase.co

## Code Quality — Non-Negotiables

- **Maintainability, security, scalability above all. No hacks or shortcuts.**
- This app handles sensitive data (children, health records, check-in/out). Correctness matters more than speed.
- Always read Next.js 16 docs in `node_modules/next/dist/docs/` — do not rely on pre-v16 patterns
- Never bypass RLS or use the service role key client-side
- Never use `any` types — model data correctly in `@kamper/shared`
- Prefer explicit, readable code over clever one-liners
- If the right approach requires more setup, do the setup
- Flag existing code that cuts corners rather than leaving it silently

## Architecture Notes

- **Multi-tenancy:** Every table is scoped to `camp_id`. Supabase RLS enforces camp isolation at the DB level.
- **Parent permissions:** `household_members` table has per-member permission flags (can_view_media, can_view_health_logs, etc.). Admin-controlled, not visible to parents.
- **Enrollment status:** `enrollments.status` (active/pending/rejected) gates parent feed access. Imported contacts auto-activate on signup via DB trigger.
- **Invite flow:** Program-scoped invite links with expiry. Walk-ins go to pending status for staff approval.
- **Service role:** Only used server-side in Route Handlers for authorized admin operations (e.g. CSV import). Never client-side.
- **Auth:** Passwordless magic link (PKCE flow). `proxy.ts` guards `/dashboard/*`. Confirm route handles both PKCE `code` and legacy `token_hash`.

## Developer Profile

- Kevin is familiar with JavaScript/TypeScript
- New to Supabase but comfortable learning
- Prefers Railway for hosting
- No hard timeline pressure
- Values best technical approach over familiarity

## Feature Backlog

- **Super admin setup flow** — `/setup` route to bootstrap first camp + admin without manual Supabase edits
- **Camp + program management UI** — create/edit camps, programs, generate invite QR codes
- **Parent registration flow** — QR code → account creation → household linking via invite token
- **Activity feed** — staff post photos/video/daily logs, parents view filtered feed
- **Messaging** — staff ↔ household real-time direct messaging
- **Check-in / check-out** — passcode or signature, pickup person with ID verification
- **Mobile app** — Expo shell exists, nothing built yet
- **Push / email / SMS notifications** — per-parent preferences per event type
- **Pending enrollment approval UI** — staff approve walk-in registrations

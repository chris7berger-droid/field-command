# Row Level Security (RLS) — Critical Rules

This project uses Supabase RLS to control database access. Get this wrong
and customer data leaks. Read carefully.

## Field-command-specific context

This repo accesses the shared Supabase database through THREE paths:
  1. PowerSync — downloads data into local SQLite via sync rules
  2. Direct Supabase queries — for non-synced reads/writes
  3. Edge functions — service-role calls that bypass RLS

PowerSync sync rules are NOT a substitute for RLS. The underlying Postgres
RLS still controls what PowerSync's backend can read. If RLS is wrong,
PowerSync will silently sync the wrong rows to the wrong devices.

When changing RLS that affects synced tables, also review:
  - PowerSync sync rules in the PowerSync dashboard
  - Any local-only filters in src/ that depended on old RLS behavior

## The anti-pattern that caused incident 2026-04-26 (sales-command)

Policies that grant anon access based only on a column being non-null:

    FOR SELECT TO anon
    USING (signing_token IS NOT NULL)

This is INSECURE. The publishable anon key ships in the app bundle.
Anyone holding it can call PostgREST directly without the WHERE clause
the React Native app adds, and read every row where the column is non-null.

NEVER write a policy in this shape. Client-side filtering does NOT count
as enforcement.

## The correct pattern for token-gated public access

If field-command ever exposes public-facing pages (e.g., a customer-
facing job tracker), pass the token via a custom request header and
match it inside the policy:

    FOR SELECT TO anon
    USING (
      <token_column> IS NOT NULL
      AND <token_column>::text = public.request_<name>_token()
    )

Helper functions live in the shared database. They read the relevant
header from current_setting('request.headers'). The pattern is
established in sales-command — see sales-command/src/lib/supabasePublic.js
for the client-side companion.

## The correct pattern for authenticated user access

Crew members sign in to field-command, so most data access is via the
authenticated role. Use auth.uid() to scope rows to the current user:

    FOR SELECT TO authenticated
    USING (tenant_id = public.get_user_tenant_id())

Or for user-owned rows directly (e.g., a crew member's own time entries):

    FOR SELECT TO authenticated
    USING (user_id = auth.uid())

## When this rule applies

Any time you write or modify SQL touching:
  - Files in supabase/migrations/ or sql/
  - Anything mentioning RLS, policies, anon access, public access, or
    token-gated reads
  - Any new public-facing page or unauthenticated endpoint
  - PowerSync sync rules that depend on RLS for filtering

## Deploy gates for any RLS or auth change

The 6-gate deploy pattern from the 2026-04-26 incident is non-negotiable:

  1. Build all changes on a branch (do NOT touch main)
  2. Test on a development build of the app (real anon conditions)
  3. Merge PR — frontend deploys; old policies still active
  4. Test on production with a test account
  5. Apply additive migration (new policies alongside old)
  6. Test on production again (overlap window)
  7. Apply drop migration (old policies removed)
  8. Test on production a third time (strict enforcement only)
  9. Commit drop migration + rollback to main as a record

For mobile, "preview deploy" = TestFlight/internal-track build. Same idea:
test under real conditions before changing the database.

Do not skip gates.

## Cross-repo impact

The Supabase database is SHARED across all 4 Command Suite repos:
  sales-command, sch-command, field-command, AR-Command-Center

Tables most likely to be affected by cross-repo RLS work:
  proposals, proposal_wtc, proposal_recipients, proposal_signatures,
  invoices, invoice_lines, call_log, customers, customer_contacts,
  team_members, tenant_config, jobs, job_work_types,
  daily_log_entries, time_entries, photo_uploads

Any policy change here must be checked against the other 3 repos:

    cd ../sales-command && grep -rn "<table_name>" src/
    cd ../sch-command && grep -rn "<table_name>" src/

If sibling repos query the same table as anon WITHOUT the new pattern,
they will break or remain vulnerable.

## Reference implementation

The token-gated public access pattern was implemented in sales-command
on 2026-04-27. See:
  sales-command/CLAUDE_RLS.md
  sales-command/src/lib/supabasePublic.js
  sales-command/supabase/migrations/20260427180000_add_token_gated_policies.sql

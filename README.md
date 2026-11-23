# AI Interview Prep

A practice platform for UK university credibility / CAS Shield-style interviews. **Students never sign in.** An admin creates an interview for a student, gets a unique secret link, and shares it by WhatsApp or email. The student opens the link, uploads a CV (optional), checks their background, practises the passport and name/ID introduction, and sits a timed mock interview: **one question at a time, realistic preparation and answer timers, no recording.** The admin watches progress live.

> Independent practice tool. Not an official university interview, admissions decision or identity verification service.

**Live site:** https://analpbrk-png.github.io/Sterling-interview/ (GitHub Pages, deployed by GitHub Actions on every push to `main`).

## Workflow

Admin login → New interview → unique link → share link → student opens link → interview → admin dashboard shows progress live → completed.

## Architecture

| Part | Where it runs | Notes |
| --- | --- | --- |
| Website: admin panel and student interview page | **GitHub Pages**, static files built by **GitHub Actions** | Next.js static export. No server. |
| Database, admin login, private CV storage, live updates | **Supabase** (backend) | Row level security on every table; private bucket; Realtime for the dashboard. |
| Everything a student does (open link, upload CV, start, progress, finish) | **Supabase Edge Function `invite`** | Validates the link token on every call. Students have no direct database access. |
| AI question generation / CV reading | **Supabase Edge Functions** | The Anthropic key is a Supabase secret, never in the site. |
| Deploying migrations and functions | **GitHub Actions** (`deploy-supabase.yml`) | Runs when `supabase/**` changes on `main` (needs secrets, see below). |

GitHub Pages cannot run backend code, keep secrets, validate links or hold interview state, so all of that is in Supabase. No other website host is used.

### Interview links

- Link format: `https://<user>.github.io/<repo>/i/#<token>`. The token is after `#` (the URL fragment), which browsers never send to GitHub Pages, analytics or other sites; pages also use `Referrer-Policy: no-referrer`. The token travels to the backend only inside a POST body.
- Tokens are 32 random bytes (256 bits). The database stores only the **SHA-256 hash** for validation, plus an encrypted copy in **Supabase Vault** so admins can copy the link again. No database ID or student detail is ever used as a credential.
- Each link reaches only its own interview. Links can expire (default 14 days), be revoked, be regenerated (the old link stops working immediately), and have an attempt limit (default 1). **Allow retry** adds an attempt and reopens an expired link for 7 days.

### Progress and timing

- Progress is saved on the server after every stage of every question (`invite_record_progress`). Transitions only move forward and are checked against the **server clock**: a student cannot skip preparation, cut an answer short, submit twice, or jump ahead.
- After a refresh the interview resumes from the server timestamps; time that passed while the page was closed counts. If an automatic answer ran out meanwhile, that question is marked timed out and the next one starts.
- Statuses: Not Started, In Progress, Completed, Interrupted (ended early or no activity for 20+ minutes), Expired (link expired or revoked before an active interview).
- The dashboard and student record update automatically via Supabase Realtime (admins only; RLS applies to the feed) and re-check every 30 s for time-based statuses.
- Results show question completion and activity only. Nothing is recorded, so there are no scores.

### Security summary

- No student accounts; admin pages and all admin data require an admin login (database role `admin`). A self-registered non-admin sees nothing.
- Students cannot read any table; their only access is the `invite` function, which checks the token first.
- CVs are stored in a private bucket under `invitations/<id>/`, are type-checked by content on the server, and only admins can open them. Only redacted CV text (no emails, phone numbers, links, ID numbers) is used for AI reading. Passports are never uploaded.
- Retention: Admin → Settings deletes CVs older than the configured number of days. Deleting an interview removes its CV and progress.

### Reference PDFs

All pages of `CAS_SHIELD_MOCK.pdf` (34), `CAS SHIELD INTERVIEW 2.pdf` (18) and `CAS SHIELD INTERVIEW 3.pdf` (17) were read. Every question, identity instruction, pronunciation check and declaration is stored with its original wording, file and page. Flags raised for admin review: 7 sensitive questions; the University of Chester question (cannot be activated until restricted to Chester); a "US visa" reference in a UK set; deck 2's "recorded video interview / vocal analysis" claim; 3 duplicates linked, none deleted. Imports land as **pending review and inactive**.

The original PDFs are not in this repository (gitignored). Put them in `data/source-pdfs/` and run `node scripts/extract-fixture-text.mjs` to enable the PDF parser tests.

## Setup

### 1. Supabase

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
psql "$SUPABASE_DB_URL" -f supabase/seed.sql        # categories, default template, settings, 49 imported records
psql "$SUPABASE_DB_URL" -f supabase/seed-demo.sql   # OPTIONAL demo universities/courses
for fn in invite extract-resume generate-questions; do supabase functions deploy $fn --use-api; done
supabase secrets set ALLOWED_ORIGINS="https://<user>.github.io,http://localhost:3210"
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...   # optional; without it interviews use the approved bank only
```

In Supabase → Authentication: turn **off** "Allow new users to sign up" (only admins have accounts) and set **Site URL** to `https://<user>.github.io/<repo>/`.

Create an admin: Authentication → Users → Add user (email + password, auto-confirm), then:

```sql
update public.users set role = 'admin' where email = 'you@example.com';
```

### 2. GitHub

1. Repository → Settings → Pages → Source: **GitHub Actions**.
2. Settings → Secrets and variables → Actions → **Variables**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, optional `NEXT_PUBLIC_BRAND_*`, and `SUPABASE_PROJECT_REF`.
3. Optional, for automatic database/function deploys: **Secrets** `SUPABASE_ACCESS_TOKEN` (supabase.com → Account → Access tokens) and `SUPABASE_DB_PASSWORD`.
4. Push to `main`. `deploy-pages.yml` type-checks, runs the tests, builds and publishes the site.

### Local development

```bash
npm install
cp .env.example .env.local   # Supabase URL + anon key
npm run dev -- --port 3210
```

## Testing

```bash
npm test                              # unit tests: PDF import, state machine & timers, selection, AI validation, uploads, progress queue, no-recording guard
npm run typecheck
npm run db:verify                     # migrations + seed on a throwaway local Postgres; RLS, session and account-deletion checks
node scripts/check-invite.mjs         # live project: link validation, isolation between links, server timing, revoke/regenerate/expiry/attempts
```

The live-project script needs `.env.local` and `.env.test.local` (created by `node scripts/create-test-users.mjs`, which makes a test admin). Remove that test admin before real use (Supabase → Authentication → Users).

`/dev/interview-preview/?prep=5&answer=10` (development only) runs the interview UI without a database.

## Extending

- **Other countries:** add universities with a different `country`, a country default template, and questions for that country; add the country to the profile form.
- **Other AI providers:** implement `AIProvider` in `supabase/functions/_shared/anthropic.ts`.
- **Phase 2 (transcription, feedback):** consent-based only, no raw audio retained, feedback only when a transcript exists. This needs an Edge Function, not the static site.

# AI Interview Prep

A practice platform for UK university credibility / CAS Shield-style interviews. Students build a profile, upload a CV, add the universities and courses they are applying to, and sit a timed mock interview: **one question at a time, realistic preparation and answer timers, no recording.**

> Independent practice tool. Not an official university interview, admissions decision or identity verification service.

**Live site:** https://analpbrk-png.github.io/Sterling-interview/ (GitHub Pages, deployed by GitHub Actions on every push to `main`).

## Architecture (GitHub-only hosting)

| Part | Where it runs | Notes |
| --- | --- | --- |
| Website (all pages) | **GitHub Pages**, static files built by **GitHub Actions** | Next.js static export. No server. |
| Database, sign-in, private file storage | **Supabase** (backend) | Every table has row level security; files are in a private bucket. |
| Building interview question sets, AI question generation, AI CV reading | **Supabase Edge Functions** | The Anthropic API key is a Supabase secret and never reaches the browser. |
| Deploying migrations and Edge Functions | **GitHub Actions** (`.github/workflows/deploy-supabase.yml`) | Runs when `supabase/**` changes on `main`. |

No other website host (Vercel, Netlify, Firebase Hosting, Render…) is used.

### What GitHub Pages cannot do, and how it is handled

GitHub Pages only serves static files. It cannot run server code, keep secrets, or set custom HTTP headers. So:

- **Secrets:** the site contains only the Supabase URL and *anon* key, which are public by design. The service-role key and the AI key are never part of the site; the build fails if a secret-looking string appears in it.
- **Access control:** pages check sign-in in the browser only to decide what to show. Real protection is in the database (row level security), storage policies and checked database functions: a student cannot read another student's rows or files, change their own role, or drive another student's session, whatever they do in the browser.
- **Server work** (choosing questions from the admin-only bank, calling the AI) runs in Supabase Edge Functions that verify the caller's sign-in token first.
- **File checks:** uploaded files are checked by content (magic bytes) in the browser; the storage bucket itself enforces the 10 MB limit and the allowed types (PDF, DOCX, JPG, PNG). A user who bypasses the browser could upload a mislabelled file into **their own** private folder only; files are never served publicly or opened by anyone else.
- **CV reading** happens in the browser. Only redacted text (no emails, phone numbers, links or ID numbers) is sent to the `extract-resume` function, and only if AI is configured. Raw CV text is never stored. Passports are never read.
- **Security headers:** GitHub Pages does not allow custom headers (such as `Permissions-Policy`). Camera and microphone are still requested only when the student presses the button, and the site is HTTPS-only.
- **Admin pages** are static too; their writes succeed only for accounts whose database role is `admin`.

## What is in the box

| Area | Where |
| --- | --- |
| Student portal: sign-up, profile, CV/passport/course document uploads, CV context review, applications, history, delete-my-data | `src/app/(student)`, `src/lib/documents/client.ts` |
| Interview: intro (welcome, camera/mic check, passport practice, name + student ID, pronunciation, declaration), timed questions, manual/automatic submission, TTS, completion | `src/app/interview`, `src/components/interview` |
| Deterministic interview state machine + tests | `src/lib/interview/machine.ts`, `tests/machine.test.ts` |
| Admin portal: question review, PDF import, AI generation, sequence preview, universities, courses + verified facts, templates, sessions, students, settings & retention | `src/app/admin`, `src/lib/admin/ops.ts` |
| Logic shared by the site and Edge Functions (question selection, AI output validation, categories, flags) | `supabase/functions/_shared` (re-exported from `src/lib`) |
| Edge Functions | `supabase/functions/create-session`, `extract-resume`, `generate-questions` |
| Schema, RLS, storage policies, session and account functions | `supabase/migrations` |
| 49 records extracted from the three reference PDFs | `data/question-import/cas-shield.json` → `supabase/seed.sql` |

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
for fn in create-session extract-resume generate-questions; do supabase functions deploy $fn --use-api; done
supabase secrets set ALLOWED_ORIGINS="https://<user>.github.io,http://localhost:3210"
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...   # optional; without it interviews use the approved bank only
```

In Supabase → Authentication → URL Configuration set **Site URL** to `https://<user>.github.io/<repo>/` and add `https://<user>.github.io/<repo>/auth/callback/` (and `http://localhost:3210/auth/callback/` for development) to **Redirect URLs**.

Make yourself an admin after signing up:

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

## How the interview works

- The full question sequence is built **before** the timer starts (Edge Function `create-session`): mandatory questions, a category round-robin of approved eligible questions (right country, right university, sensitive only if the template allows, never two from the same similarity group, avoiding the last 3 sessions), plus validated AI-personalised questions logged as pending review. If AI is unconfigured or fails, the student is told the session uses the bank only.
- Timers use absolute deadlines, so background tabs and throttled timers stay accurate; after device sleep the student gets the full answer time instead of silently losing a question.
- Every transition carries the question index; stale or double events are ignored. `record_session_progress` only moves forward and refuses to start question N+1 before N finishes.
- Camera/microphone are requested only on a button press, shown live, and stopped on completion, Done, ending early and page hide. There is no recording code anywhere (enforced by `tests/no-recording.test.ts`).
- Completion shows counts, university, course, duration and status — never scores.

## Testing

```bash
npm test                              # unit tests: PDF import, state machine & timers, selection, AI validation, uploads, progress queue, no-recording guard
npm run typecheck
npm run db:verify                     # migrations + seed on a throwaway local Postgres; RLS, session and account-deletion checks
node scripts/check-isolation.mjs      # live project: a second student cannot reach the first student's data
node scripts/check-functions.mjs      # live project: Edge Function auth and ownership checks
node scripts/check-static-ops.mjs     # live project: storage folder rules, self/admin account deletion
```

The live-project scripts need `.env.local` (with the service-role key, local only) and `.env.test.local` (created by `node scripts/create-test-users.mjs`). Delete the test accounts before real use (Admin → Students).

`/dev/interview-preview/?prep=5&answer=10` (development only) runs the interview UI without a database.

## Extending

- **Other countries:** add universities with a different `country`, a country default template, and questions for that country; add the country to the profile form.
- **Other AI providers:** implement `AIProvider` in `supabase/functions/_shared/anthropic.ts`.
- **Phase 2 (transcription, feedback):** consent-based only, no raw audio retained, feedback only when a transcript exists. This needs an Edge Function, not the static site.

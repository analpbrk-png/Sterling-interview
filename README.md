# AI Interview Prep

A practice platform for UK university credibility / CAS Shield-style interviews. Students build a profile, upload a CV, add the universities and courses they are applying to, and sit a timed mock interview: **one question at a time, realistic preparation and answer timers, no recording.**

> Independent practice tool. Not an official university interview, admissions decision or identity verification service.

The brand name, accent colour, logo and favicon come from environment variables (`NEXT_PUBLIC_BRAND_*`), so nothing is hard-coded.

## What is in the box

| Area | Where |
| --- | --- |
| Student portal: sign-up, profile, CV/passport/course document uploads, CV context review, multiple applications, history, delete-my-data | `src/app/(student)`, `src/app/api/documents` |
| Interview: intro (welcome, camera/mic check, passport practice, name + student ID, pronunciation, declaration), timed questions, manual/automatic submission, TTS, completion | `src/app/interview`, `src/components/interview` |
| Deterministic interview state machine + tests | `src/lib/interview/machine.ts`, `tests/machine.test.ts` |
| Admin portal: question bank review, PDF import, AI generation, sequence preview, universities, courses + verified facts, templates, sessions, students, settings & retention | `src/app/admin` |
| Question import, categorisation, duplicate grouping, sensitivity / university / country flags | `src/lib/questions` |
| AI layer (provider-independent; Anthropic implementation), context builder, output validation | `src/lib/ai` |
| Schema, RLS, storage policies, session functions | `supabase/migrations` |
| 49 records extracted from the three reference PDFs | `data/question-import/cas-shield.json` → `supabase/seed.sql` |

### Reference PDFs

All pages of `CAS_SHIELD_MOCK.pdf` (34), `CAS SHIELD INTERVIEW 2.pdf` (18) and `CAS SHIELD INTERVIEW 3.pdf` (17) were read. Every question, identity instruction, pronunciation check and declaration is stored with its original wording, file and page; title/timing/thank-you pages are listed as skipped in `question_sources.notes`. Flags raised for admin review include:

- 7 sensitive questions (health, dependants, visa refusals, circumstances preventing study/return) — inactive unless a template explicitly allows sensitive questions.
- `CAS SHIELD INTERVIEW 3.pdf` p.7 names the **University of Chester**: it cannot be activated until an admin restricts it to that university.
- `CAS SHIELD INTERVIEW 3.pdf` p.4 says **"US visa"** in a UK set: flagged, not silently changed.
- Deck 2 p.8 claims "recorded video interview" and "vocal analysis": flagged; the app shows practice wording instead.
- 3 duplicates and further similar questions are linked by `similarity_group` / `duplicate_of`; no record is deleted.

The original PDFs are not in this repository (they are gitignored). Put them in `data/source-pdfs/` and run `node scripts/extract-fixture-text.mjs` to enable the PDF parser tests; otherwise those tests are skipped.

Everything is imported as **pending review and inactive**. Students see nothing until an admin approves questions.

## Setup

Requirements: Node 20.9+, a Supabase project, optionally an Anthropic API key.

```bash
npm install
cp .env.example .env.local   # fill in Supabase URL, anon key, service-role key, optional ANTHROPIC_API_KEY
```

Apply the schema and the imported question bank to your Supabase project (Supabase CLI):

```bash
supabase link --project-ref <your-project-ref>
supabase db push                                  # applies supabase/migrations
psql "$SUPABASE_DB_URL" -f supabase/seed.sql      # categories, default template, settings, 49 imported records
psql "$SUPABASE_DB_URL" -f supabase/seed-demo.sql # OPTIONAL demo universities/courses for testing
```

(`SUPABASE_DB_URL` is the connection string from Project settings → Database. You can also paste the files into the SQL editor.)

In Supabase → Authentication → URL configuration, add `http://localhost:3210/auth/callback` (and your production URL) as redirect URLs.

Run:

```bash
npm run dev -- --port 3210
```

### Make yourself an admin

Sign up in the app, then run in the SQL editor:

```sql
update public.users set role = 'admin' where email = 'you@example.com';
```

Then in **Admin → Questions** filter by *Pending review*, check the flags, set applicability for the University of Chester question, and approve. Add universities and courses (with modules marked **verified** when checked against the official page). The default template *UK CAS Shield Practice* (20 s prep, 60 s answer, automatic, 12 questions of which 4 AI) is seeded.

## How the interview works

- The full question sequence is built **before** the timer starts (`createInterviewSession`): mandatory questions, then a category round-robin of approved, eligible questions (right country, right university, sensitive only if allowed, never two from the same similarity group, avoiding the last 3 sessions), plus AI-personalised questions. AI output is validated (no other university names, no fees, no invented modules, no near-duplicates) and logged in the bank as `ai_generated` + pending review.
- If AI is unconfigured, disabled or fails, the session uses bank questions only and the student is told so. Nothing claims success when it did not happen.
- Timers use absolute deadlines, so background tabs and throttled timers stay accurate. After device sleep the student gets the full answer time instead of silently losing a question.
- Every transition carries the question index; stale or double events are ignored. The server function `record_session_progress` only moves forward and refuses to start question N+1 before N finishes.
- Camera/microphone are requested only on a button press, shown live, and stopped on completion, Done, ending early and page hide. There is no `MediaRecorder`, canvas capture or upload of media anywhere (enforced by `tests/no-recording.test.ts`).
- Completion shows counts, university, course, duration and status — never scores, because answers are not captured.

## Privacy and security

- RLS on every table; students only ever see their own rows. Question bank is admin-only. Roles change only via admin.
- Documents live in a private bucket under `<user_id>/…`; storage policies restrict access to the owner (admins cannot open student files). Files are validated by content (magic bytes), type and size.
- Passports are stored only; never read, parsed or sent to AI. CVs are redacted (emails, phones, links, ID numbers) before extraction; raw CV text is not stored. Only student-confirmed context, plus the selected application's verified course facts, is sent for question generation — never name, email, student ID or other applications.
- API keys and the service-role key are server-only. Students can delete their account and data; admins can run document retention cleanup.

## Testing

```bash
npm test             # 37 unit tests: PDF import vs the 3 reference PDFs, state machine & timers, selection, AI validation, uploads, progress queue, no-recording guard
npm run typecheck
npm run db:verify    # applies migration + seed to a throwaway local Postgres and runs RLS / session-function checks
npm run build
```

`db:verify` needs local Postgres binaries (`initdb`, `pg_ctl`, `psql`). It stubs the Supabase `auth`/`storage` schemas and checks: cross-student isolation for profiles, documents, files and applications; no self-promotion to admin; mismatched university/course rejected; ordered, idempotent, forward-only session progress; completion blocked while questions remain; imported questions inactive and unactivatable until reviewed.

`/dev/interview-preview?prep=5&answer=10&mode=automatic` (development only, 404 in production) runs the interview UI with sample questions and no database, for checking timers and layout.

### Manual acceptance checklist (needs a connected Supabase project)

1. Sign up → profile saves → redirected to Applications.
2. Upload a PDF/DOCX CV → draft background appears → edit → Confirm.
3. Add two applications at different universities; remove one.
4. As admin, approve imported questions; preview a sequence for each university.
5. Start practice → only that application's university/course appears; Chester question only for Chester.
6. Camera/mic check shows live preview and moving meter (allow permissions in a normal browser tab).
7. Passport, name/ID, pronunciation and declaration steps appear per template.
8. 20 s prep then 60 s answer; manual mode waits for **Submit Answer**; automatic advances on its own.
9. Done turns off the camera light; history lists the session; Admin → Sessions shows the questions presented.
10. Sign in as a second student: no access to the first student's documents or sessions; `/admin` redirects.

## Deployment

Any Node host that runs Next.js (Vercel, Netlify, Render, Fly, a container):

1. Set the environment variables from `.env.example` (service-role and Anthropic keys as **server-only** secrets).
2. `npm run build && npm start` (or the host's Next.js preset).
3. Add the production `/auth/callback` URL in Supabase Auth settings.
4. Camera and microphone require HTTPS in production.

## Extending

- **Other countries:** add universities with a different `country`, a country default template, and questions with that country. The UI's country list is in `src/app/(student)/profile/page.tsx` and `ProfileSchema` in `src/app/(student)/actions.ts`.
- **Other AI providers:** implement `AIProvider` in `src/lib/ai/provider.ts` and add a branch to `getAIProvider`.
- **Phase 2 (transcription, feedback):** the session/event tables already record per-question timing. Any transcription must be consent-based, must not retain raw audio, and feedback must only be shown when a transcript actually exists.

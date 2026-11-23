#!/usr/bin/env bash
# Applies the migration and seed to a throwaway local Postgres with Supabase stubs,
# then runs behavioural RLS checks. Requires postgres binaries (initdb, pg_ctl, psql).
set -euo pipefail
cd "$(dirname "$0")/.."
DIR=.verify-db; PORT=55439
rm -rf "$DIR"; mkdir -p "$DIR"
LC_ALL=C initdb -D "$DIR/data" -U postgres -A trust --locale=C >/dev/null
LC_ALL=C pg_ctl -D "$DIR/data" -o "-p $PORT -k $PWD/$DIR" -l "$DIR/log" start >/dev/null
trap 'pg_ctl -D "$DIR/data" stop >/dev/null 2>&1 || true' EXIT
P="psql -h $PWD/$DIR -p $PORT -U postgres -v ON_ERROR_STOP=1 -q"
$P -c "create database app" >/dev/null
$P -d app -f scripts/verify-db/supabase-stubs.sql >/dev/null
for f in supabase/migrations/*.sql; do echo "apply $f"; $P -d app -f "$f" >/dev/null; done
echo "apply supabase/seed.sql"; $P -d app -f supabase/seed.sql >/dev/null
$P -d app -At -c "select 'questions: '||count(*)||', sensitive: '||count(*) filter (where is_sensitive)||', duplicates: '||count(duplicate_of)||', university-specific: '||count(mentions_university) from public.question_bank"
$P -d app -At -f scripts/verify-db/rls-tests.sql

# Deploying Rorota

## The problem this solves

Until now every change went: edit locally → `git push` → **live for the whole
restaurant**, with nothing in between. CI existed but couldn't stop anything —
it ran alongside the deploy rather than in front of it.

On 3–4 August that cost:

- three commits of UI change shipped without a human looking at them
- a white-screen bug that had been sitting in production, unnoticed, since the
  PWA was added
- a security migration applied straight to the live database

None of that needed a big pipeline to catch. It needed *somewhere to look
before it was real*.

## The flow

```
git switch -c some-change     # branch
  … work …
git push -u origin some-change

  ↓ Vercel builds a PREVIEW at its own URL
  ↓ CI runs lint:ci + tests + build

open the preview, click the thing you changed
  ↓ both green, looks right

open a PR → merge → production
```

You already had every piece of this. What was missing was using a branch.

## ⚠️ The one thing to understand about previews

**A preview deployment talks to your REAL Supabase database.**

Same project, same tables, same rows. The preview URL is a different *front
end*, not a different *world*.

So a preview is safe for: layout, copy, colours, whether a screen renders,
whether a button is where you expect.

It is **not** safe for: archiving someone, deleting a schedule, publishing a
week, approving time off, running a migration. Those hit production data from a
preview exactly as hard as they would from the real site.

If you want previews to be genuinely safe to poke at, that needs a second
Supabase project with its own URL and anon key wired to preview environments —
which also means keeping two schemas in step. **At 3 users that is probably not
worth it yet**, and it's an honest trade rather than an oversight. Revisit it
when a preview breaking something real would actually cost you.

## One-time setup (~10 minutes, and only you can do it)

### 1. Make CI a gate, not a spectator

GitHub → repo → **Settings → Branches → Add branch ruleset**

- Target: `main`
- ✅ Require a pull request before merging
- ✅ Require status checks to pass → select **`test-and-build`**
- ✅ Do not allow bypassing (or leave off if you want an escape hatch — but
  know that you'll take it under pressure, which is exactly when you shouldn't)

Without this step, CI stays advisory and nothing actually changes. This is the
step that matters.

### 2. Confirm previews are on

Vercel → project → **Settings → Git**. Preview deployments for non-production
branches are on by default; just confirm, and check the env vars are set for
the Preview environment as well as Production.

### 3. Stop pushing to main

That's it. `git switch -c …` instead of committing on `main`.

## When to skip the branch

A one-line typo in a comment, or a docs-only change. Judgement, not ceremony.
But "it's a small change" is what everyone says right before the small change
white-screens the app — and the small change *is* what white-screened the app
on 3 August (a hook below an early return).

## Turning on error monitoring

Rorota reports crashes to Sentry, but only if a DSN is present **at build time**.

1. Create the Sentry **ORGANISATION** with Data Storage Location set to
   **European Union**. It is a dropdown in the "Create a New Organization" step,
   it is **irreversible**, and it is on the ORGANISATION — not the project. Get
   it wrong and the only fix is a new organisation; moving the project does not
   help. Events then live in Frankfurt and the DSN contains `de.sentry.io`.
   Note what this does NOT cover: user accounts, DSN keys, project metadata,
   org settings and audit logs stay in the US regardless. The error payloads —
   the part that could carry anything about a restaurant's staff — are what stay
   in the EU. Worth knowing precisely when the DPA conversation happens.
2. Create a project inside it, platform **React**.
3. In Vercel → Settings → Environment Variables, add `VITE_SENTRY_DSN` for
   Production (and Preview, if you want preview crashes too).
4. **Redeploy.** Vite inlines `import.meta.env` when it builds, so the variable
   has no effect on the bundle already deployed. Adding it and not redeploying
   reports nothing and looks exactly like everything working.

To confirm it is live: the built `index-*.js` should contain the string
`sentry`. With no DSN it is not in the bundle at all — that is deliberate, and
worth 29 kB gzip.

### What is deliberately not sent

`scrubEvent` in `src/lib/monitoring.js` runs on every event and every
breadcrumb, and is unit tested. Wages, names, phone numbers, sick-pay
percentages and email addresses are redacted; performance tracing and session
replay are switched off entirely, because both would carry a screen full of
exactly that. A crash report may say what broke and where, never who it
happened to or what they earn.

## After any migration that adds a table

Run this in the SQL editor:

```sql
select * from public.tables_missing_rls();
```

**Zero rows is the pass.** Anything returned is a table that either has RLS off
(readable and writable by any logged-in user of any restaurant) or has RLS on
with no policies (denies everyone — safe, but almost always a half-finished
migration).

Since 13 Aug a new table also arrives with *no* grants at all, so the app will
fail loudly on it in development until you grant it explicitly. That is
deliberate: a permission error in front of you beats a silent hole in front of a
customer. Add the `grant` next to the `create table`, in the same migration.

## What still isn't covered

- **Migrations.** They're applied by hand in the Supabase SQL editor and there
  is no preview database, so a migration is live the moment you run it. Every
  migration in `supabase/migrations/` ends with a read-only verification query
  for exactly that reason — run it, read it, don't assume.
- **Nothing here tests the app.** CI proves it builds and the unit tests pass.
  It cannot tell you a button does the right thing. That's what the preview URL
  and `TESTING.md` are for.

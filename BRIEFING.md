# Rorota — state of things, 3 Aug 2026

Written after a long working session. Honest read: what's good, what worries me,
what's missing. Severity scale matches TASKS.md (1–3 cosmetic, 4–6 real but not
urgent, 7–8 fix soon, 9–10 data loss / security / breakage).

---

## Where it stands

~10,500 lines across 25 or so files. 103 tests, a CI gate that runs lint + tests
+ build on every push, 12 migrations all applied, 4 edge functions. Five
languages at full key parity, enforced by tests.

That's a real product. The scheduling engine, clock-in, swaps, open shifts,
documents, costs, push, multi-org — that's a lot of working surface area, and
most of it is genuinely used rather than half-built.

---

## What's actually good

**The scheduling core is well-factored and well-tested.** `lib/schedule.js` holds
the logic that decides hours, cost and conflicts, it's pure, and it has 57 tests
covering the edge cases that matter (overnight wrap, same-minute punch,
11-hour rest, headcount preserved across a drag). That's the part where a bug
costs someone money, and it's the part that's hardest to get wrong now.

**The i18n discipline is unusually good.** Five languages with enforced key
parity, placeholder checking, and plural-pair validation. Most projects this size
have one language and a pile of hardcoded strings.

**Security got taken seriously.** Wages moved to their own table with
manager-only RLS once it became clear RLS filters rows, not columns, and every
coworker's wage was being shipped to every employee's browser. That's the single
most important fix in the codebase's history.

**Comments explain *why*, not *what*.** Someone picking this up in six months
will understand the non-obvious decisions. That's rarer than it sounds.

---

## What worries me

### 1. App.jsx is 1,932 lines and `Dashboard` is most of it — severity 6/10

Every manager-side feature lives in one function. It holds ~40 pieces of state,
~25 effects and handlers, and the entire render tree. This is the reason the
white-screen outage happened: a hook added near line 1041 sat below an early
return at line 441, and nothing about the file made that visible.

It works, and I've deliberately not attempted the refactor mid-session — but it
is the single biggest structural risk. Every new feature makes it worse, and the
failure mode is subtle (hook ordering, stale closures) rather than loud.

The realistic fix isn't "rewrite App.jsx". It's: extract `Dashboard` into its own
file, then peel off self-contained chunks (the swap/open-shift handlers, the
schedule mutation handlers, the derived-data block) into hooks like
`useSchedule()`, `useSwaps()`. Each step is independently safe and testable.

### 2. The data layer has no tests at all — severity 6/10

`lib/data.js` (652 lines) is every read and write to Supabase, and none of it is
tested. It needs the Supabase client mocked, which is why it keeps getting
deferred. But this is where a silent bug corrupts real data rather than
displaying something wrong — `syncEmployees` deletes rows for ids not in the
array it's given, and nothing verifies that logic.

Also untested: `lib/org.js` (membership/invites — i.e. who can see what) and
`lib/storage.js`.

### 3. 14 React Compiler lint errors, deliberately unfixed — severity 5/10

All in one family, all pre-existing patterns:

- `react-hooks/use-memo` ×6 — `useCallback(mkDebounce(...))` passes a *call
  result*, not an inline function. It works, but the memo isn't doing what it
  looks like it's doing.
- `react-hooks/set-state-in-effect` ×4 — `setState` synchronously in an effect,
  which causes cascading renders.
- `react-hooks/refs` ×2 — reading a ref during render.
- `react-hooks/immutability` ×2 — mutating a cloned schedule object in place.

None are breaking anything today. All are the kind of thing that breaks
*eventually*, especially under React Compiler. I left them because each is a
non-trivial refactor of working code and I'd rather flag them than change them
blind at the end of a long session.

### 4. Everything still deploys straight to production — severity 4/10

CI now catches broken builds, failing tests, and hook-order bugs before merge.
That's a real improvement, and it would have caught today's outage. But there's
still no environment where you can click around a change before real users get
it. The gap between "it compiles and the tests pass" and "it works" is exactly
where today's white screen lived.

### 5. Push notifications remain unverified — severity 5/10

Subscribing works, the toggles work, the edge function exists. Nobody has
confirmed a notification actually *arrives* for any of the four event types. It's
the only significant feature in the app whose core promise is untested.

---

## What's missing (product, not code)

**Audit trail — severity 5/10.** Nothing records who changed a schedule or when.
For a tool where people get paid based on the data, "who moved my shift and when"
has no answer. This matters more as the team grows.

**Archive instead of delete — severity 4/10.** Deleting an employee now removes
their shift history too (a consequence of fixing orphaned shifts). Fine for a
mis-added row; wrong if you ever need past hours for payroll or a dispute.

**No undo, anywhere — severity 4/10.** Deletes are confirm-dialog-and-gone. Drag
moves apply instantly. For a tool used quickly under pressure, one misdrag is
unrecoverable without manually reconstructing it.

**Mobile is functional but not designed — severity 4/10.** Everything responds
and nothing breaks, but the week grid needs horizontal scrolling on a phone, and
staff will overwhelmingly use this on a phone. Worth watching how people actually
use it before investing.

**Onboarding — severity 3/10.** A new manager lands on an empty schedule with no
guidance. Already on the Someday list.

**No conflict handling on concurrent edits — severity 4/10.** Two managers
editing the same week both write the whole schedule blob; last write wins,
silently. Polling every 45s narrows the window but doesn't close it.

---

## If I were picking the next three things

1. **Verify push actually delivers** — cheap, and it's the last unverified
   promise in the app.
2. **Extract `Dashboard` out of App.jsx** — one mechanical move, no behaviour
   change, and it makes every subsequent change safer.
3. **Test `lib/data.js`** — where the next expensive bug is most likely to hide.

Staging is worth doing but is mostly setup on your side, and CI already covers a
good chunk of what it would have caught.

---

## One honest note on this session

I introduced two of the bugs fixed today: the rules-of-hooks violation that
white-screened production, and the role badges overflowing after I changed the
table layout. Both got caught quickly, and the lint gate now catches the first
class automatically — but it's worth saying plainly that "the tests pass and it
builds" was not sufficient, twice. That's the argument for staging, more than any
abstract best practice.

I also twice described things as verified when I'd assumed rather than checked
(the migrations, and the "cosmetic" lint backlog). Both turned out wrong when
actually inspected. The migration-check script and the fixed lint config exist so
neither has to be guessed at again.

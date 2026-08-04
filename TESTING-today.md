# Test pass — 3 Aug changes

Covers only what changed today. Full regression list is in `TESTING.md`.

**You need:** a manager login and a staff login (two browsers, or one normal +
one private window). Pick a test person who is **not** you — Lars or Henrik.

Everything is pushed, so wait for the Vercel deploy to finish before starting.

---

## A. Archived staff — severity 7/10, the real bug

This is the one worth doing properly. Before today, archiving someone hid them
from you but **not from your staff**.

1. **Manager** → Employees → archive your test person.
2. **Manager** → Schedule → Team. Their row is gone. ✅
3. **Staff** → reload → Schedule → Team.
   - Their row is **gone**. ← *this was broken; they used to still be listed*
4. **Staff** → Directory tab.
   - They are **not** in the grid. ← *was broken*
5. **Staff** → on one of your own shifts, click give away / offer.
   - They are **not** in the list of people you can offer it to. ← *was broken,
     and was the worst of it: you could hand a shift to someone who had left*
6. **Kiosk view** (if you use it) → the punch-in tiles.
   - No tile for them. ← *was broken*
7. **Manager** → Team → the footers. Both of these were wrong before:
   - Week summary strip: "N of M staff working" — **M drops by one.**
   - The per-day column tally ("10 / working") — **also drops**, on any day
     they were on. This is the one you caught; it was reading the schedule
     rather than the roster, so it counted a person whose row is hidden.
8. **History still intact** — scroll back to a **past** week where they worked.
   - **Week** view: their shift still shows **their real name and colour**,
     not "Unknown" and not a blank. This is the important half. Archiving is
     not deletion; if this is wrong, tell me immediately.
   - **Team** view: their row is missing even in the past. That one is
     *known* and already on the list (3/10) — not a new break.
9. **Reload.** All of the above still true.
10. **Their upcoming shifts became OPEN shifts** — this is new. At step 1 you
    were asked whether to take them off the rota and post them for the team;
    if you said yes:
    - **Manager** → Requests → those shifts appear as **open shifts** waiting
      to be claimed, on the right days and with the **right role**.
    - **Staff** with that role → Requests → they can see and take them.
    - Nothing was deleted. Previously confirming that prompt destroyed the
      shifts outright and restoring could not bring them back.
11. **Restore them** (Employees → archived section) and confirm they come back
    everywhere. Any open shift nobody claimed is still sitting in the queue —
    cancel those by hand if you don't want them.

---

## B. Staff Requests tab — rebuilt

**Staff** → Requests.

12. Three separate cards now, in this order — not one long list:
    - **Needs you** — accent edge on the left, count badge
    - **Waiting on others**
    - **Your time off**
    Cards with nothing in them should not appear at all.
13. The count on the **Needs you** badge matches the number on the **Requests
    nav tab**. They are now the same expression, so if they disagree, that's a bug.
14. Every row shows: avatar · badge (Swap / Open shift) · **date** · block
    name and times · role.
    - Specifically check a **swap request** and a **"requests for your shifts"**
      row — those two were the ones showing only `Waiter · Thursday` with no
      date and no block.
    - "Thursday" alone is a fail. It should read like `Thu 06.08 · Dinner 17:00–23:00`.
15. Buttons still work end to end: **accept**, **decline**, **cancel**,
    **take** an open shift, **cancel a pending time-off request**.
16. Clear everything out (or use a fresh staff account) → empty state should
    say *"No requests"* with a line about what shows up here.
    - If it says **"Nothing yet"**, the old notifications string is still
      wired up — that's a fail.
17. Switch language (Danish + one other) on this tab. No blank labels, no raw
    keys like `req.needsYou` showing through.

---

## C. Leave + shift on the same day

18. **Manager** → approve time off for someone on a day they already have a shift
    (or give someone a shift on a day they're already off).
19. **Manager** → Team → that cell shows **two cards**: the leave card, and the
    shift underneath with a **warning-coloured border**. Hover gives a tooltip.
20. **Staff** (that person) → their own grid → same thing. They should see it
    about themselves, not only you seeing it.
21. There should be **no** empty "—" placeholder under a leave card.

---

## D. Manager's own approvals queue — regression check

The request row is now shared between staff and manager, so this could have
moved when I changed the staff side.

22. **Manager** → Requests → pending approvals.
23. Rows still show the Swap / Open shift badge, the person, the date, and the
    block — and **Approve / Reject** still work.

---

## If something's wrong

Tell me **which number**, what you saw, and what you expected. If it's A8
(a past shift losing someone's name), say so first — that's the only one here
that would mean data is being rendered wrong rather than just laid out badly.

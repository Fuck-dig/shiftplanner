# Manual test checklist — 3 Aug 2026

Everything below was added or changed today and is covered by tests and lint,
but **none of it has been exercised by a human in a browser**. Ordered by how
badly it'd hurt if it were broken, so if you stop halfway you've still covered
the important half.

Two logins needed: your owner account, and the Test staff account.

---

## 0. Before anything (2 min)

- [ ] Run `supabase/migrations/20260803140000_schedule_audit.sql`
- [ ] Run `supabase/migrations/20260803160000_employee_archived.sql`
- [ ] Run `supabase/check_migrations.sql` — **all columns true**

Archive and History do nothing until these are applied. The audit one fails
*silently* by design, so it won't tell you.

---

## 1. Smoke test — does it still work at all? (highest priority)

The whole manager app moved into a new file today. If something broke, it broke
here, and everything below is moot.

- [ ] Log in as owner → schedule loads, no error screen
- [ ] Click through **every** tab: Schedule, Employees, Admin ▸ (Requests,
      Coverage, Costs), Profile — each renders
- [ ] Switch Week / Month / Team — all three render
- [ ] Reload the page — lands back in a working state
- [ ] Log out and back in

> If you see "Der gik noget galt", stop and tell me — that's the same failure
> mode as this morning and I'd want the console error.

---

## 2. Admin — schedule editing

**Drag and drop**
- [ ] Drag someone onto an empty slot → they move
- [ ] Drag someone onto another person → the two swap
- [ ] Drag someone onto a block **they're already in** → nothing happens
      *(this was a real bug: it used to create a duplicate that the UI then
      couldn't tell apart)*
- [ ] Drag someone onto a day they're on leave → warning dialog appears, with
      Cancel and "Move anyway" both working
- [ ] Swap two people where one is over hours → warning names **both** people

**Undo**
- [ ] Move a shift → toast appears bottom-centre → click **Undo** → it goes back
- [ ] Remove someone → Undo → they're back
- [ ] Assign someone → Undo → they're gone again
- [ ] Ignore a toast for ~10s → it disappears on its own
- [ ] Undo, then check the week still saves (reload and confirm it stuck)

**Open shifts**
- [ ] "+ Open" on a slot → an open shift card appears
- [ ] Post **two or three** on the same slot → all of them show
- [ ] ✕ on an open shift → it's removed

**Everything else**
- [ ] Add someone via the "-N short" picker
- [ ] Click a shift → edit times → save
- [ ] Confirm schedule → banner shows published
- [ ] Now move a shift → it should flip back to **draft** (every edit does this
      now, including click-to-swap, which previously didn't)

---

## 3. Admin — History (audit trail)

- [ ] Make a few changes, then click **History** in the schedule bar
- [ ] Entries show **your name**, what happened, and a timestamp
- [ ] A move says where it went *(from → to)*
- [ ] Undo something → the undo itself appears in the log
- [ ] Publish → appears as its own entry

---

## 4. Admin — Archive vs delete

- [ ] Give someone a few shifts across the week first
- [ ] **Archive** them → they vanish from the Team grid, the staff picker and
      auto-generate
- [ ] **Their existing shifts still show, with their real name and colour** —
      not a generic grey card *(this is the bit most likely to be subtly wrong)*
- [ ] Costs for that week still include them
- [ ] Employees ▸ "Former staff" → they're listed → **Restore** → back to normal
- [ ] Reload after archiving — it must **stick** (if archiving silently resets,
      the migration didn't run)
- [ ] Delete someone (a throwaway row) → confirm dialog explains it destroys
      shift history

---

## 5. Admin — search, and the general UI

- [ ] Type a name in **Search staff** on Week view → everyone else greys out
- [ ] Switch to Team view → same search still applied, same greying
- [ ] Clear it with the ✕
- [ ] **Today** button → lands on today's day view, today's column highlighted
- [ ] Role badges don't overflow their column *(check "Bartender")*
- [ ] Hover a day column → whole column tints, no odd nested outline
- [ ] Toggle dark mode → nothing unreadable
- [ ] Switch language to Dansk → no raw keys like `grid.addShiftTitle` anywhere

---

## 6. Staff (log in as Test)

- [ ] Schedule loads; your own shifts are highlighted as yours
- [ ] **Requests** tab exists and shows a count badge when something needs you
- [ ] Open shifts appear in the grid row **and** under Requests
- [ ] Each shows the **date**, not just "Fri"
- [ ] **Take this shift** → it moves to "Waiting for approval"
- [ ] Claim a shift on a day you're **on leave** → warning first, still allowed
- [ ] With 3 open shifts on one slot, after claiming one the others disappear
      *for you* (you can't take the same shift twice) but stay for others
- [ ] Search staff works the same way it does for admin
- [ ] Your own "Your Shifts" strip never greys out while searching
- [ ] Give away a shift → appears under your requests

---

## 7. The round trip (most valuable single test)

- [ ] **Admin** posts an open shift
- [ ] **Staff** sees it, claims it
- [ ] **Admin** sees it in Requests → badge reads **Open shift**, not "Swap"
- [ ] Approve → staff is now actually on the schedule
- [ ] History shows the whole sequence

---

## 8. Two managers at once (if you can — needs two logins)

This is the data-loss fix, and it's the hardest thing to be confident about
from tests alone.

- [ ] Two browsers, both as managers *(use `?altsession=1` in one tab)*
- [ ] A edits week 1; B edits week 2 → **wait a minute** → both survive
- [ ] A creates a brand-new week; B edits an existing week → A's new week is
      **still there** *(this used to be deleted outright)*

---

## 9. Push notifications — the last unverified feature

- [ ] Phone: enable push in Profile
- [ ] Admin confirms a schedule → notification arrives
- [ ] Admin approves a swap/time-off → notification arrives
- [ ] Send a direct message → notification arrives
- [ ] Shift reminder (cron or manual trigger) → notification arrives

---

## 10. Staff Requests tab and the manager approvals queue — STILL UNTESTED

Folded in from `TESTING-today.md` (the 3 Aug change pass) on 7 Aug, because a
file named "today" is misleading by the following week. Sections A and C of that
pass were completed on 4 Aug and their findings are in `CHANGELOG.md`; these two
were never run, because they need a **staff login** as well as a manager one.
They remain the least-verified part of the app.

**You need:** a staff login and a manager login — two browsers, or one normal
plus one private window. Use a test person who is not you.

### Staff Requests tab (rebuilt, never tested by a real staff account)

1. **Staff** → Requests. Three separate cards, in this order — not one long
   list: **Needs you** (accent edge on the left, count badge), **Waiting on
   others**, **Your time off**. A card with nothing in it should not appear.
2. The count on the **Needs you** badge matches the number on the **Requests
   nav tab**. They are the same expression now, so disagreement is a bug.
3. Every row shows: avatar · badge (Swap / Open shift) · **date** · block name
   and times · role. Check a **swap request** and a **"requests for your
   shifts"** row specifically — those two used to show only `Waiter · Thursday`
   with no date and no block. "Thursday" alone is a fail; it should read like
   `Thu 06.08 · Dinner 17:00–23:00`.
4. Buttons work end to end: **accept**, **decline**, **cancel**, **take** an
   open shift, **cancel a pending time-off request**.
5. Empty state (clear everything, or use a fresh staff account) says *"No
   requests"* with a line about what appears here. If it says **"Nothing yet"**,
   the old notifications string is still wired up — fail.
6. Switch language (Danish plus one other) on this tab. No blank labels, no raw
   keys like `req.needsYou` showing through.

### Manager approvals queue — regression check

The request row is shared between the staff and manager sides, so changing one
can move the other.

7. **Manager** → Requests → pending approvals.
8. Rows still show the Swap / Open shift badge, the person, the date and the
   block — and **Approve / Reject** still work.

### Also never executed: archiving with OK

9. **Manager** → Employees → archive someone who has an **upcoming** shift, and
   answer **OK** to the prompt (the 4 Aug run answered Cancel, so this path has
   never actually run). Their upcoming shifts should become **open shifts**;
   past shifts keep their real name and colour.

---

## 11. Everything shipped 6–13 August — FULL PASS

Ordered by what it costs if it's broken, not by when it was built. Stop and
report at the first failure in sections A–C rather than working through; those
are money, access and data-loss. D–F are cosmetic and can be batched up.

**You need:** a manager/owner login (you), a **staff login**, and ideally a
phone. Items marked 🔒 need the staff account; items marked 👥 need a second
manager account that is NOT the owner.

Two of these paths have never been executed by anyone, ever: the staff Requests
tab (section 10 above) and the open-shift claim → approve round trip (B3).

---

### A. Money — wrong numbers here are the worst outcome

1. **Pay card matches Costs.** Pick one person. Manager → Costs → note their
   hours and cost for a week. 🔒 Staff → Schedule → "Your pay" → This week.
   The hours must match exactly. The money will differ if they're salaried
   (Costs shows cost, the card shows their pay) — for an hourly person it
   should match.
2. **The breakdown reconciles.** Click a pay tile. The per-shift amounts must
   sum to the headline total shown in the popup footer. This is the number
   someone will hold against a payslip.
3. **Punch-out changes it.** Manager → edit a past shift → Adjusted, shorten it
   by two hours → save. 🔒 Staff → their pay card drops accordingly.
4. **Sick pay.** Manager → open a shift → **Mark as sick** → save. Then check:
   - Their **hours do NOT include it** (Team grid, Costs, and the pay card).
   - Costs shows a sick-pay line and the cost includes it at the set %.
   - The week header shows the slot as **missing** — that's the point of it.
   - 🔒 Staff pay card lists it tagged "sick", paid at the sick rate.
5. **Pay period boundary.** Pay card → Pay period. With a 16th start, a shift
   on the **15th** must be in the period ending that month, and one on the
   **16th** must be in the next. Step back with ‹ and confirm the dates move a
   whole period, not a month.
6. **Payday date.** The card says "paid {date}". For 16 Jul–15 Aug it should be
   the last **weekday** of August, not the 31st if that's a weekend.

### B. Access and data loss

1. 👥 **Owner-only pay settings.** Sign in as a MANAGER (not owner) → Settings.
   Sick pay and pay period must be visibly locked with an "Owner only" badge.
   If you can somehow submit, you should get an error, not a silent success.
   Role colours must still save fine for that manager — that's what the trigger
   is carefully not breaking.
2. 🔒 **Staff see their own wage only.** Staff → Employees/Directory. Confirm
   **no colleague's pay is visible anywhere**. This is the one security-relevant
   change of the week; if a wage shows for anyone but themselves, stop and tell
   me immediately.
3. 🔒 **Open shift round trip — never tested.** Manager → Team → "+ Open" →
   pick a day, a role, and use the **Custom** row with unusual times (say
   18:00–22:00). Then staff → claim it → manager → approve. The shift must land
   on the rota with **18:00–22:00**, not the block's full hours. Check the staff
   side showed those times BEFORE they claimed it.
4. **Generate does not silently destroy work.** Hand-edit a week (move someone,
   add a shift). Press **Generate** → you must get a confirmation → press
   **Cancel** → the rota is untouched. Then confirm a **published** week gives
   the stronger warning that mentions staff not being told.
5. **Generate month** warns with a count of weeks, and how many are published.

### C. The scheduler

1. **Role order no longer matters.** Note the generated rota. Schedule → Week →
   drag the role legend into a different order → Generate again. **The rota
   should be identical.** Different people or different gaps = a real bug.
2. **No obvious avoidable gaps.** After generating, look at "N missing". If you
   can fill a slot by hand that the generator left empty while someone eligible
   sat idle, tell me — that's the greedy-vs-optimal limitation and it's worth
   knowing whether it bites in practice.
3. **Rest and caps still hold.** Nobody scheduled over their max hours, nobody
   with under 11 hours between two shifts.

### D. Restaurant setup and settings

1. Create a **throwaway restaurant** with an odd pay period (say the 5th) and
   sick pay 50%. Delete it afterwards from Supabase.
2. Settings tab shows those values, and the live preview line matches the period
   you'd expect.
3. Change currency in Settings → Costs and the staff pay card both show the new
   symbol.

### E. Mobile (phone, not a narrow window)

1. **Team grid**: swipe sideways — the day headings move WITH the cards. No
   overlap, nothing under the wrong date.
2. **Compact** in Team fits the whole week with no sideways scrolling.
   **Comfortable** still scrolls. Week view still scrolls in both.
3. Toolbar is two rows, not four. ☰ contains History / Print / Delete when a
   week is open. Search collapses to a magnifier and still filters.
4. Costs: the money column is visible without scrolling sideways.
5. Employees: every action button is reachable (Add shift → … → delete).

### F. Small things

1. **Kiosk** shows a large clock and today's date, and it stays correct.
2. **Density toggle** on the staff view persists across a reload. Same for the
   manager's.
3. Pay card is on the **Schedule** tab, not Requests.
4. Posting an open shift uses the same centred dialog as adding a shift.

---

## If something's wrong

Tell me **what you did, what you expected, what happened** — and if it's an
error screen, the browser console output. Console beats a screenshot for this;
it usually names the exact line.

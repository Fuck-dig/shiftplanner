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

## If something's wrong

Tell me **what you did, what you expected, what happened** — and if it's an
error screen, the browser console output. Console beats a screenshot for this;
it usually names the exact line.

---
version: 0.11
date: 2026-07-31
title: Quests, rebuilt — and adventures
summary: Quests now run on the slots you and your friends already keep, with no AI and no rules to fill in. And a night out can become a whole itinerary.
---

## Added

- **Pick the slots, get the deck** — Start a quest by choosing what kind of
  night it is (watch, eat, do or read) and that's it. Everyone in the quest
  then picks up to three slots to throw in — their own, ones they've saved from
  other people, or anybody else's in the quest — and you swipe through
  everything in them.
- **See what you're picking** — Every slot on offer shows a cover collage, how
  many things are in it, and whose it is. Tap one to look inside at the full
  list without leaving the quest.
- **Watch the pot fill up** — Everyone's picks appear live as they're made, so
  you can see what the night is shaping up to be before it starts.
- **Nobody has to pick** — Three each is the cap, zero is fine, as long as
  somebody puts something in.
- **Adventures** — Turn a quest into an itinerary with "Make it an adventure!".
  Add as many more quests as you like, in any mix of watch, eat, do and read —
  a movie marathon, a date night, a whole weekend away.
- **One code for the whole trip** — An adventure keeps the roster of the quest
  it grew from and inherits its code. Anyone joining with it lands in every
  quest at once; nobody re-joins for day two.
- **A day-by-day plan** — Give a quest a date and time and it slots under its
  day heading. Anything without a time waits in a Maybe list you can reorder,
  and giving it a time moves it up into the schedule.
- **Change the plan** — Add or drop quests, re-time them, or clear a time to
  push something back to Maybe. Quests you've already decided are kept as
  history rather than deleted.
- **The recap** — Completing an adventure gives you a keepsake: everything the
  group decided, when, and who was there.
- **Bail out** — Hosts can cancel a quest or an adventure mid-flight. You'll be
  asked if you're sure, and then called a Party Pooper for it.

## Changed

- **No more AI picks** — The Gemini rerank and the fetch-fresh-suggestions step
  are gone. Between the guesswork and the gaps in what we could look up, the
  decks weren't good enough. What's on your radar already is better.
- **No more constraints** — Runtime caps, film-or-show, and only-things-
  everyone-can-stream are all gone. You pick slots; everything in them is in
  the running.
- **Quests work in all four domains** — Not just films and shows. Dinner
  quests, day-out quests, and what-should-we-all-read quests now work the same
  way.
- **Ties are settled by a coin flip** — If two things finish level on votes,
  the winner is drawn at random instead of being decided by a hidden score.
- **No more mood check-in** — Energy sliders and vibe chips only existed to
  brief the AI. The lobby now shows who's put slots in instead.
- **Swipe cards are cleaner** — The fit ring and the AI blurb are gone,
  replaced by how many cards you have left.
- **Start over means re-pick** — Restarting a quest hands it back to slot
  picking rather than fetching a fresh shortlist. Your picks are kept so you
  can adjust rather than start from nothing.
- **Your taste chips are honest now** — They used to say parties used them
  immediately, which stopped being true when the AI picks went. They shape your
  taste match with friends.

## Removed

- **The suggestion engine** — The candidate-generation service and its scoring
  have been retired along with the external look-ups they depended on.

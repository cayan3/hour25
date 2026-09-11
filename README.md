# Overview
## TLDR
Hour 25 is an accessible, user-tested productivity tool that helps you track exactly how you're spending your time. Every day is broken down into half-hour intervals that can be assigned different labels based on your activity. Time slots can be labeled any time and anywhere, whether that means planning ahead for the rest of your day or backfilling past entries you were too busy to track at the time. With custom color-coded labels, offline sync across multiple devices, and secure user authentication, Hour 25 makes it both easy and satisfying to understand where your energy is really going. 

To try it out for yourself, visit [Hour 25](https://hour25.app)!

..phew, elevator pitch done. If you wanna stick around (hi!), the rest of this README includes yap about the following: 
- Description: what is this? why is this?? who even cares, and where's that music coming from???
- Current Status: and what I'm working on next!
- Stack and Layout: what it says on the tin.
- Design Goals: my own guidelines for dev
- Architecture: hopefully archi-*torture* to read..
- Property Guarantees: bc I'm a nerd
- Local Development: wowow much nice, many cool
- License: ty mit

## Description

*start fun jingle*

Ever make it to the end of the day only to wonder "what the heckie did I even 'do' today"? Well, this is your vaguely-gamified, accountability-holding, aesthetically-designed, (still work-in-progress) solution!! 

With Hour 25, you can: 

Track your time in thirty-minute intervals! 

Manage your labels with color-coding and category-grouping! 

Curate a dashboard of cool statistics about your time-spending habits! 

Confront pride, bafflement, and/or existential dread when you realize what you're spending your hours on! 

*end fun jingle*

In all seriousness, I created this project for exactly that purpose. Dealing with the college workload had put me on like-pretty-much-permanent survival mode sometime around sophomore year, and it would be frustrating and discouraging to finally go to bed without knowing if I actually did Real Work that day, or if I just procrastinated-and-brainrotted my way through with only small breaks of de-facto studying. After months of looking for an existing solution and finally just buckling-up to design my own, this lil passion project is the culmination of two years worth of my rent-free, stress-tested, *stress*-tested, time-tracking Thoughts. 

ty to Vera for encouraging & perpetuating the time-tracking brainrot <3, and shoutout to my hometown cedar rapids iowa for the project name inspo ;)

## Current Status

Existing features: 
- user auth & quick tutorial/onboarding
- horizontal and vertical day views
- label and category management
- adding notes to time slot(s)
- "undo" last edit
- auto-fill for preset "sleep" times
- light/dark themes
- installable PWA shell
- offline logging with sync surfaces
- JSON import/export for backing up/restoring
- stats (e.g. daily/weekly/monthly totals and percentage-of-waking-day)

WIP: 
- dashboard curation
- activity heatmaps, drag-to-fill for multiple time slots

## Stack and Layout

Vite · React 18 · TypeScript · Tailwind · Supabase · React Query v5 w/ IndexedDB persistence · Dexie · Zustand · Zod · Vitest

Directory layout: 

```
src/
  lib/            pure logic (time, color, stats, backup, etc)
    db/           Supabase query helpers
    offline/      queue, dead-letter queue, flush, sync triggers
    import/       JSON for importing
  hooks/          React Query & overlay hooks, one file per domain
  components/     UI only (no direct Supabase or Dexie)
  store/          Zustand
tests/            Vitest; organization mirrors src/
```

## Design Goals

The single most important goal for my development of this project is: 

- **Goal #1: user-focused design.** The overarching goal for this project is to be an accessible platform for anyone to easily track how they spend their time. Broadly, this means prioritizing quick-and-easy logging, supporting both online and offline edits on one or more devices, encouraging personal customization, and ensuring accessibility across all audiences. 

On the more "nerd" side, a close runner-up is: 

- **Goal #2: quality distributed-systems engineering.** This project may not have distributed infrastructure as the architecture, but it still involves a whole lot of distributed-systems problems. Without getting too in-the-weeds, this design and implementation guarantees some pretty cool properties that I'll elaborate more on in Guarantees. 

"But cayan3," you ask, "what does all that actually mean"? Great question! Here are a few specific user-side impacts:

- **This is a log-failure-free zone.** Tapping a slot always writes to a local queue, not directly to the network. This means your edits are always durable, even when you're offline or suffering from flaky WiFi. Edits will sync once you're connected again, and you can always check your sync status with the symbol in the header. 

- **Friends never lie.** And as your good friend, the grid of time slots will always be honest with you. What you see is a merge of the server's data with everything still waiting to sync, so your offline edits are still visible on-screen instead of just disappearing into the local queue aether (e.g. a slot you filled like two seconds ago on top of a WiFi-less mountain will look exactly like the one you filled last week when you naively agreed to "just go on a lil walk".)

- **No time travel.** Behind the scenes, dates are stored as `YYYY-MM-DD` strings and slot indices are relative to your local time zone, so there's no wacky UTC date/time arithmetic.

Finally, any non-obvious design or implementation choices are numbered/cited in the code (e.g. `// C-27: ...`) and documented with Real Words in `docs/DECISIONS.md`. 

## Architecture

### Storage

| Where | What |
|---|---|
| Postgres (Supabase) | the "source of truth" |
| IndexedDB (Dexie) | write-ahead queue, dead-letter table/queue |
| React Query | only server data; goes to IndexedDB for the persisted server cache |
| Zustand | only UI state (e.g. theme, today's date, sync status, undo) |
| localStorage | last sync time, most recently used (MRU) cache for labels, etc |

### Data Model

There are a total of four tables, each scoped to their owner/user. Data protection is handled by row-level security (RLS). 

- **`labels`**: Active label names are unique and case-insensitive. Additionally, labels are soft delete only, so deleting a label before creating a new one with the same name lets the user either restore the original label or start a new one.
- **`categories`**: Categories are (optional) groups of labels.
- **`time_entries`**: Each row represents one filled time slot with `(user_id, date, slot_index)`, and distinct rows must have unique tuples. Any unlabeled time slots are simply excluded from this table, so a row being included here means it was actively logged with a label. 
- **`user_settings`**: Includes theme, whether or not user has already been onboarded, and ability to preset label during a recurring window (e.g. auto-fill time slots from 11 PM–7 AM with the "sleep" label).

### Data Flow
All data flow in this project is write-ahead and read-merged. (For nerds, this is a write-behind/write-back cache with a durable dirty set and at-least-once idempotent replication to the authority, plus an LSM-style merge-on-read strategy for read-your-writes consistency. See Property Guarantees for more nerd-core details.) 

Here's what that looks like: 

```
WRITE                                   READ
                                        
  tap a slot                              useDayEntries(userId, date)
      │                                       │
      ▼                                       ├── useQuery ['entries', userId, date]
  upsertEntries                               │      persisted to IndexedDB
      │  dedupe by (date, slot)               │      (React Query + idb-keyval)
      ▼                                       │
  enqueueMany ──► Dexie queue                 └── useLiveQuery ──► Dexie queue
      │           key [userId+date+slot]              │
      │           op: upsert | delete                 ▼
      ▼           rev: fresh UUID per put         mergePending()
  requestFlush                                        │
      │  single-flight per tab                        ▼
      │  navigator.locks per origin              what the UI renders
      ▼
  flush ──► Supabase
      on 2xx: patch the entries cache, THEN
              delete the queue row — but only
              if its rev is unchanged
```

## Property Guarantees

This project has a client-server model and is essentially a replicated system with local-first writes and a heaping bucketful of distributed systems engineering problems. Here are some nice properties that the implementation and/or underlying design help guarantee: 

- **Basically Available**: The system still functions even during partial failures or network partitions. We're also prioritizing availability over consistency: during a partition, the UI should keep accepting your edits and wait to reconcile with the backend. (yes, this is in fact the first part of BASE.)

- **Soft State and Eventual Consistency**: Syncing supports eventual consistency, which means the data on your screen will eventually converge to the same state as the backend (and vice versa). (wow, it's the rest of BASE!)

- **Backend with Atomicity, Consistency, Isolation, and Durability (ACID)**: While the system itself is BASE, the backend is a single Postgres instance that adheres to ACID's stronger transactional guarantees. 

- **Durability before acknowledgement.** Every write is committed to IndexedDB before the function returns, so everything on the UI is at least durable locally, if not also server-side. 

- **At-least-once delivery, with idempotent application**: All writes are sent at least once thanks to the local write queue, and can be sent more than once if there are connectivity issues that require multiple flush attempts. But since the upsert conflict targets are `(user_id, date, slot_index)`, receiving a duplicate message doesn't change anything in the backend and is essentially a no-op. This idempotency prevents any race conditions or merge errors related to duplicate deliveries, without actually requiring exactly-once delivery. 

- **State-based replication**: i.e. replication isn't based on operations. Since the queue has a compound primary key, writing something new to a time slot that already has another write waiting to be synced still results in the same single final state. The last writer wins (LWW), i.e. the pending row would be replaced instead of being subject to a race condition, so you can safely change your mind on an entry's label without worrying about which of the edits on your device will end up as the final one. 

- **Read-your-writes consistency**: The overlay ensures that each write is immediately reflected in the local UI, even if it hasn't been synced to Supabase yet. This allows you to read your most recent writes even while offline. 

- **Poison message isolation and dead-letter queue**: These fun terms simply mean that if a batch of edits is failing in a way that looks permanent and not "just bad WiFi", the queue will retry its rows one at a time to find the problem child(ren), i.e. the "poison pill". We "dead-letter" any edits identified this way by sending it to a list in Settings, where it can then be discarded or manually retried. 

- **Mutual exclusion**: Each origin has just one flusher, which is controlled by `navigator.locks` to ensure that multiple open tabs (or a tab plus the installed PWA, etc) don't all try to send the same queued write(s). 

Wow! So many cool properties! All these guarantees come with an obligatory disclaimer: there are still some non-guarantees. Specifically: 

- **Second-to-last writers may not in fact win**: As mentioned above, conflict resolution is handled through last-write-wins (LWW), so trying to write to the same slot on two different offline devices will result in only one of the edits being saved. The tradeoff here is intentional since this case is fairly niche (both devices must simultaneously assign the same time slot with a different label), and LWW serves the rest of the project very well. 

- **What about time travel?**: Entries are in local time, so a day is always composed of 48 slots and doesn't (yet) account for travel across time zones. (this is wip, so stay tuned!)

- **If it looks like distributed systems engineering, and it swims like distributed systems engineering, and it quacks like distributed systems engineering...**: then it is (in this case) distributed systems engineering! But just because the engineering involves complex distributed system problems doesn't mean this is literally a *distributed system*. In fact, this project is just one single mama duck (authoritative Postgres instance..) and her non-negative-number of cute lil ducklings (with N client replicas), i.e. it is *not* a distributed system. In particular, it doesn't have common features of distributed systems such as quorums, CRDTs, sharding, server-to-server replication, etc.; for those, (shameless plug:) take a look at my RAFT implementation or distributed Bitcoin miner. 

## Local Development

If you're interested in doing your own dev, then this section's for you. For casual users, just visit [Hour 25](hour25.app) to get started!

### Installing
To run this project locally, you'll need a Supabase account; if you've never used Supabase before, they offer a pretty neat Free plan that should be enough to get you started. Then: 

1. Apply this project's schema to a new Supabase project (see `migrations/` for the schema)
2. Make sure you have `npm` installed. Run `npm -v` to check what version you're on, or run `npm install`. 
3. Clone this repo on your local machine. 
4. Create a file called `.env` in the root directory (e.g. with `touch .env`) and open it with your favorite text editor to add the following two build-time variables: 

```
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

5. When you're ready, start your dev server with `npm run dev`. Congrats; you did it! 

Here are some other useful commands: 

| Command | Description |
|---|---|
| `npm run dev` | dev server |
| `npm run build` | typecheck before running prod build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | full test suite |
| `npm run test:watch` | watch mode |

### Deploying
Any static host will work here since the build output doesn't include any server components. You'll probably want a SPA fallback for redirecting any unknown URLs; e.g. to ensure a deep link like `/auth/callback` serves `index.html` instead of 404-ing on the first visit.

E.g. deployment on Cloudflare Pages:

| Setting | Description |
|---|---|
| Build command | `npm run build` |
| Output directory | `dist` |
| SPA fallback | `public/_redirects`; copied verbatim into `dist/` |

### Testing

The command `npm test` will run the full test suite. This repo uses Vitest in two projects: unit tests run in Node with `fake-indexeddb`, and component tests run in jsdom with Testing Library. 

Some tests cover behavior that can be hard to reason about and/or easy to regress. Here are a few that may be worth a read: 

- `tests/lib/offline/flush.test.ts`: covers the edit-during-flight race, attempt policy, poison isolation, session-missing handling
- `tests/lib/merge.test.ts`: covers overlay semantics
- `tests/lib/db/entries.test.ts`: covers response-cap pagination (uses a fake that reproduces the server's row limit)

For error handling, every server failure is classified as `network`, `auth`, or `permanent`:

- `network`: edits stay queued and are retried shortly
- `auth`: stops flushing, and displays a notification/banner; new writes are still queued as normal
- `permanent`: moves the time slot/table row to a dead-letter table viewable in Settings, where user can discard or manually retry it

## License

MIT o7; see `LICENSE`.


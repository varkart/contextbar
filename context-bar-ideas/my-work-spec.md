# Feature Spec: My Work

**Status:** Draft — synthesized from whiteboard session
**Owner:** TBD
**Last updated:** 2026-07-09

---

## 1. Problem

Once someone has more than one session or worktree running — possibly across more than one repo — there's no single place that answers "what's actually happening across all my work right now, and what needs me?" People end up clicking through repos and tabs one at a time to find out what's waiting on them.

## 2. Goal

Give each person a single home view — **My Work** — that rolls up every active piece of work across every repo/project they touch, sorted by what needs their attention first.

## 3. Non-goals

- Not a team-wide dashboard in v1 — scoped to the individual's own sessions, not a manager's view of others' work.
- Not a replacement for a repo's own detail view — My Work is a jumping-off point, not where deep review happens.
- Not a notifications/inbox system for non-Claude-Code activity (issues, PRs from other people, etc.) — scoped to work the person's own agent sessions produced.

## 4. Core concepts

| Term | Meaning |
|---|---|
| **Work item** | One row in My Work — a session/worktree in some repo, or a merged/completed piece of work worth surfacing. |
| **Needs you** | The subset of work items where the agent is blocked on the person's input, decision, or review. |
| **Recent** | Work items with activity in a recent time window, regardless of status. |

## 5. Layout

- **Top: "Needs you"** — a short, prioritized list of items where the agent finished a turn and is waiting: a question, a proposed diff, a merge conflict. This is the section that should get looked at first, so it sits above everything else and is never buried under recency.
- **Below: "In progress"** — items actively being worked on right now, across all repos, each showing repo name, branch/worktree, a one-line status, and elapsed time.
- **Further down: "Recently finished"** — completed/merged work from the last N days, so the person can see what got done without hunting through individual repos.
- Each row is a single click away from jumping straight into that session/worktree.

## 6. Content per row

- Repo name + worktree/branch name
- One-line current status ("waiting for your review on the auth refactor," "running tests," "merged 2h ago")
- Diff stat where relevant (`+120 −34`)
- Time since last activity
- Repo/project icon or color tag for fast visual scanning across many rows

## 7. Sorting & filtering

- Default sort: needs-you first, then most recently active.
- Filter by repo/project, or by status (needs you / in progress / done).
- Search across work items by repo name or branch/task name.

## 8. Empty states

- Nothing running anywhere → a plain invitation to start something, not a decorated illustration: "Nothing in progress. Start a session from any repo to see it here."
- Nothing needs you right now, but things are in progress → don't fake an empty "Needs you" section with filler; simply omit the section until something lands in it.

## 9. Edge cases

- A work item's underlying worktree is deleted while it's still shown in "recently finished" → keep the row (it's history), but disable the "jump in" action and label it accordingly.
- Very high session volume (dozens of repos) → collapse older/finished items behind a "show more," never truncate the "needs you" section.
- Same repo, multiple worktrees needing attention → group under the repo but keep each worktree as its own row; don't collapse them into one.

## 10. Open questions

- Should "My Work" support pinning specific items to the top regardless of recency?
- Does this need a lightweight real-time update (rows shifting live) or is a refresh-on-focus enough for v1?
- Cross-device: if someone starts a session on one machine, does My Work show it on another?

## 11. Success signal

"What do I need to look at right now" becomes a single glance at My Work instead of a tour of open tabs.

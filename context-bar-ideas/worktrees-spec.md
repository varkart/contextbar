# Feature Spec: Worktrees

**Status:** Draft — synthesized from whiteboard session
**Owner:** TBD
**Last updated:** 2026-07-09

---

## 1. Problem

Right now, running more than one Claude Code session against the same repo means either:
- blocking on one task before starting the next, or
- manually managing multiple clones/branches yourself to work in parallel.

Both are friction. People want to kick off several pieces of work at once (a bug fix, a refactor, a feature) without them stepping on each other's file state, and without babysitting git by hand.

## 2. Goal

Let a person run multiple isolated Claude Code sessions against the same repo at the same time, each on its own branch and its own working directory (a git worktree), and give them one place to see all of them, check status, and bring finished work back into the main branch.

## 3. Non-goals

- Not a replacement for git itself — worktrees remains a thin, opinionated layer over `git worktree`, not a new VCS.
- Not solving cross-repo orchestration in v1 — one repo at a time.
- Not attempting automatic conflict resolution — conflicts are surfaced, not silently resolved.

## 4. Core concepts

| Term | Meaning |
|---|---|
| **Worktree** | An isolated checkout of the repo on its own branch, with its own Claude Code session running inside it. |
| **Base branch** | The branch a worktree was created from (usually `main`). |
| **Session** | The live Claude Code conversation/agent run happening inside a given worktree. |
| **Merge-back** | The action of bringing a worktree's branch into the base branch. |

## 5. User flow

### 5.1 Creating a worktree
1. From the repo view, person clicks **New worktree**.
2. They name it (or accept an auto-generated name derived from their first prompt) and pick a base branch (defaults to current `main`/`HEAD`).
3. Claude Code provisions the worktree (`git worktree add`) and starts a session inside it.
4. The person is dropped straight into that session, chat-ready.

### 5.2 Working across worktrees
- A **sidebar/rail** lists all active worktrees for the repo, each showing:
  - name/branch
  - live status (working / waiting on you / idle / done)
  - a compact diff stat (`+120 −34`, files touched)
  - last activity timestamp
- Switching worktrees is instant — each keeps its own conversation history and file state; nothing is lost by switching away.
- Notifications badge on a worktree when its agent finishes a turn and is waiting for input while the person is looking elsewhere.

### 5.3 Reviewing a worktree
- Each worktree has a **Diff** view: file tree + unified diff, same review surface regardless of which worktree it's for.
- Person can ask the agent follow-up questions scoped to that worktree without affecting others.

### 5.4 Merging back
1. From a worktree, person clicks **Merge into main** (or the configured base branch).
2. Claude Code runs the merge; if clean, the worktree's branch is merged and the person is asked whether to keep or delete the worktree.
3. If conflicts arise, the person is shown the conflicting files and can either resolve manually or ask the agent to attempt a resolution — this is never automatic/silent.

### 5.5 Cleaning up
- Worktrees can be archived or deleted independently of merging (e.g., abandoning an experiment).
- Deleting a worktree removes the working directory (`git worktree remove`) but the branch stays unless the person also deletes it.

## 6. States a worktree can be in

- **Provisioning** — being created, no session yet.
- **Working** — agent actively running.
- **Waiting on you** — agent has stopped and needs input/approval.
- **Idle** — session open, nothing running, no pending question.
- **Conflicted** — merge was attempted and hit conflicts.
- **Merged** — branch has been merged into base.
- **Archived** — kept for reference, no longer active.

## 7. Edge cases

- Base branch moves ahead while a worktree is in progress → surface a "behind main by N commits" indicator; person can rebase/update on demand, never automatically mid-session.
- Two worktrees touch the same file → no special handling until merge time; conflicts are caught there, not pre-emptively blocked.
- Person closes the app/tab mid-session → worktree and its session state persist; resuming reconnects to the same worktree.
- Deleting a worktree with uncommitted changes → confirm before discarding.

## 8. Open questions

- How many concurrent worktrees should be supported before we warn about resource limits?
- Do worktrees need their own environment/dependency install, or do they share a cache with the main checkout?
- Should merge-back support squash vs. regular merge as a choice, or pick one default?

## 9. Success signal

People start more than one task at a time on the same repo without asking "wait, is this going to clobber my other session?"

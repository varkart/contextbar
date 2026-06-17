---
name: repo-health-scorer
description: Run a comprehensive repository health check, including static analysis, testing, and metrics, and output a scored markdown report.
---

# Repository Health Scorer

**Invoke:** `/repo-health-scorer`

Runs a battery of checks (frontend linting, TypeScript types, Rust clippy, testing, and coverage) to generate a standardized repository health scorecard.

---

## Steps

**1. Run Frontend Checks**
Execute:
- `npm run lint` (or if missing, note it)
- `npx tsc --noEmit`
- `npm run test:coverage` (for Vitest)
- `npm run test:e2e` (Playwright)

**2. Run Backend Checks**
Execute:
- `cd src-tauri && cargo clippy --all-targets --all-features -- -D warnings`
- `cd src-tauri && cargo fmt --check`
- `cd src-tauri && cargo test`

**3. Collect Metrics**
Calculate code lines using `npx sloc src/` and `npx sloc src-tauri/src/`.

**4. Generate Report**
Using the gathered data, create a `repo-health-report.md` structured like this:

- **Date & Time** of the run.
- **IMPORTANT HIGHLIGHT:** Reminder to verify issues on latest branch before fixing.
- **Overall Score** (Out of 100).
- **Detailed Findings** for Architecture, Testing, and Tech Debt.
- **Prioritized Roadmap** of what to fix.

**5. Suggest Action**
Once the report is generated, summarize the top 3 critical issues to the user and ask if they would like you to start resolving the "High Priority" cluster.

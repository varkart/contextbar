---
name: repo-health-scorer
description: Run a comprehensive repository health check, including static analysis, testing, and metrics, and output a scored markdown report. Use when the user asks to "score the repo", "run health check", or "review repository health".
---

# Repository Health Scorer

This skill provides a structured procedural workflow to analyze a project's codebase health, testing reliability, and architectural integrity.

## Execution Steps

Follow these steps precisely:

### Step 1: Execute Static Analysis and Tests
Run the following shell commands in parallel to gather raw data. Do not fix any issues yet; simply collect the outputs.
1. Frontend Types: `npx tsc --noEmit`
2. Frontend Coverage: `npm run test:coverage`
3. Frontend E2E: `npm run test:e2e`
4. Backend Linter: `cd src-tauri && cargo clippy --all-targets --all-features -- -D warnings`
5. Backend Tests: `cd src-tauri && cargo test`
6. Complexity metrics: `npx --yes sloc src/` and `npx --yes sloc src-tauri/src/`

*(Note: if a command like `npm run lint` is missing, just record that fact.)*

### Step 2: Analyze Architectural Code Health
Perform a surgical read of core files (e.g., `src/App.tsx`, `src-tauri/src/lib.rs`, IPC boundaries).
Look for:
- Adherence to SOLID principles.
- Use of clear low-level design patterns (e.g., Factory, Command).
- Clean state management vs. Prop drilling/God objects.
- Coupling of side effects.

### Step 3: Assess Documentation & AI Context
Check for:
- Standard docs (`README.md`, `setup` scripts).
- AI Readiness (`CLAUDE.md`, `GEMINI.md`, `/skills` directories).

### Step 4: Calculate Score and Write Report
Generate a 100-point score across the following 5 pillars (20 points each):
1. Frontend Architecture
2. Backend Architecture
3. Testing & Reliability
4. Documentation & DevEx
5. AI Readiness

Using `write_file`, output a markdown file named `repo-health-report.md` in the root of the project.

It **MUST** contain:
1. **Date & Time** of the run.
2. **IMPORTANT HIGHLIGHT:** Reminder to verify issues on latest branch before fixing.
3. **Overall Score** (Out of 100) and Grade.
4. **Detailed Findings** for each of the 5 pillars.
5. **Prioritized Roadmap** of what to fix, clustered by priority (High/Medium/Low).

### Step 5: Post-Report Action
Once the `repo-health-report.md` is generated, provide the user a concise summary of the Top 3 critical issues discovered and ask if they would like to proceed with the "High Priority" cluster fixes.

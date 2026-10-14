# Completion Gates — HVAC Load Calculator

This document defines the evidence required before the project may be called complete. A code review, a passing unit test, or a generated report alone is not sufficient.

## Non-negotiable reporting rules

- Never report PASS unless the named check was actually executed and its output is available.
- Distinguish `NOT RUN`, `BLOCKED`, `FAIL`, and `PASS`. Missing evidence is not a pass.
- Do not describe a formula or coefficient as an industry standard unless its primary source and applicable edition have been verified.
- Do not claim equivalence with STABRO/SeACD until paired inputs and outputs have been recorded and compared.
- Keep the current `main` branch unchanged until a reviewed change passes the gates below.

## Gate 1 — Reproducible baseline

- Record the exact base commit SHA.
- Install dependencies from the repository lockfile in a clean CI environment.
- Run every existing test suite and record commands, totals, failures, and logs.
- Resolve existing CI failures before using CI as evidence of a new fix.
- Check duplicated calculation logic and run the repository's sync check.

**Exit evidence:** commit SHA, workflow URL, command output, and zero unexplained failures.

## Gate 2 — Calculation source of truth

For each formula, coefficient, correction, and equipment record, record:
- name and units;
- equation / transformation;
- primary source, edition/date, and page or table;
- verified / provisional / not implemented status;
- boundary conditions and rounding rules.

Do not silently replace provisional numbers with guesses. If a primary source cannot be obtained, mark the item blocked and do not claim standards compliance.

## Gate 3 — Reference comparison

Create a fixed test corpus of building cases with identical inputs in this app and the authorized reference application (STABRO/SeACD). Store:
- all input fields and units;
- reference output values and displayed precision;
- this application's output values;
- absolute and relative differences;
- the agreed tolerance and explanation for any permitted difference.

Compare each room and whole-building cooling/heating load, ventilation, equipment selection, and any available cost output separately. Never use a floor-area estimate from a drawing as if it were a measured reference-app output.

**Exit evidence:** completed comparison matrix for all agreed cases, no unexplained differences outside tolerance, and review of all exceptions.

## Gate 4 — Functional and regression tests

- Unit tests for each calculation component and documented formula.
- Boundary tests for zero/missing/extreme values, temperature settings, region, use, floor count, occupancy, and margins.
- Regression tests using the fixed reference corpus.
- Equipment-selection tests for capacity sufficiency, model existence, and rounding.
- Data-integrity tests for source, units, and provisional labels.
- Duplicate-engine synchronization check.

**Exit evidence:** all required tests executed in CI, zero unexplained failures, logs retained.

## Gate 5 — Browser/runtime acceptance

- Deploy the tested commit to a preview environment.
- Open the real application in a browser and complete a documented smoke test.
- Exercise a representative calculation from input through displayed results.
- Verify error handling, persistence/navigation as applicable, and responsive layout.
- Record the tested URL, commit SHA, browser, date, and screenshots/logs.

A build succeeding or a localhost URL existing does not satisfy this gate.

## Gate 6 — Release decision

Release only when Gates 1–5 have evidence and the reviewer explicitly signs off. Otherwise report the exact status and blockers. Never infer completion from elapsed time.

## Status template

- Base / candidate commit:
- Gate 1 reproducible baseline:
- Gate 2 formula/source verification:
- Gate 3 reference comparison:
- Gate 4 regression:
- Gate 5 browser/runtime:
- Gate 6 release decision:
- Blockers / owner / next action:

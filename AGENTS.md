# Working in this repository

How the code should read, for people and coding agents alike. `CONTRIBUTING.md` covers
setup and the checks CI runs.

## Comments

Write a comment only when the code cannot say it:

- why a non-obvious choice was made, especially one that looks wrong
- a constraint from outside the file — an API's version floor, a bundler rule, a silent
  failure mode
- a mistake someone would otherwise repeat

Do not write one that restates the next line, names what a well-named function already
names, explains standard language or framework behaviour, narrates the change
(`// now uses X instead of Y` belongs in the commit message), or lists rejected
alternatives.

Keep them short: a few lines, not an essay. If a block needs fifteen lines of explanation,
fix the design. Delete a stale comment rather than updating it — a comment that has drifted
from the code is believed.

## Simplicity

- Solve the problem in front of you. No option, parameter or abstraction without a caller
  that needs it today.
- Prefer the smallest change that is correct. A helper used once is usually inline code.
- Do not add a code path "just in case". Unreachable or untested branches are deleted, not
  defended.
- When a review finds two bugs with one cause, fix the cause rather than patching each
  symptom.

## TypeScript

- No `any`, except at an untyped library boundary (GrapesJS); keep that cast at the
  boundary, and scope `eslint-disable` to it.
- Prefer types the code already has — `ReturnType`, the SDK's exported types — over
  hand-written duplicates.
- Every promise is awaited, returned or explicitly voided with its rejection handled.
  Fire-and-forget work that matters (a ledger write, a save) is awaited.
- Pass an `AbortSignal` to work that should stop when its consumer stops.
- Do not rely on an event that fires later for state needed now. If a value must be current
  before an `await`, update it synchronously.

## React

- A ref for values read in handlers and effects; state for anything the UI renders,
  including "busy" flags that should disable a control.
- An effect depends on what it uses. When it should run once per event (opening a dialog),
  read changing props through a ref instead of dropping dependencies.
- Components rendered outside the React tree (into GrapesJS) get what they need as props;
  context does not reach them.

## Tests

- A fix comes with a test that fails without it. Check that it does.
- Test the decision, not the framework: pure logic is extracted and tested in Node rather
  than through a rendered canvas.

## Reviewing

A review reports real problems, ordered by severity, each with `file:line`, what goes wrong
and a simpler alternative:

1. correctness — races, lost writes, unawaited promises, error and cancel paths
2. over-engineering — options, helpers or branches nothing needs
3. comments that break the rules above
4. departures from the TypeScript and React rules above

No praise, no restating the diff. If nothing needs changing, say so.

## Language

Code, comments, documentation and commit messages are English.

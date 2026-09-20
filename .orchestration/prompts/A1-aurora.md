You are one of several agents working in parallel on the Peaceful Pursuit site. YOU MAY ONLY EDIT `js/gradient.js`. Do not touch any other file — another agent owns each of them and your edits there will be discarded.

Read `CLAUDE.md` first, then the vault note `D:\Claude\Obsidian\Peaceful Pursuit\files\gradient-js.md` if it exists, then the source.

Reference image (LOOK AT IT with the Read tool — it is a real PNG): `assets/refs/aurora-reference.png`
Current broken state for comparison: `assets/refs/current-dark-main.png`

## Task 1 — Aurora spawn geometry

Right now the night aurora reads as a band flowing left-to-right across the screen. Change it so it matches the reference photo's geometry:

- The curtains must ORIGINATE far from the centre of the screen — spawning high and deep, from a distant vanishing region — and then SPLAY OUTWARD and DOWNWARD, extending deeply toward the left edge and the right edge.
- Think of it as a fan/arch radiating out of a distant point, not a horizontal river. In the reference, ribbons converge toward the upper-middle distance and sweep down to the lower left and lower right, with vertical light-shaft striations hanging beneath them.
- Keep the existing `Dusk` palette tokens (candy orange, pink, plum) — do NOT introduce the reference photo's teal/purple. The geometry is what you're copying, not the colour. Palette reference: `D:\Claude\Obsidian\Peaceful Pursuit\Design-Language.md`.
- Add the hanging vertical striations/light-shafts beneath the curtain edges, since that is the most recognisable part of the reference silhouette.

## Task 2 — Dark mode stability

The hovering aurora lines on the dark main screen are distracting because they move constantly. Fix:

- At rest, the aurora must be effectively STATIC. No perceptible autonomous drift.
- It may only animate in response to pointer hover/movement, and that response must be very slow and nearly unnoticeable — match the easing/feel of how the light-mode day gradient mesh already responds to the pointer in this same file. Read that code path and mirror its time constants.
- Do not simply set the animation speed to zero and leave dead code; keep the implementation clean and readable.

## Constraints
- No build step, no new dependencies, plain JS, matches existing code style and comment voice in the file.
- The file is ~272 lines. Keep it in the same structural shape.
- Verify your changes are syntactically valid (`node --check js/gradient.js`).

When done, output a 4-line summary: what changed, which functions, any risk, and anything the orchestrator should visually verify.

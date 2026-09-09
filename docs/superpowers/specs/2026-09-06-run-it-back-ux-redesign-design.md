# Run It Back UX Redesign — Design Specification

Date: 2026-09-06
Visual direction selected: 2026-09-07
Status: Approved by the user on 2026-09-07

## Summary

Redesign the existing client-side game as an accessible Broadcast Tactical
experience without changing its drafting, rating, simulation, narration, Daily,
Free Play, sharing, provenance, or static-deployment mechanics.

Durable product truth is in `PRODUCT.md`. The complete visual language is in
`DESIGN.md`. Audit evidence and the screen/state/copy specification are in:

- `docs/ux/run-it-back-ux-audit.md`
- `docs/ux/run-it-back-redesign-brief.md`

Those documents are normative inputs to the implementation plan.

## Selected visual direction

The user selected **Live Results Desk**, the recommended Broadcast Tactical
composition, from the Impeccable decision board. The implementation path is
code-led. The selected comp is a critique reference for hierarchy, editorial
rhythm, purposeful density, and visual ambition; it does not authorize copied
assets, fabricated content, or pixel-for-pixel reproduction.

## Selected architecture

Keep domain logic independent from React and preserve the existing state machine.
The redesign changes the presentation layer through small, task-specific
components and adds one versioned active-run storage adapter.

- `GameApp` remains the orchestration boundary for game state, simulation
  presentation, persistence, and screen selection.
- `AppHeader` becomes an opening/in-run shell with progress and safe exit.
- Existing team, player, roster, IGL, tournament, highlight, and results
  components retain their domain inputs and useful semantic/test hooks while
  gaining explicit display states.
- Reusable UI abstractions are limited to repeated primitives proven across
  multiple components: progress/status, buttons, selection state, and visually
  hidden/supporting accessibility text.
- Active-run persistence stores only public game state already present in the
  client. It does not create a backend or make simulation authoritative.

## Data flow

1. Mode start creates the existing seed and draft through `createStartAction`.
2. Every committed reducer state is validated and mirrored to a namespaced,
   versioned active-run localStorage record.
3. Initial load validates that record against the current dataset and restores a
   safe reducer state, or resets only the invalid active record.
4. Presented-but-uncommitted simulation/highlight UI is not persisted as a
   terminal result; on reload, deterministic presentation restarts from the
   current unresolved stage.
5. Completing or explicitly exiting clears the active record. Existing Daily and
   Free Play result persistence remains unchanged.
6. UI components receive derived display labels, open-role fit, progress, and
   control-state explanations without receiving private rating values.

## Error and recovery model

- Exit/mode change during an unfinished run requires a native semantic dialog;
  Cancel is safest and initially focused.
- Storage unavailable keeps the current session playable and states what will
  not persist.
- Invalid active storage resets only that record and preserves completed history.
- Invalid draft/team/role states prefer Back/repair before Restart.
- Opponent or simulation failure preserves the current stage and offers Retry;
  the existing series lock prevents duplicate application.
- React boundary failure retains application identity and a recovery action; an
  active record allows the next mount to restore validated progress.

## Testing strategy

Use test-driven development for every implementation task.

- Component tests assert labels, state descriptions, focus destinations,
  semantics, confirmation behavior, and branch-specific actions.
- Storage and machine tests assert active-run schema validation, record isolation,
  restoration, clearing, and deterministic unresolved-stage recovery.
- E2E tests preserve the existing Daily and Free Play journeys and add reload,
  retry, pause, exact-390px, 320px reflow, long-text, forced-color, reduced-motion,
  and results hierarchy coverage.
- Visual screenshots cover mode selection, team offer, player picker, completed
  roster/IGL, semifinal highlights, eliminated result, and champion result on
  desktop and Pixel 7. Baselines change only after manual intent review.
- Final verification runs lint, typecheck, all unit/component tests, audit CLI,
  static build, and all E2E projects.

## Considered approaches

### A. Broadcast results desk — selected

A persistent rundown and asymmetric editorial grid keep the current decision,
roster, and tournament path visible. It best balances audience recognition,
comparison speed, mobile adaptation, and the user-pinned Broadcast Tactical
direction.

Risk: dense information can become noisy. The design limits each screen to one
primary action and uses a strict type/spacing hierarchy.

### B. Full-screen matchday program

Each choice becomes a large sequential editorial plate with minimal persistent
chrome. It creates ceremony and strong mobile focus.

Risk: repeated drafting becomes slower, roster context recedes, and expert users
pay more navigation cost.

### C. Tactical roster board

The five-slot roster becomes the central canvas, with team and player choices
entering as contextual panels. It makes composition tangible.

Risk: custom spatial interactions raise keyboard, reflow, and implementation
complexity and can obscure the existing simple state machine.

Approach A was selected. It retains the sequential flow while externalizing
strategy and allows the strongest existing tests/component boundaries to survive.

## Scope self-review

- No placeholder copy or unspecified mechanics remain in the linked brief.
- Active-run persistence is the only domain-adjacent addition and stays within
  the existing localStorage architecture.
- No private traits or unsupported claims enter component APIs.
- Every requested screen and resilience state is mapped.
- Accounts, backend services, leaderboards, asset acquisition, and unrelated
  features remain explicitly out of scope.
- User research targets are labeled as hypotheses rather than evidence.

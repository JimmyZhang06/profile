# Stacked conversation suggestions — 2026-11-02

Source release: `141fcea`.
Previous release: `e633c88`.
Public site: https://resume.jimmyzhang.xyz/

## Behavior

Each assistant reply groups multiple revisions into a swipeable deck. One card
is readable at a time, with two quiet backing outlines, a counter and previous/
next controls. A single revision remains a plain card. Native horizontal
scrolling stays inside the deck; ordinary conversation scrolling stays vertical.

Cards retain their original-text comparison when revisited. Switching does not
adopt anything. Adoption, keeping the original, stale/applied states, evidence
navigation and undo continue to use the existing document operations. Inactive
cards are inert and hidden from assistive technology. Arrow keys, Home and End
are supported; explicit navigation respects reduced motion.

The deck measures its current card so long text can use the conversation's
vertical space without another vertical scrollbar. Reviewing pauses automatic
following. Width changes preserve the active card, and vertical scroll offsets
inside the horizontal viewport are reset so headings cannot become clipped.

## Verification

- Production build completed; 38 relevant local tests passed. The loopback
  proxy test was rerun outside the network sandbox after an `EACCES` restriction.
- Browser checks used the real app with fictional, browser-local data and a
  loopback fixture that blocks model/cloud writes. Checked 320px and 390px phone
  layouts and 1440px desktop, light/dark appearance, native horizontal scrolling,
  arrow-button and keyboard navigation, comparison state, adoption, original
  retention, evidence/return navigation, undo and input draft preservation.
- Narrow-screen checks found no page/chat/footer horizontal overflow. Long-card
  titles remained inside the deck after navigation and resizing. No browser
  runtime warnings or errors were reported. Physical iPhone installation and
  touch behavior were not tested; these were responsive browser checks.
- 41 server tests passed as the unprivileged service account. Database backup
  completed before the release symlink changed; service health was verified.
- Public checks at `2026-11-02T08:21:21Z` matched homepage/admin HTML and all six
  built asset hashes. Five PNG icons and the manifest matched; a missing icon
  returned 404 and unauthenticated admin mail access returned 401.

## Deployment

Release archive SHA-256:
`32b33c1a0e866ee4ab4c45c8492ebabbb787c9b57b903c71ec54fb38b2a0e25f`.

`/opt/luli/current` now points to `/opt/luli/releases/141fcea`. The release
contains committed source and the built client; no development fixture, local
workspace, `.data`, environment file, private key or local dependencies were
included. Dependencies and database schema are unchanged. SMTP remains
unconfigured. Existing deployment configuration and other services were retained.

Rollback remains available through the previous release directory. Local visual
evidence and the public verification report are retained outside Git under
`.data/revision-deck-20261102/` in the primary workspace.

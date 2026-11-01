# Prototype Instructions

## Confirmed direction (2026-10-28)

The user rejected six generated dashboard/editor concepts and supplied
../design/reference-chat-canvas.png as the visual reference. Build a restrained
conversation-and-document workspace: a narrow icon rail, conversation on the
left, and a large continuously visible resume canvas on the right. Use quiet
white/gray surfaces and compact rounded toolbars. Keep project materials, JD,
versions, and AI configuration in contextual dialogs rather than permanent
extra panels. Resume text remains directly editable. AI must be optional and
replaceable. This is a local interaction prototype with fictional data and
explicitly labeled simulated suggestions, not a live AI service.

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Product refinement (2026-10-28)

The user now explicitly requires a coherent product experience, custom reusable components, carefully tuned panel sizes and styles, and polished conversation behavior inspired by ChatGPT. Preserve work across reloads, support independent resumes and editable source materials, and handle pending, error, cancel, retry and review states. This requirement supersedes the earlier disposable-demo scope. Do not describe simulated AI as real or call the application production-ready without the necessary validation.

## Readability (2026-10-28)

The user finds the current interface much harder to read than ChatGPT. Prioritize readable screen text over fitting an entire A4 sheet into a narrow pane: use 17px chat text on desktop, at least 16px on mobile, clearly separated paragraphs and proper headings/lists, and darker secondary text. Resume editing defaults to a responsive reading view with unscaled text; retain a separate A4 preview and unchanged print sizing. Avoid shrinking labels to 9–11px or using faint gray for information the user needs to read. Preserve existing documents and source materials.

## Compact controls (2026-10-29)

The user says the left pane, message input and controls above the right preview take too much space. Keep the readable body text but reduce surrounding chrome. Default the chat to 32% of the work area with a 320px minimum; keep navigation collapsed initially. Start the composer at one text line, grow with input, and move shortcuts/material context into menus. Merge the two canvas top bars into one 52px row; keep undo/redo and export visible, with typography and version/history in the overflow menu. Adopt the new layout preferences once for existing workspaces without changing resume data, then retain the user's subsequent panel adjustments.

## Workspace pages (2026-10-29)

The user explicitly does not want functional pages presented as pop-up dialogs. This supersedes the contextual-dialog direction above. Project materials, target job, profile, new resume, settings, history, sources and export occupy the main content area with shared navigation and a compact return-to-resume header. Do not use a modal backdrop, floating page frame or focus trap. Preserve the mounted editor, conversation draft and document state while switching views. Warn about unsaved form changes inline on the page; do not add a confirmation modal. Text editing should use an in-flow area without covering resume content. Small action menus, native file selection and user-invoked browser printing remain controls, not page containers.

## Conversation surface (2026-10-29)

The user asks for a designed AI conversation pane without visible scrollbars. Keep native wheel, touchpad, touch and keyboard scrolling; hide scrollbar chrome in the workspace and input areas. Keep a small return-to-latest control when reading history, and do not pull readers away from earlier messages during generation. Use quiet user bubbles, unboxed assistant prose, clear paragraph rhythm, compact message actions and a one-line expanding composer. Preserve the smaller 32% chat layout, readable body text and non-modal pages. Keep the pane divider understated without a visible grab pill.

## Detailed project archive and JD tailoring (2026-10-29)

The user requires the project library to hold detailed source material so that the same experience can support different JDs. Provide a full-page editor for background, goals, personal responsibilities, actions/decisions, actual results, evidence, challenges, collaboration, reflection and raw notes; preserve legacy resume bullets separately. Allow partial records and later additions without requiring the user to pre-compress the experience into resume copy. Long text fields grow with content, with a bounded height for large records.

Library records are original material. Each resume holds an independent source snapshot plus its own selected project bullets and overrides. Saving a library record must not update existing resumes automatically. Explicitly applying projects can refresh their source snapshots while preserving edited wording; regenerating a JD draft is undoable. Local mode selects recorded actions/results verbatim by JD keywords and must never be labeled semantic AI rewriting. AI returns reviewable suggestions, and adopting them updates only the current resume.

Ordinary chat continues to use JD and current resume points. Detailed/raw material requires an in-workspace review showing the exact model destination, current context, and selectable detail fields before the user sends it. That confirmation is ephemeral and limited to one request; validate destination and scope on both client and server. Do not persist it or automatically reuse detailed-material conversation history. Retrying a detailed optimization returns to the material selection/review flow. All automated and browser verification must use fictional records and local mocks, never a real external model or private source material without authorization.

## Monochrome light and dark appearance (2026-10-29)

The user asks for a unified black-and-white UI with both dark and light modes, grounded in `../design/reference-monochrome.jpg`. Use its charcoal surfaces, quiet borders, soft inset highlights and strong grayscale text hierarchy; preserve the resume-centered layout and compact proportions. Financial dashboard content, decorative cards and colored charts from the reference are outside this request.

All workspace pages and interactive states must use the shared semantic tokens in `src/theme.css`, with component surface refinements in `src/appearance.css`. Do not add isolated blue/green/brown accents or hard-coded light backgrounds. Keep text, borders, selected states, forms, native controls, menus, notices and the readable resume canvas consistent across themes. The sidebar appearance menu offers light, dark and system preferences; save the preference independently from resume data. Apply it before first paint and preserve drafts while switching. Dark tokens apply only to screen media; print output remains white paper with dark text. Keep scrollbar chrome hidden and functional pages non-modal.

## Layout and action placement (2026-10-29)

The user asks for a deliberate review of the entire layout and every action's placement. Organize controls by the object they affect and the next step in the resume workflow. Keep one compact document toolbar over the conversation and canvas, with document management beside its title, JD and project context together, and export at the far right. Display-only controls stay at the canvas bottom. Preserve the 32% adjustable conversation split and readable body sizes; do not introduce another permanent toolbar row on desktop.

In the library, keep selection and project order visible beside the source list on desktop and available in a compact disclosure on narrow screens. Editing original records, selecting them for a resume, and regenerating wording must remain distinct, labeled operations. Detail pages return to their immediate parent, with unsaved changes handled inline. Page actions use a consistent footer and explain the destination; saving a JD can continue directly to project selection. Remove redundant navigation and false selected styles. Verify actual routes, mobile reflow, keyboard access and preservation of drafts after structural changes.

## Brand mark (2026-10-29)

The user finds the generic writing icon insufficiently artistic and asks for a redesigned logo. Use the original monochrome folded-page mark in `src/assets/luli-mark.svg` with the editorial serif 履历 wordmark through `BrandLogo`. Preserve its curved strokes, offset rhythm and diagonal terminals at small sidebar sizes. Keep both light and dark appearances, and do not replace it with a stock writing icon. Logo revisions must stay scoped to the brand assets and their immediate presentation.

## Streaming replies and adjustable preview (2026-10-29)

The user requests a typewriter effect in the conversation, no horizontal scrolling, and a preview width that can be adjusted whenever needed. Smooth newly generated local and model replies through the same cancellable text queue; do not replay saved messages. Stop must immediately discard queued text and incomplete suggestions while keeping the already visible reply. Respect reduced-motion preferences and preserve Unicode graphemes.

Wrap long words, links, inline code and input within the conversation width; hiding a scrollbar alone is insufficient. Provide a generous hit area around the quiet desktop divider, live width feedback, keyboard adjustment and double-click reset. Save the completed adjustment, retain the preferred ratio across reloads, and protect readable minimum widths of both panes. Mobile keeps its conversation/document tabs.

## Preview corner controls (2026-10-29)

The user specifically asks to refine the bottom-right corner. Keep preview controls in a compact in-flow footer with consistent button heights, clear groups and upward-opening menus. Reading mode exposes its current screen text size; A4 mode groups decrease, percentage and increase, with fit-to-width in that menu. Keep focus/restore separate and recognizable. Fit the controls at the minimum preview width and on mobile, use theme tokens, and avoid a floating overlay over document text.

## Assistant identity and thinking motion (2026-10-30)

The user asks to improve the generic sparkle plus 本地整理 identity and use the product logo for a thinking animation. Reuse the original folded-page asset for the assistant and empty-conversation identity. Keep 履历 as the primary identity and the local/model state as quieter readable text. Waiting uses a small breathing motion with a light pass confined to the logo; output uses a gentler pulse. Completion, stop and error must leave the logo still. Combine progress with the identity instead of adding a second three-dot status row. Motion follows real request state, introduces no artificial wait, does not restart on every text chunk, and is disabled for reduced-motion preferences. Keep 本地 wording explicit for local rules, and preserve theme consistency and existing resume content.

## Settings tabs and model selector (2026-10-30)

The user supplied a drawn contour for the settings tabs: the active tab rises from the divider with rounded shoulders, then flows back into the same baseline. Use this contour with neutral theme tokens; the red drawing is an annotation, not a new accent color. Replace the native blue model dropdown in settings with a compact themed listbox, clear current-selection checkmark, keyboard navigation, outside/Escape dismissal and disabled states. Keep these changes scoped to settings and the corresponding reusable controls.

## Resume typography and templates (2026-10-30)

The user wants richer editing on the right: line spacing, manually bolding selected words, more font sizes and attractive resume templates. Provide a collapsible in-flow typography/template inspector; preserve the 52px toolbar, 44px preview footer and adjustable preview width. Dock the inspector alongside wide previews and above narrow previews. Use monochrome light/dark tokens and themed selectors constrained to the panel's scroll bounds.

Distinguish actual document typography (body, section and name sizes, line height, paragraph/section spacing and page margins) from screen-only reading magnification. Real templates must change the document layout, share the document renderer for thumbnails, preserve text/formatting, and support undo. Text-format editing stays in-flow, with selection-preserving bold/italic/underline and local undo/redo. Formatting persists through reloads, versions and backup/import; old backups remain supported. Keep plain text for AI and original project facts unchanged. Store supported formatting marks only, clear stale ranges after text replacement, and carry saved typography into A4/print styles.

## Formatting workspace readability (2026-10-30)

The user finds the expanded typography/templates difficult to read and wasteful of space. This supersedes the inspector docking arrangement above. On desktop, formatting temporarily replaces the mounted conversation with a 288px tool column (312px on wide screens), leaving the document full height. Do not squeeze chat, tools and paper into three columns or stack settings above the paper. Keep the conversation draft and saved split untouched; 完成排版 restores the preceding workspace. Opening the tools starts readable, unscaled reading mode; A4 remains explicitly available.

Group controls into 文字, 间距 and 模板 with readable labels and aligned fields. Template names and descriptions must be legible; selection previews the real document immediately. Thumbnails are secondary layout cues and may be hidden on narrow screens. On mobile, show the document first and a bounded tool area below; hide that area while inline text editing is active. Preserve monochrome themes, native scrolling without scrollbar chrome, and the compact header/footer. Screen margins adapt to available space while still responding to the document margin control.

## Accounts, personal cloud workspaces and administration (2026-10-30)

The user explicitly requested the account/cloud/admin plan to be implemented. This supersedes earlier local-only storage descriptions while preserving the local entry point. The React client now uses an independent Node API in server/cloud. Development defaults to loopback PGlite and a local OTP mailbox; production requires PostgreSQL, HTTPS, SMTP and independent authentication/credential secrets. Do not claim production deployment, real SMTP delivery or physical cross-device validation from local tests alone. See CLOUD.md for startup and deployment details.

Keep invitation-only email OTP, deployment-initialized admin roles and separate 30-minute TOTP/recovery-code grants for admin APIs. An existing authenticator must not be replaceable through the initial setup route. Check active sessions, account status and resource ownership on every private request. Admin APIs must not expose resume, detailed project or conversation bodies. Never return plaintext model credentials; encrypt at rest with an owner/connection-bound AES-GCM key and keep the master key separate from the DB.

Cloud/local accounts and pending drafts must remain isolated. Import requires an explicit target-account review, preserves local originals, appends copies and is idempotent for the same batch. Project-only/profile-only import must work and must not discard a resume containing only a JD or partial fields. Use consistent database snapshots when reading normalized workspace rows, atomic revision checks when writing, and recovery copies before resolving conflicts. Preserve offline drafts and prevent old account uploads after account switching. Stop cache writers before clearing a deleted account.

Keep local rules, platform models and user models as separate sources through the common adapter layer. Cloud model requests require exact HTTPS host allowlists, public/pinned DNS and no redirects. Quotas must reserve atomically for both the account and platform connection. Detailed-material approval remains request-scoped; cloud sync does not grant model-transmission consent. Logs contain metadata only. Template releases are immutable snapshots; publishing/retiring never silently changes existing resumes.

Use full-page account/admin flows, the shared monochrome themes, 208px admin sidebar and 52px topbar. Keep resume previews in normal layout, with responsive controls and inline dirty-form protection. Use fictional records and local mocks for tests. Do not upload real user data or call external models for verification. Development .data files must never be served by Vite or included in static deployment artifacts. Existing Sites deployment configuration and worker files remain separate and unchanged.

## Initial public deployment (2026-10-30)

The user requested GitHub publishing and an Alibaba Cloud deployment, and explicitly deferred SMTP/admin-email configuration. An explicit CLOUD_ENABLED=false release serves browser-local editing without initializing the database, authentication, mail or model proxy. Account and model screens must clearly show unavailable cloud features. Cloud-enabled production must continue to fail closed when required settings are missing; never expose development mailboxes publicly. Preserve existing server websites, use a dedicated unprivileged process and keep private keys, local workspaces and real environment values out of Git and release artifacts.

## Administrator initialization and managed mail (2026-10-31)

The user provided an initial administrator email, requested PostgreSQL on the server, and wants to configure email delivery later inside the admin console. This supersedes SMTP being mandatory at production startup. Production still requires PostgreSQL, HTTPS, administrator identity and independent secrets. Without SMTP, public email login remains disabled and no development mailbox is written. Keep the real administrator address in deployment configuration, not in public source or test fixtures.

First-time setup uses a root-issued, hashed, expiring, single-use initialization code. The user sets their own password and authenticator; do not consume the production setup code or bind a real authenticator during automated verification. Password login is restricted to administrators and requires MFA once enrolled; management always requires a 30-minute verified grant. Public password registration stays blocked. Store SMTP credentials encrypted, mask reads and audit records, pin public DNS destinations, require validated TLS, and send test mail only to the authenticated administrator when explicitly requested through the UI. Use fictional accounts and mocked delivery for automated tests.

## Sidebar account layout (2026-10-31)

The user reported a long account email overflowing into the editor. Keep the account entry within the sidebar: show the current cloud workspace's profile name (or its matching account name) above a quieter, single-line ellipsized email. Preserve the full address in accessible text and a hover title, with account details one click away. Do not show a different signed-in account's name beside a cached workspace owner's email or use a local resume's name as the signed-in identity. Keep the footer from shrinking and separate it from the independently scrolling document list; preserve compact collapsed navigation and both themes.

## Structured personal archive (2026-10-31)

The user found real data entry too restrictive and explicitly requested multiple internships, structured contacts and simpler navigation. Combine personal information and project materials under one Library entry, with basic details, work/internships, education, research and projects as in-page categories. Keep account identity separate from resume contact information; consolidate appearance into Settings. Records support additions, ordering and default inclusion without forcing a long single text field. Preserve partial and legacy data, unknown contact text and independent resume snapshots. Saving archive details must not overwrite existing resumes; applying selected sections requires a visible before/after review and remains undoable. New resumes allow selecting multiple personal records. Rendering, rich-text edits, Markdown, backups, cloud imports, source views and AI suggestions must understand all records, with contacts excluded from model context. Test using fictional records only.

## Visibility and responsive navigation (2026-10-31)

The user requests a full-page review for incomplete display. Medium-width expanded navigation must reflow the editor as well as detail pages; on phones it becomes a full navigation surface, with the editor mounted and its draft retained. Short windows must still allow access to every document and account action through scrolling. Shared action menus render outside clipping ancestors, stay inside the visible viewport, flip vertically when needed, and retain keyboard navigation and focus return. Keep rich-text save/cancel actions visible while only the editable body scrolls. Contact types already identify their values: avoid repeated visible labels, retain accessible names, and give mobile contact values a full-width row. Verify representative flows in both themes at desktop, medium, mobile and short heights; do not claim private/admin or real-device coverage from unauthenticated local checks.

The Library categories must reuse the same `CurvedTabs` component as Settings, including its monochrome curved divider, selected state and keyboard navigation. Keep all five categories visible without horizontal scrolling on narrow screens; counts may become visually secondary or hidden while their accessible labels retain them. Preserve unsaved-change protection when moving between archive records and project selection.

## Resume deletion and recovery (2026-10-31)

The user requests a way to delete resumes. Provide deletion from the document-title menu through an in-page confirmation, then move the whole document to a recoverable Trash. Preserve its content, design, composer, messages, versions and source snapshot; never remove archive originals or other documents. Trash is reachable from the sidebar and supports search and restore-and-open. Deleting the final active resume shows a new-document entry point without silently creating another persisted resume; archive editing remains available but applying to a nonexistent resume is disabled. Archived documents survive cloud sync and backup imports, including blank documents that were explicitly deleted. Stop in-flight generation before deletion and prevent late callbacks from editing archived documents. Permanent deletion and automatic purging are not part of this flow.

## Sidebar hierarchy refinement (2026-10-31)

The user supplied a sidebar screenshot and asks for further refinement. Use compact, flat document rows rather than raised cards; do not reserve a subtitle for missing company data. Provide a row-level rename/delete menu that targets the selected row through the existing dirty-form and deletion-confirmation flow. Search includes resume, company and role with a clear action. Consolidate account identity and the actual workspace saving/sync state in one bottom row, with a separate adjacent Settings button; keep the complete email in accessible text, the hover title and Account details. Preserve the identity/workspace ownership distinction. Keep the 216px desktop sidebar, full-page mobile navigation, short-height scrolling, grayscale themes and existing logo. `src/sidebar.css` owns the refined sidebar presentation.

## Phone workflow redesign (2026-11-01)

The user requests a deliberate mobile redesign and questions the persistent sidebar and Library/formatting buttons. On phones up to 760px, remove the permanent icon rail and let content use the full width. Every workspace surface, including the empty-document state, must offer a labeled navigation button opening the existing full-page resume list. Preserve mounted drafts, dirty-form checks and desktop navigation.

Use explicit Conversation, Resume and Formatting views. On phones, formatting settings and the document preview each occupy the available content area, with visible Preview/Back to settings and Complete actions. This supersedes the earlier bounded 236px mobile inspector. Keep the settings mounted during preview, provide touch-sized number steppers, readable font choices and actual template thumbnails/descriptions. Library categories reuse CurvedTabs with short mobile labels and complete accessible names; make Save materials the primary form action and keep applying to a resume an explicit reviewed step. Preserve both monochrome themes, native scrolling, 44px touch targets and in-flow footers. `src/mobile-workspace.css` owns the phone-specific presentation.

The user additionally identified the six project chapter buttons and the account identity row as cramped on mobile. Use a compact, sticky chapter menu that indicates the currently visible section, and do not autofocus project text fields on phones. In Account, use the matching workspace's name, a separate full-width login-email block and a separate logout action; never shrink the address between avatar and buttons. Mobile navigation open/closed state is ephemeral and independent of the saved desktop sidebar preference. Formatting choice lists may escape the scroll panel on phones while remaining bounded by the visual viewport; keep scrolling and keyboard selection functional at short heights.

## Complete experience reading and chapter contour (2026-11-01)

The user supplied a vertical contour annotation: the left chapter divider continues down the list and curves around the current chapter. Use the neutral `ChapterRail` control for desktop project sections; the red annotation is not an accent color. Preserve the sticky chapter menu on phones and keyboard access in short windows.

Every project, work/internship, education and research record has an explicit complete-preview entry. Render one continuous, full-page reading surface with the record's title, role, dates and all recorded content, including long notes and unsaved draft text. Keep editor state mounted, restore scroll and opener focus, retain dirty-form protection in preview, and never save or update a resume merely by opening a preview. Hidden textareas must not collapse their measured heights. Preview chrome stays compact and uses the existing page header instead of repeating a large visible heading.

Keep resume selection compact: one named row per project, click its name to preview, and use a labeled row menu for reordering/removal. Consolidate JD entry and collapse the method explanation. Conversation references show a restrained excerpt with a complete-experience preview; that view reads the current resume's full block with overrides, marks the cited bullet, and does not expand model context or the selected editing scope. Archive originals and resume snapshots remain independent. `src/experience-reading.css` owns these shared reading and selection refinements.

The user found the first chapter contour unnatural. Keep the continuous line, but use broad, tangent-continuous shoulders and a softly rounded end, with a quiet one-pixel outline. The user subsequently rejected the gray interior: leave the chapter selection transparent with no fill or shadow, using the outline and text weight for emphasis. Avoid a pinched junction, a rectangular protrusion or a heavy enclosed pill; align the chapter numbers and labels with comfortable inner spacing.

## Account side panel and personal avatars (2026-11-01)

The user requests custom avatars and a half-width account sidebar. This supersedes the full-page account layout only: open Account in a right-edge, full-height, non-modal panel while retaining the mounted workspace, scroll and drafts. Temporarily make the covered workspace inert, with navigation still available on desktop; restore navigation/opener focus when closing. On phones use the available width. Keep the compact header, both monochrome themes and native scrolling without scrollbar chrome. Protect pending avatar crops inline; account/workspace changes must still respect the underlying editor's unsaved-change guard.

Allow image upload, positioning, zoom, save, replacement and removal. Crop locally to a small raster before uploading; store the normalized image on the authenticated account, never in resume content or AI context. Validate format, byte size and decoded dimensions on the server, strip metadata, enforce account ownership, and show a default initial when no avatar exists. Cache only with the matching workspace owner. Use synthetic images and fictional local accounts for tests; do not change the production user's avatar during verification.

The user also requests the mobile resume navigation as a partial-width sidebar. This supersedes the earlier full-page mobile list: use a left-edge drawer up to 320px, always leaving at least 64px of the current page visible. Keep the underlying page mounted and inert while open, with no opaque backdrop or heavy dimming. Close via its button, the exposed page area or Escape, restoring the opener; preserve search, row menus, drafts and short-window scrolling. Desktop navigation retains its existing compact width.

## Home Screen web app identity (2026-11-01)

The user reports the logo missing when saving the site as a phone web app. Supply a linked web app manifest plus explicit Apple touch and standard/maskable PNG icons generated from the existing folded-page mark. Use an opaque monochrome background and preserve the Android mask safe zone; do not redraw or replace the brand. Keep the stable app identity and start URL at `/`, short name 履历, and standalone display. Serve the manifest with its correct MIME type and revalidation, and never return the SPA HTML as a successful missing icon/manifest response. Icon metadata checks do not constitute installation verification on a physical phone. Do not introduce private-data offline caching merely to fix the launcher icon.

The user reports a persistent blurred top edge in the iOS 27 Home Screen app, including immediately after launch. Keep a fixed, opaque app frame with theme-matched page/status-area backgrounds; only inner panels scroll. The frame owns all four system safe-area insets once, including navigation, account, authentication and admin screens. Menus intersect that safe frame with the visual viewport so they avoid the status bar, sensor housing, home indicator and keyboard. Do not hard-code device/version offsets, disable zoom, or add translucent status-bar styling. Preserve ordinary browser layout and print pagination. Responsive/synthetic safe-area checks cannot establish the behavior of iOS system compositing; record physical-device verification separately.

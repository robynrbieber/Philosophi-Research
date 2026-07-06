---
aliases:
  - Philosophi tech doc
status: Working
project: Philosophi
discipline:
type: project
area:
  - Scholarly
origin: Assisted
tags:
  - philosophi
  - technical-plan
links:
  - "[[Philosophi-PRD]]"
  - "[[Philosophi-DESIGN]]"
imgs: []
created: 2026-07-05
modified: 2026-07-05
uid: cf02d122-cde5-47dd-84a7-88a49bc7bb26
cssclasses:
  - project
---

# Philosophi technical plan

## Technical goal

Fork StoryLine with the smallest safe technical changes first. Keep the existing project, view, manager, and Markdown storage architecture intact until Philosophi-specific objects need deeper behavior.

## Fork and repository mechanics

- Fork `PixeroJan/obsidian-storyline` and develop Philosophi in the fork, not in this vault repo. This vault only holds planning docs.
- Set the plugin folder to `philosophi` and keep the StoryLine build toolchain (`esbuild`, `npm run build`, `npm run dev`).
- Change `manifest.json` `id` to `philosophi` so Philosophi can install beside StoryLine without collision.
- Because view type strings and settings keys are namespaced by StoryLine, decide early whether to keep `sl-`/`storyline` internal prefixes for the first pass or rename them. Renaming is cleaner for a standalone fork but breaks any saved workspace referencing old view ids. For phase 1, keep internal ids and only change user-facing strings.
- Track upstream. Keep a remote to StoryLine so upstream fixes can be merged during early phases.

## Vault vocabulary constraint

Philosophi persists notes into a vault that has a controlled vocabulary in `Index/00-Meta/01-Rules/01-controlled-vocabularies.md`. Every stored `type:` Philosophi writes must be one of the vault Writing System types (`writing-project`, `anchor`, `claim`, `evidence-cluster`, `section`, `outline`, `snippet`, `question`) or the core `source` type. Treat this as a hard constraint on the parser and category definitions, not a preference.

## Source architecture summary

StoryLine is a TypeScript Obsidian plugin. The runtime shape is:

- `main.ts`: plugin lifecycle, settings, commands, view registration, project loading, refresh orchestration.
- `constants.ts`: view type constants.
- `components/ViewSwitcher.ts`: top navigation labels.
- `settings.ts`: settings schema, color palettes, default categories, project preferences.
- `models/Scene.ts`: scene data model, status model, beat sheets.
- `models/Codex.ts`: generic category system.
- `services/SceneManager.ts`: project and section file CRUD.
- `services/CodexManager.ts`: Research object CRUD.
- `services/MetadataParser.ts`: scene/section frontmatter parser.
- `views/CodexView.ts`: Research hub UI.
- `views/SceneInspectorView.ts`: sidebar tabs, including the current Research tab.
- `styles.css`: semantic UI colors and surfaces.

## Implementation principles

- Centralize labels before broad string replacement.
- Rename visible UI before changing persisted data.
- Preserve migration paths from StoryLine data.
- Prefer seeded defaults over removing code.
- Hide fiction features before deleting them.
- Keep parser changes explicit and testable.

## Phase 1 files

### Identity

- `manifest.json`
  - Change `id` from `storyline` to `philosophi`.
  - Change `name` to `Philosophi`.
  - Change description to academic writing and research language.
- `package.json`
  - Change package name and description.
- `README.md` and `HELP.md`
  - Replace StoryLine-specific public docs after UI behavior is settled.

### Terminology

Create:

- `terminology.ts`

Initial exports:

- `PLUGIN_NAME = "Philosophi"`
- `project = "Writing project"`
- `scene = "Section"`
- `plotgrid = "Claimgrid"`
- `timeline = "Outline"`
- `plotlines = "Arguments"`
- `manuscript = "Draft"`
- `codex = "Research"`
- `researchSidebar = "Snippets"`

Apply first to:

- `components/ViewSwitcher.ts`
- `main.ts` command names
- `views/*View.ts` display text
- `components/ProjectSelector.ts`
- `components/QuickAddModal.ts`
- `components/ExportModal.ts`
- `components/Inspector.ts`

## Phase 2 files

### Color and surface

Define the brand palette once as base tokens, then remap the existing StoryLine variables to them. This keeps StoryLine variable names working while swapping the actual colors.

Base tokens to add in `styles.css`:

```css
.philosophi-view, .philosophi-root {
  --ph-isabelline: #F4F3EC;
  --ph-bone:       #DCD9CA;
  --ph-grullo:     #B5A486;
  --ph-vandyke:    #5E4330;
  --ph-raisin:     #2C211B;

  --ph-error:      #A83A2C;

  --ph-surface:        var(--ph-isabelline);
  --ph-surface-raised: var(--ph-bone);
  --ph-border:         var(--ph-bone);
  --ph-accent:         var(--ph-vandyke);
  --ph-accent-soft:    var(--ph-grullo);
  --ph-text:           var(--ph-raisin);
  --ph-text-muted:     var(--ph-vandyke);
}
```

`--ph-error` is the only color outside the brand ramp. It maps to StoryLine error and destructive variables. In the dark block, set `--ph-error` to `#D98873`.

Then in `styles.css`:

- Remap `--sl-status-*`, semantic UI variables, role variables, relationship variables, and palette variables to the tokens above or to the status value ramp.
- Set the plugin container background to `--ph-surface` so Isabelline is the base across every Philosophi view. Scope it to the plugin root, not `body`.
- Use `--ph-text-muted` set to Van Dyke for muted text. Do not use Grullo or Bone for body text, they fail contrast on Isabelline.
- Build the status ramp from Bone, Grullo, Van Dyke, Raisin, with two derived mid tones.
- Add a `body.theme-dark .philosophi-view` block that inverts roles (Raisin surface, Van Dyke raised, Grullo accent, Isabelline text) using the same base tokens.
- Map error and destructive StoryLine variables to `--ph-error`. Keep all other semantic states on brand tones plus icons.

`settings.ts`:

- Replace default `colorScheme` if needed so Philosophi ships with the brand palette.
- Replace `COLOR_PALETTES` and sticky note themes with tints and shades derived from the five brand colors if the one-for-one change should affect generated colors.

Do not alter global Obsidian theme variables outside the plugin root.

## Phase 3 files

### Research defaults

- `models/Codex.ts`
  - Add or seed custom category definitions for academic objects.
  - Avoid showing fiction built-ins by default.
- `settings.ts`
  - Change `codexEnabledCategories` default from StoryLine's fiction defaults to Philosophi categories.
  - Keep built-ins available behind settings if useful.
- `views/CodexView.ts`
  - Rename hub labels.
  - Hide Characters and Locations pseudo-tabs by default.
- `components/CodexCategoryTabs.ts`
  - Same pseudo-tab hiding or relabeling.
- `views/SceneInspectorView.ts`
  - Rename Research tab to Snippets.

### Category id equals stored type

In StoryLine a Codex category id becomes the note `type:`. Philosophi must set category ids to the vault-aligned singular types so notes stay interoperable. The display label is separate and can be plural.

| Category id (stored `type:`) | Display label |
|---|---|
| `source` | Sources |
| `claim` | Claims |
| `evidence-cluster` | Evidence |
| `question` | Questions |
| `snippet` | Snippets |
| `outline` | Outlines |
| `voice` | Voices |

Confirm in `models/Codex.ts` and `services/CodexManager.ts` that the category id is what gets written to frontmatter. If StoryLine writes a separate lowercase slug, add a mapping so the persisted `type:` matches the vault vocabulary while the id remains valid for folders and settings.

## Phase 4 files

### Anchor

Add:

- `models/Anchor.ts`
- `services/AnchorManager.ts`
- `views/AnchorView.ts`

Modify:

- `constants.ts`
  - Add `ANCHOR_VIEW_TYPE`.
- `main.ts`
  - Register Anchor view.
  - Add command to open/create anchor.
  - Load anchor for active writing project.
- `components/ViewSwitcher.ts`
  - Decide whether Anchor is a top-level tab or project dashboard entry.

## Anchor storage draft

Use one Markdown note:

```yaml
---
type: anchor
project: Philosophi
question:
problem:
thesis:
confidence:
audience:
lens:
themes: []
word_target:
outlines: []
sections: []
claims: []
evidence: []
questions: []
sources: []
---
```

Use Markdown sections for longer text:

- `## Conversation`
- `## They`
- `## Response`
- `## Takeaway`
- `## Significance`
- `## Included`
- `## Excluded`

### Anchor save mechanics

The anchor view is form-like but never clears. Saving a block writes only that block.

- Scalar and list fields live in frontmatter. Write them with Obsidian's `FileManager.processFrontMatter` so the rest of the file is untouched.
- Long prose fields live in Markdown body sections keyed by heading. On save, replace only the content under that heading, matched by exact heading text, and leave other sections intact.
- Debounce saves per block and save on blur, not on every keystroke, to avoid write storms.
- After save, keep the field rendered and editable. Do not re-render the whole view or move focus.
- Guard against races. Re-read the file before writing when the file changed on disk since load.
- Never rewrite the whole note in one pass. Block-scoped writes are what keep frontmatter and sections from corrupting each other.

## Phase 5 files

### Academic objects

- `models/Codex.ts`
  - Add richer default category field definitions.
- `services/CodexManager.ts`
  - Preserve generic behavior, add academic-specific helpers only where necessary.
- `components/Inspector.ts`
  - Rename section metadata and expose Research links.
- `views/CodexView.ts`
  - Improve object detail views for Claims, Evidence, Sources, Questions, Snippets, and Outlines.

## Phase 6 files

### Views and validation

- `views/PlotgridView.ts`
  - Retune as Claimgrid.
- `views/TimelineView.ts`
  - Retune as Outline.
- `views/StorylineView.ts`
  - Retune as Arguments.
- `views/StatsView.ts`
  - Add academic diagnostics.
- `services/Validator.ts`
  - Add unsupported-claim, orphan-evidence, unresolved-question, and unanchored-section checks.
- `services/ExportService.ts`
  - Add Draft export behavior based on outline order.

## Deferred: paragraph and argument scaffolds

ACE, P.A.T.H.E., LRAS, and split are not phased files yet. When they land, prefer implementing them as inspector helpers or modal drafting aids that write into existing claim, section, or snippet notes. They map to vault scaffold types `ace`, `pathe`, and `split`. Do not model them as new persistent Research categories.

## Testing strategy

Each phase needs:

- `npm run build`
- `npm run lint:obsidian`
- Manual Obsidian smoke test in a sample vault
- Screenshot or video for visible UI phases
- File round-trip test for any parser/storage change

## Risks

- Hardcoded labels are scattered across many files.
- Renaming internal IDs too early can break saved workspaces.
- Custom categories are generic and may need richer academic field definitions.
- Anchor block saving must avoid corrupting frontmatter or Markdown sections.
- Hiding Characters and Locations should not break existing Codex navigation.

## Migration and back-compat

- New work starts in Philosophi. There is no goal to migrate existing StoryLine vaults.
- Keep StoryLine-compatible parser aliases during early phases so a StoryLine vault can still be opened for reference without data loss.
- When `type: scene` becomes `type: section`, provide a one-time optional converter rather than silent rewrites, and only run it on explicit user action.

## Fallbacks

- Keep StoryLine-compatible parser aliases during early phases.
- Hide unwanted fiction tabs before removing code.
- Keep `scene` as internal storage while showing `section` in UI until `type: section` is ready.
- Keep built-in Codex categories disabled, not deleted.


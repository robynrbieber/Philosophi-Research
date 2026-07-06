---
aliases:
  - Philosophi PRD
status: Working
project: Philosophi
discipline:
type: project
area:
  - Scholarly
origin: Assisted
tags:
  - philosophi
  - prd
links:
  - "[[Philosophi-TECH]]"
  - "[[Philosophi-DESIGN]]"
imgs: []
created: 2026-07-05
modified: 2026-07-05
uid: b92909dd-854f-41a0-8825-dc7fecdc4f4d
cssclasses:
  - project
---

# Philosophi PRD

## Summary

Philosophi is a fork of StoryLine for academic research writing. It keeps StoryLine's useful Obsidian-native planning interface, but changes the language, defaults, object model, and visual identity to match Robyn's writing workflow.

## Problem

StoryLine is built around fiction concepts: scenes, characters, locations, plotlines, manuscript, and Codex. Robyn's system uses academic writing objects: anchors, claims, evidence clusters, sections, outlines, snippets, questions, and sources. A direct fiction vocabulary adds friction and makes the tool feel like the wrong environment.

## Goals

- Make the plugin visibly and semantically feel like Philosophi, not StoryLine.
- Preserve the Markdown/YAML-first storage model.
- Replace fiction labels with academic writing labels.
- Make the anchor a first-class persistent form-like view.
- Seed Research categories that match Robyn's system.
- Build in phases so each pass can be reviewed before deeper behavior changes.

## Non-goals

- Do not rewrite the whole plugin at once.
- Do not replace Obsidian pages with an external database.
- Do not use CSS as the main renaming system.
- Do not build Zotero or nodegoat integration in the first pass.
- Do not make anchor fields disappear after save.

## User model

Robyn starts a `writing-project` when research becomes a draft. The anchor is the command object for the piece. Claims, evidence clusters, sections, outlines, snippets, and questions orbit the anchor.

## Core objects

| Object | Product role |
|---|---|
| `writing-project` | Container for the whole piece. |
| `anchor` | Persistent form-like command center for question, problem, thesis, conversation, response, scope, and targets. |
| `claim` | One argument move. |
| `evidence-cluster` | Group of materials supporting a claim or section. |
| `section` | Draft container for one part of the piece. |
| `outline` | Whole-piece structure check. |
| `snippet` | Phrase bank and compost. |
| `question` | Unresolved thinking problem. |

## Alignment with the vault writing system

The vault already defines a controlled vocabulary for these objects in `Index/00-Meta/01-Rules/01-controlled-vocabularies.md`. Philosophi should write the same `type:` values so notes stay interoperable with the rest of the vault and with other tooling.

Vault Writing System types:

`writing-project` · `anchor` · `claim` · `evidence-cluster` · `section` · `outline` · `snippet` · `question`

Vault process scaffolds:

`ace` · `pathe` · `split` · `reading-*`

Rules this creates for Philosophi:

- Stored `type:` values must match the vault vocabulary exactly. Use singular, hyphenated forms such as `claim`, `evidence-cluster`, and `question`.
- Display labels can differ from stored types. A tab can read "Claims" while its notes carry `type: claim`.
- `source` already exists as a core note type in the vault. Philosophi should reuse `type: source`, not invent a new one.
- `Voices` has no vault type yet. If it ships, either add it to the vault vocabulary first or keep it label-only without a new `type`.

## Naming collisions to resolve

Two Philosophi labels reuse words that also name vault object types. Both need an explicit decision before build.

- Outline: the renamed Timeline view is called "Outline", but `outline` is also a whole-piece structure object. Decide whether the nav tab surfaces `outline` objects or is purely a structural view of sections. If they diverge, consider "Structure" for the view or keep the object hidden from that tab.
- Snippets: the renamed sidebar is "Snippets", and `snippet` is also a Research object type. Preferred resolution is to make the Snippets sidebar the capture and browse surface for `snippet` objects so the two reinforce each other rather than compete.

## Rename set

| StoryLine | Philosophi |
|---|---|
| StoryLine | Philosophi |
| Project | Writing project |
| Scene | Section |
| Board | Board |
| Plotgrid | Claimgrid |
| Timeline | Outline |
| Plotlines | Arguments |
| Manuscript | Draft |
| Codex | Research |
| Stats | Stats |
| Export | Export |
| Research sidebar | Snippets |

## Default Research categories

Philosophi should hide the fiction-oriented categories by default and seed academic categories. Each category has a display label and a stored `type:`. The stored type is what matches the vault vocabulary, so it drives interoperability.

Show:

| Display label | Stored type | Vault match |
|---|---|---|
| Sources | `source` | Core note type |
| Claims | `claim` | Writing System |
| Evidence | `evidence-cluster` | Writing System |
| Questions | `question` | Writing System |
| Snippets | `snippet` | Writing System |
| Outlines | `outline` | Writing System |
| Voices | `voice` | Not in vault yet |

Voices is optional. If it ships, add `voice` to the vault vocabulary first or keep it label-only.

Hide:

- Characters
- Locations
- Items
- Creatures
- Lore
- Organizations
- Culture
- Systems

## Anchor MVP requirements

- Anchor has its own top-level view.
- Anchor fields render as editable blocks.
- Save writes each block back to the same anchor note.
- Saved content remains visible and editable.
- The anchor can link to outlines, sections, claims, evidence, questions, and sources.
- Anchor fields support plain Obsidian writing, wikilinks, tags, and normal Markdown.

## Paragraph and argument scaffolds

Robyn's system uses temporary scaffolds at the paragraph and argument level. These are working tools, not permanent notes, and they map to the vault process scaffolds `ace`, `pathe`, and `split`.

- ACE: Assertion, Evidence, Commentary. Plans one analytical paragraph.
- P.A.T.H.E.: Personal, Atmospheric, Thematic, Hypnotic, Epigraph. Designs an opening before the thesis.
- LRAS: Literature Review Argument Synthesis. Turns accumulated reading into an argument position.
- split: Breaks a source into relationships and themes during intake.

These are out of scope for the first passes. They are candidates for a later phase as inspector helpers or claim and section drafting aids. They should never become permanent objects on their own.

## Research-to-draft sequence

Philosophi supports the tail of Robyn's larger sequence, the part where research becomes a draft. Reading, triage, and entity capture happen outside the plugin in Zotero and nodegoat.

Inside Philosophi:

1. Start a writing project.
2. Create or refine the anchor.
3. Break the anchor into claims, one move per claim.
4. Gather support into evidence clusters.
5. Organize claims into sections.
6. Check whole-piece flow with an outline.
7. Store useful language as snippets.
8. Capture unresolved issues as questions.
9. Draft sections and export.

## Development phases

### Phase 1: Identity and terminology

Goal: Create an installable Philosophi fork that still behaves like StoryLine but reads like Robyn's system.

Tasks:

- Change manifest `id`, `name`, and description.
- Rename visible labels and command palette names.
- Centralize terminology in a single module.
- Keep internal view IDs stable unless needed for side-by-side install.
- Rename docs and default UI strings where users see them.

Verification:

- Philosophi installs beside StoryLine.
- Top navigation uses the Philosophi label set.
- Command palette no longer exposes fiction-first labels.

### Phase 2: Visual skin

Goal: Make Philosophi immediately recognizable in Obsidian using the brand palette.

Brand palette:

| Name | Hex | Role |
|---|---|---|
| Isabelline | `#F4F3EC` | Base surface across all Philosophi views |
| Bone | `#DCD9CA` | Raised surface, borders, chips |
| Grullo | `#B5A486` | Secondary fill, soft accent |
| Van Dyke Brown | `#5E4330` | Primary accent, muted text |
| Raisin Black | `#2C211B` | Body text, strong emphasis |

Tasks:

- Set Isabelline as the base surface across every Philosophi view, panel, and sidebar.
- Map structural roles to the five brand colors.
- Apply the surface only to plugin containers, not to Obsidian globally.
- Build the status ramp as a monochrome value ramp from Bone to Raisin Black.
- Keep semantic states monochrome plus icon, with one functional warm red for error and destructive actions (`#A83A2C` light, `#D98873` dark).
- Derive dark mode by inverting roles, no other new hues.

Verification:

- Philosophi surfaces use Isabelline and look distinct from the rest of Obsidian.
- Body text stays readable, using Raisin Black or Van Dyke on light surfaces.
- Status, accent, and alert states remain distinguishable through value and icons.

### Phase 3: Research defaults

Goal: Make the Research hub match academic objects by default.

Tasks:

- Rename Codex to Research.
- Hide fiction pseudo-tabs and built-in categories by default.
- Seed Sources, Claims, Evidence, Questions, Snippets, Outlines, and optional Voices.
- Rename Research sidebar to Snippets.
- Decide whether Voices is hidden or enabled by default.

Verification:

- New projects open Research with academic categories.
- Fiction labels do not appear in normal workflows.

### Phase 4: Anchor MVP

Goal: Add the persistent anchor view.

Tasks:

- Define `type: anchor` note format.
- Add anchor creation and discovery.
- Render anchor fields as editable blocks.
- Save blocks to frontmatter or Markdown sections.
- Link anchor to project and Research objects.

Verification:

- Anchor survives reload.
- Editing a block updates the anchor note.
- The anchor view never clears content after save.

### Phase 5: Academic object behavior

Goal: Move from generic categories to academic objects.

Tasks:

- Add typed field presets for Sources, Claims, Evidence, Questions, Snippets, and Outlines.
- Link claims to evidence clusters and sections.
- Link sources to evidence clusters.
- Support anchor rollups for claims, evidence, questions, and sections.

Verification:

- A user can move from anchor to claim to evidence to section without leaving Philosophi.
- Links are visible and editable.

### Phase 6: Argument views and validation

Goal: Make Philosophi reason about argument structure.

Tasks:

- Tune Claimgrid for claim, evidence, section, and source relationships.
- Tune Arguments view for throughlines of claims and themes.
- Add checks for unsupported claims, orphan evidence, unresolved questions, and sections without anchor links.
- Add draft export tuned for academic writing.

Verification:

- Diagnostics identify real academic workflow gaps.
- Draft export assembles sections in outline order.

## Success criteria

Philosophi is successful when:

- A new writing project opens into Philosophi labels and surfaces, with no fiction vocabulary in the normal workflow.
- The active plugin surface is visually distinct from the rest of Obsidian.
- Research shows academic categories by default and every object stores a vault-aligned `type:`.
- The anchor persists across reloads and never clears content after save.
- Robyn can move anchor to claim to evidence to section to draft without leaving Philosophi.
- Notes created by Philosophi remain valid in the vault without manual frontmatter cleanup.

## Dependencies and assumptions

- Depends on the upstream StoryLine architecture staying close enough to fork cleanly.
- Assumes reading, source triage, and entity capture stay in Zotero and nodegoat.
- Assumes new work starts in Philosophi. Migrating existing StoryLine projects is not a goal.
- Assumes the vault vocabulary is the source of truth for stored `type:` values.

## Open questions

- Should `Claimgrid` be final, or should the UI label be `Claimline`?
- Should the "Outline" nav tab surface `outline` objects, or should it be renamed to avoid the object-type collision?
- Should `Voices` be a default category or optional, and should `voice` be added to the vault vocabulary?
- Should sources live inside Philosophi, Zotero, or both with a link field?
- Should sections use `type: section` immediately or start as renamed scenes?
- Which anchor fields belong in frontmatter versus Markdown body sections?


# Philosophi — Academic Writing Plugin for Obsidian

Philosophi is a fork of [StoryLine](https://github.com/PixeroJan/obsidian-storyline) reframed for scholarly research writing. Organize sections, manage claims and evidence, track arguments, and assemble drafts — all as Markdown in your vault.

---

## Table of Contents

- [Installation](#installation)
- [Getting Started](#getting-started)
- [Terminology](#terminology)
- [Views](#views)
- [Sections](#sections)
- [Inspector](#inspector)
- [Research & Codex](#research--codex)
- [Arguments](#arguments)
- [Export](#export)
- [Settings](#settings)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Fork note](#fork-note)

---

## Installation

### Manual install

1. Copy these three files into your vault at `.obsidian/plugins/philosophi/`:
   - `main.js`
   - `manifest.json`
   - `styles.css`
2. Open Obsidian → **Settings → Community plugins** → enable **Philosophi**.
3. Reload community plugins or restart Obsidian.

### From source

```bash
npm install
npm run build
```

Copy the built files into `.obsidian/plugins/philosophi/` and enable the plugin.

Philosophi can run beside StoryLine (`id: storyline`) — they do not conflict.

---

## Getting Started

1. **Create a writing project** — Click the grid ribbon icon or run **Philosophi: Create new project** from the command palette.
2. Philosophi creates a project folder (default root: `Philosophi/` in settings).
3. Open **Anchor** to set your research question, thesis, stakes, and scope.
4. Add **sections** from the Board or Structure views.
5. Use **Research** for sources, claims, evidence clusters, questions, snippets, and outlines.
6. Draft in **Draft** view and export when ready.

---

## Terminology

| Philosophi label | Meaning |
|------------------|---------|
| Writing project | A book-length research project |
| Section | A unit of draft text (was "scene" in StoryLine) |
| Structure | Section flow and ordering (was "timeline") |
| Arguments | Claim throughlines (was "plotlines") |
| Draft | Manuscript assembly (was "manuscript") |
| Claimgrid | Claim / evidence grid (was "plotgrid") |
| Research | Codex hub for academic object types |
| Snippets | Research sidebar for quick references |

Status labels use an academic workflow: Seed → Framed → Drafting → Written → Revised → Ready.

---

## Views

| Tab | Purpose |
|-----|---------|
| **Board** | Corkboard and kanban for sections and notes |
| **Anchor** | Project command center (question, thesis, scope) |
| **Claimgrid** | Visual claim / evidence grid |
| **Structure** | Section flow, acts, and chapters |
| **Arguments** | Argument throughlines across sections |
| **Draft** | Continuous draft assembly |
| **Research** | Sources, claims, evidence, questions, snippets, outlines |
| **Stats** | Progress, word counts, and diagnostics |
| **Export** | Markdown, Word, PDF, and HTML export |

Use the **Navigator** sidebar for quick section navigation. Open **Section Details** from the navigator to edit metadata in the Inspector.

---

## Sections

- Create sections with **+ New Section** on the Board or Structure views.
- Each section is a Markdown file with frontmatter (status, POV, tags, synopsis, etc.).
- Use **Create New Section** (command palette) for the full creation modal with templates.
- **Split Section** and **Merge Sections** are available from context menus and the Inspector.
- Mark sections **inactive** to hide them from Draft and exports by default.

---

## Inspector

The Inspector sidebar (Section Details) lets you edit:

- Title, subtitle, act, chapter, sequence, status
- POV, characters, location
- Timeline mode, strand, story date/time
- Arguments / tags, synopsis, section draft (body)
- Conflict, emotion, intensity
- Custom fields, setup/payoff links, notes, snapshots

---

## Research & Codex

Default Research categories:

- **Source** — bibliographic references
- **Claim** — assertions to support
- **Evidence cluster** — grouped support for claims
- **Question** — open research questions
- **Snippet** — quotable excerpts
- **Outline** — structural plans

Fiction categories (Characters, Locations) are hidden by default but can be re-enabled in settings.

---

## Arguments

Arguments (tags) color-code sections and appear in the Arguments view. Assign argument tags in the Inspector or creation modal. Colors are managed in **Settings → Arguments Color Scheme**.

---

## Export

Open **Export** from the view switcher or command palette. Options include:

- Draft text in reading order
- Include section titles or numbered sections
- Section separator style (blank line, asterisks, custom)
- Word, PDF, and HTML formats

---

## Settings

Key settings ( **Settings → Philosophi** ):

- **Root folder** — where projects live (default: `Philosophi`)
- **Section Defaults** — default status, sequence, target word count
- **Section Templates** — reusable creation templates
- **Custom Section Fields** — universal metadata fields on every section
- **Display** — default view, color coding, card options
- **Arguments Color Scheme** — palette for argument tags

---

## Keyboard Shortcuts

When a Philosophi view is focused (and focus is not in a text field):

- **Ctrl/Cmd+Z** — Undo last section change
- **Ctrl/Cmd+Shift+Z** or **Ctrl/Cmd+Y** — Redo

Use the command palette (`Ctrl/Cmd+P`) for all Philosophi commands — search "Philosophi".

---

## Fork note

Philosophi inherits StoryLine's architecture (view types, CSS classes, and internal settings keys remain StoryLine-compatible for upstream merges). User-facing labels use the terminology table above. Vault `type:` migration to the full Writing System vocabulary (`writing-project`, `section`, etc.) is planned for a later phase.

For the full upstream StoryLine feature reference, see the [StoryLine repository](https://github.com/PixeroJan/obsidian-storyline).

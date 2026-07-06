---
aliases:
  - Philosophi design doc
status: Working
project: Philosophi
discipline:
type: project
area:
  - Scholarly
origin: Assisted
tags:
  - philosophi
  - design
links:
  - "[[Philosophi-PRD]]"
  - "[[Philosophi-TECH]]"
imgs: []
created: 2026-07-05
modified: 2026-07-05
uid: 14218415-d410-42e4-8dad-7d6fa2621fe
cssclasses:
  - project
---

# Philosophi design plan

## Design goal

Philosophi should feel like an academic thinking environment, not a fiction-planning board. The fork should still feel native to Obsidian, but the active plugin surface should be visually distinct enough that Robyn knows she is working inside Philosophi.

## Naming system

Use short one-word labels where possible.

| StoryLine | Philosophi | Notes |
|---|---|---|
| Board | Board | Keep because it is neutral. |
| Plotgrid | Claimgrid | Best one-word match for claim/evidence mapping. |
| Timeline | Outline | Reframes chronology as structure. |
| Plotlines | Arguments | Reframes threads as argument lines. |
| Manuscript | Draft | Academic drafting language. |
| Codex | Research | Research object hub. |
| Stats | Stats | Keep. |
| Export | Export | Keep. |
| Research sidebar | Snippets | Quick capture and reusable fragments. |
| Scene | Section | Draft unit. |
| Project | Writing project | User-facing label can be two words. |

## Top navigation order

Proposed:

1. Board
2. Claimgrid
3. Outline
4. Arguments
5. Draft
6. Research
7. Stats
8. Export

Anchor is not listed here yet. It may be better as a persistent project dashboard or first tab after Board. Decide after the anchor MVP wireframe.

Two labels here reuse object-type words. "Outline" names both this nav tab and the `outline` object. "Snippets" names both the sidebar and the `snippet` object. See the collision notes below before finalizing labels.

## Research hub defaults

The Research hub should show academic objects, not fiction objects. Labels are user-facing. The stored `type:` is what keeps notes valid in the vault, so each tab is paired with a vault-aligned type.

Primary tabs:

| Tab label | Stored type |
|---|---|
| Sources | `source` |
| Claims | `claim` |
| Evidence | `evidence-cluster` |
| Questions | `question` |
| Snippets | `snippet` |
| Outlines | `outline` |

Optional:

- Voices, stored as `voice`, only if the vault vocabulary gains it first.

Hidden by default:

- Characters
- Locations
- Items
- Creatures
- Lore
- Organizations
- Culture
- Systems

## Anchor interaction model

The anchor is a persistent editable page with form-like blocks.

Principles:

- No submit state.
- No disappearing content.
- Each block remains visible after save.
- Save updates the underlying anchor note.
- The user can still write with Obsidian syntax.
- The UI should make empty fields easy to see without making filled fields feel like a form submission receipt.

Suggested layout:

- Top summary card: question, thesis, confidence, word target.
- Stakes card: problem, significance, audience, lens.
- Argument card: conversation, they, response, takeaway.
- Scope card: included, excluded.
- Linked object card: outlines, sections, claims, evidence, questions, sources.

## Anchor field treatment

| Field type | UI treatment |
|---|---|
| Short scalar | Single-line editable field. |
| Longer prose | Markdown textarea or embedded editor block. |
| Link list | Pill list with autocomplete and add button. |
| Confidence | Dropdown or small scale. |
| Word target | Number field. |
| Themes | Multi-select pills. |

## Anchor empty and filled states

The anchor should invite filling without shaming empty fields.

- Empty field: show a soft placeholder label and a muted outline. No red, no error styling.
- Filled field: show the value as normal editable text with no submit chrome and no "saved" badge that implies the field is now locked.
- Save feedback: a brief, quiet inline confirmation such as a fading check near the block, never a modal or a toast that steals focus.
- Progress: an optional header count of filled versus total fields so the anchor feels like a living workspace rather than a checklist.

## Visual identity

Direction: warm scholarly interface, not neon, not fiction-fantasy. Philosophi uses a single warm monochrome brand palette.

### Brand palette

| Name | Hex | RGB | Value |
|---|---|---|---|
| Isabelline | `#F4F3EC` | 244, 243, 236 | Lightest |
| Bone | `#DCD9CA` | 220, 217, 202 | Light |
| Grullo | `#B5A486` | 181, 164, 134 | Mid |
| Van Dyke Brown | `#5E4330` | 94, 67, 48 | Dark |
| Raisin Black | `#2C211B` | 44, 33, 27 | Darkest |

### Surface

- Isabelline is the base Philosophi surface. It replaces the default white across every Philosophi view, panel, card, and sidebar.
- "Global" here means global to Philosophi, applied to plugin containers only. Do not repaint Obsidian's own chrome or other plugins.
- The point is recognition. When the surface is Isabelline, Robyn knows she is inside Philosophi.
- Bone is the raised surface and separator tone for cards, headers, and hover states that need to lift off Isabelline.

### Color role mapping

The brand set is monochrome, so structural roles map to the five colors. Meaning is carried by value and by icons, not by hue.

| Role | Brand color |
|---|---|
| Surface base | Isabelline `#F4F3EC` |
| Surface raised | Bone `#DCD9CA` |
| Border and divider | Bone `#DCD9CA`, darkened slightly where more separation is needed |
| Secondary fill and soft accent | Grullo `#B5A486` |
| Primary accent, active tab, primary button | Van Dyke Brown `#5E4330` |
| Body text and strong emphasis | Raisin Black `#2C211B` |
| Muted and secondary text | Van Dyke Brown `#5E4330` |
| Error and destructive | Warm red `#A83A2C` light, `#D98873` dark |

### Semantic states

Decided: monochrome plus one functional warm red. The brand palette carries success, warning, info, and neutral through value and icons. Error and destructive actions get one functional warm red so mistakes stay obvious.

Rules:

- Success, info, warning, and neutral use brand tones plus a required icon and label. They never rely on hue alone.
- Error and destructive actions use the warm red below, always paired with an icon or label.
- The warm red is the only color outside the brand ramp. Do not add more functional hues.

Warm red:

| Mode | Hex | Use |
|---|---|---|
| Light | `#A83A2C` | Error text, destructive buttons, invalid field outlines on Isabelline or Bone |
| Dark | `#D98873` | Same roles on the dark Raisin Black surface |

The warm red is chosen to sit next to the browns, not fight them. It reads as a brick tone rather than a neon alert.

## Accessibility and contrast

- Body and secondary text must use Raisin Black or Van Dyke Brown on Isabelline or Bone. These pass WCAG AA for normal text.
- Grullo and Bone are too light for text on Isabelline. Use them for fills, borders, chips, and raised surfaces only, not for body copy.
- On dark chips such as Van Dyke Brown and Raisin Black, use Isabelline for text.
- Do not encode state with color alone. Pair every status and alert with an icon or label, including the warm red error state.
- Verify the warm red passes WCAG AA on Isabelline and Bone in light mode, and the lighter warm red on Raisin Black in dark mode.
- Keep the Isabelline surface consistent so body text stays high contrast during long sessions.
- Confirm the derived dark mode against contrast checks, since inverted roles shift readability.

## Status color direction

Statuses form a monochrome value ramp. Progress reads as darkening, from light Bone to Raisin Black.

| StoryLine status | Philosophi label | Brand tone |
|---|---|---|
| Idea | Seed | Bone `#DCD9CA` |
| Outlined | Framed | Grullo `#B5A486` |
| Draft | Drafting | Mid brown derived between Grullo and Van Dyke |
| Written | Written | Van Dyke Brown `#5E4330` |
| Revised | Revised | Deep brown derived between Van Dyke and Raisin |
| Final | Ready | Raisin Black `#2C211B` |

Two of the six steps are derived because the brand set has four usable ramp anchors. On light chips such as Bone and Grullo use Raisin Black text. On dark chips such as Van Dyke and Raisin use Isabelline text. This should wait until terminology and storage decisions are final.

## Dark mode

The brand palette is light-first. A dark mode is derived by inverting roles, not by adding new hues.

| Role | Brand color |
|---|---|
| Surface base | Raisin Black `#2C211B` |
| Surface raised | Van Dyke Brown `#5E4330` |
| Primary accent | Grullo `#B5A486` |
| Body text | Isabelline `#F4F3EC` |
| Muted text | Bone `#DCD9CA` |

Treat dark mode as derived and confirm it against contrast checks. The primary target is the light Isabelline interface.

## Snippets sidebar

The old Research sidebar becomes Snippets.

Use it for:

- phrase fragments
- useful sentences
- compost text
- quick source reminders
- open mini-questions

Do not make Snippets the main source manager. Sources belong in Research as structured objects.

The Snippets sidebar and the `snippet` Research object should be the same underlying notes. The sidebar is the fast capture and browse surface. Research is the structured library view. This keeps the shared name from meaning two different things.

## Paragraph and argument scaffolds UI

Deferred, but the design intent is to surface ACE and P.A.T.H.E. as short inline helpers when drafting a claim or a section, not as separate pages. They guide structure and then get discarded, matching their role as temporary scaffolds. Keep them out of the main navigation.

## Design questions

- Should Anchor be a top-level tab or the landing dashboard?
- Is `Claimgrid` final, or should it be `Claimline`?
- Should the "Outline" tab be renamed to avoid clashing with the `outline` object type?
- Should `Arguments` include visual lines like StoryLine plotlines, or become a list-first view?
- Should `Voices` appear by default or stay optional?
- Should status labels change in phase 1 or wait for section behavior?


---
aliases: []
status: Working
project: Philosophi
discipline:
type: project
area:
  - Scholarly
origin: Assisted
tags:
  - philosophi
links:
  - "[[Philosophi-PRD]]"
  - "[[Philosophi-TECH]]"
  - "[[Philosophi-DESIGN]]"
imgs: []
created: 2026-07-05
modified: 2026-07-05
uid: f44e0c7b-6552-4e6e-95e6-0d24cd52812b
cssclasses:
  - project
---

# Philosophi progress

## 2026-07-05

- Created the Philosophi project folder.
- Drafted PRD, technical plan, and design plan.
- Captured the initial rename set, Research category defaults, color direction, and anchor MVP concept.

## 2026-07-05 review pass

- Aligned Research category stored types to the vault Writing System vocabulary. Category id equals the stored `type:` and must be singular such as `claim` and `evidence-cluster`.
- Reused `source` for Sources and flagged `voice` as not yet in the vault vocabulary.
- Flagged two naming collisions, "Outline" versus the `outline` object and "Snippets" versus the `snippet` object, with proposed resolutions.
- Added the paragraph and argument scaffolds (ACE, P.A.T.H.E., LRAS, split) as deferred inspector helpers.
- Added the research-to-draft sequence, success criteria, and dependencies to the PRD.
- Added fork and repository mechanics, the vault vocabulary constraint, anchor save mechanics, and a migration note to the technical plan.
- Added anchor empty and filled state design, accessibility and contrast checks, and scaffold UI intent to the design plan.

## 2026-07-05 brand palette

- Set the Philosophi brand palette to Isabelline `#F4F3EC`, Bone `#DCD9CA`, Grullo `#B5A486`, Van Dyke Brown `#5E4330`, Raisin Black `#2C211B`.
- Isabelline is the base Philosophi surface across all views.
- Mapped structural roles to the five colors and defined a monochrome status value ramp.
- Flagged the semantic-state limitation. A monochrome set cannot encode success, warning, error, and info by hue. Recommended keeping one functional error hue.
- Added concrete `--ph-*` CSS tokens and remap guidance to the technical plan.
- Added a derived dark mode by role inversion.

## 2026-07-05 semantic states decided

- Chose monochrome plus one functional warm red for error and destructive actions.
- Warm red is `#A83A2C` in light mode and `#D98873` in dark mode, always paired with an icon or label.
- All other semantic states stay on brand tones plus icons. No other functional hues.
- Added `--ph-error` to the token set and closed the open semantic-state question in the PRD and design plan.


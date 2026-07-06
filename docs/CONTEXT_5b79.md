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
uid: d9413d98-6907-4de5-bf6f-db9aff7702e5
cssclasses:
  - project
---

# Philosophi context

## Source plugin

Philosophi will fork `PixeroJan/obsidian-storyline`, currently a TypeScript Obsidian plugin with Markdown/YAML storage, multiple project views, a Codex hub, export tools, and per-project `System/*.json` state.

## User workflow

Robyn's writing system has 8 typed objects:

- `writing-project`
- `anchor`
- `claim`
- `evidence-cluster`
- `section`
- `outline`
- `snippet`
- `question`

Paragraph and argument scaffolds include ACE, P.A.T.H.E., LRAS, and split.

## Key decision

The first implementation should not rewrite the full plugin. Start with identity, terminology, colors, default Research categories, and a dedicated anchor plan. Deeper parser and object behavior can follow once the renamed fork is usable.


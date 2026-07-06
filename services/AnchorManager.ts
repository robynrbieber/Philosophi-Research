/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call -- Obsidian API */
import { App, TFile, normalizePath, parseYaml } from 'obsidian';
import {
    AnchorData,
    ANCHOR_BODY_SECTIONS,
    emptyAnchor,
} from '../models/Anchor';

function asString(v: unknown): string {
    if (v == null) return '';
    return String(v);
}

function asStringArray(v: unknown): string[] {
    if (Array.isArray(v)) return v.map(String);
    if (typeof v === 'string' && v.trim()) return [v];
    return [];
}

function asNumberOrNull(v: unknown): number | null {
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

function parseBodySection(content: string, heading: string): string {
    const pattern = new RegExp(`^## ${heading}\\s*$`, 'm');
    const match = pattern.exec(content);
    if (!match || match.index === undefined) return '';
    const start = match.index + match[0].length;
    const rest = content.slice(start);
    const nextHeading = rest.search(/^## /m);
    const body = nextHeading === -1 ? rest : rest.slice(0, nextHeading);
    return body.replace(/^\n+/, '').replace(/\n+$/, '');
}

function splitFrontmatter(raw: string): { fm: Record<string, unknown>; body: string } {
    if (!raw.startsWith('---')) return { fm: {}, body: raw };
    const end = raw.indexOf('\n---', 3);
    if (end === -1) return { fm: {}, body: raw };
    const yamlBlock = raw.slice(3, end).trim();
    const body = raw.slice(end + 4).replace(/^\n/, '');
    let fm: Record<string, unknown> = {};
    try {
        const parsed = parseYaml(yamlBlock);
        if (parsed && typeof parsed === 'object') fm = parsed as Record<string, unknown>;
    } catch { /* keep empty */ }
    return { fm, body };
}

export class AnchorManager {
    private app: App;
    private anchor: AnchorData | null = null;

    constructor(app: App) {
        this.app = app;
    }

    getAnchor(): AnchorData | null {
        return this.anchor;
    }

    anchorPathForProject(projectFolder: string): string {
        return normalizePath(`${projectFolder}/Anchor.md`);
    }

    async load(filePath: string): Promise<AnchorData | null> {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) {
            this.anchor = null;
            return null;
        }
        const raw = await this.app.vault.read(file);
        const { fm, body } = splitFrontmatter(raw);
        const data = emptyAnchor(filePath);
        data.project = asString(fm.project) || undefined;
        data.question = asString(fm.question);
        data.problem = asString(fm.problem);
        data.thesis = asString(fm.thesis);
        data.confidence = asString(fm.confidence);
        data.audience = asString(fm.audience);
        data.lens = asString(fm.lens);
        data.themes = asStringArray(fm.themes);
        data.word_target = asNumberOrNull(fm.word_target);
        data.outlines = asStringArray(fm.outlines);
        data.sections = asStringArray(fm.sections);
        data.claims = asStringArray(fm.claims);
        data.evidence = asStringArray(fm.evidence);
        data.questions = asStringArray(fm.questions);
        data.sources = asStringArray(fm.sources);
        for (const sec of ANCHOR_BODY_SECTIONS) {
            (data as Record<string, unknown>)[sec.key] = parseBodySection(body, sec.heading);
        }
        this.anchor = data;
        return data;
    }

    async create(projectFolder: string, projectTitle: string): Promise<AnchorData> {
        const filePath = this.anchorPathForProject(projectFolder);
        const adapter = this.app.vault.adapter;
        if (!await adapter.exists(projectFolder)) {
            await adapter.mkdir(projectFolder);
        }
        const template = `---
type: anchor
project: ${projectTitle}
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

## Conversation

## They

## Response

## Takeaway

## Significance

## Included

## Excluded
`;
        if (!await adapter.exists(filePath)) {
            await adapter.write(filePath, template);
        }
        return (await this.load(filePath))!;
    }

    async saveScalarField(filePath: string, key: string, value: string | number | null): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) return;
        await this.app.fileManager.processFrontMatter(file, (fm) => {
            if (value == null || value === '') {
                delete fm[key];
            } else {
                fm[key] = value;
            }
        });
        if (this.anchor && this.anchor.filePath === filePath) {
            if (key === 'word_target') {
                this.anchor.word_target = value as number | null;
            } else {
                (this.anchor as Record<string, unknown>)[key] = value ?? '';
            }
        }
    }

    async saveListField(filePath: string, key: string, values: string[]): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) return;
        await this.app.fileManager.processFrontMatter(file, (fm) => {
            if (!values.length) {
                fm[key] = [];
            } else {
                fm[key] = values;
            }
        });
        if (this.anchor && this.anchor.filePath === filePath) {
            (this.anchor as Record<string, unknown>)[key] = values;
        }
    }

    async saveBodySection(filePath: string, heading: string, content: string): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) return;
        const raw = await this.app.vault.read(file);
        const { fm, body } = splitFrontmatter(raw);
        const pattern = new RegExp(`^## ${heading}\\s*$`, 'm');
        const match = pattern.exec(body);
        let newBody: string;
        if (!match || match.index === undefined) {
            newBody = body.trimEnd() + `\n\n## ${heading}\n\n${content}\n`;
        } else {
            const start = match.index + match[0].length;
            const rest = body.slice(start);
            const nextHeading = rest.search(/^## /m);
            const before = body.slice(0, start);
            const after = nextHeading === -1 ? '' : rest.slice(nextHeading);
            newBody = before + '\n\n' + content + (after ? '\n' + after : '\n');
        }
        const fmYaml = Object.keys(fm).length
            ? `---\n${JSON.stringify(fm).replace(/^\{|\}$/g, '').replace(/"/g, '').replace(/,/g, '\n').replace(/:/g, ': ')}\n---`
            : '';
        // Re-read and rebuild preserving original frontmatter via processFrontMatter-safe approach
        const fmStart = raw.startsWith('---') ? raw.indexOf('\n---', 3) + 4 : 0;
        const fmBlock = fmStart > 0 ? raw.slice(0, fmStart) : '---\ntype: anchor\n---\n\n';
        const updated = fmBlock.replace(/\n$/, '') + '\n' + newBody.replace(/^\n+/, '');
        await this.app.vault.modify(file, updated.startsWith('---') ? updated : `---\ntype: anchor\n---\n\n${newBody}`);
        const sec = ANCHOR_BODY_SECTIONS.find(s => s.heading === heading);
        if (this.anchor && this.anchor.filePath === filePath && sec) {
            (this.anchor as Record<string, unknown>)[sec.key] = content;
        }
    }

    async saveBodySectionSafe(filePath: string, heading: string, content: string): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) return;
        const raw = await this.app.vault.read(file);
        const fmEnd = raw.startsWith('---') ? raw.indexOf('\n---', 3) : -1;
        const fmBlock = fmEnd !== -1 ? raw.slice(0, fmEnd + 4) : '---\ntype: anchor\n---\n';
        let body = fmEnd !== -1 ? raw.slice(fmEnd + 4).replace(/^\n/, '') : raw;
        const pattern = new RegExp(`^## ${heading}\\s*\\n`, 'm');
        const match = pattern.exec(body);
        if (!match || match.index === undefined) {
            body = body.trimEnd() + `\n\n## ${heading}\n\n${content}\n`;
        } else {
            const start = match.index + match[0].length;
            const rest = body.slice(start);
            const nextHeading = rest.search(/^## /m);
            const after = nextHeading === -1 ? '' : rest.slice(nextHeading);
            body = body.slice(0, match.index) + `## ${heading}\n\n${content}\n` + after;
        }
        await this.app.vault.modify(file, fmBlock + '\n' + body);
        const sec = ANCHOR_BODY_SECTIONS.find(s => s.heading === heading);
        if (this.anchor && this.anchor.filePath === filePath && sec) {
            (this.anchor as Record<string, unknown>)[sec.key] = content;
        }
    }
}

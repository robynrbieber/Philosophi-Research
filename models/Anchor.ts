/**
 * Anchor data model — persistent command center for a writing project.
 */

export type AnchorConfidence = 'low' | 'medium' | 'high' | '';

export interface AnchorData {
    filePath: string;
    project?: string;
    question: string;
    problem: string;
    thesis: string;
    confidence: AnchorConfidence | string;
    audience: string;
    lens: string;
    themes: string[];
    word_target: number | null;
    outlines: string[];
    sections: string[];
    claims: string[];
    evidence: string[];
    questions: string[];
    sources: string[];
    conversation: string;
    they: string;
    response: string;
    takeaway: string;
    significance: string;
    included: string;
    excluded: string;
}

export const ANCHOR_BODY_SECTIONS = [
    { key: 'conversation', heading: 'Conversation' },
    { key: 'they', heading: 'They' },
    { key: 'response', heading: 'Response' },
    { key: 'takeaway', heading: 'Takeaway' },
    { key: 'significance', heading: 'Significance' },
    { key: 'included', heading: 'Included' },
    { key: 'excluded', heading: 'Excluded' },
] as const;

export const ANCHOR_SCALAR_FIELDS = [
    'question', 'problem', 'thesis', 'confidence', 'audience', 'lens',
] as const;

export const ANCHOR_LIST_FIELDS = [
    'themes', 'outlines', 'sections', 'claims', 'evidence', 'questions', 'sources',
] as const;

export function emptyAnchor(filePath: string): AnchorData {
    return {
        filePath,
        question: '',
        problem: '',
        thesis: '',
        confidence: '',
        audience: '',
        lens: '',
        themes: [],
        word_target: null,
        outlines: [],
        sections: [],
        claims: [],
        evidence: [],
        questions: [],
        sources: [],
        conversation: '',
        they: '',
        response: '',
        takeaway: '',
        significance: '',
        included: '',
        excluded: '',
    };
}

export function countFilledFields(anchor: AnchorData): { filled: number; total: number } {
    const scalarCount = ANCHOR_SCALAR_FIELDS.filter(k => String(anchor[k] ?? '').trim()).length;
    const listCount = ANCHOR_LIST_FIELDS.filter(k => (anchor[k] as string[]).length > 0).length;
    const bodyCount = ANCHOR_BODY_SECTIONS.filter(s => String(anchor[s.key as keyof AnchorData] ?? '').trim()).length;
    const hasWordTarget = anchor.word_target != null && anchor.word_target > 0 ? 1 : 0;
    const filled = scalarCount + listCount + bodyCount + hasWordTarget;
    const total = ANCHOR_SCALAR_FIELDS.length + ANCHOR_LIST_FIELDS.length + ANCHOR_BODY_SECTIONS.length + 1;
    return { filled, total };
}

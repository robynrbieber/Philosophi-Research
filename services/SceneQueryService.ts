import { Scene, SceneFilter, SortConfig, SortField, STATUS_ORDER, getStatusOrder } from '../models/Scene';
import { compareActChapter } from '../utils/actChapter';

/**
 * Read-only interface for accessing the scene store.
 * SceneManager implements this so SceneQueryService can read scenes
 * without a circular dependency on the full SceneManager class.
 */
export interface ISceneStore {
    getAllScenes(): Scene[];
    getScene(filePath: string): Scene | undefined;
    /** Raw iterator over all scenes */
    sceneValues(): Iterable<Scene>;
    /** Monotonically increasing version — bumped on every mutation */
    readonly cacheVersion: number;
}

/**
 * SceneQueryService — extracted from SceneManager.
 *
 * Provides read-only querying, filtering, sorting, aggregation,
 * and statistics over the scene data. Has no vault write access.
 */
export class SceneQueryService {
    private _lastFilterKey = '';
    private _lastVersion = -1;
    private _lastResult: Scene[] = [];

    constructor(private sceneStore: ISceneStore) {}

    /** Build a cheap cache key from filter+sort objects */
    private computeFilterKey(filter?: SceneFilter, sort?: SortConfig): string {
        return JSON.stringify([filter ?? null, sort ?? null]);
    }

    /**
     * Apply filters and sorting to scenes (memoized by filter+sort+version)
     */
    getFilteredScenes(filter?: SceneFilter, sort?: SortConfig): Scene[] {
        const version = this.sceneStore.cacheVersion;
        const key = this.computeFilterKey(filter, sort);
        if (key === this._lastFilterKey && version === this._lastVersion) {
            return this._lastResult;
        }

        let scenes = this.sceneStore.getAllScenes();

        if (filter) {
            scenes = scenes.filter(scene => this.matchesFilter(scene, filter));
        }

        if (sort) {
            scenes = this.sortScenes(scenes, sort);
        } else {
            scenes.sort((a, b) => (a.sequence ?? 9999) - (b.sequence ?? 9999));
        }

        this._lastFilterKey = key;
        this._lastVersion = version;
        this._lastResult = scenes;
        return scenes;
    }

    /**
     * Get scenes grouped by a field (for board view columns).
     *
     * `field` may be one of the built-in keys (`act`, `chapter`, `status`, `pov`)
     * or a custom-field reference `cf:<templateId>`. Custom-field values that are
     * arrays (multi-select) place the scene in every matching group.
     */
    getScenesGroupedBy(
        field: string,
        filter?: SceneFilter,
        sort?: SortConfig
    ): Map<string, Scene[]> {
        const scenes = this.getFilteredScenes(filter, sort);
        const groups = new Map<string, Scene[]>();

        const isCustom = field.startsWith('cf:');
        const customId = isCustom ? field.slice(3) : '';

        const push = (key: string, scene: Scene) => {
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(scene);
        };

        for (const scene of scenes) {
            if (isCustom) {
                const raw = scene.universalFields?.[customId];
                if (Array.isArray(raw) && raw.length > 0) {
                    for (const v of raw) push(String(v), scene);
                } else if (typeof raw === 'string' && raw.trim()) {
                    push(raw, scene);
                } else {
                    push('(empty)', scene);
                }
                continue;
            }

            let key: string;
            switch (field) {
                case 'act':
                    key = scene.act !== undefined ? `Act ${scene.act}` : 'No Act';
                    break;
                case 'chapter':
                    key = scene.chapter !== undefined ? `Chapter ${scene.chapter}` : 'No Chapter';
                    break;
                case 'status':
                    key = scene.status || 'No Status';
                    break;
                case 'pov':
                    key = scene.pov || 'No POV';
                    break;
                default:
                    key = 'Unknown';
            }
            push(key, scene);
        }

        return groups;
    }

    /**
     * Get scenes grouped by field, including empty groups for defined acts/chapters.
     *
     * @param definedActs  — acts defined on the project (from SceneManager.getDefinedActs)
     * @param definedChapters — chapters defined on the project
     */
    getScenesGroupedByWithEmpty(
        field: string,
        filter?: SceneFilter,
        sort?: SortConfig,
        definedActs?: number[],
        definedChapters?: number[]
    ): Map<string, Scene[]> {
        const groups = this.getScenesGroupedBy(field, filter, sort);

        // Add empty groups for defined acts/chapters
        if (field === 'act' && definedActs) {
            for (const act of definedActs) {
                const key = `Act ${act}`;
                if (!groups.has(key)) {
                    groups.set(key, []);
                }
            }
        } else if (field === 'chapter' && definedChapters) {
            for (const ch of definedChapters) {
                const key = `Chapter ${ch}`;
                if (!groups.has(key)) {
                    groups.set(key, []);
                }
            }
        }

        return groups;
    }

    /**
     * Get unique values for a field (for filter dropdowns)
     */
    getUniqueValues(field: 'act' | 'chapter' | 'pov' | 'status' | 'emotion' | 'location'): string[] {
        const values = new Set<string>();
        for (const scene of this.sceneStore.sceneValues()) {
            const val = scene[field];
            if (val !== undefined && val !== null) {
                values.add(String(val));
            }
        }
        const arr = Array.from(values);
        // Act and chapter are numeric-or-string and need a numeric-aware
        // sort so "10" sorts after "2" (lexical sort gets it wrong) and
        // hierarchical names like "1.1" / "1.10" / "2.1" stay in order.
        // Other fields (pov, status, emotion, location) use locale string
        // sort.
        if (field === 'act' || field === 'chapter') {
            return arr.sort(compareActChapter);
        }
        return arr.sort((a, b) => a.localeCompare(b));
    }

    /**
     * Get all unique characters across scenes
     */
    getAllCharacters(): string[] {
        const seen = new Map<string, string>(); // lowercased → original
        for (const scene of this.sceneStore.sceneValues()) {
            if (scene.characters) {
                scene.characters.forEach(c => {
                    const key = c.toLowerCase();
                    if (!seen.has(key)) seen.set(key, c);
                });
            }
            if (scene.pov) {
                const key = scene.pov.toLowerCase();
                if (!seen.has(key)) seen.set(key, scene.pov);
            }
        }
        return Array.from(seen.values()).sort((a, b) =>
            a.toLowerCase().localeCompare(b.toLowerCase())
        );
    }

    /**
     * Get all unique tags
     */
    getAllTags(): string[] {
        const tags = new Set<string>();
        for (const scene of this.sceneStore.sceneValues()) {
            if (scene.tags) {
                scene.tags.forEach(t => tags.add(t));
            }
        }
        return Array.from(tags).sort();
    }

    /**
     * Get project statistics
     */
    getStatistics() {
        const scenes = this.sceneStore.getAllScenes();
        const totalScenes = scenes.length;
        const statusCounts: Record<string, number> = {};
        let totalWords = 0;
        let totalTargetWords = 0;
        const actCounts: Record<string, number> = {};
        const povCounts: Record<string, number> = {};
        const locationCounts: Record<string, number> = {};
        let orphanedScenes = 0;

        for (const scene of scenes) {
            // Status
            const status = scene.status || 'unknown';
            statusCounts[status] = (statusCounts[status] || 0) + 1;

            // Words
            totalWords += scene.wordcount || 0;
            totalTargetWords += scene.target_wordcount || 0;

            // Acts
            const act = scene.act !== undefined ? `Act ${scene.act}` : 'No Act';
            actCounts[act] = (actCounts[act] || 0) + 1;

            // POV
            if (scene.pov) {
                povCounts[scene.pov] = (povCounts[scene.pov] || 0) + 1;
            }

            // Locations
            if (scene.location) {
                locationCounts[scene.location] = (locationCounts[scene.location] || 0) + 1;
            }

            // Orphaned (no tags, no connections)
            if (!scene.tags?.length && !scene.pov) {
                orphanedScenes++;
            }
        }

        return {
            totalScenes,
            statusCounts,
            totalWords,
            totalTargetWords,
            actCounts,
            povCounts,
            locationCounts,
            orphanedScenes,
        };
    }

    // ── Private helpers ────────────────────────────────────

    private matchesFilter(scene: Scene, filter: SceneFilter): boolean {
        if (filter.status?.length && (!scene.status || !filter.status.includes(scene.status))) {
            return false;
        }
        if (filter.act?.length) {
            const sceneAct = scene.act !== undefined ? String(scene.act) : '';
            if (!filter.act.map(String).includes(sceneAct)) return false;
        }
        if (filter.chapter?.length) {
            const sc = scene.chapter !== undefined ? String(scene.chapter) : '';
            if (!filter.chapter.map(String).includes(sc)) return false;
        }
        if (filter.pov?.length && (!scene.pov || !filter.pov.includes(scene.pov))) {
            return false;
        }
        if (filter.characters?.length) {
            if (!scene.characters || !filter.characters.some(c => scene.characters!.includes(c))) {
                return false;
            }
        }
        if (filter.locations?.length && (!scene.location || !filter.locations.includes(scene.location))) {
            return false;
        }
        if (filter.tags?.length) {
            if (!scene.tags || !filter.tags.some(t => scene.tags!.includes(t))) {
                return false;
            }
        }
        if (filter.customFields) {
            for (const [tplId, accepted] of Object.entries(filter.customFields)) {
                if (!accepted || accepted.length === 0) continue;
                const raw = scene.universalFields?.[tplId];
                const sceneVals: string[] = Array.isArray(raw)
                    ? raw.map(String)
                    : (typeof raw === 'string' && raw.trim() ? [raw] : []);
                if (!sceneVals.some(v => accepted.includes(v))) return false;
            }
        }
        if (filter.searchText) {
            const searchLower = filter.searchText.toLowerCase();
            const searchIn = [
                scene.title,
                scene.conflict,
                scene.emotion,
                scene.pov,
                scene.location,
                ...(scene.characters || []),
                ...(scene.tags || []),
            ].filter(Boolean).join(' ').toLowerCase();
            if (!searchIn.includes(searchLower)) return false;
        }
        return true;
    }

    private sortScenes(scenes: Scene[], sort: SortConfig): Scene[] {
        const dir = sort.direction === 'asc' ? 1 : -1;
        return scenes.sort((a, b) => {
            let cmp = 0;
            switch (sort.field) {
                case 'sequence':
                    // Multi-key sort: act → chapter → sequence (reading order)
                    cmp = Number(a.act ?? 0) - Number(b.act ?? 0);
                    if (cmp === 0) cmp = Number(a.chapter ?? 0) - Number(b.chapter ?? 0);
                    if (cmp === 0) cmp = (a.sequence ?? 9999) - (b.sequence ?? 9999);
                    break;
                case 'chronologicalOrder':
                    cmp = (a.chronologicalOrder ?? a.sequence ?? 9999) - (b.chronologicalOrder ?? b.sequence ?? 9999);
                    break;
                case 'title':
                    cmp = (a.title || '').localeCompare(b.title || '');
                    break;
                case 'status': {
                    const statusOrder = getStatusOrder();
                    cmp = statusOrder.indexOf(a.status || 'idea') - statusOrder.indexOf(b.status || 'idea');
                }
                    break;
                case 'act':
                    cmp = Number(a.act ?? 0) - Number(b.act ?? 0);
                    break;
                case 'chapter':
                    // Multi-key sort: act → chapter → sequence (reading order)
                    cmp = Number(a.act ?? 0) - Number(b.act ?? 0);
                    if (cmp === 0) cmp = Number(a.chapter ?? 0) - Number(b.chapter ?? 0);
                    if (cmp === 0) cmp = (a.sequence ?? 9999) - (b.sequence ?? 9999);
                    break;
                case 'wordcount':
                    cmp = (a.wordcount ?? 0) - (b.wordcount ?? 0);
                    break;
                case 'modified':
                    cmp = (a.modified || '').localeCompare(b.modified || '');
                    break;
            }
            return cmp * dir;
        });
    }
}

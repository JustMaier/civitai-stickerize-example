/**
 * Safely parse characterIds JSON string to array
 * Returns empty array on parse failure
 */
export function parseCharacterIds(json: string): string[] {
    try {
        const parsed = JSON.parse(json);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

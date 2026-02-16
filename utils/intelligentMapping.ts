/**
 * Intelligent Column Mapping Utility
 * Uses fuzzy matching and semantic similarity to auto-map Excel columns to database fields
 */

interface MatchScore {
    sourceHeader: string;
    targetField: string;
    score: number;
    reason: string;
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= str2.length; i++) {
        matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
        for (let j = 1; j <= str1.length; j++) {
            if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }

    return matrix[str2.length][str1.length];
}

/**
 * Calculate similarity score (0-1) using Levenshtein distance
 */
function similarityScore(str1: string, str2: string): number {
    const maxLen = Math.max(str1.length, str2.length);
    if (maxLen === 0) return 1.0;
    const distance = levenshteinDistance(str1, str2);
    return 1 - distance / maxLen;
}

/**
 * Normalize string for comparison
 */
function normalize(str: string): string {
    return str
        .toLowerCase()
        .replace(/[_\s-]+/g, '') // Remove separators
        .replace(/[^a-z0-9]/g, ''); // Remove special chars
}

/**
 * Extract meaningful tokens from a field name
 */
function extractTokens(str: string): string[] {
    // Split on common separators and camelCase
    const tokens = str
        .replace(/([a-z])([A-Z])/g, '$1 $2') // Split camelCase
        .split(/[_\s-]+/)
        .map(t => t.toLowerCase())
        .filter(t => t.length > 0);

    return tokens;
}

/**
 * Common field name synonyms for semantic matching
 */
const SYNONYMS: Record<string, string[]> = {
    'id': ['identifier', 'number', 'num', 'no', 'code', 'key'],
    'name': ['title', 'label', 'description', 'desc'],
    'email': ['mail', 'emailaddress', 'emailid'],
    'phone': ['telephone', 'tel', 'mobile', 'contact', 'phonenumber'],
    'date': ['dt', 'datetime', 'timestamp', 'time'],
    'address': ['addr', 'location', 'street'],
    'first': ['fname', 'firstname', 'givenname'],
    'last': ['lname', 'lastname', 'surname', 'familyname'],
    'employee': ['emp', 'worker', 'staff', 'personnel'],
    'department': ['dept', 'division', 'unit'],
    'salary': ['wage', 'pay', 'compensation', 'amount'],
    'status': ['state', 'condition', 'flag'],
    'type': ['kind', 'category', 'class'],
    'start': ['begin', 'from', 'commenced'],
    'end': ['finish', 'to', 'completed'],
    'active': ['enabled', 'current', 'valid'],
    'created': ['added', 'inserted', 'registered'],
    'modified': ['updated', 'changed', 'edited'],
    'company': ['organization', 'org', 'business', 'firm'],
    'customer': ['client', 'account', 'buyer'],
    'vendor': ['supplier', 'provider', 'seller'],
    'invoice': ['bill', 'receipt', 'statement'],
    'amount': ['value', 'total', 'sum', 'price', 'cost']
};

/**
 * Check if two tokens are semantically similar
 */
function areSynonyms(token1: string, token2: string): boolean {
    if (token1 === token2) return true;

    for (const [key, synonyms] of Object.entries(SYNONYMS)) {
        const allTerms = [key, ...synonyms];
        if (allTerms.includes(token1) && allTerms.includes(token2)) {
            return true;
        }
    }

    return false;
}

/**
 * Calculate semantic similarity between two field names
 */
function semanticSimilarity(source: string, target: string): number {
    const sourceTokens = extractTokens(source);
    const targetTokens = extractTokens(target);

    let matchCount = 0;
    const maxTokens = Math.max(sourceTokens.length, targetTokens.length);

    if (maxTokens === 0) return 0;

    // Check for synonym matches
    for (const sToken of sourceTokens) {
        for (const tToken of targetTokens) {
            if (areSynonyms(sToken, tToken)) {
                matchCount++;
                break;
            }
        }
    }

    return matchCount / maxTokens;
}

/**
 * Intelligent auto-mapping algorithm
 */
export function intelligentAutoMap(
    sourceHeaders: string[],
    targetFields: Array<{ id: string; label: string; column_name: string }>,
    columnDensity?: Record<string, number> // Optional: % of non-null values (0-1)
): Record<string, string | undefined> {
    const mappings: Record<string, string | undefined> = {};
    const usedHeaders = new Set<string>();

    // Calculate scores for all possible combinations
    const allScores: MatchScore[] = [];

    for (const field of targetFields) {
        for (const header of sourceHeaders) {
            if (usedHeaders.has(header)) continue;

            const normalizedHeader = normalize(header);
            const normalizedLabel = normalize(field.label);
            const normalizedColumn = normalize(field.column_name);

            let score = 0;
            let reason = '';

            // 1. Exact match (highest priority)
            if (normalizedHeader === normalizedLabel || normalizedHeader === normalizedColumn) {
                score = 1.0;
                reason = 'Exact match';
            }
            // 2. Substring match
            else if (normalizedHeader.includes(normalizedLabel) || normalizedLabel.includes(normalizedHeader) ||
                normalizedHeader.includes(normalizedColumn) || normalizedColumn.includes(normalizedHeader)) {
                score = 0.9;
                reason = 'Substring match';
            }
            // 3. Fuzzy string similarity
            else {
                const labelSimilarity = similarityScore(normalizedHeader, normalizedLabel);
                const columnSimilarity = similarityScore(normalizedHeader, normalizedColumn);
                const maxSimilarity = Math.max(labelSimilarity, columnSimilarity);

                // 4. Semantic similarity
                const labelSemantic = semanticSimilarity(header, field.label);
                const columnSemantic = semanticSimilarity(header, field.column_name);
                const maxSemantic = Math.max(labelSemantic, columnSemantic);

                // Combine fuzzy and semantic scores
                score = Math.max(maxSimilarity * 0.6 + maxSemantic * 0.4, maxSemantic);

                if (score >= 0.7) {
                    reason = maxSemantic > 0.5 ? 'Semantic match' : 'Fuzzy match';
                }
            }

            // 5. Data Density Boost
            // If we have density stats, boost the score for columns that have data
            if (columnDensity && columnDensity[header] !== undefined) {
                const density = columnDensity[header];
                if (score > 0.6) {
                    // Small boost for dense columns to break ties
                    // If density is 100% -> +0.1
                    // If density is 0% -> +0.0
                    score += density * 0.15;
                    if (density > 0.8) reason += ' (High Density)';
                }
            }

            if (score >= 0.6) { // Threshold for considering a match
                allScores.push({
                    sourceHeader: header,
                    targetField: field.id,
                    score,
                    reason
                });
            }
        }
    }

    // Sort by score (highest first)
    allScores.sort((a, b) => b.score - a.score);

    // Assign mappings (greedy approach - best matches first)
    const assignedFields = new Set<string>();

    for (const match of allScores) {
        if (!usedHeaders.has(match.sourceHeader) && !assignedFields.has(match.targetField)) {
            mappings[match.targetField] = match.sourceHeader;
            usedHeaders.add(match.sourceHeader);
            assignedFields.add(match.targetField);

            console.log(`✓ Mapped "${match.sourceHeader}" → "${match.targetField}" (${match.reason}, score: ${match.score.toFixed(2)})`);
        }
    }

    // Assign undefined to unmapped fields
    for (const field of targetFields) {
        if (!mappings[field.id]) {
            mappings[field.id] = undefined;
        }
    }

    return mappings;
}

/**
 * Get mapping statistics
 */
export function getMappingStats(
    mappings: Record<string, string | undefined>
): { total: number; mapped: number; unmapped: number; percentage: number } {
    const total = Object.keys(mappings).length;
    const mapped = Object.values(mappings).filter(v => v !== undefined).length;
    const unmapped = total - mapped;
    const percentage = total > 0 ? (mapped / total) * 100 : 0;

    return { total, mapped, unmapped, percentage };
}

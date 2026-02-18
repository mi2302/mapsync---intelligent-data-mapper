/**
 * Data Merging Utility
 * Merges multiple datasets based on common identifier keys.
 */

// Common keys that might represent a unique identifier
const COMMON_KEYS = [
    'id', 'employee id', 'emp id', 'emp_id', 'employee_id',
    'email', 'email address', 'mail',
    'code', 'key', 'reference', 'ref'
];

/**
 * Standardize key for comparison (lowercase, remove special chars)
 */
const standardizeKey = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Find the best common key between two lists of headers
 */
export function findMergeKey(headers1: string[], headers2: string[]): string | null {
    // 1. Check for intersection of headers
    const commonHeaders = headers1.filter(h1 =>
        headers2.some(h2 => standardizeKey(h1) === standardizeKey(h2))
    );

    if (commonHeaders.length === 0) return null;

    // 2. Prioritize known unique identifiers
    for (const keyPattern of COMMON_KEYS) {
        const match = commonHeaders.find(h => {
            const stdH = standardizeKey(h);
            return stdH === standardizeKey(keyPattern) || stdH.includes(standardizeKey(keyPattern));
        });
        if (match) return match; // Return the header name from the first dataset
    }

    // 3. Fallback: Use the first common header that looks like an ID
    return commonHeaders.find(h => /id|code|key/i.test(h)) || null;
}

/**
 * Merge new rows into existing rows based on a merge key.
 * If no key is found or rows don't match, they are appended.
 */
export function mergeRows(
    existingRows: any[],
    newRows: any[],
    existingHeaders: string[],
    newHeaders: string[]
): { mergedRows: any[], mergedHeaders: string[], usedKey: string | null } {

    // 1. Identify a common key for merging (e.g., ID, EMAIL)
    const mergeKey = findMergeKey(existingHeaders, newHeaders);

    // If no common key is found, we fall back to a simple append strategy
    if (!mergeKey) {
        console.log(`[DataMerger] No common key found. Appending ${newRows.length} rows.`);
        return {
            mergedRows: [...existingRows, ...newRows],
            mergedHeaders: [...new Set([...existingHeaders, ...newHeaders])],
            usedKey: null
        };
    }

    const stdMergeKey = standardizeKey(mergeKey);
    const newRowKey = newHeaders.find(h => standardizeKey(h) === stdMergeKey);

    if (!newRowKey) {
        return {
            mergedRows: [...existingRows, ...newRows],
            mergedHeaders: [...new Set([...existingHeaders, ...newHeaders])],
            usedKey: null
        };
    }

    console.log(`[DataMerger] Performing Smart Join on key: "${mergeKey}" <-> "${newRowKey}"`);

    // Group existing rows by the merge key to handle potential one-to-many joins
    const existingGroups = new Map<string, any[]>();
    existingRows.forEach(row => {
        const val = standardizeKey(String(row[mergeKey] || ''));
        if (val) {
            if (!existingGroups.has(val)) {
                existingGroups.set(val, []);
            }
            existingGroups.get(val)!.push(row);
        }
    });

    const finalRows: any[] = [];
    const matchedExistingKeys = new Set<string>();

    // Iterate through new rows and try to join them with existing data
    newRows.forEach(row => {
        const key = standardizeKey(String(row[newRowKey] || ''));

        if (key && existingGroups.has(key)) {
            const matches = existingGroups.get(key)!;
            matches.forEach(existing => {
                // Combine the records (Join)
                const merged = { ...existing, ...row };

                // Track source files for the merged record
                if (existing.__sourceFile && row.__sourceFile && existing.__sourceFile !== row.__sourceFile) {
                    merged.__sourceFile = `${existing.__sourceFile}, ${row.__sourceFile}`;
                }

                finalRows.push(merged);
            });
            matchedExistingKeys.add(key);
        } else {
            // This record is new or the ID is blank - keep it as is
            finalRows.push(row);
        }
    });

    // Finally, bring in any existing rows that didn't find a match in the new dataset
    for (const [key, rows] of existingGroups.entries()) {
        if (!matchedExistingKeys.has(key)) {
            finalRows.push(...rows);
        }
    }

    return {
        mergedRows: finalRows,
        mergedHeaders: [...new Set([...existingHeaders, ...newHeaders])],
        usedKey: mergeKey
    };
}

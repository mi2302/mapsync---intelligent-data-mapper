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

    // Find a key to merge on
    const mergeKey = findMergeKey(existingHeaders, newHeaders);

    // If no good key found, just append
    if (!mergeKey) {
        return {
            mergedRows: [...existingRows, ...newRows],
            mergedHeaders: [...new Set([...existingHeaders, ...newHeaders])],
            usedKey: null
        };
    }

    // Find the matching key in the new dataset (might have slight case variation)
    const stdMergeKey = standardizeKey(mergeKey);
    const newRowKey = newHeaders.find(h => standardizeKey(h) === stdMergeKey);

    if (!newRowKey) {
        // Should theoretically not happen if findMergeKey worked, but safety first
        return {
            mergedRows: [...existingRows, ...newRows],
            mergedHeaders: [...new Set([...existingHeaders, ...newHeaders])],
            usedKey: null
        };
    }

    console.log(`Merging datasets on key: "${mergeKey}" (existing) / "${newRowKey}" (new)`);

    // Index existing rows by the merge key value
    const rowMap = new Map<string, any>();
    const existingRowsWithoutKey: any[] = [];

    existingRows.forEach(row => {
        const val = row[mergeKey];
        if (val !== undefined && val !== null && val !== '') {
            rowMap.set(String(val).toLowerCase(), { ...row }); // Clone to avoid mutation
        } else {
            existingRowsWithoutKey.push(row);
        }
    });

    // Merge new rows
    const newRowsWithoutKey: any[] = [];

    newRows.forEach(row => {
        const val = row[newRowKey];
        if (val !== undefined && val !== null && val !== '') {
            const keyVal = String(val).toLowerCase();
            if (rowMap.has(keyVal)) {
                // Merge into existing row
                const existing = rowMap.get(keyVal);
                // Overwrite/Append columns. 
                // Note: New file values overwrite old file values if they share columns, 
                // or we could implement a conflict resolution strategy. 
                // For now, let's merge objects, preferring existing non-null values if we want strictly additive?
                // Usually, later loads might be updates, so overwriting is often desired, specially for NULLs.
                // Let's mix: If existing is valid and new is valid, new wins (update). If new is null, keep existing.

                const merged = { ...existing };
                Object.keys(row).forEach(k => {
                    if (row[k] !== undefined && row[k] !== null && row[k] !== '') {
                        merged[k] = row[k];
                    }
                });

                // Track source files
                if (existing.__sourceFile && row.__sourceFile) {
                    if (!existing.__sourceFile.includes(row.__sourceFile)) {
                        merged.__sourceFile = `${existing.__sourceFile}, ${row.__sourceFile}`;
                    }
                } else if (row.__sourceFile) {
                    merged.__sourceFile = row.__sourceFile;
                }

                rowMap.set(keyVal, merged);
            } else {
                // New unique row
                rowMap.set(keyVal, { ...row });
            }
        } else {
            newRowsWithoutKey.push(row);
        }
    });

    // Reconstruct result
    const mergedRows = [
        ...Array.from(rowMap.values()),
        ...existingRowsWithoutKey,
        ...newRowsWithoutKey
    ];

    const mergedHeaders = [...new Set([...existingHeaders, ...newHeaders])];

    return { mergedRows, mergedHeaders, usedKey: mergeKey };
}

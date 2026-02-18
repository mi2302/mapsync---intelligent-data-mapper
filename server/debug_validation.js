// Mock Schema
const schema = {
    name: 'Employee Master',
    fields: [
        { column_name: 'EMP_ID', id: 'EMP_ID', is_primary: false },
        { column_name: 'FIRST_NAME', id: 'FIRST_NAME', is_primary: false }
    ]
};

// Mock CSV Data
const sourceRows = [
    { 'Employee ID': 1, 'First Name': 'A' },
    { 'Employee ID': 2, 'First Name': 'B' },
    { 'Employee ID': 4, 'First Name': 'D' },
    { 'Employee ID': 4, 'First Name': 'DE' } // Duplicate
];

// Mock Mappings
const mappings = [
    { targetFieldId: 'EMP_ID', sourceHeader: 'Employee ID' }
];

console.log("Starting Debug Validation...");

// 1. Prepare Data Logic (Simplified from App.tsx)
const currentMappings = mappings;
const relevantRows = sourceRows.map(row => {
    const dbRow = {};
    let hasData = false;
    schema.fields.forEach(field => {
        const mapping = currentMappings.find(m => m.targetFieldId === field.id);

        if (mapping && mapping.sourceHeader) {
            let value = row[mapping.sourceHeader];
            if (value !== undefined && value !== null && value !== '') hasData = true;
            dbRow[field.column_name] = value;
        }
    });
    return hasData ? dbRow : null;
}).filter(r => r !== null);

console.log(`Prepared ${relevantRows.length} rows:`, relevantRows);

// 2. Validation Logic ( EXACTLY from App.tsx Step 4021/4029 )
const childRows = relevantRows;

let pkFields = schema.fields.filter((f) => f.is_primary);

if (pkFields.length === 0) {
    pkFields = schema.fields.filter((f) => {
        const col = f.column_name.toUpperCase();
        const isExcluded = ['PAID', 'VOID', 'VALID', 'GRID', 'FLUID', 'SOLID'].includes(col);
        return !isExcluded && (
            ['ID', 'UUID', 'CODE', 'NUMBER'].includes(col) ||
            col.endsWith('_ID') ||
            col.endsWith('ID') ||
            col.endsWith('_NUM') ||
            col.endsWith('_NUMBER') ||
            col.endsWith('_CODE')
        );
    });
    console.log(`Fallback PKs:`, pkFields.map(f => f.column_name));
}

if (pkFields.length > 0) {
    const seenKeys = new Set();
    const duplicates = new Set();
    childRows.forEach((row) => {
        // App.tsx logic with trim
        const key = pkFields.map((f) => String(row[f.column_name] || '').trim()).join('|');
        if (seenKeys.has(key)) duplicates.add(key);
        else seenKeys.add(key);
    });

    if (duplicates.size > 0) {
        console.log(`❌ Duplicates Found: ${Array.from(duplicates).join(', ')}`);
    } else {
        console.log("✅ No Duplicates Found.");
    }
} else {
    console.log("⚠️ No Unique Key Identified.");
}

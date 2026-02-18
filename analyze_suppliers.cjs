const XLSX = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, 'Book2.xlsx');
const workbook = XLSX.readFile(filePath);
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const jsonData = XLSX.utils.sheet_to_json(worksheet);

const groups = [...new Set(jsonData.map(r => r.GROUP_NAME))];
const objects = [...new Set(jsonData.map(r => r.OBJECT_NAME))];

console.log("Groups found:", groups);
console.log("Objects found:", objects);

const filtered = jsonData.filter(col => {
    const name = String(col.COLUMN_NAME || '');
    if (name.startsWith('XX_')) return false;
    if (name === 'RESERVED') return false;
    if (name.includes('ATTRIBUTE')) return false;
    return true;
});

// Summary per object
const summary = {};
filtered.forEach(col => {
    if (!summary[col.OBJECT_NAME]) summary[col.OBJECT_NAME] = [];
    summary[col.OBJECT_NAME].push(col.COLUMN_NAME);
});

console.log("Filtered Column Counts per Object:");
Object.keys(summary).forEach(obj => {
    console.log(`${obj}: ${summary[obj].length} columns`);
});

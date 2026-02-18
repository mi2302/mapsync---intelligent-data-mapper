const XLSX = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, 'Book2.xlsx');
const workbook = XLSX.readFile(filePath);
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const jsonData = XLSX.utils.sheet_to_json(worksheet);

console.log(JSON.stringify(jsonData.slice(0, 20), null, 2));

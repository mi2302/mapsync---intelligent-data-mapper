/**
 * Test file for intelligent mapping utility
 */

import { intelligentAutoMap, getMappingStats } from './intelligentMapping';

// Sample Excel headers
const excelHeaders = [
    'Employee ID',
    'First Name',
    'Last Name',
    'Email Address',
    'Phone Number',
    'Hire Date',
    'Department',
    'Job Title',
    'Salary',
    'Manager ID',
    'Status'
];

// Sample database fields
const dbFields = [
    { id: 'EMP_ID', label: 'Employee ID', column_name: 'EMP_ID' },
    { id: 'FIRST_NAME', label: 'First Name', column_name: 'FIRST_NAME' },
    { id: 'LAST_NAME', label: 'Last Name', column_name: 'LAST_NAME' },
    { id: 'EMAIL', label: 'Email', column_name: 'EMAIL' },
    { id: 'PHONE', label: 'Phone', column_name: 'PHONE' },
    { id: 'HIRE_DATE', label: 'Hire Date', column_name: 'HIRE_DATE' },
    { id: 'DEPT_ID', label: 'Department', column_name: 'DEPT_ID' },
    { id: 'JOB_TITLE', label: 'Job Title', column_name: 'JOB_TITLE' },
    { id: 'SALARY', label: 'Salary', column_name: 'SALARY' },
    { id: 'MANAGER_ID', label: 'Manager ID', column_name: 'MANAGER_ID' },
    { id: 'ACTIVE_FLAG', label: 'Active', column_name: 'ACTIVE_FLAG' }
];

console.log('=== INTELLIGENT MAPPING TEST ===\n');
console.log('Excel Headers:', excelHeaders);
console.log('\nDatabase Fields:', dbFields.map(f => f.label));

const mappings = intelligentAutoMap(excelHeaders, dbFields);

console.log('\n=== MAPPING RESULTS ===\n');
Object.entries(mappings).forEach(([fieldId, header]) => {
    const field = dbFields.find(f => f.id === fieldId);
    if (header) {
        console.log(`✓ ${field?.label} (${fieldId}) ← "${header}"`);
    } else {
        console.log(`✗ ${field?.label} (${fieldId}) ← (unmapped)`);
    }
});

const stats = getMappingStats(mappings);
console.log('\n=== STATISTICS ===');
console.log(`Total Fields: ${stats.total}`);
console.log(`Mapped: ${stats.mapped}`);
console.log(`Unmapped: ${stats.unmapped}`);
console.log(`Success Rate: ${stats.percentage.toFixed(1)}%`);

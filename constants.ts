import { SchemaType, SchemaDefinition, DataGroup, SchemaTypes } from './types';

export const DATA_GROUPS: DataGroup[] = [
  {
    id: 'workforce_management',
    name: 'Workforce Management',
    icon: '📦', // Placeholder - will be replaced by API data
    objects: [SchemaTypes.EMPLOYEE_MASTER, SchemaTypes.ASSIGNMENT, SchemaTypes.PAYROLL]
  },
  {
    id: 'accounts_payable',
    name: 'Accounts Payable',
    icon: '📦', // Placeholder - will be replaced by API data
    objects: [SchemaTypes.INVOICE_HEADER, SchemaTypes.INVOICE_LINES]
  },
  {
    id: 'vendor_relations',
    name: 'Vendor Relations',
    icon: '📦', // Placeholder - will be replaced by API data
    objects: [SchemaTypes.SUPPLIER_HEADER, SchemaTypes.SUPPLIER_SITES, SchemaTypes.SUPPLIER_TAX]
  }
];

export const SCHEMAS: Record<string, SchemaDefinition> = {
  [SchemaTypes.EMPLOYEE_MASTER]: {
    id: SchemaTypes.EMPLOYEE_MASTER,
    name: 'Employee Master',
    icon: '👤',
    table_name: 'msai_hr_employee_master',
    fields: []
  },
  [SchemaTypes.ASSIGNMENT]: {
    id: SchemaTypes.ASSIGNMENT,
    name: 'Assignment Records',
    icon: '📋',
    table_name: 'msai_hr_assignments',
    fields: []
  },
  [SchemaTypes.PAYROLL]: {
    id: SchemaTypes.PAYROLL,
    name: 'Payroll Data',
    icon: '💰',
    table_name: 'fin_payroll_run',
    fields: []
  },
  [SchemaTypes.INVOICE_HEADER]: {
    id: SchemaTypes.INVOICE_HEADER,
    name: 'Invoice Header',
    icon: '📄',
    table_name: 'ap_invoice_headers',
    fields: []
  },
  [SchemaTypes.INVOICE_LINES]: {
    id: SchemaTypes.INVOICE_LINES,
    name: 'Invoice Lines',
    icon: '🔢',
    table_name: 'ap_invoice_lines',
    fields: []
  },
  [SchemaTypes.SUPPLIER_HEADER]: {
    id: SchemaTypes.SUPPLIER_HEADER,
    name: 'Supplier Header',
    icon: '🏢',
    table_name: 'pur_suppliers',
    fields: []
  },
  [SchemaTypes.SUPPLIER_SITES]: {
    id: SchemaTypes.SUPPLIER_SITES,
    name: 'Supplier Sites',
    icon: '📍',
    table_name: 'pur_vendor_sites',
    fields: []
  },
  [SchemaTypes.SUPPLIER_TAX]: {
    id: SchemaTypes.SUPPLIER_TAX,
    name: 'Tax Information',
    icon: '🛡️',
    table_name: 'pur_vendor_tax_profiles',
    fields: []
  }
};

export const SAMPLE_CSV_DATA = `EmployeeNumber,FName,LName,Contact,Dept,DateJoined,Active
E001,John,Doe,john@example.com,Engineering,2023-01-15,Yes
E002,Jane,Smith,jane@example.com,Marketing,2022-11-01,Yes
E003,Bob,Johnson,bob@example.com,Sales,2023-05-20,No`;

export const SAMPLE_DATA_BY_SCHEMA: Record<string, string> = {
  [SchemaTypes.EMPLOYEE_MASTER]: `EmployeeID,FirstName,LastName,Email,HireDate,DepartmentCode,BadgeNumber,OfficeLocation
E1001,Alice,Wonder,alice@company.com,2024-01-15,ENG,B-001,New York
E1002,Bob,Builder,bob@company.com,2023-11-20,OPS,B-042,London
E1003,Charlie,Chocolate,charlie@company.com,2024-02-01,MKT,B-105,Paris`,

  [SchemaTypes.ASSIGNMENT]: `AssignmentID,EmployeeRef,ProjectCode,StartDate,IsRemote,Shift,PriorityLevel
A-2024-01,E1001,PRJ-ALPHA,2024-02-01,true,Day,High
A-2024-02,E1002,PRJ-BETA,2024-02-15,false,Night,Medium
A-2024-03,E1003,PRJ-GAMMA,2024-03-01,true,Day,Low`,

  [SchemaTypes.PAYROLL]: `PayRunID,GrossAmount,PaymentDate,BonusAmount,TaxCode,Currency,ApprovalStatus
PR-2024-JAN,5000.00,2024-01-31,500.00,T01,USD,Approved
PR-2024-FEB,5200.00,2024-02-29,0.00,T01,GBP,Pending
PR-2024-MAR,4800.00,2024-03-31,200.00,T02,EUR,Draft`
};

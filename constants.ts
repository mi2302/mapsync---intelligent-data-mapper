import { SchemaType, SchemaDefinition, DataGroup, SchemaTypes } from './types';

export const DATA_GROUPS: DataGroup[] = [
  {
    id: 'workforce_management',
    name: 'Workforce Management',
    icon: '📦',
    objects: [
      { id: SchemaTypes.EMPLOYEE_MASTER, name: 'Employee Master', table: 'msai_hr_employee_master' },
      { id: SchemaTypes.ASSIGNMENT, name: 'Assignment Records', table: 'msai_hr_assignments' },
      { id: SchemaTypes.PAYROLL, name: 'Payroll Data', table: 'fin_payroll_run' }
    ]
  },
  {
    id: 'accounts_payable',
    name: 'Accounts Payable',
    icon: '📦',
    objects: [
      { id: SchemaTypes.INVOICE_HEADER, name: 'Invoice Header', table: 'ap_invoice_headers' },
      { id: SchemaTypes.INVOICE_LINES, name: 'Invoice Lines', table: 'ap_invoice_lines' }
    ]
  },
  {
    id: 'vendor_relations',
    name: 'Vendor Relations',
    icon: '📦',
    objects: [
      { id: SchemaTypes.SUPPLIER_HEADER, name: 'Supplier Header', table: 'po_vendors' },
      { id: SchemaTypes.SUPPLIER_SITES, name: 'Supplier Sites', table: 'po_vendor_sites' },
      { id: SchemaTypes.SUPPLIER_TAX, name: 'Supplier Tax', table: 'ap_tax_codes' }
    ]
  }
];

export const SCHEMAS: Record<string, SchemaDefinition> = {
  [SchemaTypes.EMPLOYEE_MASTER]: {
    id: SchemaTypes.EMPLOYEE_MASTER,
    name: 'Employee Master',
    icon: '👤',
    table_name: 'msai_hr_employee_master',
    fields: [
      { id: '1', column_name: 'PERSON_ID', label: 'Person ID', type: 'NUMERIC', required: true, description: 'Internal unique identifier' },
      { id: '2', column_name: 'EMPLOYEE_NUMBER', label: 'Emp No', type: 'VARCHAR', required: true, description: 'Public employee ID' },
      { id: '3', column_name: 'FIRST_NAME', label: 'First Name', type: 'VARCHAR', required: true, description: '' },
      { id: '4', column_name: 'LAST_NAME', label: 'Last Name', type: 'VARCHAR', required: true, description: '' },
      { id: '5', column_name: 'EMAIL_ADDRESS', label: 'Email', type: 'VARCHAR', required: false, description: '' },
      { id: '6', column_name: 'DATE_OF_HIRE', label: 'Hire Date', type: 'TIMESTAMP', required: true, description: '' },
      { id: '7', column_name: 'DEPARTMENT_CODE', label: 'Dept', type: 'VARCHAR', required: false, description: '' }
    ]
  },
  [SchemaTypes.ASSIGNMENT]: {
    id: SchemaTypes.ASSIGNMENT,
    name: 'Assignment Records',
    icon: '📋',
    table_name: 'msai_hr_assignments',
    fields: [
      { id: '1', column_name: 'ASSIGNMENT_ID', label: 'Assignment ID', type: 'NUMERIC', required: true, description: '' },
      { id: '2', column_name: 'PERSON_ID', label: 'Person ID', type: 'NUMERIC', required: true, description: 'FK to Employee' },
      { id: '3', column_name: 'JOB_TITLE', label: 'Job Title', type: 'VARCHAR', required: true, description: '' },
      { id: '4', column_name: 'START_DATE', label: 'Start Date', type: 'TIMESTAMP', required: true, description: '' },
      { id: '5', column_name: 'IS_REMOTE', label: 'Remote?', type: 'BOOLEAN', required: false, description: '' }
    ]
  },
  [SchemaTypes.PAYROLL]: {
    id: SchemaTypes.PAYROLL,
    name: 'Payroll Data',
    icon: '💰',
    table_name: 'fin_payroll_run',
    fields: [
      { id: '1', column_name: 'PAY_RUN_ID', label: 'Pay Run ID', type: 'NUMERIC', required: true, description: '' },
      { id: '2', column_name: 'PAY_PERIOD', label: 'Period', type: 'VARCHAR', required: true, description: '' },
      { id: '3', column_name: 'GROSS_AMOUNT', label: 'Gross', type: 'NUMERIC', required: true, description: '' },
      { id: '4', column_name: 'NET_AMOUNT', label: 'Net', type: 'NUMERIC', required: true, description: '' },
      { id: '5', column_name: 'CURRENCY_CODE', label: 'Currency', type: 'VARCHAR', required: true, description: '' }
    ]
  },
  [SchemaTypes.INVOICE_HEADER]: {
    id: SchemaTypes.INVOICE_HEADER,
    name: 'Invoice Header',
    icon: '📄',
    table_name: 'ap_invoice_headers',
    fields: [
      { id: '1', column_name: 'INVOICE_ID', label: 'Invoice ID', type: 'NUMERIC', required: true, description: '' },
      { id: '2', column_name: 'INVOICE_NUM', label: 'Invoice #', type: 'VARCHAR', required: true, description: '' },
      { id: '3', column_name: 'VENDOR_ID', label: 'Vendor ID', type: 'NUMERIC', required: true, description: '' },
      { id: '4', column_name: 'INVOICE_DATE', label: 'Date', type: 'TIMESTAMP', required: true, description: '' },
      { id: '5', column_name: 'INVOICE_AMOUNT', label: 'Amount', type: 'NUMERIC', required: true, description: '' }
    ]
  },
  [SchemaTypes.INVOICE_LINES]: {
    id: SchemaTypes.INVOICE_LINES,
    name: 'Invoice Lines',
    icon: '🔢',
    table_name: 'ap_invoice_lines',
    fields: [
      { id: '1', column_name: 'LINE_ID', label: 'Line ID', type: 'NUMERIC', required: true, description: '' },
      { id: '2', column_name: 'INVOICE_ID', label: 'Invoice ID', type: 'NUMERIC', required: true, description: '' },
      { id: '3', column_name: 'LINE_NUMBER', label: 'Line #', type: 'NUMERIC', required: true, description: '' },
      { id: '4', column_name: 'DESCRIPTION', label: 'Desc', type: 'VARCHAR', required: false, description: '' },
      { id: '5', column_name: 'AMOUNT', label: 'Amount', type: 'NUMERIC', required: true, description: '' }
    ]
  },
  [SchemaTypes.SUPPLIER_HEADER]: {
    id: SchemaTypes.SUPPLIER_HEADER,
    name: 'Supplier Header',
    icon: '🏢',
    table_name: 'pur_suppliers',
    fields: [
      { id: '1', column_name: 'VENDOR_ID', label: 'Vendor ID', type: 'NUMERIC', required: true, description: 'Unique vendor identifier' },
      { id: '2', column_name: 'VENDOR_NAME', label: 'Vendor Name', type: 'VARCHAR', required: true, description: 'Official registration name' },
      { id: '3', column_name: 'SEGMENT1', label: 'Vendor Num', type: 'VARCHAR', required: true, description: 'Public facing vendor code' },
      { id: '4', column_name: 'VENDOR_TYPE_LOOKUP_CODE', label: 'Type', type: 'VARCHAR', required: false, description: 'Category of supplier' },
      { id: '5', column_name: 'TAX_REGISTRATION_NUM', label: 'TAX ID', type: 'VARCHAR', required: false, description: 'Government tax identifier' },
      { id: '6', column_name: 'ENABLED_FLAG', label: 'Active', type: 'BOOLEAN', required: true, description: 'Current status' }
    ]
  },
  [SchemaTypes.SUPPLIER_SITES]: {
    id: SchemaTypes.SUPPLIER_SITES,
    name: 'Supplier Sites',
    icon: '📍',
    table_name: 'pur_vendor_sites',
    fields: [
      { id: '1', column_name: 'VENDOR_SITE_ID', label: 'Site ID', type: 'NUMERIC', required: true, description: '' },
      { id: '2', column_name: 'VENDOR_ID', label: 'Vendor ID', type: 'NUMERIC', required: true, description: '' },
      { id: '3', column_name: 'VENDOR_SITE_CODE', label: 'Site Code', type: 'VARCHAR', required: true, description: '' },
      { id: '4', column_name: 'ADDRESS_LINE1', label: 'Address', type: 'VARCHAR', required: false, description: '' },
      { id: '5', column_name: 'CITY', label: 'City', type: 'VARCHAR', required: false, description: '' },
      { id: '6', column_name: 'COUNTRY', label: 'Country', type: 'VARCHAR', required: true, description: '' }
    ]
  },
  [SchemaTypes.SUPPLIER_TAX]: {
    id: SchemaTypes.SUPPLIER_TAX,
    name: 'Tax Information',
    icon: '🛡️',
    table_name: 'pur_vendor_tax_profiles',
    fields: [
      { id: '1', column_name: 'TAX_PROFILE_ID', label: 'Profile ID', type: 'NUMERIC', required: true, description: '' },
      { id: '2', column_name: 'PARTY_ID', label: 'Party ID', type: 'NUMERIC', required: true, description: '' },
      { id: '3', column_name: 'TAX_REGISTRATION_NUMBER', label: 'Tax Num', type: 'VARCHAR', required: true, description: '' },
      { id: '4', column_name: 'TAX_CLASSIFICATION_CODE', label: 'Tax Code', type: 'VARCHAR', required: false, description: '' }
    ]
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


import { SchemaType, SchemaDefinition, DataGroup } from './types';

export const DATA_GROUPS: DataGroup[] = [
  {
    id: 'workforce',
    name: 'Workforce Management',
    icon: '👥',
    objects: [SchemaType.EMPLOYEE_MASTER, SchemaType.ASSIGNMENT, SchemaType.PAYROLL]
  },
  {
    id: 'payables',
    name: 'Accounts Payable',
    icon: '🧾',
    objects: [SchemaType.INVOICE_HEADER, SchemaType.INVOICE_LINES]
  },
  {
    id: 'suppliers',
    name: 'Vendor Relations',
    icon: '🏭',
    objects: [SchemaType.SUPPLIER_HEADER, SchemaType.SUPPLIER_SITES, SchemaType.SUPPLIER_TAX]
  }
];

export const SCHEMAS: Record<SchemaType, SchemaDefinition> = {
  [SchemaType.EMPLOYEE_MASTER]: {
    id: SchemaType.EMPLOYEE_MASTER,
    name: 'Employee Master',
    icon: '👤',
    table_name: 'msai_hr_employee_master',
    fields: [
      { id: 'EMP_ID', column_name: 'emp_id', label: 'Employee ID', type: 'VARCHAR', required: true, description: 'Primary key for employee' },
      { id: 'FIRST_NAME', column_name: 'first_name', label: 'First Name', type: 'VARCHAR', required: true, description: 'Legal first name' },
      { id: 'LAST_NAME', column_name: 'last_name', label: 'Last Name', type: 'VARCHAR', required: true, description: 'Legal last name' },
      { id: 'EMAIL', column_name: 'email', label: 'Work Email', type: 'VARCHAR', required: true, description: 'Business contact' },
      { id: 'HIRE_DATE', column_name: 'hire_date', label: 'Hire Date', type: 'TIMESTAMP', required: true, description: 'Onboarding date' }
    ]
  },
  [SchemaType.ASSIGNMENT]: {
    id: SchemaType.ASSIGNMENT,
    name: 'Assignment Records',
    icon: '📋',
    table_name: 'msai_hr_assignments',
    fields: [
      { id: 'ASSIGNMENT_ID', column_name: 'assignment_id', label: 'Assignment ID', type: 'VARCHAR', required: true, description: 'Task unique identifier' },
      { id: 'EMP_REF', column_name: 'emp_ref', label: 'Employee Ref', type: 'VARCHAR', required: true, description: 'Foreign key to employee' },
      { id: 'PROJECT_CODE', column_name: 'project_code', label: 'Project', type: 'VARCHAR', required: true, description: 'WBS Project Code' },
      { id: 'START_TS', column_name: 'start_ts', label: 'Start Timestamp', type: 'TIMESTAMP', required: true, description: 'Activation time' }
    ]
  },
  [SchemaType.PAYROLL]: {
    id: SchemaType.PAYROLL,
    name: 'Payroll Data',
    icon: '💰',
    table_name: 'fin_payroll_run',
    fields: [
      { id: 'PAY_RUN_ID', column_name: 'pay_run_id', label: 'Payroll Run ID', type: 'VARCHAR', required: true, description: 'Unique payroll run' },
      { id: 'GROSS_AMOUNT', column_name: 'gross_amount', label: 'Gross Pay', type: 'NUMERIC', required: true, description: 'Financial value' },
      { id: 'DISBURSEMENT_DATE', column_name: 'disbursement_date', label: 'Pay Date', type: 'TIMESTAMP', required: true, description: 'Transfer date' }
    ]
  },
  [SchemaType.INVOICE_HEADER]: {
    id: SchemaType.INVOICE_HEADER,
    name: 'Invoice Header',
    icon: '📄',
    table_name: 'ap_invoice_headers',
    fields: [
      { id: 'INVOICE_ID', column_name: 'invoice_id', label: 'Invoice Number', type: 'VARCHAR', required: true, description: 'Vendor invoice ref' },
      { id: 'INVOICE_TS', column_name: 'invoice_ts', label: 'Invoice Date', type: 'TIMESTAMP', required: true, description: 'Document date' },
      { id: 'AMOUNT_TOTAL', column_name: 'amount_total', label: 'Total Amount', type: 'NUMERIC', required: true, description: 'Total gross' }
    ]
  },
  [SchemaType.INVOICE_LINES]: {
    id: SchemaType.INVOICE_LINES,
    name: 'Invoice Lines',
    icon: '🔢',
    table_name: 'ap_invoice_lines',
    fields: [
      { id: 'LINE_ITEM_ID', column_name: 'line_item_id', label: 'Line ID', type: 'VARCHAR', required: true, description: 'Unique line identifier' },
      { id: 'PARENT_INV_ID', column_name: 'parent_inv_id', label: 'Parent Invoice', type: 'VARCHAR', required: true, description: 'Header reference' },
      { id: 'ITEM_DESC', column_name: 'item_desc', label: 'Description', type: 'VARCHAR', required: true, description: 'Itemized description' }
    ]
  },
  [SchemaType.SUPPLIER_HEADER]: {
    id: SchemaType.SUPPLIER_HEADER,
    name: 'Supplier Header',
    icon: '🏢',
    table_name: 'pur_suppliers',
    fields: [
      { id: 'VENDOR_ID', column_name: 'vendor_id', label: 'Supplier ID', type: 'VARCHAR', required: true, description: 'System vendor code' },
      { id: 'BUSINESS_NAME', column_name: 'business_name', label: 'Legal Name', type: 'VARCHAR', required: true, description: 'Entity name' }
    ]
  },
  [SchemaType.SUPPLIER_SITES]: {
    id: SchemaType.SUPPLIER_SITES,
    name: 'Supplier Sites',
    icon: '📍',
    table_name: 'pur_vendor_sites',
    fields: [
      { id: 'SITE_ID', column_name: 'site_id', label: 'Site ID', type: 'VARCHAR', required: true, description: 'Locational identifier' },
      { id: 'ADDRESS_LINE', column_name: 'address_line', label: 'Address', type: 'VARCHAR', required: true, description: 'Physical address' }
    ]
  },
  [SchemaType.SUPPLIER_TAX]: {
    id: SchemaType.SUPPLIER_TAX,
    name: 'Tax Information',
    icon: '🛡️',
    table_name: 'pur_vendor_tax_profiles',
    fields: [
      { id: 'TAX_PROFILE_ID', column_name: 'tax_profile_id', label: 'Tax Profile ID', type: 'VARCHAR', required: true, description: 'Tax record id' },
      { id: 'STANDARD_RATE', column_name: 'standard_rate', label: 'Default Rate', type: 'NUMERIC', required: true, description: 'Standard tax %' }
    ]
  }
};

export const SAMPLE_CSV_DATA = `EmployeeNumber,FName,LName,Contact,Dept,DateJoined,Active
E001,John,Doe,john@example.com,Engineering,2023-01-15,Yes
E002,Jane,Smith,jane@example.com,Marketing,2022-11-01,Yes
E003,Bob,Johnson,bob@example.com,Sales,2023-05-20,No`;

export const SAMPLE_DATA_BY_SCHEMA: Record<string, string> = {
  [SchemaType.EMPLOYEE_MASTER]: `EmployeeID,FirstName,LastName,Email,HireDate,DepartmentCode,BadgeNumber,OfficeLocation
E1001,Alice,Wonder,alice@company.com,2024-01-15,ENG,B-001,New York
E1002,Bob,Builder,bob@company.com,2023-11-20,OPS,B-042,London
E1003,Charlie,Chocolate,charlie@company.com,2024-02-01,MKT,B-105,Paris`,

  [SchemaType.ASSIGNMENT]: `AssignmentID,EmployeeRef,ProjectCode,StartDate,IsRemote,Shift,PriorityLevel
A-2024-01,E1001,PRJ-ALPHA,2024-02-01,true,Day,High
A-2024-02,E1002,PRJ-BETA,2024-02-15,false,Night,Medium
A-2024-03,E1003,PRJ-GAMMA,2024-03-01,true,Day,Low`,

  [SchemaType.PAYROLL]: `PayRunID,GrossAmount,PaymentDate,BonusAmount,TaxCode,Currency,ApprovalStatus
PR-2024-JAN,5000.00,2024-01-31,500.00,T01,USD,Approved
PR-2024-FEB,5200.00,2024-02-29,0.00,T01,GBP,Pending
PR-2024-MAR,4800.00,2024-03-31,200.00,T02,EUR,Draft`
};

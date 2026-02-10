
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
    table_name: 'hr_employee_master',
    fields: [
      { id: 'fld_1', column_name: 'emp_id', label: 'Employee ID', type: 'VARCHAR', required: true, description: 'Primary key for employee' },
      { id: 'fld_2', column_name: 'first_name', label: 'First Name', type: 'VARCHAR', required: true, description: 'Legal first name' },
      { id: 'fld_3', column_name: 'last_name', label: 'Last Name', type: 'VARCHAR', required: true, description: 'Legal last name' },
      { id: 'fld_4', column_name: 'email', label: 'Work Email', type: 'VARCHAR', required: true, description: 'Business contact' },
      { id: 'fld_5', column_name: 'hire_date', label: 'Hire Date', type: 'TIMESTAMP', required: true, description: 'Onboarding date' }
    ]
  },
  [SchemaType.ASSIGNMENT]: {
    id: SchemaType.ASSIGNMENT,
    name: 'Assignment Records',
    icon: '📋',
    table_name: 'hr_assignments',
    fields: [
      { id: 'fld_6', column_name: 'assignment_id', label: 'Assignment ID', type: 'VARCHAR', required: true, description: 'Task unique identifier' },
      { id: 'fld_7', column_name: 'emp_ref', label: 'Employee Ref', type: 'VARCHAR', required: true, description: 'Foreign key to employee' },
      { id: 'fld_8', column_name: 'project_code', label: 'Project', type: 'VARCHAR', required: true, description: 'WBS Project Code' },
      { id: 'fld_9', column_name: 'start_ts', label: 'Start Timestamp', type: 'TIMESTAMP', required: true, description: 'Activation time' }
    ]
  },
  [SchemaType.PAYROLL]: {
    id: SchemaType.PAYROLL,
    name: 'Payroll Data',
    icon: '💰',
    table_name: 'fin_payroll_run',
    fields: [
      { id: 'fld_10', column_name: 'pay_run_id', label: 'Payroll Run ID', type: 'VARCHAR', required: true, description: 'Unique payroll run' },
      { id: 'fld_11', column_name: 'gross_amount', label: 'Gross Pay', type: 'NUMERIC', required: true, description: 'Financial value' },
      { id: 'fld_12', column_name: 'disbursement_date', label: 'Pay Date', type: 'TIMESTAMP', required: true, description: 'Transfer date' }
    ]
  },
  [SchemaType.INVOICE_HEADER]: {
    id: SchemaType.INVOICE_HEADER,
    name: 'Invoice Header',
    icon: '📄',
    table_name: 'ap_invoice_headers',
    fields: [
      { id: 'fld_13', column_name: 'invoice_id', label: 'Invoice Number', type: 'VARCHAR', required: true, description: 'Vendor invoice ref' },
      { id: 'fld_14', column_name: 'invoice_ts', label: 'Invoice Date', type: 'TIMESTAMP', required: true, description: 'Document date' },
      { id: 'fld_15', column_name: 'amount_total', label: 'Total Amount', type: 'NUMERIC', required: true, description: 'Total gross' }
    ]
  },
  [SchemaType.INVOICE_LINES]: {
    id: SchemaType.INVOICE_LINES,
    name: 'Invoice Lines',
    icon: '🔢',
    table_name: 'ap_invoice_lines',
    fields: [
      { id: 'fld_16', column_name: 'line_item_id', label: 'Line ID', type: 'VARCHAR', required: true, description: 'Unique line identifier' },
      { id: 'fld_17', column_name: 'parent_inv_id', label: 'Parent Invoice', type: 'VARCHAR', required: true, description: 'Header reference' },
      { id: 'fld_18', column_name: 'item_desc', label: 'Description', type: 'VARCHAR', required: true, description: 'Itemized description' }
    ]
  },
  [SchemaType.SUPPLIER_HEADER]: {
    id: SchemaType.SUPPLIER_HEADER,
    name: 'Supplier Header',
    icon: '🏢',
    table_name: 'pur_suppliers',
    fields: [
      { id: 'fld_19', column_name: 'vendor_id', label: 'Supplier ID', type: 'VARCHAR', required: true, description: 'System vendor code' },
      { id: 'fld_20', column_name: 'business_name', label: 'Legal Name', type: 'VARCHAR', required: true, description: 'Entity name' }
    ]
  },
  [SchemaType.SUPPLIER_SITES]: {
    id: SchemaType.SUPPLIER_SITES,
    name: 'Supplier Sites',
    icon: '📍',
    table_name: 'pur_vendor_sites',
    fields: [
      { id: 'fld_21', column_name: 'site_id', label: 'Site ID', type: 'VARCHAR', required: true, description: 'Locational identifier' },
      { id: 'fld_22', column_name: 'address_line', label: 'Address', type: 'VARCHAR', required: true, description: 'Physical address' }
    ]
  },
  [SchemaType.SUPPLIER_TAX]: {
    id: SchemaType.SUPPLIER_TAX,
    name: 'Tax Information',
    icon: '🛡️',
    table_name: 'pur_vendor_tax_profiles',
    fields: [
      { id: 'fld_23', column_name: 'tax_profile_id', label: 'Tax Profile ID', type: 'VARCHAR', required: true, description: 'Tax record id' },
      { id: 'fld_24', column_name: 'standard_rate', label: 'Default Rate', type: 'NUMERIC', required: true, description: 'Standard tax %' }
    ]
  }
};

export const SAMPLE_CSV_DATA = `EmployeeNumber,FName,LName,Contact,Dept,DateJoined,Active
E001,John,Doe,john@example.com,Engineering,2023-01-15,Yes
E002,Jane,Smith,jane@example.com,Marketing,2022-11-01,Yes
E003,Bob,Johnson,bob@example.com,Sales,2023-05-20,No`;

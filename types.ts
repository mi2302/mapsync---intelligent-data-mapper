
export enum SchemaType {
  EMPLOYEE_MASTER = 'EMPLOYEE_MASTER',
  ASSIGNMENT = 'ASSIGNMENT',
  PAYROLL = 'PAYROLL',
  INVOICE_HEADER = 'INVOICE_HEADER',
  INVOICE_LINES = 'INVOICE_LINES',
  SUPPLIER_HEADER = 'SUPPLIER_HEADER',
  SUPPLIER_SITES = 'SUPPLIER_SITES',
  SUPPLIER_TAX = 'SUPPLIER_TAX'
}

export type DataType = 'VARCHAR' | 'NUMERIC' | 'TIMESTAMP' | 'BOOLEAN';

export interface TargetField {
  id: string;
  column_name: string;
  label: string;
  type: DataType;
  required: boolean;
  description: string;
}

export type TransformationType = 
  | 'constant' 
  | 'uppercase' 
  | 'lowercase' 
  | 'trim' 
  | 'default_if_null' 
  | 'prefix' 
  | 'suffix' 
  | 'replace'
  | 'to_number'
  | 'to_date';

export interface TransformationStep {
  id: string;
  type: TransformationType;
  value?: string;
  replaceWith?: string;
}

export interface FieldMapping {
  targetFieldId: string;
  sourceHeader?: string;
  transformations: TransformationStep[];
  semanticReasoning?: string;
  confidence?: number;
}

export interface SourceData {
  headers: string[];
  inferredTypes: Record<string, DataType>;
  rows: Record<string, any>[];
  fileName: string;
}

export interface SchemaDefinition {
  id: SchemaType;
  name: string;
  icon: string;
  table_name: string;
  fields: TargetField[];
}

export interface DataGroup {
  id: string;
  name: string;
  icon: string;
  objects: SchemaType[];
}

export interface SavedConfiguration {
  id: string;
  name: string;
  groupId: string;
  // Record of Object ID to its specific mappings
  objectMappings: Record<string, FieldMapping[]>; 
  createdAt: string;
}

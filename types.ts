export type SchemaType =
  | 'EMPLOYEE_MASTER'
  | 'ASSIGNMENT'
  | 'PAYROLL'
  | 'INVOICE_HEADER'
  | 'INVOICE_LINES'
  | 'SUPPLIER_HEADER'
  | 'SUPPLIER_SITES'
  | 'SUPPLIER_TAX'
  | string;

export const SchemaTypes = {
  EMPLOYEE_MASTER: 'EMPLOYEE_MASTER',
  ASSIGNMENT: 'ASSIGNMENT',
  PAYROLL: 'PAYROLL',
  INVOICE_HEADER: 'INVOICE_HEADER',
  INVOICE_LINES: 'INVOICE_LINES',
  SUPPLIER_HEADER: 'SUPPLIER_HEADER',
  SUPPLIER_SITES: 'SUPPLIER_SITES',
  SUPPLIER_TAX: 'SUPPLIER_TAX'
} as const;

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
  | 'to_date'
  | 'concatenate'
  | 'substring';

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
  fileNames: string[];
  fileHeaders: Record<string, string[]>;
}

export interface SchemaDependency {
  targetSchemaId: string;
  sourceFieldId: string; // The FK in this schema
  targetFieldId: string; // The PK in parent schema
  type: 'ONE_TO_ONE' | 'ONE_TO_MANY';
}

export interface SchemaDefinition {
  id: SchemaType;
  name: string;
  icon: string;
  table_name: string;
  fields: TargetField[];
  dependencies?: SchemaDependency[]; // Parent relationships
  moduleName?: string;
}

export interface ModuleObject {
  id: string;
  name: string;
  table: string;
  moduleId?: number;
}

export interface DataGroup {
  id: string;
  name: string;
  icon: string;
  objects: ModuleObject[];
}

export interface SavedConfiguration {
  id: string;
  name: string;
  groupId: string;
  sourceId?: string;
  sourceHeaders?: string[];
  // Record of Object ID to its specific mappings
  objectMappings: Record<string, FieldMapping[]>;
  createdAt: string;
}

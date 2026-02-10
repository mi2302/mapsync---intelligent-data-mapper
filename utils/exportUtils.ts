
import { SavedConfiguration, DataGroup } from '../types';
import { SCHEMAS } from '../constants';

export const exportToExcel = (config: SavedConfiguration, groups: DataGroup[]) => {
  const group = groups.find(g => g.id === config.groupId);
  let csvContent = `MAPSYNC INTEGRATION REPORT\n`;
  csvContent += `Registry Name: ${config.name}\n`;
  csvContent += `Business Domain: ${group?.name || 'Unknown'}\n`;
  csvContent += `Generated At: ${new Date().toLocaleString()}\n\n`;
  
  csvContent += `Target Table,Target Column,Source Header,Transformations,Requirement\n`;

  Object.entries(config.objectMappings).forEach(([schemaId, mappings]) => {
    const schema = SCHEMAS[schemaId as any];
    mappings.forEach(mapping => {
      const field = schema.fields.find(f => f.id === mapping.targetFieldId);
      if (!field) return;

      const transformationList = mapping.transformations
        .map(t => `${t.type.toUpperCase()}${t.value ? `(${t.value})` : ''}`)
        .join(' | ');

      const row = [
        schema.table_name,
        field.column_name,
        mapping.sourceHeader || 'UNMAPPED',
        transformationList || 'NONE',
        field.required ? 'MANDATORY' : 'OPTIONAL'
      ].map(val => `"${val}"`).join(',');
      
      csvContent += row + '\n';
    });
    csvContent += `\n`; // Spacer between objects
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', `${config.name.replace(/\s+/g, '_')}_mapping_report.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

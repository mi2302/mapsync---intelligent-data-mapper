
import React, { useState, useEffect, useMemo } from 'react';
import { Layout } from './components/Layout';
import { MappingInterface } from './components/MappingInterface';
import { Dashboard } from './components/Dashboard';
import { Toast } from './components/Toast';
import { SAMPLE_CSV_DATA, SAMPLE_DATA_BY_SCHEMA, SCHEMAS } from './constants';
import { SchemaType, SourceData, FieldMapping, SchemaDefinition, DataType, DataGroup, SavedConfiguration } from './types';
import { suggestMappings } from './services/geminiService';
import { apiService } from './services/apiService';
import { applyTransformations } from './utils/transformations';
import { exportToExcel } from './utils/exportUtils';
import { parseFile } from './utils/fileParser';
import { intelligentAutoMap } from './utils/intelligentMapping';
import { CustomModuleCreation } from './components/CustomModuleCreation';
import { mergeRows } from './utils/dataMerger';

const inferType = (values: any[]): DataType => {
  const cleanValues = values.filter(v => v !== undefined && v !== null && v !== '');
  if (cleanValues.length === 0) return 'VARCHAR';
  const isBoolean = cleanValues.every(v => ['true', 'false', 'yes', 'no', '1', '0'].includes(String(v).toLowerCase()));
  if (isBoolean) return 'BOOLEAN';
  const isNumber = cleanValues.every(v => !isNaN(Number(v)));
  if (isNumber) return 'NUMERIC';
  const isDate = cleanValues.every(v => !isNaN(Date.parse(v)));
  if (isDate) return 'TIMESTAMP';
  return 'VARCHAR';
};

const App: React.FC = () => {
  const [view, setView] = useState<'dashboard' | 'workspace' | 'custom_module'>('dashboard');
  const [dataGroups, setDataGroups] = useState<DataGroup[]>([]);
  const [selectedSchema, setSelectedSchema] = useState<SchemaDefinition | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
  const [sourceData, setSourceData] = useState<SourceData | null>(null);

  // Mapping state
  const [allMappings, setAllMappings] = useState<Record<string, FieldMapping[]>>({});
  const [activeConfigId, setActiveConfigId] = useState<string | null>(null);
  const [isModified, setIsModified] = useState(false);

  // Memory for user-defined matches: Key=ColumnName, Value=TargetFieldId
  const [columnMemory, setColumnMemory] = useState<Record<string, string>>({});

  const [isAutoMapping, setIsAutoMapping] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(true);

  const [dynamicSchemas, setDynamicSchemas] = useState<Record<string, SchemaDefinition>>(SCHEMAS);
  const [configName, setConfigName] = useState('');
  const [allSavedConfigs, setAllSavedConfigs] = useState<SavedConfiguration[]>([]);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const getGroupIdForSchema = (schemaId: SchemaType) => {
    return dataGroups.find(g => g.objects.includes(schemaId))?.id || null;
  };

  // Helper to standardise string for matching
  const standardize = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, '');

  const runAutoMapGroup = (headers: string[], groupId: string) => {
    const group = dataGroups.find(g => g.id === groupId);
    if (!group) return;

    const newMappingsMap: Record<string, FieldMapping[]> = {};
    let totalMapped = 0;
    let totalFields = 0;

    group.objects.forEach(schemaId => {
      const schema = dynamicSchemas[schemaId];
      if (!schema || !schema.fields || schema.fields.length === 0) return;

      // Use intelligent auto-mapping
      const intelligentMappings = intelligentAutoMap(headers, schema.fields);

      const newMappings = schema.fields.map(field => {
        const sourceHeader = intelligentMappings[field.id];
        if (sourceHeader) totalMapped++;
        totalFields++;

        return {
          targetFieldId: field.id,
          sourceHeader: sourceHeader || undefined,
          transformations: []
        };
      });

      newMappingsMap[schemaId] = newMappings;
    });

    setAllMappings(prev => ({ ...prev, ...newMappingsMap }));
    setIsModified(true);

    const percentage = totalFields > 0 ? Math.round((totalMapped / totalFields) * 100) : 0;
    showToast(`🤖 Intelligent mapping: ${totalMapped}/${totalFields} fields mapped (${percentage}%) across ${group.objects.length} table(s).`, "success");
  };

  const handleRemoveFile = (fileName: string) => {
    if (!sourceData) return;

    const newFileNames = sourceData.fileNames.filter(f => f !== fileName);
    if (newFileNames.length === 0) {
      setSourceData(null);
      setAllMappings({}); // Clear all mappings if no source data
      return;
    }

    const newFileHeaders = { ...sourceData.fileHeaders };
    delete newFileHeaders[fileName];

    // Recalculate headers
    const newHeaders = Array.from(new Set((Object.values(newFileHeaders) as string[][]).flat()));

    // Identify headers that are being removed (existed only in the deleted file)
    const headersToRemove = sourceData.headers.filter(h => !newHeaders.includes(h));

    // Filter rows - simpler logic for now: keep if it's NOT exclusively from this file
    // Ideally we would un-merge but that's complex. For now, we rely on cleaning the mappings.
    const newRows = sourceData.rows.filter(row => row.__sourceFile !== fileName);

    // Recalculate inferred types
    const newInferredTypes: Record<string, DataType> = {};
    newHeaders.forEach(header => {
      newInferredTypes[header] = inferType(newRows.map(r => r[header]));
    });

    setSourceData({
      headers: newHeaders,
      inferredTypes: newInferredTypes,
      rows: newRows,
      fileNames: newFileNames,
      fileHeaders: newFileHeaders
    });

    // Clean up Mappings: specific fix for the user issue
    setAllMappings(prev => {
      const updated: Record<string, FieldMapping[]> = {};
      Object.keys(prev).forEach(schemaId => {
        updated[schemaId] = prev[schemaId].map(mapping => {
          if (mapping.sourceHeader && headersToRemove.includes(mapping.sourceHeader)) {
            return { ...mapping, sourceHeader: undefined };
          }
          return mapping;
        });
      });
      return updated;
    });

    showToast(`Removed source file: ${fileName}`, "success");
  };

  const refreshAllConfigs = async () => {
    const all: SavedConfiguration[] = [];
    for (const group of dataGroups) {
      const configs = await apiService.fetchConfigsByGroup(group.id);
      all.push(...configs);
    }
    setAllSavedConfigs(all);
  };

  useEffect(() => {
    const init = async () => {
      setLoadingConfig(true);
      const groups = await apiService.fetchDataGroups();
      setDataGroups(groups);

      // Build schema definitions for custom modules
      const customSchemas: Record<string, SchemaDefinition> = {};
      const customTableNames: string[] = [];

      for (const group of groups) {
        // Check if this is a custom module (not in SCHEMAS)
        const isCustom = group.objects.some(objId => !SCHEMAS[objId]);

        if (isCustom) {
          for (const objId of group.objects) {
            if (!SCHEMAS[objId]) {
              // This is a custom object, we need to create its schema
              const tableName = objId.toLowerCase(); // Assuming table name matches object ID
              customTableNames.push(tableName);

              customSchemas[objId] = {
                id: objId as SchemaType,
                name: objId.replace(/_/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
                icon: '⚡',
                table_name: tableName,
                fields: [] // Will be populated below
              };
            }
          }
        }
      }

      // Fetch metadata for all custom tables at once
      if (customTableNames.length > 0) {
        try {
          const metadata = await apiService.fetchTableMetadata(customTableNames);

          // Populate fields for each custom schema
          Object.keys(customSchemas).forEach(objId => {
            const tableName = customSchemas[objId].table_name.toUpperCase();
            if (metadata[tableName]) {
              customSchemas[objId].fields = metadata[tableName];
            }
          });
        } catch (err) {
          console.error('Failed to fetch custom module metadata:', err);
        }
      }

      // Merge custom schemas with built-in schemas
      setDynamicSchemas(prev => ({ ...SCHEMAS, ...customSchemas }));

      const all: SavedConfiguration[] = [];
      for (const group of groups) {
        const configs = await apiService.fetchConfigsByGroup(group.id);
        all.push(...configs);
      }
      setAllSavedConfigs(all);

      setLoadingConfig(false);
    };
    init();
  }, []);

  // Fetch Live Metadata ONLY for the selected object
  useEffect(() => {
    if (!selectedSchema) return;

    const updateLiveMetadata = async () => {
      try {
        const metadata = await apiService.fetchTableMetadata([selectedSchema.table_name]);
        const dbCols = metadata[selectedSchema.table_name.toUpperCase()];

        if (dbCols && dbCols.length > 0) {
          // Update the specific schema in our dynamic collection
          setDynamicSchemas(prev => ({
            ...prev,
            [selectedSchema.id]: {
              ...prev[selectedSchema.id],
              fields: dbCols
            }
          }));

          // Also update the active selected schema state
          setSelectedSchema(prev => {
            if (!prev || prev.id !== selectedSchema.id) return prev;
            return { ...prev, fields: dbCols };
          });

          console.log(`Live metadata updated for ${selectedSchema.table_name}`);
        }
      } catch (err) {
        console.error('Metadata update failed:', err);
      }
    };

    updateLiveMetadata();
  }, [selectedSchema?.id]);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleToggleGroup = async (groupId: string) => {
    const isExpanding = !expandedGroups.includes(groupId);
    if (isExpanding) {
      setExpandedGroups([...expandedGroups, groupId]);
    } else {
      setExpandedGroups(expandedGroups.filter(id => id !== groupId));
    }
  };

  const handleSchemaChange = async (schemaId: SchemaType) => {
    const currentGroupId = selectedSchema ? getGroupIdForSchema(selectedSchema.id) : null;
    const nextGroupId = getGroupIdForSchema(schemaId);

    if (currentGroupId !== nextGroupId) {
      setActiveConfigId(null);
      setConfigName('');
      setIsModified(false);
    }

    // Auto-expand the group we just jumped into
    if (nextGroupId && !expandedGroups.includes(nextGroupId)) {
      setExpandedGroups(prev => [...prev, nextGroupId]);
    }

    const newSchema = dynamicSchemas[schemaId];
    setSelectedSchema(newSchema);

    if (!allMappings[schemaId]) {
      setAllMappings(prev => ({
        ...prev,
        [schemaId]: newSchema.fields.map(f => ({ targetFieldId: f.id, transformations: [] }))
      }));
    }
    setView('workspace');
  };

  const handleNewRegistry = async () => {
    if (isModified && !confirm("Discard unsaved changes?")) return;
    const currentGroup = selectedSchema ? dataGroups.find(g => g.objects.includes(selectedSchema.id)) : null;
    if (currentGroup) {
      const resetMappings: Record<string, FieldMapping[]> = { ...allMappings };
      for (const schemaId of currentGroup.objects) {
        const schema = await apiService.fetchSchemaDefinition(schemaId);
        resetMappings[schemaId] = schema.fields.map(f => ({ targetFieldId: f.id, transformations: [] }));
      }
      setAllMappings(resetMappings);
    }
    setActiveConfigId(null);
    setIsModified(false);
    setConfigName('');
  };

  const handleSaveConfig = async () => {
    if (!selectedSchema || !configName.trim()) {
      showToast("Please enter a registry name.", "error");
      return;
    }
    const currentGroup = dataGroups.find(g => g.objects.includes(selectedSchema.id));
    if (!currentGroup) return;

    const groupMappings: Record<string, FieldMapping[]> = {};
    currentGroup.objects.forEach(schemaId => {
      if (allMappings[schemaId]) {
        groupMappings[schemaId] = allMappings[schemaId];
      }
    });

    const configToSave: Omit<SavedConfiguration, 'id' | 'createdAt'> = {
      name: configName,
      groupId: currentGroup.id,
      objectMappings: groupMappings
    };

    setIsSaving(true);
    try {
      const result = await apiService.saveMappingConfiguration({
        id: activeConfigId || undefined,
        ...configToSave
      });

      if (result.success) {
        setIsModified(false);
        setActiveConfigId(result.config.id);
        refreshAllConfigs();
        showToast(`Registry "${result.config.name}" successfully ${activeConfigId ? 'updated' : 'registered'}.`);
      }
    } catch (err) {
      showToast("System error: Failed to sync with registry.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const loadSavedConfig = async (config: SavedConfiguration) => {
    if (isModified && !confirm("Discard unsaved changes?")) return;
    setAllMappings(prev => ({ ...prev, ...config.objectMappings }));
    setConfigName(config.name);
    setActiveConfigId(config.id);
    setIsModified(false);

    const firstSchemaId = Object.keys(config.objectMappings)[0] as SchemaType;
    if (firstSchemaId) {
      const schema = dynamicSchemas[firstSchemaId];
      setSelectedSchema(schema);
      setView('workspace');
      if (!expandedGroups.includes(config.groupId)) setExpandedGroups(prev => [...prev, config.groupId]);
    }
  };

  const handleDeleteConfig = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm('Permanently remove this registry?')) {
      await apiService.deleteConfiguration(id);
      if (activeConfigId === id) {
        setActiveConfigId(null);
        setConfigName('');
      }
      refreshAllConfigs();
      showToast("Registry entry purged successfully.");
    }
  };

  const handleCreateModule = async (name: string, icon: string, objects: any[]) => {
    // Sanitize name for ID usage
    const groupId = name.toLowerCase().replace(/\s/g, '_').replace(/[^a-z0-9_]/g, '');
    const formattedObjects: SchemaType[] = [];
    const newSchemaEntries: Record<string, SchemaDefinition> = {};

    // 1. Prepare backend data
    const moduleObjects = objects.map(obj => ({
      id: obj.id,
      table: obj.table || obj.id
    }));

    // 2. Persist Module Definition in Backend (Ensure name matches what we send in registry)
    try {
      const regSuccess = await apiService.saveModuleDefinitions(name, icon, moduleObjects);
      if (!regSuccess) {
        showToast("Warning: Failed to persist module definition in DB, but local workspace initialized.", "error");
      }
    } catch (err) {
      console.error("Module persistence failed:", err);
    }

    // 3. Update Frontend State
    objects.forEach(obj => {
      // obj is now { type: 'catalog' | 'database' | 'draft', id: string, name: string, table?: string }
      if (obj.type === 'catalog') {
        formattedObjects.push(obj.id as SchemaType);
      } else {
        const tableId = obj.id as SchemaType;
        formattedObjects.push(tableId);
        newSchemaEntries[tableId] = {
          id: tableId,
          name: obj.name,
          icon: obj.type === 'database' ? '🔗' : '⚡',
          table_name: (obj.table || obj.id).toLowerCase(),
          fields: []
        };
      }
    });

    setDynamicSchemas(prev => ({ ...prev, ...newSchemaEntries }));

    const newGroup: DataGroup = {
      id: groupId,
      name,
      icon,
      objects: formattedObjects
    };

    setDataGroups(prev => [...prev, newGroup]);
    showToast(`Custom module "${name}" synthesized and added to dashboard.`, "success");
    setView('dashboard');
    refreshAllConfigs();
  };

  const handleExport = (e: React.MouseEvent, config: SavedConfiguration) => {
    e.stopPropagation();
    exportToExcel(config, dataGroups);
    showToast("Exporting XLS report...");
  };

  const handleSync = async () => {
    console.log('Sync process started...');
    if (!selectedSchema || !sourceData) {
      console.warn('Sync aborted: Missing schema or source data.');
      return;
    }
    const mappings = allMappings[selectedSchema.id] || [];
    if (mappings.length === 0) {
      showToast("No mappings configured for this object.", "error");
      return;
    }

    // Prepare rows for sync
    const mappedFields = mappings.filter(m => m.sourceHeader || m.transformations.some(t => t.type === 'constant'));

    const targetColumnNames = mappedFields.map(m => {
      const field = selectedSchema.fields.find(f => f.id === m.targetFieldId);
      return field ? field.column_name : null;
    }).filter(Boolean) as string[];

    if (targetColumnNames.length === 0) {
      showToast("No fields are mapped for synchronization.", "error");
      return;
    }

    // Filter and transform source rows
    const rowsToSync = sourceData.rows.filter(row =>
      mappedFields.some(m => m.sourceHeader && row[m.sourceHeader] !== undefined && row[m.sourceHeader] !== null && row[m.sourceHeader] !== '')
      || mappedFields.some(m => !m.sourceHeader && m.transformations.some(t => t.type === 'constant'))
    ).map(row => {
      const transformedRow: any = {};
      mappedFields.forEach(m => {
        const field = selectedSchema.fields.find(f => f.id === m.targetFieldId);
        if (field) {
          const val = m.sourceHeader ? row[m.sourceHeader] : undefined;
          transformedRow[field.column_name] = applyTransformations(val, m.transformations);
        }
      });
      return transformedRow;
    });

    if (rowsToSync.length === 0) {
      showToast("No valid data rows found to sync.", "error");
      return;
    }

    if (!confirm(`Ready to sync ${rowsToSync.length} rows to ${selectedSchema.table_name.toUpperCase()}? This will write to the database.`)) return;

    try {
      showToast("Starting synchronization...", "success");
      const result = await apiService.syncData(selectedSchema.table_name, targetColumnNames, rowsToSync);
      if (result.success) {
        showToast(`Successfully synced ${result.rowsAffected} rows!`, "success");
      } else {
        showToast(`Sync Failed: ${result.message}`, "error");
      }
    } catch (e: any) {
      console.error('Sync Error:', e);
      showToast(`Sync Failed: ${e.message}`, "error");
    }
  };

  const activeGroup = useMemo(() =>
    selectedSchema ? dataGroups.find(g => g.objects.includes(selectedSchema.id)) : null
    , [selectedSchema, dataGroups]);

  const handleCreateNewForGroup = async (group: DataGroup) => {
    if (isModified && !confirm("Discard unsaved changes?")) return;

    setActiveConfigId(null);
    setConfigName('');
    setIsModified(false);

    // Reset mappings for this group to empty
    const resetMappings: Record<string, FieldMapping[]> = { ...allMappings };
    for (const schemaId of group.objects) {
      const schema = dynamicSchemas[schemaId];
      if (schema) {
        resetMappings[schemaId] = schema.fields.map(f => ({ targetFieldId: f.id, transformations: [] }));
      }
    }
    setAllMappings(resetMappings);

    // Select first object and enter workspace
    if (group.objects.length > 0) {
      handleSchemaChange(group.objects[0]);
    }

    if (!expandedGroups.includes(group.id)) {
      setExpandedGroups(prev => [...prev, group.id]);
    }
    setView('workspace');
  };

  if (loadingConfig) {
    return (
      <Layout onGoHome={() => setView('dashboard')}>
        <div className="h-[60vh] flex flex-col items-center justify-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent shadow-xl"></div>
          <p className="text-slate-400 font-black text-[10px] uppercase tracking-[0.3em] animate-pulse">Initializing Data Warehouse...</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout onGoHome={() => setView('dashboard')}>
      {toast && <Toast message={toast.message} type={toast.type} />}

      {view === 'dashboard' ? (
        <Dashboard
          groups={dataGroups}
          configs={allSavedConfigs}
          onLoadConfig={loadSavedConfig}
          onSelectSchema={handleSchemaChange}
          onDelete={handleDeleteConfig}
          onExport={handleExport}
          onNavigateToCustom={() => setView('custom_module')}
          onCreateNew={handleCreateNewForGroup}
        />
      ) : view === 'custom_module' ? (
        <CustomModuleCreation
          onBack={() => setView('dashboard')}
          onCreate={handleCreateModule}
          allSchemas={dynamicSchemas}
        />
      ) : (
        <div className="grid grid-cols-12 gap-8 items-start animate-in fade-in duration-500">
          {/* Navigation Sidebar */}
          <div className="col-span-12 lg:col-span-3 space-y-6">
            <section className="bg-white rounded-[2rem] shadow-xl border border-slate-200 overflow-hidden">
              <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">System Catalog</h2>
                <button
                  onClick={handleNewRegistry}
                  className="text-[9px] font-black text-blue-600 hover:text-blue-800 uppercase tracking-tighter bg-blue-50 px-3 py-1 rounded-full border border-blue-100 transition-all"
                >
                  + New
                </button>
              </div>
              <div className="p-4 space-y-2">
                {(activeGroup ? [activeGroup] : dataGroups).map((group) => (
                  <div key={group.id} className="space-y-1">
                    <button
                      onClick={() => handleToggleGroup(group.id)}
                      className={`w-full flex items-center justify-between p-3 rounded-xl transition-all group ${expandedGroups.includes(group.id) ? 'bg-slate-50' : 'hover:bg-slate-50'} ${activeGroup?.id === group.id ? 'ring-1 ring-blue-100' : ''}`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{group.icon}</span>
                        <span className={`text-[10px] font-bold uppercase tracking-tight transition-colors ${activeGroup?.id === group.id ? 'text-blue-700' : 'text-slate-700'}`}>{group.name}</span>
                      </div>
                    </button>
                    {expandedGroups.includes(group.id) && (
                      <div className="pl-4 py-2 space-y-1">
                        {group.objects.map((schemaId) => (
                          <button
                            key={schemaId}
                            onClick={() => handleSchemaChange(schemaId)}
                            className={`w-full text-left px-4 py-2 rounded-lg transition-all text-[9px] font-black uppercase tracking-widest ${selectedSchema?.id === schemaId ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:text-slate-900 hover:bg-slate-50'}`}
                          >
                            ● {schemaId.replace('_', ' ')}
                          </button>
                        ))}
                        {group.id.startsWith('custom_') && (
                          <button
                            onClick={() => setView('custom_module')}
                            className="w-full text-left px-4 py-2 text-[8px] font-black text-blue-500 uppercase tracking-[0.2em] border-t border-slate-50 mt-2 hover:text-blue-700"
                          >
                            + Add Object
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>

            <section className="bg-white rounded-[2rem] shadow-xl border border-slate-200 p-6">
              <div className="space-y-4">
                <div className="border-2 border-dashed border-slate-100 rounded-3xl p-8 text-center hover:border-blue-500 hover:bg-blue-50/50 transition-all cursor-pointer relative group">
                  <input type="file" multiple accept=".csv,.xlsx,.xls" onChange={async (e) => {
                    const files = Array.from(e.target.files || []) as File[];
                    if (files.length === 0) return;

                    try {
                      showToast(`Parsing ${files.length} file(s)...`, "success");

                      let combinedHeaders = sourceData ? [...sourceData.headers] : [];
                      let combinedRows = sourceData ? [...sourceData.rows] : [];
                      let combinedInferredTypes = sourceData ? { ...sourceData.inferredTypes } : {};
                      let combinedFileNames = sourceData ? [...sourceData.fileNames] : [];
                      let combinedFileHeaders = sourceData ? { ...sourceData.fileHeaders } : {};

                      for (const file of files) {
                        const result = await parseFile(file);
                        const taggedRows = result.rows.map(r => ({ ...r, __sourceFile: file.name }));

                        // Intelligent Merge Strategy
                        // If this is the first file/no existing data, just set it
                        if (combinedRows.length === 0) {
                          combinedRows = taggedRows;
                          combinedHeaders = result.headers;
                        } else {
                          // Try to merge with existing data
                          const mergeResult = mergeRows(
                            combinedRows,
                            taggedRows,
                            combinedHeaders,
                            result.headers
                          );

                          combinedRows = mergeResult.mergedRows;
                          combinedHeaders = mergeResult.mergedHeaders;

                          if (mergeResult.usedKey) {
                            showToast(`Merged file using key: ${mergeResult.usedKey}`, "success");
                          }
                        }

                        // Per-file header tracking
                        combinedFileHeaders[file.name] = result.headers;

                        if (!combinedFileNames.includes(file.name)) {
                          combinedFileNames.push(file.name);
                        }
                      }

                      // Global recalculation of types across ALL staged data
                      const finalInferredTypes: Record<string, DataType> = {};
                      combinedHeaders.forEach(header => {
                        finalInferredTypes[header] = inferType(combinedRows.map(r => r[header]));
                      });

                      setSourceData({
                        headers: combinedHeaders,
                        inferredTypes: finalInferredTypes,
                        rows: combinedRows,
                        fileNames: combinedFileNames,
                        fileHeaders: combinedFileHeaders
                      });

                      // AUTO-MAPPING TRIGGER
                      // Automatically run intelligent mapping whenever new data is loaded
                      if (selectedSchema) {
                        // Calculate Data Density
                        const densityStats: Record<string, number> = {};
                        const rowCount = combinedRows.length;

                        if (rowCount > 0) {
                          combinedHeaders.forEach(header => {
                            const filledCount = combinedRows.filter(row =>
                              row[header] !== undefined && row[header] !== null && row[header] !== ''
                            ).length;
                            densityStats[header] = filledCount / rowCount;
                          });
                        }

                        // Run Intelligent Mapping
                        const intelligentMappings = intelligentAutoMap(
                          combinedHeaders,
                          selectedSchema.fields,
                          densityStats
                        );

                        // Update Mappings State
                        setAllMappings(prev => {
                          const currentMappings = prev[selectedSchema.id] || [];
                          const updated = selectedSchema.fields.map(field => {
                            const existing = currentMappings.find(m => m.targetFieldId === field.id);
                            // 1. Check MEMORY first (User override)
                            const memoryMatch = combinedHeaders.find(h => columnMemory[h] === field.id);

                            // 2. Check INTELLIGENT suggestion
                            const suggestedHeader = intelligentMappings[field.id];

                            const bestHeader = memoryMatch || suggestedHeader;

                            // If we found a match (memory or AI), use it. Preserve existing transformations.
                            if (bestHeader) {
                              return {
                                ...(existing || { targetFieldId: field.id, transformations: [] }),
                                sourceHeader: bestHeader
                              };
                            }
                            return existing || { targetFieldId: field.id, transformations: [] };
                          });

                          return { ...prev, [selectedSchema.id]: updated };
                        });

                        const mappedCount = Object.keys(intelligentMappings).length;
                        showToast(`🚀 Auto-mapped ${mappedCount} fields for ${selectedSchema.name}`, "success");
                      }

                      showToast(`Loaded ${combinedFileNames.length} file(s) total.`);
                    } catch (err: any) {
                      showToast(`Failed to parse files: ${err.message}`, "error");
                      console.error('File Parse Error:', err);
                    } finally {
                      // Reset input so the same file can be selected again
                      e.target.value = '';
                    }
                  }} className="absolute inset-0 opacity-0 cursor-pointer z-10" />
                  <div className="text-4xl mb-4 grayscale group-hover:grayscale-0 transition-all">📄</div>
                  <p className="text-[10px] font-black text-slate-800 uppercase tracking-widest">
                    {sourceData ? 'Add More Sources' : 'Stage Source'}
                  </p>
                </div>
                {!sourceData && (
                  <button onClick={() => {
                    const sampleRows = (selectedSchema && SAMPLE_DATA_BY_SCHEMA[selectedSchema.id])
                      ? SAMPLE_DATA_BY_SCHEMA[selectedSchema.id]
                      : SAMPLE_CSV_DATA;
                    const lines = sampleRows.split('\n').filter(l => l.trim() !== '');
                    const headers = lines[0].split(',').map(h => h.trim());
                    const rows = lines.slice(1).map(line => {
                      const values = line.split(',');
                      const row: Record<string, any> = {};
                      headers.forEach((header, idx) => { row[header] = values[idx]?.trim(); });
                      return row;
                    });
                    const inferredTypes: Record<string, DataType> = {};
                    headers.forEach(header => { inferredTypes[header] = inferType(rows.map(r => r[header])); });
                    const taggedRows = rows.map(r => ({ ...r, __sourceFile: 'demo_data.csv' }));
                    setSourceData({
                      headers,
                      inferredTypes,
                      rows: taggedRows,
                      fileNames: ['demo_data.csv'],
                      fileHeaders: { 'demo_data.csv': headers }
                    });
                  }} className="w-full py-4 bg-slate-50 text-slate-800 rounded-2xl text-[9px] font-black uppercase tracking-widest hover:bg-slate-100 border border-slate-200 transition-all">Use Demo Payload</button>
                )}
              </div>
              {sourceData && (
                <div className="p-4 bg-slate-900 rounded-2xl text-white mt-4">
                  <div className="flex flex-col gap-1 mb-3">
                    <p className="text-[8px] font-black uppercase opacity-50">Staged Sources ({sourceData.fileNames.length})</p>
                    <div className="flex flex-wrap gap-1">
                      {sourceData.fileNames.map(name => (
                        <span key={name} className="px-2 py-0.5 bg-white/10 rounded text-[7px] font-bold">{name}</span>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2 bg-white/5 rounded-xl text-center">
                      <p className="text-lg font-black">{sourceData.rows.length}</p>
                      <p className="text-[7px] font-black uppercase opacity-40">Records</p>
                    </div>
                    <div className="p-2 bg-white/5 rounded-xl text-center">
                      <p className="text-lg font-black">{sourceData.headers.length}</p>
                      <p className="text-[7px] font-black uppercase opacity-40">Attributes</p>
                    </div>
                  </div>
                  <button onClick={() => setSourceData(null)} className="w-full mt-4 py-2 bg-white/10 hover:bg-rose-500 rounded-xl text-[8px] font-black uppercase transition-all">Unstage All</button>
                </div>
              )}
            </section>
          </div>

          {/* Workspace */}
          <div className="col-span-12 lg:col-span-9 space-y-6">
            {selectedSchema ? (
              <div className="space-y-6 flex flex-col h-full">
                {/* Scope Bar */}
                <div className="flex items-center justify-between px-8 py-4 bg-slate-900 rounded-2xl shadow-lg border border-slate-800">
                  <div className="flex items-center gap-6">
                    <div className="flex flex-col">
                      <span className="text-[8px] font-black text-slate-500 uppercase tracking-[0.3em] mb-0.5">Active Domain</span>
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{activeGroup?.icon}</span>
                        <span className="text-[12px] font-black text-white uppercase tracking-widest">{activeGroup?.name}</span>
                      </div>
                    </div>
                    <div className="h-8 w-px bg-slate-800"></div>
                    <div className="flex flex-col">
                      <span className="text-[8px] font-black text-slate-500 uppercase tracking-[0.3em] mb-0.5">Group Registry</span>
                      <span className={`text-[10px] font-black uppercase tracking-tight ${activeConfigId ? 'text-blue-400' : 'text-slate-600 italic'}`}>
                        {activeConfigId ? configName : 'New Unsaved Mapping'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {isModified && (
                      <span className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 text-amber-500 text-[9px] font-black rounded-full border border-amber-500/20">
                        <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse"></span>
                        MODIFIED
                      </span>
                    )}
                    {activeConfigId && (
                      <button
                        onClick={(e) => handleExport(e, allSavedConfigs.find(c => c.id === activeConfigId)!)}
                        className="px-4 py-1.5 bg-blue-500/10 text-blue-400 text-[9px] font-black rounded-full border border-blue-500/20 hover:bg-blue-500/20 transition-all"
                      >
                        EXPORT XLS
                      </button>
                    )}
                    {sourceData && selectedSchema && (
                      <button
                        onClick={async () => {
                          if (!sourceData || !activeGroup) return;

                          if (!confirm(`This will sync data to ALL ${activeGroup.objects.length} tables in the '${activeGroup.name}' group. Proceed?`)) return;

                          showToast("Starting multi-table sync...", "success");
                          let successCount = 0;
                          let failCount = 0;

                          // Iterate all schemas in the group
                          for (const schemaId of activeGroup.objects) {
                            const schema = SCHEMAS[schemaId];
                            if (!schema) continue;

                            const currentMappings = allMappings[schemaId] || [];
                            const targetColumns = schema.fields.map(f => f.column_name);

                            const dbRows = sourceData.rows.map(row => {
                              const dbRow: Record<string, any> = {};
                              schema.fields.forEach(field => {
                                const mapping = currentMappings.find(m => m.targetFieldId === field.id);
                                let value = null;
                                if (mapping && mapping.sourceHeader) {
                                  value = row[mapping.sourceHeader] || null;
                                }

                                dbRow[field.column_name] = value;
                              });
                              return dbRow;
                            });

                            // Basic check if ANY data for this table is mapped (optional optimization)
                            const hasMappings = currentMappings.some(m => m.sourceHeader);
                            if (!hasMappings && dbRows.length > 0) {
                              console.log(`Skipping ${schema.name} - no mappings found.`);
                              continue;
                            }

                            const result = await apiService.syncData(schema.table_name, targetColumns, dbRows);
                            if (result.success) {
                              successCount++;
                              console.log(`Synced ${schema.name}: ${result.rowsAffected} rows.`);
                            } else {
                              failCount++;
                              console.error(`Failed to sync ${schema.name}: ${result.message}`);
                            }
                          }

                          if (failCount === 0) {
                            showToast(`Successfully synced group: ${activeGroup.name}`, "success");
                          } else {
                            showToast(`Sync completed with ${failCount} errors.`, "error");
                          }
                        }}
                        className="px-4 py-1.5 bg-emerald-500/10 text-emerald-500 text-[9px] font-black rounded-full border border-emerald-500/20 hover:bg-emerald-500/20 transition-all"
                      >
                        SYNC GROUP
                      </button>
                    )}
                  </div>
                </div>

                {/* Toolbar */}
                <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-xl flex flex-col md:flex-row items-center gap-6">
                  <div className="flex items-center gap-4 bg-slate-50 px-6 py-3 rounded-2xl border border-slate-100 shrink-0">
                    <span className="text-xl">{selectedSchema.icon}</span>
                    <div className="flex flex-col">
                      <span className="text-[11px] font-black text-blue-600 uppercase tracking-widest leading-none">{selectedSchema.name}</span>
                      <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter mt-1">{selectedSchema.table_name}</span>
                    </div>
                  </div>
                  <div className="flex-1 w-full">
                    <input
                      type="text"
                      placeholder={`Name this registry...`}
                      value={configName}
                      onChange={(e) => {
                        setConfigName(e.target.value);
                        setIsModified(true);
                      }}
                      className="w-full bg-slate-50 border border-slate-100 px-5 py-3 rounded-2xl text-[10px] font-black uppercase outline-none focus:border-blue-400 transition-all shadow-inner"
                    />
                  </div>
                  <div className="flex items-center gap-3 w-full md:w-auto">
                    <button
                      onClick={handleSaveConfig}
                      disabled={isSaving || !configName.trim()}
                      className={`flex-1 md:flex-none px-10 py-4 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl transition-all ${activeConfigId ? 'bg-blue-600 shadow-blue-500/20 hover:bg-blue-700' : 'bg-emerald-600 shadow-emerald-500/20 hover:bg-emerald-700'}`}
                    >
                      {isSaving ? 'Saving...' : activeConfigId ? 'Update Registry' : 'Register Map'}
                    </button>
                  </div>
                </div>

                <div className="flex-1">
                  {sourceData ? (
                    <MappingInterface
                      schema={selectedSchema}
                      source={sourceData}
                      mappings={allMappings[selectedSchema.id] || []}
                      onUpdateMapping={(newMapping) => {
                        // SAVE TO MEMORY if explicit mapping
                        if (newMapping.sourceHeader) {
                          setColumnMemory(prev => ({
                            ...prev,
                            [newMapping.sourceHeader!]: newMapping.targetFieldId
                          }));
                        }

                        setAllMappings(prev => {
                          const current = prev[selectedSchema.id] || [];
                          const exists = current.some(m => m.targetFieldId === newMapping.targetFieldId);
                          const updated = exists
                            ? current.map(m => m.targetFieldId === newMapping.targetFieldId ? newMapping : m)
                            : [...current, newMapping];
                          return { ...prev, [selectedSchema.id]: updated };
                        });
                        setIsModified(true);
                      }}
                      onAutoMap={async () => {
                        setIsAutoMapping(true);
                        try {
                          // Calculate Data Density for each column
                          const densityStats: Record<string, number> = {};
                          const rowCount = sourceData.rows.length;

                          if (rowCount > 0) {
                            sourceData.headers.forEach(header => {
                              const filledCount = sourceData.rows.filter(row =>
                                row[header] !== undefined && row[header] !== null && row[header] !== ''
                              ).length;
                              densityStats[header] = filledCount / rowCount;
                            });
                          }

                          // Use intelligent local mapping with Density awareness
                          const intelligentMappings = intelligentAutoMap(
                            sourceData.headers,
                            selectedSchema.fields,
                            densityStats
                          );
                          const currentMappings = allMappings[selectedSchema.id] || [];

                          // Build updated mappings with intelligent suggestions
                          const updated = selectedSchema.fields.map(field => {
                            const existing = currentMappings.find(m => m.targetFieldId === field.id);

                            // 1. Check MEMORY first
                            const memoryMatch = sourceData.headers.find(h => columnMemory[h] === field.id);

                            // 2. Check INTELLIGENT suggestion
                            const suggestedHeader = intelligentMappings[field.id];

                            const bestHeader = memoryMatch || suggestedHeader;

                            if (bestHeader) {
                              return {
                                ...(existing || { targetFieldId: field.id, transformations: [] }),
                                sourceHeader: bestHeader
                              };
                            }
                            return existing || { targetFieldId: field.id, transformations: [] };
                          });

                          setAllMappings(prev => ({ ...prev, [selectedSchema.id]: updated }));
                          setIsModified(true);

                          const mappedCount = updated.filter(m => m.sourceHeader).length;
                          const percentage = Math.round((mappedCount / selectedSchema.fields.length) * 100);
                          showToast(`🤖 Intelligent mapping: ${mappedCount}/${selectedSchema.fields.length} fields mapped (${percentage}%)`, "success");
                        } catch (err: any) {
                          showToast(`Mapping failed: ${err.message}`, "error");
                        } finally {
                          setIsAutoMapping(false);
                        }
                      }}
                      isAutoMapping={isAutoMapping}
                      onRemoveFile={handleRemoveFile}
                      onSync={handleSync}
                    />
                  ) : (
                    <div className="h-full flex items-center justify-center p-20 bg-white border border-dashed border-slate-200 rounded-[3rem]">
                      <div className="text-center">
                        <span className="text-4xl block mb-4 opacity-50">📥</span>
                        <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Stage a data source to begin mapping</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </Layout>
  );
};

export default App;

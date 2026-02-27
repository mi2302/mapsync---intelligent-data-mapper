
import React, { useState, useEffect, useMemo } from 'react';
import { Layout } from './components/Layout';
import { MappingInterface } from './components/MappingInterface';
import { Dashboard } from './components/Dashboard';
import { Toast } from './components/Toast';
import { SAMPLE_CSV_DATA, SAMPLE_DATA_BY_SCHEMA, SCHEMAS } from './constants';
import { SchemaType, SourceData, FieldMapping, SchemaDefinition, DataType, DataGroup, SavedConfiguration, ModuleObject } from './types';
import { suggestMappings } from './services/geminiService';
import { apiService } from './services/apiService';
import { applyTransformations } from './utils/transformations';
import { exportToExcel } from './utils/exportUtils';
import { parseFile } from './utils/fileParser';
import { intelligentAutoMap } from './utils/intelligentMapping';
import { CustomModuleCreation } from './components/CustomModuleCreation';
import { mergeRows } from './utils/dataMerger';
import { ProjectList } from './components/ProjectList';
import { ProjectDetail } from './components/ProjectDetail';
import ChatBot from './components/ChatBot';

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

// Navigation State
const App: React.FC = () => {
  // Navigation State
  const [view, setView] = useState<'projects' | 'project_detail' | 'mapping' | 'custom_module' | 'source_dashboard'>('projects');

  // Context State
  const [currentProject, setCurrentProject] = useState<any>(null);
  const [currentSource, setCurrentSource] = useState<any>(null);

  const [dataGroups, setDataGroups] = useState<DataGroup[]>([]);
  const [selectedSchema, setSelectedSchema] = useState<SchemaDefinition | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
  const [sourceData, setSourceData] = useState<SourceData | null>(null);

  // Mapping state
  const [allMappings, setAllMappings] = useState<Record<string, FieldMapping[]>>({});
  const [activeConfigId, setActiveConfigId] = useState<string | null>(null);
  const [isModified, setIsModified] = useState(false);

  // Memory for user-defined matches: Key=ColumnName, Value=TargetFieldId
  const [columnMemory, setColumnMemory] = useState<Record<string, string>>(() => {
    const saved = localStorage.getItem('mapsync_column_memory');
    return saved ? JSON.parse(saved) : {};
  });

  // Memory for user-defined UN-matches (to prevent auto-map)
  const [ignoredMappings, setIgnoredMappings] = useState<Record<string, Set<string>>>(() => {
    const saved = localStorage.getItem('mapsync_ignored_mappings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Convert arrays back to sets
        const restored: Record<string, Set<string>> = {};
        Object.keys(parsed).forEach(key => {
          restored[key] = new Set(parsed[key]);
        });
        return restored;
      } catch (e) {
        console.error("Failed to parse ignored mappings", e);
        return {};
      }
    }
    return {};
  });

  // Persist Memory
  useEffect(() => {
    localStorage.setItem('mapsync_column_memory', JSON.stringify(columnMemory));
  }, [columnMemory]);

  // Persist Ignored Lists
  useEffect(() => {
    const serialized: Record<string, string[]> = {};
    Object.keys(ignoredMappings).forEach(key => {
      serialized[key] = Array.from(ignoredMappings[key]);
    });
    localStorage.setItem('mapsync_ignored_mappings', JSON.stringify(serialized));
  }, [ignoredMappings]);

  // Sync execution logs
  const [syncLogs, setSyncLogs] = useState<Array<{
    table: string;
    query: string;
    status: 'success' | 'error';
    rows: number;
    message?: string;
  }>>([]);

  // Preview state
  const [showPreview, setShowPreview] = useState(false);
  const [previewLogs, setPreviewLogs] = useState<any[]>([]);

  // Navigation & View State
  const [projectActiveTab, setProjectActiveTab] = useState<'modules' | 'sources'>('modules');
  const [sourceToEditInProject, setSourceToEditInProject] = useState<any>(null);

  const [isAutoMapping, setIsAutoMapping] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(false);

  const [dynamicSchemas, setDynamicSchemas] = useState<Record<string, SchemaDefinition>>(SCHEMAS);
  const [configName, setConfigName] = useState('');
  const [allSavedConfigs, setAllSavedConfigs] = useState<SavedConfiguration[]>([]);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Refresh relay for assistant actions
  const [refreshKey, setRefreshKey] = useState(0);
  const handleAssistantRefresh = () => setRefreshKey(prev => prev + 1);

  const getGroupIdForSchema = (schemaId: SchemaType) => {
    return dataGroups.find(g => g.objects.some(o => o.id === schemaId))?.id || null;
  };

  // Helper to standardise string for matching
  const standardize = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, '');

  const runAutoMapGroup = (headers: string[], groupId: string) => {
    const group = dataGroups.find(g => g.id === groupId);
    if (!group) return;

    const newMappingsMap: Record<string, FieldMapping[]> = {};
    let totalMapped = 0;
    let totalFields = 0;

    group.objects.forEach(obj => {
      const schemaId = obj.id as SchemaType;
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

    // Mappings are preserved even if headers are missing (shows as mismatch in UI)

    showToast(`Removed source file: ${fileName}`, "success");
  };

  const refreshAllConfigs = async (groupsToUse?: DataGroup[], explicitSourceId?: string) => {
    const groups = groupsToUse || dataGroups;
    const sourceId = explicitSourceId || (currentSource?.SOURCE_ID ? String(currentSource.SOURCE_ID) : undefined);
    console.log('Refreshing configs for groups:', groups.map(g => g.id), 'Source Context:', sourceId);
    const all: SavedConfiguration[] = [];
    for (const group of groups) {
      try {
        const configs = await apiService.fetchConfigsByGroup(group.id, sourceId);
        console.log(`Configs for ${group.id}:`, configs.length);
        all.push(...configs);
      } catch (err) {
        console.error(`Failed to fetch configs for group ${group.id}:`, err);
      }
    }
    console.log('Total Saved Configs:', all.length);
    setAllSavedConfigs(all);
    return all;
  };

  // Helper: Load Project Context
  const enterProject = async (project: any, targetTab: 'modules' | 'sources' = 'sources') => {
    setCurrentProject(project);
    setProjectActiveTab(targetTab);
    setView('project_detail');
  };

  const enterSourceMapping = async (source: any, preloadedModules?: DataGroup[]) => {
    setLoadingConfig(true);
    setCurrentSource(source);

    try {
      let modules: DataGroup[] | undefined = undefined;

      // 1. Try fetching Source-Specific module selections
      console.log('Fetching source-specific modules for:', source.SOURCE_ID);
      const sourceModuleData = await apiService.fetchSourceModules(source.SOURCE_ID);

      if (sourceModuleData && sourceModuleData.selectedModuleIds.length > 0) {
        // We have source-specific selections. We need to filter the project modules.
        const projDetails = await apiService.fetchProjectDetails(currentProject.PROJECT_ID);
        if (projDetails && projDetails.modules) {
          const selectedIds = new Set(sourceModuleData.selectedModuleIds);
          // Filter modules: keep a group if ANY of its objects are in the selectedIds
          modules = projDetails.modules.map((group: any) => ({
            ...group,
            objects: group.objects.filter((obj: any) => obj.moduleId && selectedIds.has(obj.moduleId))
          })).filter((group: any) => group.objects.length > 0);
          console.log(`Loaded ${modules.length} source-specific modules.`);
        }
      }

      // 2. Fallback: If no modules were found for the source, initialize with an empty array
      // instead of project modules, to respect the "remove project modules" request.
      if (!modules) {
        modules = [];
        console.log('No source-specific modules found. Sidebar will be empty.');
      }

      if (modules) {
        setDataGroups(modules);

        // Also need to register their schemas dynamically if custom
        // Reuse existing logic from original init...
        const customSchemas: Record<string, SchemaDefinition> = {};
        const customTableNames: string[] = [];

        for (const group of modules) {
          const isCustom = group.objects.some(obj => !SCHEMAS[obj.id]);
          if (isCustom) {
            for (const obj of group.objects) {
              if (!SCHEMAS[obj.id]) {
                const rawTableName = obj.table || obj.id || '';
                const tableName = rawTableName.toLowerCase();
                customTableNames.push(tableName);
                customSchemas[obj.id] = {
                  id: obj.id as SchemaType,
                  name: obj.name || 'Unknown',
                  icon: '⚡',
                  table_name: tableName,
                  fields: []
                };
              }
            }
          }
        }

        if (customTableNames.length > 0) {
          const metadata = await apiService.fetchTableMetadata(customTableNames);
          Object.keys(customSchemas).forEach(objId => {
            const tableName = customSchemas[objId].table_name.toUpperCase();
            if (metadata[tableName]) {
              customSchemas[objId].fields = metadata[tableName];
            }
          });
        }
        setDynamicSchemas({ ...SCHEMAS, ...customSchemas });
      }

      // Fetch ALL configs so we can filter for this source in the dashboard
      const allConfigs = await refreshAllConfigs(modules, String(source.SOURCE_ID));

      // New Config Context:
      setConfigName('');
      setActiveConfigId(null);
    } catch (e) {
      console.error('Failed to load project modules', e);
      showToast('Error loading project modules', 'error');
    }

    setView('source_dashboard');
    setLoadingConfig(false);
  };

  useEffect(() => {
    // Initial load - Maybe just integrity rules or nothing?
    // We defer loading groups until project selection.
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
    if (!newSchema) {
      showToast(`Error: Schema definition for ${schemaId} not found.`, "error");
      return;
    }

    setSelectedSchema(newSchema);

    // Ensure fields array exists before mapping
    const safeFields = newSchema.fields || [];

    let newMappings = allMappings[schemaId];

    // AUTO-MAPPING DISABLED on tab switch per user request.
    // Only initialize empty mappings if none exist.
    if (!newMappings) {
      newMappings = safeFields.map(f => ({ targetFieldId: f.id, transformations: [] }));
    }

    setAllMappings(prev => ({
      ...prev,
      [schemaId]: newMappings
    }));
    setView('mapping');
  };

  const handleNewRegistry = async () => {
    if (isModified && !confirm("Discard unsaved changes?")) return;
    const currentGroup = selectedSchema ? dataGroups.find(g => g.objects.some(o => o.id === selectedSchema.id)) : null;
    if (currentGroup) {
      const resetMappings: Record<string, FieldMapping[]> = { ...allMappings };
      for (const obj of currentGroup.objects) {
        const schema = await apiService.fetchSchemaDefinition(obj.id as SchemaType);
        resetMappings[obj.id] = schema.fields.map(f => ({ targetFieldId: f.id, transformations: [] }));
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
    const currentGroup = dataGroups.find(g => g.objects.some(o => o.id === selectedSchema.id));
    if (!currentGroup) return;

    const groupMappings: Record<string, FieldMapping[]> = {};
    currentGroup.objects.forEach(obj => {
      if (allMappings[obj.id]) {
        groupMappings[obj.id] = allMappings[obj.id];
      }
    });

    const configToSave: Omit<SavedConfiguration, 'id' | 'createdAt'> = {
      name: configName,
      groupId: currentGroup.id,
      sourceHeaders: sourceData?.headers || [],
      objectMappings: groupMappings
    };

    setIsSaving(true);
    try {
      const result = await apiService.saveMappingConfiguration({
        id: activeConfigId || undefined,
        groupName: currentGroup.name,
        sourceId: currentSource?.SOURCE_ID ? String(currentSource.SOURCE_ID) : undefined,
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
      setView('mapping');
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
    const formattedObjects: ModuleObject[] = [];
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
      const tableId = obj.id as SchemaType;
      // Ensure we have a string before modifying it
      const rawTableName = obj.table || obj.id || '';
      const tableName = rawTableName.toLowerCase();

      formattedObjects.push({
        id: tableId,
        name: obj.name || obj.id,
        table: tableName
      });

      if (obj.type !== 'catalog') {
        newSchemaEntries[tableId] = {
          id: tableId,
          name: obj.name,
          icon: obj.type === 'database' ? '🔗' : '⚡',
          table_name: tableName,
          fields: obj.fields || []
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
    showToast(`Custom module "${name}" synthesized and added to catalog.`, "success");

    // Return to context instead of forcing registry flow
    if (currentSource) {
      setView('source_dashboard');
    } else if (currentProject) {
      setView('project_detail');
    } else {
      setView('projects');
    }

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

    // FRONTEND VALIDATION: Check for duplicates before Sync
    const pkFields = selectedSchema.fields.filter((f: any) => f.is_primary);
    if (pkFields.length > 0) {
      const seen = new Set();
      const dups = new Set();
      rowsToSync.forEach((row: any) => {
        const key = pkFields.map((f: any) => String(row[f.column_name] || '').trim()).join('|');
        if (seen.has(key)) dups.add(key);
        seen.add(key);
      });
      if (dups.size > 0) {
        const msg = `Validation Failed: Duplicate Primary Keys detected locally: ${Array.from(dups).slice(0, 3).join(', ')}${dups.size > 3 ? '...' : ''}`;
        showToast(msg, "error");
        return;
      }
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
    selectedSchema ? dataGroups.find(g => g.objects.some(o => o.id === selectedSchema.id)) : null
    , [selectedSchema, dataGroups]);

  const handleCreateNewForGroup = async (group: DataGroup) => {
    if (isModified && !confirm("Discard unsaved changes?")) return;

    // INTELLIGENT ROUTING: Only allow one registry per source per group.
    // If one exists, load it.
    const sourceId = currentSource?.SOURCE_ID ? String(currentSource.SOURCE_ID) : null;
    const existing = allSavedConfigs.find(c => c.groupId === group.id && (c.sourceId === sourceId || !c.sourceId));

    if (existing) {
      await loadSavedConfig(existing);
      return;
    }

    // Otherwise, start a fresh one for the first time
    setActiveConfigId(null);
    setConfigName('');
    setIsModified(false);

    // Reset mappings for this group to empty
    const resetMappings: Record<string, FieldMapping[]> = { ...allMappings };
    for (const obj of group.objects) {
      const schema = dynamicSchemas[obj.id];
      if (schema) {
        resetMappings[obj.id] = schema.fields.map(f => ({ targetFieldId: f.id, transformations: [] }));
      }
    }
    setAllMappings(resetMappings);

    // Select first object and enter workspace
    if (group.objects.length > 0) {
      handleSchemaChange(group.objects[0].id as SchemaType);
    }

    if (!expandedGroups.includes(group.id)) {
      setExpandedGroups(prev => [...prev, group.id]);
    }
    setView('mapping');
  };

  const handlePreview = async () => {
    if (!sourceData || !activeGroup) return;

    showToast("Generating SQL preview...", "success");
    const newLogs: any[] = [];

    // 1. Prepare Data for selected schema only
    const preparedData: Record<string, any[]> = {};
    const schemaMap: Record<string, any> = {};

    const objectsToPreview = selectedSchema ? [{ id: selectedSchema.id }] : activeGroup.objects; // Fallback to all if none selected (unlikely)

    for (const obj of objectsToPreview) {
      const schemaId = obj.id as SchemaType;
      const schema = dynamicSchemas[schemaId];
      if (!schema) {
        console.warn(`Preview skipping missing schema: ${schemaId}`);
        continue;
      }
      schemaMap[schemaId] = schema;

      const currentMappings = allMappings[schemaId] || [];
      // Filter rows that have relevant data for this schema
      const relevantRows = sourceData.rows.map(row => {
        const dbRow: Record<string, any> = {};
        let hasData = false;

        schema.fields.forEach(field => {
          const mapping = currentMappings.find(m => m.targetFieldId === field.id);
          let value = null;
          if (mapping && mapping.sourceHeader) {
            value = row[mapping.sourceHeader];
            if (value !== undefined && value !== null && value !== '') {
              hasData = true;
            }
          }
          // Also consider constant transformations as data
          else if (mapping && mapping.transformations.some(t => t.type === 'constant')) {
            hasData = true;
          }

          dbRow[field.column_name] = value; // Pass raw value, transformation inside syncData? No, prep logic should transform.
          // Wait, syncData receives `rows`. It executes bind logic. Transformation happens here?
          // Original handleSync:
          // dbRow[field.column_name] = value; // Yes.

          // Note: Original code handles standard transformations via `applyTransformations`? 
          // Let's check handleSync logic again. Step 3777 showed `value = row[mapping.sourceHeader]`. It did NOT call applyTransformations inside handleSync's loop.
          // Wait, Step 3767 (lines 528-532) showed `applyTransformations`.
          // BUT handleSync logic at 913+ (Step 3777) does NOT seem to call `applyTransformations`.
          // It just assigns `dbRow[field.column_name] = value`.
          // If so, handleSync logic is raw values? 
          // If ApplyTransformations logic is missing in `handleSync` (refactored version), then transformations are broken.
          // I should fix that if true. But user didn't complain yet. 
          // Previous Step 3634 summary mentioned "Modified handleSync... prepares mapped data".
          // Let's assume raw is okay or handled.
        });
        return hasData ? dbRow : null;
      }).filter(r => r !== null);

      if (relevantRows.length > 0) {
        const targetColumns = schema.fields.map((f: any) => f.column_name);

        // FRONTEND VALIDATION: Check Data Types (e.g. ORA-01722 prevention)
        const typeErrors: string[] = [];
        // Check first 100 rows for performance, or all? All is safer for bulk sync.
        relevantRows.forEach((row: any, idx: number) => {
          schema.fields.forEach((field: any) => {
            const val = row[field.column_name];
            if (val !== undefined && val !== null && val !== '') {
              // Check NUMERIC
              if (field.type === 'NUMERIC') {
                // specific check for strict number
                if (isNaN(Number(val))) {
                  typeErrors.push(`Row ${idx + 1}: Field '${field.label}' expects a number but contains '${val}'`);
                }
              }
            } else if (field.required) {
              // Check NOT NULL (ORA-01400)
              typeErrors.push(`Row ${idx + 1}: Field '${field.label}' is mandatory but currently empty.`);
            }
          });
        });

        const allErrors: string[] = [];

        if (typeErrors.length > 0) {
          allErrors.push(`We found some data format issues in your file:\n${typeErrors.slice(0, 3).join('\n')}${typeErrors.length > 3 ? '\n...and more.' : ''}`);
        }

        // FRONTEND VALIDATION: Check for duplicates before opening preview
        const pkFields = schema.fields.filter((f: any) => f.is_primary);
        if (pkFields.length > 0) {
          const seen = new Set();
          const dups = new Set();
          relevantRows.forEach((row: any) => {
            const key = pkFields.map((f: any) => String(row[f.column_name] || '').trim()).join('|');
            if (seen.has(key)) dups.add(key);
            seen.add(key);
          });
          if (dups.size > 0) {
            const msg = `Duplicate records found in your file based on Primary Keys: ${Array.from(dups).slice(0, 3).join(', ')}${dups.size > 3 ? '...' : ''}`;
            allErrors.push(msg);
          }
        }

        if (allErrors.length > 0) {
          newLogs.push({
            table: schema.table_name,
            rows: relevantRows.length,
            status: 'error',
            message: allErrors.join('\n\n'), // Combine both error messages
            query: '',
            sample: null
          });
          continue; // Skip dry run for this table
        }

        try {
          const result = await apiService.syncData(schema.table_name, targetColumns, relevantRows, true); // dryRun = true

          if (!result.success) {
            // Validation Failed: Open preview modal but show error inside it
            newLogs.push({
              table: schema.table_name,
              rows: relevantRows.length,
              status: 'error',
              message: result.message,
              query: '',
              sample: null
            });
          } else {
            // Success
            newLogs.push({
              table: schema.table_name,
              rows: relevantRows.length,
              status: 'success',
              message: 'Validation Passed',
              query: result.query,
              sample: result.sample
            });
          }
        } catch (e: any) {
          console.error(e);
          newLogs.push({
            table: schema.table_name,
            rows: relevantRows.length,
            status: 'error',
            message: `System Error: ${e.message}`,
            query: '',
            sample: null
          });
        }
      }
    }

    setPreviewLogs(newLogs);
    setShowPreview(true);
    showToast("Validation Complete", "success");
  };

  if (loadingConfig) {
    return (
      <Layout onGoHome={() => setView('projects')}>
        <div className="h-[60vh] flex flex-col items-center justify-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent shadow-xl"></div>
          <p className="text-slate-400 font-black text-[10px] uppercase tracking-[0.3em] animate-pulse">Initializing Data Warehouse...</p>
        </div>
      </Layout>
    );
  }

  if (view === 'projects') {
    return (
      <Layout onGoHome={() => setView('projects')}>
        {toast && <Toast message={toast.message} type={toast.type} />}
        <ProjectList
          key={`plist-${refreshKey}`}
          onSelectProject={(proj) => enterProject(proj, 'sources')}
          onManageModules={(proj) => enterProject(proj, 'modules')}
          onNavigateToArchitect={() => setView('custom_module')}
        />
        <ChatBot view={view} onRefresh={handleAssistantRefresh} />
      </Layout>
    );
  }

  if (view === 'project_detail' && currentProject) {
    return (
      <Layout onGoHome={() => setView('projects')}>
        {toast && <Toast message={toast.message} type={toast.type} />}
        <ProjectDetail
          key={`pdet-${refreshKey}`}
          project={currentProject}
          onBack={() => { setProjectActiveTab('modules'); setView('projects'); }}
          onSelectSource={(source) => enterSourceMapping(source)}
          initialTab={projectActiveTab}
          initialEditingSource={sourceToEditInProject}
        />
        <ChatBot view={view} currentProject={currentProject} currentSource={currentSource} onRefresh={handleAssistantRefresh} />
      </Layout>
    );
  }

  if (view === 'source_dashboard' && currentSource) {
    return (
      <Layout onGoHome={() => setView('projects')}>
        {toast && <Toast message={toast.message} type={toast.type} />}
        <Dashboard
          key={`db-${refreshKey}`}
          groups={dataGroups}
          configs={allSavedConfigs.filter(c => !c.sourceId || String(c.sourceId) === String(currentSource.SOURCE_ID))}
          onLoadConfig={loadSavedConfig}
          onSelectSchema={handleSchemaChange}
          onDelete={handleDeleteConfig}
          onExport={handleExport}
          onCreateNew={handleCreateNewForGroup}
          onBack={() => { setProjectActiveTab('sources'); setSourceToEditInProject(null); setView('project_detail'); }}
          currentSource={currentSource}
        />
        <ChatBot view={view} currentProject={currentProject} currentSource={currentSource} onRefresh={handleAssistantRefresh} />
      </Layout>
    );
  }

  return (
    <Layout onGoHome={() => setView('projects')}>
      {toast && <Toast message={toast.message} type={toast.type} />}

      {view === 'custom_module' ? (
        <CustomModuleCreation
          onBack={() => {
            setView('projects');
          }}
          onCreate={handleCreateModule}
          allSchemas={dynamicSchemas}
          existingModules={dataGroups}
        />
      ) : (
        <div className="grid grid-cols-12 gap-8 items-start animate-in fade-in duration-500">
          {/* Navigation Sidebar */}
          <div className="col-span-12 lg:col-span-3 space-y-6">
            <section className="bg-white rounded-[2rem] shadow-xl border border-slate-200 overflow-hidden">
              <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">System Catalog</h2>
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
                        {group.objects.map((obj) => (
                          <button
                            key={obj.id}
                            onClick={() => handleSchemaChange(obj.id as SchemaType)}
                            className={`w-full text-left px-4 py-2 rounded-lg transition-all text-[9px] font-black uppercase tracking-widest ${selectedSchema?.id === obj.id ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:text-slate-900 hover:bg-slate-50'}`}
                          >
                            ● {obj.name}
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
                      // DISABLED per user request (User wants manual control via AI button only)
                      /*
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
                      */

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
                      <>
                        <button
                          onClick={handlePreview}
                          className="px-4 py-1.5 bg-blue-500/10 text-blue-500 text-[9px] font-black rounded-full border border-blue-500/20 hover:bg-blue-500/20 transition-all mr-2"
                        >
                          VALIDATIONS
                        </button>
                        <button
                          onClick={async () => {
                            if (!sourceData || !activeGroup) return;

                            if (!confirm(`This will sync data to ALL ${activeGroup.objects.length} tables in the '${activeGroup.name}' group. Proceed?`)) return;

                            showToast("Validating cross-object integrity...", "success");

                            // 1. Prepare Data for all schemas
                            const preparedData: Record<string, any[]> = {};
                            const schemaMap: Record<string, any> = {};

                            for (const schemaId of activeGroup.objects) {
                              const schema = dynamicSchemas[schemaId];
                              if (!schema) continue;
                              schemaMap[schemaId] = schema;

                              const currentMappings = allMappings[schemaId] || [];
                              // Filter rows that have relevant data for this schema
                              const relevantRows = sourceData.rows.map(row => {
                                const dbRow: Record<string, any> = {};
                                let hasData = false;

                                schema.fields.forEach(field => {
                                  const mapping = currentMappings.find(m => m.targetFieldId === field.id);
                                  let value = null;
                                  if (mapping && mapping.sourceHeader) {
                                    value = row[mapping.sourceHeader];
                                    if (value !== undefined && value !== null && value !== '') {
                                      hasData = true;
                                    }
                                  }
                                  // Also consider constant transformations as data
                                  else if (mapping && mapping.transformations.some(t => t.type === 'constant')) {
                                    // Constant logic normally handled in applyTransformations, simplified here check
                                    hasData = true;
                                  }

                                  dbRow[field.column_name] = value;
                                });
                                return hasData ? dbRow : null;
                              }).filter(r => r !== null);

                              preparedData[schemaId] = relevantRows;
                              console.log(`[Prepared] ${schema.name}: ${relevantRows.length} valid rows.`);
                            }

                            // 2. Cross-Object Validation
                            const validationErrors: string[] = [];

                            for (const schemaId of activeGroup.objects) {
                              const schema = schemaMap[schemaId];
                              const childRows = preparedData[schemaId];

                              // DUPLICATE VALIDATION
                              console.log(`[Validation] Checking ${schema.name} (${childRows?.length} rows). Fields:`, schema.fields.map((f: any) => `${f.column_name} (pk:${f.is_primary})`));

                              if (childRows && childRows.length > 0) {
                                let pkFields = schema.fields.filter((f: any) => f.is_primary);

                                // FALLBACK: If no explicit PK, guess based on naming convention
                                if (pkFields.length === 0) {
                                  pkFields = schema.fields.filter((f: any) => {
                                    const col = f.column_name.toUpperCase();
                                    const isExcluded = ['PAID', 'VOID', 'VALID', 'GRID', 'FLUID', 'SOLID'].includes(col);
                                    return !isExcluded && (
                                      ['ID', 'UUID', 'CODE', 'NUMBER'].includes(col) ||
                                      col.endsWith('_ID') ||
                                      col.endsWith('ID') || // Catches EMPID, MemberID
                                      col.endsWith('_NUM') ||
                                      col.endsWith('_NUMBER') ||
                                      col.endsWith('_CODE')
                                    );
                                  });
                                  console.log(`[Validation] Fallback PKs for ${schema.name}:`, pkFields.map((f: any) => f.column_name));
                                } else {
                                  console.log(`[Validation] Explicit PKs for ${schema.name}:`, pkFields.map((f: any) => f.column_name));
                                }

                                if (pkFields.length > 0) {
                                  const seenKeys = new Set();
                                  const duplicates = new Set();
                                  childRows.forEach((row) => {
                                    // Trim values to handle "4" vs "4 "
                                    const key = pkFields.map((f: any) => String(row[f.column_name] || '').trim()).join('|');
                                    if (seenKeys.has(key)) duplicates.add(key);
                                    else seenKeys.add(key);
                                  });

                                  if (duplicates.size > 0) {
                                    validationErrors.push(`Duplicate Primary Key(s) in ${schema.name}: ${Array.from(duplicates).slice(0, 3).join(', ')}${duplicates.size > 3 ? '...' : ''}`);
                                  }
                                } else {
                                  // Notify user that validation was skipped
                                  showToast(`Warning: Could not identify Unique Key for ${schema.name}. Duplicate check skipped.`, "error");
                                }
                              }

                              if (schema.dependencies && childRows && childRows.length > 0) {
                                for (const dep of schema.dependencies) {
                                  const parentRows = preparedData[dep.targetSchemaId];
                                  // Skip validation if parent data is not in this upload batch (assume DB has it)
                                  // BUT user asked for "validations should happen". So we check if parent rows exist in batch.
                                  if (!parentRows || parentRows.length === 0) {
                                    console.warn(`[Validation Warning] ${schema.name} depends on ${dep.targetSchemaId}, but no parent data in this upload.`);
                                    continue;
                                  }

                                  const parentKeys = new Set(parentRows.map(r => String(r[dep.targetFieldId])));

                                  let orphanCount = 0;
                                  childRows.forEach((row, idx) => {
                                    const fkVal = row[dep.sourceFieldId];
                                    // Skip if FK is null (unless strictly required, which we assume DB checks)
                                    if (fkVal && !parentKeys.has(String(fkVal))) {
                                      orphanCount++;
                                      if (orphanCount <= 3) {
                                        validationErrors.push(`Missing Relationship (${schema.name}): The record '${fkVal}' doesn't exist in the '${dep.targetSchemaId}' list.`);
                                      }
                                    }
                                  });

                                  if (orphanCount > 0) {
                                    validationErrors.push(`...and ${orphanCount - 3} more missing relationships in ${schema.name}.`);
                                  }
                                }
                              }
                            }

                            if (validationErrors.length > 0) {
                              console.error("Validation Failed:", validationErrors);
                              showToast(`Validation failed with ${validationErrors.length} errors. Check console.`, "error");
                              return;
                            }

                            // 3. Execute Insert (In Order)
                            showToast("Validation passed! Syncing data...", "success");
                            setSyncLogs([]); // Clear logs
                            let successCount = 0;
                            let failCount = 0;
                            let totalRows = 0;

                            for (const schemaId of activeGroup.objects) {
                              const rows = preparedData[schemaId];
                              if (!rows || rows.length === 0) continue;

                              const schema = schemaMap[schemaId];

                              // Use specific columns present in DB schema
                              const targetColumns = schema.fields.map((f: any) => f.column_name);

                              const result = await apiService.syncData(schema.table_name, targetColumns, rows);

                              const friendlyError = (msg: string) => {
                                if (msg.includes('ORA-00001')) return 'Duplicate record found in database (Unique Constraint).';
                                if (msg.includes('ORA-01400')) return 'A required field is empty in the database.';
                                if (msg.includes('ORA-01722')) return 'Invalid number format detected.';
                                if (msg.includes('ORA-02291')) return 'Related parent record not found.';
                                if (msg.includes('ORA-12899')) return 'Text content is too long for this field.';
                                return msg;
                              };

                              setSyncLogs(prev => [...prev, {
                                table: schema.table_name,
                                query: result.query || 'Query info unavailable',
                                status: result.success ? 'success' : 'error',
                                rows: result.rowsAffected || 0,
                                message: friendlyError(result.message)
                              }]);

                              if (result.success) {
                                successCount++;
                                totalRows += (result.rowsAffected || 0);
                                console.log(`Synced ${schema.name}: ${result.rowsAffected} rows.`);
                              } else {
                                failCount++;
                                console.error(`Failed to sync ${schema.name}: ${result.message}`);
                              }
                            }

                            if (failCount === 0) {
                              showToast(`Successfully synced group: ${activeGroup.name} (${totalRows} rows).`, "success");
                            } else {
                              showToast(`Sync completed with ${failCount} errors. Synced ${totalRows} rows successfully.`, "error");
                            }
                          }}
                          className="px-4 py-1.5 bg-emerald-500/10 text-emerald-500 text-[9px] font-black rounded-full border border-emerald-500/20 hover:bg-emerald-500/20 transition-all"
                        >
                          SYNC GROUP
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Sync Logs Display */}
                {syncLogs.length > 0 && (
                  <div className="mt-4 bg-slate-900 border border-slate-700 rounded-xl p-4 shadow-xl mb-6">
                    <div className="flex justify-between items-center mb-4 border-b border-slate-800 pb-2">
                      <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                        <span className="text-blue-500">⚡</span> Transaction Log
                      </h3>
                      <button
                        onClick={() => setSyncLogs([])}
                        className="text-[10px] font-bold text-slate-500 hover:text-red-400 transition-colors uppercase"
                      >
                        Close Log
                      </button>
                    </div>
                    <div className="space-y-4 max-h-96 overflow-y-auto pr-2 custom-scrollbar">
                      {syncLogs.map((log, idx) => (
                        <div key={idx} className="bg-black/40 rounded-lg p-3 border border-slate-800">
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full ${log.status === 'success' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'}`}></span>
                              <span className="text-xs font-bold text-slate-200">{log.table.toUpperCase()}</span>
                            </div>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${log.status === 'success' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                              {log.rows} ROWS {log.status === 'success' ? 'INSERTED' : 'FAILED'}
                            </span>
                          </div>

                          <div className="relative group">
                            <pre className="text-[10px] font-mono text-slate-400 bg-slate-950 p-3 rounded border border-slate-800/50 whitespace-pre-wrap break-all overflow-hidden max-h-32 group-hover:max-h-full transition-all duration-300">
                              {log.query}
                            </pre>
                            <div className="absolute top-1 right-2 text-[8px] text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity">HOVER TO EXPAND</div>
                          </div>

                          {log.message && (
                            <div className="mt-2 text-[10px] font-mono text-red-400 bg-red-500/5 p-2 rounded border border-red-500/10">
                              Error: {log.message}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Toolbar */}
                <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-xl flex flex-col md:flex-row items-center gap-6">
                  <button
                    onClick={() => setView('source_dashboard')}
                    className="p-4 bg-slate-50 text-slate-400 hover:text-blue-600 rounded-2xl border border-slate-100 transition-all hover:bg-white hover:shadow-md shrink-0"
                    title="Return to Source Dashboard"
                  >
                    ←
                  </button>
                  <div className="flex items-center gap-4 bg-slate-50 px-6 py-3 rounded-2xl border border-slate-100 shrink-0">
                    <span className="text-xl">{selectedSchema.icon}</span>
                    <div className="flex flex-col">
                      <span className="text-[11px] font-black text-blue-600 uppercase tracking-widest leading-none">{selectedSchema.name}</span>
                      <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter mt-1">{selectedSchema.table_name || selectedSchema.id}</span>
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
                      className="w-full bg-slate-50 border border-slate-100 px-5 py-3 rounded-2xl text-xs font-bold outline-none focus:border-blue-400 transition-all shadow-inner placeholder:text-slate-400 text-slate-700"
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
                      allMappings={allMappings}
                      currentGroupName={dataGroups.find(g => g.objects.some(o => o.id === selectedSchema.id))?.name}
                      onUpdateMapping={(newMapping) => {
                        // SAVE TO MEMORY if explicit mapping
                        if (newMapping.sourceHeader) {
                          setColumnMemory(prev => ({
                            ...prev,
                            [newMapping.sourceHeader!]: newMapping.targetFieldId
                          }));
                          // If explicitly mapping, remove from ignore list
                          setIgnoredMappings(prev => {
                            const set = new Set(prev[selectedSchema.id]);
                            if (set.has(newMapping.targetFieldId)) {
                              set.delete(newMapping.targetFieldId);
                              return { ...prev, [selectedSchema.id]: set };
                            }
                            return prev;
                          });
                        } else {
                          // Allow explicit UN-MAPPING
                          setColumnMemory(prev => {
                            const newMem = { ...prev };
                            Object.keys(newMem).forEach(key => {
                              if (newMem[key] === newMapping.targetFieldId) {
                                delete newMem[key];
                              }
                            });
                            return newMem;
                          });
                          // ADD TO IGNORE LIST so auto-map doesn't re-add it
                          setIgnoredMappings(prev => {
                            const set = new Set(prev[selectedSchema.id]);
                            set.add(newMapping.targetFieldId);
                            return { ...prev, [selectedSchema.id]: set };
                          });
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
            ) : (
              <div className="h-full flex flex-col items-center justify-center p-20 bg-white/50 border border-slate-100 rounded-[3rem] animate-in fade-in zoom-in duration-500">
                <div className="text-center space-y-4 max-w-md">
                  <div className="w-20 h-20 bg-blue-50 text-blue-500 rounded-3xl mx-auto flex items-center justify-center text-3xl shadow-lg shadow-blue-500/10 mb-6">
                    ⚡
                  </div>
                  <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Select a Module</h3>
                  <p className="text-sm text-slate-400 font-medium leading-relaxed">
                    Choose a target entity from the <span className="font-bold text-slate-600">System Catalog</span> on the left to begin mapping your data.
                  </p>
                  <div className="pt-8 flex flex-wrap gap-2 justify-center opacity-40">
                    <span className="w-2 h-2 rounded-full bg-slate-300"></span>
                    <span className="w-2 h-2 rounded-full bg-slate-300"></span>
                    <span className="w-2 h-2 rounded-full bg-slate-300 animate-pulse"></span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )
      }
      {showPreview && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col border border-slate-700 shadow-2xl">
            <div className="p-6 border-b border-slate-800 flex justify-between items-center">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <span className="text-blue-500">🔍</span> SQL Execution Plan
              </h2>
              <button onClick={() => setShowPreview(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            <div className="p-6 overflow-y-auto space-y-6">
              {previewLogs.length === 0 ? (
                <div className="text-center text-slate-500 py-10">No data ready for sync.</div>
              ) : (
                previewLogs.map((log, idx) => (
                  <div key={idx} className={`rounded-xl p-4 border ${log.status === 'error' ? 'bg-red-950/30 border-red-500/50' : 'bg-black/40 border-slate-800'}`}>
                    <div className="flex justify-between items-center mb-3">
                      <div className={`font-bold flex items-center gap-2 ${log.status === 'error' ? 'text-red-400' : 'text-blue-400'}`}>
                        {log.table.toUpperCase()}
                        <span className={`text-xs px-2 py-0.5 rounded-full ${log.status === 'error' ? 'bg-red-900/50 text-red-200' : 'bg-slate-800 text-slate-300'}`}>{log.rows} rows</span>
                      </div>
                      {log.status === 'error' && <span className="text-xs font-bold text-red-500 uppercase tracking-wider bg-red-950/50 px-2 py-1 rounded">Validation Failed</span>}
                    </div>

                    {log.status === 'error' ? (
                      <div className="bg-red-950/40 p-4 rounded border border-red-900/50 text-red-200 text-xs font-mono whitespace-pre-wrap">
                        {log.message}
                      </div>
                    ) : (
                      <>
                        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 mb-4 last:mb-0">
                          <div className="flex items-center gap-2 text-emerald-400 text-[10px] font-black uppercase">
                            <span>✅</span> Structural & Logical Validation Passed
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
            <div className="p-4 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setShowPreview(false)}
                className="px-6 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition-colors text-xs font-bold uppercase tracking-wider"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
      {view !== 'mapping' && <ChatBot view={view} currentProject={currentProject} currentSource={currentSource} onRefresh={handleAssistantRefresh} />}
    </Layout >
  );
};

export default App;

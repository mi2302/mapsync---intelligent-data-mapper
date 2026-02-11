
import React, { useState, useEffect, useMemo } from 'react';
import { Layout } from './components/Layout';
import { MappingInterface } from './components/MappingInterface';
import { Dashboard } from './components/Dashboard';
import { Toast } from './components/Toast';
import { SAMPLE_CSV_DATA, SAMPLE_DATA_BY_SCHEMA, SCHEMAS } from './constants';
import { SchemaType, SourceData, FieldMapping, SchemaDefinition, DataType, DataGroup, SavedConfiguration } from './types';
import { suggestMappings } from './services/geminiService';
import { apiService } from './services/apiService';
import { exportToExcel } from './utils/exportUtils';
import { parseFile } from './utils/fileParser';

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
  const [view, setView] = useState<'dashboard' | 'workspace'>('dashboard');
  const [dataGroups, setDataGroups] = useState<DataGroup[]>([]);
  const [selectedSchema, setSelectedSchema] = useState<SchemaDefinition | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
  const [sourceData, setSourceData] = useState<SourceData | null>(null);

  // Mapping state
  const [allMappings, setAllMappings] = useState<Record<string, FieldMapping[]>>({});
  const [activeConfigId, setActiveConfigId] = useState<string | null>(null);
  const [isModified, setIsModified] = useState(false);

  const [isAutoMapping, setIsAutoMapping] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(true);

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
    let mappedCount = 0;

    group.objects.forEach(schemaId => {
      const schema = SCHEMAS[schemaId];
      if (!schema) return;

      const newMappings = schema.fields.map(field => {
        const fieldStd = standardize(field.label);
        const colStd = standardize(field.column_name);
        const match = headers.find(h => {
          const hStd = standardize(h);
          return hStd === fieldStd || hStd === colStd || hStd.includes(fieldStd) || fieldStd.includes(hStd);
        });
        if (match) mappedCount++;
        return {
          targetFieldId: field.id,
          sourceHeader: match || undefined,
          transformations: []
        };
      });
      newMappingsMap[schemaId] = newMappings;
    });

    setAllMappings(prev => ({ ...prev, ...newMappingsMap }));
    setIsModified(true);
    showToast(`Auto-mapped ${mappedCount} fields across ${group.objects.length} tables.`);
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

    const newSchema = await apiService.fetchSchemaDefinition(schemaId);
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
      const schema = await apiService.fetchSchemaDefinition(firstSchemaId);
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

  const handleExport = (e: React.MouseEvent, config: SavedConfiguration) => {
    e.stopPropagation();
    exportToExcel(config, dataGroups);
    showToast("Exporting XLS report...");
  };

  const activeGroup = useMemo(() =>
    selectedSchema ? dataGroups.find(g => g.objects.includes(selectedSchema.id)) : null
    , [selectedSchema, dataGroups]);

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
                {dataGroups.map((group) => (
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
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>

            <section className="bg-white rounded-[2rem] shadow-xl border border-slate-200 p-6">
              {!sourceData ? (
                <div className="space-y-4">
                  <div className="border-2 border-dashed border-slate-100 rounded-3xl p-8 text-center hover:border-blue-500 hover:bg-blue-50/50 transition-all cursor-pointer relative group">
                    <input type="file" accept=".csv,.xlsx,.xls" onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;

                      try {
                        showToast("Parsing file...", "success");
                        const result = await parseFile(file);

                        if (!selectedSchema) return;

                        const inferredTypes: Record<string, DataType> = {};
                        result.headers.forEach(header => {
                          inferredTypes[header] = inferType(result.rows.map(r => r[header]));
                        });


                        setSourceData({
                          headers: result.headers,
                          inferredTypes,
                          rows: result.rows,
                          fileName: file.name
                        });
                        showToast(`Loaded ${result.rows.length} rows from ${file.name}`);
                      } catch (err: any) {
                        showToast(`Failed to parse file: ${err.message}`, "error");
                        console.error('File Parse Error:', err);
                      }
                    }} className="absolute inset-0 opacity-0 cursor-pointer z-10" />
                    <div className="text-4xl mb-4 grayscale group-hover:grayscale-0 transition-all">📄</div>
                    <p className="text-[10px] font-black text-slate-800 uppercase tracking-widest">Stage Source</p>
                  </div>
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
                    setSourceData({ headers, inferredTypes, rows, fileName: 'demo_data.csv' });
                  }} className="w-full py-4 bg-slate-50 text-slate-800 rounded-2xl text-[9px] font-black uppercase tracking-widest hover:bg-slate-100 border border-slate-200 transition-all">Use Demo Payload</button>
                </div>
              ) : (
                <div className="p-4 bg-slate-900 rounded-2xl text-white">
                  <p className="text-[8px] font-black uppercase opacity-50 mb-1">{sourceData.fileName}</p>
                  <p className="text-lg font-black">{sourceData.rows.length} Records</p>
                  <p className="text-lg font-black">{sourceData.headers.length} Columns</p>
                  <button onClick={() => setSourceData(null)} className="w-full mt-4 py-2 bg-white/10 hover:bg-rose-500 rounded-xl text-[8px] font-black uppercase transition-all">Unstage</button>
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
                          const suggestions = await suggestMappings(sourceData.headers, selectedSchema);
                          const currentMappings = allMappings[selectedSchema.id] || [];

                          // Handle building new list if current is empty or incomplete
                          const updated = selectedSchema.fields.map(field => {
                            const existing = currentMappings.find(m => m.targetFieldId === field.id);
                            const suggestion = suggestions.find(s => s.targetFieldId === field.id);

                            if (suggestion?.sourceHeader) {
                              return { ...(existing || { targetFieldId: field.id, transformations: [] }), ...suggestion };
                            }
                            return existing || { targetFieldId: field.id, transformations: [] };
                          });

                          setAllMappings(prev => ({ ...prev, [selectedSchema.id]: updated }));
                          setIsModified(true);
                          showToast("AI Mapping complete.");
                        } finally {
                          setIsAutoMapping(false);
                        }
                      }}
                      isAutoMapping={isAutoMapping}
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

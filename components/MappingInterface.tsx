
import React, { useState, useMemo } from 'react';
import { SchemaDefinition, SourceData, FieldMapping, TransformationStep, TransformationType, DataType } from '../types';

interface MappingInterfaceProps {
  schema: SchemaDefinition;
  source: SourceData;
  mappings: FieldMapping[];
  onUpdateMapping: (mapping: FieldMapping) => void;
  onAutoMap: () => void;
  isAutoMapping: boolean;
}

const TRANSFORMATION_META: Record<TransformationType, { label: string; icon: string; color: string; bg: string; border: string }> = {
  constant: { label: 'Fixed Value', icon: '🏷️', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  uppercase: { label: 'To Uppercase', icon: '⬆️', color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200' },
  lowercase: { label: 'To Lowercase', icon: '⬇️', color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200' },
  trim: { label: 'Trim Space', icon: '✂️', color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200' },
  default_if_null: { label: 'Default if Null', icon: '🛡️', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  prefix: { label: 'Add Prefix', icon: '⬅️', color: 'text-indigo-700', bg: 'bg-indigo-50', border: 'border-indigo-200' },
  suffix: { label: 'Add Suffix', icon: '➡️', color: 'text-indigo-700', bg: 'bg-indigo-50', border: 'border-indigo-200' },
  replace: { label: 'Find & Replace', icon: '🔍', color: 'text-violet-700', bg: 'bg-violet-50', border: 'border-violet-200' },
  to_number: { label: 'To Number', icon: '🔢', color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' },
  to_date: { label: 'To Date', icon: '📅', color: 'text-cyan-700', bg: 'bg-cyan-50', border: 'border-cyan-200' }
};

const TYPE_COLORS: Record<DataType, string> = {
  VARCHAR: 'bg-slate-100 text-slate-600 border-slate-200',
  NUMERIC: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  TIMESTAMP: 'bg-amber-50 text-amber-700 border-amber-200',
  BOOLEAN: 'bg-indigo-50 text-indigo-700 border-indigo-200'
};

const TYPE_ICONS: Record<DataType, string> = {
  VARCHAR: 'abc',
  NUMERIC: '123',
  TIMESTAMP: '📅',
  BOOLEAN: '✓✕'
};

export const MappingInterface: React.FC<MappingInterfaceProps> = ({
  schema,
  source,
  mappings,
  onUpdateMapping,
  onAutoMap,
  isAutoMapping
}) => {
  const [activeTab, setActiveTab] = useState<'mapping' | 'preview'>('mapping');
  const [draggedHeader, setDraggedHeader] = useState<string | null>(null);

  const [sourceSearch, setSourceSearch] = useState('');
  const [targetSearch, setTargetSearch] = useState('');
  const [activeTypeFilter, setActiveTypeFilter] = useState<DataType | 'ALL'>('ALL');

  const filteredSourceHeaders = useMemo(() => {
    return source.headers.filter(header => {
      const matchesSearch = header.toLowerCase().includes(sourceSearch.toLowerCase());
      const matchesType = activeTypeFilter === 'ALL' || source.inferredTypes[header] === activeTypeFilter;
      return matchesSearch && matchesType;
    });
  }, [source.headers, sourceSearch, activeTypeFilter, source.inferredTypes]);

  const filteredTargetFields = useMemo(() => {
    return schema.fields.filter(field =>
      field.label.toLowerCase().includes(targetSearch.toLowerCase()) ||
      field.column_name.toLowerCase().includes(targetSearch.toLowerCase())
    );
  }, [schema.fields, targetSearch]);

  const getMappingForField = (fieldId: string): FieldMapping => {
    return mappings.find(m => m.targetFieldId === fieldId) || {
      targetFieldId: fieldId,
      transformations: []
    };
  };

  const handleDrop = (fieldId: string, header: string) => {
    const existing = getMappingForField(fieldId);
    onUpdateMapping({
      ...existing,
      sourceHeader: header,
      semanticReasoning: `Linked to DB Column: [${header}]`,
      confidence: 1.0
    });
    setDraggedHeader(null);
  };

  const removeSourceHeader = (fieldId: string) => {
    const existing = getMappingForField(fieldId);
    onUpdateMapping({ ...existing, sourceHeader: undefined, semanticReasoning: undefined, confidence: undefined });
  };

  const addTransformation = (fieldId: string) => {
    const existing = getMappingForField(fieldId);
    const newStep: TransformationStep = {
      id: Math.random().toString(36).substr(2, 9),
      type: 'uppercase'
    };
    onUpdateMapping({ ...existing, transformations: [...existing.transformations, newStep] });
  };

  const removeTransformation = (fieldId: string, stepId: string) => {
    const existing = getMappingForField(fieldId);
    onUpdateMapping({
      ...existing,
      transformations: existing.transformations.filter(t => t.id !== stepId)
    });
  };

  const updateTransformationStep = (fieldId: string, stepId: string, updates: Partial<TransformationStep>) => {
    const existing = getMappingForField(fieldId);
    onUpdateMapping({
      ...existing,
      transformations: existing.transformations.map(t => t.id === stepId ? { ...t, ...updates } : t)
    });
  };

  const applyTransformations = (value: any, transformations: TransformationStep[]) => {
    let result = value;
    transformations.forEach(step => {
      switch (step.type) {
        case 'constant': result = step.value; break;
        case 'uppercase': result = String(result || '').toUpperCase(); break;
        case 'lowercase': result = String(result || '').toLowerCase(); break;
        case 'trim': result = String(result || '').trim(); break;
        case 'default_if_null': if (result === null || result === undefined || result === '') result = step.value; break;
        case 'prefix': result = (step.value || '') + String(result || ''); break;
        case 'suffix': result = String(result || '') + (step.value || ''); break;
        case 'replace': result = String(result || '').replace(new RegExp(step.value || '', 'g'), step.replaceWith || ''); break;
        case 'to_number':
          if (result === null || result === undefined || (typeof result === 'string' && result.trim() === '')) {
            result = null;
          } else {
            const num = Number(result);
            result = isNaN(num) ? null : num;
          }
          break;
        case 'to_date':
          if (result === null || result === undefined || (typeof result === 'string' && result.trim() === '')) {
            result = null;
          } else {
            const timestamp = Date.parse(result);
            if (isNaN(timestamp)) {
              result = null;
            } else {
              result = new Date(timestamp).toISOString();
            }
          }
          break;
      }
    });
    return result;
  };

  const previewData = source.rows.slice(0, 8).map(row => {
    const mappedRow: Record<string, any> = {};
    schema.fields.forEach(field => {
      const mapping = getMappingForField(field.id);
      let val = mapping.sourceHeader ? row[mapping.sourceHeader] : undefined;
      mappedRow[field.id] = applyTransformations(val, mapping.transformations);
    });
    return mappedRow;
  });

  const getValidationStatus = (field: any, mapping: FieldMapping) => {
    if (!mapping.sourceHeader) return null;
    const sourceInferred = source.inferredTypes[mapping.sourceHeader];
    const targetRequired = field.type;

    if (sourceInferred === targetRequired) {
      return { status: 'match', label: 'Schema Match', icon: '🏛️', color: 'text-emerald-600 bg-emerald-50 border-emerald-100', reason: 'Verified semantic & structural alignment.' };
    }

    if (targetRequired === 'NUMERIC' && sourceInferred === 'VARCHAR') {
      return { status: 'warn', label: 'Type Cast Required', icon: '⚡', color: 'text-amber-600 bg-amber-50 border-amber-100', reason: 'PostgreSQL casting required for numeric columns.' };
    }

    if (targetRequired === 'TIMESTAMP' && sourceInferred === 'VARCHAR') {
      return { status: 'warn', label: 'Date Parsing Required', icon: '⏳', color: 'text-cyan-600 bg-cyan-50 border-cyan-100', reason: 'Use the To Date transformation for ISO conversion.' };
    }

    return { status: 'mismatch', label: 'Inconsistent Types', icon: '❌', color: 'text-rose-600 bg-rose-50 border-rose-100', reason: 'Detected potential data corruption if imported.' };
  };

  return (
    <div className="bg-white rounded-[2rem] shadow-2xl border border-slate-200 overflow-hidden flex flex-col h-[850px]">
      <div className="flex border-b border-slate-200 bg-slate-50 p-1.5 shrink-0">
        <button
          onClick={() => setActiveTab('mapping')}
          className={`flex-1 px-8 py-4 font-black text-[10px] uppercase tracking-[0.2em] rounded-2xl transition-all duration-300 ${activeTab === 'mapping' ? 'bg-white shadow-lg text-blue-600' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}
        >
          Relational Mapper
        </button>
        <button
          onClick={() => setActiveTab('preview')}
          className={`flex-1 px-8 py-4 font-black text-[10px] uppercase tracking-[0.2em] rounded-2xl transition-all duration-300 ${activeTab === 'preview' ? 'bg-white shadow-lg text-blue-600' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}
        >
          SQL Preview
        </button>
      </div>

      <div className="flex-1 overflow-hidden">
        {activeTab === 'mapping' ? (
          <div className="flex h-full">
            <div className="w-80 bg-slate-50/50 border-r border-slate-200 flex flex-col overflow-hidden shrink-0">
              <div className="p-5 border-b border-slate-200 space-y-4 bg-white/50">
                <div className="flex justify-between items-center">
                  <h3 className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Source Attributes ({filteredSourceHeaders.length})</h3>
                  <span className="text-[8px] font-bold text-slate-300">TOTAL: {source.headers.length}</span>
                </div>

                <div className="relative group">
                  <input
                    type="text"
                    placeholder="Search attributes..."
                    value={sourceSearch}
                    onChange={(e) => setSourceSearch(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-[10px] font-bold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50 transition-all pl-9"
                  />
                  <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  {sourceSearch && (
                    <button onClick={() => setSourceSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6" /></svg>
                    </button>
                  )}
                </div>

                <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-1">
                  {(['ALL', 'VARCHAR', 'NUMERIC', 'TIMESTAMP', 'BOOLEAN'] as const).map(type => (
                    <button
                      key={type}
                      onClick={() => setActiveTypeFilter(type)}
                      className={`px-3 py-1.5 rounded-lg text-[7px] font-black uppercase tracking-tighter border transition-all shrink-0 ${activeTypeFilter === type ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'}`}
                    >
                      {type === 'ALL' ? 'Everything' : type}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-2 scrollbar-hide bg-white/20">
                {filteredSourceHeaders.length > 0 ? (
                  filteredSourceHeaders.map(header => {
                    const type = source.inferredTypes[header];
                    return (
                      <div
                        key={header}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', header);
                          setDraggedHeader(header);
                        }}
                        onDragEnd={() => setDraggedHeader(null)}
                        className={`flex items-center justify-between p-3.5 bg-white border border-slate-200 rounded-xl cursor-grab hover:border-blue-400 hover:shadow-lg hover:-translate-y-0.5 transition-all active:cursor-grabbing ${draggedHeader === header ? 'opacity-30' : 'shadow-sm'}`}
                      >
                        <span className="text-[10px] font-black text-slate-700 truncate uppercase max-w-[150px]">{header}</span>
                        <div className="flex items-center gap-2">
                          <span className={`text-[8px] font-black px-1.5 py-0.5 rounded border ${TYPE_COLORS[type]}`}>{TYPE_ICONS[type]}</span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-20">
                    <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">No matching attributes</p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex-1 flex flex-col overflow-hidden bg-white">
              <div className="p-8 border-b border-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white sticky top-0 z-10 shrink-0">
                <div className="flex flex-col">
                  <h3 className="text-xl font-black text-slate-900 tracking-tighter uppercase">Mapping Orchestrator</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Target Entity: {schema.table_name}</p>
                </div>

                <div className="flex items-center gap-4">
                  <div className="relative group">
                    <input
                      type="text"
                      placeholder="Filter target fields..."
                      value={targetSearch}
                      onChange={(e) => setTargetSearch(e.target.value)}
                      className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-[9px] font-bold uppercase outline-none focus:border-blue-400 focus:bg-white transition-all pl-9"
                    />
                    <svg className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <button
                    onClick={onAutoMap}
                    disabled={isAutoMapping}
                    className="flex items-center gap-3 bg-blue-600 text-white px-6 py-3 rounded-xl font-black text-[9px] uppercase tracking-widest shadow-xl shadow-blue-500/20 hover:bg-slate-900 transition-all disabled:opacity-50"
                  >
                    {isAutoMapping ? 'Auto-Matching...' : 'AI Semantic Map'}
                    <span className="animate-pulse">🧠</span>
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-6 bg-slate-50/20">
                {filteredTargetFields.length > 0 ? (
                  filteredTargetFields.map(field => {
                    const mapping = getMappingForField(field.id);
                    const validation = getValidationStatus(field, mapping);
                    return (
                      <div key={field.id} className="bg-white border border-slate-100 rounded-[2rem] p-6 hover:border-blue-200 transition-all shadow-sm group/row">
                        <div className="grid grid-cols-12 gap-8 items-start">
                          <div className="col-span-3">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="text-[10px] font-black text-slate-900 uppercase">{field.label}</p>
                              {field.required && <span className="text-rose-500 text-[10px]">*</span>}
                            </div>
                            <code className="text-[8px] block bg-slate-50 px-2 py-1.5 rounded-lg text-slate-400 font-mono mb-3 border border-slate-100/50">{field.column_name}</code>
                            <div className="flex flex-wrap gap-2">
                              <span className={`text-[7px] font-black px-2.5 py-1 rounded-full border shadow-sm ${TYPE_COLORS[field.type]}`}>{TYPE_ICONS[field.type]} {field.type}</span>
                            </div>
                          </div>

                          <div className="col-span-4">
                            <div
                              onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('border-blue-500', 'bg-blue-50', 'scale-[1.02]'); }}
                              onDragLeave={(e) => { e.currentTarget.classList.remove('border-blue-500', 'bg-blue-50', 'scale-[1.02]'); }}
                              onDrop={(e) => {
                                e.preventDefault();
                                e.currentTarget.classList.remove('border-blue-500', 'bg-blue-50', 'scale-[1.02]');
                                handleDrop(field.id, e.dataTransfer.getData('text/plain'));
                              }}
                              className={`h-24 flex flex-col items-center justify-center border-2 border-dashed rounded-[2rem] transition-all relative ${mapping.sourceHeader ? 'border-blue-200 bg-blue-50/20 shadow-inner' : 'border-slate-100 bg-slate-50/50 group-hover/row:border-slate-200'}`}
                            >
                              {mapping.sourceHeader ? (
                                <div className="flex flex-col gap-2 w-full px-6">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-black text-blue-700 uppercase truncate max-w-[150px]">{mapping.sourceHeader}</span>
                                    <button
                                      onClick={() => removeSourceHeader(field.id)}
                                      className="p-1.5 bg-white rounded-full text-slate-300 hover:text-rose-500 hover:shadow-sm transition-all"
                                    >
                                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeWidth={3} d="M6 18L18 6" /></svg>
                                    </button>
                                  </div>
                                  {validation && (
                                    <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[7px] font-bold ${validation.color} animate-in fade-in duration-300`}>
                                      <span>{validation.icon}</span>
                                      <span className="truncate">{validation.label}</span>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="flex flex-col items-center gap-2 opacity-40">
                                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
                                    <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                                  </div>
                                  <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Drop Attribute</span>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="col-span-5 space-y-4">
                            <div className="flex justify-between items-center border-b border-slate-50 pb-2">
                              <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest flex items-center gap-2">
                                Logic Pipeline
                                <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-400">{mapping.transformations.length}</span>
                              </span>
                              <button
                                onClick={() => addTransformation(field.id)}
                                className="px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-[8px] font-black uppercase hover:bg-blue-600 hover:text-white transition-all border border-blue-100 shadow-sm"
                              >
                                New Step +
                              </button>
                            </div>

                            <div className="space-y-3">
                              {mapping.transformations.map((step, idx) => {
                                const meta = TRANSFORMATION_META[step.type];
                                const needsValue = ['constant', 'prefix', 'suffix', 'default_if_null', 'replace'].includes(step.type);

                                return (
                                  <div key={step.id} className={`flex flex-col gap-3 p-4 rounded-[1.5rem] border ${meta.bg} ${meta.border} transition-all shadow-sm hover:shadow-md animate-in slide-in-from-right-2 duration-300`}>
                                    <div className="flex items-center gap-3">
                                      <span className="w-5 h-5 rounded-lg bg-slate-900 text-white flex items-center justify-center text-[9px] font-black shrink-0">{idx + 1}</span>
                                      <div className="flex items-center gap-2 flex-1 min-w-0">
                                        <span className="text-xs shrink-0">{meta.icon}</span>
                                        <select
                                          value={step.type}
                                          onChange={(e) => updateTransformationStep(field.id, step.id, { type: e.target.value as any })}
                                          className={`flex-1 bg-transparent border-none text-[10px] font-black uppercase outline-none focus:ring-0 cursor-pointer truncate ${meta.color}`}
                                        >
                                          {Object.entries(TRANSFORMATION_META).map(([v, m]) => (
                                            <option key={v} value={v} className="text-slate-900">{m.icon} {m.label}</option>
                                          ))}
                                        </select>
                                      </div>
                                      <button onClick={() => removeTransformation(field.id, step.id)} className="text-slate-300 hover:text-rose-500 transition-colors p-1 shrink-0">
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeWidth={3} d="M6 18L18 6" /></svg>
                                      </button>
                                    </div>

                                    {needsValue && (
                                      <div className="flex flex-col gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
                                        <div className="relative group/input">
                                          <input
                                            type="text"
                                            placeholder={step.type === 'replace' ? 'Pattern to match...' : 'Static value...'}
                                            value={step.value || ''}
                                            onChange={(e) => updateTransformationStep(field.id, step.id, { value: e.target.value })}
                                            className="w-full bg-white/60 border border-slate-200 rounded-xl px-4 py-2 text-[10px] font-bold outline-none focus:border-blue-400 focus:bg-white transition-all shadow-inner"
                                          />
                                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[7px] font-black text-slate-300 uppercase opacity-40 group-focus-within/input:text-blue-500 transition-colors">
                                            {step.type === 'replace' ? 'FIND' : 'INPUT'}
                                          </span>
                                        </div>

                                        {step.type === 'replace' && (
                                          <div className="relative group/input">
                                            <input
                                              type="text"
                                              placeholder="Replacement text..."
                                              value={step.replaceWith || ''}
                                              onChange={(e) => updateTransformationStep(field.id, step.id, { replaceWith: e.target.value })}
                                              className="w-full bg-white/60 border border-slate-200 rounded-xl px-4 py-2 text-[10px] font-bold outline-none focus:border-blue-400 focus:bg-white transition-all shadow-inner"
                                            />
                                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[7px] font-black text-slate-300 uppercase opacity-40 group-focus-within/input:text-blue-500 transition-colors">
                                              REPLACE
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                              {mapping.transformations.length === 0 && (
                                <div className="py-6 border-2 border-dashed border-slate-100 rounded-[1.5rem] flex flex-col items-center justify-center gap-2 opacity-40">
                                  <svg className="w-4 h-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                  <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest">Standard Import (Direct)</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="flex flex-col items-center justify-center py-40 bg-white rounded-[3rem] border border-dashed border-slate-200">
                    <span className="text-4xl mb-4 grayscale opacity-40">🔍</span>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">No target fields match your search</p>
                    <button onClick={() => setTargetSearch('')} className="mt-4 text-blue-600 text-[10px] font-black uppercase hover:underline">Clear Filter</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="h-full overflow-auto p-8 bg-slate-50/30">
            <div className="bg-white rounded-[2rem] border border-slate-100 shadow-xl overflow-hidden min-w-max">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white">
                    {schema.fields.map(f => (
                      <th key={f.id} className="p-5 text-[9px] font-black uppercase tracking-widest border-r border-white/10 last:border-0 min-w-[150px]">
                        <div className="flex items-center gap-2">
                          <span className="opacity-50">{TYPE_ICONS[f.type]}</span>
                          <span>{f.label}</span>
                        </div>
                        <span className="block opacity-30 text-[7px] mt-1 font-mono">{f.column_name}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {previewData.map((row, idx) => (
                    <tr key={idx} className="hover:bg-blue-50/30 transition-colors">
                      {schema.fields.map(f => (
                        <td key={f.id} className="p-5 font-mono text-[10px] text-slate-600 border-r border-slate-50 last:border-0">
                          {row[f.id] === undefined || row[f.id] === null ? (
                            <span className="text-rose-300 text-[8px] font-black uppercase italic tracking-tighter">NULL</span>
                          ) : (
                            <span className="truncate block max-w-[200px]">{String(row[f.id])}</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

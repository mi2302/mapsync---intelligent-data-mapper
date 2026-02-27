
import React, { useState } from 'react';
import { DataGroup, SavedConfiguration, SchemaType } from '../types';

interface DashboardProps {
  groups: DataGroup[];
  configs: SavedConfiguration[];
  onLoadConfig: (config: SavedConfiguration) => void;
  onSelectSchema: (schemaId: SchemaType) => void;
  onDelete: (e: React.MouseEvent, id: string) => void;
  onExport: (e: React.MouseEvent, config: SavedConfiguration) => void;
  onCreateNew: (group: DataGroup) => void;
  onBack?: () => void;
  currentSource?: any;
}

export const Dashboard: React.FC<DashboardProps> = ({ groups, configs, onLoadConfig, onSelectSchema, onDelete, onExport, onCreateNew, onBack, currentSource }) => {
  const [summaryModalConfig, setSummaryModalConfig] = useState<SavedConfiguration | null>(null);
  return (
    <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 bg-white p-8 rounded-[3rem] border border-slate-200 shadow-sm">
        <div className="flex items-center gap-6">
          {onBack && (
            <button
              onClick={onBack}
              className="p-4 bg-slate-50 text-slate-400 hover:text-slate-900 rounded-2xl border border-slate-100 transition-colors"
              title="Return to Source List"
            >
              ←
            </button>
          )}
          <div>
            <h1 className="text-lg font-medium text-slate-900 tracking-tighter mb-1 flex items-center gap-3">
              {currentSource?.SOURCE_NAME || 'Source'} Dashboard
              <span className="text-xs bg-blue-50 text-blue-600 px-3 py-1 rounded-full border border-blue-100 tracking-widest">Active</span>
            </h1>
            <p className="text-slate-400 text-sm font-medium">Configure and sync data for the selected ingestion stream.</p>
          </div>
        </div>
        <div className="flex gap-4 items-center">
          <div className="h-10 w-px bg-slate-200 mx-2 hidden md:block"></div>
          <div className="bg-slate-50 px-6 py-4 rounded-3xl border border-slate-200 flex flex-col items-center min-w-[100px]">
            <span className="text-lg font-medium text-blue-600">{configs.length}</span>
            <span className="text-[8px] font-medium text-slate-400 uppercase tracking-widest">Registries</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {groups.map(group => {
          const groupConfigs = configs.filter(c => c.groupId === group.id);
          return (
            <div key={group.id} className="bg-white rounded-[2.5rem] shadow-xl border border-slate-200 overflow-hidden flex flex-col group/card hover:shadow-2xl hover:-translate-y-1 transition-all duration-300">
              <div
                className="p-8 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between"
              >
                <div className="flex items-center gap-4">
                  <span className="text-xl group-hover/card:scale-110 transition-transform">{group.icon}</span>
                  <div>
                    <h3 className="text-sm font-medium text-slate-900 uppercase tracking-widest leading-none mb-1">{group.name}</h3>
                    <p className="text-[9px] font-medium text-slate-400 uppercase tracking-tighter">{group.objects.length} Objects Managed</p>
                  </div>
                </div>
                {/* Only allow creation if none exist */}
                {groupConfigs.length === 0 && (
                  <button
                    onClick={() => onCreateNew(group)}
                    className="p-3 bg-white rounded-2xl border border-slate-200 text-blue-600 hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-all shadow-sm"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeWidth={3} d="M12 4v16m8-8H4" /></svg>
                  </button>
                )}
              </div>

              <div className="flex-1 p-6 space-y-3">
                {groupConfigs.length === 0 ? (
                  <div className="h-32 flex flex-col items-center justify-center border-2 border-dashed border-slate-100 rounded-[2rem]">
                    <p className="text-[9px] font-medium text-slate-300 uppercase tracking-widest">No Registry Configured</p>
                  </div>
                ) : (
                  groupConfigs.map(config => {
                    const objectsMapped = Object.keys(config.objectMappings);

                    return (
                      <div key={config.id} className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden transition-all duration-300">
                        <div
                          className="group/item flex items-center justify-between p-4 hover:bg-slate-50 transition-colors"
                        >
                          <div className="flex flex-col truncate">
                            <span className="text-xs font-medium text-slate-800 flex items-center gap-2">
                              {config.name}
                              <button
                                onClick={(e) => { e.stopPropagation(); onLoadConfig(config); }}
                                className="text-[9px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded shadow-sm hover:bg-blue-600 hover:text-white transition-colors"
                              >
                                Edit / Run
                              </button>
                            </span>
                            <span className="text-[9px] font-medium text-slate-500 uppercase tracking-widest mt-1">{objectsMapped.length} Data Objects mapped</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={(e) => onExport(e, config)}
                              className="p-1.5 text-slate-400 hover:text-emerald-500 transition-colors"
                              title="Export XLS"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onDelete(e, config.id);
                              }}
                              className="p-1.5 text-slate-400 hover:text-rose-500 transition-colors"
                              title="Purge Entry"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSummaryModalConfig(config);
                              }}
                              className={`p-1.5 transition-colors flex items-center gap-1 text-slate-400 hover:text-emerald-500`}
                              title="Registry Summary"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="p-6 bg-slate-50 border-t border-slate-100 mt-auto">
                <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
                  {group.objects.map(obj => (
                    <span key={obj.id} className="whitespace-nowrap bg-white border border-slate-200 px-3 py-1.5 rounded-full text-[7px] font-medium text-slate-500 uppercase tracking-widest shadow-sm">
                      ● {obj.name}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {summaryModalConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-slate-50/50 shrink-0">
              <div>
                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-3">
                  <span className="text-2xl">📋</span> Registry Summary
                </h2>
                <p className="text-xs text-slate-500 mt-1">Overview of mappings for <span className="font-semibold text-slate-700">{summaryModalConfig.name}</span></p>
              </div>
              <button
                onClick={() => setSummaryModalConfig(null)}
                className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-200 text-slate-400 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 bg-slate-50/30">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.keys(summaryModalConfig.objectMappings).map(objId => {
                  const validMappings = summaryModalConfig.objectMappings[objId].filter(m => m.sourceHeader || m.transformations.length > 0);
                  if (validMappings.length === 0) return null;

                  return (
                    <div key={objId} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm break-inside-avoid">
                      <h5 className="text-xs font-semibold text-slate-700 uppercase tracking-widest mb-3 border-b border-slate-100 pb-2 flex items-center gap-2">
                        <span className="text-blue-500">●</span> {objId}
                      </h5>
                      <ul className="space-y-2">
                        {validMappings.map(m => (
                          <li key={m.targetFieldId} className="flex items-center justify-between text-[10px] bg-slate-50 px-3 py-2 rounded-lg border border-slate-100">
                            <span className="text-blue-600 truncate max-w-[140px] font-medium leading-tight" title={m.sourceHeader || 'Transformed Value'}>
                              {m.sourceHeader || (m.transformations[0]?.type === 'constant' ? `"${m.transformations[0].value}"` : 'Computed')}
                            </span>
                            <span className="text-slate-300 mx-2 shrink-0">→</span>
                            <span className="text-slate-700 font-mono truncate max-w-[140px] text-right leading-tight" title={m.targetFieldId}>{m.targetFieldId}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

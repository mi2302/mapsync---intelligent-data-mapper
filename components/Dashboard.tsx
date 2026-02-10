
import React from 'react';
import { DataGroup, SavedConfiguration, SchemaType } from '../types';

interface DashboardProps {
  groups: DataGroup[];
  configs: SavedConfiguration[];
  onLoadConfig: (config: SavedConfiguration) => void;
  onSelectSchema: (schemaId: SchemaType) => void;
  onDelete: (e: React.MouseEvent, id: string) => void;
  onExport: (e: React.MouseEvent, config: SavedConfiguration) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ groups, configs, onLoadConfig, onSelectSchema, onDelete, onExport }) => {
  return (
    <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tighter uppercase mb-2">Integration Dashboard</h1>
          <p className="text-slate-400 text-sm font-medium">Manage and review cross-domain relational mappings.</p>
        </div>
        <div className="flex gap-4">
          <div className="bg-white px-6 py-4 rounded-3xl border border-slate-200 shadow-sm flex flex-col items-center min-w-[120px]">
            <span className="text-2xl font-black text-blue-600">{configs.length}</span>
            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Registries</span>
          </div>
          <div className="bg-white px-6 py-4 rounded-3xl border border-slate-200 shadow-sm flex flex-col items-center min-w-[120px]">
            <span className="text-2xl font-black text-slate-900">{groups.length}</span>
            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Domains</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {groups.map(group => {
          const groupConfigs = configs.filter(c => c.groupId === group.id);
          return (
            <div key={group.id} className="bg-white rounded-[2.5rem] shadow-xl border border-slate-200 overflow-hidden flex flex-col group/card hover:shadow-2xl hover:-translate-y-1 transition-all duration-300">
              <div className="p-8 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="text-3xl group-hover/card:scale-110 transition-transform">{group.icon}</span>
                  <div>
                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest leading-none mb-1">{group.name}</h3>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">{group.objects.length} Objects Managed</p>
                  </div>
                </div>
                <button 
                  onClick={() => onSelectSchema(group.objects[0])}
                  className="p-3 bg-white rounded-2xl border border-slate-200 text-blue-600 hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-all shadow-sm"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeWidth={3} d="M12 4v16m8-8H4" /></svg>
                </button>
              </div>

              <div className="flex-1 p-6 space-y-3">
                {groupConfigs.length === 0 ? (
                  <div className="h-32 flex flex-col items-center justify-center border-2 border-dashed border-slate-100 rounded-[2rem]">
                    <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">No Registries Found</p>
                  </div>
                ) : (
                  groupConfigs.map(config => (
                    <div 
                      key={config.id}
                      onClick={() => onLoadConfig(config)}
                      className="group/item flex items-center justify-between p-4 bg-slate-50 border border-transparent hover:border-blue-200 hover:bg-white rounded-2xl transition-all cursor-pointer shadow-sm hover:shadow-md"
                    >
                      <div className="flex flex-col truncate">
                        <span className="text-[10px] font-black text-slate-700 uppercase truncate group-hover/item:text-blue-600">{config.name}</span>
                        <span className="text-[7px] font-bold text-slate-400 uppercase tracking-tighter mt-1">{Object.keys(config.objectMappings).length} Data Objects</span>
                      </div>
                      <div className="flex items-center gap-2 opacity-0 group-hover/item:opacity-100 transition-opacity">
                        <button 
                          onClick={(e) => onExport(e, config)}
                          className="p-2 text-slate-400 hover:text-emerald-500 transition-colors" 
                          title="Export XLS"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                        </button>
                        <button 
                          onClick={(e) => onDelete(e, config.id)}
                          className="p-2 text-slate-400 hover:text-rose-500 transition-colors"
                          title="Purge Entry"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
              
              <div className="p-6 bg-slate-50 border-t border-slate-100 mt-auto">
                <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
                  {group.objects.map(obj => (
                    <span key={obj} className="whitespace-nowrap bg-white border border-slate-200 px-3 py-1.5 rounded-full text-[7px] font-black text-slate-500 uppercase tracking-widest shadow-sm">
                      ● {obj.split('_')[0]}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

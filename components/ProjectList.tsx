
import React, { useState, useEffect } from 'react';
import { apiService } from '../services/apiService';

interface ProjectListProps {
    onSelectProject: (project: any) => void;
    onNavigateToArchitect: () => void;
}

export const ProjectList: React.FC<ProjectListProps> = ({ onSelectProject, onNavigateToArchitect }) => {
    const [projects, setProjects] = useState<any[]>([]);
    const [allModules, setAllModules] = useState<any[]>([]);
    const [showCreate, setShowCreate] = useState(false);
    const [createStep, setCreateStep] = useState<1 | 2>(1);
    const [newProjectName, setNewProjectName] = useState('');
    const [newProjectDesc, setNewProjectDesc] = useState('');
    const [selectedModuleIds, setSelectedModuleIds] = useState<Set<number>>(new Set());

    useEffect(() => {
        loadProjects();
        loadCatalog();
    }, []);

    const loadProjects = async () => {
        const data = await apiService.fetchProjects();
        setProjects(data);
    };

    const loadCatalog = async () => {
        const data = await apiService.fetchDataGroups();
        setAllModules(data);
    };

    const handleCreate = async () => {
        if (!newProjectName) return;
        const moduleIds = Array.from(selectedModuleIds) as number[];
        const result = await apiService.createProject(newProjectName, newProjectDesc, moduleIds);
        if (result.success) {
            setShowCreate(false);
            setCreateStep(1);
            setNewProjectName('');
            setNewProjectDesc('');
            setSelectedModuleIds(new Set());
            loadProjects();
        } else {
            alert(`Error: ${result.error}`);
        }
    };

    const toggleGroup = (group: any) => {
        const next = new Set(selectedModuleIds);
        const validObjects = group.objects.filter((o: any) => o.moduleId);
        const allSelected = validObjects.every((o: any) => next.has(o.moduleId));

        if (allSelected) {
            validObjects.forEach((o: any) => next.delete(o.moduleId));
        } else {
            validObjects.forEach((o: any) => next.add(o.moduleId));
        }
        setSelectedModuleIds(next);
    };

    const toggleModule = (id: number) => {
        const next = new Set(selectedModuleIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedModuleIds(next);
    };

    return (
        <div className="p-10 space-y-8 animate-in fade-in duration-500">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-4xl font-black text-slate-900 tracking-tighter uppercase mb-2">Projects</h1>
                    <p className="text-slate-500">Select or create a project to begin mapping.</p>
                </div>
                <div className="flex gap-4">
                    <button
                        onClick={onNavigateToArchitect}
                        className="bg-white text-slate-900 border border-slate-200 px-6 py-3 rounded-xl font-bold hover:bg-slate-50 transition-colors shadow-sm flex items-center gap-2"
                    >
                        <span>🏗️</span> Architect
                    </button>
                    <button
                        onClick={() => { setShowCreate(true); setCreateStep(1); }}
                        className="bg-slate-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-slate-800 transition-colors shadow-lg"
                    >
                        + New Project
                    </button>
                </div>
            </div>

            {showCreate && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl w-full max-w-2xl animate-in zoom-in duration-300">
                        <div className="flex justify-between items-center mb-8 pb-4 border-b border-slate-100">
                            <div>
                                <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">
                                    {createStep === 1 ? 'Step 1: Project Identity' : 'Step 2: Assign Modules'}
                                </h2>
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
                                    {createStep === 1 ? 'Basic details for documentation' : 'Select systems to be integrated'}
                                </p>
                            </div>
                            <div className="flex gap-1">
                                <span className={`w-3 h-3 rounded-full ${createStep === 1 ? 'bg-blue-600' : 'bg-slate-200'}`}></span>
                                <span className={`w-3 h-3 rounded-full ${createStep === 2 ? 'bg-blue-600' : 'bg-slate-200'}`}></span>
                            </div>
                        </div>

                        {createStep === 1 ? (
                            <div className="space-y-6">
                                <div className="space-y-2">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Project Name</label>
                                    <input
                                        type="text"
                                        value={newProjectName}
                                        onChange={e => setNewProjectName(e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-700"
                                        placeholder="e.g. ERP Migration Phase 1"
                                        autoFocus
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Description</label>
                                    <textarea
                                        value={newProjectDesc}
                                        onChange={e => setNewProjectDesc(e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 focus:ring-2 focus:ring-blue-500 outline-none h-32 font-medium text-slate-600"
                                        placeholder="Briefly describe the scope of this project..."
                                    />
                                </div>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[50vh] overflow-y-auto pr-2 scrollbar-hide">
                                {allModules.map(group => {
                                    const validObjects = group.objects.filter((o: any) => o.moduleId);
                                    const allSelected = validObjects.length > 0 && validObjects.every((o: any) => selectedModuleIds.has(o.moduleId));
                                    const someSelected = validObjects.some((o: any) => selectedModuleIds.has(o.moduleId));

                                    return (
                                        <div key={group.id} className="bg-slate-50 p-5 rounded-3xl border border-slate-200 group/module hover:border-blue-200 transition-colors">
                                            <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-200/50">
                                                <h3 className="font-bold text-xs text-slate-400 uppercase flex items-center gap-2">
                                                    {group.icon || '📦'} {group.name}
                                                </h3>
                                                <input
                                                    type="checkbox"
                                                    checked={allSelected}
                                                    ref={el => el && (el.indeterminate = someSelected && !allSelected)}
                                                    onChange={() => toggleGroup(group)}
                                                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                {group.objects.map((obj: any) => (
                                                    <label key={obj.id} className="flex items-center gap-3 p-2 hover:bg-white rounded-xl cursor-pointer select-none transition-colors border border-transparent hover:border-slate-100">
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedModuleIds.has(obj.moduleId)}
                                                            onChange={() => toggleModule(obj.moduleId)}
                                                            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                                        />
                                                        <span className="text-xs font-bold text-slate-600">{obj.name}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        <div className="flex gap-4 mt-10 pt-6 border-t border-slate-100">
                            <button
                                onClick={() => { setShowCreate(false); setCreateStep(1); }}
                                className="px-8 py-3 bg-slate-100 text-slate-500 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-colors"
                            >
                                Cancel
                            </button>
                            <div className="flex-1"></div>
                            {createStep === 1 ? (
                                <button
                                    onClick={() => setCreateStep(2)}
                                    disabled={!newProjectName}
                                    className="px-10 py-3 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 disabled:opacity-50"
                                >
                                    Next: Select Modules
                                </button>
                            ) : (
                                <>
                                    <button
                                        onClick={() => setCreateStep(1)}
                                        className="px-8 py-3 bg-slate-100 text-slate-500 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-colors mr-2"
                                    >
                                        Back
                                    </button>
                                    <button
                                        onClick={handleCreate}
                                        className="px-10 py-3 bg-blue-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-blue-700 transition-all shadow-xl shadow-blue-200"
                                    >
                                        Create Project
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {projects.map(proj => (
                    <div
                        key={proj.PROJECT_ID}
                        className="group bg-white border border-slate-200 rounded-3xl p-6 hover:shadow-xl hover:-translate-y-1 transition-all relative overflow-hidden flex flex-col justify-between min-h-[220px]"
                    >
                        <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
                            <span className="text-8xl">📂</span>
                        </div>

                        <div>
                            <div className="flex justify-between items-start mb-4">
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 bg-slate-50 px-2 py-1 rounded-lg">
                                    Project
                                </span>
                                <span className="text-[10px] font-bold text-slate-400">
                                    {new Date(proj.CREATED_AT).toLocaleDateString()}
                                </span>
                            </div>

                            <h3 className="text-xl font-black text-slate-900 mb-2 line-clamp-2">{proj.PROJECT_NAME}</h3>
                            <p className="text-slate-500 text-sm line-clamp-3 mb-4">{proj.DESCRIPTION || 'No description provided.'}</p>

                            <div className="flex items-center gap-2 mb-6">
                                <span className="bg-blue-50 text-blue-600 text-[10px] font-bold px-2 py-1 rounded-md border border-blue-100">
                                    {proj.MODULE_COUNT || 0} Modules
                                </span>
                            </div>
                        </div>

                        <button
                            onClick={() => onSelectProject(proj)}
                            className="w-full py-3 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-600 hover:shadow-lg transition-all flex items-center justify-center gap-2"
                        >
                            Open Project <span>→</span>
                        </button>
                    </div>
                ))}

                {projects.length === 0 && !showCreate && (
                    <div className="col-span-full py-20 text-center text-slate-400">
                        <div className="text-6xl mb-4">📭</div>
                        <p className="font-medium">No projects found. Create one to get started.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

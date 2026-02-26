
import React, { useState, useEffect } from 'react';
import { apiService } from '../services/apiService';

interface ProjectListProps {
    onSelectProject: (project: any) => void;
    onManageModules: (project: any) => void;
    onNavigateToArchitect: () => void;
}

export const ProjectList: React.FC<ProjectListProps> = ({ onSelectProject, onManageModules, onNavigateToArchitect }) => {
    const [projects, setProjects] = useState<any[]>([]);
    const [allModules, setAllModules] = useState<any[]>([]);
    const [showCreate, setShowCreate] = useState(false);
    const [createStep, setCreateStep] = useState<1 | 2>(1);
    const [newProjectName, setNewProjectName] = useState('');
    const [newProjectDesc, setNewProjectDesc] = useState('');
    const [selectedModuleIds, setSelectedModuleIds] = useState<Set<number>>(new Set());

    const [editingProjectModules, setEditingProjectModules] = useState<any | null>(null);

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

    const startEditProjectModules = async (project: any) => {
        const details = await apiService.fetchProjectDetails(project.PROJECT_ID);
        if (details) {
            const ids = new Set<number>();
            details.modules.forEach((group: any) => {
                group.objects.forEach((obj: any) => {
                    if (obj.moduleId) ids.add(Number(obj.moduleId));
                });
            });
            setSelectedModuleIds(ids);
            setEditingProjectModules(project);
        }
    };

    const handleUpdateModules = async () => {
        if (!editingProjectModules) return;
        const moduleIds = Array.from(selectedModuleIds).map(id => Number(id));
        const success = await apiService.updateProjectModules(editingProjectModules.PROJECT_ID, moduleIds);
        if (success) {
            setEditingProjectModules(null);
            loadProjects();
        } else {
            alert(`Error updating project modules`);
        }
    };

    const handleCreate = async () => {
        const trimmedName = newProjectName.trim();
        if (!trimmedName) return;

        // Check for duplicate names (case-insensitive)
        const isDuplicate = projects.some(p => p.PROJECT_NAME.trim().toLowerCase() === trimmedName.toLowerCase());
        if (isDuplicate) {
            alert(`A project with the name "${trimmedName}" already exists. Please choose a unique name.`);
            return;
        }

        const moduleIds = Array.from(selectedModuleIds) as number[];
        const result = await apiService.createProject(trimmedName, newProjectDesc, moduleIds);
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
                    <h1 className="text-lg font-medium text-slate-900 tracking-tighter uppercase mb-2">Projects</h1>
                    <p className="text-slate-500">Select or create a project to begin mapping.</p>
                </div>
                <div className="flex gap-4">
                    <button
                        onClick={onNavigateToArchitect}
                        className="group relative px-8 py-4 bg-white text-slate-900 border border-slate-200 rounded-2xl font-medium text-[10px] uppercase tracking-[0.2em] hover:border-blue-600 hover:text-blue-600 transition-all shadow-sm overflow-hidden"
                    >
                        <div className="absolute inset-0 bg-blue-50/50 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                        <span className="relative flex items-center gap-3">
                            <span className="text-xl group-hover:rotate-12 transition-transform">🏗️</span>
                            Architect Mode
                        </span>
                    </button>
                    <button
                        onClick={() => { setShowCreate(true); setCreateStep(1); setSelectedModuleIds(new Set()); }}
                        className="px-10 py-4 bg-slate-900 text-white rounded-2xl font-medium text-[10px] uppercase tracking-[0.2em] hover:bg-blue-600 transition-all shadow-xl shadow-slate-200 flex items-center gap-3 group"
                    >
                        <span className="text-xl group-hover:scale-125 transition-transform">+</span>
                        New Project
                    </button>
                </div>
            </div>

            {showCreate && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl w-full max-w-2xl animate-in zoom-in duration-300">
                        <div className="flex justify-between items-center mb-8 pb-4 border-b border-slate-100">
                            <div>
                                <h2 className="text-lg font-medium text-slate-900 uppercase tracking-tight">
                                    {createStep === 1 ? 'Step 1: Project Identity' : 'Step 2: Assign Modules'}
                                </h2>
                                <p className="text-xs font-medium text-slate-400 uppercase tracking-widest mt-1">
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
                                    <label className="block text-[10px] font-medium text-slate-400 uppercase tracking-widest">Project Name</label>
                                    <input
                                        type="text"
                                        value={newProjectName}
                                        onChange={e => setNewProjectName(e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 focus:ring-2 focus:ring-blue-500 outline-none font-medium text-slate-700"
                                        placeholder="e.g. ERP Migration Phase 1"
                                        autoFocus
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-[10px] font-medium text-slate-400 uppercase tracking-widest">Description</label>
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
                                    const allSelected = validObjects.length > 0 && validObjects.every((o: any) => selectedModuleIds.has(Number(o.moduleId)));
                                    const someSelected = validObjects.some((o: any) => selectedModuleIds.has(Number(o.moduleId)));

                                    return (
                                        <div key={group.id} className="bg-slate-50 p-5 rounded-3xl border border-slate-200 group/module hover:border-blue-200 transition-colors">
                                            <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-200/50">
                                                <h3 className="font-medium text-xs text-slate-400 uppercase flex items-center gap-2">
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
                                                            checked={selectedModuleIds.has(Number(obj.moduleId))}
                                                            onChange={() => toggleModule(Number(obj.moduleId))}
                                                            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                                        />
                                                        <span className="text-xs font-medium text-slate-600">{obj.name}</span>
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
                                className="px-8 py-3 bg-slate-100 text-slate-500 rounded-2xl font-medium text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-colors"
                            >
                                Cancel
                            </button>
                            <div className="flex-1"></div>
                            {createStep === 1 ? (
                                <button
                                    onClick={() => setCreateStep(2)}
                                    disabled={!newProjectName}
                                    className="px-10 py-3 bg-slate-900 text-white rounded-2xl font-medium text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 disabled:opacity-50"
                                >
                                    Next: Select Modules
                                </button>
                            ) : (
                                <>
                                    <button
                                        onClick={() => setCreateStep(1)}
                                        className="px-8 py-3 bg-slate-100 text-slate-500 rounded-2xl font-medium text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-colors mr-2"
                                    >
                                        Back
                                    </button>
                                    <button
                                        onClick={handleCreate}
                                        className="px-10 py-3 bg-blue-600 text-white rounded-2xl font-medium text-[10px] uppercase tracking-widest hover:bg-blue-700 transition-all shadow-xl shadow-blue-200"
                                    >
                                        Create Project
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Project Modules Edit Modal */}
            {editingProjectModules && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl w-full max-w-2xl animate-in zoom-in duration-300">
                        <div className="flex justify-between items-center mb-8 pb-4 border-b border-slate-100">
                            <div>
                                <h2 className="text-lg font-medium text-slate-900 uppercase tracking-tight">Manage Project Modules</h2>
                                <p className="text-xs font-medium text-slate-400 uppercase tracking-widest mt-1">
                                    Define the architectural scope for <span className="text-blue-600">{editingProjectModules.PROJECT_NAME}</span>
                                </p>
                            </div>
                            <button
                                onClick={() => setEditingProjectModules(null)}
                                className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[50vh] overflow-y-auto pr-2 scrollbar-hide">
                            {allModules.map(group => {
                                const validObjects = group.objects.filter((o: any) => o.moduleId);
                                const allSelected = validObjects.length > 0 && validObjects.every((o: any) => selectedModuleIds.has(Number(o.moduleId)));
                                const someSelected = validObjects.some((o: any) => selectedModuleIds.has(Number(o.moduleId)));

                                return (
                                    <div key={group.id} className="bg-slate-50 p-5 rounded-3xl border border-slate-200">
                                        <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-200/50">
                                            <h3 className="font-medium text-xs text-slate-400 uppercase flex items-center gap-2">
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
                                                        checked={selectedModuleIds.has(Number(obj.moduleId))}
                                                        onChange={() => toggleModule(Number(obj.moduleId))}
                                                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                                    />
                                                    <span className="text-xs font-medium text-slate-600">{obj.name}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="flex gap-4 mt-10 pt-6 border-t border-slate-100">
                            <button
                                onClick={() => setEditingProjectModules(null)}
                                className="px-8 py-3 bg-slate-100 text-slate-500 rounded-2xl font-medium text-[10px] uppercase tracking-widest hover:bg-slate-200"
                            >
                                Cancel
                            </button>
                            <div className="flex-1"></div>
                            <button
                                onClick={handleUpdateModules}
                                className="px-10 py-3 bg-blue-600 text-white rounded-2xl font-medium text-[10px] uppercase tracking-widest hover:bg-blue-700 shadow-xl shadow-blue-200"
                            >
                                Save Changes
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {projects.map(proj => (
                    <div
                        key={proj.PROJECT_ID}
                        className="group relative bg-white/60 backdrop-blur-xl border border-white/60 rounded-[2.5rem] p-8 hover:border-brand-300 hover:shadow-[0_20px_50px_rgba(14,165,233,0.15)] transition-all duration-500 overflow-hidden flex flex-col justify-between min-h-[220px]"
                    >
                        {/* Stunning Card Background FX */}
                        <div className="absolute inset-0 bg-gradient-to-br from-brand-50/50 to-indigo-50/50 opacity-0 group-hover:opacity-100 transition-opacity duration-500 z-0"></div>
                        <div className="absolute -top-24 -right-24 w-48 h-48 bg-brand-400/20 rounded-full blur-[50px] group-hover:bg-brand-400/30 transition-colors z-0"></div>

                        <div className="absolute top-0 right-0 p-6 -mr-4 -mt-4 opacity-5 group-hover:opacity-10 group-hover:scale-110 transition-all duration-500 z-0 pointer-events-none">
                            <span className="text-8xl filter drop-shadow-xl">📂</span>
                        </div>

                        <div className="relative z-10 flex-1">
                            <div className="flex justify-between items-start mb-6">
                                <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-brand-700 bg-brand-100/50 backdrop-blur-md border border-brand-200/50 px-3 py-1.5 rounded-xl shadow-sm">
                                    Workspace
                                </span>
                                <span className="text-[9px] font-medium text-slate-400 uppercase tracking-widest bg-white/50 px-2.5 py-1 rounded-lg">
                                    {new Date(proj.CREATED_AT).toLocaleDateString()}
                                </span>
                            </div>

                            <h3 className="text-lg font-medium text-slate-800 group-hover:text-brand-600 transition-colors duration-300 mb-3 leading-tight tracking-tight drop-shadow-sm">{proj.PROJECT_NAME}</h3>
                            <p className="text-slate-500 text-sm font-medium line-clamp-3 mb-6 tracking-tight leading-relaxed">{proj.DESCRIPTION || 'Enterprise data mapping initiative'}</p>
                        </div>

                        <div className="relative z-10 flex gap-3 mt-4">
                            <button
                                onClick={() => startEditProjectModules(proj)}
                                className="flex-1 py-4 bg-white/80 text-slate-500 border border-slate-200/80 rounded-2xl text-[10px] font-medium uppercase tracking-widest hover:bg-brand-50 hover:text-brand-600 hover:border-brand-200 transition-all flex items-center justify-center gap-2 shadow-sm backdrop-blur-md"
                                title="Manage Project Scope"
                            >
                                <span className="text-sm">🧩</span> Modules
                            </button>
                            <button
                                onClick={() => onSelectProject(proj)}
                                className="flex-[1.5] py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-medium uppercase tracking-widest hover:bg-brand-600 hover:shadow-xl hover:shadow-brand-500/30 transition-all flex items-center justify-center gap-2 group/btn relative overflow-hidden"
                            >
                                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover/btn:translate-y-0 transition-transform duration-300"></div>
                                <span className="relative">Open Workspace</span>
                                <span className="relative transform group-hover/btn:translate-x-1 transition-transform">→</span>
                            </button>
                        </div>
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

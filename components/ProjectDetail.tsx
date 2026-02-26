
import React, { useState, useEffect } from 'react';
import { apiService } from '../services/apiService';
import { DataGroup, SavedConfiguration } from '../types';

interface ProjectDetailProps {
    project: any;
    onBack: () => void;
    onSelectSource: (source: any, projectModules?: any[]) => void;
    initialTab?: 'modules' | 'sources';
    initialEditingSource?: any;
}

export const ProjectDetail: React.FC<ProjectDetailProps> = ({ project, onBack, onSelectSource, initialTab = 'sources', initialEditingSource = null }) => {
    const [activeTab, setActiveTab] = useState<'modules' | 'sources'>(initialTab);
    const [projectModules, setProjectModules] = useState<any[]>([]);
    const [allModules, setAllModules] = useState<any[]>([]);
    const [sources, setSources] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // Source Creation State
    const [showCreateSource, setShowCreateSource] = useState(false);
    const [createSourceStep, setCreateSourceStep] = useState<1 | 2>(1);
    const [newSourceName, setNewSourceName] = useState('');
    const [newSourceDesc, setNewSourceDesc] = useState('');
    const [newSourceSelectedModuleIds, setNewSourceSelectedModuleIds] = useState<Set<number>>(new Set());

    // Module Editing State
    const [isEditingModules, setIsEditingModules] = useState(initialEditingSource !== null);
    const [editingSource, setEditingSource] = useState<any>(initialEditingSource); // For source-level modules
    const [selectedModuleIds, setSelectedModuleIds] = useState<Set<number>>(new Set());

    useEffect(() => {
        loadData();
    }, [project.PROJECT_ID]);

    const loadData = async () => {
        setLoading(true);
        try {
            const [details, srcList, globalGroups] = await Promise.all([
                apiService.fetchProjectDetails(project.PROJECT_ID),
                apiService.fetchProjectSources(project.PROJECT_ID),
                apiService.fetchDataGroups()
            ]);

            if (details) {
                setProjectModules(details.modules || []);
            }
            setSources(srcList);
            setAllModules(globalGroups);
        } catch (error) {
            console.error("Failed to load project data", error);
        } finally {
            setLoading(false);
        }

        // If we started with an editing source, fetch its modules
        if (initialEditingSource) {
            const details = await apiService.fetchSourceModules(initialEditingSource.SOURCE_ID);
            if (details) {
                setSelectedModuleIds(new Set(details.selectedModuleIds));
            }
        }
    };

    const handleSaveModules = async () => {
        const moduleIds = Array.from(selectedModuleIds) as number[];

        let success = false;
        if (editingSource) {
            success = await apiService.updateSourceModules(editingSource.SOURCE_ID, moduleIds);
        } else {
            success = await apiService.updateProjectModules(project.PROJECT_ID, moduleIds);
        }

        if (success) {
            if (editingSource) {
                setActiveTab('sources');
            }
            setIsEditingModules(false);
            setEditingSource(null);
            loadData();
        } else {
            alert('Failed to update modules');
        }
    };

    const handleCreateSource = async () => {
        const trimmedName = newSourceName.trim();
        if (!trimmedName) return;

        // Check for duplicate names within the project
        const isDuplicate = sources.some(s => s.SOURCE_NAME.trim().toLowerCase() === trimmedName.toLowerCase());
        if (isDuplicate) {
            alert(`A source with the name "${trimmedName}" already exists in this project.`);
            return;
        }

        const moduleIds = Array.from(newSourceSelectedModuleIds) as number[];
        const result = await apiService.createProjectSource(project.PROJECT_ID, trimmedName, newSourceDesc, moduleIds);
        if (result.success) {
            setShowCreateSource(false);
            setCreateSourceStep(1);
            setNewSourceName('');
            setNewSourceDesc('');
            setNewSourceSelectedModuleIds(new Set());
            loadData();
        } else {
            alert(`Error: ${result.error}`);
        }
    };

    const startModuleEdit = () => {
        const currentIds = new Set<number>();
        projectModules.forEach(group => {
            group.objects.forEach((obj: any) => {
                if (obj.moduleId) currentIds.add(obj.moduleId);
            });
        });
        setSelectedModuleIds(currentIds);
        setEditingSource(null);
        setIsEditingModules(true);
    };

    const startSourceModuleEdit = async (e: React.MouseEvent, source: any) => {
        e.stopPropagation();
        setLoading(true);
        const details = await apiService.fetchSourceModules(source.SOURCE_ID);
        if (details) {
            setSelectedModuleIds(new Set(details.selectedModuleIds));
        } else {
            setSelectedModuleIds(new Set());
        }
        setEditingSource(source);
        setIsEditingModules(true);
        // No need to switch tabs anymore as it's a modal
        setLoading(false);
    };

    const toggleModule = (id: number) => {
        const next = new Set(selectedModuleIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedModuleIds(next);
    };

    const handleBack = () => {
        if (isEditingModules) {
            setIsEditingModules(false);
            setEditingSource(null);
            if (editingSource) {
                setActiveTab('sources');
            }
        } else {
            onBack();
        }
    };

    if (loading) return <div className="p-10 text-center text-slate-400">Loading project details...</div>;

    return (
        <div className="flex flex-col h-full bg-slate-50">
            {/* Header */}
            <div className="bg-white border-b border-slate-200 px-8 py-6 flex items-center justify-between sticky top-0 z-10">
                <div className="flex items-center gap-4">
                    <button onClick={handleBack} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-900 transition-colors">
                        ← Back
                    </button>
                    <div>
                        <h1 className="text-lg font-medium text-slate-900 tracking-tight flex items-center gap-3">
                            {project.PROJECT_NAME}
                            <span className="text-[10px] bg-slate-100 text-slate-500 px-3 py-1 rounded-full border border-slate-200 uppercase tracking-widest font-medium">Active Project</span>
                        </h1>
                        <p className="text-sm text-slate-500">{project.DESCRIPTION}</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setShowCreateSource(true)}
                        className="bg-slate-900 text-white px-6 py-2.5 rounded-xl font-medium text-[10px] uppercase tracking-widest hover:bg-blue-600 transition-all shadow-lg shadow-blue-200 flex items-center gap-2"
                    >
                        <span>+</span> New Source
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-auto p-8 max-w-7xl mx-auto w-full">
                {/* Module Edit Modal (Now a Popup) */}
                {isEditingModules && (
                    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50">
                        <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl w-full max-w-2xl animate-in zoom-in duration-300">
                            <div className="flex justify-between items-center mb-8 pb-4 border-b border-slate-100">
                                <div>
                                    <h2 className="text-lg font-medium text-slate-900 uppercase tracking-tight">
                                        {editingSource ? `Source Scope: ${editingSource.SOURCE_NAME}` : 'Project Scope'}
                                    </h2>
                                    <p className="text-xs font-medium text-slate-400 uppercase tracking-widest mt-1">
                                        Select modules to enable for this {editingSource ? 'specific input' : 'project context'}
                                    </p>
                                </div>
                                <button
                                    onClick={() => { setIsEditingModules(false); setEditingSource(null); }}
                                    className="p-2 hover:bg-slate-100 rounded-full text-slate-400"
                                >
                                    ✕
                                </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[50vh] overflow-y-auto pr-2 scrollbar-hide">
                                {(editingSource ? projectModules : allModules).map(group => {
                                    const modulesToFilter = editingSource ? projectModules : allModules;
                                    const currentGroup = modulesToFilter.find(m => m.id === group.id);
                                    if (!currentGroup) return null;

                                    const validObjects = group.objects.filter((o: any) => o.moduleId);
                                    const allSelected = validObjects.length > 0 && validObjects.every((o: any) => selectedModuleIds.has(Number(o.moduleId)));
                                    const someSelected = validObjects.some((o: any) => selectedModuleIds.has(Number(o.moduleId)));

                                    const toggleGroupLocal = () => {
                                        const next = new Set(selectedModuleIds);
                                        if (allSelected) {
                                            validObjects.forEach((o: any) => next.delete(o.moduleId));
                                        } else {
                                            validObjects.forEach((o: any) => next.add(o.moduleId));
                                        }
                                        setSelectedModuleIds(next);
                                    };

                                    return (
                                        <div key={group.id} className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                                            <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
                                                <h3 className="font-medium text-sm text-slate-400 uppercase flex items-center gap-2">
                                                    {group.icon || '📦'} {group.name}
                                                </h3>
                                                <input
                                                    type="checkbox"
                                                    checked={allSelected}
                                                    ref={input => {
                                                        if (input) {
                                                            input.indeterminate = someSelected && !allSelected;
                                                        }
                                                    }}
                                                    onChange={toggleGroupLocal}
                                                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                {group.objects.map((obj: any) => {
                                                    const objModuleId = obj.moduleId;
                                                    if (!objModuleId) return null;
                                                    return (
                                                        <label key={obj.id} className="flex items-center gap-3 p-2 hover:bg-white rounded-lg cursor-pointer select-none border border-transparent hover:border-slate-100 transition-all">
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedModuleIds.has(Number(objModuleId))}
                                                                onChange={() => toggleModule(Number(objModuleId))}
                                                                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                                            />
                                                            <span className="text-xs font-medium text-slate-700">{obj.name}</span>
                                                        </label>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="flex gap-4 mt-10 pt-6 border-t border-slate-100">
                                <button
                                    onClick={() => { setIsEditingModules(false); setEditingSource(null); }}
                                    className="px-8 py-3 bg-slate-100 text-slate-500 rounded-2xl font-medium text-[10px] uppercase tracking-widest hover:bg-slate-200"
                                >
                                    Cancel
                                </button>
                                <div className="flex-1"></div>
                                <button
                                    onClick={handleSaveModules}
                                    className="px-10 py-3 bg-blue-600 text-white rounded-2xl font-medium text-[10px] uppercase tracking-widest hover:bg-blue-700 shadow-xl shadow-blue-200"
                                >
                                    Apply Scope
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'sources' && !isEditingModules && (
                    <div className="space-y-8 animate-in slide-in-from-bottom-2 fade-in duration-300">
                        <div className="flex justify-between items-center">
                            <div>
                                <h2 className="text-[12px] font-medium text-slate-400 uppercase tracking-[0.3em]">Project Workspaces</h2>
                                <p className="text-slate-500 text-sm font-medium mt-1">Select an ingestion stream to begin mapping.</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                            {sources.map(src => (
                                <div
                                    key={src.SOURCE_ID}
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
                                                Source
                                            </span>
                                            <span className="text-[9px] font-medium text-slate-400 uppercase tracking-widest bg-white/50 px-2.5 py-1 rounded-lg">
                                                {new Date(src.CREATED_AT).toLocaleDateString()}
                                            </span>
                                        </div>

                                        <h3 className="text-lg font-medium text-slate-800 group-hover:text-brand-600 transition-colors duration-300 mb-3 leading-tight tracking-tight drop-shadow-sm">{src.SOURCE_NAME}</h3>
                                        <p className="text-slate-500 text-sm font-medium line-clamp-3 mb-6 tracking-tight leading-relaxed">{src.DESCRIPTION || 'Core data source'}</p>
                                    </div>

                                    <div className="relative z-10 flex gap-3 mt-4">
                                        <button
                                            onClick={(e) => startSourceModuleEdit(e, src)}
                                            className="flex-1 py-4 bg-white/80 text-slate-500 border border-slate-200/80 rounded-2xl text-[10px] font-medium uppercase tracking-widest hover:bg-brand-50 hover:text-brand-600 hover:border-brand-200 transition-all flex items-center justify-center gap-2 shadow-sm backdrop-blur-md"
                                            title="Manage Source Modules"
                                        >
                                            <span className="text-sm">🧩</span> Scope
                                        </button>
                                        <button
                                            onClick={() => onSelectSource(src, projectModules)}
                                            className="flex-[1.5] py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-medium uppercase tracking-widest hover:bg-brand-600 hover:shadow-xl hover:shadow-brand-500/30 transition-all flex items-center justify-center gap-2 group/btn relative overflow-hidden"
                                        >
                                            <div className="absolute inset-0 bg-white/20 translate-y-full group-hover/btn:translate-y-0 transition-transform duration-300"></div>
                                            <span className="relative">Open Workspace</span>
                                            <span className="relative transform group-hover/btn:translate-x-1 transition-transform">→</span>
                                        </button>
                                    </div>
                                </div>
                            ))}
                            {sources.length === 0 && (
                                <div className="col-span-full text-center py-20 bg-white rounded-[3rem] border border-dashed border-slate-200">
                                    <span className="text-6xl block mb-6 grayscale opacity-20">📭</span>
                                    <h2 className="text-xl font-medium text-slate-900 uppercase tracking-tighter mb-2">No Active Sources</h2>
                                    <p className="text-slate-400 font-medium mb-8">Deploy a data source to begin mapping architectures.</p>
                                    <button
                                        onClick={() => setShowCreateSource(true)}
                                        className="bg-slate-900 text-white px-10 py-4 rounded-2xl font-medium text-[10px] uppercase tracking-widest hover:bg-blue-600 transition-all shadow-xl shadow-slate-200"
                                    >
                                        Deploy First Source
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {showCreateSource && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl w-full max-w-2xl animate-in zoom-in duration-300">
                        <div className="flex justify-between items-center mb-8 pb-4 border-b border-slate-100">
                            <div>
                                <h2 className="text-lg font-medium text-slate-900 uppercase tracking-tight">
                                    {createSourceStep === 1 ? 'Step 1: Source Identity' : 'Step 2: Assign Modules'}
                                </h2>
                                <p className="text-xs font-medium text-slate-400 uppercase tracking-widest mt-1">
                                    {createSourceStep === 1 ? 'Define the ingest source' : 'Select visible modules for this source'}
                                </p>
                            </div>
                            <div className="flex gap-1">
                                <span className={`w-3 h-3 rounded-full ${createSourceStep === 1 ? 'bg-blue-600' : 'bg-slate-200'}`}></span>
                                <span className={`w-3 h-3 rounded-full ${createSourceStep === 2 ? 'bg-blue-600' : 'bg-slate-200'}`}></span>
                            </div>
                        </div>

                        {createSourceStep === 1 ? (
                            <div className="space-y-6">
                                <div className="space-y-2">
                                    <label className="block text-[10px] font-medium text-slate-400 uppercase tracking-widest">Source Name</label>
                                    <input
                                        type="text"
                                        value={newSourceName}
                                        onChange={e => setNewSourceName(e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 focus:ring-2 focus:ring-blue-500 outline-none font-medium text-slate-700"
                                        placeholder="e.g. AWS S3 Bucket, Salesforce REST API"
                                        autoFocus
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-[10px] font-medium text-slate-400 uppercase tracking-widest">Description</label>
                                    <textarea
                                        value={newSourceDesc}
                                        onChange={e => setNewSourceDesc(e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 focus:ring-2 focus:ring-blue-500 outline-none h-32 font-medium text-slate-600"
                                        placeholder="Identify the data format or source platform..."
                                    />
                                </div>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[50vh] overflow-y-auto pr-2 scrollbar-hide">
                                {projectModules.map(group => {
                                    const validObjects = group.objects.filter((o: any) => o.moduleId);
                                    const allSelected = validObjects.length > 0 && validObjects.every((o: any) => newSourceSelectedModuleIds.has(o.moduleId));
                                    const someSelected = validObjects.some((o: any) => newSourceSelectedModuleIds.has(o.moduleId));

                                    const toggleGroup = () => {
                                        const next = new Set(newSourceSelectedModuleIds);
                                        if (allSelected) {
                                            validObjects.forEach((o: any) => next.delete(o.moduleId));
                                        } else {
                                            validObjects.forEach((o: any) => next.add(o.moduleId));
                                        }
                                        setNewSourceSelectedModuleIds(next);
                                    };

                                    const toggleModule = (id: number) => {
                                        const next = new Set(newSourceSelectedModuleIds);
                                        if (next.has(id)) next.delete(id);
                                        else next.add(id);
                                        setNewSourceSelectedModuleIds(next);
                                    };

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
                                                    onChange={toggleGroup}
                                                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                {group.objects.map((obj: any) => (
                                                    <label key={obj.id} className="flex items-center gap-3 p-2 hover:bg-white rounded-xl cursor-pointer select-none transition-colors border border-transparent hover:border-slate-100">
                                                        <input
                                                            type="checkbox"
                                                            checked={newSourceSelectedModuleIds.has(obj.moduleId)}
                                                            onChange={() => toggleModule(obj.moduleId)}
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
                                onClick={() => { setShowCreateSource(false); setCreateSourceStep(1); }}
                                className="px-8 py-3 bg-slate-100 text-slate-500 rounded-2xl font-medium text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-colors"
                            >
                                Cancel
                            </button>
                            <div className="flex-1"></div>
                            {createSourceStep === 1 ? (
                                <button
                                    onClick={() => {
                                        setCreateSourceStep(2);
                                    }}
                                    disabled={!newSourceName}
                                    className="px-10 py-3 bg-slate-900 text-white rounded-2xl font-medium text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 disabled:opacity-50"
                                >
                                    Next: Select Modules
                                </button>
                            ) : (
                                <>
                                    <button
                                        onClick={() => setCreateSourceStep(1)}
                                        className="px-8 py-3 bg-slate-100 text-slate-500 rounded-2xl font-medium text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-colors mr-2"
                                    >
                                        Back
                                    </button>
                                    <button
                                        onClick={handleCreateSource}
                                        className="px-10 py-3 bg-blue-600 text-white rounded-2xl font-medium text-[10px] uppercase tracking-widest hover:bg-blue-700 transition-all shadow-xl shadow-blue-200"
                                    >
                                        Create Source
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

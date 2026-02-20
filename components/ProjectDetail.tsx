
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

export const ProjectDetail: React.FC<ProjectDetailProps> = ({ project, onBack, onSelectSource, initialTab = 'modules', initialEditingSource = null }) => {
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
        if (!newSourceName) return;
        const moduleIds = Array.from(newSourceSelectedModuleIds) as number[];
        const result = await apiService.createProjectSource(project.PROJECT_ID, newSourceName, newSourceDesc, moduleIds);
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
            // Default to all project modules if none selected yet?
            // User requested selection, so maybe we start empty or with project modules.
            // Let's start with project modules as default.
            const projectIds = new Set<number>();
            projectModules.forEach(group => {
                group.objects.forEach((obj: any) => {
                    if (obj.moduleId) projectIds.add(obj.moduleId);
                });
            });
            setSelectedModuleIds(projectIds);
        }
        setEditingSource(source);
        setIsEditingModules(true);
        setActiveTab('modules'); // Switch to the modules tab where the grid is
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
                        <h1 className="text-2xl font-black text-slate-900 tracking-tight">{project.PROJECT_NAME}</h1>
                        <p className="text-sm text-slate-500">{project.DESCRIPTION}</p>
                    </div>
                </div>
                <div className="flex gap-1">
                    <button
                        onClick={() => setActiveTab('modules')}
                        className={`px-4 py-2 font-bold text-sm rounded-lg transition-all ${activeTab === 'modules' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'}`}
                    >
                        Modules
                    </button>
                    <button
                        onClick={() => setActiveTab('sources')}
                        className={`px-4 py-2 font-bold text-sm rounded-lg transition-all ${activeTab === 'sources' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'}`}
                    >
                        Sources
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-auto p-8 max-w-7xl mx-auto w-full">
                {activeTab === 'modules' && (
                    <div className="space-y-6 animate-in slide-in-from-bottom-2 fade-in duration-300">
                        <div className="flex justify-between items-center bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                            <div>
                                <h2 className="text-xl font-bold text-slate-900">
                                    {isEditingModules ? (editingSource ? `Modules for ${editingSource.SOURCE_NAME}` : 'Project Modules') : 'Active Catalog'}
                                </h2>
                                <p className="text-slate-500 text-sm">
                                    {isEditingModules ? 'Only selected modules will be visible in the workflow.' : 'Modules available for this project context.'}
                                </p>
                            </div>
                            <div className="flex gap-3">
                                {isEditingModules ? (
                                    <>
                                        <button
                                            onClick={handleBack}
                                            className="px-6 py-2 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-colors"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={handleSaveModules}
                                            className="px-6 py-2 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition-colors shadow-lg shadow-green-200"
                                        >
                                            Save Selection
                                        </button>
                                    </>
                                ) : (
                                    <button
                                        onClick={startModuleEdit}
                                        className="bg-slate-900 text-white px-6 py-2 rounded-xl font-bold hover:bg-slate-800 transition-colors shadow-md shadow-slate-200"
                                    >
                                        Edit Modules
                                    </button>
                                )}
                            </div>
                        </div>

                        {isEditingModules ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {(editingSource ? projectModules : allModules).map(group => {
                                    // Calculate group selection state
                                    // Use allModules for editing project modules, or projectModules for editing source modules
                                    const modulesToFilter = editingSource ? projectModules : allModules;
                                    const currentGroup = modulesToFilter.find(m => m.id === group.id);
                                    if (!currentGroup) return null;

                                    const validObjects = group.objects.filter((o: any) => o.moduleId);
                                    const allSelected = validObjects.length > 0 && validObjects.every((o: any) => selectedModuleIds.has(o.moduleId));
                                    const someSelected = validObjects.some((o: any) => selectedModuleIds.has(o.moduleId));

                                    const toggleGroup = () => {
                                        const next = new Set(selectedModuleIds);
                                        if (allSelected) {
                                            // Deselect all
                                            validObjects.forEach((o: any) => next.delete(o.moduleId));
                                        } else {
                                            // Select all
                                            validObjects.forEach((o: any) => next.add(o.moduleId));
                                        }
                                        setSelectedModuleIds(next);
                                    };

                                    return (
                                        <div key={group.id} className="bg-white p-4 rounded-xl border border-slate-200">
                                            <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
                                                <h3 className="font-bold text-sm text-slate-400 uppercase flex items-center gap-2">
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
                                                    onChange={toggleGroup}
                                                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                                    title="Select Entire Module"
                                                />
                                            </div>
                                            <div className="space-y-2 pl-2">
                                                {group.objects.map((obj: any) => {
                                                    const objModuleId = obj.moduleId;

                                                    if (!objModuleId) {
                                                        return (
                                                            <div key={obj.id} className="text-xs text-red-400 p-1">
                                                                Error: Missing ID for {obj.name}
                                                            </div>
                                                        );
                                                    }

                                                    return (
                                                        <label key={obj.id} className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded-lg cursor-pointer select-none">
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedModuleIds.has(objModuleId)}
                                                                onChange={() => toggleModule(objModuleId)}
                                                                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                                            />
                                                            <span className="text-sm font-medium text-slate-700">{obj.name}</span>
                                                        </label>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {projectModules.length === 0 ? (
                                    <div className="col-span-full text-center py-20 bg-white rounded-3xl border border-dashed border-slate-300">
                                        <span className="text-4xl block mb-4">🧩</span>
                                        <p className="text-slate-500 font-medium">No modules configured.</p>
                                        <button onClick={startModuleEdit} className="text-blue-600 font-bold hover:underline mt-2">Select Modules</button>
                                    </div>
                                ) : (
                                    projectModules.map(group => (
                                        <div key={group.id} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-4">
                                            <div className="flex items-center gap-3">
                                                <span className="text-2xl bg-slate-50 p-2 rounded-lg">{group.icon}</span>
                                                <h3 className="font-bold text-slate-900">{group.name}</h3>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                {group.objects.map((o: any) => (
                                                    <span key={o.id} className="text-xs font-bold px-2 py-1 bg-slate-100 text-slate-600 rounded-md">
                                                        {o.name}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'sources' && (
                    <div className="space-y-6 animate-in slide-in-from-bottom-2 fade-in duration-300">
                        <div className="flex justify-between items-center">
                            <div>
                                <h2 className="text-xl font-bold text-slate-900">Data Sources</h2>
                                <p className="text-slate-500 text-sm">Manage source data mappings for this project.</p>
                            </div>
                            <button
                                onClick={() => setShowCreateSource(true)}
                                className="bg-blue-600 text-white px-6 py-2 rounded-xl font-bold hover:bg-blue-700 transition-colors shadow-md shadow-blue-200"
                            >
                                + New Source
                            </button>
                        </div>

                        <div className="grid grid-cols-1 gap-4">
                            {sources.map(src => (
                                <div
                                    key={src.SOURCE_ID}
                                    className="bg-white p-6 rounded-2xl border border-slate-200 hover:border-blue-400 hover:shadow-lg transition-all group/item flex flex-col md:flex-row justify-between items-start md:items-center gap-4"
                                >
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3">
                                            <h3 className="font-bold text-lg text-slate-900 group-hover/item:text-blue-600 transition-colors">{src.SOURCE_NAME}</h3>
                                            {src.MODULE_COUNT !== undefined && (
                                                <span className="text-[10px] font-black uppercase text-blue-500 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">
                                                    {src.MODULE_COUNT} Modules
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-slate-500 text-sm mt-1">{src.DESCRIPTION || 'No description provided.'}</p>
                                        <div className="flex items-center gap-4 mt-2">
                                            <span className="text-xs text-slate-400 font-medium">Created: {new Date(src.CREATED_AT).toLocaleDateString()}</span>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3 w-full md:w-auto">
                                        <button
                                            onClick={(e) => startSourceModuleEdit(e, src)}
                                            className="px-4 py-2 bg-slate-50 text-slate-500 border border-slate-200 rounded-xl text-[10px] font-black uppercase hover:bg-slate-100 hover:text-slate-700 transition-all flex items-center gap-2"
                                        >
                                            <span>⚙️</span> Modules
                                        </button>
                                        <button
                                            onClick={() => onSelectSource(src, projectModules)}
                                            className="px-6 py-2 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 flex items-center gap-2"
                                        >
                                            Open Dashboard <span>→</span>
                                        </button>
                                    </div>
                                </div>
                            ))}
                            {sources.length === 0 && (
                                <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-slate-300">
                                    <span className="text-4xl block mb-4">📂</span>
                                    <p className="text-slate-500 font-medium">No sources created yet.</p>
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
                                <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">
                                    {createSourceStep === 1 ? 'Step 1: Source Identity' : 'Step 2: Assign Modules'}
                                </h2>
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
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
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Source Name</label>
                                    <input
                                        type="text"
                                        value={newSourceName}
                                        onChange={e => setNewSourceName(e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-700"
                                        placeholder="e.g. AWS S3 Bucket, Salesforce REST API"
                                        autoFocus
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Description</label>
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
                                                <h3 className="font-bold text-xs text-slate-400 uppercase flex items-center gap-2">
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
                                onClick={() => { setShowCreateSource(false); setCreateSourceStep(1); }}
                                className="px-8 py-3 bg-slate-100 text-slate-500 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-colors"
                            >
                                Cancel
                            </button>
                            <div className="flex-1"></div>
                            {createSourceStep === 1 ? (
                                <button
                                    onClick={() => {
                                        if (newSourceSelectedModuleIds.size === 0) {
                                            const allIds = new Set<number>();
                                            projectModules.forEach(g => g.objects.forEach((o: any) => o.moduleId && allIds.add(o.moduleId)));
                                            setNewSourceSelectedModuleIds(allIds);
                                        }
                                        setCreateSourceStep(2);
                                    }}
                                    disabled={!newSourceName}
                                    className="px-10 py-3 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 disabled:opacity-50"
                                >
                                    Next: Select Modules
                                </button>
                            ) : (
                                <>
                                    <button
                                        onClick={() => setCreateSourceStep(1)}
                                        className="px-8 py-3 bg-slate-100 text-slate-500 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-colors mr-2"
                                    >
                                        Back
                                    </button>
                                    <button
                                        onClick={handleCreateSource}
                                        className="px-10 py-3 bg-blue-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-blue-700 transition-all shadow-xl shadow-blue-200"
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

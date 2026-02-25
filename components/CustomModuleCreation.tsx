
import React, { useState } from 'react';
import { DataType, SchemaDefinition } from '../types';
import { apiService } from '../services/apiService';
import { suggestColumns } from '../services/geminiService';

interface CustomModuleCreationProps {
    onBack: () => void;
    onCreate: (name: string, icon: string, objects: any[]) => void;
    allSchemas: Record<string, SchemaDefinition>;
}

type WizardStep = 'profile' | 'catalog' | 'editor';

export const CustomModuleCreation: React.FC<CustomModuleCreationProps> = ({ onBack, onCreate, allSchemas }) => {
    // Wizard State
    const [step, setStep] = useState<WizardStep>('profile');

    // Module Profile
    const [name, setName] = useState('');
    const [icon, setIcon] = useState('📦');

    // Staged Objects
    const [stagedObjects, setStagedObjects] = useState<{
        name: string,
        logicalName: string,
        columns: any[],
        registerGlobal: boolean
    }[]>([]);

    // Current Editing Object State
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [dLogicalName, setDLogicalName] = useState('');
    const [dTableName, setDTableName] = useState('');
    const [dRegisterGlobal, setDRegisterGlobal] = useState(true);
    const [dColumns, setDColumns] = useState<{ name: string, type: DataType, required: boolean, isPk: boolean }[]>([]);

    const [isProvisioning, setIsProvisioning] = useState(false);
    const [isSuggesting, setIsSuggesting] = useState(false);
    const [matches, setMatches] = useState<SchemaDefinition[]>([]);
    const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);

    const showToast = (message: string, type: 'success' | 'error' = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    const icons = ['📦', '👥', '💰', '📊', '🏗️', '🧪', '🛡️', '🌐', '🚚', '🔧'];

    // Wizard Navigation
    const nextToCatalog = () => {
        if (!name.trim()) {
            showToast("Module name is required", "error");
            return;
        }
        setStep('catalog');
    };

    const openEditor = (index: number | null = null) => {
        if (index !== null) {
            const obj = stagedObjects[index];
            setEditingIndex(index);
            setDLogicalName(obj.logicalName);
            setDTableName(obj.name);
            setDRegisterGlobal(obj.registerGlobal);
            setDColumns([...obj.columns]);
        } else {
            setEditingIndex(null);
            setDLogicalName('');
            setDTableName('');
            setDRegisterGlobal(true);
            setDColumns([
                { name: 'ID', type: 'NUMERIC', required: true, isPk: true },
                { name: 'NAME', type: 'VARCHAR', required: false, isPk: false }
            ]);
        }
        setStep('editor');
    };

    const saveObject = () => {
        if (!dLogicalName || !dTableName || dColumns.length === 0) {
            showToast("Please fill in all object details", "error");
            return;
        }

        if (!dColumns.some(c => c.isPk)) {
            showToast("Primary key is mandatory", "error");
            return;
        }

        const newObj = {
            logicalName: dLogicalName,
            name: dTableName,
            columns: dColumns,
            registerGlobal: dRegisterGlobal
        };

        if (editingIndex !== null) {
            const updated = [...stagedObjects];
            updated[editingIndex] = newObj;
            setStagedObjects(updated);
        } else {
            setStagedObjects([...stagedObjects, newObj]);
        }
        setStep('catalog');
    };

    const removeObject = (idx: number) => {
        setStagedObjects(stagedObjects.filter((_, i) => i !== idx));
    };

    const handleAIsuggest = async () => {
        if (!dLogicalName) {
            showToast("Specify an object name for AI suggestions", "error");
            return;
        }
        setIsSuggesting(true);
        try {
            // 1. Search for similar existing schemas (Fuzzy Overlap Match)
            const searchWords = dLogicalName.toLowerCase()
                .replace(/[^a-z0-9\s_]/g, '')
                .split(/[\s_]+/)
                .filter(w => w.length > 2)
                .map(w => w.replace(/s$/, '')); // Simple de-pluralize

            const foundMatches = (Object.values(allSchemas || {}) as SchemaDefinition[]).filter(s => {
                const targetText = (s.name + " " + s.table_name).toLowerCase().replace(/[^a-z0-9\s_]/g, '');
                const targetWords = targetText.split(/[\s_]+/).map(w => w.replace(/s$/, ''));

                // Match if any significant word overlaps
                return searchWords.some(sw => targetWords.some(tw => tw.includes(sw) || sw.includes(tw)));
            });
            setMatches(foundMatches);

            // 2. Get AI suggestions
            const suggestions = await suggestColumns(dLogicalName);

            // Smarter Merge: Keep existing columns, append new ones if they don't exist
            setDColumns(prev => {
                const next = [...prev];
                suggestions.forEach(s => {
                    const exists = next.find(col => col.name.toUpperCase() === s.name.toUpperCase());
                    if (!exists) {
                        next.push({ name: s.name, type: s.type, required: false, isPk: false });
                    }
                });
                return next;
            });

            if (foundMatches.length > 0) {
                showToast(`AI suggested fields & found ${foundMatches.length} similar existing modules`);
            } else {
                showToast(`AI added ${suggestions.length} relevant attributes`);
            }
        } catch (err) {
            showToast("AI suggestion failed", "error");
        } finally {
            setIsSuggesting(false);
        }
    };

    const handleLaunch = async () => {
        if (stagedObjects.length === 0) {
            showToast("At least one data object is required", "error");
            return;
        }

        setIsProvisioning(true);
        const finalObjects: any[] = [];

        for (const obj of stagedObjects) {
            try {
                const res = await apiService.createDynamicTable(obj.name, obj.columns);
                if (res.success && res.tableName) {
                    finalObjects.push({
                        type: 'draft',
                        id: res.tableName,
                        name: obj.logicalName,
                        table: res.tableName,
                        isGlobal: obj.registerGlobal,
                        fields: obj.columns.map((c: any) => ({
                            id: c.name,
                            column_name: c.name,
                            label: c.name.replace(/_/g, ' ').split(' ').map((w: string) => w.charAt(0) + w.slice(1).toLowerCase()).join(' '),
                            type: c.type,
                            required: c.required || c.isPk,
                            is_primary: c.isPk,
                            description: `User defined field: ${c.name}`
                        }))
                    });
                } else {
                    showToast(`Table creation failed: ${res.message}`, "error");
                    setIsProvisioning(false);
                    return;
                }
            } catch (err) {
                showToast("System error during provisioning", "error");
                setIsProvisioning(false);
                return;
            }
        }

        setIsProvisioning(false);
        onCreate(name, icon, finalObjects);
    };

    return (
        <div className="max-w-4xl mx-auto pb-20 px-4">
            <style>
                {`
                @keyframes pulse-glow {
                    0% { box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.4); }
                    70% { box-shadow: 0 0 0 10px rgba(37, 99, 235, 0); }
                    100% { box-shadow: 0 0 0 0 rgba(37, 99, 235, 0); }
                }
                .ai-glow { animation: pulse-glow 2s infinite; }
                .blueprint-grid {
                    background-image: linear-gradient(rgba(30, 41, 59, 0.05) 1px, transparent 1px),
                                    linear-gradient(90deg, rgba(30, 41, 59, 0.05) 1px, transparent 1px);
                    background-size: 16px 16px;
                }
                .glass-card {
                    background: rgba(255, 255, 255, 0.9);
                    backdrop-filter: blur(8px);
                    -webkit-backdrop-filter: blur(8px);
                    border: 1px solid rgba(255, 255, 255, 0.5);
                }
                .step-transition { transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1); }
                `}
            </style>

            {toast && (
                <div className={`fixed top-12 left-1/2 -translate-x-1/2 px-8 py-4 rounded-full shadow-2xl z-50 animate-in slide-in-from-top-4 font-black text-[10px] uppercase tracking-widest ${toast.type === 'success' ? 'bg-slate-900/90 text-white backdrop-blur-md' : 'bg-rose-500 text-white'}`}>
                    {toast.message}
                </div>
            )}

            <div className="bg-white rounded-[2rem] shadow-[0_20px_40px_-12px_rgba(0,0,0,0.06)] border border-slate-100 overflow-hidden flex flex-col relative">
                {/* Visual Accent */}
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600"></div>

                {/* Header & Enhanced Stepper */}
                <div className="p-6 border-b border-slate-100 bg-slate-50/30">
                    <div className="flex items-start justify-between mb-6">
                        <div className="space-y-1">
                            <div className="flex items-center gap-2">
                                <div className="w-6 h-6 bg-blue-600 rounded-md flex items-center justify-center text-white shadow-md shadow-blue-500/10">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                                </div>
                                <h2 className="text-lg font-bold text-slate-900 tracking-tight uppercase">Blueprint</h2>
                            </div>
                            <p className="text-slate-400 text-[7px] font-bold uppercase tracking-[0.2em] pl-1">Architectural Design</p>
                        </div>
                        <button
                            onClick={onBack}
                            className="px-3 py-1.5 bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-100 rounded-lg transition-all group"
                        >
                            <span className="text-[8px] font-bold uppercase tracking-widest text-slate-400 group-hover:text-rose-600">Close ✕</span>
                        </button>
                    </div>

                    <div className="relative flex justify-between px-4">
                        {/* Connector Line */}
                        <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-slate-100 -translate-y-1/2 -z-0 mx-8"></div>
                        <div
                            className="absolute top-1/2 left-0 h-0.5 bg-blue-600 -translate-y-1/2 transition-all duration-700 -z-0 mx-8"
                            style={{ width: step === 'profile' ? '0%' : step === 'catalog' ? '45%' : '90%' }}
                        ></div>

                        {[
                            { id: 'profile', label: 'Identity', icon: '🆔' },
                            { id: 'catalog', label: 'Catalog', icon: '📂' },
                            { id: 'editor', label: 'Architecture', icon: '📐' }
                        ].map((s, idx) => (
                            <div key={s.id} className="relative z-10 flex flex-col items-center gap-2">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center step-transition shadow-sm ${step === s.id ? 'bg-blue-600 text-white scale-105 shadow-md shadow-blue-500/10' :
                                    (idx < ['profile', 'catalog', 'editor'].indexOf(step) ? 'bg-blue-100 text-blue-600' : 'bg-white text-slate-300 border border-slate-100')
                                    }`}>
                                    <span className="text-xs">{s.icon}</span>
                                </div>
                                <span className={`text-[7px] font-bold uppercase tracking-widest ${step === s.id ? 'text-blue-600' : 'text-slate-300'}`}>{s.label}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Wizard Body */}
                <div className="flex-1 p-8 overflow-y-auto blueprint-grid">
                    {step === 'profile' && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-right-2 duration-300">
                            <div className="space-y-3">
                                <div className="flex items-center gap-2 px-1">
                                    <div className="w-0.5 h-2 bg-blue-600 rounded-full"></div>
                                    <label className="text-[9px] font-bold text-slate-900 uppercase tracking-widest">Core Module Identity</label>
                                </div>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="Enter module name..."
                                    className="w-full text-2xl font-bold p-6 bg-white border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-blue-100 shadow-sm transition-all placeholder:text-slate-200"
                                    autoFocus
                                />
                            </div>

                            <div className="space-y-4">
                                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest px-1 block">Visual Signature</label>
                                <div className="grid grid-cols-5 md:grid-cols-10 gap-2 bg-slate-50/30 p-3 rounded-2xl border border-slate-100">
                                    {icons.map(i => (
                                        <button
                                            key={i}
                                            onClick={() => setIcon(i)}
                                            className={`aspect-square flex items-center justify-center rounded-lg text-xl transition-all ${icon === i ? 'bg-slate-900 text-white shadow-lg scale-105' : 'bg-white hover:bg-slate-50 text-slate-400 border border-slate-200'}`}
                                        >
                                            {i}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="pt-6 flex justify-end">
                                <button
                                    onClick={nextToCatalog}
                                    className="px-8 py-4 bg-slate-900 text-white rounded-xl text-[9px] font-bold uppercase tracking-widest hover:bg-blue-600 shadow-lg transition-all flex items-center gap-3 group"
                                >
                                    Map Objects <span className="group-hover:translate-x-1 transition-transform">→</span>
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 'catalog' && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-300">
                            <div className="flex items-center justify-between px-1">
                                <div className="space-y-0.5">
                                    <h3 className="text-base font-bold text-slate-900 uppercase tracking-tight">Module Workbench</h3>
                                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Managing {stagedObjects.length} entities in {name}</p>
                                </div>
                                <button
                                    onClick={() => openEditor()}
                                    className="px-5 py-2.5 bg-slate-900 text-white rounded-lg text-[8px] font-bold uppercase tracking-widest hover:bg-blue-600 transition-all shadow-md flex items-center gap-2 group"
                                >
                                    <span className="text-sm group-hover:scale-110 transition-transform">+</span> Create New Entity
                                </button>
                            </div>

                            {stagedObjects.length === 0 ? (
                                <div className="py-12 text-center space-y-4 glass-card rounded-2xl border-2 border-dashed border-slate-100">
                                    <div className="text-4xl">🏗️</div>
                                    <div className="space-y-1">
                                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">No objects configured</p>
                                        <p className="text-[8px] font-medium text-slate-300 uppercase tracking-tighter">Define entities to process</p>
                                    </div>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {stagedObjects.map((obj, i) => (
                                        <div key={i} className="group glass-card p-4 rounded-xl border border-slate-100 flex flex-col gap-3 hover:shadow-md transition-all relative overflow-hidden">
                                            <div className="flex items-start justify-between relative z-10">
                                                <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-xl shadow-sm border border-slate-50 group-hover:bg-blue-600 group-hover:text-white transition-all">
                                                    📄
                                                </div>
                                                <div className="flex gap-1">
                                                    <button
                                                        onClick={() => openEditor(i)}
                                                        className="w-8 h-8 bg-white hover:bg-slate-900 hover:text-white border border-slate-100 rounded-lg flex items-center justify-center transition-all text-xs"
                                                    >✎</button>
                                                    <button
                                                        onClick={() => removeObject(i)}
                                                        className="w-8 h-8 bg-white hover:bg-rose-600 hover:text-white border border-slate-100 rounded-lg flex items-center justify-center transition-all text-xs text-slate-200"
                                                    >✕</button>
                                                </div>
                                            </div>

                                            <div className="space-y-0.5 relative z-10">
                                                <p className="text-xs font-bold text-slate-900 uppercase tracking-tight">{obj.logicalName}</p>
                                                <p className="text-[7px] font-bold text-blue-600/60 uppercase tracking-widest">MSAI_{obj.name}</p>
                                            </div>

                                            <div className="flex items-center gap-2 pt-2 border-t border-slate-50 relative z-10">
                                                <span className="text-[7px] font-bold text-slate-300 uppercase tracking-widest">{obj.columns.length} Fields</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="pt-6 flex items-center justify-between">
                                <button
                                    onClick={() => setStep('profile')}
                                    className="text-[8px] font-bold uppercase tracking-widest text-slate-400 hover:text-slate-900 transition-all flex items-center gap-1"
                                >← Back</button>
                                <button
                                    onClick={handleLaunch}
                                    disabled={stagedObjects.length === 0 || isProvisioning}
                                    className="px-8 py-4 bg-blue-600 text-white rounded-xl font-bold text-[9px] uppercase tracking-widest shadow-md hover:bg-blue-700 disabled:opacity-30 transition-all flex items-center gap-3"
                                >
                                    {isProvisioning ? 'Splicing...' : 'Provision Module'}
                                    <span className="animate-pulse">🚀</span>
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 'editor' && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <div className="bg-white/40 p-5 rounded-2xl border border-slate-100 shadow-sm">
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between px-1">
                                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                            <div className="w-1.5 h-1.5 bg-blue-600 rounded-full"></div>
                                            Object Name
                                        </label>
                                        <div className="flex items-center gap-2 opacity-40 hover:opacity-100 transition-opacity">
                                            <span className="text-[7px] font-bold text-slate-300 uppercase tracking-widest">System ID:</span>
                                            <span className="text-[8px] font-mono font-bold text-slate-400">MSAI_{dTableName || '...'}</span>
                                        </div>
                                    </div>
                                    <input
                                        type="text"
                                        value={dLogicalName}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            setDLogicalName(val);
                                            setDTableName(val.toUpperCase().replace(/[^A-Z0-9]/g, '_').substring(0, 26));
                                        }}
                                        placeholder="e.g. Sales Invoice, Team Member"
                                        className="w-full text-lg font-bold p-5 bg-white border border-slate-100 rounded-xl outline-none focus:ring-4 focus:ring-blue-50 transition-all shadow-inner placeholder:text-slate-200"
                                        autoFocus
                                    />
                                </div>
                            </div>

                            <div className="space-y-4">
                                {matches.length > 0 && (
                                    <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4 space-y-4 animate-in fade-in zoom-in-95 duration-300">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px]">🏢</span>
                                                <h5 className="text-[8px] font-bold text-blue-600 uppercase tracking-[0.2em]">Legacy Reference Found</h5>
                                            </div>
                                            <button
                                                onClick={() => setMatches([])}
                                                className="text-[8px] font-bold text-slate-300 hover:text-slate-900 uppercase"
                                            >Dismiss</button>
                                        </div>

                                        <div className="space-y-4">
                                            {(matches as SchemaDefinition[]).map(m => (
                                                <div key={m.id} className="bg-white rounded-lg border border-blue-50 p-3 space-y-3 shadow-sm">
                                                    <div className="flex items-center justify-between border-b border-slate-50 pb-2">
                                                        <div className="flex flex-col">
                                                            <span className="text-[9px] font-bold text-slate-700">{m.icon} {m.name}</span>
                                                            <span className="text-[7px] text-slate-400 font-medium uppercase tracking-tighter">Existing Platform Blueprint</span>
                                                        </div>
                                                        <div className="flex gap-2">
                                                            <button
                                                                onClick={() => {
                                                                    setDColumns(prev => {
                                                                        const next = [...prev];
                                                                        m.fields.forEach(f => {
                                                                            if (!next.find(c => c.name.toUpperCase() === f.column_name.toUpperCase())) {
                                                                                next.push({ name: f.column_name.toUpperCase(), type: f.type, required: f.required, isPk: false });
                                                                            }
                                                                        });
                                                                        return next;
                                                                    });
                                                                    showToast(`Selected all fields from ${m.name}`);
                                                                }}
                                                                className="text-[7px] font-bold text-blue-600 uppercase hover:bg-blue-50 px-2 py-1 rounded transition-colors"
                                                            >Select All</button>
                                                            <button
                                                                onClick={() => {
                                                                    const mNames = m.fields.map(f => f.column_name.toUpperCase());
                                                                    setDColumns(dColumns.filter(c => !mNames.includes(c.name.toUpperCase())));
                                                                    showToast(`Removed fields from ${m.name}`);
                                                                }}
                                                                className="text-[7px] font-bold text-rose-500 uppercase hover:bg-rose-50 px-2 py-1 rounded transition-colors"
                                                            >Remove All</button>
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {m.fields && m.fields.length > 0 ? m.fields.map(f => {
                                                            const isAlreadyIn = dColumns.some(c => c.name.toUpperCase() === f.column_name.toUpperCase());
                                                            return (
                                                                <button
                                                                    key={f.id}
                                                                    onClick={() => {
                                                                        if (isAlreadyIn) {
                                                                            setDColumns(dColumns.filter(c => c.name.toUpperCase() !== f.column_name.toUpperCase()));
                                                                        } else {
                                                                            setDColumns([...dColumns, { name: f.column_name.toUpperCase(), type: f.type, required: f.required, isPk: false }]);
                                                                        }
                                                                    }}
                                                                    className={`px-2.5 py-1.5 rounded-lg text-[8px] font-bold transition-all border flex items-center gap-2 ${isAlreadyIn
                                                                            ? 'bg-blue-600 border-blue-500 text-white shadow-sm ring-1 ring-blue-400'
                                                                            : 'bg-white border-slate-200 text-slate-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50/30'
                                                                        }`}
                                                                >
                                                                    <span className={`w-3 h-3 flex items-center justify-center rounded-full text-[7px] ${isAlreadyIn ? 'bg-white/20' : 'bg-slate-100'}`}>
                                                                        {isAlreadyIn ? '✓' : '+'}
                                                                    </span>
                                                                    {f.column_name}
                                                                </button>
                                                            );
                                                        }) : (
                                                            <div className="py-2 px-4 bg-slate-50 rounded-lg w-full text-center border border-dashed border-slate-200">
                                                                <span className="text-[7px] font-bold text-slate-400 uppercase tracking-widest">No attributes defined in this blueprint</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className="flex items-center justify-between px-1">
                                    <h4 className="text-[9px] font-bold text-slate-900 uppercase tracking-widest">Attributes</h4>
                                    <div className="flex gap-1.5">
                                        <button
                                            onClick={handleAIsuggest}
                                            disabled={isSuggesting || !dLogicalName}
                                            className={`px-3 py-1.5 bg-indigo-600 text-white rounded-md text-[7px] font-bold uppercase tracking-widest flex items-center gap-1.5 hover:bg-slate-900 disabled:opacity-30 transition-all shadow-sm ${isSuggesting ? 'animate-pulse' : ''}`}
                                        >
                                            {isSuggesting ? '...' : '✨ AI Suggest'}
                                        </button>
                                        <button
                                            onClick={() => setDColumns([...dColumns, { name: '', type: 'VARCHAR', required: false, isPk: false }])}
                                            className="px-3 py-1.5 bg-slate-900 text-white rounded-md text-[7px] font-bold uppercase tracking-widest hover:bg-blue-600 transition-all"
                                        >
                                            + Add
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1.5 custom-scrollbar">
                                    {dColumns.map((col, i) => (
                                        <div key={i} className="flex gap-2 items-center glass-card p-2 rounded-xl border border-slate-100 hover:border-blue-100 transition-all group animate-in slide-in-from-left-1 duration-200">
                                            <input
                                                type="text"
                                                placeholder="KEY"
                                                value={col.name}
                                                onChange={(e) => {
                                                    const next = [...dColumns];
                                                    next[i].name = e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '');
                                                    setDColumns(next);
                                                }}
                                                className="flex-1 bg-slate-50 border border-slate-100 rounded-lg p-3 text-[9px] font-bold outline-none group-hover:bg-white transition-colors"
                                            />
                                            <select
                                                value={col.type}
                                                onChange={(e) => {
                                                    const next = [...dColumns];
                                                    next[i].type = e.target.value as DataType;
                                                    setDColumns(next);
                                                }}
                                                className="bg-slate-50 border border-slate-100 rounded-lg p-3 text-[8px] font-bold outline-none group-hover:bg-white transition-colors min-w-[100px]"
                                            >
                                                <option value="VARCHAR">CHR</option>
                                                <option value="NUMERIC">NUM</option>
                                                <option value="TIMESTAMP">DATE</option>
                                                <option value="BOOLEAN">BOOL</option>
                                            </select>
                                            <button
                                                onClick={() => {
                                                    const next = [...dColumns];
                                                    next[i].isPk = !next[i].isPk;
                                                    setDColumns(next);
                                                }}
                                                className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all border ${col.isPk ? 'bg-blue-600 text-white border-transparent' : 'bg-slate-50 text-slate-200 border-slate-100 hover:bg-slate-100'}`}
                                            >
                                                <span className="text-sm">{col.isPk ? '🔑' : '🔒'}</span>
                                            </button>
                                            {dColumns.length > 1 && (
                                                <button
                                                    onClick={() => setDColumns(dColumns.filter((_, idx) => idx !== i))}
                                                    className="w-8 h-8 rounded-lg text-slate-100 hover:text-rose-500 transition-all flex items-center justify-center text-xs"
                                                >✕</button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="pt-6 flex items-center justify-between border-t border-slate-100">
                                <button
                                    onClick={() => setStep('catalog')}
                                    className="text-[8px] font-bold uppercase tracking-widest text-slate-300 hover:text-slate-900 transition-all px-2"
                                >Cancel</button>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => {
                                            saveObject();
                                            setTimeout(() => openEditor(), 100);
                                        }}
                                        className="px-5 py-3 bg-white border border-slate-200 text-slate-600 rounded-lg text-[8px] font-bold uppercase tracking-widest hover:border-slate-900 hover:text-slate-900 transition-all shadow-sm"
                                    >
                                        Save & Add Another
                                    </button>
                                    <button
                                        onClick={saveObject}
                                        className="px-6 py-3 bg-slate-900 text-white rounded-lg text-[8px] font-bold uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-md flex items-center gap-2 group"
                                    >
                                        💾 Save Blueprint <span className="group-hover:scale-110 transition-transform">✓</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};


import React, { useState } from 'react';
import { DataType, SchemaDefinition, DataGroup } from '../types';
import { apiService } from '../services/apiService';
import { suggestColumns } from '../services/geminiService';

interface CustomModuleCreationProps {
    onBack: () => void;
    onCreate: (name: string, icon: string, objects: any[]) => void;
    allSchemas: Record<string, SchemaDefinition>;
    existingModules: DataGroup[];
}

type WizardStep = 'profile' | 'catalog' | 'editor';
type ModuleColumn = { name: string, type: DataType, required: boolean, isPk: boolean };

export const CustomModuleCreation: React.FC<CustomModuleCreationProps> = ({ onBack, onCreate, allSchemas, existingModules }) => {
    // Wizard State
    const [step, setStep] = useState<WizardStep>('profile');
    const [allRegisteredModules, setAllRegisteredModules] = useState<string[]>([]);

    React.useEffect(() => {
        const loadUniverse = async () => {
            try {
                const universe = await apiService.fetchLegacyUniverse();
                const names = new Set<string>();
                Object.values(universe || {}).forEach((s: any) => {
                    if (s.moduleName) names.add(s.moduleName.toLowerCase().trim());
                });
                // Also add project modules
                existingModules.forEach(m => names.add(m.name.toLowerCase().trim()));
                setAllRegisteredModules(Array.from(names));
            } catch (e) {
                console.error("Failed to load module registry for validation", e);
            }
        };
        loadUniverse();
    }, [existingModules]);

    // State with Persistence Load
    const [name, setName] = useState(() => localStorage.getItem('mapsync_draft_name') || '');
    const [icon, setIcon] = useState(() => localStorage.getItem('mapsync_draft_icon') || '📦');
    const [stagedObjects, setStagedObjects] = useState<{
        name: string,
        logicalName: string,
        columns: ModuleColumn[],
        registerGlobal: boolean
    }[]>(() => {
        const saved = localStorage.getItem('mapsync_draft_objects');
        return saved ? JSON.parse(saved) : [];
    });

    // Auto-Save Effect
    React.useEffect(() => {
        localStorage.setItem('mapsync_draft_name', name);
    }, [name]);

    React.useEffect(() => {
        localStorage.setItem('mapsync_draft_icon', icon);
    }, [icon]);

    React.useEffect(() => {
        localStorage.setItem('mapsync_draft_objects', JSON.stringify(stagedObjects));
    }, [stagedObjects]);

    const clearDraft = () => {
        if (confirm("This will permanently wipe your current draft blueprint. Continue?")) {
            setName('');
            setIcon('📦');
            setStagedObjects([]);
            setStep('profile');
            setShowRecovery(false); // Reset recovery view so they see inputs
            localStorage.removeItem('mapsync_draft_name');
            localStorage.removeItem('mapsync_draft_icon');
            localStorage.removeItem('mapsync_draft_objects');
        }
    };

    const [showRecovery, setShowRecovery] = useState(() => (localStorage.getItem('mapsync_draft_name') || '').length > 0);
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [dLogicalName, setDLogicalName] = useState('');
    const [dTableName, setDTableName] = useState('');
    const [dPhysicalId, setDPhysicalId] = useState('');
    const [dRegisterGlobal, setDRegisterGlobal] = useState(true);
    const [dColumns, setDColumns] = useState<ModuleColumn[]>([]);
    const [aiSuggestions, setAiSuggestions] = useState<{ name: string, type: DataType }[]>([]);

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
        const cleanName = name.trim();
        if (!cleanName) {
            showToast("Module name is required", "error");
            return;
        }

        if (cleanName.length < 3) {
            showToast("Module name must be at least 3 characters", "error");
            return;
        }

        // Validate uniqueness against ALL registered modules in the ecosystem
        const isDuplicate = allRegisteredModules.includes(cleanName.toLowerCase());
        if (isDuplicate) {
            showToast(`A module named "${cleanName}" already exists in the system registry. Please choose a unique name.`, "error");
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
        setAiSuggestions([]); // Clear AI suggestions when opening editor
        setMatches([]); // Clear matches when opening editor
        setStep('editor');
    };

    const saveObject = (): boolean => {
        if (!dLogicalName || !dTableName || dColumns.length === 0) {
            showToast("Please fill in all object details", "error");
            return false;
        }

        if (!dColumns.some(c => c.isPk)) {
            showToast("Primary key is mandatory", "error");
            return false;
        }

        // Validate uniqueness within current module
        const isDuplicateObject = stagedObjects.some((o, idx) =>
            idx !== editingIndex &&
            (o.name.toUpperCase() === dTableName.toUpperCase() || o.logicalName.toLowerCase() === dLogicalName.toLowerCase())
        );

        if (isDuplicateObject) {
            showToast(`An object with name "${dLogicalName}" or table "MSAI_${dTableName}" already exists in this module draft.`, "error");
            return false;
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
        return true;
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
            // 1. Fetch live "Universe" from database instead of constants
            const legacyUniverse = await apiService.fetchLegacyUniverse();

            // 2. Search for similar existing schemas (Deep Weighted Match)
            const cleanName = dLogicalName.toLowerCase()
                .replace(/[^a-z0-9\s_]/g, '')
                .replace(/(.)\1{2,}/g, '$1');

            const searchWords = cleanName.split(/[\s_]+/)
                .filter(w => w.length > 2)
                .map(w => w.replace(/s+$/, ''));

            const scoredMatches = (Object.values(legacyUniverse || {}) as SchemaDefinition[]).map(s => {
                const targetNameText = (s.name + " " + (s.table_name || '')).toLowerCase().replace(/[^a-z0-9\s_]/g, '');
                const targetNameWords = targetNameText.split(/[\s_]+/).map(w => w.replace(/s+$/, ''));

                const fieldText = (s.fields || []).map(f => f.column_name + " " + (f.label || "")).join(" ").toLowerCase();
                const fieldWords = fieldText.split(/[\s_]+/).map(w => w.replace(/s+$/, ''));

                let score = 0;
                let wordsMatchedCount = 0;
                let hasNameMatch = false;
                let hasIntentMatch = false;

                searchWords.forEach(sw => {
                    let wordHasMatch = false;
                    // 1. Identity Match (Name/Table - Weight 20)
                    if (targetNameWords.some(tw => tw === sw || (tw.length > 3 && (tw.includes(sw) || sw.includes(tw))))) {
                        score += 20;
                        wordHasMatch = true;
                        hasNameMatch = true;
                    }
                    // 2. Intent Match (Fields - Weight 10)
                    if (fieldWords.some(fw => fw === sw || (fw.length > 4 && fw.includes(sw)))) {
                        score += 10;
                        wordHasMatch = true;
                        hasIntentMatch = true;
                    }
                    if (wordHasMatch) wordsMatchedCount++;
                });

                const coverage = wordsMatchedCount / searchWords.length;
                let finalScore = score * Math.pow(coverage, 2);

                // INTENT GAP PENALTY: Match name but no fields for a multi-word search
                if (searchWords.length > 1 && hasNameMatch && !hasIntentMatch) {
                    finalScore = finalScore * 0.05;
                }

                if (searchWords.length > 1 && !hasNameMatch) {
                    finalScore = finalScore * 0.05;
                }

                return { schema: s, score: finalScore };
            })
                .filter(m => m.score > 5)
                .sort((a, b) => b.score - a.score)
                .slice(0, 3);

            setMatches(scoredMatches.map(m => m.schema));

            // 3. AI Suggestions (Gemini)
            const suggestions = await suggestColumns(dLogicalName);
            setAiSuggestions(suggestions);

            if (scoredMatches.length > 0) {
                showToast(`AI Menu ready & found ${scoredMatches.length} existing modules`);
            } else {
                showToast(`AI analyzed ${suggestions.length} industry-standard attributes`);
            }

            // The original code had a duplicate toast message here, removed it.
            // if (foundMatches.length > 0) {
            //     showToast(`AI suggested fields & found ${foundMatches.length} similar existing modules`);
            // } else {
            //     showToast(`AI added ${suggestions.length} relevant attributes`);
            // }
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

        // Final Clean up after successful provisioning and launch
        localStorage.removeItem('mapsync_draft_name');
        localStorage.removeItem('mapsync_draft_icon');
        localStorage.removeItem('mapsync_draft_objects');
        setName('');
        setIcon('📦');
        setStagedObjects([]);
        setShowRecovery(false);
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
                <div className={`fixed top-12 left-1/2 -translate-x-1/2 px-8 py-4 rounded-full shadow-2xl z-50 animate-in slide-in-from-top-4 font-medium text-[10px] uppercase tracking-widest ${toast.type === 'success' ? 'bg-slate-900/90 text-white backdrop-blur-md' : 'bg-rose-500 text-white'}`}>
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
                                <h2 className="text-lg font-medium text-slate-900 tracking-tight uppercase">Blueprint</h2>
                            </div>
                            <p className="text-slate-400 text-[7px] font-medium uppercase tracking-[0.2em] pl-1">Architectural Design</p>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={clearDraft}
                                className="px-3 py-1.5 bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-100 rounded-lg transition-all group"
                                title="Wipe Draft"
                            >
                                <span className="text-[8px] font-medium uppercase tracking-widest text-slate-300 group-hover:text-rose-600">Reset ↺</span>
                            </button>
                            <button
                                onClick={onBack}
                                className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-all group"
                            >
                                <span className="text-[8px] font-medium uppercase tracking-widest text-slate-400 group-hover:text-slate-900">Close ✕</span>
                            </button>
                        </div>
                    </div>

                    <div className="relative px-12">
                        {/* Connector Line Background */}
                        <div className="absolute top-4 left-[64px] right-[64px] h-0.5 bg-slate-100 -z-0"></div>

                        {/* Progress Line */}
                        <div
                            className="absolute top-4 left-[64px] h-0.5 bg-blue-600 transition-all duration-700 ease-in-out -z-0"
                            style={{
                                width: step === 'profile' ? '0%' : step === 'catalog' ? 'calc(50% - 64px)' : 'calc(100% - 128px)'
                            }}
                        ></div>

                        <div className="relative flex justify-between z-10">
                            {[
                                { id: 'profile', label: 'Identity', icon: '🆔' },
                                { id: 'catalog', label: 'Blueprint', icon: '�' },
                                { id: 'editor', label: 'Architecture', icon: '�' }
                            ].map((s, idx) => {
                                const stepOrder = ['profile', 'catalog', 'editor'];
                                const stepIndex = stepOrder.indexOf(step);
                                const isCompleted = idx < stepIndex;
                                const isActive = step === s.id;

                                return (
                                    <div key={s.id} className="flex flex-col items-center gap-2 min-w-[64px]">
                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-500 shadow-sm ${isActive ? 'bg-blue-600 text-white scale-110 shadow-lg shadow-blue-500/20' :
                                            isCompleted ? 'bg-blue-100 text-blue-600' : 'bg-white text-slate-300 border border-slate-100'
                                            }`}>
                                            <span className="text-xs">{s.icon}</span>
                                        </div>
                                        <span className={`text-[7px] font-medium uppercase tracking-widest transition-colors duration-500 ${isActive ? 'text-blue-600' : 'text-slate-300'}`}>
                                            {s.label}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Wizard Body */}
                <div className="flex-1 p-8 overflow-y-auto blueprint-grid">
                    {step === 'profile' && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-right-2 duration-300">
                            {showRecovery ? (
                                <div className="space-y-6">
                                    <div className="bg-slate-50 border-2 border-slate-200 rounded-[2.5rem] p-10 flex flex-col items-center text-center gap-6 group hover:border-blue-500 transition-all shadow-xl shadow-slate-100/50">
                                        <div className="w-24 h-24 bg-white rounded-[2rem] flex items-center justify-center text-5xl shadow-lg border border-slate-100 group-hover:scale-110 transition-transform">
                                            {icon}
                                        </div>
                                        <div className="space-y-2">
                                            <h3 className="text-xl font-medium text-slate-900 tracking-tight">{name || 'Unnamed Module'}</h3>
                                            <p className="text-[10px] font-medium text-slate-400 uppercase tracking-widest bg-white px-4 py-1.5 rounded-full border border-slate-100 shadow-smInline-block">
                                                {stagedObjects.length} ENTITIES ARCHITECTED
                                            </p>
                                        </div>
                                        <div className="flex flex-col gap-3 w-full max-w-xs mt-4">
                                            <button
                                                onClick={() => {
                                                    setShowRecovery(false);
                                                    setStep('catalog');
                                                }}
                                                className="w-full py-5 bg-blue-600 text-white rounded-2xl font-medium text-[12px] uppercase tracking-widest hover:bg-blue-700 shadow-xl shadow-blue-200 transition-all flex items-center justify-center gap-3"
                                            >
                                                Resume Blueprint <span>→</span>
                                            </button>
                                            <button
                                                onClick={() => {
                                                    // Allow updating identity by just hiding the recovery card
                                                    setShowRecovery(false);
                                                }}
                                                className="w-full py-4 bg-white border border-slate-200 text-slate-600 rounded-2xl font-medium text-[10px] uppercase tracking-widest hover:border-slate-400 transition-all"
                                            >
                                                Edit Identity ✎
                                            </button>
                                            <button
                                                onClick={() => {
                                                    if (confirm("Discard current draft and start fresh?")) {
                                                        setName('');
                                                        setIcon('📦');
                                                        setStagedObjects([]);
                                                        localStorage.removeItem('mapsync_draft_name');
                                                        localStorage.removeItem('mapsync_draft_icon');
                                                        localStorage.removeItem('mapsync_draft_objects');
                                                        setShowRecovery(false);
                                                    }
                                                }}
                                                className="w-full py-2 text-slate-300 hover:text-rose-500 font-medium text-[8px] uppercase tracking-widest transition-colors"
                                            >
                                                Purge & Start New Architect ↺
                                            </button>
                                        </div>
                                    </div>
                                    <p className="text-center text-[8px] font-medium text-slate-300 uppercase tracking-[0.3em]">Session Recovered from Local Memory</p>
                                </div>
                            ) : (
                                <>
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-2 px-1">
                                            <div className="w-0.5 h-2 bg-blue-600 rounded-full"></div>
                                            <label className="text-[9px] font-medium text-slate-900 uppercase tracking-widest">Core Module Identity</label>
                                        </div>
                                        <input
                                            type="text"
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            placeholder="Enter module name..."
                                            className="w-full text-lg font-medium p-6 bg-white border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-blue-100 shadow-sm transition-all placeholder:text-slate-200"
                                            autoFocus
                                        />
                                    </div>

                                    <div className="space-y-4">
                                        <label className="text-[9px] font-medium text-slate-400 uppercase tracking-widest px-1 block">Visual Signature</label>
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
                                            className="px-8 py-4 bg-slate-900 text-white rounded-xl text-[9px] font-medium uppercase tracking-widest hover:bg-blue-600 shadow-lg transition-all flex items-center gap-3 group"
                                        >
                                            Model Architecture <span className="group-hover:translate-x-1 transition-transform">→</span>
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {step === 'catalog' && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-300">
                            <div className="flex items-center justify-between px-1">
                                <div className="space-y-0.5">
                                    <h3 className="text-base font-medium text-slate-900 uppercase tracking-tight">Module Workbench</h3>
                                    <p className="text-[8px] font-medium text-slate-400 uppercase tracking-widest">Managing {stagedObjects.length} entities in {name}</p>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => openEditor()}
                                        className="px-5 py-2.5 bg-slate-900 text-white rounded-lg text-[8px] font-medium uppercase tracking-widest hover:bg-blue-600 transition-all shadow-md flex items-center gap-2 group"
                                    >
                                        <span className="text-sm group-hover:scale-110 transition-transform">+</span> Add Data Entity
                                    </button>
                                </div>
                            </div>

                            <div className="flex items-center justify-between mb-2">
                                <div className="flex flex-col gap-0.5">
                                    <h3 className="text-[10px] font-medium text-slate-900 uppercase tracking-[0.2em] flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
                                        Module Blueprint
                                    </h3>
                                    <p className="text-[7px] font-medium text-slate-400 uppercase tracking-widest">{stagedObjects.length} Entities Orchestrated</p>
                                </div>
                            </div>

                            {stagedObjects.length === 0 ? (
                                <div className="py-12 text-center space-y-4 glass-card rounded-2xl border-2 border-dashed border-slate-100/50 bg-slate-50/30">
                                    <div className="text-lg opacity-50">🏗️</div>
                                    <div className="space-y-1">
                                        <p className="text-[9px] font-medium text-slate-400 uppercase tracking-widest">Architectural Canvas Empty</p>
                                        <p className="text-[8px] font-medium text-slate-300 uppercase tracking-tight">Begin by adding your first data entity</p>
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
                                                        onClick={() => {
                                                            if (confirm(`Remove ${obj.logicalName}?`)) removeObject(i);
                                                        }}
                                                        className="w-8 h-8 bg-white hover:bg-rose-500 hover:text-white border border-slate-100 rounded-lg flex items-center justify-center transition-all text-[10px] text-rose-500"
                                                        title="Remove from Blueprint"
                                                    >🗑️</button>
                                                </div>
                                            </div>

                                            <div className="space-y-0.5 relative z-10">
                                                <p className="text-xs font-medium text-slate-900 uppercase tracking-tight">{obj.logicalName}</p>
                                                <p className="text-[7px] font-medium text-blue-600/60 uppercase tracking-widest">MSAI_{obj.name}</p>
                                            </div>

                                            <div className="flex items-center gap-2 pt-2 border-t border-slate-50 relative z-10">
                                                <span className="text-[7px] font-medium text-slate-300 uppercase tracking-widest">{obj.columns.length} Fields</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="pt-6 flex items-center justify-between">
                                <button
                                    onClick={() => setShowRecovery(false)}
                                    className="text-[8px] font-medium uppercase tracking-widest text-slate-400 hover:text-slate-900 transition-all flex items-center gap-2"
                                >← Update Identity</button>
                                <button
                                    onClick={handleLaunch}
                                    disabled={stagedObjects.length === 0 || isProvisioning}
                                    className="px-8 py-4 bg-blue-600 text-white rounded-xl font-medium text-[9px] uppercase tracking-widest shadow-md hover:bg-blue-700 disabled:opacity-30 transition-all flex items-center gap-3"
                                >
                                    {isProvisioning ? 'Splicing...' : 'Finalize & Provision Module'}
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
                                        <label className="text-[9px] font-medium text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                            <div className="w-1.5 h-1.5 bg-blue-600 rounded-full"></div>
                                            Object Essence (Logical Name)
                                        </label>
                                        <div className="flex items-center gap-2 opacity-40 hover:opacity-100 transition-opacity">
                                            <span className="text-[7px] font-medium text-slate-300 uppercase tracking-widest">System ID:</span>
                                            <span className="text-[8px] font-mono font-medium text-slate-400">MSAI_{dTableName || '...'}</span>
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
                                        className="w-full text-lg font-medium p-5 bg-white border border-slate-100 rounded-xl outline-none focus:ring-4 focus:ring-blue-50 transition-all shadow-inner placeholder:text-slate-200"
                                        autoFocus
                                    />
                                </div>
                            </div>

                            <div className="space-y-4">
                                {matches.length > 0 && (
                                    <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4 space-y-4 animate-in fade-in zoom-in-95 duration-300">
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex flex-col gap-0.5">
                                                <h5 className="text-[8px] font-medium text-blue-600 uppercase tracking-[0.2em]">Legacy Reference Found</h5>
                                                <p className="text-[6px] text-slate-400 font-medium uppercase tracking-tight">Attributes are synced globally to your current table blueprint</p>
                                            </div>
                                            <button
                                                onClick={() => setMatches([])}
                                                className="text-[8px] font-medium text-slate-300 hover:text-slate-900 uppercase"
                                            >Dismiss</button>
                                        </div>

                                        <div className="space-y-4">
                                            {(matches as SchemaDefinition[]).map(m => (
                                                <div key={m.id} className="bg-white rounded-lg border border-blue-50 p-3 space-y-3 shadow-sm">
                                                    <div className="flex items-center justify-between border-b border-slate-50 pb-2">
                                                        <div className="flex flex-col">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[9px] font-medium text-slate-700">{m.icon} {m.name}</span>
                                                                {m.moduleName && (
                                                                    <span className="text-[7px] font-medium text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded uppercase tracking-tight">
                                                                        Part of {m.moduleName}
                                                                    </span>
                                                                )}
                                                                <span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-[5px] font-medium uppercase tracking-tighter border border-blue-100 flex items-center gap-1">
                                                                    <span className="w-1 h-1 rounded-full bg-blue-400"></span>
                                                                    High Confidence Match
                                                                </span>
                                                            </div>
                                                            <span className="text-[7px] text-slate-400 font-medium uppercase tracking-tighter italic">Found via Architectural Pattern Analysis</span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
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
                                                                    className="text-[7px] font-medium text-blue-600 uppercase hover:bg-blue-50 px-2 py-1 rounded transition-colors"
                                                                >Select All</button>
                                                                <button
                                                                    onClick={() => {
                                                                        const mNames = m.fields.map(f => f.column_name.toUpperCase());
                                                                        setDColumns(dColumns.filter(c => !mNames.includes(c.name.toUpperCase())));
                                                                        showToast(`Removed fields from ${m.name}`);
                                                                    }}
                                                                    className="text-[7px] font-medium text-rose-500 uppercase hover:bg-rose-50 px-2 py-1 rounded transition-colors"
                                                                >Remove All</button>
                                                            </div>
                                                            <button
                                                                onClick={() => setMatches(matches.filter(match => match.id !== m.id))}
                                                                className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-300 hover:text-rose-500 transition-all text-[10px]"
                                                                title="Dismiss this suggestion"
                                                            >✕</button>
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {m.fields && m.fields.length > 0 ? (
                                                            m.fields.map(f => {
                                                                const isAlreadyIn = dColumns.some(c => c.name.toUpperCase() === f.column_name.toUpperCase());
                                                                return (
                                                                    <div
                                                                        key={f.id}
                                                                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[8px] font-medium transition-all border ${isAlreadyIn
                                                                            ? 'bg-blue-50 border-blue-200 text-blue-700 ring-1 ring-blue-100 shadow-sm'
                                                                            : 'bg-white border-slate-200 text-slate-500 hover:border-blue-400 hover:bg-blue-50/30'
                                                                            }`}
                                                                    >
                                                                        {f.column_name}
                                                                        {!isAlreadyIn ? (
                                                                            <button
                                                                                onClick={() => {
                                                                                    setDColumns([...dColumns, { name: f.column_name.toUpperCase(), type: f.type as any, required: f.required, isPk: false }]);
                                                                                }}
                                                                                className="w-4 h-4 rounded-full bg-slate-100 hover:bg-blue-600 hover:text-white flex items-center justify-center transition-colors pb-0.5"
                                                                            >+</button>
                                                                        ) : (
                                                                            <button
                                                                                onClick={() => {
                                                                                    setDColumns(dColumns.filter(c => c.name.toUpperCase() !== f.column_name.toUpperCase()));
                                                                                }}
                                                                                className="flex items-center gap-1.5 px-1.5 py-0.5 bg-blue-50 hover:bg-rose-50 border border-blue-100 hover:border-rose-200 rounded transition-all group/unsync"
                                                                            >
                                                                                <span className="text-blue-600 font-medium text-[7px] group-hover/unsync:hidden">✓ SYNCED</span>
                                                                                <span className="hidden group-hover/unsync:inline text-rose-500 font-medium text-[7px]">UNSYNC 🗑️</span>
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })
                                                        ) : (
                                                            <div className="w-full py-3 bg-slate-50 rounded-lg text-center border border-dashed border-slate-200">
                                                                <span className="text-[7px] font-medium text-slate-400 uppercase tracking-widest">No predefined attributes</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {aiSuggestions.length > 0 && (
                                    <div className="mb-6 p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100 animate-in slide-in-from-top-2 duration-300">
                                        <div className="flex items-center justify-between mb-4">
                                            <div className="flex flex-col gap-0.5">
                                                <h5 className="text-[8px] font-medium text-indigo-600 uppercase tracking-[0.2em]">✨ AI Intelligence Menu</h5>
                                                <p className="text-[6px] text-slate-400 font-medium uppercase tracking-tight">AI identified {aiSuggestions.length} domain-specific attributes</p>
                                            </div>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => {
                                                        const next = [...dColumns];
                                                        aiSuggestions.forEach(s => {
                                                            if (!next.find(c => c.name.toUpperCase() === s.name.toUpperCase())) {
                                                                next.push({ name: s.name.toUpperCase(), type: s.type, required: false, isPk: false });
                                                            }
                                                        });
                                                        setDColumns(next);
                                                        setAiSuggestions([]);
                                                    }}
                                                    className="text-[7px] font-medium text-indigo-600 uppercase hover:bg-indigo-100 px-2 py-1 rounded transition-colors"
                                                >Add All</button>
                                                <button
                                                    onClick={() => setAiSuggestions([])}
                                                    className="text-[8px] font-medium text-slate-300 hover:text-slate-900 uppercase"
                                                >Dismiss</button>
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap gap-1.5">
                                            {aiSuggestions.map((s, idx) => {
                                                const isAlreadyIn = dColumns.some(c => c.name.toUpperCase() === s.name.toUpperCase());
                                                return (
                                                    <div
                                                        key={idx}
                                                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[8px] font-medium transition-all border ${isAlreadyIn
                                                            ? 'bg-indigo-100 border-indigo-200 text-indigo-700 ring-1 ring-indigo-100 shadow-sm'
                                                            : 'bg-white border-slate-200 text-slate-500 hover:border-indigo-400 hover:bg-indigo-50/30'
                                                            }`}
                                                    >
                                                        {s.name}
                                                        {!isAlreadyIn ? (
                                                            <button
                                                                onClick={() => {
                                                                    setDColumns([...dColumns, { name: s.name.toUpperCase(), type: s.type, required: false, isPk: false }]);
                                                                }}
                                                                className="w-4 h-4 rounded-full bg-slate-100 hover:bg-indigo-600 hover:text-white flex items-center justify-center transition-colors pb-0.5"
                                                            >+</button>
                                                        ) : (
                                                            <button
                                                                onClick={() => {
                                                                    setDColumns(dColumns.filter(c => c.name.toUpperCase() !== s.name.toUpperCase()));
                                                                }}
                                                                className="flex items-center gap-0.5 text-indigo-600 hover:text-rose-500 transition-colors group/ai"
                                                            >
                                                                <span className="group-hover/ai:hidden">✓</span>
                                                                <span className="hidden group-hover/ai:inline text-[8px]">✕</span>
                                                                <span className="text-[5px] uppercase font-medium tracking-tighter opacity-50">Synced</span>
                                                            </button>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                <div className="flex items-center justify-between px-1">
                                    <h4 className="text-[9px] font-medium text-slate-900 uppercase tracking-widest">Attributes</h4>
                                    <div className="flex gap-1.5">
                                        <button
                                            onClick={() => {
                                                if (confirm("Wipe all active columns?")) setDColumns([]);
                                            }}
                                            className="px-3 py-1.5 bg-rose-50 text-rose-600 border border-rose-100 rounded-md text-[7px] font-medium uppercase tracking-widest hover:bg-rose-500 hover:text-white transition-all shadow-sm"
                                        >
                                            🗑️ Trash All
                                        </button>
                                        <button
                                            onClick={handleAIsuggest}
                                            disabled={isSuggesting || !dLogicalName}
                                            className={`px-3 py-1.5 bg-indigo-600 text-white rounded-md text-[7px] font-medium uppercase tracking-widest flex items-center gap-1.5 hover:bg-slate-900 disabled:opacity-30 transition-all shadow-sm ${isSuggesting ? 'animate-pulse' : ''}`}
                                        >
                                            {isSuggesting ? '...' : '✨ AI Suggest'}
                                        </button>
                                        <button
                                            onClick={() => setDColumns([...dColumns, { name: '', type: 'VARCHAR', required: false, isPk: false }])}
                                            className="px-3 py-1.5 bg-slate-900 text-white rounded-md text-[7px] font-medium uppercase tracking-widest hover:bg-blue-600 transition-all"
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
                                                className="flex-1 bg-slate-50 border border-slate-100 rounded-lg p-3 text-[9px] font-medium outline-none group-hover:bg-white transition-colors"
                                            />
                                            <select
                                                value={col.type}
                                                onChange={(e) => {
                                                    const next = [...dColumns];
                                                    next[i].type = e.target.value as DataType;
                                                    setDColumns(next);
                                                }}
                                                className="bg-slate-50 border border-slate-100 rounded-lg p-3 text-[8px] font-medium outline-none group-hover:bg-white transition-colors min-w-[100px]"
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
                                <div className="flex gap-4">
                                    <button
                                        onClick={() => stagedObjects.length > 0 ? setStep('catalog') : setStep('profile')}
                                        className="text-[8px] font-medium uppercase tracking-widest text-slate-300 hover:text-slate-900 transition-all px-2"
                                    >← {stagedObjects.length > 0 ? 'Back to Blueprint' : 'Back to Identity'}</button>
                                    {editingIndex !== null && (
                                        <button
                                            onClick={() => {
                                                if (confirm("Permanently delete this object from the module?")) {
                                                    removeObject(editingIndex);
                                                    setStep('catalog');
                                                }
                                            }}
                                            className="text-[8px] font-medium uppercase tracking-widest text-rose-400 hover:text-rose-600 transition-all border-l border-slate-100 pl-4"
                                        >Delete Object</button>
                                    )}
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => {
                                            const saved = saveObject();
                                            if (saved) {
                                                setTimeout(() => openEditor(), 50);
                                            }
                                        }}
                                        className="px-5 py-3 bg-white border border-slate-200 text-slate-600 rounded-lg text-[8px] font-medium uppercase tracking-widest hover:border-slate-900 hover:text-slate-900 transition-all shadow-sm"
                                    >
                                        Save & Add Another
                                    </button>
                                    <button
                                        onClick={() => saveObject()}
                                        className="px-8 py-3 bg-slate-900 text-white rounded-lg text-[8px] font-medium uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-md flex items-center gap-2 group"
                                    >
                                        💾 Save to Blueprint <span className="group-hover:scale-110 transition-transform">✓</span>
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

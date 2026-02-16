
import React, { useState } from 'react';
import { DataType, SchemaDefinition } from '../types';
import { apiService } from '../services/apiService';

interface CustomModuleCreationProps {
    onBack: () => void;
    onCreate: (name: string, icon: string, objects: any[]) => void;
    allSchemas: Record<string, SchemaDefinition>;
}

export const CustomModuleCreation: React.FC<CustomModuleCreationProps> = ({ onBack, onCreate }) => {
    const [name, setName] = useState('');
    const [icon, setIcon] = useState('📦');

    // Selection States
    const [stagedDrafts, setStagedDrafts] = useState<{ name: string, logicalName: string, columns: any[], registerGlobal: boolean }[]>([]);

    // Current Draft State
    const [draftLogicalName, setDraftLogicalName] = useState('');
    const [draftTableName, setDraftTableName] = useState('');
    const [registerDraftGlobal, setRegisterDraftGlobal] = useState(true);
    const [draftColumns, setDraftColumns] = useState<{ name: string, type: DataType, required: boolean, isPk: boolean }>([
        { name: 'ID', type: 'NUMERIC', required: true, isPk: true },
        { name: 'NAME', type: 'VARCHAR', required: false, isPk: false }
    ]);

    const [isProvisioning, setIsProvisioning] = useState(false);
    const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);

    const showToast = (message: string, type: 'success' | 'error' = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    const stageCurrentDraft = () => {
        if (!draftTableName || !draftLogicalName || draftColumns.length === 0) return;

        // Check if table name already staged
        if (stagedDrafts.some(d => d.name === draftTableName)) {
            showToast("Physical Table ID must be unique.", "error");
            return;
        }

        if (!draftColumns.some(c => c.isPk)) {
            showToast("At least one column must be marked as Primary Key (PK).", "error");
            return;
        }

        setStagedDrafts([...stagedDrafts, {
            name: draftTableName,
            logicalName: draftLogicalName,
            columns: [...draftColumns],
            registerGlobal: registerDraftGlobal
        }]);

        // Reset draft fields
        setDraftLogicalName('');
        setDraftTableName('');
        setRegisterDraftGlobal(true);
        setDraftColumns([
            { name: 'ID', type: 'NUMERIC', required: true, isPk: true },
            { name: 'NAME', type: 'VARCHAR', required: false, isPk: false }
        ]);
        showToast("Object staged successfully.");
    };

    const addDraftColumn = () => {
        setDraftColumns([...draftColumns, { name: '', type: 'VARCHAR', required: false, isPk: false }]);
    };

    const updateDraftColumn = (idx: number, updates: any) => {
        const next = [...draftColumns];
        next[idx] = { ...next[idx], ...updates };
        setDraftColumns(next);
    };

    const removeStaged = (idx: number) => {
        setStagedDrafts(prev => prev.filter((_, i) => i !== idx));
    };

    const handleCreate = async () => {
        if (!name.trim()) {
            showToast("Module Name is required.", "error");
            return;
        }

        if (stagedDrafts.length === 0 && (!draftTableName || !draftLogicalName)) {
            showToast("Add at least one Data Object to the module.", "error");
            return;
        }

        setIsProvisioning(true);
        const objects: any[] = [];

        // Finalize current draft if partially filled
        const finalDrafts = [...stagedDrafts];
        if (draftTableName && draftLogicalName && draftColumns.length > 0) {
            finalDrafts.push({
                name: draftTableName,
                logicalName: draftLogicalName,
                columns: [...draftColumns],
                registerGlobal: registerDraftGlobal
            });
        }

        // Provision all objects
        for (const draft of finalDrafts) {
            try {
                const result = await apiService.createDynamicTable(draft.name, draft.columns);
                if (result.success && result.tableName) {
                    objects.push({
                        type: 'draft',
                        id: result.tableName,
                        name: draft.logicalName,
                        table: result.tableName,
                        isGlobal: draft.registerGlobal
                    });
                } else {
                    showToast(`Failed to create table ${draft.name}: ${result.message}`, "error");
                    setIsProvisioning(false);
                    return;
                }
            } catch (err) {
                console.error(`Failed to provision table ${draft.name}:`, err);
                showToast(`System error provisioning ${draft.name}`, "error");
                setIsProvisioning(false);
                return;
            }
        }

        setIsProvisioning(false);
        onCreate(name, icon, objects);
    };

    const icons = ['📦', '👥', '💰', '📊', '🏗️', '🧪', '🛡️', '🌐', '🚚', '🔧'];

    return (
        <div className="max-w-5xl mx-auto animate-in fade-in slide-in-from-bottom-8 duration-700 pb-20">
            {toast && (
                <div className={`fixed top-12 left-1/2 -translate-x-1/2 px-8 py-4 rounded-2xl shadow-2xl z-50 animate-in slide-in-from-top-4 duration-300 font-black text-[10px] uppercase tracking-widest ${toast.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'}`}>
                    {toast.message}
                </div>
            )}

            <div className="bg-white rounded-[3rem] shadow-2xl border border-slate-200 overflow-hidden">
                <div className="p-10 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                    <div>
                        <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">Module Framework Architect</h2>
                        <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mt-2">Design an isolated workspace with custom data objects.</p>
                    </div>
                    <button
                        onClick={onBack}
                        className="px-6 py-3 bg-white border border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-900 hover:text-white transition-all shadow-sm"
                    >
                        ← Cancel
                    </button>
                </div>

                <div className="p-12 space-y-12">
                    {/* Module Profile */}
                    <div className="grid grid-cols-12 gap-8">
                        <div className="col-span-12 lg:col-span-8 space-y-4">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Module Name</label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="e.g., Regional Logistics"
                                className="w-full text-xl font-bold p-6 bg-slate-50 border-2 border-slate-100 rounded-3xl focus:border-blue-500 focus:bg-white outline-none transition-all"
                            />
                        </div>
                        <div className="col-span-12 lg:col-span-4 space-y-4">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block text-center">Module Symbol</label>
                            <div className="flex flex-wrap justify-center gap-2">
                                {icons.map(i => (
                                    <button
                                        key={i}
                                        onClick={() => setIcon(i)}
                                        className={`w-10 h-10 flex items-center justify-center rounded-xl text-lg transition-all ${icon === i ? 'bg-slate-900 text-white shadow-xl scale-110' : 'bg-slate-50 hover:bg-slate-100'}`}
                                    >
                                        {i}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Objects List */}
                    <div className="space-y-6">
                        <div className="flex items-center justify-between">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Module Data Objects ({stagedDrafts.length})</label>
                            {stagedDrafts.length > 0 && (
                                <p className="text-[8px] font-black text-emerald-500 uppercase tracking-widest">Tables will be provisioned in Oracle upon initialization</p>
                            )}
                        </div>

                        {stagedDrafts.length > 0 && (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-6 border-b border-slate-100">
                                {stagedDrafts.map((d, idx) => (
                                    <div key={idx} className="bg-slate-900 p-4 rounded-2xl relative group">
                                        <button
                                            onClick={() => removeStaged(idx)}
                                            className="absolute top-2 right-2 w-6 h-6 bg-rose-500 text-white rounded-full text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
                                        >✕</button>
                                        <p className="text-[10px] font-black text-white uppercase truncate">{d.logicalName}</p>
                                        <p className="text-[8px] font-bold text-slate-500 uppercase mt-1">MSAI_{d.name}</p>
                                        <div className="flex gap-1 mt-2 flex-wrap">
                                            {d.columns.map((c, i) => (
                                                <span key={i} className={`text-[6px] font-black px-1 rounded uppercase ${c.isPk ? 'bg-blue-500 text-white' : 'bg-white/10 text-white/40'}`}>
                                                    {c.isPk && '🔑 '}{c.name}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-[2.5rem] p-8 space-y-8 animate-in fade-in duration-500">
                            <div className="grid grid-cols-12 gap-8">
                                <div className="col-span-12 lg:col-span-5 space-y-6">
                                    <div className="space-y-3">
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-2">Object Display Name</label>
                                        <input
                                            type="text"
                                            value={draftLogicalName}
                                            onChange={(e) => setDraftLogicalName(e.target.value)}
                                            placeholder="e.g., Active Shipments"
                                            className="w-full text-xs font-black p-4 bg-white border border-slate-100 rounded-2xl outline-none"
                                        />
                                    </div>
                                    <div className="space-y-3">
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-2">Physical Oracle Table ID</label>
                                        <div className="flex items-center gap-2 bg-white p-2 rounded-2xl border border-slate-100">
                                            <span className="bg-slate-900 px-3 py-2 rounded-lg text-[8px] font-black text-white">MSAI_</span>
                                            <input
                                                type="text"
                                                value={draftTableName}
                                                onChange={(e) => setDraftTableName(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
                                                placeholder="SHIPMENTS_V1"
                                                className="flex-1 text-[10px] font-black p-2 outline-none"
                                            />
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 p-4 bg-blue-50/50 border border-blue-100 rounded-2xl">
                                        <input
                                            type="checkbox"
                                            id="regGlobal"
                                            checked={registerDraftGlobal}
                                            onChange={(e) => setRegisterDraftGlobal(e.target.checked)}
                                            className="w-4 h-4 accent-blue-600"
                                        />
                                        <label htmlFor="regGlobal" className="text-[9px] font-black text-blue-900 uppercase tracking-widest cursor-pointer leading-none">Add to System Registry for reuse</label>
                                    </div>
                                </div>

                                <div className="col-span-12 lg:col-span-7 space-y-4">
                                    <div className="flex justify-between items-center px-2">
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Table Columns</label>
                                        <button
                                            onClick={addDraftColumn}
                                            className="px-4 py-2 bg-blue-50 text-blue-600 rounded-full text-[9px] font-black uppercase border border-blue-100 hover:bg-blue-600 hover:text-white transition-all shadow-sm"
                                        >
                                            + Add Field
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-1 gap-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                                        {draftColumns.map((col, i) => (
                                            <div key={i} className="flex gap-3 items-center bg-white p-3 rounded-2xl border border-slate-100 shadow-sm">
                                                <input
                                                    type="text"
                                                    placeholder="NAME"
                                                    value={col.name}
                                                    onChange={(e) => updateDraftColumn(i, { name: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '') })}
                                                    className="flex-1 bg-slate-50 border-none rounded-xl p-3 text-[9px] font-black outline-none"
                                                />
                                                <select
                                                    value={col.type}
                                                    onChange={(e) => updateDraftColumn(i, { type: e.target.value })}
                                                    className="bg-slate-50 border-none rounded-xl p-3 text-[9px] font-black outline-none"
                                                >
                                                    <option value="VARCHAR">VARCHAR</option>
                                                    <option value="NUMERIC">NUMERIC</option>
                                                    <option value="TIMESTAMP">TIMESTAMP</option>
                                                </select>
                                                <button
                                                    onClick={() => updateDraftColumn(i, { isPk: !col.isPk })}
                                                    className={`px-3 py-2 rounded-xl text-[8px] font-black uppercase transition-all border ${col.isPk ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-slate-50 text-slate-400 border-slate-100 hover:bg-slate-100'}`}
                                                    title="Toggle Primary Key"
                                                >
                                                    {col.isPk ? '🔑 PK' : 'PK'}
                                                </button>
                                                {draftColumns.length > 1 && (
                                                    <button
                                                        onClick={() => setDraftColumns(prev => prev.filter((_, idx) => idx !== i))}
                                                        className="p-3 text-rose-300 hover:text-rose-500"
                                                    >
                                                        ✕
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-center border-t border-slate-200 pt-8">
                                <button
                                    onClick={stageCurrentDraft}
                                    disabled={!draftTableName || !draftLogicalName || draftColumns.some(c => !c.name)}
                                    className="px-10 py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 shadow-xl disabled:opacity-30 transition-all"
                                >
                                    📥 Stage Data Object
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Action Footer */}
                    <div className="pt-8 border-t border-slate-100 flex items-center justify-between">
                        <div className="flex flex-col">
                            <p className="text-[10px] font-black text-slate-800 uppercase">Framework Initialization Ready</p>
                            <p className="text-[8px] font-bold text-slate-400 uppercase mt-1">Total Objects: {stagedDrafts.length + (draftTableName ? 1 : 0)}</p>
                        </div>
                        <button
                            onClick={handleCreate}
                            disabled={isProvisioning || (!name) || (stagedDrafts.length === 0 && !draftTableName)}
                            className="px-16 py-8 bg-blue-600 text-white rounded-3xl font-black text-xs uppercase tracking-[0.4em] shadow-xl hover:shadow-2xl hover:-translate-y-1 active:translate-y-0 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center gap-4"
                        >
                            {isProvisioning ? (
                                <><div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></div> Creating Module...</>
                            ) : (
                                <>🚀 Launch Module</>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

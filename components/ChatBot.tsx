import React, { useState, useRef, useEffect } from 'react';
import { apiService } from '../services/apiService';

interface Message {
    id: string;
    text: string;
    sender: 'user' | 'bot';
    timestamp: Date;
    isAction?: boolean;
}

interface ChatBotProps {
    view: string;
    currentProject?: any;
    currentSource?: any;
    onRefresh?: () => void;
}

const ChatBot: React.FC<ChatBotProps> = ({ view, currentProject, currentSource, onRefresh }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([
        {
            id: '1',
            text: "Hello! I'm your Data Sync assistant. I can now create projects, modules, and sources for you. Just tell me what you need!",
            sender: 'bot',
            timestamp: new Date()
        }
    ]);
    const [inputValue, setInputValue] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSend = async () => {
        if (!inputValue.trim() || isProcessing) return;

        const userMsg: Message = {
            id: Date.now().toString(),
            text: inputValue,
            sender: 'user',
            timestamp: new Date()
        };

        setMessages(prev => [...prev, userMsg]);
        setInputValue('');
        setIsProcessing(true);

        // Process Action Logic
        const response = await processBotCommand(inputValue);

        setIsProcessing(false);
        setMessages(prev => [...prev, {
            id: Date.now().toString(),
            text: response,
            sender: 'bot',
            timestamp: new Date()
        }]);

        if (onRefresh && (response.includes('successfully') || response.includes('created'))) {
            onRefresh();
        }
    };

    const processBotCommand = async (input: string): Promise<string> => {
        const text = input.toLowerCase();

        // 0. Pre-process catalog
        const allModules = await apiService.fetchDataGroups();

        // Helper: Find a mentioned module name in the text
        const findModuleInText = (str: string) => {
            return allModules.find(m =>
                str.includes(m.name.toLowerCase()) ||
                str.includes(m.id.toLowerCase().replace(/_/g, ' '))
            );
        };

        // --- 1. MODULE MANAGEMENT (ADD/REMOVE) ---
        const isAddAction = text.includes('add') || text.includes('assign') || text.includes('link') || text.includes('include') || text.includes('put');
        const isRemoveAction = text.includes('remove') || text.includes('detach') || text.includes('delete') || text.includes('purge') || text.includes('clear') || text.includes('exclude');

        if ((isAddAction || isRemoveAction) && (text.includes('module') || text.includes('object') || text.includes('table'))) {
            const targetModule = findModuleInText(text);
            if (!targetModule) return "I couldn't identify which module you're talking about. Please specify a name from the catalog (e.g. 'Accounts Payable').";

            // COLLECT ALL IDs for this module group
            const groupModuleIds = targetModule.objects
                .map(o => o.moduleId)
                .filter(id => id !== undefined && id !== null)
                .map(Number);

            if (groupModuleIds.length === 0) return `Module "${targetModule.name}" doesn't have any registered database objects yet.`;

            // Decide scope (Source Mapping vs Project Arch)
            if (view === 'mapping' || view === 'source_dashboard' || text.includes('source')) {
                const targetSource = currentSource;
                if (!targetSource) return "I can manage source modules, but you need to open a source workspace first.";

                const sourceModuleData = await apiService.fetchSourceModules(targetSource.SOURCE_ID);
                const currentModuleIds = new Set<number>(sourceModuleData?.selectedModuleIds || []);

                groupModuleIds.forEach(id => {
                    if (isRemoveAction) currentModuleIds.delete(id);
                    else currentModuleIds.add(id);
                });

                const success = await apiService.updateSourceModules(targetSource.SOURCE_ID, Array.from(currentModuleIds));
                if (success) {
                    return `Synchronized source "${targetSource.SOURCE_NAME}": ${isRemoveAction ? 'Detached' : 'Linked'} all ${targetModule.name} objects.`;
                }
            } else {
                // Project Scope - Try to resolve project from context OR from name in text
                let targetProject = currentProject;

                // If no current project or user mentioned a project name, try to resolve it
                if (!targetProject || text.includes('project')) {
                    const allProjects = await apiService.fetchProjects();
                    const mentionedProject = allProjects.find(p =>
                        text.includes(p.PROJECT_NAME?.toLowerCase()) ||
                        text.includes(p.NAME?.toLowerCase())
                    );
                    if (mentionedProject) targetProject = mentionedProject;
                }

                if (!targetProject) return "Please select a project first (or mention it by name) so I know which workspace to update.";

                const projectId = targetProject.PROJECT_ID || targetProject.id;
                const projectName = targetProject.PROJECT_NAME || targetProject.name;

                const details = await apiService.fetchProjectDetails(projectId);
                if (!details) return `Error fetching details for project "${projectName}".`;

                const currentModuleIds = new Set<number>();
                details.modules.forEach((group: any) => {
                    group.objects.forEach((obj: any) => {
                        if (obj.moduleId) currentModuleIds.add(Number(obj.moduleId));
                    });
                });

                groupModuleIds.forEach(id => {
                    if (isRemoveAction) currentModuleIds.delete(id);
                    else currentModuleIds.add(id);
                });

                const success = await apiService.updateProjectModules(projectId, Array.from(currentModuleIds));
                if (success) {
                    return `Project "${projectName}" architecture ${isRemoveAction ? 'updated: removed' : 'refined: added'} all objects for ${targetModule.name}.`;
                }
            }
            return "Transaction failed during database update.";
        }

        // --- 2. PROJECT CREATION ---
        if (text.includes('create') && text.includes('project')) {
            const nameMatch = text.match(/(?:named|called|project)\s+['"]?([^'"]+?)['"]?(?:\s|$|with|desc)/i);
            const name = nameMatch ? nameMatch[1].trim() : null;

            if (!name || name === 'a' || name === 'new') return "I'm ready to create a project! What name should I use? (e.g. 'Create project Global Sync')";

            const descMatch = text.match(/(?:desc|description|with)\s+['"]?([^'"]+?)['"]?(?:\s|$)/i);
            const desc = descMatch ? descMatch[1].trim() : "Created via Sync Assistant";

            const result = await apiService.createProject(name, desc);
            if (result.success) {
                return `Successfully initialized project "${name}". Redirecting your workspace catalog...`;
            }
            return `Project creation failed: ${result.error || 'System error'}`;
        }

        // --- 3. SOURCE CREATION ---
        if ((text.includes('create') || text.includes('add')) && text.includes('source')) {
            if (!currentProject) return "To deploy a source, please select a project first.";

            const nameMatch = text.match(/(?:named|called|source)\s+['"]?([^'"]+?)['"]?(?:\s|$|with)/i);
            const name = nameMatch ? nameMatch[1].trim() : "New Data Stream";

            const result = await apiService.createProjectSource(currentProject.PROJECT_ID, name, "Automated deployment");
            if (result.success) {
                return `Deployed new source "${name}" into ${currentProject.PROJECT_NAME}. Refreshing project gallery...`;
            }
            return "Failed to deploy project source.";
        }

        // --- 4. MODULE FRAMEWORK (ARCHITECT) ---
        if (text.includes('create') && (text.includes('module') || text.includes('architect'))) {
            const nameMatch = text.match(/(?:named|called|module)\s+['"]?([^'"]+?)['"]?(?:\s|$|with)/i);
            const name = nameMatch ? nameMatch[1].trim() : null;
            if (!name) return "To synthesize a new module, I need a name. Try: 'Create module HR Management'";

            const tableName = name.toUpperCase().replace(/\s/g, '_').replace(/[^A-Z0-9_]/g, '');
            const objects = [{
                type: 'draft',
                id: `MSAI_${tableName}`,
                name: `${name} Records`,
                table: `MSAI_${tableName}`,
                isGlobal: true
            }];

            const tableResult = await apiService.createDynamicTable(tableName, [
                { name: 'ID', type: 'NUMERIC', required: true, isPk: true },
                { name: 'LABEL', type: 'VARCHAR', required: false, isPk: false }
            ]);

            if (tableResult.success) {
                const regSuccess = await apiService.saveModuleDefinitions(name, '📦', objects);
                if (regSuccess) return `Architecture synthesized: Module "${name}" created with core relational tables.`;
            }
            return "Framework synthesis failed. Database rejected the dynamic schema.";
        }

        // 5. STATUS/HELP
        if (text.includes('help') || text.includes('what') || text.includes('how')) {
            return "I can help you build your workspace! Try:\n• 'Create project SAP Migration'\n• 'Add module Invoice Header to this project'\n• 'Link Payroll module to this source'\n• 'Create source Logistics CSV'";
        }

        return "I'm listening, but I didn't catch an actionable command. I can manage projects, sources, and module assignments. How can I assist with your architecture today?";
    };

    return (
        <div className="fixed bottom-8 right-8 z-[9999] flex flex-col items-end">
            {/* Chat Window */}
            {isOpen && (
                <div className="mb-4 w-80 md:w-96 bg-white rounded-[2rem] shadow-[0_20px_50px_rgba(0,0,0,0.15)] border border-slate-100 flex flex-col overflow-hidden animate-in slide-in-from-bottom-5 duration-300">
                    {/* Header */}
                    <div className="bg-slate-900 p-5 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center shadow-lg shadow-blue-500/20">
                                <span className="text-white text-xs">🤖</span>
                            </div>
                            <div>
                                <h3 className="text-white font-black text-[10px] uppercase tracking-widest leading-none">Sync Assistant</h3>
                                <div className="flex items-center gap-1 mt-1">
                                    <div className="w-1 h-1 rounded-full bg-emerald-400"></div>
                                    <span className="text-[8px] text-slate-400 font-bold uppercase tracking-widest">Active</span>
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={() => setIsOpen(false)}
                            className="p-1 hover:bg-white/10 rounded-lg text-slate-400 transition-colors"
                        >
                            <span className="text-sm">✕</span>
                        </button>
                    </div>

                    {/* Messages Area */}
                    <div className="flex-1 p-5 space-y-4 max-h-[400px] overflow-y-auto scrollbar-hide bg-slate-50/50">
                        {messages.map(msg => (
                            <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[85%] p-4 rounded-2xl text-xs font-medium leading-relaxed shadow-sm ${msg.sender === 'user'
                                    ? 'bg-blue-600 text-white rounded-tr-none'
                                    : 'bg-white text-slate-700 rounded-tl-none border border-slate-100'
                                    }`}>
                                    {msg.text}
                                </div>
                            </div>
                        ))}
                        {isProcessing && (
                            <div className="flex justify-start">
                                <div className="bg-white p-4 rounded-2xl rounded-tl-none border border-slate-100 shadow-sm flex items-center gap-1">
                                    <div className="w-1 h-1 bg-slate-400 rounded-full animate-bounce"></div>
                                    <div className="w-1 h-1 bg-slate-400 rounded-full animate-bounce [animation-delay:-.15s]"></div>
                                    <div className="w-1 h-1 bg-slate-400 rounded-full animate-bounce [animation-delay:-.3s]"></div>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input Area */}
                    <div className="p-4 bg-white border-t border-slate-100 flex gap-2">
                        <input
                            type="text"
                            value={inputValue}
                            onChange={e => setInputValue(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSend()}
                            placeholder="Type a command (e.g. 'Create project X')..."
                            className="flex-1 bg-slate-50 border border-slate-100 rounded-xl px-4 py-2 text-[10px] font-bold outline-none focus:ring-1 focus:ring-blue-500 transition-all disabled:opacity-50"
                            disabled={isProcessing}
                        />
                        <button
                            onClick={handleSend}
                            disabled={isProcessing}
                            className="bg-blue-600 text-white w-10 h-10 rounded-xl flex items-center justify-center hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200 disabled:opacity-50"
                        >
                            <span className="text-sm">→</span>
                        </button>
                    </div>
                </div>
            )}

            {/* FAB */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-all hover:scale-110 active:scale-95 ${isOpen ? 'bg-slate-900' : 'bg-blue-600'
                    }`}
            >
                {isOpen ? (
                    <span className="text-white text-xl">✕</span>
                ) : (
                    <div className="relative">
                        <span className="text-white text-2xl">💬</span>
                        {!isOpen && (
                            <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-blue-600"></div>
                        )}
                    </div>
                )}
            </button>
        </div>
    );
};

export default ChatBot;

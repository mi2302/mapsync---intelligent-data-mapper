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
    const [messages, setMessages] = useState<Message[]>(() => {
        const saved = localStorage.getItem('mapsync_chat_history');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                return parsed.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) }));
            } catch (e) {
                console.error('Failed to load chat history:', e);
            }
        }
        return [
            {
                id: '1',
                text: "Hello! I'm your Data Sync assistant. I can now create projects, modules, and sources for you. Just tell me what you need!",
                sender: 'bot',
                timestamp: new Date()
            }
        ];
    });
    const [inputValue, setInputValue] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
        localStorage.setItem('mapsync_chat_history', JSON.stringify(messages));
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

        if (onRefresh && (response.includes('successfully') || response.includes('created') || response.includes('Done!'))) {
            onRefresh();
        }
    };

    const processBotCommand = async (input: string): Promise<string> => {
        setIsProcessing(true);
        const allModules = await apiService.fetchDataGroups();
        const availableModuleNames = allModules.map(m => m.name);

        try {
            const { parseChatIntent } = await import('../services/geminiService');
            const response = await parseChatIntent(input, {
                view,
                currentProjectName: currentProject?.PROJECT_NAME,
                currentSourceName: currentSource?.SOURCE_NAME,
                availableModules: availableModuleNames
            });

            console.log('[ChatBot] Parsed Intent Result:', response);

            const actions = Array.isArray(response) ? response : [response];
            const results: string[] = [];

            for (const action of actions) {
                const result = await executeAction(action, allModules, input);
                results.push(result);
            }

            return results.join('\n\n');

        } catch (error) {
            console.error('[ChatBot] NLP Failed, falling back:', error);
            const text = input.toLowerCase();
            if (text.includes('create project')) return "My AI brain is a bit slow right now, but I can still try to create a project if you use: 'Create project [Name]'";
            return "I'm having some trouble understanding right now. Please try a simpler command or refresh the page.";
        } finally {
            setIsProcessing(false);
        }
    };

    const executeAction = async (action: any, allModules: any[], rawInput: string): Promise<string> => {
        // 1. PROJECT CREATION
        if (action.intent === 'create_project') {
            const name = action.entities.name;
            if (!name) return "I'd love to start a new project for you! What should we call it?";

            const result = await apiService.createProject(name, action.entities.description || "Created via AI Chat");
            if (result.success) return `Done! Project "${name}" has been initialized. You can see it in your dashboard now.`;
            return `Sorry, I couldn't create that project: ${result.error}`;
        }

        // 2. SOURCE CREATION
        if (action.intent === 'create_source') {
            let targetProject = currentProject;

            // If we have a specific context in the entity, try to find that project
            if (action.entities.context && action.entities.context !== 'project' && action.entities.context !== 'source') {
                const allProjects = await apiService.fetchProjects();
                const contextName = action.entities.context.toLowerCase().trim();
                const found = allProjects.find(p => p.PROJECT_NAME.toLowerCase().trim() === contextName);
                if (found) {
                    targetProject = found;
                } else {
                    const candidates = allProjects.filter(p => p.PROJECT_NAME.toLowerCase().includes(contextName));
                    if (candidates.length > 0) {
                        targetProject = candidates.sort((a, b) => a.PROJECT_NAME.length - b.PROJECT_NAME.length)[0];
                    }
                }
            }

            if (!targetProject) return "I can definitely add a source, but we need to have a project open first. Which project are we working on?";
            const name = action.entities.name || "New Data Stream";

            const result = await apiService.createProjectSource(targetProject.PROJECT_ID, name, "Uploaded via Assistant");
            if (result.success) return `Successfully deployed "${name}" into the ${targetProject.PROJECT_NAME} workspace.`;
            return "Deployment failed. Our servers might be a bit busy.";
        }

        // 3. MANAGE MODULES (ADD/REMOVE)
        if (action.intent === 'manage_module') {
            const rawModNames = action.entities.moduleName?.split(',') || [];
            const isRemoval = action.entities.action === 'remove';
            const foundModules: string[] = [];
            const groupModuleIds: number[] = [];

            rawModNames.forEach(rawName => {
                const searchStr = rawName.trim().toLowerCase();

                // 1. Try to find match by Module Header (Group Level)
                const moduleMatch = allModules.find(m => m.name.toLowerCase() === searchStr);
                if (moduleMatch) {
                    foundModules.push(`${moduleMatch.name} (Full Module)`);
                    moduleMatch.objects.forEach((o: any) => { if (o.moduleId) groupModuleIds.push(Number(o.moduleId)) });
                    return;
                }

                // 2. Try to find match by Specific Object Name (Granular Level)
                allModules.forEach(m => {
                    const objMatch = m.objects.find((obj: any) =>
                        obj.name.toLowerCase() === searchStr ||
                        searchStr === obj.name.toLowerCase()
                    );
                    if (objMatch && objMatch.moduleId) {
                        foundModules.push(objMatch.name);
                        groupModuleIds.push(Number(objMatch.moduleId));
                    }
                });
            });

            if (foundModules.length === 0) return `I couldn't identify "${action.entities.moduleName}" in our catalog.`;

            // CONTEXT RESOLUTION
            const contextName = action.entities.context?.toLowerCase().trim();
            const sourceName = action.entities.sourceName?.toLowerCase().trim();
            const isSourceAction = action.entities.context === 'source' || !!sourceName || (!!currentSource && !contextName?.includes('project') && contextName !== 'test project');

            if (isSourceAction) {
                let targetSource = currentSource;

                // Resolve target source if name provided
                if (sourceName || (contextName && contextName !== 'source' && contextName !== 'project' && contextName !== currentProject?.PROJECT_NAME?.toLowerCase())) {
                    const searchSource = sourceName || contextName;
                    let targetProj = currentProject;

                    if (contextName && contextName !== 'source' && contextName !== 'project' && contextName !== currentProject?.PROJECT_NAME?.toLowerCase()) {
                        const allProjects = await apiService.fetchProjects();
                        targetProj = allProjects.find(p => p.PROJECT_NAME.toLowerCase().trim() === contextName) ||
                            allProjects.find(p => p.PROJECT_NAME.toLowerCase().includes(contextName));
                    }

                    if (targetProj) {
                        const sources = await apiService.fetchProjectSources(targetProj.PROJECT_ID);
                        const found = sources.find(s => s.SOURCE_NAME.toLowerCase().trim() === searchSource || s.SOURCE_NAME.toLowerCase().includes(searchSource));
                        if (found) targetSource = found;
                    }
                }

                if (!targetSource) return "I identified the module, but couldn't find the target source. Please open the source workspace or specify its name clearly.";

                const sourceModuleData = await apiService.fetchSourceModules(targetSource.SOURCE_ID);
                const sModIds = new Set<number>(sourceModuleData?.selectedModuleIds || []);

                groupModuleIds.forEach(id => isRemoval ? sModIds.delete(id) : sModIds.add(id));
                const sOk = await apiService.updateSourceModules(targetSource.SOURCE_ID, Array.from(sModIds));
                if (sOk) return `Scope updated! ${isRemoval ? 'Detached' : 'Linked'} ${foundModules.join(', ')} for source "${targetSource.SOURCE_NAME}".`;
            } else {
                let targetProject = currentProject;
                if (!targetProject || (contextName && contextName !== 'project' && contextName !== currentProject?.PROJECT_NAME?.toLowerCase())) {
                    const allProjects = await apiService.fetchProjects();

                    if (!contextName || contextName === 'project') {
                        if (!currentProject) return "I need a specific project name to perform this action. For example: '... in New Test Project'";
                        targetProject = currentProject;
                    } else {
                        targetProject = allProjects.find(p => p.PROJECT_NAME.toLowerCase().trim() === contextName);
                        if (!targetProject) {
                            const candidates = allProjects.filter(p => p.PROJECT_NAME.toLowerCase().includes(contextName));
                            targetProject = candidates.sort((a, b) => a.PROJECT_NAME.length - b.PROJECT_NAME.length)[0];
                        }
                    }
                    if (!targetProject) return `I couldn't find a project named "${action.entities.context}".`;
                }

                const details = await apiService.fetchProjectDetails(targetProject.PROJECT_ID);
                const pModIds = new Set<number>();
                details.modules.forEach((group: any) => group.objects.forEach((obj: any) => obj.moduleId && pModIds.add(Number(obj.moduleId))));

                groupModuleIds.forEach(id => isRemoval ? pModIds.delete(id) : pModIds.add(id));
                const pOk = await apiService.updateProjectModules(targetProject.PROJECT_ID, Array.from(pModIds));
                if (pOk) return `Successfully ${isRemoval ? 'removed' : 'integrated'} ${foundModules.join(', ')} in project "${targetProject.PROJECT_NAME}".`;
            }
        }

        // 5. GENERAL QUERY / HELP
        if (action.intent === 'general_query') {
            const inputLower = rawInput.toLowerCase();
            if (inputLower.includes('project') && (inputLower.includes('list') || inputLower.includes('detail') || inputLower.includes('all'))) {
                const allProjects = await apiService.fetchProjects();
                if (allProjects.length === 0) return "You don't have any projects yet. Try saying 'Create project MyNewProject'!";
                return `Here are your current projects:\n${allProjects.map(p => `• **${p.PROJECT_NAME}**: ${p.DESCRIPTION || 'No description'}`).join('\n')}`;
            }
            // Check if user is providing a follow-up name
            if (action.entities.name) {
                const allProjects = await apiService.fetchProjects();
                const textLower = action.entities.name.toLowerCase();
                const match = allProjects.find(p => p.PROJECT_NAME.toLowerCase() === textLower || p.PROJECT_NAME.toLowerCase().includes(textLower));

                if (match) {
                    return `I see you mean project "${match.PROJECT_NAME}". You can now try your command again specifying this project, or I can help you with tasks inside it.`;
                }
            }
            return action.responseHint;
        }

        return action.responseHint || "Command processed.";
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
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => {
                                    if (window.confirm('Clear conversation history?')) {
                                        setMessages([{
                                            id: '1',
                                            text: "Hello! I'm your Data Sync assistant. I can now create projects, modules, and sources for you. Just tell me what you need!",
                                            sender: 'bot',
                                            timestamp: new Date()
                                        }]);
                                        localStorage.removeItem('mapsync_chat_history');
                                    }
                                }}
                                title="Clear Chat"
                                className="p-1 hover:bg-white/10 rounded-lg text-slate-400 transition-colors"
                            >
                                <span className="text-xs">🗑️</span>
                            </button>
                            <button
                                onClick={() => setIsOpen(false)}
                                className="p-1 hover:bg-white/10 rounded-lg text-slate-400 transition-colors"
                            >
                                <span className="text-sm">✕</span>
                            </button>
                        </div>
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

/// <reference types="vite/client" />
import { GoogleGenAI, Type } from "@google/genai";
import { SchemaDefinition, FieldMapping, DataType } from "../types";

const api_key = import.meta.env.VITE_GEMINI_API_KEY || "";
const isDemoMode = !api_key || api_key === 'PLACEHOLDER_API_KEY';
const ai = new GoogleGenAI({ apiKey: api_key });

export async function suggestMappings(
  sourceHeaders: string[],
  targetSchema: SchemaDefinition
): Promise<Partial<FieldMapping>[]> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: `Source Headers: ${sourceHeaders.join(", ")}
      Target Fields: ${targetSchema.fields.map(f => `${f.id} (${f.label}: ${f.description})`).join(", ")}`,
      config: {
        systemInstruction: `Perform an intelligent semantic mapping between source spreadsheet headers and target data fields for a ${targetSchema.name} data store.
        
        CRITICAL RULES:
        1. DO NOT map fields just because types match (e.g., 'LastName' is NOT 'Phone').
        2. Analyze context of ${targetSchema.name}.
        3. Identify synonyms (e.g., 'FName' -> 'First Name').`,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              targetFieldId: { type: Type.STRING },
              sourceHeader: { type: Type.STRING },
              confidence: { type: Type.NUMBER },
              semanticReasoning: { type: Type.STRING }
            },
            required: ["targetFieldId", "semanticReasoning"]
          }
        }
      }
    });

    const text = response.text || "[]";
    return JSON.parse(text);
  } catch (error) {
    console.error("Gemini Suggestion Error:", error);
    return [];
  }
}

export type ChatIntentType = 'create_project' | 'create_source' | 'create_module' | 'manage_module' | 'general_query' | 'unknown';

export interface ChatAction {
  intent: ChatIntentType;
  entities: {
    name?: string;
    description?: string;
    moduleName?: string;
    action?: 'add' | 'remove';
    context?: string;
  };
  responseHint: string;
}

export type ChatResponse = ChatAction | ChatAction[];

export async function parseChatIntent(
  userInput: string,
  context: { view: string, currentProjectName?: string, currentSourceName?: string, availableModules: string[] }
): Promise<ChatResponse> {
  if (isDemoMode) {
    const localResult = parseChatIntentLocal(userInput, context);
    if (Array.isArray(localResult)) {
      return localResult.map(a => ({
        ...a,
        responseHint: `[DEMO MODE] ${a.responseHint}\n\n*Tip: Add a VITE_GEMINI_API_KEY to .env for full AI.*`
      }));
    }
    return {
      ...localResult,
      responseHint: `[DEMO MODE] ${localResult.responseHint}\n\n*Tip: Add a VITE_GEMINI_API_KEY to .env to enable full AI understanding.*`
    };
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: userInput,
      config: {
        systemInstruction: `You are an AI NLU engine for MapSync AI. 
        Current View: ${context.view}
        Current Project: ${context.currentProjectName || 'None'}
        Current Source: ${context.currentSourceName || 'None'}
        Available Modules: ${context.availableModules.join(", ")}

        Translate user input into a structured action.
        - 'manage_module': Use for linking/unlinking existing modules. Set 'entities.action' to 'add' or 'remove'. Set 'entities.context' to the destination project or source.
        - 'create_project': For new projects.
        - 'create_source': For new data streams within a project.
        - 'general_query': For everything else.`,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            intent: {
              type: Type.STRING,
              enum: ['create_project', 'create_source', 'manage_module', 'general_query', 'unknown']
            },
            entities: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                description: { type: Type.STRING },
                moduleName: { type: Type.STRING },
                sourceName: { type: Type.STRING },
                action: { type: Type.STRING, enum: ['add', 'remove'] },
                context: { type: Type.STRING }
              }
            },
            responseHint: { type: Type.STRING }
          },
          required: ["intent", "responseHint"]
        }
      }
    });

    const result = JSON.parse(response.text || "{}");
    if (!result.intent || result.intent === 'unknown') {
      throw new Error("Invalid AI response");
    }
    return result;
  } catch (error) {
    console.error("Gemini NLU Error, falling back to local:", error);
    // Silent fallback to local parser for continuous UX
    return parseChatIntentLocal(userInput, context);
  }
}

function parseChatIntentLocal(userInput: string, context: { view?: string, currentProjectName?: string, currentSourceName?: string, availableModules: string[] }): ChatResponse {
  const text = userInput.toLowerCase();

  // SUPPORT FOR COMPOUND COMMANDS (then / and)
  if (text.includes(' and ') || text.includes(' then ') || text.includes(', then ')) {
    const parts = userInput.split(/\s+then\s+|\s+and\s+|,\s+then\s+/i);
    const results = parts.map(p => parseChatIntentLocal(p.trim(), context));
    const actions = results.flat() as ChatAction[];

    const lastContext = actions[actions.length - 1].entities.context;
    if (lastContext && lastContext !== 'project' && lastContext !== 'source') {
      actions.forEach(a => {
        if (a.entities.context === 'project' || a.entities.context === 'source') {
          a.entities.context = lastContext;
        }
      });
    }
    return actions;
  }

  // 1. Create Source
  const isSourceKeyword = text.includes('source') || text.includes('data stream') || text.includes('deployment') || text.includes('scope');
  const isAddVerb = /\b(add|create|new|setup|deploy|put|dd|link)\b/i.test(text);

  if (isSourceKeyword && isAddVerb && !text.includes('module') && !text.includes('object') && !text.includes('entity')) {
    let nameMatch = userInput.match(/(?:source|named|called)\s+['"]([^'"]+)['"]/i) || userInput.match(/(?:source|named|called)\s+([^'"]+?)(?:\s+to\s+project|\s+in\s+project|\s+with|\s+desc|\s*$)/i);
    const projectMatch = userInput.match(/(?:to|in|for)\s+(?:project\s+)?['"]?([^'"]+?)['"]?(?:\s+project)?$/i);

    let targetContext = projectMatch ? projectMatch[1].trim() : 'project';
    if (text.includes('this project') || text.includes('current project') || (text.includes('here') && context.view === 'dashboard')) {
      targetContext = context.currentProjectName || 'project';
    }

    return {
      intent: 'create_source',
      entities: {
        name: nameMatch ? nameMatch[1].trim() : 'New Source',
        context: targetContext
      },
      responseHint: `Initializing new data source deployment in ${targetContext === 'project' ? 'the current project' : `"${targetContext}"`}.`
    };
  }

  // 2. Create Project
  const isCreateProject = /\b(create|start|new|setup|initialize|make)\s+project\b/i.test(text);
  if (isCreateProject && !text.includes('source')) {
    const nameMatch = userInput.match(/(?:named|called|project)\s+['"]([^'"]+)['"]/i) || userInput.match(/(?:named|called|project)\s+([^'"]+?)(?:\s+with|\s+desc|\s*$)/i);
    return {
      intent: 'create_project',
      entities: {
        name: nameMatch ? nameMatch[1].trim() : 'New Project',
        context: 'dashboard'
      },
      responseHint: "I'll get that project started right away."
    };
  }

  // 3. Manage Module/Object (Add/Remove)
  const isAdd = /\b(add|link|assign|include|put|incorporate|integrate|attach|scope)\b/i.test(text);
  const isRemove = /\b(remove|detach|delete|exclude|emove|move|discard|unassign)\b/i.test(text);
  const mentionsObject = text.includes('module') || text.includes('object') || text.includes('entity') || text.includes('table') || text.includes('scope');

  if (isAdd || isRemove || mentionsObject) {
    // Robust split: Match preposition + optional label (project/source) + name (quoted or unquoted) + optional trailing label
    const splitRegex = /\s+(?:to|in|for|within|on)\s+(?:project\s+|source\s+)?['"]?([^'"]+?)['"]?(?:\s+project|\s+source)?$/i;
    const match = userInput.match(splitRegex);

    let modulePart = userInput;
    let projectPart = null;

    if (match) {
      projectPart = match[1].trim();
      modulePart = userInput.substring(0, userInput.lastIndexOf(match[0])).trim();

      // Secondary check: if projectPart is empty or just 'project', and there were quotes in the match, try to re-extract
      if ((!projectPart || projectPart === 'project' || projectPart === 'source') && match[0].includes("'")) {
        const quoted = match[0].match(/['"]([^'"]+)['"]/);
        if (quoted) projectPart = quoted[1].trim();
      }
    }

    // Context Overrides for "this", "current", "here"
    if (text.includes('this source') || text.includes('current source') || (text.includes('here') && context.view === 'mapping')) {
      projectPart = context.currentSourceName || 'source';
    } else if (text.includes('this project') || text.includes('current project') || (text.includes('here') && context.view === 'dashboard')) {
      projectPart = context.currentProjectName || 'project';
    }

    // Try to find existing modules
    const foundModules = context.availableModules.filter(m => {
      const mLower = m.toLowerCase();
      const escapedM = mLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escapedM}\\b`, 'i');
      return regex.test(modulePart.toLowerCase());
    });

    const isSourceContext = text.includes('source') || (context.view === 'mapping' && !text.includes('project'));

    if (foundModules.length > 0) {
      return {
        intent: 'manage_module',
        entities: {
          moduleName: foundModules.join(','),
          action: isRemove && !isAdd ? 'remove' : 'add',
          context: projectPart || (isSourceContext ? 'source' : 'project')
        },
        responseHint: `Ensuring ${foundModules.join(', ')} is ${isRemove && !isAdd ? 'removed from' : 'included in'} the current ${isSourceContext ? 'source scope' : 'project'}.`
      };
    }

    const quotedMatch = modulePart.match(/['"]([^'"]+)['"]/);
    let actionName = quotedMatch ? quotedMatch[1] : modulePart.replace(/(?:add|remove|module|object|link|put|the|emove|move|scope|integrate|include|attach)\s+/gi, '').trim();

    if (actionName.toLowerCase().startsWith('source ')) actionName = actionName.substring(7).trim();

    if (actionName && (isAdd || isRemove) && actionName.toLowerCase() !== 'source' && actionName.toLowerCase() !== 'project') {
      return {
        intent: 'manage_module',
        entities: {
          moduleName: actionName,
          action: isRemove && !isAdd ? 'remove' : 'add',
          context: projectPart || (isSourceContext ? 'source' : 'project')
        },
        responseHint: `Syncing "${actionName}" within the active ${isSourceContext ? 'source data-stream' : 'project architecture'}.`
      };
    }
  }

  // 5. General Query / Catch-all
  if (text.length < 30 && !isAdd && !isRemove) {
    return {
      intent: 'general_query',
      entities: { name: userInput },
      responseHint: `I'm listening! You mentioned "${userInput}". Are you trying to specify a project or module for a previous command?`
    };
  }

  return {
    intent: 'general_query',
    entities: {},
    responseHint: "I can help with projects, sources, and module assignments. Try 'Add module X to this project' or 'Remove object Y from current source'."
  };
}

export async function suggestColumns(
  objectName: string
): Promise<{ name: string, type: DataType, reason: string }[]> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: `Provide a comprehensive, production-ready database schema for a "${objectName}" entity. Include standard administrative fields and specific domain attributes.`,
      config: {
        systemInstruction: `You are an expert Data Architect. Generate 8-12 logically sound database columns for the requested entity.
        - Types: MUST be 'VARCHAR', 'NUMERIC', 'TIMESTAMP', or 'BOOLEAN'.
        - Names: UPPERCASE, underscores, max 26 chars.
        - Context: Focus on industry-standard attributes for "${objectName}".
        - Structure: Return a clean JSON array of objects.`,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              type: { type: Type.STRING, enum: ['VARCHAR', 'NUMERIC', 'TIMESTAMP', 'BOOLEAN'] },
              reason: { type: Type.STRING }
            },
            required: ["name", "type", "reason"]
          }
        }
      }
    });

    const text = response.text || "[]";
    return JSON.parse(text);
  } catch (error) {
    console.error("Gemini Column Suggestion Error:", error);
    return [];
  }
}


import { GoogleGenAI, Type } from "@google/genai";
import { SchemaDefinition, FieldMapping } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export async function suggestMappings(
  sourceHeaders: string[],
  targetSchema: SchemaDefinition
): Promise<Partial<FieldMapping>[]> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Perform an intelligent semantic mapping between source spreadsheet headers and target data fields for a ${targetSchema.name} data store.
      
      CRITICAL RULES:
      1. DO NOT map fields just because types match. (e.g., 'LastName' is a string, but it is NOT a 'Contact/Phone' field).
      2. Analyze the context of the entity (${targetSchema.name}).
      3. Identify synonyms (e.g., 'Dept' matches 'Department', 'FName' matches 'First Name').
      
      Source Headers: ${sourceHeaders.join(", ")}
      Target Fields: ${targetSchema.fields.map(f => `${f.id} (${f.label}: ${f.description})`).join(", ")}
      
      Return a JSON array. For each target field, identify the best semantic match.
      Provide a 'semanticReasoning' field explaining why it fits or if it is a risky match.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              targetFieldId: { type: Type.STRING },
              sourceHeader: { type: Type.STRING },
              confidence: { type: Type.NUMBER, description: "0 to 1 score of semantic fit" },
              semanticReasoning: { type: Type.STRING, description: "Detailed contextual explanation" }
            },
            required: ["targetFieldId", "semanticReasoning"]
          }
        }
      }
    });

    return JSON.parse(response.text);
  } catch (error) {
    console.error("Gemini Suggestion Error:", error);
    return [];
  }
}

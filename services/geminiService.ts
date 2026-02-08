
import { GoogleGenAI } from "@google/genai";

// FIX: Per @google/genai guidelines, the apiKey parameter is removed.
// The API key MUST be obtained exclusively from the environment variable `process.env.API_KEY`.
export async function getAIResponse(prompt: string, model: string): Promise<string> {
    
    try {
        // FIX: Initialize with apiKey from environment variables as required.
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const response = await ai.models.generateContent({
            model: model,
            contents: prompt,
            config: {
                systemInstruction: "You are a friendly and helpful 3D assistant. Keep your answers concise and conversational.",
            }
        });

        const text = response.text;
        if (!text) {
            throw new Error("Received an empty response from the API.");
        }
        return text;
    } catch (error) {
        console.error("Error calling Gemini API:", error);
        if (error instanceof Error && error.message.includes('API key not valid')) {
             // FIX: Updated error message as the key is no longer user-provided.
             throw new Error("The Google Gemini API key is invalid. Please check the server configuration.");
        }
        throw new Error("Failed to fetch response from AI service.");
    }
}

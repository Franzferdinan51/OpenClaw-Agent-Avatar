
import { GoogleGenAI } from "@google/genai";
import { Settings, Message } from "../types";

// --- Google Gemini Implementation ---
async function getGeminiResponse(history: Message[], model: string): Promise<string> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    // Convert history to Gemini format (excluding system messages for simplicity or handling them as instructions)
    // We'll use the last user message as the prompt and system instruction for context
    const lastMessage = history[history.length - 1];
    if (!lastMessage || lastMessage.role !== 'user') {
        throw new Error("Invalid conversation state.");
    }

    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: lastMessage.content,
            config: {
                systemInstruction: "You are an intelligent 3D avatar interface. You are concise, helpful, and personable. Keep responses under 3 sentences when possible to ensure natural lip-sync timing.",
            }
        });

        return response.text || "I didn't catch that.";
    } catch (error) {
        console.error("Gemini API Error:", error);
        throw new Error("Failed to communicate with Gemini.");
    }
}

// --- OpenRouter Implementation ---
async function getOpenRouterResponse(history: Message[], settings: Settings): Promise<string> {
    if (!settings.openRouterApiKey) {
        throw new Error("OpenRouter API key is missing.");
    }

    const messages = history.map(msg => ({
        role: msg.role,
        content: msg.content
    }));

    // Add a system prompt if not present
    messages.unshift({
        role: "system",
        content: "You are an intelligent 3D avatar interface. Keep responses under 3 sentences for better animation timing."
    });

    try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${settings.openRouterApiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': window.location.origin,
            },
            body: JSON.stringify({
                model: settings.openRouterModel || "google/gemini-flash-1.5",
                messages: messages,
            })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error?.message || "OpenRouter Error");
        }

        const data = await response.json();
        return data.choices[0]?.message?.content || "";
    } catch (error) {
        console.error("OpenRouter Error:", error);
        throw error;
    }
}

// --- OpenClaw / Custom Agent Implementation ---
async function getOpenClawResponse(history: Message[], settings: Settings): Promise<string> {
    if (!settings.openClawBaseUrl) {
        throw new Error("OpenClaw/Agent Base URL is required.");
    }

    const lastMessage = history[history.length - 1];

    // Default structure for a generic agent interacting via HTTP
    // This assumes a standard schema often used in agent swarms:
    // POST /chat { message: string, agentId?: string, history?: [] }
    const payload = {
        message: lastMessage.content,
        agentId: settings.openClawAgentId,
        sessionId: "session-" + Math.floor(Math.random() * 100000), // Simple session tracking
        history: history.slice(0, -1).map(h => ({ role: h.role, content: h.content }))
    };

    const headers: Record<string, string> = {
        'Content-Type': 'application/json'
    };

    if (settings.openClawAuthToken) {
        headers['Authorization'] = `Bearer ${settings.openClawAuthToken}`;
        headers['X-Api-Key'] = settings.openClawAuthToken; // Try both common standards
    }

    try {
        const response = await fetch(settings.openClawBaseUrl, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`Agent Endpoint Error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        
        // Flexible response parsing to handle different agent schemas
        // 1. { response: "..." }
        // 2. { message: "..." }
        // 3. { text: "..." }
        // 4. { output: "..." }
        return data.response || data.message || data.text || data.output || JSON.stringify(data);

    } catch (error) {
        console.error("OpenClaw Connection Error:", error);
        throw new Error("Failed to connect to OpenClaw Agent. Check URL and Network tab.");
    }
}

// --- Main Facade ---
export async function getAIResponse(history: Message[], settings: Settings): Promise<string> {
    switch (settings.apiProvider) {
        case 'gemini':
            return getGeminiResponse(history, settings.geminiModel);
        case 'openrouter':
            return getOpenRouterResponse(history, settings);
        case 'openclaw':
            return getOpenClawResponse(history, settings);
        default:
            throw new Error("Unknown API Provider");
    }
}

export async function fetchOpenRouterModels(): Promise<{id: string, name: string}[]> {
    try {
        const response = await fetch('https://openrouter.ai/api/v1/models');
        if (!response.ok) throw new Error("Failed to fetch models");
        const data = await response.json();
        // Return mostly free or low cost models, formatted
        return data.data
            .sort((a: any, b: any) => a.name.localeCompare(b.name))
            .map((m: any) => ({ id: m.id, name: m.name }));
    } catch (e) {
        console.error(e);
        return [];
    }
}

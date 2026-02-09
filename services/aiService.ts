
import { GoogleGenAI } from "@google/genai";
import { Settings, Message, Attachment, AIResponse, OpenClawAgent } from "../types";

// --- Audio Transcription ---
export async function transcribeAudio(audioBlob: Blob, apiUrl: string, token?: string): Promise<string> {
    const formData = new FormData();
    // Using .webm as it is the typical browser recording format
    formData.append("file", audioBlob, "recording.webm");
    formData.append("model", "whisper-1"); 

    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
        const response = await fetch(apiUrl, {
            method: "POST",
            headers: headers, 
            body: formData,
        });
        
        if (!response.ok) {
            throw new Error(`Transcription failed: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        return data.text || "";
    } catch (e) {
        console.error("Transcription error", e);
        throw e;
    }
}

// --- Google Gemini Implementation ---
async function getGeminiResponse(history: Message[], model: string, currentAttachments: Attachment[] = []): Promise<AIResponse> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    // Map history to Gemini 'Content' format to preserve context
    // Filter out system messages as they go to config.systemInstruction
    const contents = history.filter(msg => msg.role !== 'system').map(msg => {
        const parts: any[] = [{ text: msg.content }];
        
        // Include historical attachments if any
        if (msg.attachments && msg.attachments.length > 0) {
            msg.attachments.forEach(att => {
                if (att.type.startsWith('image/')) {
                    parts.push({
                        inlineData: {
                            mimeType: att.type,
                            data: att.data.split(',')[1] // Remove 'data:image/png;base64,' prefix
                        }
                    });
                }
            });
        }

        return {
            role: msg.role === 'user' ? 'user' : 'model',
            parts: parts
        };
    });

    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: contents, // Pass full history
            config: {
                systemInstruction: "You are an intelligent 3D avatar interface connected to the OpenClaw network. You are concise, helpful, and personable. Keep responses under 3 sentences when possible.",
                // Add thinking config support if using a thinking model
                ...(model.includes('thinking') ? { thinkingConfig: { thinkingBudget: 1024 } } : {})
            }
        });

        return { content: response.text || "I didn't catch that." };
    } catch (error) {
        console.error("Gemini API Error:", error);
        throw new Error("Failed to communicate with Gemini.");
    }
}

// --- OpenRouter Implementation ---
async function getOpenRouterResponse(history: Message[], settings: Settings, currentAttachments: Attachment[] = []): Promise<AIResponse> {
    if (!settings.openRouterApiKey) {
        throw new Error("OpenRouter API key is missing.");
    }

    const messages = history.map(msg => {
        // Handle images in history for OpenRouter (if supported by model, assuming simplified structure for now)
        const content: any[] = [{ type: 'text', text: msg.content }];
        
        if (msg.attachments) {
            msg.attachments.forEach(att => {
                if (att.type.startsWith('image/')) {
                    content.push({
                        type: 'image_url',
                        image_url: { url: att.data }
                    });
                }
            });
        }
        
        return {
            role: msg.role,
            content: content
        };
    });

    messages.unshift({
        role: "system",
        content: [{ type: 'text', text: "You are an intelligent 3D avatar interface connected to the OpenClaw network. Keep responses under 3 sentences for better animation timing." }]
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
        return { content: data.choices[0]?.message?.content || "" };
    } catch (error) {
        console.error("OpenRouter Error:", error);
        throw error;
    }
}

// --- OpenClaw / Custom Agent Implementation ---

export async function checkOpenClawHealth(baseUrl: string): Promise<boolean> {
    try {
        // Try standard health endpoint, fallback to root
        const endpoints = [`${baseUrl.replace(/\/chat$/, '')}/health`, baseUrl.replace(/\/chat$/, '')];
        for (const ep of endpoints) {
            try {
                const res = await fetch(ep);
                if (res.ok) return true;
            } catch (e) {}
        }
        return false;
    } catch (e) {
        return false;
    }
}

export async function fetchOpenClawAgents(baseUrl: string, token?: string): Promise<OpenClawAgent[]> {
    try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        // Assume /agents endpoint exists on the base URL (stripping /chat if present)
        const rootUrl = baseUrl.replace(/\/chat\/?$/, '');
        const res = await fetch(`${rootUrl}/agents`, { headers });
        
        if (!res.ok) throw new Error("Failed to fetch agents");
        
        const data = await res.json();
        // Handle { agents: [] } or just []
        return Array.isArray(data) ? data : (data.agents || []);
    } catch (e) {
        console.error("Agent discovery failed", e);
        return [];
    }
}

async function getOpenClawResponse(history: Message[], settings: Settings, currentAttachments: Attachment[] = []): Promise<AIResponse> {
    if (!settings.openClawBaseUrl) {
        throw new Error("OpenClaw/Agent Base URL is required.");
    }

    const lastMessage = history[history.length - 1];

    // Payload structure for OpenClaw / Enhanced Agent
    const payload = {
        message: lastMessage.content,
        agentId: settings.openClawAgentId,
        sessionId: "session-" + Math.floor(Math.random() * 100000), 
        history: history.slice(0, -1).map(h => ({ role: h.role, content: h.content })),
        files: currentAttachments.map(f => ({ name: f.name, type: f.type, data: f.data }))
    };

    const headers: Record<string, string> = {
        'Content-Type': 'application/json'
    };

    if (settings.openClawAuthToken) {
        headers['Authorization'] = `Bearer ${settings.openClawAuthToken}`;
        headers['X-Api-Key'] = settings.openClawAuthToken; 
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
        
        // Extract content and potential "Chain of Thought" data
        const content = data.response || data.message || data.text || data.output || JSON.stringify(data);
        
        // Look for thought arrays in common locations
        let thoughts: string[] = [];
        if (data.thoughts && Array.isArray(data.thoughts)) thoughts = data.thoughts;
        else if (data.steps && Array.isArray(data.steps)) thoughts = data.steps.map((s: any) => typeof s === 'string' ? s : JSON.stringify(s));
        else if (data.reasoning) thoughts = [data.reasoning];

        return { content, thoughts };

    } catch (error) {
        console.error("OpenClaw Connection Error:", error);
        throw new Error("Failed to connect to OpenClaw Agent. Check URL and Network tab.");
    }
}

// --- Main Facade ---
export async function getAIResponse(history: Message[], settings: Settings, attachments: Attachment[] = []): Promise<AIResponse> {
    switch (settings.apiProvider) {
        case 'gemini':
            return getGeminiResponse(history, settings.geminiModel, attachments);
        case 'openrouter':
            return getOpenRouterResponse(history, settings, attachments);
        case 'openclaw':
            return getOpenClawResponse(history, settings, attachments);
        default:
            throw new Error("Unknown API Provider");
    }
}

export async function fetchOpenRouterModels(): Promise<{id: string, name: string}[]> {
    try {
        const response = await fetch('https://openrouter.ai/api/v1/models');
        if (!response.ok) throw new Error("Failed to fetch models");
        const data = await response.json();
        return data.data
            .sort((a: any, b: any) => a.name.localeCompare(b.name))
            .map((m: any) => ({ id: m.id, name: m.name }));
    } catch (e) {
        console.error(e);
        return [];
    }
}

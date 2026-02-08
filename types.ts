
export interface MorphTargetDictionary {
  [key: string]: number;
}

export interface SceneHandle {
  setMorphTargetInfluence: (name: string, value: number) => void;
  resetMorphTargets: () => void;
}

export type ApiProvider = 'gemini' | 'openrouter' | 'openclaw';

export interface Message {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
}

export interface Settings {
    apiProvider: ApiProvider;
    // Gemini
    geminiModel: string;
    
    // OpenRouter
    openRouterApiKey: string;
    openRouterModel: string;
    
    // OpenClaw / Custom Agent
    openClawBaseUrl: string;
    openClawAgentId: string;
    openClawAuthToken: string;
    
    // Audio
    speechVoiceURI: string | null;
}

export interface OpenRouterModel {
    id: string;
    name: string;
}


export interface MorphTargetDictionary {
  [key: string]: number;
}

export interface SceneHandle {
  setMorphTargetInfluence: (name: string, value: number) => void;
  resetMorphTargets: () => void;
}

export type ApiProvider = 'gemini' | 'openrouter' | 'openclaw';
export type SttProvider = 'native' | 'local_whisper';

export interface Attachment {
    name: string;
    type: string;
    data: string; // Base64 string
}

export interface Message {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
    thoughts?: string[]; // Chain of Thought / Reasoning steps
    attachments?: Attachment[];
}

export interface Avatar {
    id: string;
    name: string;
    url?: string;
    type: 'glb' | 'vrm';
    icon: string;
    isCustom?: boolean;
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
    sttProvider: SttProvider;
    localWhisperUrl: string;

    // Visuals
    lightIntensity: number;
    activeAvatarId: string;
}

export interface OpenRouterModel {
    id: string;
    name: string;
}

export interface OpenClawAgent {
    id: string;
    name: string;
    description?: string;
    status?: 'online' | 'offline' | 'busy';
}

export interface AIResponse {
    content: string;
    thoughts?: string[];
}
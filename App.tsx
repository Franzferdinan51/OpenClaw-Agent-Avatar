
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { ThreeScene } from './components/ThreeScene';
import { ChatUI } from './components/ChatUI';
import { getAIResponse, fetchOpenRouterModels } from './services/aiService';
import type { MorphTargetDictionary, SceneHandle, Settings, OpenRouterModel, Message } from './types';
import { v4 as uuidv4 } from 'uuid'; // Actually we will use simple random string to avoid adding dependency if possible, but let's stick to Date.now() for simplicity without extra package

// Add SpeechRecognition types to window for browsers that support it
declare global {
    interface Window {
        SpeechRecognition: any;
        webkitSpeechRecognition: any;
    }
}

const GEMINI_MODELS = ['gemini-2.5-flash'];

const DEFAULT_SETTINGS: Settings = {
    apiProvider: 'gemini',
    geminiModel: 'gemini-2.5-flash',
    openRouterApiKey: '',
    openRouterModel: 'google/gemini-flash-1.5',
    openClawBaseUrl: 'http://localhost:8000/api/v1/chat',
    openClawAgentId: '',
    openClawAuthToken: '',
    speechVoiceURI: null,
};

const App: React.FC = () => {
    const [isLoading, setIsLoading] = useState(false);
    const [isModelLoaded, setIsModelLoaded] = useState(false);
    const [loadProgress, setLoadProgress] = useState(0);
    const [morphTargetDictionary, setMorphTargetDictionary] = useState<MorphTargetDictionary | null>(null);

    // Chat History State
    const [history, setHistory] = useState<Message[]>([]);

    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
    const [tempSettings, setTempSettings] = useState<Settings>(DEFAULT_SETTINGS);
    
    const [openRouterModels, setOpenRouterModels] = useState<OpenRouterModel[]>([]);
    const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
    const [activeTab, setActiveTab] = useState<'general' | 'provider'>('general');

    const [isListening, setIsListening] = useState(false);
    const recognitionRef = useRef<any>(null);

    const sceneRef = useRef<SceneHandle>(null);
    
    // --- Effects ---

    // Voices
    useEffect(() => {
        const populateVoiceList = () => {
            const availableVoices = window.speechSynthesis.getVoices();
            const englishVoices = availableVoices.filter(voice => voice.lang.startsWith('en'));
            setVoices(englishVoices);
        };
        populateVoiceList();
        if (window.speechSynthesis.onvoiceschanged !== undefined) {
            window.speechSynthesis.onvoiceschanged = populateVoiceList;
        }
    }, []);

    // Load Settings
    useEffect(() => {
        try {
            const stored = localStorage.getItem('aiRobotSettings_v2');
            if (stored) {
                const parsed = JSON.parse(stored);
                // Merge with default to ensure new fields (like openClaw) exist
                const merged = { ...DEFAULT_SETTINGS, ...parsed };
                setSettings(merged);
                setTempSettings(merged);
            }
        } catch (error) {
            console.error("Settings load error", error);
        }
    }, []);

    // Load OpenRouter Models
    useEffect(() => {
        if (isSettingsOpen && settings.apiProvider === 'openrouter' && openRouterModels.length === 0) {
            fetchOpenRouterModels().then(setOpenRouterModels);
        }
    }, [isSettingsOpen, settings.apiProvider, openRouterModels.length]);

    // Init Speech Recognition
    useEffect(() => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
            const recognition = new SpeechRecognition();
            recognition.continuous = false;
            recognition.interimResults = false;
            recognition.lang = 'en-US';
            recognition.onresult = (event: any) => {
                const transcript = event.results[event.results.length - 1][0].transcript.trim();
                if (transcript) handleSend(transcript);
            };
            recognition.onend = () => setIsListening(false);
            recognition.onerror = () => setIsListening(false);
            recognitionRef.current = recognition;
        }
    }, [settings]); // Re-init if settings change heavily (not really needed but safe)

    // --- Logic ---

    const handleModelLoad = useCallback((dictionary: MorphTargetDictionary) => {
        setIsModelLoaded(true);
        setMorphTargetDictionary(dictionary);
    }, []);

    const speakAndAnimate = useCallback((text: string) => {
        if (!window.speechSynthesis || !sceneRef.current) return;
        
        window.speechSynthesis.cancel();
        
        const utterance = new SpeechSynthesisUtterance(text);
        const availableVoices = window.speechSynthesis.getVoices();
        
        if (settings.speechVoiceURI) {
            const voice = availableVoices.find(v => v.voiceURI === settings.speechVoiceURI);
            if (voice) utterance.voice = voice;
        }

        sceneRef.current.resetMorphTargets();

        // Detect mouth morph target
        let mouthTarget: string | null = null;
        if (morphTargetDictionary) {
            const candidates = ['mouthOpen', 'jawOpen', 'vrc.v_oh', 'viseme_O', 'MouthOpen'];
            for (const c of candidates) {
                if (c in morphTargetDictionary) {
                    mouthTarget = c;
                    break;
                }
            }
        }

        utterance.onboundary = (event) => {
            if (event.name === 'word' && mouthTarget) {
                // Simple random amplitude for "talking" effect
                const intensity = 0.5 + Math.random() * 0.5;
                sceneRef.current?.setMorphTargetInfluence(mouthTarget, intensity);
                setTimeout(() => {
                    sceneRef.current?.setMorphTargetInfluence(mouthTarget!, 0);
                }, 100 + Math.random() * 100);
            }
        };
        
        utterance.onend = () => sceneRef.current?.resetMorphTargets();
        window.speechSynthesis.speak(utterance);

    }, [settings.speechVoiceURI, morphTargetDictionary]);

    const handleSend = async (text: string) => {
        const newUserMsg: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: text,
            timestamp: Date.now()
        };

        const newHistory = [...history, newUserMsg];
        setHistory(newHistory);
        setIsLoading(true);

        try {
            const responseText = await getAIResponse(newHistory, settings);
            
            const newAiMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: responseText,
                timestamp: Date.now()
            };
            
            setHistory(prev => [...prev, newAiMsg]);
            speakAndAnimate(responseText);
        } catch (err: any) {
            const errorMsg = err.message || "Communication Error";
            setHistory(prev => [...prev, {
                id: Date.now().toString(),
                role: 'system',
                content: `Error: ${errorMsg}`,
                timestamp: Date.now()
            }]);
        } finally {
            setIsLoading(false);
        }
    };

    const saveSettings = () => {
        setSettings(tempSettings);
        localStorage.setItem('aiRobotSettings_v2', JSON.stringify(tempSettings));
        setIsSettingsOpen(false);
    };

    return (
        <div className="relative w-screen h-screen overflow-hidden bg-gray-900 text-white font-sans selection:bg-cyan-500 selection:text-black">
            
            {/* 3D Background */}
            <div className="absolute inset-0 z-0">
                <ThreeScene ref={sceneRef} onModelLoad={handleModelLoad} onLoadProgress={setLoadProgress} />
            </div>

            {/* Loading Overlay */}
            {!isModelLoaded && (
                <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black">
                    <div className="w-64 h-2 bg-gray-800 rounded-full overflow-hidden mb-4">
                        <div className="h-full bg-cyan-500 transition-all duration-300" style={{width: `${loadProgress}%`}}></div>
                    </div>
                    <div className="text-cyan-400 font-mono text-xl animate-pulse">INITIALIZING NEURAL LINK... {loadProgress}%</div>
                </div>
            )}

            {/* Settings Modal */}
            {isSettingsOpen && (
                <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="bg-gray-900 border border-cyan-500/50 w-full max-w-2xl rounded-xl shadow-[0_0_50px_rgba(6,182,212,0.2)] flex flex-col max-h-[90vh]">
                        {/* Modal Header */}
                        <div className="p-6 border-b border-gray-800 flex justify-between items-center">
                            <h2 className="text-2xl font-mono font-bold text-cyan-400">CONFIGURATION</h2>
                            <button onClick={() => setIsSettingsOpen(false)} className="text-gray-400 hover:text-white">✕</button>
                        </div>

                        {/* Tabs */}
                        <div className="flex border-b border-gray-800">
                            <button 
                                onClick={() => setActiveTab('general')} 
                                className={`flex-1 py-3 font-mono text-sm ${activeTab === 'general' ? 'bg-cyan-900/30 text-cyan-400 border-b-2 border-cyan-400' : 'text-gray-400 hover:bg-gray-800'}`}
                            >
                                GENERAL / AUDIO
                            </button>
                            <button 
                                onClick={() => setActiveTab('provider')} 
                                className={`flex-1 py-3 font-mono text-sm ${activeTab === 'provider' ? 'bg-cyan-900/30 text-cyan-400 border-b-2 border-cyan-400' : 'text-gray-400 hover:bg-gray-800'}`}
                            >
                                AI PROVIDER
                            </button>
                        </div>

                        {/* Content */}
                        <div className="p-6 overflow-y-auto custom-scrollbar">
                            
                            {activeTab === 'general' && (
                                <div className="space-y-6">
                                    <div>
                                        <label className="block text-sm font-bold text-gray-400 mb-2 uppercase tracking-wide">Synthesized Voice</label>
                                        <select 
                                            className="w-full bg-gray-800 border border-gray-700 rounded p-3 text-white focus:border-cyan-500 focus:outline-none"
                                            value={tempSettings.speechVoiceURI || ''}
                                            onChange={(e) => setTempSettings({...tempSettings, speechVoiceURI: e.target.value})}
                                        >
                                            <option value="">Default Browser Voice</option>
                                            {voices.map(v => <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>)}
                                        </select>
                                    </div>
                                    <div className="p-4 bg-blue-900/20 border border-blue-500/30 rounded text-sm text-blue-200">
                                        <p>Tip: Edge and Chrome often provide high-quality "Online" voices (e.g., Google US English, Microsoft Aria).</p>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'provider' && (
                                <div className="space-y-6">
                                    <div className="grid grid-cols-3 gap-2 bg-gray-800 p-1 rounded-lg">
                                        {(['gemini', 'openrouter', 'openclaw'] as const).map(p => (
                                            <button 
                                                key={p}
                                                onClick={() => setTempSettings({...tempSettings, apiProvider: p})}
                                                className={`py-2 rounded-md text-sm font-bold transition-colors ${tempSettings.apiProvider === p ? 'bg-cyan-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                                            >
                                                {p.toUpperCase()}
                                            </button>
                                        ))}
                                    </div>

                                    {tempSettings.apiProvider === 'gemini' && (
                                        <div className="animate-fade-in space-y-4">
                                            <label className="block text-sm font-bold text-gray-400">Model</label>
                                            <select 
                                                value={tempSettings.geminiModel} 
                                                onChange={e => setTempSettings({...tempSettings, geminiModel: e.target.value})}
                                                className="w-full bg-gray-800 border border-gray-700 rounded p-3 text-white"
                                            >
                                                {GEMINI_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
                                            </select>
                                            <div className="text-xs text-green-400 font-mono">✓ API KEY SECURELY INJECTED</div>
                                        </div>
                                    )}

                                    {tempSettings.apiProvider === 'openrouter' && (
                                        <div className="animate-fade-in space-y-4">
                                            <div>
                                                <label className="block text-sm font-bold text-gray-400 mb-1">OpenRouter API Key</label>
                                                <input 
                                                    type="password"
                                                    value={tempSettings.openRouterApiKey}
                                                    onChange={e => setTempSettings({...tempSettings, openRouterApiKey: e.target.value})}
                                                    className="w-full bg-gray-800 border border-gray-700 rounded p-3 text-white focus:border-cyan-500 focus:outline-none"
                                                    placeholder="sk-or-..." 
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-bold text-gray-400 mb-1">Model ID</label>
                                                <input 
                                                    list="or-models"
                                                    value={tempSettings.openRouterModel}
                                                    onChange={e => setTempSettings({...tempSettings, openRouterModel: e.target.value})}
                                                    className="w-full bg-gray-800 border border-gray-700 rounded p-3 text-white focus:border-cyan-500 focus:outline-none"
                                                    placeholder="google/gemini-flash-1.5" 
                                                />
                                                <datalist id="or-models">
                                                    {openRouterModels.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                                </datalist>
                                            </div>
                                        </div>
                                    )}

                                    {tempSettings.apiProvider === 'openclaw' && (
                                        <div className="animate-fade-in space-y-4">
                                            <div className="bg-purple-900/20 border border-purple-500/30 p-3 rounded text-xs text-purple-200 mb-4">
                                                Connect to OpenClaw Agents or compatible REST Swarms. 
                                                Payload sends <code>{`{message, agentId, history}`}</code>.
                                            </div>
                                            <div>
                                                <label className="block text-sm font-bold text-gray-400 mb-1">Agent Endpoint URL</label>
                                                <input 
                                                    type="text"
                                                    value={tempSettings.openClawBaseUrl}
                                                    onChange={e => setTempSettings({...tempSettings, openClawBaseUrl: e.target.value})}
                                                    className="w-full bg-gray-800 border border-gray-700 rounded p-3 text-white font-mono text-sm focus:border-purple-500 focus:outline-none"
                                                    placeholder="http://localhost:8000/api/chat" 
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-bold text-gray-400 mb-1">Agent ID (Optional)</label>
                                                <input 
                                                    type="text"
                                                    value={tempSettings.openClawAgentId}
                                                    onChange={e => setTempSettings({...tempSettings, openClawAgentId: e.target.value})}
                                                    className="w-full bg-gray-800 border border-gray-700 rounded p-3 text-white font-mono text-sm focus:border-purple-500 focus:outline-none"
                                                    placeholder="UUID or Name" 
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-bold text-gray-400 mb-1">Auth Token (Optional)</label>
                                                <input 
                                                    type="password"
                                                    value={tempSettings.openClawAuthToken}
                                                    onChange={e => setTempSettings({...tempSettings, openClawAuthToken: e.target.value})}
                                                    className="w-full bg-gray-800 border border-gray-700 rounded p-3 text-white font-mono text-sm focus:border-purple-500 focus:outline-none"
                                                    placeholder="Bearer token or API Key" 
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="p-6 border-t border-gray-800 flex justify-end gap-4">
                            <button onClick={() => setIsSettingsOpen(false)} className="px-6 py-2 rounded-lg text-gray-400 hover:bg-gray-800 transition-colors">Cancel</button>
                            <button onClick={saveSettings} className="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg shadow-lg shadow-cyan-500/20 transition-all">Save Changes</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Chat Interface Layer */}
            <div className="absolute inset-0 z-10 pointer-events-none">
                <ChatUI 
                    history={history}
                    onSend={handleSend}
                    isLoading={isLoading}
                    isListening={isListening}
                    onMicClick={() => {
                        if (isListening) recognitionRef.current?.stop();
                        else recognitionRef.current?.start();
                        setIsListening(!isListening);
                    }}
                    onSettingsClick={() => setIsSettingsOpen(true)}
                />
            </div>
        </div>
    );
};

export default App;

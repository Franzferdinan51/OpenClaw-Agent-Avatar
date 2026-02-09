import React, { useState, useRef, useCallback, useEffect } from 'react';
import { ThreeScene } from './components/ThreeScene';
import { ChatUI } from './components/ChatUI';
import { getAIResponse, fetchOpenRouterModels, fetchOpenClawAgents, checkOpenClawHealth, transcribeAudio } from './services/aiService';
import type { MorphTargetDictionary, SceneHandle, Settings, OpenRouterModel, Message, Attachment, OpenClawAgent, Avatar } from './types';
import { v4 as uuidv4 } from 'uuid';

// Add SpeechRecognition types to window for browsers that support it
declare global {
    interface Window {
        SpeechRecognition: any;
        webkitSpeechRecognition: any;
    }
}

const GEMINI_MODELS = [
    'gemini-3-flash-preview',
    'gemini-3-pro-preview',
    'gemini-2.5-flash-latest',
    'gemini-2.5-flash-thinking-latest',
    'gemini-2.5-pro-latest'
];

const DEFAULT_SETTINGS: Settings = {
    apiProvider: 'gemini',
    geminiModel: 'gemini-3-flash-preview',
    openRouterApiKey: '',
    openRouterModel: 'google/gemini-flash-1.5',
    openClawBaseUrl: 'http://localhost:8000/api/v1/chat',
    openClawAgentId: '',
    openClawAuthToken: '',
    speechVoiceURI: null,
    sttProvider: 'native',
    localWhisperUrl: 'http://localhost:8080/v1/audio/transcriptions',
    lightIntensity: 1.2,
    activeAvatarId: 'robot'
};

const AVATAR_PRESETS: Avatar[] = [
    { id: 'robot', name: 'Classic Robot', url: undefined, type: 'glb', icon: '🤖' },
    { id: 'vrm_girl', name: 'Alicia (VRM)', url: 'https://cdn.jsdelivr.net/gh/vrm-c/vrm-specification@master/samples/AliciaSolid/AliciaSolid.vrm', type: 'vrm', icon: '👧' },
];

const App: React.FC = () => {
    const [isLoading, setIsLoading] = useState(false);
    const [isModelLoaded, setIsModelLoaded] = useState(false);
    const [loadProgress, setLoadProgress] = useState(0);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [morphTargetDictionary, setMorphTargetDictionary] = useState<MorphTargetDictionary | null>(null);

    // Chat History State
    const [history, setHistory] = useState<Message[]>([]);

    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
    const [tempSettings, setTempSettings] = useState<Settings>(DEFAULT_SETTINGS);
    
    // Avatar State
    const [customAvatars, setCustomAvatars] = useState<Avatar[]>([]);
    
    // Discovery Data
    const [openRouterModels, setOpenRouterModels] = useState<OpenRouterModel[]>([]);
    const [openClawAgents, setOpenClawAgents] = useState<OpenClawAgent[]>([]);
    const [connectionStatus, setConnectionStatus] = useState<'idle' | 'checking' | 'online' | 'offline'>('idle');

    const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
    const [activeTab, setActiveTab] = useState<'general' | 'provider'>('general');

    const [isListening, setIsListening] = useState(false);
    const recognitionRef = useRef<any>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);

    const sceneRef = useRef<SceneHandle>(null);
    const modelInputRef = useRef<HTMLInputElement>(null);
    
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

    // Load Settings & Auto-Configure from URL
    useEffect(() => {
        try {
            let initialSettings = { ...DEFAULT_SETTINGS };
            const stored = localStorage.getItem('aiRobotSettings_v2');
            if (stored) {
                const parsed = JSON.parse(stored);
                initialSettings = { ...initialSettings, ...parsed };
                // Ensure activeAvatarId exists from older versions
                if (!initialSettings.activeAvatarId) initialSettings.activeAvatarId = 'robot';
            }

            const params = new URLSearchParams(window.location.search);
            const providerParam = params.get('provider');
            
            if (providerParam && ['gemini', 'openrouter', 'openclaw'].includes(providerParam)) {
                initialSettings.apiProvider = providerParam as any;
                
                if (params.get('baseUrl')) initialSettings.openClawBaseUrl = decodeURIComponent(params.get('baseUrl')!);
                if (params.get('agentId')) initialSettings.openClawAgentId = params.get('agentId')!;
                if (params.get('authToken')) initialSettings.openClawAuthToken = params.get('authToken')!;
                if (params.get('model')) {
                    if (providerParam === 'gemini') initialSettings.geminiModel = params.get('model')!;
                    if (providerParam === 'openrouter') initialSettings.openRouterModel = params.get('model')!;
                }

                setHistory(prev => [...prev, {
                    id: 'sys-init',
                    role: 'system',
                    content: `AUTO-CONFIG: Connected to ${providerParam.toUpperCase()} via URL parameters.`,
                    timestamp: Date.now()
                }]);
            }

            setSettings(initialSettings);
            setTempSettings(initialSettings);

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

    // Init Native Speech Recognition
    useEffect(() => {
        if (settings.sttProvider === 'native') {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (SpeechRecognition) {
                const recognition = new SpeechRecognition();
                recognition.continuous = false;
                recognition.interimResults = false;
                recognition.lang = 'en-US';
                recognition.onresult = (event: any) => {
                    const transcript = event.results[event.results.length - 1][0].transcript.trim();
                    if (transcript) handleSend(transcript, []);
                };
                recognition.onend = () => setIsListening(false);
                recognition.onerror = () => setIsListening(false);
                recognitionRef.current = recognition;
            }
        }
    }, [settings.sttProvider]); 

    // --- Logic ---

    const checkConnection = async () => {
        setConnectionStatus('checking');
        const isOnline = await checkOpenClawHealth(tempSettings.openClawBaseUrl);
        setConnectionStatus(isOnline ? 'online' : 'offline');
    };

    const discoverAgents = async () => {
        const agents = await fetchOpenClawAgents(tempSettings.openClawBaseUrl, tempSettings.openClawAuthToken);
        setOpenClawAgents(agents);
    };

    const handleModelLoad = useCallback((dictionary: MorphTargetDictionary) => {
        setIsModelLoaded(true);
        setMorphTargetDictionary(dictionary);
    }, []);

    const handleModelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const url = URL.createObjectURL(file);
            const isVrm = file.name.endsWith('.vrm');
            const newAvatar: Avatar = {
                id: `custom-${Date.now()}`,
                name: file.name,
                url: url,
                type: isVrm ? 'vrm' : 'glb',
                icon: '📁',
                isCustom: true
            };
            
            setCustomAvatars(prev => [...prev, newAvatar]);
            handleAvatarSelect(newAvatar.id, [...customAvatars, newAvatar]); // Immediately select
            
            // Note: We cannot persist blob URLs in localStorage across reloads, 
            // but we can persist the ID to try (it will fail and fallback on reload)
        }
    };

    const handleAvatarSelect = (id: string, currentCustomList = customAvatars) => {
        // Update both main settings and temp settings if open
        const newSettings = { ...settings, activeAvatarId: id };
        setSettings(newSettings);
        setTempSettings(prev => ({ ...prev, activeAvatarId: id }));
        setIsModelLoaded(false);
        
        // Persist immediately (User Expectation: "Remembers the model")
        localStorage.setItem('aiRobotSettings_v2', JSON.stringify(newSettings));
    };

    // Combine presets and custom for display
    const allAvatars = [...AVATAR_PRESETS, ...customAvatars];

    // Determine the actual URL to pass to ThreeScene
    const getActiveModelUrl = () => {
        const active = allAvatars.find(a => a.id === settings.activeAvatarId);
        if (active) return active.url;
        
        // Fallback if saved ID doesn't exist (e.g. reload after custom upload)
        return AVATAR_PRESETS[0].url;
    };

    const speakAndAnimate = useCallback((text: string) => {
        if (!window.speechSynthesis || !sceneRef.current) return;
        window.speechSynthesis.cancel();
        
        const speechText = text.replace(/```[\s\S]*?```/g, " Code block omitted. ").replace(/[*#_]/g, "");

        const utterance = new SpeechSynthesisUtterance(speechText);
        const availableVoices = window.speechSynthesis.getVoices();
        
        if (settings.speechVoiceURI) {
            const voice = availableVoices.find(v => v.voiceURI === settings.speechVoiceURI);
            if (voice) utterance.voice = voice;
        }

        sceneRef.current.resetMorphTargets();

        // Standard mouth target check - ThreeScene maps this to VRM 'aa' automatically
        let mouthTarget = 'mouthOpen'; 

        utterance.onboundary = (event) => {
            if (event.name === 'word') {
                const intensity = 0.5 + Math.random() * 0.5;
                sceneRef.current?.setMorphTargetInfluence(mouthTarget, intensity);
                setTimeout(() => {
                    sceneRef.current?.setMorphTargetInfluence(mouthTarget, 0);
                }, 100 + Math.random() * 100);
            }
        };
        
        utterance.onend = () => sceneRef.current?.resetMorphTargets();
        window.speechSynthesis.speak(utterance);

    }, [settings.speechVoiceURI]);

    const handleMicToggle = async () => {
        if (isListening) {
            // STOP RECORDING
            if (settings.sttProvider === 'native') {
                 recognitionRef.current?.stop();
            } else {
                 mediaRecorderRef.current?.stop(); // This triggers onstop logic
            }
            // State update to false happens in onstop/onend handlers mostly, but for safety:
            if (settings.sttProvider === 'local_whisper') setIsListening(false);
        } else {
            // START RECORDING
            if (settings.sttProvider === 'native') {
                recognitionRef.current?.start();
                setIsListening(true);
            } else {
                // Local Whisper / Media Recorder
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    const mediaRecorder = new MediaRecorder(stream);
                    mediaRecorderRef.current = mediaRecorder;
                    audioChunksRef.current = [];

                    mediaRecorder.ondataavailable = (event) => {
                        if (event.data.size > 0) audioChunksRef.current.push(event.data);
                    };

                    mediaRecorder.onstop = async () => {
                        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                        setIsLoading(true); // Show processing UI
                        try {
                            const text = await transcribeAudio(audioBlob, settings.localWhisperUrl);
                            if (text && text.trim()) {
                                handleSend(text.trim(), []);
                            }
                        } catch (e) {
                            console.error("Transcription failed", e);
                            setHistory(prev => [...prev, {
                                id: Date.now().toString(),
                                role: 'system',
                                content: `System Error: Transcription failed. Check Local Whisper URL.`,
                                timestamp: Date.now()
                            }]);
                        } finally {
                            setIsLoading(false);
                            // Cleanup tracks
                            stream.getTracks().forEach(track => track.stop());
                        }
                    };

                    mediaRecorder.start();
                    setIsListening(true);
                } catch (e) {
                    console.error("Microphone access denied", e);
                    alert("Microphone access denied or not supported.");
                }
            }
        }
    };

    const handleSend = async (text: string, attachments: Attachment[]) => {
        const newUserMsg: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: text,
            timestamp: Date.now(),
            attachments: attachments 
        };

        const newHistory = [...history, newUserMsg];
        setHistory(newHistory);
        setIsLoading(true);

        try {
            const aiResponse = await getAIResponse(newHistory, settings, attachments);
            
            const newAiMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: aiResponse.content,
                timestamp: Date.now(),
                thoughts: aiResponse.thoughts 
            };
            
            setHistory(prev => [...prev, newAiMsg]);
            speakAndAnimate(aiResponse.content);
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
                <ThreeScene 
                    ref={sceneRef} 
                    modelUrl={getActiveModelUrl()}
                    lightIntensity={settings.lightIntensity}
                    onModelLoad={handleModelLoad} 
                    onLoadProgress={setLoadProgress} 
                />
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
                                VISUALS / AUDIO
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
                                    
                                    {/* Avatar Selection */}
                                    <div className="space-y-3">
                                        <label className="block text-sm font-bold text-cyan-400 uppercase tracking-wide">Avatar Selection</label>
                                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                                            {allAvatars.map(avatar => (
                                                <button
                                                    key={avatar.id}
                                                    onClick={() => handleAvatarSelect(avatar.id)}
                                                    className={`p-3 rounded-lg border flex flex-col items-center gap-2 transition-all relative overflow-hidden ${
                                                        tempSettings.activeAvatarId === avatar.id 
                                                        ? 'bg-cyan-900/40 border-cyan-500 ring-1 ring-cyan-500' 
                                                        : 'bg-gray-800 border-gray-700 hover:bg-gray-750'
                                                    }`}
                                                >
                                                    <span className="text-2xl z-10">{avatar.icon}</span>
                                                    <span className="text-xs font-mono z-10 truncate w-full text-center" title={avatar.name}>{avatar.name}</span>
                                                    {avatar.isCustom && <div className="absolute top-0 right-0 w-2 h-2 bg-yellow-400 rounded-full m-1"></div>}
                                                </button>
                                            ))}
                                            <button
                                                onClick={() => modelInputRef.current?.click()}
                                                className={`p-3 rounded-lg border border-dashed flex flex-col items-center gap-2 transition-all bg-gray-900 border-gray-600 hover:border-cyan-400 hover:text-cyan-400 text-gray-400`}
                                            >
                                                <span className="text-2xl">+</span>
                                                <span className="text-xs font-mono">Upload</span>
                                            </button>
                                        </div>
                                        <input 
                                            type="file" 
                                            accept=".vrm,.glb,.gltf" 
                                            ref={modelInputRef}
                                            onChange={handleModelUpload}
                                            className="hidden"
                                        />
                                        <p className="text-[10px] text-gray-500 font-mono mt-1">* Supports .glb (animated) and .vrm files.</p>
                                    </div>

                                    {/* Brightness Control */}
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center">
                                            <label className="block text-sm font-bold text-gray-400 uppercase tracking-wide">Scene Brightness</label>
                                            <span className="text-xs font-mono text-cyan-400">{tempSettings.lightIntensity.toFixed(1)}</span>
                                        </div>
                                        <input 
                                            type="range" 
                                            min="0" 
                                            max="3" 
                                            step="0.1"
                                            value={tempSettings.lightIntensity}
                                            onChange={(e) => setTempSettings({...tempSettings, lightIntensity: parseFloat(e.target.value)})}
                                            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                                        />
                                    </div>

                                    <hr className="border-gray-800" />

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
                                    
                                    <div className="pt-2">
                                        <label className="block text-sm font-bold text-gray-400 mb-2 uppercase tracking-wide">Speech Input (STT)</label>
                                        <div className="flex gap-4 mb-4">
                                            <button 
                                                onClick={() => setTempSettings({...tempSettings, sttProvider: 'native'})}
                                                className={`flex-1 py-2 rounded border ${tempSettings.sttProvider === 'native' ? 'bg-cyan-600 border-cyan-500 text-white' : 'bg-gray-800 border-gray-600 text-gray-400'}`}
                                            >
                                                Browser Native
                                            </button>
                                            <button 
                                                onClick={() => setTempSettings({...tempSettings, sttProvider: 'local_whisper'})}
                                                className={`flex-1 py-2 rounded border ${tempSettings.sttProvider === 'local_whisper' ? 'bg-cyan-600 border-cyan-500 text-white' : 'bg-gray-800 border-gray-600 text-gray-400'}`}
                                            >
                                                Local Whisper
                                            </button>
                                        </div>
                                        
                                        {tempSettings.sttProvider === 'local_whisper' && (
                                            <div className="animate-fade-in bg-gray-800 p-4 rounded border border-gray-700">
                                                <label className="block text-xs font-bold text-gray-400 mb-1">Whisper Endpoint URL</label>
                                                <input 
                                                    type="text"
                                                    value={tempSettings.localWhisperUrl}
                                                    onChange={e => setTempSettings({...tempSettings, localWhisperUrl: e.target.value})}
                                                    className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-sm text-white font-mono"
                                                    placeholder="http://localhost:8080/v1/audio/transcriptions" 
                                                />
                                            </div>
                                        )}
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
                                                <br/>
                                                Features: Multimodal, Chain of Thought, Auto-Discovery.
                                            </div>
                                            
                                            <div className="flex gap-2 items-end">
                                                 <div className="flex-grow">
                                                    <label className="block text-sm font-bold text-gray-400 mb-1">Agent Endpoint URL</label>
                                                    <input 
                                                        type="text"
                                                        value={tempSettings.openClawBaseUrl}
                                                        onChange={e => setTempSettings({...tempSettings, openClawBaseUrl: e.target.value})}
                                                        className="w-full bg-gray-800 border border-gray-700 rounded p-3 text-white font-mono text-sm focus:border-purple-500 focus:outline-none"
                                                        placeholder="http://localhost:8000/api/chat" 
                                                    />
                                                 </div>
                                                 <button onClick={checkConnection} className="bg-gray-700 hover:bg-gray-600 text-white p-3 rounded border border-gray-600 mb-[1px]" title="Check Health">
                                                    {connectionStatus === 'idle' && '📡'}
                                                    {connectionStatus === 'checking' && '⏳'}
                                                    {connectionStatus === 'online' && '✅'}
                                                    {connectionStatus === 'offline' && '❌'}
                                                 </button>
                                            </div>

                                            <div>
                                                <div className="flex justify-between items-center mb-1">
                                                    <label className="block text-sm font-bold text-gray-400">Agent ID</label>
                                                    <button onClick={discoverAgents} className="text-xs text-purple-400 hover:text-purple-300 underline">Discover Agents</button>
                                                </div>
                                                <div className="relative">
                                                    <input 
                                                        type="text"
                                                        list="discovered-agents"
                                                        value={tempSettings.openClawAgentId}
                                                        onChange={e => setTempSettings({...tempSettings, openClawAgentId: e.target.value})}
                                                        className="w-full bg-gray-800 border border-gray-700 rounded p-3 text-white font-mono text-sm focus:border-purple-500 focus:outline-none"
                                                        placeholder="UUID or Name" 
                                                    />
                                                    <datalist id="discovered-agents">
                                                        {openClawAgents.map(a => <option key={a.id} value={a.id}>{a.name} {a.description ? `- ${a.description}` : ''}</option>)}
                                                    </datalist>
                                                </div>
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
                    onMicClick={handleMicToggle}
                    onSettingsClick={() => setIsSettingsOpen(true)}
                />
            </div>
        </div>
    );
};

export default App;
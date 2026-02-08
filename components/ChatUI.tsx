
import React, { useState, useEffect, useRef } from 'react';
import { Message } from '../types';

// Icons
const SendIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path></svg>
);
const MicIcon = ({ active }: { active: boolean }) => (
    <svg className={`w-5 h-5 ${active ? 'text-red-400 animate-pulse' : 'text-cyan-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path></svg>
);
const SettingsIcon = () => (
    <svg className="w-6 h-6 text-cyan-400 hover:text-cyan-200 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
);

interface ChatUIProps {
    history: Message[];
    onSend: (message: string) => void;
    isLoading: boolean;
    onMicClick: () => void;
    isListening: boolean;
    onSettingsClick: () => void;
}

export const ChatUI: React.FC<ChatUIProps> = ({ 
    history, 
    onSend, 
    isLoading, 
    onMicClick, 
    isListening, 
    onSettingsClick 
}) => {
    const [inputValue, setInputValue] = useState('');
    const scrollRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom of chat
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [history]);

    const handleSend = () => {
        if (inputValue.trim() && !isLoading) {
            onSend(inputValue.trim());
            setInputValue('');
        }
    };

    return (
        <div className="flex flex-col h-full pointer-events-none">
            {/* Header / Top Bar */}
            <div className="flex justify-between items-start p-6 pointer-events-auto">
                <div className="bg-black/40 backdrop-blur-md border border-cyan-500/30 p-4 rounded-lg shadow-[0_0_15px_rgba(6,182,212,0.15)] max-w-xs">
                    <h1 className="text-cyan-400 font-mono text-lg font-bold tracking-wider">OPENCLAW<span className="text-white text-xs ml-2 opacity-70">INTERFACE v2.0</span></h1>
                    <div className="flex items-center gap-2 mt-2">
                        <div className={`w-2 h-2 rounded-full ${isLoading ? 'bg-yellow-400 animate-pulse' : 'bg-green-500'}`}></div>
                        <span className="text-xs text-gray-300 font-mono uppercase">
                            {isLoading ? 'PROCESSING DATA' : 'SYSTEM ONLINE'}
                        </span>
                    </div>
                </div>

                <button 
                    onClick={onSettingsClick} 
                    className="bg-black/40 backdrop-blur-md p-3 rounded-full border border-cyan-500/30 hover:bg-cyan-900/40 transition-all hover:scale-105 shadow-[0_0_15px_rgba(6,182,212,0.2)]"
                >
                    <SettingsIcon />
                </button>
            </div>

            {/* Middle Spacer */}
            <div className="flex-grow"></div>

            {/* Chat History & Input Area */}
            <div className="flex flex-col gap-4 p-4 md:p-6 max-w-3xl mx-auto w-full pointer-events-auto">
                
                {/* Chat Log (Glass Panel) */}
                <div 
                    ref={scrollRef}
                    className="bg-black/60 backdrop-blur-md rounded-xl border border-gray-700/50 p-4 h-64 md:h-80 overflow-y-auto scrollbar-thin scrollbar-thumb-cyan-700 scrollbar-track-transparent shadow-2xl flex flex-col gap-3"
                >
                    {history.length === 0 && (
                        <div className="text-center text-gray-500 font-mono text-sm mt-20">
                            AWAITING INPUT...
                        </div>
                    )}
                    {history.map((msg) => (
                        <div 
                            key={msg.id} 
                            className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                        >
                            <div 
                                className={`max-w-[85%] px-4 py-2 rounded-lg text-sm md:text-base ${
                                    msg.role === 'user' 
                                        ? 'bg-cyan-900/60 text-cyan-50 border border-cyan-700/50 rounded-br-none' 
                                        : 'bg-gray-800/80 text-gray-100 border border-gray-600/50 rounded-bl-none'
                                }`}
                            >
                                {msg.content}
                            </div>
                            <span className="text-[10px] text-gray-500 font-mono mt-1 uppercase">{msg.role}</span>
                        </div>
                    ))}
                    {isLoading && (
                        <div className="flex items-start">
                            <div className="bg-gray-800/80 px-4 py-3 rounded-lg rounded-bl-none border border-gray-600/50">
                                <div className="flex gap-1">
                                    <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{animationDelay: '0s'}}></div>
                                    <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                                    <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Input Bar */}
                <div className="relative flex items-center gap-2 bg-black/70 backdrop-blur-xl p-2 rounded-2xl border border-cyan-500/30 shadow-[0_0_20px_rgba(0,0,0,0.5)]">
                    <input
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                        placeholder={isListening ? "Listening..." : "Enter command or query..."}
                        disabled={isLoading}
                        className="flex-grow bg-transparent text-white font-mono placeholder-gray-500 px-4 py-3 focus:outline-none disabled:opacity-50"
                    />
                    
                    <button
                        onClick={onMicClick}
                        className={`p-3 rounded-xl transition-all ${isListening ? 'bg-red-900/50 border border-red-500' : 'hover:bg-gray-800'}`}
                    >
                        <MicIcon active={isListening} />
                    </button>

                    <button
                        onClick={handleSend}
                        disabled={!inputValue.trim() || isLoading}
                        className="p-3 bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-xl transition-all shadow-lg"
                    >
                        <SendIcon />
                    </button>
                </div>
            </div>
        </div>
    );
};

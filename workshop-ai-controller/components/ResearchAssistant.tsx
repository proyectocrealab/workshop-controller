import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import { SendIcon, UserIcon, BotIcon, LinkIcon, ChevronDownIcon } from './Icons';

interface Message {
    role: 'user' | 'model';
    text: string;
    sources?: any[];
}

const Source: React.FC<{ source: any }> = ({ source }) => {
    const [isOpen, setIsOpen] = useState(false);

    if (!source.web?.uri) return null;

    return (
        <div className="bg-gray-800/70 rounded-md overflow-hidden transition-all duration-300">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full text-left p-2 flex justify-between items-center hover:bg-gray-700/50"
                aria-expanded={isOpen}
            >
                <div className="flex items-center gap-2 min-w-0">
                    <LinkIcon className="w-3 h-3 flex-shrink-0 text-gray-400" />
                    <span className="text-xs text-gray-300 truncate">{source.web.title || source.web.uri}</span>
                </div>
                <ChevronDownIcon className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && (
                <div 
                    className="px-3 pt-2 pb-3 border-t border-gray-700/50"
                >
                    <a 
                        href={source.web.uri} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-xs text-cyan-400 hover:underline break-all"
                    >
                        {source.web.uri}
                    </a>
                </div>
            )}
        </div>
    );
};


export const ResearchAssistant: React.FC = () => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState<string>('');
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string>('');
    const chatContainerRef = useRef<HTMLDivElement>(null);
    const [isKeyAvailable, setIsKeyAvailable] = useState(false);

    useEffect(() => {
      // The environment variable is only available at runtime, so we check it here.
      setIsKeyAvailable(!!process.env.API_KEY);
    }, []);
    
    useEffect(() => {
        chatContainerRef.current?.scrollTo(0, chatContainerRef.current.scrollHeight);
    }, [messages]);

    const handleSend = async () => {
        if (!input.trim() || !process.env.API_KEY) {
            if (!process.env.API_KEY) {
                setError('API Key is not configured. Research is disabled.');
            }
            return;
        }

        const userMessage: Message = { role: 'user', text: input };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setLoading(true);
        setError('');

        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: input,
                config: {
                    tools: [{ googleSearch: {} }]
                }
            });

            const modelMessage: Message = {
                role: 'model',
                text: response.text,
                sources: response.candidates?.[0]?.groundingMetadata?.groundingChunks || []
            };
            setMessages(prev => [...prev, modelMessage]);

        } catch (err: any) {
            console.error(err);
            setError('An error occurred. Please try again.');
        } finally {
            setLoading(false);
        }
    };
    
    return (
        <div className="max-w-4xl mx-auto flex flex-col h-[calc(100vh-200px)] bg-gray-800/50 rounded-lg shadow-lg animate-fade-in">
            <h2 className="text-2xl font-bold text-center p-4 text-white border-b border-gray-700">
                Research Assistant
            </h2>
             <p className="text-sm text-center text-gray-400 p-2 bg-gray-900/30">
                Powered by Gemini with Google Search for up-to-date information.
            </p>
            <div ref={chatContainerRef} className="flex-grow p-4 overflow-y-auto space-y-4">
                {messages.length === 0 && !loading && (
                    <div className="text-center text-gray-500 h-full flex flex-col justify-center items-center">
                        <BotIcon className="w-16 h-16 mb-4"/>
                        {isKeyAvailable ? (
                            <>
                                <p>Ask anything. I'll search the web for the latest info.</p>
                                <p className="text-sm mt-2">e.g., "What are the latest advancements in AI?"</p>
                            </>
                        ) : (
                             <p className="font-semibold text-yellow-400">API Key not configured. Research assistant is disabled.</p>
                        )}
                    </div>
                )}
                {messages.map((msg, index) => (
                    <div key={index} className={`flex items-start gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                        {msg.role === 'model' && <div className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center"><BotIcon className="w-5 h-5"/></div>}
                        <div className={`p-3 rounded-lg max-w-lg ${msg.role === 'user' ? 'bg-cyan-600 text-white' : 'bg-gray-700 text-gray-200'}`}>
                            <p className="whitespace-pre-wrap">{msg.text}</p>
                            {msg.sources && msg.sources.length > 0 && (
                                <div className="mt-3 pt-3 border-t border-gray-600">
                                    <h4 className="text-xs font-semibold text-gray-400 mb-2">Sources:</h4>
                                    <div className="flex flex-col gap-2">
                                        {msg.sources.map((source, i) => (
                                           <Source key={i} source={source} />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                        {msg.role === 'user' && <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center"><UserIcon className="w-5 h-5"/></div>}
                    </div>
                ))}
                {loading && (
                     <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center"><BotIcon className="w-5 h-5"/></div>
                        <div className="p-3 rounded-lg bg-gray-700 w-24">
                            <div className="flex items-center justify-center space-x-1">
                                <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse [animation-delay:-0.3s]"></div>
                                <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse [animation-delay:-0.15s]"></div>
                                <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse"></div>
                            </div>
                        </div>
                    </div>
                )}
                {error && <p className="text-red-400 text-sm text-center">{error}</p>}
            </div>
            <div className="p-4 border-t border-gray-700">
                <div className="flex items-center gap-2 bg-gray-700 rounded-lg p-1">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && !loading && handleSend()}
                        placeholder={isKeyAvailable ? "Ask me anything..." : "API Key required"}
                        className="w-full bg-transparent p-2 text-gray-200 focus:outline-none disabled:cursor-not-allowed"
                        disabled={loading || !isKeyAvailable}
                    />
                    <button onClick={handleSend} disabled={loading || !input.trim() || !isKeyAvailable} className="bg-cyan-600 text-white rounded-md p-2 hover:bg-cyan-700 disabled:bg-gray-500 disabled:cursor-not-allowed transition-colors">
                        <SendIcon />
                    </button>
                </div>
            </div>
        </div>
    );
};
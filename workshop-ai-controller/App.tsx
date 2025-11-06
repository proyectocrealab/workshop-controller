import React, { useState, useMemo, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import { WorkshopControl } from './components/WorkshopControl';
import { ImageAnalyzer } from './components/ImageAnalyzer';
import { ResearchAssistant } from './components/ResearchAssistant';
import { ToolsIcon, ImageIcon, SearchIcon, BotIcon, KeyIcon } from './components/Icons';

type Tab = 'workshop' | 'analyzer' | 'research';

const ApiKeyModal: React.FC<{
    onKeySubmit: (key: string) => void;
    isVerifying: boolean;
    error: string;
}> = ({ onKeySubmit, isVerifying, error }) => {
    const [key, setKey] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (key.trim() && !isVerifying) {
            onKeySubmit(key.trim());
        }
    };

    return (
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-gray-800 rounded-lg shadow-2xl p-6 w-full max-w-md animate-fade-in border border-cyan-500/20">
                <div className="flex flex-col items-center text-center">
                    <KeyIcon className="w-12 h-12 text-cyan-400 mb-4" />
                    <h2 className="text-xl font-bold text-white">Gemini API Key Required</h2>
                    <p className="text-gray-400 mt-2">
                        To use the AI features of this application, please enter your Gemini API key.
                        Your key will be stored securely in your browser's local storage.
                    </p>
                </div>
                <form onSubmit={handleSubmit} className="mt-6">
                    <input
                        type="password"
                        value={key}
                        onChange={(e) => setKey(e.target.value)}
                        className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                        placeholder="Enter your API key..."
                        aria-label="Gemini API Key"
                        disabled={isVerifying}
                    />
                    {error && <p className="text-red-400 text-sm mt-2 text-center">{error}</p>}
                    <button
                        type="submit"
                        disabled={!key.trim() || isVerifying}
                        className="mt-4 w-full bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-2 px-4 rounded-lg transition-colors disabled:bg-gray-500 disabled:cursor-not-allowed flex items-center justify-center"
                    >
                        {isVerifying ? (
                            <>
                                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Verifying...
                            </>
                        ) : "Save and Continue"}
                    </button>
                     <p className="text-xs text-gray-500 mt-4 text-center">
                        You can get a key from Google AI Studio.
                    </p>
                </form>
            </div>
        </div>
    );
};

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('workshop');
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [isVerifyingKey, setIsVerifyingKey] = useState(false);
  const [keyError, setKeyError] = useState('');

  useEffect(() => {
    const storedKey = localStorage.getItem('gemini-api-key');
    if (storedKey) {
      setApiKey(storedKey);
    } else {
      setShowKeyModal(true);
    }
  }, []);

  const handleKeySubmit = async (key: string) => {
    setIsVerifyingKey(true);
    setKeyError('');
    try {
        const ai = new GoogleGenAI({ apiKey: key });
        // Make a simple, low-cost call to validate the key
        await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: 'test' });
        
        localStorage.setItem('gemini-api-key', key);
        setApiKey(key);
        setShowKeyModal(false);
    } catch (err) {
        console.error("API Key validation failed:", err);
        setKeyError('Invalid API Key. Please check your key and try again.');
    } finally {
        setIsVerifyingKey(false);
    }
  };

  const renderContent = () => {
    const props = { apiKey };
    switch (activeTab) {
      case 'workshop':
        return <WorkshopControl {...props} />;
      case 'analyzer':
        return <ImageAnalyzer {...props} />;
      case 'research':
        return <ResearchAssistant {...props} />;
      default:
        return null;
    }
  };

  const NavButton = ({ tabName, icon, label }: { tabName: Tab; icon: React.ReactNode; label: string }) => (
    <button
      onClick={() => setActiveTab(tabName)}
      className={`flex-1 sm:flex-none sm:w-48 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium rounded-t-lg transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 focus-visible:ring-cyan-400 ${
        activeTab === tabName
          ? 'bg-gray-800 text-cyan-400 border-b-2 border-cyan-400'
          : 'text-gray-400 hover:bg-gray-800/50 hover:text-white'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col">
       {showKeyModal && <ApiKeyModal onKeySubmit={handleKeySubmit} isVerifying={isVerifyingKey} error={keyError} />}
      <header className="bg-gray-900/80 backdrop-blur-sm sticky top-0 z-10 px-4 pt-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
                <BotIcon className="w-8 h-8 text-cyan-400" />
                <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">
                    Workshop AI Controller
                </h1>
            </div>
        </div>
        <nav className="max-w-7xl mx-auto mt-4 flex justify-center sm:justify-start border-b border-gray-700">
          <NavButton tabName="workshop" icon={<ToolsIcon />} label="Control Panel" />
          <NavButton tabName="analyzer" icon={<ImageIcon />} label="Image Analyzer" />
          <NavButton tabName="research" icon={<SearchIcon />} label="Research" />
        </nav>
      </header>
      <main className="flex-grow p-4 md:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto">
          {useMemo(() => renderContent(), [activeTab, apiKey])}
        </div>
      </main>
      <footer className="text-center p-4 text-xs text-gray-500">
        <p>Powered by Gemini. For demonstration purposes only.</p>
      </footer>
    </div>
  );
};

export default App;

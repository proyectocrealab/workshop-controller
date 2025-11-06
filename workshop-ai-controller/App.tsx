import React, { useState, useMemo } from 'react';
import { WorkshopControl } from './components/WorkshopControl';
import { ImageAnalyzer } from './components/ImageAnalyzer';
import { ResearchAssistant } from './components/ResearchAssistant';
import { ToolsIcon, ImageIcon, SearchIcon, BotIcon } from './components/Icons';

type Tab = 'workshop' | 'analyzer' | 'research';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('workshop');

  const renderContent = () => {
    switch (activeTab) {
      case 'workshop':
        return <WorkshopControl />;
      case 'analyzer':
        return <ImageAnalyzer />;
      case 'research':
        return <ResearchAssistant />;
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
          {useMemo(() => renderContent(), [activeTab])}
        </div>
      </main>
      <footer className="text-center p-4 text-xs text-gray-500">
        <p>Powered by Gemini. For demonstration purposes only.</p>
      </footer>
    </div>
  );
};

export default App;

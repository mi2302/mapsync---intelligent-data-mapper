
import React from 'react';

interface LayoutProps {
  children: React.ReactNode;
  onGoHome: () => void;
}

export const Layout: React.FC<LayoutProps> = ({ children, onGoHome }) => {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-slate-200 px-8 py-5 flex items-center justify-between sticky top-0 z-50">
        <div 
          className="flex items-center gap-4 cursor-pointer group"
          onClick={onGoHome}
        >
          <div className="bg-blue-600 text-white p-2.5 rounded-[1rem] shadow-lg shadow-blue-500/20 group-hover:rotate-12 transition-transform">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
          </div>
          <div className="flex flex-col">
            <h1 className="text-xl font-black bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-blue-600 tracking-tighter uppercase leading-none">
              MapSync AI
            </h1>
            <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest mt-1">Intelligent Relational Mapper</span>
          </div>
        </div>
        <nav className="flex items-center gap-8">
          <button 
            onClick={onGoHome}
            className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-blue-600 transition-colors"
          >
            Dashboard
          </button>
          <div className="h-10 w-10 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 font-black text-[10px] shadow-sm">
            AD
          </div>
        </nav>
      </header>
      <main className="flex-1 max-w-[1600px] mx-auto w-full p-4 md:p-12">
        {children}
      </main>
      <footer className="bg-white border-t border-slate-200 py-10 text-center">
        <p className="text-slate-300 text-[9px] font-black uppercase tracking-[0.4em]">
          &copy; 2024 MapSync Enterprise Transformation Engine &bull; System v1.0.8
        </p>
      </footer>
    </div>
  );
};

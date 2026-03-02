
import React, { useState, useEffect, useRef } from 'react';

interface LayoutProps {
  children: React.ReactNode;
  onGoHome: () => void;
}

export const Layout: React.FC<LayoutProps> = ({ children, onGoHome }) => {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCurrentUser(localStorage.getItem('mapsync_user'));

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    };

    if (showUserMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showUserMenu]);

  const handleLogout = () => {
    localStorage.removeItem('mapsync_user');
    localStorage.removeItem('mapsync_user_role');
    window.location.reload();
  };

  const initials = currentUser ? currentUser.substring(0, 2).toUpperCase() : 'AD';

  return (
    <div className="min-h-screen flex flex-col relative bg-slate-50 text-slate-900 font-sans selection:bg-brand-500 selection:text-white">
      {/* Stunning Premium Background Mesh */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-brand-400/20 rounded-full blur-[120px] mix-blend-multiply opacity-70 animate-blob"></div>
        <div className="absolute top-[20%] right-[-10%] w-[35%] h-[45%] bg-indigo-400/20 rounded-full blur-[120px] mix-blend-multiply opacity-70 animate-blob animation-delay-2000"></div>
        <div className="absolute bottom-[-20%] left-[20%] w-[50%] h-[50%] bg-blue-300/20 rounded-full blur-[120px] mix-blend-multiply opacity-70 animate-blob animation-delay-4000"></div>
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03] mix-blend-overlay"></div>
      </div>

      <div className="relative z-10 flex flex-col min-h-screen">
        <header className="sticky top-0 z-50 transition-all duration-300 backdrop-blur-xl bg-white/70 border-b border-white/20 shadow-[0_4px_30px_rgba(0,0,0,0.03)] px-8 py-5 flex items-center justify-between">
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
              <h1 className="text-xl font-medium bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-blue-600 tracking-tighter uppercase leading-none">
                MapSync AI
              </h1>
              <span className="text-[8px] font-medium text-slate-300 uppercase tracking-widest mt-1">Intelligent Relational Mapper</span>
            </div>
          </div>
          <nav className="flex items-center gap-8 relative">
            <button
              onClick={onGoHome}
              className="text-[10px] font-medium text-slate-400 uppercase tracking-widest hover:text-blue-600 transition-colors"
            >
              Dashboard
            </button>
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="h-10 w-10 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 font-medium text-xs shadow-sm hover:border-blue-400 hover:text-blue-600 transition-all focus:outline-none"
              >
                {initials}
              </button>

              {showUserMenu && (
                <div className="absolute right-0 mt-3 w-48 bg-white rounded-2xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.1)] border border-slate-100 overflow-hidden animate-in slide-in-from-top-2 duration-200 z-50">
                  <div className="p-4 border-b border-slate-50 bg-slate-50/50">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Signed in as</p>
                    <p className="text-xs font-medium text-slate-700 truncate mt-1">{currentUser}</p>
                  </div>
                  <div className="p-2">
                    <button
                      onClick={handleLogout}
                      className="w-full text-left px-3 py-2.5 rounded-xl text-xs font-medium text-rose-500 hover:bg-rose-50 transition-colors flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                      </svg>
                      Log Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </nav>
        </header>
        <main className="flex-1 max-w-[1600px] mx-auto w-full p-4 md:p-12">
          {children}
        </main>
        <footer className="bg-white border-t border-slate-200 py-10 text-center">
          <p className="text-slate-300 text-[9px] font-medium uppercase tracking-[0.4em]">
            &copy; 2024 MapSync Enterprise Transformation Engine &bull; System v1.0.8
          </p>
        </footer>
      </div>
    </div>
  );
};


import React, { useState } from 'react';

interface LoginProps {
    onLogin: (email: string, role: string) => void;
}

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [mode, setMode] = useState<'login' | 'signup'>('login');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email.trim() || !email.includes('@') || !password.trim()) return;

        setIsSubmitting(true);
        setErrorMsg('');

        try {
            const endpoint = mode === 'signup' ? '/api/signup' : '/api/login';
            const response = await fetch(`http://localhost:3005${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email.trim(), password })
            });
            const data = await response.json();

            if (response.ok) {
                if (mode === 'signup') {
                    setMode('login');
                    setPassword('');
                    setErrorMsg('Account created! Please log in.');
                } else {
                    onLogin(email.trim(), data.role);
                }
            } else {
                setErrorMsg(data.error || 'Authentication failed');
            }
        } catch (err) {
            setErrorMsg('Network error connecting to verification server.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#0A0F1C] flex items-center justify-center p-4 relative overflow-hidden font-sans">

            {/* Background Decorative Elements */}
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/20 blur-[120px] rounded-full mix-blend-screen pointer-events-none"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-600/20 blur-[120px] rounded-full mix-blend-screen pointer-events-none"></div>

            <div className="w-full max-w-md relative z-10">
                {/* Logo / Brand */}
                <div className="flex flex-col items-center mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                    <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-emerald-400 rounded-2xl flex items-center justify-center shadow-xl shadow-blue-500/20 mb-6 border border-white/10">
                        <span className="text-3xl font-bold text-white drop-shadow-md">M</span>
                    </div>
                    <h1 className="text-3xl font-bold tracking-tight text-white mb-2">MapSync</h1>
                    <p className="text-slate-400 text-sm font-medium tracking-wide">Intelligent Data Mapping Hub</p>
                </div>

                {/* Login Card */}
                <div className="bg-white/5 backdrop-blur-xl border border-white/10 p-8 rounded-[2rem] shadow-2xl animate-in zoom-in-95 duration-500 delay-150 fill-mode-both">

                    <div className="flex justify-center gap-4 mb-8">
                        <button
                            type="button"
                            onClick={() => { setMode('login'); setErrorMsg(''); }}
                            className={`px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-full transition-all ${mode === 'login' ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/25' : 'text-slate-400 hover:text-white'}`}
                        >
                            Log In
                        </button>
                        <button
                            type="button"
                            onClick={() => { setMode('signup'); setErrorMsg(''); }}
                            className={`px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-full transition-all ${mode === 'signup' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25' : 'text-slate-400 hover:text-white'}`}
                        >
                            Sign Up
                        </button>
                    </div>

                    {errorMsg && (
                        <div className={`p-4 rounded-xl mb-6 text-xs text-center border ${errorMsg.includes('created') ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'}`}>
                            {errorMsg}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div>
                            <label htmlFor="email" className="block text-[10px] font-semibold text-slate-300 uppercase tracking-[0.2em] mb-3">
                                Work Email Address
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <svg className="h-5 w-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                    </svg>
                                </div>
                                <input
                                    type="email"
                                    id="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full pl-12 pr-4 py-3.5 bg-black/20 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all font-medium"
                                    placeholder="name@company.com"
                                    required
                                    autoComplete="email"
                                />
                            </div>
                        </div>

                        <div>
                            <label htmlFor="password" className="block text-[10px] font-semibold text-slate-300 uppercase tracking-[0.2em] mb-3">
                                Password
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <svg className="h-5 w-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                    </svg>
                                </div>
                                <input
                                    type="password"
                                    id="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full pl-12 pr-4 py-3.5 bg-black/20 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all font-medium"
                                    placeholder="••••••••"
                                    required
                                    autoComplete="current-password"
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={isSubmitting || !email.trim() || !email.includes('@') || !password.trim()}
                            className="w-full py-4 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-semibold rounded-xl shadow-lg shadow-blue-500/25 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 group"
                        >
                            {isSubmitting ? (
                                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                            ) : (
                                <>
                                    {mode === 'login' ? 'Access Workspaces' : 'Create Account'}
                                    <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                    </svg>
                                </>
                            )}
                        </button>
                    </form>

                    <div className="mt-8 text-center border-t border-white/5 pt-6">
                        <p className="text-[10px] text-slate-500 uppercase tracking-widest leading-relaxed">
                            Secured via Enterprise Directory.<br />Credentials verified exclusively through central authority.
                        </p>
                    </div>
                </div>
            </div>
        </div >
    );
};

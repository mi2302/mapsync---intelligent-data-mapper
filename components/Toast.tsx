
import React from 'react';

interface ToastProps {
  message: string;
  type: 'success' | 'error';
}

export const Toast: React.FC<ToastProps> = ({ message, type }) => {
  const isSuccess = type === 'success';
  return (
    <div className="fixed bottom-10 right-10 z-[100] animate-in slide-in-from-right-10 fade-in duration-300">
      <div className={`flex items-center gap-4 px-6 py-4 rounded-3xl shadow-2xl border ${isSuccess ? 'bg-white border-emerald-100' : 'bg-rose-600 border-rose-500'}`}>
        <div className={`w-8 h-8 rounded-2xl flex items-center justify-center ${isSuccess ? 'bg-emerald-500 text-white' : 'bg-white/20 text-white'}`}>
          {isSuccess ? (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
          ) : (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
          )}
        </div>
        <div>
          <p className={`text-[10px] font-black uppercase tracking-widest ${isSuccess ? 'text-slate-900' : 'text-white'}`}>
            {isSuccess ? 'System Sync' : 'System Error'}
          </p>
          <p className={`text-[11px] font-bold ${isSuccess ? 'text-slate-500' : 'text-rose-100'}`}>
            {message}
          </p>
        </div>
        {isSuccess && (
          <div className="ml-4 w-12 h-1 bg-slate-100 rounded-full overflow-hidden">
            <div className="bg-emerald-500 h-full animate-[shrink_4000ms_linear_forwards]" style={{ transformOrigin: 'left' }} />
          </div>
        )}
      </div>
      <style>{`
        @keyframes shrink {
          from { transform: scaleX(1); }
          to { transform: scaleX(0); }
        }
      `}</style>
    </div>
  );
};

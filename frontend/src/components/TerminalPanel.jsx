import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal } from 'lucide-react';

export default function TerminalPanel({ logs, pipelineState }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, pipelineState]);

  return (
    <div className="flex flex-col h-full bg-[#050505]">
      <div className="px-4 py-2 border-b border-white/5 bg-black/50 flex items-center gap-2 relative z-10">
        <Terminal size={14} className="text-gray-500" />
        <span className="text-[10px] uppercase tracking-widest text-gray-500 font-mono">Execution Logs</span>
        {pipelineState === 'running' && (
          <span className="ml-auto w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
        )}
      </div>

      <div 
        ref={scrollRef}
        className="flex-1 p-4 overflow-y-auto font-mono text-[11px] leading-relaxed select-text space-y-1"
      >
        <AnimatePresence>
          {logs.map((log) => {
            const depth = log.depth || 0;
            return (
              <motion.div
                key={log.id}
                initial={{ opacity: 0, x: -5 }}
                animate={{ opacity: 1, x: 0 }}
                className={`flex flex-col ${
                  log.type === 'error' ? 'text-red-400' :
                  log.type === 'success' ? 'text-green-400 font-medium' :
                  log.type === 'system' ? 'text-[#888]' :
                  'text-[#ccc]'
                }`}
              >
                <div className="flex gap-3" style={{ marginLeft: `${depth * 16}px` }}>
                  <span className="opacity-30 select-none flex-shrink-0 mt-[2px] text-[9px]">
                    {depth > 0 ? '↳' : '❯'}
                  </span>
                  <span className="break-all">{log.msg}</span>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
        
        {pipelineState === 'running' && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            className="flex items-center gap-3 text-gray-400 mt-2 ml-1"
          >
            <span className="w-[6px] h-3 bg-white/50 animate-pulse" />
          </motion.div>
        )}
        {pipelineState === 'idle' && logs.length === 0 && (
           <div className="text-gray-600/50 italic py-2">Awaiting target system...</div>
        )}
      </div>
    </div>
  );
}

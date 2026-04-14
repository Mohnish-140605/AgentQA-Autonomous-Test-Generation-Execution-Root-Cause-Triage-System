import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Cpu, Terminal, Shield, PlayCircle, Eye } from 'lucide-react';

const ICONS = {
  'GitHub Fetch': Terminal,
  'Code Analyst': Eye,
  'Test Writer': Cpu,
  'Executor': PlayCircle,
  'Triage': Shield,
  'Reporter': Terminal
};

export default function AgentGraphView({ steps }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (!scrollRef.current) return;
    const activeIndex = steps.findIndex(s => s.status === 'running');
    if (activeIndex > 0) {
      const nodeWidth = 200; 
      scrollRef.current.scrollTo({
        left: activeIndex * nodeWidth,
        behavior: 'smooth'
      });
    }
  }, [steps]);

  return (
    <div className="w-full h-full relative flex items-center bg-black overflow-hidden">
      
      {/* Vercel subtle dot grid */}
      <div className="absolute inset-0 z-0 opacity-20" style={{ backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)', backgroundSize: '24px 24px' }} />

      <div 
        ref={scrollRef}
        className="relative z-10 flex items-center justify-start gap-12 w-full h-full px-16 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {steps.map((s, idx) => {
          const isIdle = s.status === 'idle' || s.status === 'pending';
          const isRunning = s.status === 'running';
          const isDone = s.status === 'done';
          const isErr = s.status === 'error';
          const Icon = ICONS[s.step] || Cpu;

          return (
            <div key={s.step} className="flex relative items-center shrink-0">
              
              {/* Path connector */}
              {idx > 0 && (
                <div className="absolute right-full top-1/2 -mt-[0.5px] w-12 h-[1px] bg-white/10 z-0">
                  {/* Energy Flow Animation */}
                  {(isDone || isRunning) && (
                    <motion.div 
                      className="h-full bg-white shadow-[0_0_8px_#ffffff]"
                      initial={{ width: 0 }}
                      animate={{ width: '100%' }}
                      transition={{ duration: 0.3 }}
                    />
                  )}
                </div>
              )}

              {/* Node Card - Linear style (flat, crisp) */}
              <motion.div 
                className={`relative z-10 flex flex-col items-center justify-center w-36 h-28 rounded-lg border transition-all duration-300
                  ${isRunning ? 'bg-[#111] border-white/60 shadow-[0_4px_12px_rgba(255,255,255,0.05)]' : 
                    isDone ? 'bg-[#0a0a0a] border-white/10' : 
                    isErr ? 'bg-[#1a0505] border-red-500/50' : 
                    'bg-black border-white/5 opacity-50'}`}
                animate={{ scale: isRunning ? 1.05 : 1 }}
              >
                <Icon size={20} className={`mb-3 ${isRunning ? 'text-white' : isDone ? 'text-gray-400' : isErr ? 'text-red-400' : 'text-gray-600'}`} />
                <span className={`font-mono text-[10px] text-center tracking-wide px-2 leading-tight ${isRunning ? 'text-white font-medium' : isDone ? 'text-gray-400' : isErr ? 'text-red-400' : 'text-gray-600'}`}>
                  {s.step}
                </span>

                <AnimatePresence>
                  {isRunning && (
                    <motion.div 
                      key="running-dot"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute top-2 right-2 flex space-x-1"
                    >
                      <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>

            </div>
          );
        })}
      </div>
    </div>
  );
}

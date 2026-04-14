import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain } from 'lucide-react';

export default function ThoughtStream({ activeThought }) {
  if (!activeThought) return <div className="h-[28px]" />;

  return (
    <div className="flex items-center justify-end gap-2 text-right">
      <AnimatePresence mode="wait">
        <motion.span 
          key={activeThought}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -5 }}
          className="text-xs font-mono text-gray-500 italic max-w-[350px] truncate"
        >
          "{activeThought}"
        </motion.span>
      </AnimatePresence>
      <Brain size={14} className="text-gray-600 shrink-0" />
    </div>
  );
}

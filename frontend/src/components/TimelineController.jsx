import React from 'react';
import { Play, Pause, SkipBack, SkipForward } from 'lucide-react';

export default function TimelineController({ history, scrubberIndex, setScrubberIndex, isPlaying, setIsPlaying }) {
  
  if (!history || history.length === 0) return null;
  const maxIdx = history.length - 1;
  const isComplete = scrubberIndex >= maxIdx;

  const handleTogglePlay = () => {
    if (isComplete) setScrubberIndex(0);
    setIsPlaying(!isPlaying);
  };

  return (
    <div className="flex flex-col items-center w-full max-w-3xl mx-auto backdrop-blur-md bg-black/80 border border-white/10 shadow-2xl rounded-2xl p-4 transition-all hover:bg-black hover:border-white/20">
      
      {/* Time Track */}
      <div className="w-full flex items-center gap-4 mb-4">
        <span className="text-xs font-mono text-gray-500 w-8 text-right">
          {scrubberIndex}
        </span>
        
        <input 
          type="range" 
          min="0" 
          max={maxIdx} 
          value={scrubberIndex}
          onChange={(e) => {
            setIsPlaying(false);
            setScrubberIndex(parseInt(e.target.value));
          }}
          className="timeline-slider flex-1"
          style={{
            background: `linear-gradient(to right, #fff ${(scrubberIndex/maxIdx)*100}%, #333 ${(scrubberIndex/maxIdx)*100}%)`
          }}
        />
        
        <span className="text-xs font-mono text-gray-500 w-8 text-left">
          {maxIdx}
        </span>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-6">
        <button 
          onClick={() => { setIsPlaying(false); setScrubberIndex(Math.max(0, scrubberIndex - 1)); }}
          className="text-gray-500 hover:text-white transition-colors"
          disabled={scrubberIndex === 0}
        >
          <SkipBack size={18} fill="currentColor" />
        </button>
        
        <button 
          onClick={handleTogglePlay}
          className="w-10 h-10 flex items-center justify-center bg-white text-black rounded-full hover:scale-105 active:scale-95 transition-all shadow-lg"
        >
          {isPlaying && !isComplete ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-1" />}
        </button>

        <button 
          onClick={() => { setIsPlaying(false); setScrubberIndex(Math.min(maxIdx, scrubberIndex + 1)); }}
          className="text-gray-500 hover:text-white transition-colors"
          disabled={isComplete}
        >
          <SkipForward size={18} fill="currentColor" />
        </button>
      </div>

    </div>
  );
}

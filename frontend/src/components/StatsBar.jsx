import React from 'react';
import { ShieldAlert, FileCode2, FlaskConical, Target } from 'lucide-react';

export default function StatsBar({ stats }) {
  if (!stats) return null;

  return (
    <div className="flex gap-4 items-center">
      <StatItem icon={<FileCode2 size={14} />} label="FILES" value={stats.files_analyzed} />
      <StatItem icon={<FlaskConical size={14} />} label="TESTS" value={stats.tests_generated} />
      <StatItem icon={<Target size={14} />} label="PASS" value={stats.tests_passed} color="text-green-500" />
      <StatItem icon={<ShieldAlert size={14} />} label="FAIL" value={stats.tests_failed} color="text-red-500" />
    </div>
  );
}

function StatItem({ icon, label, value, color = "text-gray-200" }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-[#111] border border-white/10 rounded-md">
      <span className="text-gray-500">{icon}</span>
      <span className="text-[10px] font-mono text-gray-500 tracking-wider uppercase">{label}</span>
      <span className={`text-xs font-mono font-semibold ${color}`}>{value || 0}</span>
    </div>
  );
}

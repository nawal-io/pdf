import React from 'react';
import { FileText, ShieldCheck, Minimize2, Layers, Image as ImageIcon, LayoutGrid } from 'lucide-react';
import type { ActiveTab } from '../types';

interface HeaderProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
}

export const Header: React.FC<HeaderProps> = ({ activeTab, onSelectTab }) => {
  const tabs = [
    {
      id: 'compress' as ActiveTab,
      label: 'Compress PDF',
      icon: Minimize2,
    },
    {
      id: 'merge-split' as ActiveTab,
      label: 'Merge & Split',
      icon: Layers,
    },
    {
      id: 'image-pdf' as ActiveTab,
      label: 'Image ↔ PDF',
      icon: ImageIcon,
    },
    {
      id: 'organize' as ActiveTab,
      label: 'Organize & Rotate',
      icon: LayoutGrid,
    },
  ];

  return (
    <nav className="flex h-14 items-center justify-between border-b border-zinc-800 bg-zinc-950 px-4 sm:px-6 sticky top-0 z-40">
      {/* Brand & Client-side status badge */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold tracking-tight text-zinc-100">PDF Toolkit</span>
        <div className="flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900 px-2 py-0.5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
          <span className="text-[10px] font-medium text-zinc-400 uppercase tracking-widest">Client-side</span>
        </div>
      </div>

      {/* Navigation tabs with geometric underline indicator */}
      <div className="flex items-center gap-4 sm:gap-8 overflow-x-auto scrollbar-none h-full">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              id={`tab-${tab.id}`}
              onClick={() => onSelectTab(tab.id)}
              className={`h-full flex items-center text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                isActive
                  ? 'relative text-zinc-100 after:absolute after:bottom-0 after:left-0 after:h-px after:w-full after:bg-zinc-100'
                  : 'text-zinc-400 hover:text-zinc-100'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Geometric Utility Tool Icon */}
      <div className="flex items-center gap-3">
        <div
          className="h-8 w-8 rounded bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 hover:text-zinc-200 transition-colors"
          title="Privacy Secured: In-browser execution"
        >
          <ShieldCheck className="w-4 h-4 text-zinc-400" />
        </div>
      </div>
    </nav>
  );
};

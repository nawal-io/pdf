import React, { useState } from 'react';
import { Header } from './components/Header';
import { CompressTab } from './components/CompressTab';
import { MergeSplitTab } from './components/MergeSplitTab';
import { ImagePdfTab } from './components/ImagePdfTab';
import { OrganizeTab } from './components/OrganizeTab';
import { ToastContainer } from './components/Toast';
import type { ActiveTab, ToastMessage } from './types';
import { ShieldCheck, Cpu, Lock } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('compress');
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = (type: 'success' | 'error' | 'info', title: string, message?: string) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    setToasts((prev) => [...prev, { id, type, title, message }]);
  };

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <div className="min-h-screen flex flex-col bg-zinc-950 text-zinc-100 selection:bg-zinc-800 font-sans antialiased">
      {/* Top Navigation */}
      <Header activeTab={activeTab} onSelectTab={setActiveTab} />

      {/* Main Workspace with Geometric Balance boundary */}
      <main className="flex-1 w-full max-w-7xl mx-auto flex flex-col bg-zinc-950 border-x border-zinc-800/60 lg:border-zinc-800">
        {activeTab === 'compress' && <CompressTab onNotify={addToast} />}
        {activeTab === 'merge-split' && <MergeSplitTab onNotify={addToast} />}
        {activeTab === 'image-pdf' && <ImagePdfTab onNotify={addToast} />}
        {activeTab === 'organize' && <OrganizeTab onNotify={addToast} />}
      </main>

      {/* Geometric Balance Protocol Footer */}
      <footer className="flex h-10 items-center justify-between border-t border-zinc-800 bg-zinc-950 px-4 sm:px-6 text-[10px] uppercase tracking-widest text-zinc-500">
        <div className="hidden sm:block">Build 2.4.0-stable</div>
        <div className="text-zinc-400">Privacy Secured: No files leave your browser.</div>
        <div className="hidden sm:block">Geometric Balance Protocol</div>
      </footer>

      {/* Global Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

import React, { useState } from 'react';
import {
  Layers,
  Scissors,
  ArrowUp,
  ArrowDown,
  Trash2,
  Download,
  Plus,
  FileCheck,
  Zap,
  FolderArchive,
  CheckSquare,
  Square,
} from 'lucide-react';
import { DropZone } from './DropZone';
import {
  formatBytes,
  getPdfInfo,
  renderPageThumbnail,
  mergePdfs,
  splitPdf,
  splitPdfToZip,
  parsePageRange,
  downloadBlob,
} from '../lib/pdfEngine';
import type { MergeFileItem, SplitModeType } from '../types';

interface MergeSplitTabProps {
  onNotify: (type: 'success' | 'error' | 'info', title: string, message?: string) => void;
}

export const MergeSplitTab: React.FC<MergeSplitTabProps> = ({ onNotify }) => {
  const [subMode, setSubMode] = useState<'merge' | 'split'>('merge');

  // MERGE STATE
  const [mergeFiles, setMergeFiles] = useState<MergeFileItem[]>([]);
  const [isMerging, setIsMerging] = useState(false);
  const [mergeProgress, setMergeProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });

  // SPLIT STATE
  const [splitFile, setSplitFile] = useState<File | null>(null);
  const [splitBuffer, setSplitBuffer] = useState<ArrayBuffer | null>(null);
  const [splitPageCount, setSplitPageCount] = useState<number>(0);
  const [splitThumbnail, setSplitThumbnail] = useState<string | null>(null);
  const [splitModeType, setSplitModeType] = useState<SplitModeType>('ranges');
  const [pageRangeText, setPageRangeText] = useState<string>('1-2');
  const [selectedPagesSet, setSelectedPagesSet] = useState<Set<number>>(new Set([0, 1]));
  const [isSplitting, setIsSplitting] = useState(false);
  const [splitProgress, setSplitProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });

  // ----------------- MERGE LOGIC -----------------
  const handleAddMergeFiles = async (files: File[]) => {
    const pdfFiles = files.filter(
      (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    );

    if (pdfFiles.length === 0) {
      onNotify('error', 'Invalid files', 'Please drop PDF files.');
      return;
    }

    const newItems: MergeFileItem[] = [];

    for (const file of pdfFiles) {
      try {
        const buf = await file.arrayBuffer();
        const info = await getPdfInfo(buf);
        const preview = await renderPageThumbnail(buf, 1, 160).catch(() => undefined);

        newItems.push({
          id: `merge-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          file,
          name: file.name,
          size: file.size,
          pageCount: info.pageCount,
          previewUrl: preview,
        });
      } catch (err) {
        console.error('Failed to load file for merge:', err);
        onNotify('error', `Failed to read ${file.name}`, 'File may be encrypted or corrupted.');
      }
    }

    if (newItems.length > 0) {
      setMergeFiles((prev) => [...prev, ...newItems]);
      onNotify('info', `Added ${newItems.length} file${newItems.length > 1 ? 's' : ''}`);
    }
  };

  const moveMergeItem = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= mergeFiles.length) return;

    setMergeFiles((prev) => {
      const copy = [...prev];
      const temp = copy[index];
      copy[index] = copy[targetIndex];
      copy[targetIndex] = temp;
      return copy;
    });
  };

  const removeMergeItem = (id: string) => {
    setMergeFiles((prev) => prev.filter((item) => item.id !== id));
  };

  const clearMergeFiles = () => {
    setMergeFiles([]);
  };

  const handleExecuteMerge = async () => {
    if (mergeFiles.length < 2) {
      onNotify('error', 'Need at least 2 files', 'Please add 2 or more PDF files to merge.');
      return;
    }

    setIsMerging(true);
    setMergeProgress({ current: 0, total: mergeFiles.length });

    try {
      const buffers = await Promise.all(mergeFiles.map((f) => f.file.arrayBuffer()));
      const mergedBytes = await mergePdfs(buffers, (current, total) => {
        setMergeProgress({ current, total });
      });

      const firstBaseName = mergeFiles[0].name.replace(/\.pdf$/i, '');
      const downloadName = `${firstBaseName}_merged.pdf`;
      downloadBlob(mergedBytes, downloadName);
      onNotify('success', 'PDFs Merged Successfully', `Downloaded as ${downloadName}`);
    } catch (err) {
      console.error('Merge error:', err);
      onNotify('error', 'Merge Failed', 'Could not merge documents.');
    } finally {
      setIsMerging(false);
    }
  };

  // ----------------- SPLIT LOGIC -----------------
  const handleSelectSplitFile = async (file: File) => {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      onNotify('error', 'Invalid file', 'Please choose a PDF document.');
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      const info = await getPdfInfo(buffer);
      const thumbnail = await renderPageThumbnail(buffer, 1, 220);

      setSplitFile(file);
      setSplitBuffer(buffer);
      setSplitPageCount(info.pageCount);
      setSplitThumbnail(thumbnail);

      // Default range
      const defEnd = Math.min(2, info.pageCount);
      setPageRangeText(`1-${defEnd}`);
      const initSet = new Set<number>();
      for (let i = 0; i < defEnd; i++) initSet.add(i);
      setSelectedPagesSet(initSet);

      onNotify('info', 'File loaded for splitting', `${file.name} (${info.pageCount} pages)`);
    } catch (err) {
      console.error('Split load error:', err);
      onNotify('error', 'Could not open PDF', 'File might be invalid or protected.');
    }
  };

  const handleRangeChange = (text: string) => {
    setPageRangeText(text);
    if (splitPageCount > 0) {
      const indices = parsePageRange(text, splitPageCount);
      setSelectedPagesSet(new Set(indices));
    }
  };

  const togglePageSelection = (pageIndex: number) => {
    const copy = new Set(selectedPagesSet);
    if (copy.has(pageIndex)) {
      copy.delete(pageIndex);
    } else {
      copy.add(pageIndex);
    }
    setSelectedPagesSet(copy);

    // Update text representation
    const sorted = Array.from(copy) as number[];
    sorted.sort((a: number, b: number) => a - b);
    if (sorted.length === 0) {
      setPageRangeText('');
    } else {
      setPageRangeText(sorted.map((i: number) => i + 1).join(', '));
    }
  };

  const handleExecuteSplit = async () => {
    if (!splitBuffer || !splitFile) return;

    setIsSplitting(true);

    try {
      if (splitModeType === 'individual') {
        // Extract all pages into a ZIP
        setSplitProgress({ current: 0, total: splitPageCount });
        const zipBlob = await splitPdfToZip(splitBuffer, splitFile.name, (curr, tot) => {
          setSplitProgress({ current: curr, total: tot });
        });

        const zipName = `${splitFile.name.replace(/\.pdf$/i, '')}_extracted_pages.zip`;
        downloadBlob(zipBlob, zipName, 'application/zip');
        onNotify('success', 'Pages Extracted', `Downloaded ${splitPageCount} individual pages as ZIP.`);
      } else {
        // Extract selected pages into one PDF
        const targetIndices = (Array.from(selectedPagesSet) as number[]).sort((a: number, b: number) => a - b);

        if (targetIndices.length === 0) {
          onNotify('error', 'No pages selected', 'Please specify or select at least one page to extract.');
          setIsSplitting(false);
          return;
        }

        const splitBytes = await splitPdf(splitBuffer, targetIndices);
        const outName = `${splitFile.name.replace(/\.pdf$/i, '')}_extracted.pdf`;
        downloadBlob(splitBytes, outName);
        onNotify('success', 'PDF Extracted', `Extracted ${targetIndices.length} pages to ${outName}`);
      }
    } catch (err) {
      console.error('Split error:', err);
      onNotify('error', 'Split Failed', 'Could not split document.');
    } finally {
      setIsSplitting(false);
    }
  };

  const totalMergePages = mergeFiles.reduce((acc, curr) => acc + curr.pageCount, 0);
  const totalMergeBytes = mergeFiles.reduce((acc, curr) => acc + curr.size, 0);

  return (
    <div className="p-6 sm:p-8 lg:p-10 bg-zinc-950 flex flex-col space-y-8 min-h-[calc(100vh-7rem)]">
      {/* Header & Sub-mode switch */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-6">
        <div>
          <h2 className="text-xl font-medium mb-1 text-zinc-100">Merge & Split PDFs</h2>
          <p className="text-sm text-zinc-500">
            Combine multiple PDF files in sequence or extract precise page ranges.
          </p>
        </div>

        {/* Geometric Balance Sub-mode Segmented Toggle */}
        <div className="inline-flex rounded-lg p-1 bg-zinc-900 border border-zinc-800 self-start sm:self-auto">
          <button
            id="submode-merge-btn"
            onClick={() => setSubMode('merge')}
            className={`px-4 py-1.5 rounded text-xs font-semibold transition-all cursor-pointer flex items-center gap-2 ${
              subMode === 'merge'
                ? 'bg-zinc-100 text-zinc-950'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Merge Documents
          </button>
          <button
            id="submode-split-btn"
            onClick={() => setSubMode('split')}
            className={`px-4 py-1.5 rounded text-xs font-semibold transition-all cursor-pointer flex items-center gap-2 ${
              subMode === 'split'
                ? 'bg-zinc-100 text-zinc-950'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Scissors className="w-3.5 h-3.5" />
            Split Single PDF
          </button>
        </div>
      </div>

      {/* ------------------- MERGE SECTION ------------------- */}
      {subMode === 'merge' && (
        <div className="space-y-6">
          {mergeFiles.length === 0 ? (
            <DropZone
              id="merge-dropzone"
              multiple
              title="Drop multiple PDFs here to merge"
              description="Drop or select 2 or more PDF documents. Files are processed locally."
              onFilesSelected={handleAddMergeFiles}
            />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left: Reorderable List */}
              <div className="lg:col-span-8 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Document Order ({mergeFiles.length} files)
                  </span>
                  <div className="flex items-center gap-2">
                    <label className="cursor-pointer inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-zinc-300 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-md transition-colors">
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add More</span>
                      <input
                        type="file"
                        accept="application/pdf"
                        multiple
                        className="hidden"
                        onChange={(e) => e.target.files && handleAddMergeFiles(Array.from(e.target.files))}
                      />
                    </label>
                    <button
                      onClick={clearMergeFiles}
                      className="px-2.5 py-1 text-xs font-medium text-zinc-400 hover:text-rose-400 hover:bg-rose-950/30 rounded-md transition-colors"
                    >
                      Clear All
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  {mergeFiles.map((item, index) => (
                    <div
                      key={item.id}
                      className="p-3 rounded-lg border border-zinc-800 bg-zinc-900/50 flex items-center justify-between gap-3 hover:border-zinc-700 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="w-6 h-6 rounded bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs font-mono font-medium flex items-center justify-center shrink-0">
                          {index + 1}
                        </span>

                        {item.previewUrl ? (
                          <img
                            src={item.previewUrl}
                            alt=""
                            className="w-8 h-11 object-contain rounded border border-zinc-700/80 bg-zinc-950 shrink-0"
                          />
                        ) : (
                          <div className="w-8 h-11 rounded border border-zinc-800 bg-zinc-950 flex items-center justify-center shrink-0">
                            <FileCheck className="w-4 h-4 text-zinc-600" />
                          </div>
                        )}

                        <div className="min-w-0">
                          <p className="text-xs font-medium text-zinc-200 truncate">{item.name}</p>
                          <div className="flex items-center gap-2 mt-0.5 text-[11px] text-zinc-500 font-mono">
                            <span>{formatBytes(item.size)}</span>
                            <span>•</span>
                            <span>{item.pageCount} pages</span>
                          </div>
                        </div>
                      </div>

                      {/* Controls */}
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => moveMergeItem(index, 'up')}
                          disabled={index === 0}
                          className="p-1 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded disabled:opacity-30 disabled:hover:bg-transparent"
                          title="Move up"
                        >
                          <ArrowUp className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => moveMergeItem(index, 'down')}
                          disabled={index === mergeFiles.length - 1}
                          className="p-1 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded disabled:opacity-30 disabled:hover:bg-transparent"
                          title="Move down"
                        >
                          <ArrowDown className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => removeMergeItem(item.id)}
                          className="p-1 text-zinc-500 hover:text-rose-400 hover:bg-rose-950/30 rounded"
                          title="Remove file"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right: Summary & Merge Button */}
              <div className="lg:col-span-4 space-y-4">
                <div className="rounded-lg bg-zinc-900 p-6 border border-zinc-800 sticky top-20 space-y-6">
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                      Merge Summary
                    </label>
                    <h3 className="text-sm font-medium text-zinc-200">
                      Consolidated Output
                    </h3>
                  </div>

                  <div className="space-y-3 text-xs border-y border-zinc-800 py-4">
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Total Documents</span>
                      <span className="font-mono text-zinc-200 font-medium">{mergeFiles.length} files</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Combined Pages</span>
                      <span className="font-mono text-zinc-200 font-medium">{totalMergePages} pages</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Estimated File Size</span>
                      <span className="font-mono text-zinc-200 font-medium">{formatBytes(totalMergeBytes)}</span>
                    </div>
                  </div>

                  <button
                    id="execute-merge-button"
                    onClick={handleExecuteMerge}
                    disabled={isMerging || mergeFiles.length < 2}
                    className="w-full bg-zinc-100 py-3 text-sm font-bold text-zinc-950 transition-all hover:bg-white active:scale-[0.98] rounded flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isMerging ? (
                      <>
                        <Zap className="w-4 h-4 animate-spin" />
                        <span>Merging ({mergeProgress.current}/{mergeProgress.total})...</span>
                      </>
                    ) : (
                      <>
                        <span>Merge & Download PDF</span>
                        <Download className="w-4 h-4" strokeWidth={2.5} />
                      </>
                    )}
                  </button>

                  <p className="text-[11px] text-zinc-500 text-center leading-relaxed">
                    Pages will be merged sequentially in the order shown on the left.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ------------------- SPLIT SECTION ------------------- */}
      {subMode === 'split' && (
        <div className="space-y-6">
          {!splitFile ? (
            <DropZone
              id="split-dropzone"
              title="Drop single PDF to split"
              description="Extract selected pages, custom ranges (e.g. 1-3, 5), or split into individual single-page PDFs."
              onFilesSelected={(files) => files[0] && handleSelectSplitFile(files[0])}
            />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column: Configuration */}
              <div className="lg:col-span-7 space-y-6">
                {/* File Header Card */}
                <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/50 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    {splitThumbnail ? (
                      <img
                        src={splitThumbnail}
                        alt=""
                        className="w-12 h-16 rounded border border-zinc-700/80 bg-zinc-950 object-contain shrink-0"
                      />
                    ) : (
                      <div className="w-12 h-16 rounded border border-zinc-800 bg-zinc-950 flex items-center justify-center shrink-0">
                        <FileCheck className="w-6 h-6 text-zinc-500" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-zinc-200 truncate">{splitFile.name}</h3>
                      <div className="flex items-center gap-2 mt-1 text-xs font-mono text-zinc-400">
                        <span>{formatBytes(splitFile.size)}</span>
                        <span>•</span>
                        <span>{splitPageCount} total pages</span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setSplitFile(null);
                      setSplitBuffer(null);
                    }}
                    className="text-xs text-zinc-400 hover:text-zinc-200 px-2.5 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700/80 transition-colors shrink-0"
                  >
                    Change PDF
                  </button>
                </div>

                {/* Split Mode Selector */}
                <div className="p-5 rounded-xl border border-zinc-800 bg-zinc-900/40 space-y-5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400 block">
                    Split Extraction Mode
                  </label>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setSplitModeType('ranges')}
                      className={`p-3 rounded-lg border text-left transition-all ${
                        splitModeType === 'ranges'
                          ? 'border-zinc-500 bg-zinc-800/80 ring-1 ring-zinc-500/50'
                          : 'border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800/40 text-zinc-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 font-medium text-xs text-zinc-100">
                        <Scissors className="w-3.5 h-3.5" />
                        <span>Selected Page Range</span>
                      </div>
                      <p className="text-[11px] text-zinc-400 mt-1">
                        Extract specific pages (e.g. 1-3, 5) into one combined PDF.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSplitModeType('individual')}
                      className={`p-3 rounded-lg border text-left transition-all ${
                        splitModeType === 'individual'
                          ? 'border-zinc-500 bg-zinc-800/80 ring-1 ring-zinc-500/50'
                          : 'border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800/40 text-zinc-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 font-medium text-xs text-zinc-100">
                        <FolderArchive className="w-3.5 h-3.5" />
                        <span>All Pages as ZIP</span>
                      </div>
                      <p className="text-[11px] text-zinc-400 mt-1">
                        Extract every page into individual 1-page PDFs.
                      </p>
                    </button>
                  </div>

                  {/* Range Input Section */}
                  {splitModeType === 'ranges' && (
                    <div className="space-y-4 pt-2 border-t border-zinc-800">
                      <div>
                        <div className="flex items-center justify-between text-xs mb-1.5">
                          <label htmlFor="range-input" className="font-medium text-zinc-300">
                            Page Selection (e.g. 1-3, 5, 8-10)
                          </label>
                          <span className="font-mono text-zinc-400 text-[11px]">
                            {selectedPagesSet.size} of {splitPageCount} selected
                          </span>
                        </div>
                        <input
                          id="range-input"
                          type="text"
                          value={pageRangeText}
                          onChange={(e) => handleRangeChange(e.target.value)}
                          placeholder="e.g. 1-3, 5, 8"
                          className="w-full px-3.5 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs font-mono focus:outline-hidden focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 transition-colors"
                        />
                      </div>

                      {/* Quick Interactive Page Grid */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-[11px] text-zinc-400">
                          <span>Quick click to include or exclude pages:</span>
                          <button
                            type="button"
                            onClick={() => {
                              const all = new Set<number>();
                              for (let i = 0; i < splitPageCount; i++) all.add(i);
                              setSelectedPagesSet(all);
                              setPageRangeText(`1-${splitPageCount}`);
                            }}
                            className="text-zinc-300 hover:text-white underline text-[11px]"
                          >
                            Select All
                          </button>
                        </div>

                        <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-2 rounded-lg bg-zinc-950 border border-zinc-800/80">
                          {Array.from({ length: splitPageCount }).map((_, idx) => {
                            const isIncluded = selectedPagesSet.has(idx);
                            return (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => togglePageSelection(idx)}
                                className={`w-8 h-8 rounded text-xs font-mono font-medium transition-colors flex items-center justify-center cursor-pointer ${
                                  isIncluded
                                    ? 'bg-zinc-100 text-zinc-950 font-bold shadow-xs'
                                    : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                                }`}
                              >
                                {idx + 1}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Split Action Button */}
                  <button
                    id="execute-split-button"
                    onClick={handleExecuteSplit}
                    disabled={isSplitting || (splitModeType === 'ranges' && selectedPagesSet.size === 0)}
                    className="w-full py-2.5 px-4 rounded-lg bg-zinc-100 text-zinc-950 hover:bg-white font-medium text-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-xs active:scale-[0.99]"
                  >
                    {isSplitting ? (
                      <>
                        <Zap className="w-4 h-4 animate-spin" />
                        <span>Processing Split ({splitProgress.current}/{splitProgress.total})...</span>
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4" />
                        <span>
                          {splitModeType === 'individual'
                            ? `Extract ${splitPageCount} Pages as ZIP`
                            : `Extract ${selectedPagesSet.size} Selected Pages`}
                        </span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Right Column: Information Preview */}
              <div className="lg:col-span-5 space-y-4">
                <div className="p-5 rounded-xl border border-zinc-800 bg-zinc-900/60 sticky top-20 space-y-4">
                  <h3 className="text-sm font-semibold text-zinc-200 border-b border-zinc-800/80 pb-3">
                    Output Summary
                  </h3>

                  <div className="space-y-3 text-xs">
                    <div className="flex justify-between">
                      <span className="text-zinc-400">Target Action:</span>
                      <span className="font-medium text-zinc-200">
                        {splitModeType === 'individual' ? 'All Single Pages (.zip)' : 'Custom Sub-Document (.pdf)'}
                      </span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-zinc-400">Pages to Export:</span>
                      <span className="font-mono text-zinc-200 font-medium">
                        {splitModeType === 'individual' ? splitPageCount : selectedPagesSet.size} pages
                      </span>
                    </div>

                    {splitModeType === 'ranges' && (
                      <div>
                        <span className="text-zinc-400 block mb-1">Extracted Sequence:</span>
                        <p className="font-mono text-[11px] text-zinc-300 p-2 rounded bg-zinc-950 border border-zinc-850 break-words">
                          {(Array.from(selectedPagesSet) as number[])
                            .sort((a: number, b: number) => a - b)
                            .map((i: number) => `Page ${i + 1}`)
                            .join(', ') || 'No pages selected'}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

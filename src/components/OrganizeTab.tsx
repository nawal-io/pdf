import React, { useState } from 'react';
import {
  LayoutGrid,
  RotateCw,
  RotateCcw,
  Trash2,
  Undo2,
  ArrowLeft,
  ArrowRight,
  Download,
  Copy,
  Zap,
  FileCheck,
  RefreshCw,
} from 'lucide-react';
import { DropZone } from './DropZone';
import {
  formatBytes,
  renderAllPageThumbnails,
  organizePdf,
  downloadBlob,
} from '../lib/pdfEngine';
import type { PageThumbnail } from '../types';

interface OrganizeTabProps {
  onNotify: (type: 'success' | 'error' | 'info', title: string, message?: string) => void;
}

export const OrganizeTab: React.FC<OrganizeTabProps> = ({ onNotify }) => {
  const [file, setFile] = useState<File | null>(null);
  const [fileBuffer, setFileBuffer] = useState<ArrayBuffer | null>(null);
  const [pages, setPages] = useState<PageThumbnail[]>([]);
  const [initialPages, setInitialPages] = useState<PageThumbnail[]>([]);
  const [isLoadingPages, setIsLoadingPages] = useState(false);
  const [loadProgress, setLoadProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [isExporting, setIsExporting] = useState(false);

  // Drag state for reordering
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const handleSelectFile = async (selectedFile: File) => {
    if (selectedFile.type !== 'application/pdf' && !selectedFile.name.toLowerCase().endsWith('.pdf')) {
      onNotify('error', 'Invalid file', 'Please choose a PDF document.');
      return;
    }

    try {
      setIsLoadingPages(true);
      const buffer = await selectedFile.arrayBuffer();
      setFile(selectedFile);
      setFileBuffer(buffer);

      const thumbnails = await renderAllPageThumbnails(buffer, (current, total) => {
        setLoadProgress({ current, total });
      });

      setPages(thumbnails);
      setInitialPages(JSON.parse(JSON.stringify(thumbnails)));
      setIsLoadingPages(false);
      onNotify('info', 'Pages Rendered', `Loaded ${thumbnails.length} pages for organization.`);
    } catch (err) {
      console.error('Failed to parse PDF for organization:', err);
      onNotify('error', 'Failed to read PDF', 'Document may be encrypted or unsupported.');
      setIsLoadingPages(false);
    }
  };

  // Page manipulation actions
  const rotatePage = (index: number, angle: number = 90) => {
    setPages((prev) => {
      const copy = [...prev];
      const curRot = copy[index].rotation;
      copy[index] = {
        ...copy[index],
        rotation: (curRot + angle + 360) % 360,
      };
      return copy;
    });
  };

  const toggleDeletePage = (index: number) => {
    setPages((prev) => {
      const copy = [...prev];
      copy[index] = {
        ...copy[index],
        isDeleted: !copy[index].isDeleted,
      };
      return copy;
    });
  };

  const duplicatePage = (index: number) => {
    setPages((prev) => {
      const copy = [...prev];
      const target = copy[index];
      const clone: PageThumbnail = {
        ...target,
        id: `page-clone-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      };
      copy.splice(index + 1, 0, clone);
      return copy;
    });
    onNotify('info', 'Page Duplicated', `Created a copy of Page ${pages[index].displayNumber}`);
  };

  const movePage = (fromIndex: number, direction: 'left' | 'right') => {
    const toIndex = direction === 'left' ? fromIndex - 1 : fromIndex + 1;
    if (toIndex < 0 || toIndex >= pages.length) return;

    setPages((prev) => {
      const copy = [...prev];
      const temp = copy[fromIndex];
      copy[fromIndex] = copy[toIndex];
      copy[toIndex] = temp;
      return copy;
    });
  };

  // Drag & drop reorder
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex) return;

    setPages((prev) => {
      const copy = [...prev];
      const [draggedItem] = copy.splice(draggedIndex, 1);
      copy.splice(targetIndex, 0, draggedItem);
      return copy;
    });
    setDraggedIndex(null);
  };

  // Bulk actions
  const rotateAllPages = (angle: number = 90) => {
    setPages((prev) =>
      prev.map((p) => ({
        ...p,
        rotation: (p.rotation + angle + 360) % 360,
      }))
    );
    onNotify('info', 'All Pages Rotated', `Applied ${angle}° rotation to all pages.`);
  };

  const resetAllPages = () => {
    setPages(JSON.parse(JSON.stringify(initialPages)));
    onNotify('info', 'Reset complete', 'Restored original page order and orientation.');
  };

  // Export reorganized PDF
  const handleExport = async () => {
    if (!fileBuffer || !file) return;

    const activeCount = pages.filter((p) => !p.isDeleted).length;
    if (activeCount === 0) {
      onNotify('error', 'Cannot export', 'All pages are marked as deleted. Restore at least one page.');
      return;
    }

    setIsExporting(true);

    try {
      const exportItems = pages.map((p) => ({
        originalIndex: p.pageIndex,
        rotationDelta: p.rotation,
        isDeleted: p.isDeleted,
      }));

      const newPdfBytes = await organizePdf(fileBuffer, exportItems);
      const cleanName = file.name.replace(/\.pdf$/i, '');
      const outName = `${cleanName}_organized.pdf`;

      downloadBlob(newPdfBytes, outName);
      onNotify('success', 'PDF Exported', `Saved as ${outName} with ${activeCount} pages.`);
    } catch (err) {
      console.error('Export organize error:', err);
      onNotify('error', 'Export Failed', 'Could not assemble reorganized PDF.');
    } finally {
      setIsExporting(false);
    }
  };

  const activePagesCount = pages.filter((p) => !p.isDeleted).length;
  const deletedPagesCount = pages.filter((p) => p.isDeleted).length;
  const rotatedPagesCount = pages.filter((p) => p.rotation !== 0).length;

  return (
    <div className="p-6 sm:p-8 lg:p-10 bg-zinc-950 flex flex-col space-y-8 min-h-[calc(100vh-7rem)]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-6">
        <div>
          <h2 className="text-xl font-medium mb-1 text-zinc-100">Organize & Rotate Pages</h2>
          <p className="text-sm text-zinc-500">
            Rearrange pages by dragging, rotate individual pages or the entire document, and prune unwanted sheets.
          </p>
        </div>

        {file && (
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              onClick={resetAllPages}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Changes
            </button>
            <button
              onClick={() => {
                setFile(null);
                setFileBuffer(null);
                setPages([]);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded transition-colors cursor-pointer"
            >
              Change File
            </button>
          </div>
        )}
      </div>

      {!file ? (
        <DropZone
          id="organize-dropzone"
          title="Drop PDF here to organize"
          description="Interactive visual grid with per-page rotation, deletion, reordering, and cloning."
          onFilesSelected={(files) => files[0] && handleSelectFile(files[0])}
        />
      ) : isLoadingPages ? (
        <div className="p-16 rounded-lg border border-zinc-800 bg-zinc-900/40 text-center space-y-4">
          <Zap className="w-6 h-6 animate-spin mx-auto text-zinc-300" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-zinc-200">Rendering visual page thumbnails...</p>
            <p className="text-xs font-mono text-zinc-500">
              Page {loadProgress.current} of {loadProgress.total}
            </p>
          </div>
          <div className="w-64 max-w-full mx-auto bg-zinc-800 h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-zinc-200 h-full transition-all duration-150"
              style={{
                width: `${loadProgress.total > 0 ? (loadProgress.current / loadProgress.total) * 100 : 0}%`,
              }}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Action Toolbar */}
          <div className="rounded-lg bg-zinc-900 p-4 border border-zinc-800 flex flex-wrap items-center justify-between gap-4">
            {/* Stats summary */}
            <div className="flex items-center gap-3 text-xs">
              <span className="font-semibold text-zinc-200">{file.name}</span>
              <span className="text-zinc-500 font-mono">•</span>
              <span className="text-zinc-300 font-mono">
                {activePagesCount} {activePagesCount === 1 ? 'page' : 'pages'} active
              </span>
              {deletedPagesCount > 0 && (
                <span className="px-2 py-0.5 rounded bg-rose-950/60 border border-rose-800/60 text-rose-300 text-[11px] font-mono">
                  {deletedPagesCount} deleted
                </span>
              )}
              {rotatedPagesCount > 0 && (
                <span className="px-2 py-0.5 rounded bg-blue-950/60 border border-blue-800/60 text-blue-300 text-[11px] font-mono">
                  {rotatedPagesCount} rotated
                </span>
              )}
            </div>

            {/* Quick Batch Actions & Export Button */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => rotateAllPages(90)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-zinc-950 hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100 border border-zinc-800 text-xs font-medium transition-colors cursor-pointer"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>Rotate All 90°</span>
              </button>

              <button
                id="export-reorganized-button"
                type="button"
                onClick={handleExport}
                disabled={isExporting || activePagesCount === 0}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded bg-zinc-100 text-zinc-950 hover:bg-white font-bold text-xs transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
              >
                {isExporting ? (
                  <>
                    <Zap className="w-3.5 h-3.5 animate-spin" />
                    <span>Exporting...</span>
                  </>
                ) : (
                  <>
                    <span>Export Reorganized PDF</span>
                    <Download className="w-3.5 h-3.5" strokeWidth={2.5} />
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Thumbnail Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {pages.map((item, index) => {
              const isRotated = item.rotation !== 0;

              return (
                <div
                  key={item.id}
                  draggable={!item.isDeleted}
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, index)}
                  className={`group relative rounded-xl border p-2.5 transition-all flex flex-col justify-between ${
                    item.isDeleted
                      ? 'border-zinc-900 bg-zinc-950/40 opacity-40'
                      : draggedIndex === index
                      ? 'border-zinc-400 bg-zinc-800/80 scale-[0.98]'
                      : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700 hover:bg-zinc-900/80'
                  }`}
                >
                  {/* Card Header: Position & Original number */}
                  <div className="flex items-center justify-between text-[11px] font-mono mb-2">
                    <span className="font-semibold text-zinc-200">
                      #{index + 1}
                    </span>
                    <span className="text-zinc-500 text-[10px]">
                      (Orig #{item.displayNumber})
                    </span>
                  </div>

                  {/* Thumbnail Preview with Live Rotation */}
                  <div className="w-full aspect-3/4 rounded-md bg-zinc-950 border border-zinc-800 overflow-hidden flex items-center justify-center relative p-1.5">
                    <img
                      src={item.previewUrl}
                      alt={`Page ${item.displayNumber}`}
                      className="w-full h-full object-contain transition-transform duration-200"
                      style={{
                        transform: `rotate(${item.rotation}deg)`,
                      }}
                    />

                    {/* Rotation indicator badge if rotated */}
                    {isRotated && !item.isDeleted && (
                      <span className="absolute bottom-1 right-1 px-1.5 py-0.2 rounded text-[10px] font-mono font-medium bg-zinc-900/90 text-zinc-300 border border-zinc-700">
                        {item.rotation}°
                      </span>
                    )}

                    {/* Deleted Overlay Banner */}
                    {item.isDeleted && (
                      <div className="absolute inset-0 bg-zinc-950/80 backdrop-blur-[1px] flex items-center justify-center">
                        <span className="text-xs font-semibold text-rose-400 uppercase tracking-wider">
                          Deleted
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Action Bar */}
                  <div className="mt-2.5 pt-2 border-t border-zinc-800/80 flex items-center justify-between gap-1">
                    {item.isDeleted ? (
                      <button
                        type="button"
                        onClick={() => toggleDeletePage(index)}
                        className="w-full py-1 text-xs font-medium text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded transition-colors flex items-center justify-center gap-1"
                      >
                        <Undo2 className="w-3 h-3" />
                        <span>Restore</span>
                      </button>
                    ) : (
                      <>
                        <div className="flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => rotatePage(index, 90)}
                            className="p-1 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded transition-colors"
                            title="Rotate 90° Clockwise"
                          >
                            <RotateCw className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => movePage(index, 'left')}
                            disabled={index === 0}
                            className="p-1 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded disabled:opacity-20 transition-colors"
                            title="Move left"
                          >
                            <ArrowLeft className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => movePage(index, 'right')}
                            disabled={index === pages.length - 1}
                            className="p-1 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded disabled:opacity-20 transition-colors"
                            title="Move right"
                          >
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => duplicatePage(index)}
                            className="p-1 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded transition-colors"
                            title="Duplicate page"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => toggleDeletePage(index)}
                          className="p-1 text-zinc-500 hover:text-rose-400 hover:bg-rose-950/30 rounded transition-colors"
                          title="Delete page"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import {
  Minimize2,
  Download,
  FileCheck,
  RotateCcw,
  Sparkles,
  Zap,
  Sliders,
  Check,
  Clock,
  ArrowRight,
  TrendingDown,
  Info,
} from 'lucide-react';
import { DropZone } from './DropZone';
import {
  formatBytes,
  renderPageThumbnail,
  getPdfInfo,
  compressPdf,
  downloadBlob,
} from '../lib/pdfEngine';
import type { CompressionPreset, CompressionSettings, CompressionMetrics } from '../types';

interface CompressTabProps {
  onNotify: (type: 'success' | 'error' | 'info', title: string, message?: string) => void;
}

export const CompressTab: React.FC<CompressTabProps> = ({ onNotify }) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileBuffer, setFileBuffer] = useState<ArrayBuffer | null>(null);
  const [pageCount, setPageCount] = useState<number>(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Settings
  const [preset, setPreset] = useState<CompressionPreset>('recommended');
  const [convertToGrayscale, setConvertToGrayscale] = useState<boolean>(false);
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);
  const [customDpi, setCustomDpi] = useState<number>(100);
  const [customQuality, setCustomQuality] = useState<number>(70);

  // Compression processing state
  const [isCompressing, setIsCompressing] = useState<boolean>(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [metrics, setMetrics] = useState<CompressionMetrics | null>(null);
  const [compressedPdfBytes, setCompressedPdfBytes] = useState<Uint8Array | null>(null);

  // Presets mapping
  const presetConfig: Record<CompressionPreset, { dpi: number; quality: number; label: string; desc: string }> = {
    extreme: {
      dpi: 72,
      quality: 0.5,
      label: 'Extreme Compression',
      desc: 'Maximum size reduction (~72 DPI). Ideal for quick sharing and email attachments.',
    },
    recommended: {
      dpi: 100,
      quality: 0.72,
      label: 'Recommended Compression',
      desc: 'Balanced visual fidelity and size (~100 DPI). Perfect for business documents and reports.',
    },
    less: {
      dpi: 144,
      quality: 0.88,
      label: 'Less Compression',
      desc: 'High clarity (~144 DPI). Best for portfolio items, illustrations, and print-ready docs.',
    },
  };

  const handleFile = async (file: File) => {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      onNotify('error', 'Invalid file type', 'Please select a valid PDF document.');
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      const info = await getPdfInfo(buffer);
      const thumbnail = await renderPageThumbnail(buffer, 1, 240);

      setSelectedFile(file);
      setFileBuffer(buffer);
      setPageCount(info.pageCount);
      setPreviewUrl(thumbnail);
      setMetrics(null);
      setCompressedPdfBytes(null);
      onNotify('info', 'PDF Loaded', `${file.name} (${formatBytes(file.size)}, ${info.pageCount} ${info.pageCount === 1 ? 'page' : 'pages'})`);
    } catch (err) {
      console.error('Error reading PDF:', err);
      onNotify('error', 'Failed to read PDF', 'The document may be password-protected or corrupted.');
    }
  };

  // Keep custom sliders aligned when preset changes
  useEffect(() => {
    setCustomDpi(presetConfig[preset].dpi);
    setCustomQuality(Math.round(presetConfig[preset].quality * 100));
  }, [preset]);

  const handleCompress = async () => {
    if (!fileBuffer || !selectedFile) return;

    setIsCompressing(true);
    setProgress({ current: 0, total: pageCount });
    const startTime = performance.now();

    try {
      const activeSettings: CompressionSettings = {
        preset,
        dpi: showAdvanced ? customDpi : presetConfig[preset].dpi,
        quality: showAdvanced ? customQuality / 100 : presetConfig[preset].quality,
        convertToGrayscale,
      };

      const result = await compressPdf(fileBuffer, activeSettings, (curr, tot) => {
        setProgress({ current: curr, total: tot });
      });

      const endTime = performance.now();
      const timeTaken = Math.round(endTime - startTime);

      const diff = result.originalSize - result.compressedSize;
      const savingsPct = Math.round((diff / result.originalSize) * 100);

      const blob = new Blob([result.bytes], { type: 'application/pdf' });
      const downloadUrl = URL.createObjectURL(blob);
      const cleanName = selectedFile.name.replace(/\.pdf$/i, '');
      const outFileName = `${cleanName}_compressed.pdf`;

      setCompressedPdfBytes(result.bytes);
      setMetrics({
        originalSize: result.originalSize,
        compressedSize: result.compressedSize,
        savingsPercentage: savingsPct,
        pageCount: result.pageCount,
        processingTimeMs: timeTaken,
        downloadUrl,
        fileName: outFileName,
      });

      if (savingsPct > 0) {
        onNotify('success', 'Compression Complete', `Reduced by ${savingsPct}% in ${(timeTaken / 1000).toFixed(1)}s.`);
      } else {
        onNotify('info', 'Compression Complete', `PDF was already highly optimized (${formatBytes(result.compressedSize)}).`);
      }
    } catch (err) {
      console.error('Compression failed:', err);
      onNotify('error', 'Compression failed', 'An unexpected error occurred during processing.');
    } finally {
      setIsCompressing(false);
    }
  };

  const handleDownload = () => {
    if (!metrics || !compressedPdfBytes) return;
    downloadBlob(compressedPdfBytes, metrics.fileName);
    onNotify('success', 'File downloaded', metrics.fileName);
  };

  const handleReset = () => {
    setSelectedFile(null);
    setFileBuffer(null);
    setMetrics(null);
    setCompressedPdfBytes(null);
    setPreviewUrl(null);
  };

  return (
    <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 bg-zinc-900 gap-px min-h-[calc(100vh-7rem)]">
      {/* Left Column: Upload & File Status */}
      <section className="lg:col-span-7 bg-zinc-950 p-6 sm:p-8 lg:p-10 flex flex-col justify-center">
        <div className="mb-6 sm:mb-8">
          <h2 className="text-xl font-medium mb-1 text-zinc-100">Compress PDF</h2>
          <p className="text-sm text-zinc-500">Reduce file size while preserving document legibility.</p>
        </div>

        {!selectedFile ? (
          <DropZone
            id="compress-dropzone"
            title="Drop your PDF here"
            description="Supports all PDF documents up to 200MB. Processed strictly locally."
            onFilesSelected={(files) => files[0] && handleFile(files[0])}
          />
        ) : (
          <div className="relative group flex h-80 w-full flex-col items-center justify-center rounded-lg border border-dashed border-zinc-800 bg-zinc-950/50 transition-colors hover:border-zinc-700 hover:bg-zinc-900/30">
            <div className="mb-6 flex flex-col items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-400">
                {previewUrl ? (
                  <img src={previewUrl} alt="Preview" className="w-8 h-10 object-contain rounded-xs" />
                ) : (
                  <FileCheck className="w-5 h-5 text-zinc-400" />
                )}
              </div>
              <div className="text-center px-4 max-w-sm">
                <p className="text-sm font-medium text-zinc-200 truncate">{selectedFile.name}</p>
                <p className="text-xs text-zinc-500 mt-1 font-mono">
                  {formatBytes(selectedFile.size)} • {pageCount} {pageCount === 1 ? 'Page' : 'Pages'}
                </p>
              </div>
            </div>

            {/* Geometric Balance Progress Bar */}
            <div className="w-64 h-1 bg-zinc-900 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all duration-300"
                style={{
                  width: isCompressing
                    ? `${pageCount > 0 ? (progress.current / pageCount) * 100 : 0}%`
                    : metrics
                    ? '100%'
                    : '100%',
                }}
              />
            </div>

            <p className="mt-4 text-[10px] uppercase tracking-wider text-emerald-500 font-semibold font-mono">
              {isCompressing
                ? `Compressing: Page ${progress.current} of ${progress.total}`
                : metrics
                ? 'Optimization Complete'
                : 'Analysis Complete'}
            </p>

            <button
              onClick={handleReset}
              disabled={isCompressing}
              title="Remove file"
              className="absolute top-4 right-4 h-8 w-8 flex items-center justify-center rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900 border border-zinc-800/60 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        )}
      </section>

      {/* Right Column: Geometric Balance Settings & Real-time Output */}
      <section className="lg:col-span-5 bg-zinc-950 p-6 sm:p-8 lg:p-10 flex flex-col justify-between border-t lg:border-t-0 lg:border-l border-zinc-800 space-y-8">
        <div className="space-y-8">
          {/* Compression Settings Section */}
          <div className="space-y-4">
            <label className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
              Compression Settings
            </label>

            <div className="grid grid-cols-1 gap-2">
              {(['extreme', 'recommended', 'less'] as CompressionPreset[]).map((mode) => {
                const isSelected = preset === mode;
                const item = presetConfig[mode];

                return (
                  <div
                    key={mode}
                    id={`compress-preset-${mode}`}
                    onClick={() => !isCompressing && setPreset(mode)}
                    className={`flex items-center justify-between rounded-lg p-4 transition-colors cursor-pointer ${
                      isSelected
                        ? 'border border-zinc-100 bg-zinc-100 text-zinc-950'
                        : 'border border-zinc-800 hover:bg-zinc-900/50 text-zinc-100'
                    } ${isCompressing ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`h-4 w-4 rounded-full shrink-0 ${
                          isSelected
                            ? 'border-4 border-zinc-950 bg-zinc-950'
                            : 'border border-zinc-700'
                        }`}
                      />
                      <div className="flex flex-col">
                        <span className={`text-xs ${isSelected ? 'font-bold text-zinc-950' : 'font-medium text-zinc-200'}`}>
                          {item.label}
                        </span>
                        <span className={`text-[10px] ${isSelected ? 'text-zinc-700' : 'text-zinc-500'}`}>
                          {item.desc}
                        </span>
                      </div>
                    </div>

                    {mode === 'recommended' && (
                      <span
                        className={`text-[10px] uppercase font-bold tracking-wider shrink-0 ${
                          isSelected ? 'text-zinc-950' : 'text-zinc-400'
                        }`}
                      >
                        Default
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Supplementary Options */}
            <div className="pt-2 space-y-3">
              <label className="flex items-center gap-2.5 text-xs text-zinc-400 hover:text-zinc-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={convertToGrayscale}
                  onChange={(e) => setConvertToGrayscale(e.target.checked)}
                  disabled={isCompressing}
                  className="w-3.5 h-3.5 rounded bg-zinc-900 border-zinc-700 accent-zinc-200"
                />
                <span>Convert to Grayscale (Enhanced reduction for invoices & text)</span>
              </label>

              <div>
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1.5 font-medium transition-colors cursor-pointer"
                >
                  <Sliders className="w-3 h-3" />
                  <span>{showAdvanced ? 'Hide manual controls' : 'Show manual controls'}</span>
                </button>

                {showAdvanced && (
                  <div className="mt-2.5 p-3.5 rounded-lg border border-zinc-800 bg-zinc-900/40 space-y-3">
                    <div>
                      <div className="flex justify-between text-xs mb-1 text-zinc-400">
                        <span>Target DPI</span>
                        <span className="font-mono text-zinc-200">{customDpi} DPI</span>
                      </div>
                      <input
                        type="range"
                        min="50"
                        max="180"
                        step="5"
                        value={customDpi}
                        onChange={(e) => setCustomDpi(Number(e.target.value))}
                        disabled={isCompressing}
                        className="w-full accent-zinc-200 bg-zinc-800"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1 text-zinc-400">
                        <span>Quality Level</span>
                        <span className="font-mono text-zinc-200">{customQuality}%</span>
                      </div>
                      <input
                        type="range"
                        min="25"
                        max="95"
                        step="5"
                        value={customQuality}
                        onChange={(e) => setCustomQuality(Number(e.target.value))}
                        disabled={isCompressing}
                        className="w-full accent-zinc-200 bg-zinc-800"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Real-time Output Section */}
          <div className="space-y-4">
            <label className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
              Real-time Output
            </label>

            <div className="rounded-lg bg-zinc-900 p-6 border border-zinc-800">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col">
                  <span className="text-[10px] text-zinc-500 uppercase">Original</span>
                  <span className="text-xl font-medium tracking-tight text-zinc-100">
                    {selectedFile ? (
                      <>
                        {(selectedFile.size / (1024 * 1024)).toFixed(1)}{' '}
                        <span className="text-xs text-zinc-500 font-normal">MB</span>
                      </>
                    ) : (
                      <>
                        0.0 <span className="text-xs text-zinc-500 font-normal">MB</span>
                      </>
                    )}
                  </span>
                </div>

                <div className="flex flex-col border-l border-zinc-800 pl-4">
                  <span className="text-[10px] text-zinc-500 uppercase">Result</span>
                  <span className="text-xl font-medium tracking-tight text-emerald-400">
                    {metrics ? (
                      <>
                        {(metrics.compressedSize / (1024 * 1024)).toFixed(1)}{' '}
                        <span className="text-xs text-emerald-500/60 font-normal">MB</span>
                      </>
                    ) : selectedFile ? (
                      <>
                        ~{((selectedFile.size * (preset === 'extreme' ? 0.35 : preset === 'recommended' ? 0.55 : 0.75)) / (1024 * 1024)).toFixed(1)}{' '}
                        <span className="text-xs text-emerald-500/60 font-normal">MB (Est.)</span>
                      </>
                    ) : (
                      <>
                        0.0 <span className="text-xs text-emerald-500/60 font-normal">MB</span>
                      </>
                    )}
                  </span>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-zinc-800 flex items-center justify-between">
                <span className="text-xs text-zinc-400 font-medium">Estimated Savings</span>
                <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-xs font-bold text-emerald-400">
                  {metrics
                    ? `-${Math.max(0, metrics.savingsPercentage)}%`
                    : preset === 'extreme'
                    ? '-65%'
                    : preset === 'recommended'
                    ? '-45%'
                    : '-25%'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Primary Action Button */}
        <div className="pt-4">
          {metrics && compressedPdfBytes ? (
            <div className="space-y-2">
              <button
                id="download-compressed-button"
                onClick={handleDownload}
                className="w-full bg-zinc-100 py-3 text-sm font-bold text-zinc-950 transition-all hover:bg-white active:scale-[0.98] rounded flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Download Compressed PDF</span>
                <Download className="w-4 h-4" strokeWidth={2.5} />
              </button>
              <button
                onClick={handleCompress}
                disabled={isCompressing}
                className="w-full py-2 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors text-center cursor-pointer"
              >
                Re-compress with current settings
              </button>
            </div>
          ) : (
            <button
              id="compress-action-button"
              onClick={handleCompress}
              disabled={!selectedFile || isCompressing}
              className="w-full bg-zinc-100 py-3 text-sm font-bold text-zinc-950 transition-all hover:bg-white active:scale-[0.98] rounded flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isCompressing ? (
                <>
                  <Zap className="w-4 h-4 animate-spin" />
                  <span>Processing document...</span>
                </>
              ) : (
                <>
                  <span>Compress PDF Now</span>
                  <Sparkles className="w-4 h-4" strokeWidth={2.5} />
                </>
              )}
            </button>
          )}
        </div>
      </section>
    </div>
  );
};

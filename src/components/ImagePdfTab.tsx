import React, { useState } from 'react';
import {
  Image as ImageIcon,
  FileText,
  ArrowUp,
  ArrowDown,
  Trash2,
  Download,
  Plus,
  Zap,
  Sliders,
  FolderArchive,
  Eye,
  FileCheck,
} from 'lucide-react';
import { DropZone } from './DropZone';
import {
  formatBytes,
  imagesToPdf,
  pdfToImagesZip,
  getPdfInfo,
  renderPageToCanvas,
  downloadBlob,
} from '../lib/pdfEngine';
import type { ImageItem, ImageToPdfConfig, PageSizeOption, OrientationOption, MarginOption, ImageFitOption } from '../types';

interface ImagePdfTabProps {
  onNotify: (type: 'success' | 'error' | 'info', title: string, message?: string) => void;
}

export const ImagePdfTab: React.FC<ImagePdfTabProps> = ({ onNotify }) => {
  const [subMode, setSubMode] = useState<'imageToPdf' | 'pdfToImage'>('imageToPdf');

  // IMAGE TO PDF STATE
  const [images, setImages] = useState<ImageItem[]>([]);
  const [imgConfig, setImgConfig] = useState<ImageToPdfConfig>({
    pageSize: 'a4',
    orientation: 'auto',
    margin: 'none',
    fit: 'contain',
  });
  const [isConvertingImages, setIsConvertingImages] = useState(false);
  const [imgProgress, setImgProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });

  // PDF TO IMAGE STATE
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfBuffer, setPdfBuffer] = useState<ArrayBuffer | null>(null);
  const [pdfPageCount, setPdfPageCount] = useState<number>(0);
  const [renderScale, setRenderScale] = useState<number>(2.0); // 2x = 144 DPI
  const [exportFormat, setExportFormat] = useState<'png' | 'jpeg'>('png');
  const [isExportingZip, setIsExportingZip] = useState(false);
  const [exportProgress, setExportProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });

  // Previewing pages in PDF to Image
  const [pageThumbnails, setPageThumbnails] = useState<{ pageNumber: number; url: string }[]>([]);
  const [isLoadingPreviews, setIsLoadingPreviews] = useState(false);

  // ----------------- IMAGE TO PDF LOGIC -----------------
  const handleAddImages = async (files: File[]) => {
    const validFiles = files.filter((f) => {
      const type = f.type.toLowerCase();
      return type === 'image/png' || type === 'image/jpeg' || type === 'image/jpg' || type === 'image/webp';
    });

    if (validFiles.length === 0) {
      onNotify('error', 'Invalid image files', 'Please upload PNG, JPEG, or WEBP images.');
      return;
    }

    const newItems: ImageItem[] = [];

    for (const file of validFiles) {
      try {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        // Get dimensions
        const { width, height } = await new Promise<{ width: number; height: number }>((resolve) => {
          const img = new Image();
          img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
          img.src = dataUrl;
        });

        newItems.push({
          id: `img-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          file,
          name: file.name,
          size: file.size,
          dataUrl,
          width,
          height,
        });
      } catch (err) {
        console.error('Failed to parse image:', err);
      }
    }

    if (newItems.length > 0) {
      setImages((prev) => [...prev, ...newItems]);
      onNotify('info', `Added ${newItems.length} image${newItems.length > 1 ? 's' : ''}`);
    }
  };

  const moveImage = (index: number, dir: 'up' | 'down') => {
    const target = dir === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= images.length) return;
    setImages((prev) => {
      const copy = [...prev];
      const temp = copy[index];
      copy[index] = copy[target];
      copy[target] = temp;
      return copy;
    });
  };

  const removeImage = (id: string) => {
    setImages((prev) => prev.filter((i) => i.id !== id));
  };

  const handleCreatePdfFromImages = async () => {
    if (images.length === 0) return;

    setIsConvertingImages(true);
    setImgProgress({ current: 0, total: images.length });

    try {
      const pdfBytes = await imagesToPdf(images, imgConfig, (curr, tot) => {
        setImgProgress({ current: curr, total: tot });
      });

      const fileName = `${images[0].name.replace(/\.[^/.]+$/, '')}_converted.pdf`;
      downloadBlob(pdfBytes, fileName);
      onNotify('success', 'PDF Created Successfully', `Downloaded ${fileName}`);
    } catch (err) {
      console.error('Image to PDF error:', err);
      onNotify('error', 'Conversion failed', 'Could not assemble PDF from selected images.');
    } finally {
      setIsConvertingImages(false);
    }
  };

  // ----------------- PDF TO IMAGE LOGIC -----------------
  const handleSelectPdfForImages = async (file: File) => {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      onNotify('error', 'Invalid file', 'Please choose a PDF document.');
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      const info = await getPdfInfo(buffer);

      setPdfFile(file);
      setPdfBuffer(buffer);
      setPdfPageCount(info.pageCount);
      setPageThumbnails([]);
      setIsLoadingPreviews(true);

      // Generate preview thumbnails for each page
      const thumbs: { pageNumber: number; url: string }[] = [];
      const previewLimit = Math.min(info.pageCount, 12); // fast preview of first 12 pages

      for (let i = 1; i <= previewLimit; i++) {
        const canvas = await renderPageToCanvas(buffer, i, 0.4);
        thumbs.push({ pageNumber: i, url: canvas.toDataURL('image/jpeg', 0.8) });
      }

      setPageThumbnails(thumbs);
      setIsLoadingPreviews(false);
      onNotify('info', 'PDF Loaded', `${file.name} (${info.pageCount} pages)`);
    } catch (err) {
      console.error('Error loading PDF for image extraction:', err);
      onNotify('error', 'Failed to open PDF', 'File could not be parsed.');
      setIsLoadingPreviews(false);
    }
  };

  const handleDownloadSinglePageImage = async (pageNum: number) => {
    if (!pdfBuffer || !pdfFile) return;

    try {
      const canvas = await renderPageToCanvas(pdfBuffer, pageNum, renderScale);
      const mime = exportFormat === 'png' ? 'image/png' : 'image/jpeg';
      const ext = exportFormat === 'png' ? 'png' : 'jpg';

      canvas.toBlob((blob) => {
        if (!blob) return;
        const cleanName = pdfFile.name.replace(/\.[^/.]+$/, '');
        downloadBlob(blob, `${cleanName}_page_${pageNum}.${ext}`, mime);
        onNotify('success', 'Page Downloaded', `Page ${pageNum} saved as ${ext.toUpperCase()}`);
      }, mime, 0.92);
    } catch (err) {
      console.error('Download single page error:', err);
      onNotify('error', 'Download Failed', `Could not render page ${pageNum}`);
    }
  };

  const handleDownloadAllPagesZip = async () => {
    if (!pdfBuffer || !pdfFile) return;

    setIsExportingZip(true);
    setExportProgress({ current: 0, total: pdfPageCount });

    try {
      const zipBlob = await pdfToImagesZip(
        pdfBuffer,
        pdfFile.name,
        exportFormat,
        renderScale,
        (curr, tot) => {
          setExportProgress({ current: curr, total: tot });
        }
      );

      const zipName = `${pdfFile.name.replace(/\.[^/.]+$/, '')}_all_pages_${exportFormat}.zip`;
      downloadBlob(zipBlob, zipName, 'application/zip');
      onNotify('success', 'All Pages Exported', `Downloaded ZIP with ${pdfPageCount} high-res images.`);
    } catch (err) {
      console.error('ZIP export error:', err);
      onNotify('error', 'Export Failed', 'Could not generate image archive.');
    } finally {
      setIsExportingZip(false);
    }
  };

  return (
    <div className="p-6 sm:p-8 lg:p-10 bg-zinc-950 flex flex-col space-y-8 min-h-[calc(100vh-7rem)]">
      {/* Header & Submode Switch */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-6">
        <div>
          <h2 className="text-xl font-medium mb-1 text-zinc-100">Image ↔ PDF Conversion</h2>
          <p className="text-sm text-zinc-500">
            Convert pictures to customized PDFs or export PDF pages into crisp, high-resolution raster images.
          </p>
        </div>

        {/* Geometric Balance Sub-mode Segmented Toggle */}
        <div className="inline-flex rounded-lg p-1 bg-zinc-900 border border-zinc-800 self-start sm:self-auto">
          <button
            id="submode-img-to-pdf-btn"
            onClick={() => setSubMode('imageToPdf')}
            className={`px-4 py-1.5 rounded text-xs font-semibold transition-all cursor-pointer flex items-center gap-2 ${
              subMode === 'imageToPdf'
                ? 'bg-zinc-100 text-zinc-950'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            Images to PDF
          </button>
          <button
            id="submode-pdf-to-img-btn"
            onClick={() => setSubMode('pdfToImage')}
            className={`px-4 py-1.5 rounded text-xs font-semibold transition-all cursor-pointer flex items-center gap-2 ${
              subMode === 'pdfToImage'
                ? 'bg-zinc-100 text-zinc-950'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            PDF to Images
          </button>
        </div>
      </div>

      {/* ------------------- IMAGES TO PDF ------------------- */}
      {subMode === 'imageToPdf' && (
        <div className="space-y-6">
          {images.length === 0 ? (
            <DropZone
              id="image-to-pdf-dropzone"
              accept="image/png,image/jpeg,image/webp"
              multiple
              title="Drop images here (PNG, JPG, WEBP)"
              description="Assemble multiple images into a beautifully formatted PDF document."
              onFilesSelected={handleAddImages}
            />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column: Image List */}
              <div className="lg:col-span-7 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Image Sequence ({images.length} items)
                  </span>
                  <div className="flex items-center gap-2">
                    <label className="cursor-pointer inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-zinc-300 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-md transition-colors">
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Images</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        multiple
                        className="hidden"
                        onChange={(e) => e.target.files && handleAddImages(Array.from(e.target.files))}
                      />
                    </label>
                    <button
                      onClick={() => setImages([])}
                      className="px-2.5 py-1 text-xs font-medium text-zinc-400 hover:text-rose-400 hover:bg-rose-950/30 rounded-md transition-colors"
                    >
                      Clear All
                    </button>
                  </div>
                </div>

                <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                  {images.map((item, index) => (
                    <div
                      key={item.id}
                      className="p-2.5 rounded-lg border border-zinc-800 bg-zinc-900/50 flex items-center justify-between gap-3 hover:border-zinc-700 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="w-6 h-6 rounded bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs font-mono font-medium flex items-center justify-center shrink-0">
                          {index + 1}
                        </span>
                        <img
                          src={item.dataUrl}
                          alt=""
                          className="w-12 h-12 object-cover rounded border border-zinc-800 bg-zinc-950 shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-zinc-200 truncate">{item.name}</p>
                          <p className="text-[11px] font-mono text-zinc-500 mt-0.5">
                            {item.width} × {item.height} px • {formatBytes(item.size)}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => moveImage(index, 'up')}
                          disabled={index === 0}
                          className="p-1 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded disabled:opacity-30 disabled:hover:bg-transparent"
                          title="Move up"
                        >
                          <ArrowUp className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => moveImage(index, 'down')}
                          disabled={index === images.length - 1}
                          className="p-1 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded disabled:opacity-30 disabled:hover:bg-transparent"
                          title="Move down"
                        >
                          <ArrowDown className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => removeImage(item.id)}
                          className="p-1 text-zinc-500 hover:text-rose-400 hover:bg-rose-950/30 rounded"
                          title="Remove image"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right Column: PDF Layout Settings */}
              <div className="lg:col-span-5 space-y-4">
                <div className="rounded-lg bg-zinc-900 p-6 border border-zinc-800 sticky top-20 space-y-6">
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                      Document Geometry
                    </label>
                    <h3 className="text-sm font-medium text-zinc-200">
                      Page Layout Options
                    </h3>
                  </div>

                  {/* Page Size */}
                  <div className="space-y-2">
                    <label className="text-xs text-zinc-400">Page Size</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['a4', 'letter', 'auto'] as PageSizeOption[]).map((size) => (
                        <button
                          key={size}
                          type="button"
                          onClick={() => setImgConfig((c) => ({ ...c, pageSize: size }))}
                          className={`py-2 px-3 text-xs font-semibold rounded uppercase border transition-colors cursor-pointer ${
                            imgConfig.pageSize === size
                              ? 'bg-zinc-100 border-zinc-100 text-zinc-950'
                              : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          {size}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Orientation */}
                  {imgConfig.pageSize !== 'auto' && (
                    <div className="space-y-2">
                      <label className="text-xs text-zinc-400">Orientation</label>
                      <div className="grid grid-cols-3 gap-2">
                        {(['auto', 'portrait', 'landscape'] as OrientationOption[]).map((ori) => (
                          <button
                            key={ori}
                            type="button"
                            onClick={() => setImgConfig((c) => ({ ...c, orientation: ori }))}
                            className={`py-2 px-3 text-xs font-medium capitalize rounded border transition-colors cursor-pointer ${
                              imgConfig.orientation === ori
                                ? 'bg-zinc-100 border-zinc-100 text-zinc-950 font-semibold'
                                : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                            }`}
                          >
                            {ori}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Margins */}
                  {imgConfig.pageSize !== 'auto' && (
                    <div className="space-y-2">
                      <label className="text-xs text-zinc-400">Margins</label>
                      <div className="grid grid-cols-3 gap-2">
                        {(['none', 'small', 'medium'] as MarginOption[]).map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setImgConfig((c) => ({ ...c, margin: m }))}
                            className={`py-2 px-3 text-xs capitalize rounded border transition-colors cursor-pointer ${
                              imgConfig.margin === m
                                ? 'bg-zinc-100 border-zinc-100 text-zinc-950 font-semibold'
                                : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                            }`}
                          >
                            {m}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Image Fit */}
                  <div className="space-y-2">
                    <label className="text-xs text-zinc-400">Image Scaling</label>
                    <div className="grid grid-cols-2 gap-2">
                      {(['contain', 'cover'] as ImageFitOption[]).map((fit) => (
                        <button
                          key={fit}
                          type="button"
                          onClick={() => setImgConfig((c) => ({ ...c, fit }))}
                          className={`py-2 px-3 text-xs capitalize rounded border transition-colors cursor-pointer ${
                            imgConfig.fit === fit
                              ? 'bg-zinc-100 border-zinc-100 text-zinc-950 font-semibold'
                              : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          {fit === 'contain' ? 'Fit (Contain)' : 'Fill (Cover)'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Generate Button */}
                  <div className="pt-2">
                    <button
                      id="generate-pdf-from-images-btn"
                      onClick={handleCreatePdfFromImages}
                      disabled={isConvertingImages || images.length === 0}
                      className="w-full bg-zinc-100 py-3 text-sm font-bold text-zinc-950 transition-all hover:bg-white active:scale-[0.98] rounded flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {isConvertingImages ? (
                        <>
                          <Zap className="w-4 h-4 animate-spin" />
                          <span>Generating ({imgProgress.current}/{imgProgress.total})...</span>
                        </>
                      ) : (
                        <>
                          <span>Assemble & Download PDF</span>
                          <Download className="w-4 h-4" strokeWidth={2.5} />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ------------------- PDF TO IMAGES ------------------- */}
      {subMode === 'pdfToImage' && (
        <div className="space-y-6">
          {!pdfFile ? (
            <DropZone
              id="pdf-to-images-dropzone"
              title="Drop PDF here to convert to images"
              description="Render every page to crystal-clear PNG or JPEG graphics with custom DPI."
              onFilesSelected={(files) => files[0] && handleSelectPdfForImages(files[0])}
            />
          ) : (
            <div className="space-y-6">
              {/* Document bar with options */}
              <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/60 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0">
                    <FileCheck className="w-5 h-5 text-zinc-400" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-zinc-200 truncate">{pdfFile.name}</h3>
                    <p className="text-xs font-mono text-zinc-400 mt-0.5">
                      {formatBytes(pdfFile.size)} • {pdfPageCount} pages
                    </p>
                  </div>
                </div>

                {/* Export Configuration Controls */}
                <div className="flex flex-wrap items-center gap-3">
                  {/* Format */}
                  <div className="flex items-center rounded-md bg-zinc-950 border border-zinc-800 p-0.5">
                    <button
                      type="button"
                      onClick={() => setExportFormat('png')}
                      className={`px-2.5 py-1 text-xs font-medium rounded ${
                        exportFormat === 'png' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      PNG
                    </button>
                    <button
                      type="button"
                      onClick={() => setExportFormat('jpeg')}
                      className={`px-2.5 py-1 text-xs font-medium rounded ${
                        exportFormat === 'jpeg' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      JPG
                    </button>
                  </div>

                  {/* Resolution Scale */}
                  <div className="flex items-center rounded-md bg-zinc-950 border border-zinc-800 p-0.5">
                    <button
                      type="button"
                      onClick={() => setRenderScale(1.0)}
                      className={`px-2.5 py-1 text-xs font-medium rounded ${
                        renderScale === 1.0 ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                      title="72 DPI (Standard)"
                    >
                      1x
                    </button>
                    <button
                      type="button"
                      onClick={() => setRenderScale(2.0)}
                      className={`px-2.5 py-1 text-xs font-medium rounded ${
                        renderScale === 2.0 ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                      title="144 DPI (High Res)"
                    >
                      2x
                    </button>
                    <button
                      type="button"
                      onClick={() => setRenderScale(3.0)}
                      className={`px-2.5 py-1 text-xs font-medium rounded ${
                        renderScale === 3.0 ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                      title="216 DPI (Ultra Crisp)"
                    >
                      3x
                    </button>
                  </div>

                  {/* Batch Download ZIP Button */}
                  <button
                    id="download-all-images-zip-btn"
                    onClick={handleDownloadAllPagesZip}
                    disabled={isExportingZip}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-zinc-100 text-zinc-950 hover:bg-white font-medium text-xs transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.99]"
                  >
                    {isExportingZip ? (
                      <>
                        <Zap className="w-3.5 h-3.5 animate-spin" />
                        <span>Rendering ({exportProgress.current}/{exportProgress.total})...</span>
                      </>
                    ) : (
                      <>
                        <FolderArchive className="w-3.5 h-3.5" />
                        <span>Download All as ZIP</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => {
                      setPdfFile(null);
                      setPdfBuffer(null);
                    }}
                    className="text-xs text-zinc-400 hover:text-zinc-200 px-2.5 py-1.5 rounded bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 transition-colors"
                  >
                    Change
                  </button>
                </div>
              </div>

              {/* Gallery Grid */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span>Page Previews ({pdfPageCount} total)</span>
                  <span>Click download to save individual page</span>
                </div>

                {isLoadingPreviews ? (
                  <div className="py-16 text-center text-xs text-zinc-500 flex items-center justify-center gap-2">
                    <Zap className="w-4 h-4 animate-spin" />
                    <span>Rendering page previews...</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                    {pageThumbnails.map((thumb) => (
                      <div
                        key={thumb.pageNumber}
                        className="group relative rounded-lg border border-zinc-800 bg-zinc-900/50 p-2 flex flex-col items-center space-y-2 hover:border-zinc-700 transition-colors"
                      >
                        <div className="w-full aspect-3/4 rounded bg-zinc-950 border border-zinc-800/80 overflow-hidden flex items-center justify-center">
                          <img
                            src={thumb.url}
                            alt={`Page ${thumb.pageNumber}`}
                            className="w-full h-full object-contain"
                          />
                        </div>

                        <div className="w-full flex items-center justify-between pt-1">
                          <span className="text-[11px] font-mono text-zinc-400 font-medium">
                            #{thumb.pageNumber}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleDownloadSinglePageImage(thumb.pageNumber)}
                            className="p-1 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded transition-colors"
                            title={`Download page ${thumb.pageNumber}`}
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

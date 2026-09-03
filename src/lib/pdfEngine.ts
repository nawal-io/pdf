import { PDFDocument, degrees, PageSizes } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import JSZip from 'jszip';
import type { CompressionSettings, ImageToPdfConfig, PageThumbnail } from '../types';

// Configure PDF.js worker
let workerConfigured = false;

export function ensurePdfJsWorker(): void {
  if (workerConfigured) return;
  try {
    // Attempt to set worker source matching user requirement
    if (typeof window !== 'undefined') {
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
    }
    workerConfigured = true;
  } catch (err) {
    console.warn('Could not initialize PDF.js worker via URL, fallback in place', err);
  }
}

/**
 * Format bytes into human readable format
 */
export function formatBytes(bytes: number, decimals = 1): string {
  if (!+bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

/**
 * Trigger browser file download
 */
export function downloadBlob(blob: Blob | Uint8Array, fileName: string, mimeType = 'application/pdf'): void {
  const finalBlob = blob instanceof Blob ? blob : new Blob([blob], { type: mimeType });
  const url = URL.createObjectURL(finalBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * Get page count and metadata from PDF
 */
export async function getPdfInfo(data: ArrayBuffer): Promise<{ pageCount: number; title?: string }> {
  ensurePdfJsWorker();
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(data.slice(0)) });
  const doc = await loadingTask.promise;
  const meta = await doc.getMetadata().catch(() => null);
  const info = (meta?.info as Record<string, unknown>) || {};
  return {
    pageCount: doc.numPages,
    title: typeof info.Title === 'string' ? info.Title : undefined,
  };
}

/**
 * Render a single page to HTML5 Canvas
 */
export async function renderPageToCanvas(
  data: ArrayBuffer,
  pageNumber: number, // 1-indexed
  scale = 1.0,
  rotationOffset = 0
): Promise<HTMLCanvasElement> {
  ensurePdfJsWorker();
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(data.slice(0)) });
  const doc = await loadingTask.promise;
  const page = await doc.getPage(pageNumber);

  const totalRotation = (page.rotate + rotationOffset) % 360;
  const viewport = page.getViewport({ scale, rotation: totalRotation });

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create canvas 2D context');

  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);

  // White background for transparent pages
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const renderContext = {
    canvasContext: ctx,
    viewport: viewport,
  };

  // @ts-expect-error pdfjs-dist types mismatch for render
  await page.render(renderContext).promise;
  return canvas;
}

/**
 * Render a single page directly to a data URL (for fast preview thumbnails)
 */
export async function renderPageThumbnail(
  data: ArrayBuffer,
  pageNumber: number, // 1-indexed
  maxDimension = 260,
  rotationOffset = 0
): Promise<string> {
  ensurePdfJsWorker();
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(data.slice(0)) });
  const doc = await loadingTask.promise;
  const page = await doc.getPage(pageNumber);

  const totalRotation = (page.rotate + rotationOffset) % 360;
  const unscaledViewport = page.getViewport({ scale: 1.0, rotation: totalRotation });
  const maxSide = Math.max(unscaledViewport.width, unscaledViewport.height);
  const scale = Math.min(1.5, maxDimension / maxSide);

  const viewport = page.getViewport({ scale, rotation: totalRotation });

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context unavailable');

  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const renderContext = {
    canvasContext: ctx,
    viewport: viewport,
  };

  // @ts-expect-error pdfjs-dist types mismatch for render
  await page.render(renderContext).promise;
  return canvas.toDataURL('image/jpeg', 0.82);
}

/**
 * Render all pages thumbnails for Organize & Rotate tab
 */
export async function renderAllPageThumbnails(
  data: ArrayBuffer,
  onProgress?: (current: number, total: number) => void
): Promise<PageThumbnail[]> {
  ensurePdfJsWorker();
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(data.slice(0)) });
  const doc = await loadingTask.promise;
  const total = doc.numPages;
  const thumbnails: PageThumbnail[] = [];

  for (let i = 1; i <= total; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: 1.0 });
    const maxSide = Math.max(viewport.width, viewport.height);
    const scale = Math.min(1.4, 280 / maxSide);
    const scaledViewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    canvas.width = Math.floor(scaledViewport.width);
    canvas.height = Math.floor(scaledViewport.height);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // @ts-expect-error pdfjs-dist types mismatch for render
    await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;

    thumbnails.push({
      id: `page-${i}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      pageIndex: i - 1,
      displayNumber: i,
      rotation: 0,
      previewUrl: canvas.toDataURL('image/jpeg', 0.8),
      isDeleted: false,
    });

    if (onProgress) {
      onProgress(i, total);
    }
  }

  return thumbnails;
}

/**
 * Compress PDF by rendering pages to canvas, downsampling raster streams, and re-encoding
 */
export async function compressPdf(
  data: ArrayBuffer,
  settings: CompressionSettings,
  onProgress?: (current: number, total: number) => void
): Promise<{ bytes: Uint8Array; originalSize: number; compressedSize: number; pageCount: number }> {
  ensurePdfJsWorker();
  const originalSize = data.byteLength;

  // Scale map based on DPI: standard 72 DPI is scale 1.0
  const renderScale = Math.max(0.6, settings.dpi / 72);
  const jpegQuality = Math.min(0.95, Math.max(0.2, settings.quality));

  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(data.slice(0)) });
  const pdfDoc = await loadingTask.promise;
  const pageCount = pdfDoc.numPages;

  // Create clean target document
  const newPdfDoc = await PDFDocument.create();

  for (let i = 1; i <= pageCount; i++) {
    const page = await pdfDoc.getPage(i);
    const viewportOriginal = page.getViewport({ scale: 1.0 });
    const viewportScaled = page.getViewport({ scale: renderScale });

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context error');

    canvas.width = Math.floor(viewportScaled.width);
    canvas.height = Math.floor(viewportScaled.height);

    // Fill clean white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // @ts-expect-error pdfjs-dist types mismatch for render
    await page.render({ canvasContext: ctx, viewport: viewportScaled }).promise;

    // Apply grayscale conversion if enabled
    if (settings.convertToGrayscale) {
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = imgData.data;
      for (let p = 0; p < d.length; p += 4) {
        const gray = 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2];
        d[p] = gray;
        d[p + 1] = gray;
        d[p + 2] = gray;
      }
      ctx.putImageData(imgData, 0, 0);
    }

    // Convert canvas to JPEG blob/buffer
    const jpegDataUrl = canvas.toDataURL('image/jpeg', jpegQuality);
    const base64Data = jpegDataUrl.split(',')[1];
    const binaryStr = atob(base64Data);
    const jpegBytes = new Uint8Array(binaryStr.length);
    for (let b = 0; b < binaryStr.length; b++) {
      jpegBytes[b] = binaryStr.charCodeAt(b);
    }

    // Embed into new document
    const embeddedImg = await newPdfDoc.embedJpg(jpegBytes);
    const newPage = newPdfDoc.addPage([viewportOriginal.width, viewportOriginal.height]);
    newPage.drawImage(embeddedImg, {
      x: 0,
      y: 0,
      width: viewportOriginal.width,
      height: viewportOriginal.height,
    });

    if (onProgress) {
      onProgress(i, pageCount);
    }
  }

  // Save with compressed object streams
  const compressedBytes = await newPdfDoc.save({ useObjectStreams: true });
  const compressedSize = compressedBytes.byteLength;

  return {
    bytes: compressedBytes,
    originalSize,
    compressedSize,
    pageCount,
  };
}

/**
 * Merge multiple PDF files into one
 */
export async function mergePdfs(
  buffers: ArrayBuffer[],
  onProgress?: (current: number, total: number) => void
): Promise<Uint8Array> {
  const mergedPdf = await PDFDocument.create();
  const total = buffers.length;

  for (let i = 0; i < total; i++) {
    const srcDoc = await PDFDocument.load(new Uint8Array(buffers[i].slice(0)), { ignoreEncryption: true });
    const copiedPages = await mergedPdf.copyPages(srcDoc, srcDoc.getPageIndices());
    for (const page of copiedPages) {
      mergedPdf.addPage(page);
    }
    if (onProgress) {
      onProgress(i + 1, total);
    }
  }

  return await mergedPdf.save({ useObjectStreams: true });
}

/**
 * Parse page range string (e.g. "1-3, 5, 8-10") into 0-indexed integer array
 */
export function parsePageRange(rangeStr: string, totalPages: number): number[] {
  if (!rangeStr.trim()) return [];
  const indices = new Set<number>();
  const parts = rangeStr.split(/[,;\s]+/).filter(Boolean);

  for (const part of parts) {
    if (part.includes('-')) {
      const [startStr, endStr] = part.split('-');
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      if (!isNaN(start) && !isNaN(end)) {
        const min = Math.max(1, Math.min(start, end));
        const max = Math.min(totalPages, Math.max(start, end));
        for (let p = min; p <= max; p++) {
          indices.add(p - 1);
        }
      }
    } else {
      const p = parseInt(part, 10);
      if (!isNaN(p) && p >= 1 && p <= totalPages) {
        indices.add(p - 1);
      }
    }
  }

  return Array.from(indices).sort((a, b) => a - b);
}

/**
 * Split PDF: Extract specific page indices into a single new PDF
 */
export async function splitPdf(pdfData: ArrayBuffer, pageIndices: number[]): Promise<Uint8Array> {
  const srcDoc = await PDFDocument.load(new Uint8Array(pdfData.slice(0)), { ignoreEncryption: true });
  const splitDoc = await PDFDocument.create();

  const validIndices = pageIndices.filter((idx) => idx >= 0 && idx < srcDoc.getPageCount());
  if (validIndices.length === 0) {
    throw new Error('No valid pages selected for extraction');
  }

  const copiedPages = await splitDoc.copyPages(srcDoc, validIndices);
  for (const page of copiedPages) {
    splitDoc.addPage(page);
  }

  return await splitDoc.save({ useObjectStreams: true });
}

/**
 * Split PDF: Extract all pages into a ZIP containing individual 1-page PDFs
 */
export async function splitPdfToZip(
  pdfData: ArrayBuffer,
  baseFileName: string,
  onProgress?: (current: number, total: number) => void
): Promise<Blob> {
  const srcDoc = await PDFDocument.load(new Uint8Array(pdfData.slice(0)), { ignoreEncryption: true });
  const total = srcDoc.getPageCount();
  const zip = new JSZip();
  const cleanBase = baseFileName.replace(/\.[^/.]+$/, '');

  for (let i = 0; i < total; i++) {
    const singleDoc = await PDFDocument.create();
    const [copied] = await singleDoc.copyPages(srcDoc, [i]);
    singleDoc.addPage(copied);
    const bytes = await singleDoc.save({ useObjectStreams: true });
    const pageNumStr = String(i + 1).padStart(String(total).length, '0');
    zip.file(`${cleanBase}_page_${pageNumStr}.pdf`, bytes);

    if (onProgress) {
      onProgress(i + 1, total);
    }
  }

  return await zip.generateAsync({ type: 'blob' });
}

/**
 * Convert images (PNG, JPG, WEBP) to PDF
 */
export async function imagesToPdf(
  images: { file: File; dataUrl: string; width: number; height: number }[],
  config: ImageToPdfConfig,
  onProgress?: (current: number, total: number) => void
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const total = images.length;

  for (let i = 0; i < total; i++) {
    const imgItem = images[i];
    const imageBytes = await imgItem.file.arrayBuffer();

    let embeddedImg;
    const mime = imgItem.file.type.toLowerCase();

    if (mime === 'image/jpeg' || mime === 'image/jpg') {
      embeddedImg = await pdfDoc.embedJpg(imageBytes);
    } else if (mime === 'image/png') {
      try {
        embeddedImg = await pdfDoc.embedPng(imageBytes);
      } catch {
        // Fallback: draw through canvas to convert unsupported PNG variants to clean PNG
        const c = document.createElement('canvas');
        c.width = imgItem.width;
        c.height = imgItem.height;
        const ctx = c.getContext('2d')!;
        const imgObj = new Image();
        imgObj.src = imgItem.dataUrl;
        await new Promise((resolve) => (imgObj.onload = resolve));
        ctx.drawImage(imgObj, 0, 0);
        const dataUrl = c.toDataURL('image/jpeg', 0.95);
        const b64 = dataUrl.split(',')[1];
        const bin = atob(b64);
        const u8 = new Uint8Array(bin.length);
        for (let b = 0; b < bin.length; b++) u8[b] = bin.charCodeAt(b);
        embeddedImg = await pdfDoc.embedJpg(u8);
      }
    } else {
      // WEBP or other: render to canvas and convert to JPEG
      const c = document.createElement('canvas');
      c.width = imgItem.width;
      c.height = imgItem.height;
      const ctx = c.getContext('2d')!;
      const imgObj = new Image();
      imgObj.src = imgItem.dataUrl;
      await new Promise((resolve) => (imgObj.onload = resolve));
      ctx.drawImage(imgObj, 0, 0);
      const dataUrl = c.toDataURL('image/jpeg', 0.95);
      const b64 = dataUrl.split(',')[1];
      const bin = atob(b64);
      const u8 = new Uint8Array(bin.length);
      for (let b = 0; b < bin.length; b++) u8[b] = bin.charCodeAt(b);
      embeddedImg = await pdfDoc.embedJpg(u8);
    }

    // Determine target page width and height
    let pageWidth: number;
    let pageHeight: number;

    if (config.pageSize === 'auto') {
      pageWidth = imgItem.width;
      pageHeight = imgItem.height;
    } else {
      const stdSize = config.pageSize === 'a4' ? PageSizes.A4 : PageSizes.Letter;
      let [w, h] = stdSize;

      if (config.orientation === 'portrait') {
        pageWidth = Math.min(w, h);
        pageHeight = Math.max(w, h);
      } else if (config.orientation === 'landscape') {
        pageWidth = Math.max(w, h);
        pageHeight = Math.min(w, h);
      } else {
        // Auto orientation: match image aspect ratio
        if (imgItem.width > imgItem.height) {
          pageWidth = Math.max(w, h);
          pageHeight = Math.min(w, h);
        } else {
          pageWidth = Math.min(w, h);
          pageHeight = Math.max(w, h);
        }
      }
    }

    // Determine margins
    let margin = 0;
    if (config.pageSize !== 'auto') {
      if (config.margin === 'small') margin = 18;
      if (config.margin === 'medium') margin = 36;
    }

    const availWidth = Math.max(10, pageWidth - margin * 2);
    const availHeight = Math.max(10, pageHeight - margin * 2);

    let drawWidth = availWidth;
    let drawHeight = availHeight;
    let x = margin;
    let y = margin;

    if (config.fit === 'contain') {
      const imgAspect = imgItem.width / imgItem.height;
      const boxAspect = availWidth / availHeight;

      if (imgAspect > boxAspect) {
        drawWidth = availWidth;
        drawHeight = availWidth / imgAspect;
        x = margin;
        y = margin + (availHeight - drawHeight) / 2;
      } else {
        drawHeight = availHeight;
        drawWidth = availHeight * imgAspect;
        y = margin;
        x = margin + (availWidth - drawWidth) / 2;
      }
    }

    const page = pdfDoc.addPage([pageWidth, pageHeight]);
    page.drawImage(embeddedImg, {
      x,
      y,
      width: drawWidth,
      height: drawHeight,
    });

    if (onProgress) {
      onProgress(i + 1, total);
    }
  }

  return await pdfDoc.save({ useObjectStreams: true });
}

/**
 * Render PDF pages to high-res images and bundle into ZIP
 */
export async function pdfToImagesZip(
  pdfData: ArrayBuffer,
  baseFileName: string,
  format: 'png' | 'jpeg' = 'png',
  dpiScale = 2.0, // 2x (~144 DPI)
  onProgress?: (current: number, total: number) => void
): Promise<Blob> {
  ensurePdfJsWorker();
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(pdfData.slice(0)) });
  const doc = await loadingTask.promise;
  const total = doc.numPages;
  const zip = new JSZip();
  const cleanBase = baseFileName.replace(/\.[^/.]+$/, '');
  const ext = format === 'png' ? 'png' : 'jpg';
  const mime = format === 'png' ? 'image/png' : 'image/jpeg';

  for (let i = 1; i <= total; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: dpiScale });

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // @ts-expect-error pdfjs-dist types mismatch for render
    await page.render({ canvasContext: ctx, viewport }).promise;

    const dataUrl = canvas.toDataURL(mime, format === 'jpeg' ? 0.9 : undefined);
    const b64 = dataUrl.split(',')[1];
    const bin = atob(b64);
    const u8 = new Uint8Array(bin.length);
    for (let b = 0; b < bin.length; b++) u8[b] = bin.charCodeAt(b);

    const pageStr = String(i).padStart(String(total).length, '0');
    zip.file(`${cleanBase}_page_${pageStr}.${ext}`, u8);

    if (onProgress) {
      onProgress(i, total);
    }
  }

  return await zip.generateAsync({ type: 'blob' });
}

/**
 * Organize & Rotate: Reorder, rotate, omit deleted pages, and export
 */
export async function organizePdf(
  originalData: ArrayBuffer,
  items: { originalIndex: number; rotationDelta: number; isDeleted: boolean }[]
): Promise<Uint8Array> {
  const activeItems = items.filter((item) => !item.isDeleted);
  if (activeItems.length === 0) {
    throw new Error('All pages have been marked as deleted. Cannot export an empty document.');
  }

  const srcDoc = await PDFDocument.load(new Uint8Array(originalData.slice(0)), { ignoreEncryption: true });
  const newDoc = await PDFDocument.create();

  for (const item of activeItems) {
    const [copiedPage] = await newDoc.copyPages(srcDoc, [item.originalIndex]);
    const currentAngle = copiedPage.getRotation().angle;
    const finalAngle = (currentAngle + item.rotationDelta) % 360;
    // Normalize to 0, 90, 180, 270
    const normalized = (finalAngle + 360) % 360;
    copiedPage.setRotation(degrees(normalized));
    newDoc.addPage(copiedPage);
  }

  return await newDoc.save({ useObjectStreams: true });
}

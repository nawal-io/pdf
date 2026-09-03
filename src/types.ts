export type ActiveTab = 'compress' | 'merge-split' | 'image-pdf' | 'organize';

export type CompressionPreset = 'extreme' | 'recommended' | 'less';

export interface CompressionSettings {
  preset: CompressionPreset;
  dpi: number;
  quality: number; // 0.1 - 1.0
  convertToGrayscale: boolean;
}

export interface CompressionMetrics {
  originalSize: number;
  compressedSize: number;
  savingsPercentage: number;
  pageCount: number;
  processingTimeMs: number;
  downloadUrl: string;
  fileName: string;
}

export interface MergeFileItem {
  id: string;
  file: File;
  name: string;
  size: number;
  pageCount: number;
  previewUrl?: string;
}

export type SplitModeType = 'ranges' | 'single' | 'individual';

export interface PageThumbnail {
  id: string;
  pageIndex: number; // 0-indexed original page
  displayNumber: number; // 1-indexed original page number
  rotation: number; // 0, 90, 180, 270
  previewUrl: string;
  isDeleted: boolean;
}

export interface ImageItem {
  id: string;
  file: File;
  name: string;
  size: number;
  dataUrl: string;
  width: number;
  height: number;
}

export type PageSizeOption = 'auto' | 'a4' | 'letter';
export type OrientationOption = 'auto' | 'portrait' | 'landscape';
export type MarginOption = 'none' | 'small' | 'medium';
export type ImageFitOption = 'contain' | 'cover';

export interface ImageToPdfConfig {
  pageSize: PageSizeOption;
  orientation: OrientationOption;
  margin: MarginOption;
  fit: ImageFitOption;
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  title: string;
  message?: string;
}

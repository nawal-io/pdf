import React, { useRef, useState } from 'react';
import { UploadCloud, FileUp } from 'lucide-react';

interface DropZoneProps {
  id?: string;
  accept?: string;
  multiple?: boolean;
  title: string;
  description: string;
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
}

export const DropZone: React.FC<DropZoneProps> = ({
  id = 'file-dropzone',
  accept = 'application/pdf',
  multiple = false,
  title,
  description,
  onFilesSelected,
  disabled = false,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (disabled) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const filesArray = Array.from(e.dataTransfer.files);
      onFilesSelected(filesArray);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const filesArray = Array.from(e.target.files);
      onFilesSelected(filesArray);
    }
    // reset input so same file can be chosen again if needed
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div
      id={id}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => !disabled && inputRef.current?.click()}
      className={`relative group flex min-h-64 sm:h-80 w-full flex-col items-center justify-center rounded-lg border border-dashed text-center transition-colors cursor-pointer ${
        isDragOver
          ? 'border-zinc-600 bg-zinc-900/50 ring-1 ring-zinc-700'
          : 'border-zinc-800 bg-zinc-950/50 hover:border-zinc-700 hover:bg-zinc-900/30'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={handleChange}
        disabled={disabled}
        className="hidden"
      />

      <div className="flex flex-col items-center justify-center space-y-4 px-6">
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-lg border transition-colors ${
            isDragOver
              ? 'bg-zinc-800 border-zinc-600 text-zinc-100'
              : 'bg-zinc-900 border-zinc-800 text-zinc-400 group-hover:text-zinc-200 group-hover:border-zinc-700'
          }`}
        >
          {isDragOver ? <UploadCloud className="w-5 h-5" /> : <FileUp className="w-5 h-5" />}
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium text-zinc-200">
            {title}{' '}
            <span className="text-zinc-400 font-normal">or click to browse</span>
          </p>
          <p className="text-xs text-zinc-500 max-w-sm">{description}</p>
        </div>
      </div>
    </div>
  );
};

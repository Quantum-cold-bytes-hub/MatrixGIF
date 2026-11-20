import React, { useRef, useState } from 'react';
import { GLASSES_PRESETS } from '../utils/glassesPresets';
import { MatrixRenderSettings } from './MatrixPortraitEngine';

interface OpticalControlPanelProps {
  settings: MatrixRenderSettings;
  portraitSrc: string | null;
  onUpdateSettings: (partial: Partial<MatrixRenderSettings>) => void;
  onResetDefaults: () => void;
  onExportGif: () => void;
  isEncoding: boolean;
  encodeProgress: number;
  onUploadCustomPortrait: (file: File) => void;
  onRemovePortrait: () => void;
  onOpenCropCurrent: () => void;
  isUsingDefaultPortrait: boolean;
  onRestoreDefaultPortrait: () => void;
}

export const OpticalControlPanel: React.FC<OpticalControlPanelProps> = ({
  settings,
  portraitSrc,
  onUpdateSettings,
  onResetDefaults,
  onExportGif,
  isEncoding,
  encodeProgress,
  onUploadCustomPortrait,
  onRemovePortrait,
  onOpenCropCurrent,
  isUsingDefaultPortrait,
  onRestoreDefaultPortrait,
}) => {
  const sidebarFileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      onUploadCustomPortrait(file);
    }
  };

  return (
    <aside className="bg-[#0B0D0C] border border-[#1F2421] rounded-2xl p-6 flex flex-col gap-6">
      <input
        ref={sidebarFileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            onUploadCustomPortrait(file);
            e.target.value = '';
          }
        }}
      />

      {/* Section 0: Source Image Management (with [✕] Remove & Drag-Drop Upload) */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-[#F4F7F5]">
            Source Portrait Image
          </h2>
          {portraitSrc ? (
            <button
              type="button"
              onClick={onRemovePortrait}
              aria-label="Remove current image"
              title="Remove current image (✕)"
              className="px-2.5 py-1 rounded-lg bg-[#141816] hover:bg-rose-500/20 text-[#8A9990] hover:text-rose-300 border border-[#262E29] hover:border-rose-500/40 text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1"
            >
              <span aria-hidden="true">✕</span>
              <span>Remove Image</span>
            </button>
          ) : (
            <span className="text-xs text-[#8A9990] font-mono">Cleared</span>
          )}
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          className={`p-3.5 rounded-xl border transition-colors ${
            isDragOver ? 'bg-[#0F1913] border-[#00FF66]' : 'bg-[#050505] border-[#1F2421]'
          }`}
        >
          {portraitSrc ? (
            <div className="flex items-center gap-3.5">
              <div className="w-16 h-16 rounded-lg overflow-hidden bg-black border border-[#1F2421] relative shrink-0">
                <img
                  src={portraitSrc}
                  alt="Current source portrait"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover object-top"
                />
                <button
                  type="button"
                  onClick={onRemovePortrait}
                  aria-label="Remove current portrait"
                  title="Remove current portrait (✕)"
                  className="absolute top-1 right-1 w-5 h-5 rounded bg-black/85 hover:bg-rose-600 text-white border border-white/20 flex items-center justify-center text-[10px] font-bold transition-colors cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => sidebarFileInputRef.current?.click()}
                    className="flex-1 py-1.5 px-2.5 text-xs font-semibold text-[#050505] bg-[#00FF66] hover:bg-[#26FF7E] rounded-lg transition-colors whitespace-nowrap cursor-pointer text-center"
                  >
                    Upload New Image
                  </button>
                  <button
                    type="button"
                    onClick={onOpenCropCurrent}
                    className="py-1.5 px-2.5 text-xs font-medium text-[#F4F7F5] bg-[#141816] hover:bg-[#1E2421] border border-[#262E29] rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                  >
                    Crop / Zoom
                  </button>
                </div>

                {!isUsingDefaultPortrait ? (
                  <button
                    type="button"
                    onClick={onRestoreDefaultPortrait}
                    className="text-left text-[11px] text-[#00FF66] hover:underline cursor-pointer truncate"
                  >
                    Restore Attached B&amp;W Portrait
                  </button>
                ) : (
                  <span className="text-[11px] text-[#8A9990] truncate">
                    Auto B&amp;W + Crop ready on upload
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-3 text-center gap-2">
              <p className="text-xs text-[#8A9990]">
                Drop a new portrait photo here or browse files
              </p>
              <div className="flex items-center gap-2 w-full">
                <button
                  type="button"
                  onClick={() => sidebarFileInputRef.current?.click()}
                  className="flex-1 py-2 px-3 text-xs font-semibold text-[#050505] bg-[#00FF66] hover:bg-[#26FF7E] rounded-lg transition-colors cursor-pointer"
                >
                  Upload New Image
                </button>
                <button
                  type="button"
                  onClick={onRestoreDefaultPortrait}
                  className="py-2 px-3 text-xs font-medium text-[#F4F7F5] bg-[#141816] hover:bg-[#1E2421] border border-[#262E29] rounded-lg transition-colors cursor-pointer"
                >
                  Restore Default
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Section 1: 5 Custom Glasses Selector */}
      <div className="pt-5 border-t border-[#1F2421]">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-[#F4F7F5]">
            01. Custom Shadow Glasses (5 Styles)
          </h2>
          <span className="text-xs text-[#8A9990] font-mono tabular-nums">
            {GLASSES_PRESETS.findIndex((g) => g.id === settings.glassesId) + 1}/5
          </span>
        </div>

        <div className="flex flex-col gap-2">
          {GLASSES_PRESETS.map((preset) => {
            const active = preset.id === settings.glassesId;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => onUpdateSettings({ glassesId: preset.id })}
                className={`w-full flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl border text-left transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#0F1913] border-[#00FF66] text-[#F4F7F5]'
                    : 'bg-[#050505] border-[#1F2421] text-[#8A9990] hover:text-[#F4F7F5] hover:border-[#2E3832]'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`text-xs font-mono tabular-nums shrink-0 ${
                      active ? 'text-[#00FF66] font-semibold' : 'text-[#637068]'
                    }`}
                  >
                    {preset.number}
                  </span>
                  <div className="truncate">
                    <div className="text-xs font-semibold text-[#F4F7F5] truncate">
                      {preset.name}
                    </div>
                    <div className="text-[11px] text-[#8A9990] truncate">
                      {preset.archetype}
                    </div>
                  </div>
                </div>

                <svg viewBox="0 0 100 54" className="w-12 h-6 shrink-0" aria-hidden="true">
                  <path
                    d={preset.svgPreviewPath}
                    fill="#050505"
                    stroke={active ? '#00FF66' : '#4A5D52'}
                    strokeWidth="3"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            );
          })}
        </div>
      </div>

      {/* Section 2: Eyewear Fit & Framing Geometry */}
      <div className="pt-5 border-t border-[#1F2421] flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#F4F7F5]">
            02. Eyewear Fit &amp; Framing
          </h2>
          <button
            type="button"
            onClick={() =>
              onUpdateSettings({
                glassesScale: 1.0,
                glassesOffsetY: 0,
                glassesOffsetX: 0,
              })
            }
            className="text-xs text-[#8A9990] hover:text-[#F4F7F5] transition-colors cursor-pointer"
          >
            Center Fit
          </button>
        </div>

        {/* Framing Mode Segmented Control */}
        <div>
          <label className="block text-xs text-[#8A9990] mb-1.5">
            Portrait Composition Alignment
          </label>
          <div className="grid grid-cols-2 gap-1 p-1 bg-[#050505] border border-[#1F2421] rounded-lg">
            <button
              type="button"
              onClick={() => onUpdateSettings({ framingMode: 'reference-offset' })}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap truncate cursor-pointer ${
                settings.framingMode === 'reference-offset'
                  ? 'bg-[#141E18] text-[#00FF66]'
                  : 'text-[#8A9990] hover:text-[#F4F7F5]'
              }`}
            >
              Match Reference GIF
            </button>
            <button
              type="button"
              onClick={() => onUpdateSettings({ framingMode: 'centered' })}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap truncate cursor-pointer ${
                settings.framingMode === 'centered'
                  ? 'bg-[#141E18] text-[#00FF66]'
                  : 'text-[#8A9990] hover:text-[#F4F7F5]'
              }`}
            >
              Centered Portrait
            </button>
          </div>
        </div>

        {/* Glasses Scale Slider */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-[#8A9990]">Glasses Lens Scale</span>
            <span className="font-mono tabular-nums text-[#F4F7F5]">
              {Math.round(settings.glassesScale * 100)}%
            </span>
          </div>
          <input
            type="range"
            min="0.75"
            max="1.35"
            step="0.02"
            value={settings.glassesScale}
            onChange={(e) => onUpdateSettings({ glassesScale: parseFloat(e.target.value) })}
            className="w-full accent-[#00FF66] cursor-pointer"
          />
        </div>

        {/* Glasses Vertical Offset */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-[#8A9990]">Vertical Eye Line Offset</span>
            <span className="font-mono tabular-nums text-[#F4F7F5]">
              {settings.glassesOffsetY > 0
                ? `+${settings.glassesOffsetY}%`
                : `${settings.glassesOffsetY}%`}
            </span>
          </div>
          <input
            type="range"
            min="-8"
            max="8"
            step="0.5"
            value={settings.glassesOffsetY}
            onChange={(e) => onUpdateSettings({ glassesOffsetY: parseFloat(e.target.value) })}
            className="w-full accent-[#00FF66] cursor-pointer"
          />
        </div>

        {/* Glasses Horizontal Offset */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-[#8A9990]">Horizontal Bridge Offset</span>
            <span className="font-mono tabular-nums text-[#F4F7F5]">
              {settings.glassesOffsetX > 0
                ? `+${settings.glassesOffsetX}%`
                : `${settings.glassesOffsetX}%`}
            </span>
          </div>
          <input
            type="range"
            min="-8"
            max="8"
            step="0.5"
            value={settings.glassesOffsetX}
            onChange={(e) => onUpdateSettings({ glassesOffsetX: parseFloat(e.target.value) })}
            className="w-full accent-[#00FF66] cursor-pointer"
          />
        </div>
      </div>

      {/* Section 3: Matrix Code Rain & Phosphor Tuning */}
      <div className="pt-5 border-t border-[#1F2421] flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#F4F7F5]">
            03. Matrix Phosphor &amp; Frame Rate
          </h2>
          <button
            type="button"
            onClick={onResetDefaults}
            className="text-xs text-[#8A9990] hover:text-[#F4F7F5] transition-colors cursor-pointer"
          >
            Reset All
          </button>
        </div>

        {/* Rain Speed */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-[#8A9990]">Digital Rain Fall Velocity</span>
            <span className="font-mono tabular-nums text-[#F4F7F5]">
              {settings.rainSpeed.toFixed(1)}x
            </span>
          </div>
          <input
            type="range"
            min="0.4"
            max="2.2"
            step="0.1"
            value={settings.rainSpeed}
            onChange={(e) => onUpdateSettings({ rainSpeed: parseFloat(e.target.value) })}
            className="w-full accent-[#00FF66] cursor-pointer"
          />
        </div>

        {/* Face Contrast */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-[#8A9990]">Portrait Silhouette Contrast</span>
            <span className="font-mono tabular-nums text-[#F4F7F5]">
              {Math.round(settings.faceContrast * 100)}%
            </span>
          </div>
          <input
            type="range"
            min="0.7"
            max="1.5"
            step="0.05"
            value={settings.faceContrast}
            onChange={(e) => onUpdateSettings({ faceContrast: parseFloat(e.target.value) })}
            className="w-full accent-[#00FF66] cursor-pointer"
          />
        </div>

        {/* Phosphor Cyan-Green Highlight Bloom */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-[#8A9990]">Green Phosphor Intensity</span>
            <span className="font-mono tabular-nums text-[#F4F7F5]">
              {Math.round(settings.phosphorBloom * 100)}%
            </span>
          </div>
          <input
            type="range"
            min="0.75"
            max="1.4"
            step="0.05"
            value={settings.phosphorBloom}
            onChange={(e) => onUpdateSettings({ phosphorBloom: parseFloat(e.target.value) })}
            className="w-full accent-[#00FF66] cursor-pointer"
          />
        </div>

        {/* GIF Resolution Selector */}
        <div>
          <label className="block text-xs text-[#8A9990] mb-1.5">
            Canvas &amp; .GIF Resolution
          </label>
          <div className="grid grid-cols-3 gap-1 p-1 bg-[#050505] border border-[#1F2421] rounded-lg font-mono tabular-nums">
            {([250, 360, 480] as const).map((res) => (
              <button
                key={res}
                type="button"
                onClick={() => onUpdateSettings({ resolution: res })}
                className={`px-2 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  settings.resolution === res
                    ? 'bg-[#141E18] text-[#00FF66]'
                    : 'text-[#8A9990] hover:text-[#F4F7F5]'
                }`}
              >
                {res}×{res}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Section 4: Primary GIF Export Action */}
      <div className="pt-5 border-t border-[#1F2421]">
        <button
          type="button"
          onClick={onExportGif}
          disabled={isEncoding}
          className="w-full py-2.5 px-4 text-xs font-semibold text-[#050505] bg-[#00FF66] hover:bg-[#26FF7E] rounded-xl transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50"
        >
          {isEncoding
            ? `Encoding Smooth Animated .GIF (${encodeProgress}%)`
            : 'Export Animated .GIF File'}
        </button>
      </div>
    </aside>
  );
};

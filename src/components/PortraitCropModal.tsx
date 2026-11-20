import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GLASSES_PRESETS } from '../utils/glassesPresets';

export interface CropPrepSettings {
  zoom: number;
  panX: number; // normalized -1.5..1.5 range
  panY: number; // normalized -1.5..1.5 range
  autoBw: boolean;
  contrast: number; // 0.5..2.5
  brightness: number; // -0.4..0.4
  bgBlackCutoff: number; // 0..0.60 clips dark backgrounds to pure #000000
  showEyeGuide: boolean;
}

export const DEFAULT_CROP_SETTINGS: CropPrepSettings = {
  zoom: 1.0,
  panX: 0,
  panY: 0,
  autoBw: true,
  contrast: 1.35,
  brightness: 0.04,
  bgBlackCutoff: 0.14,
  showEyeGuide: true,
};

interface PortraitCropModalProps {
  sourceImageUrl: string;
  initialSettings: CropPrepSettings;
  activeGlassesId: string;
  framingMode: 'reference-offset' | 'centered';
  glassesScale: number;
  glassesOffsetX: number;
  glassesOffsetY: number;
  onApplyCroppedPortrait: (processedDataUrl: string, savedSettings: CropPrepSettings) => void;
  onCancel: () => void;
}

export const PortraitCropModal: React.FC<PortraitCropModalProps> = ({
  sourceImageUrl,
  initialSettings,
  activeGlassesId,
  framingMode,
  glassesScale,
  glassesOffsetX,
  glassesOffsetY,
  onApplyCroppedPortrait,
  onCancel,
}) => {
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rawImageRef = useRef<HTMLImageElement | null>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [crop, setCrop] = useState<CropPrepSettings>(initialSettings);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; panX: number; panY: number }>({
    x: 0,
    y: 0,
    panX: 0,
    panY: 0,
  });

  // Sync initialSettings whenever modal opens
  useEffect(() => {
    setCrop(initialSettings);
  }, [initialSettings]);

  // Load the raw uploaded image reliably (avoid crossOrigin on data:/blob: URLs)
  useEffect(() => {
    setImgLoaded(false);
    const img = new Image();
    if (!sourceImageUrl.startsWith('data:') && !sourceImageUrl.startsWith('blob:')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => {
      rawImageRef.current = img;
      setImgLoaded(true);
    };
    img.src = sourceImageUrl;
  }, [sourceImageUrl]);

  /**
   * Renders the cropped, zoomed, panned, and high-contrast B&W processed image onto a square canvas.
   * Because both the preview canvas and the final 600x600 output canvas use normalized coordinates,
   * what you see in the Crop & Zoom preview is 100% identical to what gets applied to the Matrix canvas.
   */
  const renderProcessedCanvas = useCallback(
    (targetCanvas: HTMLCanvasElement, cfg: CropPrepSettings, includeGuide: boolean) => {
      const img = rawImageRef.current;
      if (!img) return;

      const ctx = targetCanvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      const size = targetCanvas.width;
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, size, size);

      const srcW = img.naturalWidth || img.width || 1;
      const srcH = img.naturalHeight || img.height || 1;

      // Base cover scale at zoom = 1.0
      const scaleCover = Math.max(size / srcW, size / srcH) * cfg.zoom;
      const drawW = srcW * scaleCover;
      const drawH = srcH * scaleCover;

      const drawX = (size - drawW) * 0.5 + cfg.panX * size * 0.5;
      const drawY = (size - drawH) * 0.5 + cfg.panY * size * 0.5;

      ctx.drawImage(img, drawX, drawY, drawW, drawH);

      // Apply Monochrome Contrast, Background Black Cutoff, and Skin Highlight Exposure
      const imageData = ctx.getImageData(0, 0, size, size);
      const data = imageData.data;
      const contrastFactor = cfg.contrast;
      const exposureOffset = cfg.brightness * 255;
      const cutoff = cfg.bgBlackCutoff * 255;

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = data[i + 3] / 255;

        // Composite transparent pixels over black
        let lum = (r * 0.299 + g * 0.587 + b * 0.114) * a;

        // 1. Apply Skin Highlight Exposure boost/cut
        lum = lum + exposureOffset;

        if (cfg.autoBw) {
          // 2. Apply Background Black Cutoff: anything below cutoff becomes pure #000000
          if (lum <= cutoff) {
            lum = 0;
          } else {
            // Normalize remaining range [cutoff .. 255] to [0 .. 1]
            const norm = Math.min(1, Math.max(0, (lum - cutoff) / Math.max(1, 255 - cutoff)));
            // 3. Apply Monochrome Contrast curve around midpoint 0.45
            const contrasted = Math.pow(norm, 1 / Math.max(0.35, contrastFactor * 0.85)) * contrastFactor;
            lum = Math.max(0, Math.min(255, Math.round(contrasted * 255)));
          }
        } else {
          lum = Math.max(0, Math.min(255, Math.round(lum)));
        }

        data[i] = lum;
        data[i + 1] = lum;
        data[i + 2] = lum;
        data[i + 3] = 255;
      }
      ctx.putImageData(imageData, 0, 0);

      // Draw visual eyewear & eye-line alignment guide matching the exact MatrixPortraitEngine placement
      if (includeGuide && cfg.showEyeGuide) {
        const preset =
          GLASSES_PRESETS.find((p) => p.id === activeGlassesId) || GLASSES_PRESETS[0];

        // Exact same coordinate math as MatrixPortraitEngine when isCustomCropped = true
        const centerShiftX = framingMode === 'reference-offset' ? -size * 0.085 : 0;
        const guideCenterX = size * 0.5 + centerShiftX + (glassesOffsetX / 100) * size;
        const guideEyeY = size * 0.435 + (glassesOffsetY / 100) * size;
        const guideFaceW = size * 0.54 * glassesScale;

        ctx.save();
        ctx.strokeStyle = 'rgba(0, 255, 102, 0.55)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);

        // Horizontal eye line & vertical centerline
        ctx.beginPath();
        ctx.moveTo(size * 0.08, guideEyeY);
        ctx.lineTo(size * 0.92, guideEyeY);
        ctx.moveTo(guideCenterX, size * 0.08);
        ctx.lineTo(guideCenterX, size * 0.92);
        ctx.stroke();

        // Head oval guide
        ctx.beginPath();
        ctx.ellipse(
          guideCenterX,
          size * 0.49,
          guideFaceW * 0.54,
          size * 0.37,
          0,
          0,
          Math.PI * 2
        );
        ctx.stroke();

        // Active custom glasses silhouette preview outline
        ctx.setLineDash([]);
        ctx.strokeStyle = '#00FF66';
        ctx.lineWidth = 2.2;
        preset.drawMask(ctx, guideCenterX, guideEyeY, guideFaceW, 'rim');

        ctx.restore();
      }
    },
    [activeGlassesId, framingMode, glassesScale, glassesOffsetX, glassesOffsetY]
  );

  // Redraw preview whenever crop settings or image change
  useEffect(() => {
    if (!imgLoaded || !previewCanvasRef.current) return;
    renderProcessedCanvas(previewCanvasRef.current, crop, true);
  }, [imgLoaded, crop, renderProcessedCanvas]);

  // Pointer drag-to-pan handlers
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: crop.panX,
      panY: crop.panY,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDragging || !previewCanvasRef.current) return;
    const rect = previewCanvasRef.current.getBoundingClientRect();
    const dx = (e.clientX - dragStartRef.current.x) / (rect.width * 0.5);
    const dy = (e.clientY - dragStartRef.current.y) / (rect.height * 0.5);

    setCrop((prev) => ({
      ...prev,
      panX: Number(Math.max(-1.8, Math.min(1.8, dragStartRef.current.panX + dx)).toFixed(3)),
      panY: Number(Math.max(-1.8, Math.min(1.8, dragStartRef.current.panY + dy)).toFixed(3)),
    }));
  };

  const handlePointerUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.08 : -0.08;
    setCrop((prev) => ({
      ...prev,
      zoom: Math.max(0.4, Math.min(3.0, Number((prev.zoom + delta).toFixed(2)))),
    }));
  };

  const handleConfirmApply = () => {
    if (!imgLoaded) return;
    // Bake a clean 600x600 high-contrast B&W square portrait without the green alignment reticle
    // AND persist the exact CropPrepSettings in App state so nothing is ever lost!
    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = 600;
    outputCanvas.height = 600;
    renderProcessedCanvas(outputCanvas, crop, false);
    const dataUrl = outputCanvas.toDataURL('image/png');
    onApplyCroppedPortrait(dataUrl, crop);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="crop-modal-title"
    >
      <div className="w-full max-w-[840px] bg-[#0B0D0C] border border-[#1F2421] rounded-2xl p-6 shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between gap-4 pb-4 mb-6 border-b border-[#1F2421]">
          <div>
            <div className="text-xs text-[#00FF66] font-mono tabular-nums">
              <span>Portrait Pre-Processor</span>
              <span aria-hidden="true"> · </span>
              <span>Saves Crop, Pan, Zoom &amp; B&amp;W Curves Directly to Matrix Canvas</span>
            </div>
            <h2 id="crop-modal-title" className="text-lg font-bold text-[#F4F7F5] mt-0.5">
              Crop, Zoom &amp; Align Subject Eyes
            </h2>
          </div>

          <button
            type="button"
            onClick={onCancel}
            aria-label="Close crop studio"
            className="w-8 h-8 rounded-lg bg-[#141816] hover:bg-[#1F2622] border border-[#262E29] text-[#8A9990] hover:text-[#F4F7F5] flex items-center justify-center transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
          {/* Interactive Viewport (7 cols) */}
          <div className="md:col-span-7 flex flex-col items-center bg-[#050505] border border-[#1F2421] rounded-xl p-4">
            <div className="w-full flex items-center justify-between text-xs text-[#8A9990] font-mono tabular-nums mb-3">
              <span>
                Drag to Pan ({Math.round(crop.panX * 100)}%, {Math.round(crop.panY * 100)}%)
              </span>
              <button
                type="button"
                onClick={() =>
                  setCrop((prev) => ({ ...prev, showEyeGuide: !prev.showEyeGuide }))
                }
                className="text-[#00FF66] hover:underline cursor-pointer"
              >
                {crop.showEyeGuide ? 'Hide Glasses Guide' : 'Show Glasses Guide'}
              </button>
            </div>

            <div className="w-full max-w-[350px] aspect-square bg-black rounded-lg overflow-hidden border border-[#1A241E] relative select-none">
              <canvas
                ref={previewCanvasRef}
                width={420}
                height={420}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onWheel={handleWheel}
                className={`w-full h-full object-contain touch-none ${
                  isDragging ? 'cursor-grabbing' : 'cursor-grab'
                }`}
              />
            </div>

            <div className="w-full flex items-center justify-between text-xs text-[#8A9990] mt-3">
              <span>Align eyes inside the green glasses outline</span>
              <button
                type="button"
                onClick={() => setCrop((prev) => ({ ...prev, panX: 0, panY: 0 }))}
                className="text-[#00FF66] hover:underline cursor-pointer"
              >
                Center Pan
              </button>
            </div>
          </div>

          {/* Controls Column (5 cols) */}
          <div className="md:col-span-5 flex flex-col gap-4">
            {/* Auto High-Contrast B&W Toggle */}
            <div className="bg-[#050505] border border-[#1F2421] rounded-xl p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold text-[#F4F7F5]">
                    Auto High-Contrast B&amp;W
                  </div>
                  <div className="text-[11px] text-[#8A9990] mt-0.5">
                    Applies monochrome contrast &amp; black cutoff
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setCrop((prev) => ({ ...prev, autoBw: !prev.autoBw }))}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                    crop.autoBw
                      ? 'bg-[#0F1913] border-[#00FF66] text-[#00FF66]'
                      : 'bg-[#141816] border-[#262E29] text-[#8A9990]'
                  }`}
                >
                  {crop.autoBw ? 'Enabled' : 'Raw Luminance'}
                </button>
              </div>
            </div>

            {/* Zoom & Framing Sliders */}
            <div className="bg-[#050505] border border-[#1F2421] rounded-xl p-4 flex flex-col gap-3.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#F4F7F5]">
                  Crop &amp; Luminance Tuning
                </span>
                <button
                  type="button"
                  onClick={() => setCrop(DEFAULT_CROP_SETTINGS)}
                  className="text-xs text-[#8A9990] hover:text-[#F4F7F5] transition-colors cursor-pointer"
                >
                  Reset Sliders
                </button>
              </div>

              {/* Zoom Scale */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-[#8A9990]">Zoom Scale</span>
                  <span className="font-mono tabular-nums text-[#F4F7F5]">
                    {Math.round(crop.zoom * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.4"
                  max="3.0"
                  step="0.05"
                  value={crop.zoom}
                  onChange={(e) =>
                    setCrop((prev) => ({ ...prev, zoom: parseFloat(e.target.value) }))
                  }
                  className="w-full accent-[#00FF66] cursor-pointer"
                />
              </div>

              {/* Monochrome Contrast */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-[#8A9990]">Monochrome Contrast</span>
                  <span className="font-mono tabular-nums text-[#F4F7F5]">
                    {Math.round(crop.contrast * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="2.5"
                  step="0.05"
                  disabled={!crop.autoBw}
                  value={crop.contrast}
                  onChange={(e) =>
                    setCrop((prev) => ({ ...prev, contrast: parseFloat(e.target.value) }))
                  }
                  className="w-full accent-[#00FF66] cursor-pointer disabled:opacity-40"
                />
              </div>

              {/* Background Black Cutoff */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-[#8A9990]">Background Black Cutoff</span>
                  <span className="font-mono tabular-nums text-[#F4F7F5]">
                    {Math.round(crop.bgBlackCutoff * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="0.6"
                  step="0.02"
                  disabled={!crop.autoBw}
                  value={crop.bgBlackCutoff}
                  onChange={(e) =>
                    setCrop((prev) => ({
                      ...prev,
                      bgBlackCutoff: parseFloat(e.target.value),
                    }))
                  }
                  className="w-full accent-[#00FF66] cursor-pointer disabled:opacity-40"
                />
              </div>

              {/* Skin Highlight Exposure */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-[#8A9990]">Skin Highlight Exposure</span>
                  <span className="font-mono tabular-nums text-[#F4F7F5]">
                    {crop.brightness >= 0
                      ? `+${Math.round(crop.brightness * 100)}%`
                      : `${Math.round(crop.brightness * 100)}%`}
                  </span>
                </div>
                <input
                  type="range"
                  min="-0.4"
                  max="0.4"
                  step="0.02"
                  value={crop.brightness}
                  onChange={(e) =>
                    setCrop((prev) => ({
                      ...prev,
                      brightness: parseFloat(e.target.value),
                    }))
                  }
                  className="w-full accent-[#00FF66] cursor-pointer"
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 text-xs font-medium text-[#8A9990] hover:text-[#F4F7F5] bg-[#141816] border border-[#262E29] rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmApply}
                disabled={!imgLoaded}
                className="px-5 py-2 text-xs font-semibold text-[#050505] bg-[#00FF66] hover:bg-[#26FF7E] rounded-xl transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50"
              >
                Apply to Matrix Canvas
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

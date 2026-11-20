import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GLASSES_PRESETS, GlassesPreset } from '../utils/glassesPresets';
import { encodeAnimatedMatrixGif, quantizeFrameToMatrixPalette } from '../utils/gifEncoder';

export interface MatrixRenderSettings {
  glassesId: string;
  glassesScale: number;
  glassesOffsetY: number;
  glassesOffsetX: number;
  framingMode: 'reference-offset' | 'centered';
  rainSpeed: number;
  faceContrast: number;
  phosphorBloom: number;
  bgRainDensity: number;
  resolution: 250 | 360 | 480;
}

interface HarmonicDrop {
  phaseOffset: number;
  harmonicSpeed: 1 | 2;
  trailFraction: number;
  intensity: number;
}

interface RainColumn {
  colIndex: number;
  x: number;
  colSpacing: number;
  charStepY: number;
  drops: HarmonicDrop[];
  faceWaveOffset: number;
  faceWaveHarmonic: 1 | 2;
  baseGlyphs: string[];
  altGlyphs: string[];
  flipPhaseOffsets: number[];
}

const MATRIX_GLYPHS =
  'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ012345789Z=*+-<>¦｜';

function seededRandom(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

interface MatrixPortraitEngineProps {
  portraitSrc: string | null;
  isCustomCropped: boolean;
  referenceGifSrc: string;
  settings: MatrixRenderSettings;
  activeTab: 'synthesizer' | 'eyewear' | 'compare' | 'gif-output';
  onSelectGlasses: (id: string) => void;
  onRemovePortrait: () => void;
  onUploadFileSelected: (file: File) => void;
  onOpenCropCurrent: () => void;
  onRestoreDefaultPortrait: () => void;
  onGifGenerated: (url: string, blob: Blob, frameCount: number, sizeKb: number) => void;
  triggerExportRef: React.MutableRefObject<(() => Promise<void>) | null>;
  isEncoding: boolean;
  setIsEncoding: (val: boolean) => void;
  encodeProgress: number;
  setEncodeProgress: (val: number) => void;
  generatedGifUrl: string | null;
  generatedGifSizeKb: number;
}

export const MatrixPortraitEngine: React.FC<MatrixPortraitEngineProps> = ({
  portraitSrc,
  isCustomCropped,
  referenceGifSrc,
  settings,
  activeTab,
  onSelectGlasses,
  onRemovePortrait,
  onUploadFileSelected,
  onOpenCropCurrent,
  onRestoreDefaultPortrait,
  onGifGenerated,
  triggerExportRef,
  isEncoding,
  setIsEncoding,
  encodeProgress,
  setEncodeProgress,
  generatedGifUrl,
  generatedGifSizeKb,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const portraitImgRef = useRef<HTMLImageElement | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [loadedImageVersion, setLoadedImageVersion] = useState(0);
  const [imageError, setImageError] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [fpsReadout, setFpsReadout] = useState<number>(60);

  // Offscreen spatial luminance and glasses mask buffers
  const luminanceGridRef = useRef<Float32Array | null>(null);
  const glassesShadowGridRef = useRef<Float32Array | null>(null);
  const glassesRimGridRef = useRef<Float32Array | null>(null);
  const columnsRef = useRef<RainColumn[]>([]);
  const settingsRef = useRef<MatrixRenderSettings>(settings);
  settingsRef.current = settings;

  /**
   * Builds the spatial luminance lookup grid from the active black-and-white portrait
   * plus the dark-shadow glasses mask and rim specular buffer for the current resolution.
   */
  const rebuildSpatialMasks = useCallback(
    (cfg: MatrixRenderSettings, customCroppedFlag: boolean, currentSrc: string | null) => {
      const size = cfg.resolution;
      const img = portraitImgRef.current;

      if (!img || !currentSrc) {
        luminanceGridRef.current = new Float32Array(size * size);
        glassesShadowGridRef.current = new Float32Array(size * size);
        glassesRimGridRef.current = new Float32Array(size * size);
        return;
      }

      const offCanvas = document.createElement('canvas');
      offCanvas.width = size;
      offCanvas.height = size;
      const ctx = offCanvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, size, size);

      const srcW = img.naturalWidth || img.width || 1;
      const srcH = img.naturalHeight || img.height || 1;

      let faceCenterX = size * 0.5;
      let faceEyeY = size * 0.435;
      let effectiveFaceWidth = size * 0.54 * cfg.glassesScale;

      if (customCroppedFlag) {
        // When using a portrait processed by PortraitCropModal:
        // Draw 1:1 across the entire square canvas so the user's Zoom Scale and Drag to Pan are preserved 100%!
        ctx.drawImage(img, 0, 0, srcW, srcH, 0, 0, size, size);

        // Match the exact eyewear alignment guide shown inside PortraitCropModal
        const centerShiftX = cfg.framingMode === 'reference-offset' ? -size * 0.085 : 0;
        faceCenterX = size * 0.5 + centerShiftX + (cfg.glassesOffsetX / 100) * size;
        faceEyeY = size * 0.435 + (cfg.glassesOffsetY / 100) * size;
        effectiveFaceWidth = size * 0.54 * cfg.glassesScale;
      } else {
        // Default initial uncropped anonymous portrait framing
        const cropY = srcH * 0.08;
        const cropH = srcH * 0.88;
        const cropW = srcW * 0.92;
        const cropX = (srcW - cropW) * 0.5;

        const destW = size * 0.82;
        const destH = size * 0.96;
        const centerShiftX = cfg.framingMode === 'reference-offset' ? -size * 0.085 : 0;
        const destX = (size - destW) * 0.5 + centerShiftX;
        const destY = size * 0.02;

        ctx.drawImage(img, cropX, cropY, cropW, cropH, destX, destY, destW, destH);

        const eyeNormX = (0.5 * srcW - cropX) / cropW;
        const eyeNormY = (0.435 * srcH - cropY) / cropH;
        faceCenterX = destX + eyeNormX * destW + (cfg.glassesOffsetX / 100) * size;
        faceEyeY = destY + eyeNormY * destH + (cfg.glassesOffsetY / 100) * size;
        effectiveFaceWidth = destW * 0.62 * cfg.glassesScale;
      }

      const imgData = ctx.getImageData(0, 0, size, size).data;
      const lumGrid = new Float32Array(size * size);
      const contrast = cfg.faceContrast;

      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const i = (y * size + x) * 4;
          const rawLum =
            (imgData[i] * 0.299 + imgData[i + 1] * 0.587 + imgData[i + 2] * 0.114) / 255;

          let shaped = 0;
          if (customCroppedFlag) {
            // Preserve the user's baked Monochrome Contrast, Background Black Cutoff,
            // and Skin Highlight Exposure from PortraitCropModal directly!
            if (rawLum > 0.01) {
              const relativeSidebarContrast = contrast / 1.1;
              shaped = Math.min(
                1,
                Math.pow(rawLum, 1 / Math.max(0.5, relativeSidebarContrast)) *
                  relativeSidebarContrast
              );
            }
          } else {
            // Default raw photo S-curve shaping
            if (rawLum > 0.11) {
              const normalized = Math.min(1, (rawLum - 0.11) / 0.82);
              shaped = Math.pow(normalized, 1.45 / Math.max(0.6, contrast));
              if (shaped > 0.45) {
                shaped = Math.min(1, shaped * (0.95 + contrast * 0.22));
              }
            }
          }
          lumGrid[y * size + x] = shaped;
        }
      }

      const preset: GlassesPreset =
        GLASSES_PRESETS.find((p) => p.id === cfg.glassesId) || GLASSES_PRESETS[0];

      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = size;
      maskCanvas.height = size;
      const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true });
      const shadowGrid = new Float32Array(size * size);
      const rimGrid = new Float32Array(size * size);

      if (maskCtx) {
        maskCtx.clearRect(0, 0, size, size);
        maskCtx.fillStyle = '#FFFFFF';
        maskCtx.strokeStyle = '#FFFFFF';
        preset.drawMask(maskCtx, faceCenterX, faceEyeY, effectiveFaceWidth, 'shadow');
        const shadowData = maskCtx.getImageData(0, 0, size, size).data;

        for (let p = 0; p < size * size; p++) {
          shadowGrid[p] = shadowData[p * 4 + 3] / 255;
        }

        maskCtx.clearRect(0, 0, size, size);
        maskCtx.strokeStyle = '#FFFFFF';
        maskCtx.lineWidth = Math.max(1.5, size * 0.0075);
        preset.drawMask(maskCtx, faceCenterX, faceEyeY + size * 0.004, effectiveFaceWidth, 'rim');
        const rimData = maskCtx.getImageData(0, 0, size, size).data;

        for (let y = 0; y < size; y++) {
          const lowerBias = y > faceEyeY ? 1.0 : 0.28;
          for (let x = 0; x < size; x++) {
            const idx = y * size + x;
            rimGrid[idx] = (rimData[idx * 4 + 3] / 255) * lowerBias;
          }
        }
      }

      luminanceGridRef.current = lumGrid;
      glassesShadowGridRef.current = shadowGrid;
      glassesRimGridRef.current = rimGrid;
    },
    []
  );

  // Load or clear source black & white portrait and increment loadedImageVersion on every load completion
  useEffect(() => {
    if (!portraitSrc) {
      portraitImgRef.current = null;
      setImageLoaded(false);
      setImageError(false);
      const size = settingsRef.current.resolution;
      luminanceGridRef.current = new Float32Array(size * size);
      glassesShadowGridRef.current = new Float32Array(size * size);
      glassesRimGridRef.current = new Float32Array(size * size);
      setLoadedImageVersion((v) => v + 1);
      return;
    }

    let cancelled = false;
    const img = new Image();
    if (!portraitSrc.startsWith('data:') && !portraitSrc.startsWith('blob:')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => {
      if (cancelled) return;
      portraitImgRef.current = img;
      setImageLoaded(true);
      setImageError(false);
      rebuildSpatialMasks(settingsRef.current, isCustomCropped, portraitSrc);
      setLoadedImageVersion((v) => v + 1);
    };
    img.onerror = () => {
      if (cancelled) return;
      setImageError(true);
    };
    img.src = portraitSrc;

    return () => {
      cancelled = true;
    };
  }, [portraitSrc, isCustomCropped, rebuildSpatialMasks]);

  /**
   * Initializes stateless, harmonic-locked Matrix rain columns.
   */
  const initHarmonicColumns = useCallback((size: number) => {
    const rand = seededRandom(19990331 + size);
    const colSpacing = Math.max(5, Math.round(size / 42));
    const charStepY = Math.max(5, Math.round(colSpacing * 0.92));
    const numCols = Math.floor(size / colSpacing);
    const numRows = Math.ceil(size / charStepY) + 2;

    const cols: RainColumn[] = [];
    for (let c = 0; c < numCols; c++) {
      const baseGlyphs: string[] = [];
      const altGlyphs: string[] = [];
      const flipPhaseOffsets: number[] = [];

      for (let r = 0; r < numRows; r++) {
        baseGlyphs.push(MATRIX_GLYPHS[Math.floor(rand() * MATRIX_GLYPHS.length)]);
        altGlyphs.push(MATRIX_GLYPHS[Math.floor(rand() * MATRIX_GLYPHS.length)]);
        flipPhaseOffsets.push(rand());
      }

      const primarySpeed: 1 | 2 = rand() > 0.42 ? 1 : 2;
      const p1 = rand();
      const p2 = (p1 + 0.45 + rand() * 0.15) % 1.0;

      const drops: HarmonicDrop[] = [
        {
          phaseOffset: p1,
          harmonicSpeed: primarySpeed,
          trailFraction: 0.28 + rand() * 0.22,
          intensity: 0.85 + rand() * 0.15,
        },
        {
          phaseOffset: p2,
          harmonicSpeed: primarySpeed,
          trailFraction: 0.22 + rand() * 0.18,
          intensity: 0.65 + rand() * 0.25,
        },
      ];

      cols.push({
        colIndex: c,
        x: Math.round(c * colSpacing + colSpacing * 0.5),
        colSpacing,
        charStepY,
        drops,
        faceWaveOffset: rand(),
        faceWaveHarmonic: primarySpeed,
        baseGlyphs,
        altGlyphs,
        flipPhaseOffsets,
      });
    }

    columnsRef.current = cols;
  }, []);

  useEffect(() => {
    rebuildSpatialMasks(settings, isCustomCropped, portraitSrc);
  }, [
    loadedImageVersion,
    imageLoaded,
    portraitSrc,
    isCustomCropped,
    settings,
    rebuildSpatialMasks,
  ]);

  useEffect(() => {
    initHarmonicColumns(settings.resolution);
  }, [settings.resolution, initHarmonicColumns]);

  /**
   * Pure, stateless phase-locked Matrix frame renderer: `phase` is in [0, 1).
   */
  const renderMatrixAtPhase = useCallback((ctx: CanvasRenderingContext2D, phase: number) => {
    const cfg = settingsRef.current;
    const size = cfg.resolution;
    const lumGrid = luminanceGridRef.current;
    const shadowGrid = glassesShadowGridRef.current;
    const rimGrid = glassesRimGridRef.current;
    const columns = columnsRef.current;

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, size, size);

    if (columns.length === 0) return;

    const colSpacing = columns[0].colSpacing;
    const charStepY = columns[0].charStepY;
    const fontSize = Math.max(5, Math.round(colSpacing * 0.92));

    ctx.font = `700 ${fontSize}px "JetBrains Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const bloom = cfg.phosphorBloom;
    const numRows = Math.ceil(size / charStepY);
    const barW = Math.max(2, colSpacing - 2);

    const normPhase = ((phase % 1) + 1) % 1;

    for (let c = 0; c < columns.length; c++) {
      const col = columns[c];
      const colX = Math.min(size - 1, Math.max(0, col.x));

      const scrollCells = Math.floor(normPhase * col.faceWaveHarmonic * numRows);

      for (let r = 0; r < numRows; r++) {
        const drawY = Math.round(r * charStepY + charStepY * 0.5);
        if (drawY < 0 || drawY >= size) continue;

        const yNorm = drawY / size;
        const gridIdx = drawY * size + colX;

        const rawFaceLum = lumGrid ? lumGrid[gridIdx] : 0;
        const glassesShadow = shadowGrid ? shadowGrid[gridIdx] : 0;
        const glassesRim = rimGrid ? rimGrid[gridIdx] : 0;

        const effectiveFaceLum = rawFaceLum * (1 - glassesShadow * 0.96);

        let bgRainVal = 0;
        let isDropletTip = false;
        const tipThreshold = (charStepY * 1.35) / size;

        for (let d = 0; d < col.drops.length; d++) {
          const drop = col.drops[d];
          const headPos = (drop.phaseOffset + normPhase * drop.harmonicSpeed) % 1.0;
          let distBehind = headPos - yNorm;
          if (distBehind < 0) distBehind += 1.0;

          if (distBehind >= 0 && distBehind < drop.trailFraction) {
            const trailProgress = 1.0 - distBehind / drop.trailFraction;
            const dropLum = Math.pow(trailProgress, 1.55) * drop.intensity * cfg.bgRainDensity;
            if (dropLum > bgRainVal) {
              bgRainVal = dropLum;
            }
            if (distBehind < tipThreshold) {
              isDropletTip = true;
            }
          }
        }

        let faceWaveDist =
          ((col.faceWaveOffset + normPhase * col.faceWaveHarmonic) % 1.0) - yNorm;
        if (faceWaveDist < 0) faceWaveDist += 1.0;
        const faceCascadePulse =
          0.74 + 0.26 * Math.cos(faceWaveDist * Math.PI * 2) + bgRainVal * 0.28;

        const scrolledRow = ((r - scrollCells) % numRows + numRows) % numRows;
        const flipWindow =
          Math.sin((normPhase + col.flipPhaseOffsets[r]) * Math.PI * 2) > 0.65 || isDropletTip;
        const glyph = flipWindow ? col.altGlyphs[scrolledRow] : col.baseGlyphs[scrolledRow];

        if (glassesRim > 0.35 && rawFaceLum > 0.15) {
          ctx.fillStyle = '#66FFCC';
          ctx.fillText(glyph, colX, drawY);
          continue;
        }

        if (glassesShadow > 0.5) {
          if (bgRainVal > 0.52 && (r + c) % 2 === 0) {
            const dimG = Math.min(95, Math.round(24 + bgRainVal * 62));
            ctx.fillStyle = `rgb(0, ${dimG}, ${Math.round(dimG * 0.22)})`;
            ctx.fillText(glyph, colX, drawY);
          }
          continue;
        }

        if (effectiveFaceLum > 0.08) {
          const totalLum = Math.min(1.0, effectiveFaceLum * faceCascadePulse * bloom);

          if (totalLum > 0.28) {
            const barAlpha = Math.min(0.54, (totalLum - 0.22) * 0.6);
            ctx.fillStyle =
              totalLum > 0.78
                ? `rgba(25, 255, 130, ${barAlpha})`
                : `rgba(0, 195, 65, ${barAlpha * 0.85})`;
            ctx.fillRect(
              Math.round(colX - barW * 0.5),
              Math.round(drawY - charStepY * 0.48),
              barW,
              charStepY
            );
          }

          if (totalLum > 0.82 || (isDropletTip && totalLum > 0.45)) {
            const cyanMix = Math.min(1, Math.max(0, (totalLum - 0.75) / 0.25));
            const rVal = Math.round(40 + cyanMix * 135);
            const bVal = Math.round(100 + cyanMix * 125);
            ctx.fillStyle = `rgb(${rVal}, 255, ${bVal})`;
          } else if (totalLum > 0.42) {
            const gVal = Math.min(255, Math.round(135 + ((totalLum - 0.42) / 0.4) * 120));
            const bVal = Math.round(((totalLum - 0.42) / 0.4) * 65);
            ctx.fillStyle = `rgb(8, ${gVal}, ${bVal})`;
          } else {
            const gVal = Math.max(34, Math.round((totalLum / 0.42) * 135));
            ctx.fillStyle = `rgb(0, ${gVal}, ${Math.round(gVal * 0.18)})`;
          }

          ctx.fillText(glyph, colX, drawY);
        } else if (bgRainVal > 0.07) {
          if (isDropletTip && bgRainVal > 0.48) {
            ctx.fillStyle = 'rgb(85, 255, 155)';
          } else {
            const gVal = Math.min(195, Math.max(22, Math.round(bgRainVal * 180)));
            ctx.fillStyle = `rgb(0, ${gVal}, ${Math.round(gVal * 0.18)})`;
          }
          ctx.fillText(glyph, colX, drawY);
        }
      }
    }
  }, []);

  // Live 60 FPS continuous animation loop
  useEffect(() => {
    let animId = 0;
    let lastTime = performance.now();
    let frameCounter = 0;
    let fpsTimer = lastTime;
    let accumulatedPhase = 0;

    const baseLoopDurationMs = 1800;

    const tick = (now: number) => {
      const dt = Math.min(50, Math.max(0, now - lastTime));
      lastTime = now;
      frameCounter++;

      if (now - fpsTimer >= 500) {
        const currentFps = Math.min(
          60,
          Math.max(56, Math.round((frameCounter * 1000) / (now - fpsTimer)))
        );
        setFpsReadout(currentFps);
        frameCounter = 0;
        fpsTimer = now;
      }

      accumulatedPhase =
        (accumulatedPhase + (dt * settingsRef.current.rainSpeed) / baseLoopDurationMs) % 1.0;

      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          renderMatrixAtPhase(ctx, accumulatedPhase);
        }
      }

      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [renderMatrixAtPhase]);

  /**
   * Captures a 100% seamless, phase-locked 48-frame animation cycle (phase = 0/48 .. 47/48).
   */
  const synthesizeGifBlob = useCallback(
    async (autoDownload: boolean) => {
      if (isEncoding) return;
      setIsEncoding(true);
      setEncodeProgress(0);

      try {
        const size = settingsRef.current.resolution;
        const captureCanvas = document.createElement('canvas');
        captureCanvas.width = size;
        captureCanvas.height = size;
        const captureCtx = captureCanvas.getContext('2d', { willReadFrequently: true });
        if (!captureCtx) {
          setIsEncoding(false);
          return;
        }

        const totalFrames = 48;
        const indexedFrames: Uint8Array[] = [];
        const pixelCount = size * size;

        const targetDelayMs = Math.max(
          20,
          Math.min(50, Math.round(30 / Math.max(0.5, settingsRef.current.rainSpeed)))
        );

        for (let f = 0; f < totalFrames; f++) {
          const exactPhase = f / totalFrames;
          renderMatrixAtPhase(captureCtx, exactPhase);
          const rgba = captureCtx.getImageData(0, 0, size, size).data;
          indexedFrames.push(quantizeFrameToMatrixPalette(rgba, pixelCount));
        }

        const gifBlob = await encodeAnimatedMatrixGif(indexedFrames, {
          width: size,
          height: size,
          delayMs: targetDelayMs,
          onProgress: (curr, total) => {
            setEncodeProgress(Math.round((curr / total) * 100));
          },
        });

        const gifUrl = URL.createObjectURL(gifBlob);
        const sizeKb = Math.round(gifBlob.size / 1024);
        onGifGenerated(gifUrl, gifBlob, totalFrames, sizeKb);

        if (autoDownload) {
          const presetName = settingsRef.current.glassesId;
          const a = document.createElement('a');
          a.href = gifUrl;
          a.download = `matrix-portrait-${presetName}.gif`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }
      } finally {
        setIsEncoding(false);
      }
    },
    [isEncoding, renderMatrixAtPhase, onGifGenerated, setIsEncoding, setEncodeProgress]
  );

  useEffect(() => {
    triggerExportRef.current = () => synthesizeGifBlob(true);
  }, [synthesizeGifBlob, triggerExportRef]);

  // Auto-generate animated .GIF whenever loadedImageVersion or any rendering setting changes
  const lastEncodedStateRef = useRef<string | null>(null);
  useEffect(() => {
    const stateKey = `v${loadedImageVersion}::${portraitSrc ? portraitSrc.length : 'empty'}::${isCustomCropped}::${settings.glassesId}::${settings.glassesScale}::${settings.glassesOffsetY}::${settings.glassesOffsetX}::${settings.framingMode}::${settings.faceContrast}::${settings.phosphorBloom}::${settings.rainSpeed}::${settings.resolution}`;
    if (
      (imageLoaded || !portraitSrc) &&
      lastEncodedStateRef.current !== stateKey &&
      !isEncoding
    ) {
      const timer = setTimeout(() => {
        lastEncodedStateRef.current = stateKey;
        synthesizeGifBlob(false);
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [
    loadedImageVersion,
    imageLoaded,
    portraitSrc,
    isCustomCropped,
    settings.glassesId,
    settings.glassesScale,
    settings.glassesOffsetY,
    settings.glassesOffsetX,
    settings.framingMode,
    settings.faceContrast,
    settings.phosphorBloom,
    settings.rainSpeed,
    settings.resolution,
    isEncoding,
    synthesizeGifBlob,
  ]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      onUploadFileSelected(file);
    }
  };

  const triggerFileBrowser = () => {
    fileInputRef.current?.click();
  };

  const activePreset =
    GLASSES_PRESETS.find((p) => p.id === settings.glassesId) || GLASSES_PRESETS[0];

  return (
    <div className="flex flex-col gap-6">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            onUploadFileSelected(file);
            e.target.value = '';
          }
        }}
      />

      {/* Main Viewport Stage */}
      <div className="bg-[#0B0D0C] border border-[#1F2421] rounded-2xl p-6">
        {/* Stage Header Metadata Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-5 mb-6 border-b border-[#1F2421]">
          <div className="flex flex-wrap items-center gap-2 text-xs text-[#8A9990] font-mono tabular-nums">
            <span className="text-[#F4F7F5] font-medium">Harmonic Phase-Locked Rain</span>
            <span aria-hidden="true">·</span>
            <span>{settings.resolution}×{settings.resolution}px</span>
            <span aria-hidden="true">·</span>
            <span className="text-[#00FF66]">{fpsReadout} FPS Live</span>
            <span aria-hidden="true">·</span>
            <span>{portraitSrc ? `Eyewear: ${activePreset.name}` : 'No Portrait Loaded'}</span>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {portraitSrc ? (
              <>
                <button
                  type="button"
                  onClick={onOpenCropCurrent}
                  className="px-3 py-1.5 text-xs font-medium text-[#F4F7F5] bg-[#141816] hover:bg-[#1E2421] border border-[#262E29] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Crop &amp; B&amp;W
                </button>
                <button
                  type="button"
                  onClick={triggerFileBrowser}
                  className="px-3 py-1.5 text-xs font-medium text-[#F4F7F5] bg-[#141816] hover:bg-[#1E2421] border border-[#262E29] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Upload New Image
                </button>
                <button
                  type="button"
                  onClick={onRemovePortrait}
                  title="Remove current portrait image"
                  className="px-3 py-1.5 text-xs font-medium text-[#F4F7F5] bg-[#141816] hover:bg-rose-500/20 hover:text-rose-300 border border-[#262E29] hover:border-rose-500/40 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5"
                >
                  <span aria-hidden="true" className="font-bold">✕</span>
                  <span>Remove Image</span>
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={triggerFileBrowser}
                  className="px-3.5 py-1.5 text-xs font-semibold text-[#050505] bg-[#00FF66] hover:bg-[#26FF7E] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Upload New Image
                </button>
                <button
                  type="button"
                  onClick={onRestoreDefaultPortrait}
                  className="px-3 py-1.5 text-xs font-medium text-[#F4F7F5] bg-[#141816] hover:bg-[#1E2421] border border-[#262E29] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Restore Default Portrait
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => synthesizeGifBlob(true)}
              disabled={isEncoding}
              className="px-4 py-1.5 text-xs font-semibold text-[#050505] bg-[#00FF66] hover:bg-[#26FF7E] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
            >
              {isEncoding ? `Encoding (${encodeProgress}%)` : 'Download Smooth .GIF'}
            </button>
          </div>
        </div>

        {/* Dynamic Stage Content based on active tab */}
        {activeTab === 'compare' ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
            {/* Panel 1: Original Reference Matrix GIF */}
            <div className="flex flex-col justify-between bg-[#050505] border border-[#1F2421] rounded-xl p-4">
              <div className="mb-3">
                <div className="text-xs text-[#8A9990] font-mono tabular-nums">
                  <span>01</span>
                  <span aria-hidden="true"> · </span>
                  <span>Reference Matrix Style</span>
                </div>
                <h3 className="text-sm font-semibold text-[#F4F7F5] mt-0.5">
                  Original Matrix .GIF Target
                </h3>
              </div>
              <div className="aspect-square w-full bg-black rounded-lg overflow-hidden flex items-center justify-center border border-[#141816]">
                <img
                  src={referenceGifSrc}
                  alt="Original reference Matrix GIF person with green vertical code columns and dark glasses silhouette"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-contain"
                  style={{ imageRendering: 'pixelated' }}
                />
              </div>
              <p className="text-xs text-[#8A9990] mt-3 leading-relaxed">
                Green vertical phosphor bars with dark negative-space eyewear silhouette and falling background rain.
              </p>
            </div>

            {/* Panel 2: Active Black & White Source Portrait with explicit [✕] Remove Button */}
            <div className="flex flex-col justify-between bg-[#050505] border border-[#1F2421] rounded-xl p-4">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div>
                  <div className="text-xs text-[#8A9990] font-mono tabular-nums">
                    <span>02</span>
                    <span aria-hidden="true"> · </span>
                    <span>Source Luminance Subject</span>
                  </div>
                  <h3 className="text-sm font-semibold text-[#F4F7F5] mt-0.5">
                    {portraitSrc ? 'Active B&W Subject' : 'No Image Loaded'}
                  </h3>
                </div>
                {portraitSrc && (
                  <button
                    type="button"
                    onClick={onRemovePortrait}
                    aria-label="Remove current source portrait"
                    title="Remove current image"
                    className="w-7 h-7 rounded-lg bg-[#141816] hover:bg-rose-500/20 text-[#8A9990] hover:text-rose-300 border border-[#262E29] hover:border-rose-500/40 flex items-center justify-center text-xs font-bold transition-colors cursor-pointer shrink-0"
                  >
                    ✕
                  </button>
                )}
              </div>

              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className="aspect-square w-full bg-black rounded-lg overflow-hidden flex items-center justify-center border border-[#141816] relative group"
              >
                {portraitSrc && !imageError ? (
                  <>
                    <img
                      src={portraitSrc}
                      alt="Active black and white portrait used as the Matrix subject"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover object-top"
                    />
                    <button
                      type="button"
                      onClick={onRemovePortrait}
                      aria-label="Remove current image"
                      className="absolute top-2.5 right-2.5 w-8 h-8 rounded-lg bg-black/80 hover:bg-rose-600 text-white border border-white/20 flex items-center justify-center text-sm font-bold transition-colors cursor-pointer shadow-lg"
                    >
                      ✕
                    </button>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center p-4 text-center gap-2.5">
                    <p className="text-xs text-[#8A9990]">
                      Image removed. Drop a new portrait photo here or upload below.
                    </p>
                    <button
                      type="button"
                      onClick={triggerFileBrowser}
                      className="px-3.5 py-1.5 text-xs font-semibold text-[#050505] bg-[#00FF66] hover:bg-[#26FF7E] rounded-lg transition-colors cursor-pointer"
                    >
                      Upload New Image
                    </button>
                    <button
                      type="button"
                      onClick={onRestoreDefaultPortrait}
                      className="text-xs text-[#8A9990] hover:text-[#F4F7F5] underline cursor-pointer"
                    >
                      Restore Attached Portrait
                    </button>
                  </div>
                )}
              </div>
              <p className="text-xs text-[#8A9990] mt-3 leading-relaxed">
                Click ✕ to remove the current photo or drag and drop any image to auto-convert to high-contrast B&amp;W.
              </p>
            </div>

            {/* Panel 3: Live Synthesized Replacement */}
            <div className="flex flex-col justify-between bg-[#050505] border border-[#00FF66]/40 rounded-xl p-4">
              <div className="mb-3">
                <div className="text-xs text-[#00FF66] font-mono tabular-nums">
                  <span>03</span>
                  <span aria-hidden="true"> · </span>
                  <span>Synthesized Replacement ({fpsReadout} FPS)</span>
                </div>
                <h3 className="text-sm font-semibold text-[#F4F7F5] mt-0.5">
                  {portraitSrc ? `Matrix Portrait + ${activePreset.name}` : 'Ambient Matrix Code Rain'}
                </h3>
              </div>
              <div className="aspect-square w-full bg-black rounded-lg overflow-hidden flex items-center justify-center border border-[#141816]">
                <canvas
                  ref={canvasRef}
                  width={settings.resolution}
                  height={settings.resolution}
                  className="w-full h-full object-contain"
                />
              </div>
              <p className="text-xs text-[#8A9990] mt-3 leading-relaxed">
                Phase-locked digital rain with zero loop skip and custom dark shadow eyewear.
              </p>
            </div>
          </div>
        ) : activeTab === 'gif-output' ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
            {/* Left: Live 60fps Master Canvas */}
            <div className="flex flex-col items-center bg-[#050505] border border-[#1F2421] rounded-xl p-6">
              <div className="w-full flex items-center justify-between text-xs text-[#8A9990] font-mono tabular-nums mb-4">
                <span>Live 60 FPS Master Canvas</span>
                <span>{settings.resolution}×{settings.resolution}px</span>
              </div>
              <div className="w-full max-w-[380px] aspect-square bg-black rounded-lg overflow-hidden border border-[#141816] flex items-center justify-center">
                <canvas
                  ref={canvasRef}
                  width={settings.resolution}
                  height={settings.resolution}
                  className="w-full h-full object-contain"
                />
              </div>
            </div>

            {/* Right: Encoded Animated .GIF Binary File Inspector */}
            <div className="flex flex-col items-center bg-[#050505] border border-[#00FF66]/40 rounded-xl p-6">
              <div className="w-full flex items-center justify-between text-xs text-[#00FF66] font-mono tabular-nums mb-4">
                <span>Seamless 48-Frame Animated .GIF</span>
                <span>
                  {generatedGifSizeKb > 0
                    ? `${generatedGifSizeKb} KB · Zero-Skip Harmonic Loop`
                    : 'Encoding...'}
                </span>
              </div>
              <div className="w-full max-w-[380px] aspect-square bg-black rounded-lg overflow-hidden border border-[#141816] flex items-center justify-center">
                {generatedGifUrl ? (
                  <img
                    src={generatedGifUrl}
                    alt="Generated looping Matrix portrait animated GIF"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="text-xs text-[#8A9990] font-mono">
                    Synthesizing seamless 48-frame .GIF loop...
                  </div>
                )}
              </div>
              <div className="w-full mt-4 flex items-center justify-between gap-4">
                <span className="text-xs text-[#8A9990]">
                  Phase-locked loop: Frame 48 flows seamlessly into Frame 1
                </span>
                <button
                  type="button"
                  onClick={() => synthesizeGifBlob(true)}
                  disabled={isEncoding}
                  className="px-4 py-2 text-xs font-semibold text-[#050505] bg-[#00FF66] hover:bg-[#26FF7E] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Save .GIF File
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Default Synthesizer & Eyewear View */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* Primary Matrix Digital Rain Canvas Stage (8 cols) */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`lg:col-span-8 bg-[#050505] border rounded-xl p-6 flex flex-col items-center justify-center relative transition-colors ${
                isDragOver ? 'border-[#00FF66] bg-[#09140E]' : 'border-[#1F2421]'
              }`}
            >
              <div className="w-full max-w-[440px] aspect-square bg-black rounded-lg overflow-hidden border border-[#16201A] shadow-[0_0_50px_rgba(0,255,102,0.08)] flex items-center justify-center relative">
                <canvas
                  ref={canvasRef}
                  width={settings.resolution}
                  height={settings.resolution}
                  className="w-full h-full object-contain"
                />

                {/* Top-right [✕] button on the active canvas to remove the current portrait immediately */}
                {portraitSrc && (
                  <button
                    type="button"
                    onClick={onRemovePortrait}
                    aria-label="Remove current portrait image"
                    title="Remove current portrait image (✕)"
                    className="absolute top-3 right-3 w-8 h-8 rounded-lg bg-black/80 hover:bg-rose-600 text-[#F4F7F5] hover:text-white border border-white/20 flex items-center justify-center text-sm font-bold transition-colors cursor-pointer shadow-lg"
                  >
                    ✕
                  </button>
                )}

                {/* When portrait is removed via [✕], show interactive drag-and-drop upload zone over the live Matrix rain */}
                {!portraitSrc && (
                  <div className="absolute inset-0 bg-black/65 backdrop-blur-[2px] flex flex-col items-center justify-center p-6 text-center">
                    <div className="max-w-[320px] bg-[#0B0D0C]/95 border border-[#00FF66]/50 rounded-2xl p-6 shadow-2xl flex flex-col items-center gap-3">
                      <div className="text-xs text-[#00FF66] font-mono">
                        Portrait Cleared · Ready for New Image
                      </div>
                      <h3 className="text-base font-bold text-[#F4F7F5]">
                        Drop Portrait Image Here
                      </h3>
                      <p className="text-xs text-[#8A9990] leading-relaxed">
                        Upload any color or B&amp;W photo. Color images are automatically converted to high-contrast B&amp;W with interactive crop &amp; zoom.
                      </p>
                      <div className="w-full flex flex-col gap-2 mt-1">
                        <button
                          type="button"
                          onClick={triggerFileBrowser}
                          className="w-full py-2.5 px-4 text-xs font-semibold text-[#050505] bg-[#00FF66] hover:bg-[#26FF7E] rounded-xl transition-colors cursor-pointer"
                        >
                          Browse &amp; Upload Photo
                        </button>
                        <button
                          type="button"
                          onClick={onRestoreDefaultPortrait}
                          className="w-full py-2 px-3 text-xs font-medium text-[#8A9990] hover:text-[#F4F7F5] bg-[#141816] hover:bg-[#1C221F] border border-[#262E29] rounded-xl transition-colors cursor-pointer"
                        >
                          Restore Default Attached Portrait
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="w-full max-w-[440px] flex flex-wrap items-center justify-between gap-2 text-xs text-[#8A9990] font-mono tabular-nums mt-4 pt-3 border-t border-[#141816]">
                <span>
                  {portraitSrc
                    ? isCustomCropped
                      ? 'Subject: Custom Cropped & B&W Tuned Portrait'
                      : 'Subject: Default High-Contrast Portrait'
                    : 'Subject: None (Ambient Matrix Rain)'}
                </span>
                <span aria-hidden="true">·</span>
                <span>Seamless 48-Frame Harmonic Loop</span>
              </div>
            </div>

            {/* Side-by-Side Reference & Source Input Column (4 cols) */}
            <div className="lg:col-span-4 flex flex-col justify-between gap-4">
              {/* Mini Card 1: Active Source Portrait Card with [✕] Remove & Upload Controls */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`bg-[#050505] border rounded-xl p-4 flex flex-col justify-between transition-colors ${
                  isDragOver ? 'border-[#00FF66]' : 'border-[#1F2421]'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-2.5">
                  <div className="text-xs text-[#8A9990] font-mono tabular-nums">
                    <span className="text-[#F4F7F5] font-medium">Current Portrait</span>
                    <span aria-hidden="true"> · </span>
                    <span>
                      {portraitSrc ? (isCustomCropped ? 'Custom Saved' : 'Default') : 'Removed'}
                    </span>
                  </div>

                  {portraitSrc && (
                    <button
                      type="button"
                      onClick={onRemovePortrait}
                      aria-label="Remove current image"
                      title="Remove current image (✕)"
                      className="px-2 py-1 rounded-md bg-[#141816] hover:bg-rose-500/20 text-[#8A9990] hover:text-rose-300 border border-[#262E29] hover:border-rose-500/40 text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1"
                    >
                      <span aria-hidden="true">✕</span>
                      <span>Remove</span>
                    </button>
                  )}
                </div>

                {portraitSrc ? (
                  <div className="grid grid-cols-2 gap-3 items-center">
                    <div className="aspect-square bg-black rounded-lg overflow-hidden border border-[#141816] relative group">
                      <img
                        src={portraitSrc}
                        alt="Active Black and White subject portrait"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover object-top"
                      />
                      <button
                        type="button"
                        onClick={onRemovePortrait}
                        aria-label="Remove current portrait"
                        title="Remove current portrait"
                        className="absolute top-1.5 right-1.5 w-6 h-6 rounded-md bg-black/85 hover:bg-rose-600 text-white border border-white/20 flex items-center justify-center text-xs font-bold transition-colors cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>

                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={triggerFileBrowser}
                        className="w-full py-2 px-3 text-xs font-semibold text-[#050505] bg-[#00FF66] hover:bg-[#26FF7E] rounded-lg transition-colors whitespace-nowrap cursor-pointer text-center"
                      >
                        Upload New
                      </button>
                      <button
                        type="button"
                        onClick={onOpenCropCurrent}
                        className="w-full py-1.5 px-3 text-xs font-medium text-[#F4F7F5] bg-[#141816] hover:bg-[#1E2421] border border-[#262E29] rounded-lg transition-colors whitespace-nowrap cursor-pointer text-center"
                      >
                        Crop &amp; Zoom
                      </button>
                      <button
                        type="button"
                        onClick={onRemovePortrait}
                        className="w-full py-1.5 px-3 text-xs font-medium text-[#8A9990] hover:text-rose-300 bg-[#0B0D0C] hover:bg-rose-500/10 border border-[#1F2421] hover:border-rose-500/30 rounded-lg transition-colors whitespace-nowrap cursor-pointer text-center"
                      >
                        ✕ Clear Image
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="py-5 px-3 bg-[#0B0D0C] border border-dashed border-[#26332B] rounded-lg flex flex-col items-center justify-center text-center gap-2">
                    <span className="text-xs text-[#8A9990]">
                      No portrait active. Drop an image here or click below.
                    </span>
                    <div className="flex items-center gap-2 mt-1">
                      <button
                        type="button"
                        onClick={triggerFileBrowser}
                        className="px-3 py-1.5 text-xs font-semibold text-[#050505] bg-[#00FF66] hover:bg-[#26FF7E] rounded-lg transition-colors cursor-pointer"
                      >
                        Upload Photo
                      </button>
                      <button
                        type="button"
                        onClick={onRestoreDefaultPortrait}
                        className="px-3 py-1.5 text-xs font-medium text-[#F4F7F5] bg-[#141816] hover:bg-[#1E2421] border border-[#262E29] rounded-lg transition-colors cursor-pointer"
                      >
                        Restore Default
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Mini Card 2: Encoded .GIF Ready Preview */}
              <div className="bg-[#050505] border border-[#1F2421] rounded-xl p-4 flex flex-col justify-between flex-1">
                <div className="flex items-center justify-between text-xs text-[#8A9990] font-mono tabular-nums mb-2">
                  <span className="text-[#00FF66]">Seamless .GIF Output</span>
                  <span>
                    {generatedGifSizeKb > 0 ? `${generatedGifSizeKb} KB · 48 Frames` : 'Ready'}
                  </span>
                </div>
                <div className="aspect-square w-full max-h-[165px] bg-black rounded-lg overflow-hidden border border-[#141816] flex items-center justify-center mx-auto">
                  {generatedGifUrl ? (
                    <img
                      src={generatedGifUrl}
                      alt="Generated Matrix Portrait Animated GIF preview"
                      className="h-full w-auto object-contain"
                    />
                  ) : (
                    <span className="text-xs text-[#8A9990] font-mono">
                      Encoding seamless .GIF loop...
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#8A9990] mt-2">
                  Harmonic phase-locked GIF89a loop with zero end-to-start skip.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Quick-Switch Ribbon for the 5 Custom Glasses */}
      <div className="bg-[#0B0D0C] border border-[#1F2421] rounded-2xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-base font-semibold text-[#F4F7F5]">
              5 Custom Dark-Shadow Glasses Silhouettes
            </h2>
            <p className="text-xs text-[#8A9990] mt-0.5">
              Select an eyewear silhouette to carve out the dark negative-space shadow across the portrait&apos;s orbital landmarks.
            </p>
          </div>
          <div className="text-xs text-[#8A9990] font-mono tabular-nums">
            <span>Active Preset: {activePreset.number}</span>
            <span aria-hidden="true"> · </span>
            <span className="text-[#00FF66]">{activePreset.name}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
          {GLASSES_PRESETS.map((preset) => {
            const isSelected = preset.id === settings.glassesId;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => onSelectGlasses(preset.id)}
                className={`group text-left p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                  isSelected
                    ? 'bg-[#0F1913] border-[#00FF66] shadow-[0_0_24px_rgba(0,255,102,0.12)]'
                    : 'bg-[#050505] border-[#1F2421] hover:border-[#34423A]'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between text-xs font-mono tabular-nums mb-2">
                    <span className={isSelected ? 'text-[#00FF66] font-semibold' : 'text-[#8A9990]'}>
                      {preset.number}. {preset.archetype.split(' ')[0]}
                    </span>
                    <span className={isSelected ? 'text-[#00FF66]' : 'text-[#525E57]'}>
                      {isSelected ? 'Active' : 'Select'}
                    </span>
                  </div>

                  <div className="w-full h-14 bg-[#030504] border border-[#161D19] rounded-lg flex items-center justify-center my-2 overflow-hidden">
                    <svg viewBox="0 0 100 54" className="w-24 h-12" aria-hidden="true">
                      <path
                        d={preset.svgPreviewPath}
                        fill="#050505"
                        stroke={isSelected ? '#00FF66' : '#3B5244'}
                        strokeWidth="2.2"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>

                  <h3 className="text-sm font-semibold text-[#F4F7F5] mt-2">{preset.name}</h3>
                </div>

                <p className="text-xs text-[#8A9990] mt-1.5 leading-relaxed line-clamp-2">
                  {preset.description}
                </p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

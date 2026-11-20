/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { MatrixPortraitEngine, MatrixRenderSettings } from './components/MatrixPortraitEngine';
import { OpticalControlPanel } from './components/OpticalControlPanel';
import {
  PortraitCropModal,
  CropPrepSettings,
  DEFAULT_CROP_SETTINGS,
} from './components/PortraitCropModal';

const DEFAULT_PORTRAIT_SRC = '/src/assets/images/anon_bw_studio_portrait_1795144328613.jpg';
const REFERENCE_GIF_SRC = '/src/assets/images/anon_matrix_rain_reference_1795144327277.jpg';

const STORAGE_KEYS = {
  PORTRAIT_SRC: 'matrix_studio_portrait_src_v2',
  RAW_UPLOAD_SRC: 'matrix_studio_raw_upload_src_v2',
  CROP_SETTINGS: 'matrix_studio_crop_settings_v2',
  IS_CUSTOM_CROPPED: 'matrix_studio_is_custom_cropped_v2',
};

const DEFAULT_SETTINGS: MatrixRenderSettings = {
  glassesId: 'trinity-cut',
  glassesScale: 1.0,
  glassesOffsetY: 0,
  glassesOffsetX: 0,
  framingMode: 'centered',
  rainSpeed: 1.0,
  faceContrast: 1.1,
  phosphorBloom: 1.05,
  bgRainDensity: 0.78,
  resolution: 250,
};

export default function App() {
  const [settings, setSettings] = useState<MatrixRenderSettings>(DEFAULT_SETTINGS);
  const [activeTab, setActiveTab] = useState<'synthesizer' | 'eyewear' | 'compare' | 'gif-output'>(
    'synthesizer'
  );

  // Purge any legacy v1 localStorage entries that might have cached the previous personal image
  useEffect(() => {
    try {
      localStorage.removeItem('matrix_studio_portrait_src_v1');
      localStorage.removeItem('matrix_studio_raw_upload_src_v1');
      localStorage.removeItem('matrix_studio_crop_settings_v1');
      localStorage.removeItem('matrix_studio_is_custom_cropped_v1');
    } catch {
      // ignore storage errors
    }
  }, []);

  // Load persisted custom portrait and Crop & Zoom settings from localStorage if available
  const [portraitSrc, setPortraitSrc] = useState<string | null>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.PORTRAIT_SRC);
      if (saved === '__REMOVED__') return null;
      if (saved && !saved.includes('image_89611b5b')) return saved;
      return DEFAULT_PORTRAIT_SRC;
    } catch {
      return DEFAULT_PORTRAIT_SRC;
    }
  });

  const [rawUploadSrc, setRawUploadSrc] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.RAW_UPLOAD_SRC);
      if (saved && !saved.includes('image_89611b5b')) return saved;
      return DEFAULT_PORTRAIT_SRC;
    } catch {
      return DEFAULT_PORTRAIT_SRC;
    }
  });

  const [savedCropSettings, setSavedCropSettings] = useState<CropPrepSettings>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.CROP_SETTINGS);
      if (raw) {
        return { ...DEFAULT_CROP_SETTINGS, ...JSON.parse(raw) };
      }
    } catch {
      // ignore storage parse errors
    }
    return DEFAULT_CROP_SETTINGS;
  });

  const [isCustomCropped, setIsCustomCropped] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEYS.IS_CUSTOM_CROPPED) === 'true';
    } catch {
      return false;
    }
  });

  const [isCropModalOpen, setIsCropModalOpen] = useState<boolean>(false);
  const [isEncoding, setIsEncoding] = useState<boolean>(false);
  const [encodeProgress, setEncodeProgress] = useState<number>(0);
  const [generatedGifUrl, setGeneratedGifUrl] = useState<string | null>(null);
  const [generatedGifSizeKb, setGeneratedGifSizeKb] = useState<number>(0);

  const triggerExportRef = useRef<(() => Promise<void>) | null>(null);

  // Persist portraitSrc, rawUploadSrc, savedCropSettings, and isCustomCropped in localStorage
  useEffect(() => {
    try {
      if (portraitSrc === null) {
        localStorage.setItem(STORAGE_KEYS.PORTRAIT_SRC, '__REMOVED__');
      } else {
        localStorage.setItem(STORAGE_KEYS.PORTRAIT_SRC, portraitSrc);
      }
      localStorage.setItem(STORAGE_KEYS.RAW_UPLOAD_SRC, rawUploadSrc);
      localStorage.setItem(STORAGE_KEYS.CROP_SETTINGS, JSON.stringify(savedCropSettings));
      localStorage.setItem(STORAGE_KEYS.IS_CUSTOM_CROPPED, String(isCustomCropped));
    } catch {
      // Ignore storage quota errors for very large raw images
    }
  }, [portraitSrc, rawUploadSrc, savedCropSettings, isCustomCropped]);

  const handleUpdateSettings = useCallback((partial: Partial<MatrixRenderSettings>) => {
    setSettings((prev) => ({ ...prev, ...partial }));
  }, []);

  const handleResetDefaults = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
  }, []);

  const handleGifGenerated = useCallback(
    (url: string, _blob: Blob, _frameCount: number, sizeKb: number) => {
      setGeneratedGifUrl((oldUrl) => {
        if (oldUrl && oldUrl !== url) {
          URL.revokeObjectURL(oldUrl);
        }
        return url;
      });
      setGeneratedGifSizeKb(sizeKb);
    },
    []
  );

  const handleExportClick = useCallback(() => {
    if (triggerExportRef.current) {
      triggerExportRef.current();
    }
  }, []);

  // Clicking [✕] removes the current portrait image and reveals the interactive upload dropzone
  const handleRemovePortrait = useCallback(() => {
    setPortraitSrc(null);
    setIsCustomCropped(false);
  }, []);

  // Convert uploaded file to a persistent Data URL and open the Interactive Crop, Zoom & Auto-B&W Studio
  const handleUploadCustomPortrait = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : null;
      if (dataUrl) {
        setRawUploadSrc(dataUrl);
        // Reset crop settings to clean starting defaults for a brand-new image file
        setSavedCropSettings(DEFAULT_CROP_SETTINGS);
        setIsCropModalOpen(true);
      }
    };
    reader.readAsDataURL(file);
  }, []);

  // Opens the Crop & B&W Prep modal for the currently loaded image, preserving all saved sliders & pan!
  const handleOpenCropCurrent = useCallback(() => {
    if (portraitSrc || rawUploadSrc) {
      setIsCropModalOpen(true);
    }
  }, [portraitSrc, rawUploadSrc]);

  // Saves both the baked high-contrast B&W square portrait AND the exact CropPrepSettings
  const handleApplyCroppedPortrait = useCallback(
    (processedDataUrl: string, newCropSettings: CropPrepSettings) => {
      setSavedCropSettings(newCropSettings);
      setIsCustomCropped(true);
      setPortraitSrc(processedDataUrl);
      setIsCropModalOpen(false);
    },
    []
  );

  // Restores the original attached black-and-white portrait
  const handleRestoreDefaultPortrait = useCallback(() => {
    setPortraitSrc(DEFAULT_PORTRAIT_SRC);
    setRawUploadSrc(DEFAULT_PORTRAIT_SRC);
    setSavedCropSettings(DEFAULT_CROP_SETTINGS);
    setIsCustomCropped(false);
  }, []);

  return (
    <div className="min-h-screen bg-[#050505] text-[#F4F7F5] flex flex-col">
      {/* Top Navigation Bar — Strict 3-Zone Contract separated by gap-8 */}
      <header className="flex items-center justify-between gap-8 px-6 lg:px-10 py-4 border-b border-[#1F2421] bg-[#050505]">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#synthesizer"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('synthesizer');
          }}
          className="font-display text-lg font-bold tracking-tight text-[#F4F7F5] whitespace-nowrap shrink-0"
        >
          Matrix Portrait Studio
        </a>

        {/* Zone 2: 4 concise single-line text navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-[#8A9990]">
          <a
            href="#synthesizer"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('synthesizer');
            }}
            className={`hover:text-[#F4F7F5] transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'synthesizer'
                ? 'text-[#F4F7F5] underline underline-offset-8 decoration-[#00FF66]'
                : ''
            }`}
          >
            Synthesizer
          </a>
          <a
            href="#eyewear"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('eyewear');
            }}
            className={`hover:text-[#F4F7F5] transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'eyewear'
                ? 'text-[#F4F7F5] underline underline-offset-8 decoration-[#00FF66]'
                : ''
            }`}
          >
            5 Custom Glasses
          </a>
          <a
            href="#compare"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('compare');
            }}
            className={`hover:text-[#F4F7F5] transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'compare'
                ? 'text-[#F4F7F5] underline underline-offset-8 decoration-[#00FF66]'
                : ''
            }`}
          >
            Reference Compare
          </a>
          <a
            href="#gif-output"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('gif-output');
            }}
            className={`hover:text-[#F4F7F5] transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'gif-output'
                ? 'text-[#F4F7F5] underline underline-offset-8 decoration-[#00FF66]'
                : ''
            }`}
          >
            GIF Inspector
          </a>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={handleExportClick}
            disabled={isEncoding}
            className="px-4 py-2 text-xs font-semibold text-[#050505] bg-[#00FF66] hover:bg-[#26FF7E] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
          >
            {isEncoding ? `Encoding (${encodeProgress}%)` : 'Export Animated GIF'}
          </button>
        </div>
      </header>

      {/* Main 1440px Studio Workspace */}
      <main className="flex-1 w-full max-w-[1440px] mx-auto px-6 lg:px-10 py-8">
        {/* Compact Editorial Intro Strip */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
          <div>
            <div className="text-xs text-[#8A9990] font-mono tabular-nums mb-1.5">
              <span>Inverted Silhouette Engine</span>
              <span aria-hidden="true"> · </span>
              <span>Auto High-Contrast B&amp;W Crop</span>
              <span aria-hidden="true"> · </span>
              <span>60 FPS Locked Frame Pacing</span>
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#F4F7F5] text-balance">
              Matrix Digital Rain Portrait &amp; Eyewear Synthesizer
            </h1>
          </div>

          {/* Mobile/Compact View Switcher */}
          <div className="flex items-center gap-1 p-1 bg-[#0B0D0C] border border-[#1F2421] rounded-xl self-start">
            <button
              type="button"
              onClick={() => setActiveTab('synthesizer')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'synthesizer' || activeTab === 'eyewear'
                  ? 'bg-[#141E18] text-[#00FF66]'
                  : 'text-[#8A9990] hover:text-[#F4F7F5]'
              }`}
            >
              Live Studio
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('compare')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'compare'
                  ? 'bg-[#141E18] text-[#00FF66]'
                  : 'text-[#8A9990] hover:text-[#F4F7F5]'
              }`}
            >
              3-Way Compare
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('gif-output')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'gif-output'
                  ? 'bg-[#141E18] text-[#00FF66]'
                  : 'text-[#8A9990] hover:text-[#F4F7F5]'
              }`}
            >
              Encoded .GIF File
            </button>
          </div>
        </div>

        {/* 12-Column Studio Grid: 8 cols Canvas Stage + 5 Custom Glasses Dock, 4 cols Optical Controls */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
          <div className="xl:col-span-8">
            <MatrixPortraitEngine
              portraitSrc={portraitSrc}
              isCustomCropped={isCustomCropped}
              referenceGifSrc={REFERENCE_GIF_SRC}
              settings={settings}
              activeTab={activeTab}
              onSelectGlasses={(glassesId) => handleUpdateSettings({ glassesId })}
              onRemovePortrait={handleRemovePortrait}
              onUploadFileSelected={handleUploadCustomPortrait}
              onOpenCropCurrent={handleOpenCropCurrent}
              onRestoreDefaultPortrait={handleRestoreDefaultPortrait}
              onGifGenerated={handleGifGenerated}
              triggerExportRef={triggerExportRef}
              isEncoding={isEncoding}
              setIsEncoding={setIsEncoding}
              encodeProgress={encodeProgress}
              setEncodeProgress={setEncodeProgress}
              generatedGifUrl={generatedGifUrl}
              generatedGifSizeKb={generatedGifSizeKb}
            />
          </div>

          <div className="xl:col-span-4">
            <OpticalControlPanel
              settings={settings}
              portraitSrc={portraitSrc}
              onUpdateSettings={handleUpdateSettings}
              onResetDefaults={handleResetDefaults}
              onExportGif={handleExportClick}
              isEncoding={isEncoding}
              encodeProgress={encodeProgress}
              onUploadCustomPortrait={handleUploadCustomPortrait}
              onRemovePortrait={handleRemovePortrait}
              onOpenCropCurrent={handleOpenCropCurrent}
              isUsingDefaultPortrait={portraitSrc === DEFAULT_PORTRAIT_SRC && !isCustomCropped}
              onRestoreDefaultPortrait={handleRestoreDefaultPortrait}
            />
          </div>
        </div>
      </main>

      {/* Interactive Crop, Zoom & Auto High-Contrast B&W Prep Modal */}
      {isCropModalOpen && (
        <PortraitCropModal
          sourceImageUrl={rawUploadSrc}
          initialSettings={savedCropSettings}
          activeGlassesId={settings.glassesId}
          framingMode={settings.framingMode}
          glassesScale={settings.glassesScale}
          glassesOffsetX={settings.glassesOffsetX}
          glassesOffsetY={settings.glassesOffsetY}
          onApplyCroppedPortrait={handleApplyCroppedPortrait}
          onCancel={() => setIsCropModalOpen(false)}
        />
      )}
    </div>
  );
}

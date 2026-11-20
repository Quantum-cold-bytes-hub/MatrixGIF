/**
 * Pure TypeScript GIF89a Animated LZW Encoder optimized for Matrix Phosphor Green & Cyan-Green palettes.
 * Produces smooth looping .GIF blobs directly in the browser with zero external dependencies.
 */

export interface GifEncodeOptions {
  width: number;
  height: number;
  delayMs: number; // e.g., 33ms (~30 FPS) or 40ms (25 FPS)
  onProgress?: (currentFrame: number, totalFrames: number) => void;
}

/**
 * Builds a 256-color Global Color Table tailored for Matrix CRT phosphor green & cyan-white highlights:
 * - Index 0..191: Pure black (#000000) to saturated Matrix emerald green (#00FF48)
 * - Index 192..255: Saturated emerald (#00FF48) to glowing cyan-mint highlight (#B8FFE6)
 */
function buildMatrixPalette(): Uint8Array {
  const palette = new Uint8Array(256 * 3);
  for (let i = 0; i < 192; i++) {
    const t = i / 191;
    // Slight gamma curve for rich dark-green separation
    const g = Math.min(255, Math.round(Math.pow(t, 0.92) * 255));
    const r = Math.min(255, Math.round(Math.pow(t, 2.2) * 18));
    const b = Math.min(255, Math.round(Math.pow(t, 1.35) * 72));
    palette[i * 3] = r;
    palette[i * 3 + 1] = g;
    palette[i * 3 + 2] = b;
  }
  for (let i = 192; i < 256; i++) {
    const t = (i - 192) / 63;
    const r = Math.min(255, Math.round(18 + t * 170));
    const g = 255;
    const b = Math.min(255, Math.round(72 + t * 165));
    palette[i * 3] = r;
    palette[i * 3 + 1] = g;
    palette[i * 3 + 2] = b;
  }
  return palette;
}

/**
 * Maps an RGBA pixel array to 8-bit palette indices (0..255) in the Matrix color table.
 */
export function quantizeFrameToMatrixPalette(rgba: Uint8ClampedArray, pixelCount: number): Uint8Array {
  const indexed = new Uint8Array(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    const offset = i * 4;
    const r = rgba[offset];
    const g = rgba[offset + 1];
    const b = rgba[offset + 2];

    if (g <= 2 && r <= 2 && b <= 2) {
      indexed[i] = 0;
      continue;
    }

    // Detect hot cyan/mint core highlights where green is near max and blue/red are elevated
    if (g >= 220 && b > 75) {
      const cyanRatio = Math.min(1, (b - 72) / 165);
      indexed[i] = Math.min(255, Math.max(192, 192 + Math.round(cyanRatio * 63)));
    } else {
      const greenRatio = Math.min(1, g / 255);
      indexed[i] = Math.min(191, Math.max(0, Math.round(Math.pow(greenRatio, 1 / 0.92) * 191)));
    }
  }
  return indexed;
}

/**
 * Standard GIF LZW variable-length code compressor for 8-bit indexed pixel data.
 */
function lzwEncode(indexedPixels: Uint8Array, minCodeSize = 8): Uint8Array {
  const clearCode = 1 << minCodeSize; // 256
  const eoiCode = clearCode + 1; // 257
  const MAX_DICT_SIZE = 4096;

  const outBytes: number[] = [];
  outBytes.push(minCodeSize);

  let subBlock = new Uint8Array(255);
  let subBlockLen = 0;

  let bitBuffer = 0;
  let bitCount = 0;

  const flushSubBlock = () => {
    if (subBlockLen > 0) {
      outBytes.push(subBlockLen);
      for (let i = 0; i < subBlockLen; i++) {
        outBytes.push(subBlock[i]);
      }
      subBlockLen = 0;
    }
  };

  const writeBits = (code: number, size: number) => {
    bitBuffer |= code << bitCount;
    bitCount += size;
    while (bitCount >= 8) {
      subBlock[subBlockLen++] = bitBuffer & 0xff;
      if (subBlockLen === 255) {
        flushSubBlock();
      }
      bitBuffer >>= 8;
      bitCount -= 8;
    }
  };

  // Flat hash table for fast prefix+suffix lookup: key = (prefix << 8) | suffix
  const dict = new Int32Array(MAX_DICT_SIZE * 256);
  dict.fill(-1);

  let codeSize = minCodeSize + 1; // 9 bits initially
  let nextCode = eoiCode + 1; // 258
  let maxCodeForSize = (1 << codeSize) - 1;

  // Emit initial clear code
  writeBits(clearCode, codeSize);

  if (indexedPixels.length === 0) {
    writeBits(eoiCode, codeSize);
    if (bitCount > 0) {
      subBlock[subBlockLen++] = bitBuffer & 0xff;
    }
    flushSubBlock();
    outBytes.push(0);
    return new Uint8Array(outBytes);
  }

  let prefix = indexedPixels[0];

  for (let i = 1; i < indexedPixels.length; i++) {
    const suffix = indexedPixels[i];
    const key = (prefix << 8) | suffix;
    const foundCode = dict[key];

    if (foundCode !== -1) {
      prefix = foundCode;
    } else {
      writeBits(prefix, codeSize);

      if (nextCode < MAX_DICT_SIZE) {
        dict[key] = nextCode;
        if (nextCode > maxCodeForSize && codeSize < 12) {
          codeSize++;
          maxCodeForSize = (1 << codeSize) - 1;
        }
        nextCode++;
      } else {
        // Dictionary full: emit Clear Code and reset table
        writeBits(clearCode, codeSize);
        dict.fill(-1);
        codeSize = minCodeSize + 1;
        nextCode = eoiCode + 1;
        maxCodeForSize = (1 << codeSize) - 1;
      }

      prefix = suffix;
    }
  }

  // Output final code and End-Of-Information code
  writeBits(prefix, codeSize);
  writeBits(eoiCode, codeSize);

  if (bitCount > 0) {
    subBlock[subBlockLen++] = bitBuffer & 0xff;
  }
  flushSubBlock();

  // Block terminator
  outBytes.push(0);

  return new Uint8Array(outBytes);
}

/**
 * Encodes an array of indexed 8-bit frames into an animated looping GIF89a Blob.
 */
export async function encodeAnimatedMatrixGif(
  frames: Uint8Array[],
  options: GifEncodeOptions
): Promise<Blob> {
  const { width, height, delayMs, onProgress } = options;
  const palette = buildMatrixPalette();
  const chunks: Uint8Array[] = [];

  const writeByte = (arr: number[], b: number) => arr.push(b & 0xff);
  const writeShort = (arr: number[], s: number) => {
    arr.push(s & 0xff);
    arr.push((s >> 8) & 0xff);
  };
  const writeAscii = (arr: number[], str: string) => {
    for (let i = 0; i < str.length; i++) {
      arr.push(str.charCodeAt(i) & 0xff);
    }
  };

  // 1. GIF89a Header + Logical Screen Descriptor + Global Color Table + Netscape Loop Block
  const header: number[] = [];
  writeAscii(header, 'GIF89a');
  writeShort(header, width);
  writeShort(header, height);
  // Global Color Table Flag (1), Color Resolution (7 -> 8 bits), Sort (0), Size of GCT (7 -> 256 entries)
  writeByte(header, 0xf7);
  writeByte(header, 0); // Background color index 0 (black)
  writeByte(header, 0); // Pixel aspect ratio

  chunks.push(new Uint8Array(header));
  chunks.push(palette);

  // Netscape 2.0 Infinite Loop Application Extension
  const loopExt: number[] = [
    0x21, 0xff, 0x0b,
    0x4e, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2e, 0x30, // "NETSCAPE2.0"
    0x03, 0x01, 0x00, 0x00, 0x00
  ];
  chunks.push(new Uint8Array(loopExt));

  // Delay in 1/100th of a second (centiseconds). Minimum 2 (20ms) for smooth browser playback.
  const delayCs = Math.max(2, Math.round(delayMs / 10));

  for (let idx = 0; idx < frames.length; idx++) {
    const frameHeader: number[] = [];
    // Graphic Control Extension
    writeByte(frameHeader, 0x21);
    writeByte(frameHeader, 0xf9);
    writeByte(frameHeader, 0x04);
    writeByte(frameHeader, 0x04); // Disposal method 1: Do not dispose (overwrite cleanly)
    writeShort(frameHeader, delayCs);
    writeByte(frameHeader, 0x00); // Transparent color index (unused)
    writeByte(frameHeader, 0x00); // Terminator

    // Image Descriptor
    writeByte(frameHeader, 0x2c);
    writeShort(frameHeader, 0); // Left
    writeShort(frameHeader, 0); // Top
    writeShort(frameHeader, width);
    writeShort(frameHeader, height);
    writeByte(frameHeader, 0x00); // No local color table

    chunks.push(new Uint8Array(frameHeader));

    // LZW Compressed Image Data
    const compressed = lzwEncode(frames[idx], 8);
    chunks.push(compressed);

    if (onProgress) {
      onProgress(idx + 1, frames.length);
    }
    // Yield periodically to keep UI responsive
    if (idx % 4 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  // GIF Trailer
  chunks.push(new Uint8Array([0x3b]));

  return new Blob(chunks as BlobPart[], { type: 'image/gif' });
}

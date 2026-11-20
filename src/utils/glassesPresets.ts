/**
 * 5 Custom Dark-Shadow Glasses Silhouettes for the Matrix Digital Rain Portrait Studio.
 * Each preset defines:
 * - Negative-space dark lens cutouts that occlude the bright face rain (forming the signature dark eyewear shadow)
 * - Subtle phosphor-green rim/bridge glints that frame the glasses inside the falling code
 * - An inline SVG path preview for the interactive eyewear selector cards
 */

export interface GlassesPreset {
  id: string;
  number: string;
  name: string;
  archetype: string;
  description: string;
  svgPreviewPath: string;
  drawMask: (
    ctx: CanvasRenderingContext2D,
    centerX: number,
    eyeY: number,
    faceWidth: number,
    mode: 'shadow' | 'rim'
  ) => void;
}

export const GLASSES_PRESETS: GlassesPreset[] = [
  {
    id: 'trinity-cut',
    number: '01',
    name: 'Trinity Angular Cut',
    archetype: 'Original Reference GIF Silhouette',
    description: 'Deep swept cat-eye shadow cutout matching the exact dark lens silhouette in the original Matrix GIF.',
    svgPreviewPath:
      'M 8 20 Q 26 17 44 23 L 40 37 Q 25 43 12 33 Z M 56 23 Q 74 17 92 20 L 88 33 Q 75 43 60 37 Z M 43 24 Q 50 21 57 24',
    drawMask: (ctx, cx, eyeY, fw, mode) => {
      const sep = fw * 0.215;
      const lensW = fw * 0.22;
      const lensH = fw * 0.145;

      ctx.beginPath();
      // Left swept angular cat-eye lens
      ctx.moveTo(cx - sep - lensW * 0.95, eyeY - lensH * 0.38);
      ctx.quadraticCurveTo(cx - sep, eyeY - lensH * 0.55, cx - sep + lensW * 0.88, eyeY - lensH * 0.15);
      ctx.quadraticCurveTo(cx - sep + lensW * 0.72, eyeY + lensH * 0.92, cx - sep - lensW * 0.1, eyeY + lensH * 0.98);
      ctx.quadraticCurveTo(cx - sep - lensW * 0.88, eyeY + lensH * 0.75, cx - sep - lensW * 0.95, eyeY - lensH * 0.38);
      ctx.closePath();

      // Right swept angular cat-eye lens
      ctx.moveTo(cx + sep + lensW * 0.95, eyeY - lensH * 0.38);
      ctx.quadraticCurveTo(cx + sep, eyeY - lensH * 0.55, cx + sep - lensW * 0.88, eyeY - lensH * 0.15);
      ctx.quadraticCurveTo(cx + sep - lensW * 0.72, eyeY + lensH * 0.92, cx + sep + lensW * 0.1, eyeY + lensH * 0.98);
      ctx.quadraticCurveTo(cx + sep + lensW * 0.88, eyeY + lensH * 0.75, cx + sep + lensW * 0.95, eyeY - lensH * 0.38);
      ctx.closePath();

      if (mode === 'shadow') {
        ctx.fill();
        // Center bridge shadow bar
        ctx.fillRect(cx - sep + lensW * 0.7, eyeY - lensH * 0.24, (sep - lensW * 0.7) * 2, lensH * 0.28);
      } else {
        ctx.stroke();
      }
    },
  },
  {
    id: 'neo-oval',
    number: '02',
    name: 'Neo Micro-Oval',
    archetype: '1999 Chosen One Wireframe',
    description: 'Sleek horizontal micro-oval dark lenses with a curved high-contrast bridge gap.',
    svgPreviewPath:
      'M 12 27 A 16 10 -6 1 1 44 29 A 16 10 -6 1 1 12 27 Z M 56 29 A 16 10 6 1 1 88 27 A 16 10 6 1 1 56 29 Z M 44 26 Q 50 21 56 26',
    drawMask: (ctx, cx, eyeY, fw, mode) => {
      const sep = fw * 0.205;
      const rx = fw * 0.185;
      const ry = fw * 0.105;

      ctx.beginPath();
      ctx.ellipse(cx - sep, eyeY + ry * 0.08, rx, ry, -0.09, 0, Math.PI * 2);
      ctx.ellipse(cx + sep, eyeY + ry * 0.08, rx, ry, 0.09, 0, Math.PI * 2);

      if (mode === 'shadow') {
        ctx.fill();
        // Thin nose bridge shadow
        ctx.beginPath();
        ctx.arc(cx, eyeY + ry * 0.05, sep - rx * 0.75, Math.PI * 1.15, Math.PI * 1.85);
        ctx.lineWidth = Math.max(2, fw * 0.025);
        ctx.stroke();
      } else {
        ctx.stroke();
      }
    },
  },
  {
    id: 'morpheus-round',
    number: '03',
    name: 'Morpheus Pince-Nez',
    archetype: 'Nebuchadnezzar Rimless Round',
    description: 'Iconic circular twin-lens nose-clip shadow discs poised directly over the orbital sockets.',
    svgPreviewPath:
      'M 15 28 A 13 13 0 1 1 41 28 A 13 13 0 1 1 15 28 Z M 59 28 A 13 13 0 1 1 85 28 A 13 13 0 1 1 59 28 Z M 41 27 L 59 27',
    drawMask: (ctx, cx, eyeY, fw, mode) => {
      const sep = fw * 0.195;
      const radius = fw * 0.145;

      ctx.beginPath();
      ctx.arc(cx - sep, eyeY + radius * 0.05, radius, 0, Math.PI * 2);
      ctx.moveTo(cx + sep + radius, eyeY + radius * 0.05);
      ctx.arc(cx + sep, eyeY + radius * 0.05, radius, 0, Math.PI * 2);

      if (mode === 'shadow') {
        ctx.fill();
        // Pince-nez metallic bridge clip
        ctx.fillRect(cx - (sep - radius * 0.85), eyeY - radius * 0.08, (sep - radius * 0.85) * 2, radius * 0.22);
      } else {
        ctx.stroke();
      }
    },
  },
  {
    id: 'agent-wrap',
    number: '04',
    name: 'Agent Rectangular Wrap',
    archetype: 'System Enforcer Interceptor',
    description: 'Sharp horizontal geometric lens cutouts with an authoritative straight brow silhouette.',
    svgPreviewPath:
      'M 9 20 L 45 22 L 42 36 L 12 35 Z M 55 22 L 91 20 L 88 35 L 58 36 Z M 45 24 L 55 24',
    drawMask: (ctx, cx, eyeY, fw, mode) => {
      const sep = fw * 0.21;
      const w = fw * 0.21;
      const h = fw * 0.115;

      ctx.beginPath();
      // Left angular rectangle
      ctx.moveTo(cx - sep - w, eyeY - h * 0.65);
      ctx.lineTo(cx - sep + w * 0.88, eyeY - h * 0.42);
      ctx.lineTo(cx - sep + w * 0.72, eyeY + h * 0.82);
      ctx.lineTo(cx - sep - w * 0.84, eyeY + h * 0.74);
      ctx.closePath();

      // Right angular rectangle
      ctx.moveTo(cx + sep + w, eyeY - h * 0.65);
      ctx.lineTo(cx + sep - w * 0.88, eyeY - h * 0.42);
      ctx.lineTo(cx + sep - w * 0.72, eyeY + h * 0.82);
      ctx.lineTo(cx + sep + w * 0.84, eyeY + h * 0.74);
      ctx.closePath();

      if (mode === 'shadow') {
        ctx.fill();
        ctx.fillRect(cx - sep + w * 0.75, eyeY - h * 0.42, (sep - w * 0.75) * 2, h * 0.35);
      } else {
        ctx.stroke();
      }
    },
  },
  {
    id: 'cyber-visor',
    number: '05',
    name: 'Cyber Visor Shield',
    archetype: 'Monolithic Wraparound Blade',
    description: 'Continuous single-piece dark obsidian visor carving a sharp V-notch across the nasal bridge.',
    svgPreviewPath:
      'M 8 20 Q 50 16 92 20 L 87 35 Q 66 39 55 31 L 50 27 L 45 31 Q 34 39 13 35 Z',
    drawMask: (ctx, cx, eyeY, fw, mode) => {
      const totalW = fw * 0.43;
      const h = fw * 0.135;

      ctx.beginPath();
      ctx.moveTo(cx - totalW, eyeY - h * 0.55);
      ctx.quadraticCurveTo(cx, eyeY - h * 0.85, cx + totalW, eyeY - h * 0.55);
      ctx.lineTo(cx + totalW * 0.9, eyeY + h * 0.78);
      ctx.quadraticCurveTo(cx + totalW * 0.42, eyeY + h * 1.05, cx + totalW * 0.14, eyeY + h * 0.32);
      ctx.lineTo(cx, eyeY + h * 0.05);
      ctx.lineTo(cx - totalW * 0.14, eyeY + h * 0.32);
      ctx.quadraticCurveTo(cx - totalW * 0.42, eyeY + h * 1.05, cx - totalW * 0.9, eyeY + h * 0.78);
      ctx.closePath();

      if (mode === 'shadow') {
        ctx.fill();
      } else {
        ctx.stroke();
      }
    },
  },
];

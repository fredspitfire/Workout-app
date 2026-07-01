/**
 * Generate PWA raster icons from static/icon.svg. Run with `npm run gen:icons`.
 *
 * Android/Chrome only offers the real "Install app" (standalone) prompt when the
 * manifest has PNG icons at 192 and 512, so an SVG-only manifest isn't enough.
 * We render at high density then downscale for crisp edges, and produce a
 * full-bleed maskable variant (SVG flattened onto the brand background so the
 * launcher mask has no transparent corners to cut into).
 */
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const BG = '#0b0f17'; // manifest background/theme color
const svg = readFileSync(join('static', 'icon.svg'));
const out = (name: string) => join('static', name);

// density 384 ≈ rendering the 512-viewBox SVG at ~2700px before downscaling.
const src = () => sharp(svg, { density: 384 });

await src().resize(192, 192).png().toFile(out('icon-192.png'));
await src().resize(512, 512).png().toFile(out('icon-512.png'));
await src().resize(512, 512).flatten({ background: BG }).png().toFile(out('icon-512-maskable.png'));
await src().resize(180, 180).png().toFile(out('apple-touch-icon.png'));

console.log('Wrote icon-192.png, icon-512.png, icon-512-maskable.png, apple-touch-icon.png to static/');

/*
   img-variants.js — turns one full-size photograph into the set of files a
   <picture> element on this site expects.

   WHY THIS EXISTS
   ---------------
   Every photograph on the site ships as a responsive ladder: a handful of
   JPEGs at fixed pixel widths, the same ladder again in WebP, and a `srcset`
   that lets the browser pick the smallest rung that still fills the slot. A
   tile in the gallery grid is 391px wide on a desktop, so shipping it at
   1200px wastes roughly four fifths of the bytes. That waste is what the
   mobile Lighthouse run keeps complaining about.

   Doing this by hand is how ladders end up inconsistent — a missing rung
   here, a different quality there. This script is the single definition of
   what a "set of variants" means for this project, so the next batch of
   photographs looks and weighs the same as the last one.

   WHAT IT WRITES
   --------------
   For a source photo and a target name "hut-1":

       hut-1-400.jpg   hut-1-400.webp
       hut-1-640.jpg   hut-1-640.webp
       hut-1-800.jpg   hut-1-800.webp
       hut-1-960.jpg   hut-1-960.webp
       hut-1.jpg       hut-1.webp      <- the base, the top rung

   The base is the *largest* rung, not the original. Originals off a phone
   are 2268px wide; nothing on this site displays a photograph wider than
   about 1200 CSS pixels, so keeping more than BASE_W is dead weight in the
   repository and in the CMS media picker.

   WHY BOTH JPEG AND WEBP
   ----------------------
   Measured on this project's own photographs, at *matched* visual quality
   (SSIM 0.94-0.96) WebP comes out 24-25% smaller than mozjpeg. Comparing at
   matched quality is the only fair test — comparing at the same quality
   NUMBER is meaningless, because q78 does not mean the same thing to the two
   encoders. The JPEG ladder stays as the <img> fallback so nothing breaks on
   an ancient browser, and the WebP ladder goes in a <source> that every
   current browser prefers.

   RUNNING IT
   ----------
   sharp is the only dependency and is NOT vendored — this site has no build
   step and no package.json, so nothing needs sharp to deploy. Install it
   wherever you like and point Node at it:

       npm install sharp
       node tools/img-variants.js <source-dir-or-file> <out-dir> [name]

   With a directory it processes every jpg/jpeg/png inside and keeps each
   file's own basename. With a single file you may pass the target name as
   the third argument.

   It prints one line per photo — `name width height` — because the markup
   needs those exact numbers in the width/height attributes to reserve the
   right space and avoid layout shift.
*/

'use strict';

const fs = require('fs');
const path = require('path');

let sharp;
try {
  sharp = require('sharp');
} catch (e) {
  console.error(
    'img-variants: sharp is not installed.\n' +
    '  npm install sharp\n' +
    'then run this again (NODE_PATH may need to point at where you installed it).'
  );
  process.exit(1);
}

/* The rungs below the base. These are the widths that actually appear in
   `sizes` across the site once device pixel ratio is taken into account:
   400 covers a phone tile, 640/800 a tablet column, 960 a desktop tile on a
   retina screen. */
const RUNGS = [400, 640, 800, 960];

/* The top rung. 1200 is what the existing photographs use, and it is about
   1.5x the widest slot any photograph occupies, which is enough headroom for
   a 2x screen without paying for a 2268px original. */
const BASE_W = 1200;

/* Quality. Chosen by encoding this project's own photographs at a range of
   settings and measuring luma SSIM against the original: these two land at
   roughly SSIM 0.96, which is the point where differences stop being visible
   at normal viewing distance. They are deliberately a little more generous
   than the minimum — this is a boutique brand and the photographs are the
   product. mozjpeg + trellis quantisation buys a few percent for free. */
const JPEG_Q = 82;
const WEBP_Q = 68;

/* A rung is pointless when it is nearly as wide as the base — it would cost
   a file and save no bytes. 0.9 is the usual cut-off: a 960 rung under a
   1000px base is not worth writing, a 960 rung under a 1200px base is. */
const RUNG_CUTOFF = 0.9;

async function variantsFor(srcPath, outDir, name) {
  const input = fs.readFileSync(srcPath);
  const meta = await sharp(input).metadata();

  /* Never upscale. A source narrower than BASE_W keeps its own width as the
     base, and the ladder shortens accordingly. */
  const baseW = Math.min(meta.width, BASE_W);
  const baseH = Math.round((meta.height / meta.width) * baseW);

  /* Resize once, to the base, and encode every rung from THAT buffer rather
     than from the original. Two reasons: it is faster, and every rung then
     comes from identical pixels, so the ladder cannot drift in colour or
     sharpening between rungs. */
  const base = await sharp(input)
    .rotate()                         // honour any EXIF orientation first
    .resize(baseW, null, { withoutEnlargement: true })
    .toBuffer();

  const widths = RUNGS.filter(w => w < baseW * RUNG_CUTOFF).concat(baseW);

  for (const w of widths) {
    /* The base rung is written without a width suffix — that is the name the
       markup uses as `src`, and the name the CMS shows in its media picker. */
    const stem = w === baseW ? name : name + '-' + w;
    const resized = sharp(base).resize(w, null, { withoutEnlargement: true });

    await resized.clone()
      .jpeg({ quality: JPEG_Q, mozjpeg: true, trellisQuantisation: true, chromaSubsampling: '4:2:0' })
      .toFile(path.join(outDir, stem + '.jpg'));

    await resized.clone()
      .webp({ quality: WEBP_Q, effort: 6, smartSubsample: true })
      .toFile(path.join(outDir, stem + '.webp'));
  }

  return { name: name, width: baseW, height: baseH, rungs: widths };
}

(async () => {
  const src = process.argv[2];
  const outDir = process.argv[3];
  const forcedName = process.argv[4];

  if (!src || !outDir) {
    console.error('usage: node tools/img-variants.js <source-dir-or-file> <out-dir> [name]');
    process.exit(1);
  }
  fs.mkdirSync(outDir, { recursive: true });

  const stat = fs.statSync(src);
  const jobs = stat.isDirectory()
    ? fs.readdirSync(src)
        .filter(f => /\.(jpe?g|png)$/i.test(f))
        .map(f => ({ file: path.join(src, f), name: f.replace(/\.[^.]+$/, '') }))
    : [{ file: src, name: forcedName || path.basename(src).replace(/\.[^.]+$/, '') }];

  for (const job of jobs) {
    const r = await variantsFor(job.file, outDir, job.name);
    console.log(r.name, r.width, r.height);
  }
})();

# Maefer Website

Fresh public website project for Maefer technology.

## Local development

```bash
npm install
npm run dev
```

Vite prints the local development URL after starting.

## Production build

```bash
npm run build
npm run preview
```

The production output is generated in `dist/`.

## Current experience status

Sections 1–3 now share one continuous sticky scene:

- Ninety-second, full-HD cinematic loop rendered in Blender.
- A custom free-standing modern print head with no visible printer frame or
  build plate.
- A solid technical-blue, twisted sculptural part printed in discrete layers.
- The part prints directly on a bright white studio surface with soft shadows.
- The live print loop freezes on the exact frame visible when scrolling begins.
- Lightweight HTML video playback with a static reduced-motion fallback.

Section 2 is implemented as a scroll-controlled canvas sequence:

- Only the blue printed path in that live frame crossfades into dots.
- Those same particles flow directly toward two telemetry cards.
- They finish as separate red temperature and blue humidity diagrams.
- Scrolling back to the top restores and resumes the live print loop.
- The canvas renders at device pixel density and has no pointer interaction.

Section 3 continues from the existing particle system:

- The red and blue diagram dots detach from both telemetry cards.
- The same dots converge onto a raised square object.
- They resolve into a deterministic 29 × 29 dotted QR-style pattern with
  recognizable finder corners.

Section 4 completes the loop:

- The dotted QR object zooms out, turns in perspective, and becomes a small
  physical module.
- A compact white industrial arm with cyan joint caps enters the frame, grips
  the module, and carries it into a reconstructed version of the printed part.
- The print head remains active above the blue part during the insertion.
- The arm releases and retracts while the embedded module receives a green
  integration glow.
- After a short hold at the end, the page automatically returns to Section 1
  and resumes the print loop.

## Re-rendering Section 1

The reproducible Blender source is in `tools/render_section_one.py`. With Blender
4.5 LTS installed, render the poster or the full loop with:

```bash
blender --background --python tools/render_section_one.py -- --preview
blender --background --python tools/render_section_one.py -- --animation
```

The `.blend` source is saved to `assets/blender/` and browser media to
`public/media/`.

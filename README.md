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

- Ninety-second, 2560 × 1440 cinematic loop rendered in Blender.
- A minimal dark print stage with the surrounding laboratory machinery and
  decorative 3D clutter removed.
- A centered camera composition keeps the printed part roughly 30% smaller
  inside a persistent 16:9 interface frame.
- A compact, narrow print head with its complete upper housing and cooling
  assembly, but without the unwanted red/black cable rods behind the heater.
- A solid technical-blue, twisted sculptural part printed in discrete layers.
- The part prints under restrained cyan and warm lighting, metallic reflections,
  and cinematic depth of field.
- A fixed futuristic dark shell remains visible around the centered animation
  frame throughout every scroll stage.
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

The final transition closes the loop back into Section 1:

- The dotted QR object zooms out and becomes a tiny physical module.
- The exact captured frame from Section 1 returns behind the transition.
- The QR module flies directly into the blue printed part without a robotic arm.
- The QR module collapses into a small embedded dot at the insertion point.
- After a short hold, the canvas clears on the same frame and the live print
  video resumes, creating a continuous cycle without reversing the scenes.

## Re-rendering Section 1

The reproducible Blender source is in `tools/render_section_one.py`. With Blender
4.5 LTS installed, render the poster or the full loop with:

```bash
blender --background --python tools/render_section_one.py -- --preview
blender --background --python tools/render_section_one.py -- --animation
```

The `.blend` source is saved to `assets/blender/` and browser media to
`public/media/`.

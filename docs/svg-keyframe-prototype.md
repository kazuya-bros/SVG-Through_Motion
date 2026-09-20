# SVG middle-shape prototype

Open `output/prototypes/svg-keyframe-morph.html` directly in a browser. No server, model, or network connection is required. Rebuild this standalone file with `node tools/build_svg_morph_prototype.mjs`.

The development page is `/web/svg-keyframe-prototype.html` on the existing app server. This is a separate experiment; it does not modify character projects or add a setting to the application.

## What it demonstrates

- Compare endpoint-only interpolation against five targets at 0, 0.25, 0.5, 0.75, and 1.
- Both sides use the same endpoints. Sample 0.3 interpolates twenty percent from target 0.25 toward target 0.5.
- Edit the middle eye/mouth contours, scrub the value, play a loop, and inspect control points.
- Export an animated, self-contained SVG or save/load the shape track as JSON.
- Store coordinates with a common M/C/C/Z path structure. Playback updates existing path attributes, with no raster frames or inference.
- The demo geometry takes roughly 0.5 KB per track as compact JSON. This is not a performance measurement for complex character artwork.

## Limits

All targets are hand-authored. RIFE inference, fitting SVG contours to RIFE images, arbitrary SVG import, project persistence, and the character renderer are not connected. Iris/teeth/tongue artwork is fixed and clipped by the changing contour. Point positions are continuous at keyframes, but piecewise linear interpolation does not guarantee continuous velocity.

## Agent access and validation

UI and prototype API share `web/svg-keyframes.js`. `window.svgMorphPrototype.getState()`, `setValue(number)`, and `exportSvg()` expose the current experiment. JSON import validates values and topology before adoption. No production HTTP/MCP action is added; file dialogs are UI operations and this page-local API is for the prototype only.

`node --test tests/svg-keyframes.test.mjs` covers endpoints, intermediate targets, boundary continuity, local influence of edits, immutable sampling, and invalid inputs. JavaScript syntax and the standalone artifact are checked as well. The standalone page was opened in the in-app browser; no desktop application restart or package replacement is needed.

# RIFE → SVG prototype (2026-09-17)

## Open

`output/prototypes/svg-rife-keyframe-morph.html` is self-contained. Select the eye or mouth, compare endpoint-only and RIFE-derived SVG contours, and inspect the five reference images below. The source selector restores either the RIFE-derived initial tracks or the hand-authored initial tracks. Exported animated SVGs have no raster images or model dependency.

The head-turn experiment was stopped at the user's request. Its comparison panel and automatic generation have been removed. Earlier result files are retained on disk but are not embedded in the current HTML.

## Blink timing correction

The eye now defaults to 100% timing correction. The left panel shows the original RIFE-derived SVG timing, and the right shows the corrected track. Strength 0% restores the uncorrected track exactly; the mouth is unaffected.

The correction measures the gap at the middle of the two cubic eyelids, inverts its closing-progress curve, and samples new shapes at the five existing key positions. At strength 100%, opening decreases proportionally with the control value: 0.5 gives 50% opening. The recorded raw RIFE eye gave only about 5.58% opening there. This normalizes the control response; it is not a claim that proportional opening is the only natural blink timing.

Endpoints stay exact. The corrected coordinates are baked into the exported SVG/JSON, so playback needs no extra model or timing channel. Changing correction strength resets manual eye edits, as described beside the control. UI and the prototype API share `retimeEyeTrack`; `setTimingStrength(0..1)` is available in RIFE mode.

## Reproduce

The optional CPU inference wheel is isolated in `.desktop-build/rife-prototype-deps`; production requirements and the PachiPakuGen installation are unchanged.

```powershell
.desktop-build/venv/Scripts/python.exe -m pip install --target .desktop-build/rife-prototype-deps --no-deps onnxruntime==1.23.2
.desktop-build/venv/Scripts/python.exe tools/generate_rife_svg_prototype.py --model E:/develop/PachiPakuGen/src-tauri/models/rife.onnx --output output/prototypes/rife-NEW-RUN
node tools/build_svg_morph_prototype.mjs output/prototypes/rife-NEW-RUN/dataset.json
```

Use a new output directory for each run. The runner checks the audited model SHA-256 before loading it. Results used here are in `output/prototypes/rife-20260917-b/`. The model itself is not copied into the application or the HTML. Attribution is in THIRD_PARTY_NOTICES.md.

## Pipeline and limits

1. Rasterize only the two endpoint SVG-like demo shapes onto the same opaque skin background.
2. Run the actual PachiPakuGen Practical-RIFE v4.9.2 ONNX at 0.25, 0.5, and 0.75 (RGB tensors, 64-pixel padding, CPU Execution Provider).
3. Extract the largest non-background region and fit the upper/lower cubic handles. Horizontal coordinates and corner positions come from the endpoint interpolation. This is a deliberately restricted flat-background contour fit, not arbitrary character segmentation.
4. Constrain the fitted handles toward the closing/opening endpoint to prevent reversal. Store coordinates in the existing M/C/C/Z track. The endpoints stay exact.
5. Play and export using the existing SVG track sampler. Iris, teeth, and tongue art remains the original vector artwork; RIFE appearance is not fully reproduced.

## Actual observations

- Eye: the RIFE result closes early around the middle and fades the iris. Extracting its contour does not make it a guaranteed anatomical blink.
- Mouth: some middle images remain close to a thin moving line. The stabilized SVG differs from that raw output: the largest vertical-handle correction was **19.62 px**. This is not a claim that RIFE improved the mouth.
- Raw fit boundary mean errors in the recorded run were 0.31–2.34 px for the eye and 0.33–1.02 px for the mouth. These are **before** stabilization and measure only the extracted region boundary, not full visual fidelity.
- The small 240×220 examples took about 45–51 ms per intermediate image on this run's CPU, excluding model load, fitting, and export. These are not full-character or live-use benchmarks.
- Compact SVG tracks are under 1 KB each. Reference images make the comparison HTML larger; exported SVG animation does not include them.

## Face direction and other uses

RIFE can bridge prepared front/oblique views or left/right head poses. If those endpoints come from the existing SVG rig, RIFE will still inherit their errors; it cannot recover unseen anatomy from a single front view. A full SVG implementation needs consistent correspondences for face outline, eyes, nose, mouth, ears, and hair, plus explicit occlusion rules. Large turns can reveal or hide surfaces and cannot be solved by contour coordinates alone.

Other candidates are expression changes (eyebrows/cheeks), ears folding, tails bending, and clothing deformation, when independently prepared endpoint artwork exists. Ordinary rigid translations, rotations, and the existing continuous SVG sway are already directly renderable and do not automatically benefit from RIFE.

## Verification / agent use

- The original recorded run completed nine middle images: eye, mouth, head turn × three times. Subsequent runs generate only the six eye/mouth middle images. Timing correction reuses existing results without another model run.
- Four Python tests cover known contour recovery, blank-region failure, input alignment/alpha rejection, and distinct head endpoints.
- Seven JavaScript tests cover interpolation, continuity, input validation, local edit influence, blink closure, proportional opening, strength, and endpoint preservation.
- Actual-data standalone checks confirm timing OFF/ON, mouth isolation, reset, corrected SVG export, JSON reload, and exclusion of the head-turn panel/data.
- Standalone artifact execution/export is verified with a DOM test stub; the generated page was also opened successfully in the in-app browser. No claim of native application integration or measured live-render performance.
- The generator CLI emits JSON progress and a dataset path. UI and `window.svgMorphPrototype` use the same SVG sampler; `getState`, `setValue`, `setSource`, and `exportSvg` are available. Production HTTP/MCP endpoints are unchanged.

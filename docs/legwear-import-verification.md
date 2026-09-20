# Legwear import verification

Verified on 2026-09-16.

## Change

- Hybrid import with motion-part separation enabled now retains visible `legwear` and `footwear` as independent parts, alongside `bottomwear`.
- Preserve separated PSD pixels, including concealed artwork and translucent edges. Garment pixels must not also be baked into the torso from the flattened source image.
- Keep the PSD order among isolated garments instead of reversing their order when inserting them next to the torso.
- Material correction exports carry the same independent-part metadata. Project import retains the new deformation groups.
- These changes use the existing shared conversion pipeline for UI and API/MCP requests. Hidden layers stay hidden. No additional leg animation is introduced.

## Validation

- `python -m unittest tests.test_segmented tests.test_hybrid tests.test_materials`: 40 tests passed.
- `npm test`: 225 tests passed.
- `node --check web/app.js`: passed.
- Regression cases cover translucent legwear, reversed garment order, hiding legwear without a baked copy remaining in the torso, hidden PSD layers, actual SVG conversion, and material correction export.
- Desktop backend rebuilt and packaged. No live UI verification, per the user's instruction.

Existing merged projects need reimport from their PSD with motion-part separation enabled; the saved flattened body alone cannot restore the original independent layer.

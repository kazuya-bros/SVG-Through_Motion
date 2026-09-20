# Eyewear import verification

Verified on 2026-09-16.

## Fix

- Treat visible `eyewear` layers as independent accessories instead of merging them into the face/torso base, where face separation could remove them.
- Preserve accessory alpha and place eyewear above facial features, respecting its PSD order relative to front hair.
- Attach eyewear to the face base (or the white-of-eye part when no face base exists) through the existing `followPart` mechanism.
- Keep hidden eyewear excluded. Source PSDs are not modified.

## Validation

- Python: 14 hybrid tests and 13 segmented tests passed.
- JavaScript: 6 material/attachment tests passed.
- Regression cases cover segmented and unsegmented import, eyewear above/below front hair, translucent lenses, face attachment, and hidden eyewear.
- The rebuilt desktop backend completed conversion of the user's actual 1280 × 1280 material set, including Depth and closed-eye/closed-mouth donors.
- The resulting 20-part project contains `PSDの眼鏡（eyewear）`; the actual editor displays the sunglasses on the character's head. Screenshot: `qa/eyewear-import-fixed.png`.
- Distribution ZIP CRC and packaged backend byte comparison passed.

Existing converted projects need reimport from the PSD to recover an omitted layer.

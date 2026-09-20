# Motion references and adapted code

Face XYZ and speech jaw update: `web/face-rig.js` adapts the face-scale,
depth-based X/Y parallax, restrained Z rotation, and mouth-driven chin drop in
[Anime2.5DRig lib/app.js](https://github.com/852wa/Anime2.5DRig/blob/7450341934a8ff77bf05b90d9f708786e3eb3996/lib/app.js)
(`deform`, revision `7450341934a8ff77bf05b90d9f708786e3eb3996`). Copyright (c) 2026 hakoniwa,
MIT; full license is retained in `licenses/Anime2.5DRig-MIT.txt`.
Local changes use a face-only spatial falloff for merged face/torso assets,
independent hair/accessory sway combined with common head orientation,
separate eyebrow height and tilt, shared eye parallax to retain lid alignment,
a jaw falloff before the neck, deterministic poses, and a lightweight SVG
displacement filter rather than copying the upstream WebGL runtime or assets.

`web/pachipaku-motion.js` adapts the following PachiPakuGen motion techniques.
PachiPakuGen: Copyright (c) 2026 kazuya_bros, MIT. Full text: [licenses/PachiPakuGen-MIT.txt](licenses/PachiPakuGen-MIT.txt).

- Anime2.5DRig by 852話: revision `d48825867acd081de22b0e7b5585bb562288796d`, Copyright (c) 2026 hakoniwa, MIT. [Full license](licenses/Anime2.5DRig-MIT.txt). Via `E:/develop/PachiPakuGen/src/motionLabPhysics.ts`, `stepHairStrandSpring`: stiff/soft spring constants, output gains and displacement limits. Changed here to the analytic steady periodic response of each spring, so seeking and SVG/MP4 export do not depend on frame history. Hair strand detection and upstream assets are not included.
- PuruPuruPNGTuber by ろてじん: revision `9dc1e735155faae8f54f9ee3076b52db7da36624`, Copyright 2026 masa, Apache License 2.0. [Full license](licenses/Apache-2.0.txt). Via `E:/develop/PachiPakuGen/src/motionLab/render.ts`, `drawMotionLabWaveWarp` / upstream `pyokopyokoHairShift`: root pinning, two wave components, period/phase design. Changed to slow integer loop frequencies, normalized low amplitude, a protected face/torso region, and bounded horizontal mesh motion. Upstream demo images, sound, and avatars are not included.

The current mode keeps the face and torso rigid and joins fixed-pivot transforms around the neck. Wave and double-spring methods are now mutually exclusive UI choices. Experimental source-image partitions use independent front/back hair fields with different phases, adjustable root-to-tip envelopes, and limits of 6/18 pixels per 1024px width; unpartitioned stable projects retain a 6px limit. Arms use a separate small shoulder rotation. This is an adaptation to the original-image-plus-PSD-face architecture, not a complete port of PachiPakuGen or either upstream application.

Further changes: partition fields are blended into one shared mesh to keep cut boundaries continuous. The blended complex spring response is normalized to unit amplitude before applying the root-to-tip envelope and user amplitude. Integer cycle count and stiffness/damping controls vary speed and phase without unintentionally reducing the requested amplitude. These controls and normalization are local adaptations, not the upstream runtime physics solver.


September 2026 editor update: front and back hair expose separate spring/wave method, amplitude and integer cycle settings. Editor projects use independent paint-order groups (`independentHair`) so a hair field no longer deforms the face or the other hair group; legacy shared-field projects remain renderable. Stable head motion uses a fixed neck blend, a relative head/body rotation, an 8-degree head range and a 6-pixel nod range. The spring and wave options remain local loop-friendly adaptations of the credited algorithms, not exact upstream solvers.

Standalone SVG performance update: animated SVG export now preserves intact vector parts and uses rigid character motion, root-pinned hair shear, and shoulder rotation with the existing loop responses. It no longer duplicates artwork across triangle clips. Canvas/video retain the mesh deformation; their fine bending differs from the lightweight SVG output. Constant SVG channels are emitted as static attributes.
# PachiPakuGen 素材準備工程の移植（2026-09-15）

`studio/materials.py` は [kazuya-bros/PachiPakuGen](https://github.com/kazuya-bros/PachiPakuGen) の
`BaseEditorPersistedState`、`BaseEditorLayerPatch`、`transform_extracted_part` を参照・適応したものです。
MIT License。元実装のレイヤー順・有効状態・不透明度・追加補修・非破壊変換というデータ設計を、
Python/PillowとHTTP APIに移植し、版管理・所属・Depth調整・SVG受け渡しを追加しています。
画像の拡縮は全体中心基準からパーツ原点基準へ変更しています。
PachiPakuGenのソース・モデル全体を同梱する変更ではありません。

# RIFEからSVG中間形状への試作（2026-09-17）

`studio/rife_keyframes.py` のモデル入力規約（RGB、64px単位のゼロpad、
`img0` / `img1` / `timestep`、元寸法へのcrop）はPachiPakuGenの
`src-tauri/src/inference/rife.rs`（MIT、Copyright (c) 2026 kazuya_bros）を参考にしています。
既存のPachiPakuGenにあるPractical-RIFE v4.9.2 ONNXを読み取り専用で利用します。
SHA-256: `0f9f5d969d5221db40a30cc1c4ca9e66d34a408d8bdf146256121ed0304a25a6`。
モデル・上流実装は [hzwer/Practical-RIFE](https://github.com/hzwer/Practical-RIFE)、
MIT、Copyright (c) 2021 hzwer。使用モデルの上流revisionは
`17d8c7a1005b37f4c97bfee04e316aaec7fdc536`。モデルは本試作HTMLに同梱していません。
輪郭フィットと単調性の制約はSVG-Through側の試作処理で、RIFEの機能ではありません。

2026-09-17: デスクトップ版の目・口用オフライン中間形状生成に、上記の監査済みモデルを同梱しました。
モデルのライセンスは `licenses/Practical-RIFE-MIT.txt`。実行にはONNX Runtime 1.23.2（MIT）を使用し、配布ZIPに依存パッケージのライセンスを含めます。
入力画像の局所切り出し、輪郭からの変形グリッド推定、早閉じ補正、反転・戻りの抑制は本製品独自の後処理です。

8枚SVG再生の透過処理では、監査済みRIFEの最終フロー・混合マスクをアルファにも適用するノードをメモリ上で追加します。学習済み重みとRGB出力は変更しません。
`studio/_onnx_schema.py` は ONNX 1.18.0 の生成済み `onnx/onnx_ml_pb2.py` の無改変コピーです。
Copyright (c) ONNX Project Contributors、Apache License 2.0。
全文は `licenses/ONNX-Apache-2.0.txt`。完全なONNXパッケージは配布しません。

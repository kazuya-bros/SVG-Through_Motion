# WebMの再生間隔・耳の枠の修正（2026-09-19）

## 原因

WebMだけがMediaRecorderによる実時間の画面録画を使用していた。報告された最新ファイルはChrome生成のVP9で、duration・Cuesがなく、冒頭のPTSは0 / 5 / 45 / 85 / 124ms。4秒設定でも録画準備や描画待ちが入り込んでいた。

耳のSVGは白いキャンバスを複数の黒い輪郭で切り抜くVTracerのマスクだった。絵が画像の端に接し、黒い領域が複数・平行移動ありで、以前の「完全な四角＋内側の穴」のみの補正では対象外。微小なalphaの四角が残り、alphaを適用しないデコードでは明るいRGBが露出した。PSDの元絵に描かれた枠ではない。

## 修正

- WebM・MP4を同じ全フレーム順送り方式に統一。WebMは30fps、時間・シーク情報付き。
- 通常WebMはVP9 CRF18で保存。外部素材APIの既定losslessは維持。
- 書き出し中の重複したプレビュー描画を停止し、出力用rendererは必ずdisposeする。
- 画像端に接した複数の黒いマスク輪郭を個別の反転clipPathとして交差させる。単純に全輪郭をXORすると重なりが再表示されるため使わない。既存のグレーの半透明部分、絵自体、保存データは維持。
- .01単位のパス丸めと小数の平行移動による画像端の誤差を吸収。形式外やopacity等の編集があるマスクは補正しない。

## 実データ確認

ユーザーの保存済み22レイヤーのプロジェクトを独立した18787の検証サーバーで読み込み、実際のWebMボタンから書き出した。18765のアプリと保存済みデータは変更していない。

- 旧ファイル4,617,636 bytes。修正後2,692,663 bytes（約42%削減）。
- 修正後1080×1080、4.000秒、120コマ、音声トラックなし、alphaあり、Cuesあり。
- PTS間隔33/34ms（WebMの1ms精度で30fps）。FFmpegによる全コマデコード成功。
- VLC 3.0.18を設定無視・別プロセス・dummy出力で再生。約4秒で正常終了、遅延フレームの警告なし。通常のGUI描画やユーザーのGPU設定のベンチマークではない。
- alpha非対応デコードとalpha合成の両方で、動画の耳の四角い枠が消えたことを確認。
- p004耳単体の端数座標・縮小確認で199画素の不要alphaがゼロになり、背景への追加画素はゼロ。alpha>200の判定差は輪郭の1画素のみ。
- ページ例外なし。Nodeテスト258件、Python動画出力テスト5件成功。ブラウザ用マスク回帰テストも成功。

ブラウザ回帰確認: PlaywrightをNODE_PATHに設定し、`node tests/trace-mask-render.browser.cjs http://127.0.0.1:18787`。

## 成果物

- `output/verification/webm-fix-data/exports/4628ae9c214f4104aa22fd419a69912a/svg-through-motion.webm`
- `output/verification/webm-before-vp9.png` / `webm-after-vp9.png`
- `output/verification/webm-ear-raw.png` / `webm-ear-fixed.png`
- `output/verification/webm-fix-export-screen.png`

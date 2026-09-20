# 高品質SVG統合の確認（2026-09-20）

## 実素材

入力は `C:/Users/KAZUYA/Desktop/character_2048_set/1280_up_open2.png` と `SVG-Through_Motion用/main.psd`。元ファイルは変更していません。

- 元絵＋PSDの通常API：22パーツ、6,413パス、組み立てSVG 19,772,815 bytes。
- 素材編集APIにPSDを登録し、既定設定で変換：24パーツ、6,143パス、18,849,884 bytes。
- 両方で `supersampled-contours-v1`、瞳の色補間、PNGを埋め込まないSVGを確認。
- 素材編集側は実アプリの比較画面で表示・アニメーション再生。ブラウザ例外なし。
- 元絵＋PSD側は約54.8MiBのプロジェクトを配信セッションへ渡し、縁取り・夕方照明・裾の青色変更を確認。従来50MBの上限では413になったため、配信・編集ブリッジ・WebSocketを100MBに統一。
- VTracerを子プロセスに移した後、実素材の変換中にジョブAPIを4回読み、応答は3〜7ms。

画像は `output/verification/quality-trace/app-quality-comparison.png` と `app-quality-broadcast.png`。実装した画面をChromiumで撮影しています。

## 回帰・配布版

- `test_hybrid` / `test_materials` / `test_face_donors`：30件通過。
- 新規 `test_quality_trace`：拡大率の上限、位置・寸法と原本保持、空パーツ、色の違う瞳と複雑な色の除外、API既定値、素材の役割引き継ぎ。
- `test_runtime` / `test_control` / `test_agent_control` / `test_agent_mcp` / `test_quality_trace`：42件通過。MCP実接続から素材登録→SVG変換→完了待ち→SVG取得も確認。
- `trace-mask.test.mjs` / `broadcast-look.test.mjs`：6件通過。
- Chromiumで生のSVGを描画し、透明な外側・穴・不透明な色・半透明の色を検証。フロントエンドの旧マスク補修を通さずに成功。
- 配布用バックエンド：PNGとPSDを既定の高品質で変換し、4倍トレースとプロファイルを検証。親終了に伴う停止も成功。
- 配布版の子プロセスは標準入力をDEVNULLに接続。親終了検知用パイプを引き継ぐとWindowsの初期化で待ち続けることを実機のバックエンド試験で確認し、修正済み。

## 残る性質

特定座標で手調整した頬の赤みは自動化していません。トレースによる陰影の段階化、サイズと変換時間の増加は残ります。既存プロジェクトを自動変換し直すこともありません。

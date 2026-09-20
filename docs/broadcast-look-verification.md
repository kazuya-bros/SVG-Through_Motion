# 配信の見た目：検証記録（2026-09-20）

- 対象: 配信準備・配信・OBS表示。静的な試作ページではなく `web/player.html` の実装を確認。
- 実素材: 既存の22パーツのHybridプロジェクトを読み取り、検証用の別セッション・別データ保存先で使用。
- 自動テスト: broadcast-look、stage、character-effects、broadcast-mode、rife-morphの対象テストに成功。performance、runtime_effects、agent_controlのPython16件に成功。
- 結合確認: 縁取り、光、背景画像アップロード、任意の感情画像、パーツ色変更後の再描画、プリセット保存・復元、配信中Altキー、登場、OBS透過、APIのPNG確認画像を確認。ページ例外0件。
- 色候補からマスクの黒を除外し、色変更前後で線や別色を保護するテストを実施。
- 色の描画キャッシュ更新中は旧表示を継続。未開始のAPI演技は開始時刻を遅らせ、色変更の準備時間で演技の長さを消費しないテストを実施。
- 記録: `output/verification/broadcast-look-verification.json`。
- 実画面: `output/verification/broadcast-look-final.png`、`broadcast-look-entrance.png`、`broadcast-look-obs.png`。
- 配布版: `output/desktop/SVG-Through-Motion-0.2.0-windows-x64-20260920-003830`。対応するZIPを作成。今回の主要Webファイル11件についてソース・配布フォルダ・ZIPのバイト一致を確認。
- 同梱バックエンドの起動、PNG/PSD変換、親プロセス終了時の停止を確認。OS側のグローバルキー操作は追加していない。
- 任意のキャラクター全般の視覚品質、外部OBSアプリそのもの、動画への焼き込みは今回の検証対象外。

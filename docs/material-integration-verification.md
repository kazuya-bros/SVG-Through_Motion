# 素材準備統合の検証 — 2026-09-15

## 実データ

- QA用コピー: `data/materials/b40a074b31f54fd39cefa706a263ea3a`。元のTeth2 PSDは変更していない。
- 元PSDから20パーツを取得。左右分割済みの名前・描画順を保持。
- See-Through分割: job `5202ef7386eb4e519f125bce3210bc0e` 完了。候補は非表示で追加し、採用済み素材を保持。
- See-Through Depth: job `4d0e5f522d3b41848fb259cbf067b58a` 完了。補正済み各画像からマップを作成。
- 上記の実モデル検証は512px・2ステップ。実行経路と素材整合性の確認であり、通常品質の評価ではない。
- SVG変換: `data/projects/8e945a60bcd849eda89d32e90e685415`、20パーツ・38,352パス。実画面で顔・髪・服・目・口の描画と右向きを確認。
- UIで「テスト表情」を追加して保存: `data/exports/8fb382347d89420a9a63fab744362c39/svg-through-motion.project.json`。6表情、20パーツ、SVG描画、Depth設定を保持。

## 自動テスト

- `node --test tests/*.test.mjs`: 204件成功。
- `I:\python\python.exe -m unittest discover -s tests`: 119件成功。
- 素材補正のテストは実Pillow/psd-tools/VTracerとHTTP APIを使用。透過合成、原画像の保持、切り出し座標、保存競合、追従循環の拒否、閉じ差分、作業ZIP往復、範囲依頼素材を確認。
- Depthテストは補修合成後の画素、マスク、既存顔Depth形式への登録と、補正後の無効化を確認。
- 描画テストは補修と描画順、追従先の変形、瞳と白目のグループ保持、SVG/PNG選択、表情中の音声口パク保持、視線・眉入力、既存耳表現の優先を確認。
- 元PSDの本人基準の左右表記を実画面で発見。取り込み時にペアの実位置から画面上の左右へ正規化し、専用テストを追加。
- 役割補正後の実UIで「SVG編集へ進む」を実行。Depth job `e9e931f965ae4e4598550c0e3777cc22` が自動実行され、`data/projects/00ca99c0dec64bb3940105f198cd9d96` へ変換完了。Depth更新済み状態、画面左のウインクを確認。
- 修正版の保存: `data/exports/e1e076ce99e0419c8c0ef6bc55aae46f/svg-through-motion.project.json`。
- 実UIからPNG出力: `data/exports/6e60a761e8184798a8f99ba564b23356/svg-through-frame.png`。PillowでPNG整合性と1024×1024pxを確認。
- 検証専用8766を停止し、通常起動8765を最終版で再起動。ユーザーの元PSD・既存プロジェクトは変更していない。

## 実画面

- `qa/material-integration-preparation-20260915.png`: 通常起動8765での素材準備。
- `qa/material-integration-expression-20260915.png`: 左右修正後のSVG編集・表情切替。
- `qa/material-integration-output-20260915.png`: 保存した6表情を出力画面に再読込。左右修正前のQAプロジェクトを使用。カメラ停止中。

## 限界

- カメラは模擬検出結果で追従を検証。実カメラによる認識精度・向き・使い心地は未確認。
- Seedを変えた大量生成、30ステップ以上での画質比較は未実施。
- 準備済みPachiPakuGen環境を利用。新規PC用の初期セットアップ、既存PachiPakuGenプロジェクト形式の直接移行、RIFEは今回の実装範囲外。
- 補修依頼は外部AI向けの画像・指示出力まで。外部AIで生成した結果の品質・自動採否は保証しない。
- 特殊PSDのブレンド・クリッピング・グループ効果は完全再現対象外。読み込み時に確認を案内する。

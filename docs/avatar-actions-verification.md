# アバター演出の確認（2026-09-20）

## 実装

スポイトでパーツ・色を選択、HSL差を保持する色変更、照れ／冷や汗の位置調整、方向・時間を保存した演出、同じ処理を使うAPIとネイティブホットキー。新規起動時はTTS・AI受付をOFFとし、配信準備から関連UIと字幕を除外した。

## 確認結果

- Python関連20テスト成功：保存・同IDの再送・競合、方向の送信、描画ACK、デスクトップ認証経由の呼び出し、時間終了時の復元、後続のライティングや手動変更の保護、API/MCP。
- JavaScript関連20テスト成功：色差・輪郭色保持、方向のシリアライズ、はずみ終了、既存の演出・配信状態。
- Rust6テスト成功：旧キー設定の読み込み、演出ID・切替方式・重複キーの検証など。
- `tests/avatar-actions.browser.cjs`：ユーザーの現在の素材を別セッションへコピー。冷や汗の配置／キャンセル、照れの調整、ズボンをクリックしてスポイト選択、色変更、プリセットの保存／再実行、はずみの方向、配信→準備への復帰、透過OBS表示を確認。ブラウザのJavaScriptエラー0件。
- `tests/avatar-render.browser.cjs`：上下左右のはずみ・線から色の描画をピクセルで比較。冷や汗の移動に伴う画像更新も確認。
- デスクトップ設定画面のネイティブ通信をテスト用応答に置き換え、演出選択・cue_idの保存を確認。OS上での実キー押下は未確認。
- ネイティブreleaseとPyInstallerのビルド成功。配布バックエンドでPNG／PSDの変換と親終了時の停止を確認。

## 成果物

- 配布フォルダ：`output/desktop/SVG-Through-Motion-0.2.0-windows-x64-20260920-021321`
- 実画面：`output/verification/avatar-blush-adjust-final.png`、`avatar-actions-final.png`、`avatar-color-eyedropper.png`、`avatar-sweat-position.png`
- 実行結果：`output/verification/avatar-actions-browser.json`

18765／18808の既存ユーザーセッションは停止していない。18809は今回の独立した動作確認用サーバー。配布版に反映するには新しい実行ファイルで起動する必要がある。

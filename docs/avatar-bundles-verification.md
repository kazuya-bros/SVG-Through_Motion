# 組み合わせ演出の確認（2026-09-20）

- Python：avatar_actions/runtime_effects/performance/agent_control/agent_mcp 21件成功。
- JavaScript：recipe/character-effects/render-viewport/broadcast-look 12件成功。
- Rust：ネイティブキー設定6件成功。
- 実キャラクター24パーツを隔離サーバー18810へ複製し、実画面で5項目のメニュー、5要素の組み合わせ、照れ角度、未保存プレビュー・停止、保存・同じIDでの更新を確認。
- 配信用表示ページを別に開き、組み合わせの表示・0で非表示・1で復帰を双方のCanvas画素で確認。ページのJavaScriptエラーなし。
- プレビューの終了時の復元、古い停止要求が新しい選択を消さないことを単体検証。
- OSに実際のキーを登録して他アプリから押す確認は未実施。既存の認証済みネイティブ経路を利用。
- 実際のデスクトップ設定HTML/JSを制御したネイティブブリッジで動かし、0/1初期割り当て、保存した組み合わせの選択、Ctrl+Alt+2への保存引数を確認。
- デスクトップ版を再ビルド。梱包したPythonで起動、画像変換、PSDワーカー、親終了に伴う終了を確認。20260920-091341版を作成。
- 実画面画像：output/verification/avatar-bundles-menu.png、avatar-bundles-editor.png、avatar-bundles-combined.png。

# 演出リストとプレビューの変更（2026-09-20）

- 左: 演出リスト、Add/Delete、演出名で折り畳み・展開した構成要素。中央: プレビュー/停止。右: 選択演出の設定。
- checkboxによる表示指定は廃止。消えるは専用要素として扱い、既存visibility=falseも消えるとして表示。
- プレビューも本番と同じbehaviorで再生。selectは時間後も戻らず、停止/別演出への切替まで維持する。timedのみ終了時に復帰。
- 削除は共通API/MCPへ追加。revision競合、同一要求の再送、削除後の実行不可、標準演出の保護を検証。
- Python14件、JavaScript8件成功。実画面はeffects-list.browser.cjsで実キャラクターを使って確認。

実画面確認成功: Add→3要素追加→保存、リスト展開/折り畳み、6秒を超える維持、別の演出で消える→停止で復帰、サラサラ消滅後の維持、Delete後の一覧/保存API確認、指定時間だけで自動終了。ブラウザエラーなし。画像: output/verification/effects-list-layout.png。

# パーツの連動と裾の揺れ

## 裾

服・脚・ボディをまとめて変形する連動と、腰を基準にする連動は廃止した。
「動きをつける」→「服・小物」で、裾の「この動きを使う」をONにすると裾レイヤーだけが動く。大きさ・速さ・範囲・支点で調整する。
以前の方式（attachment以外）で保存された服・翼へのmotionLinkとwaistMotionは、読み込み・再生準備時に解除する。裾自体のsecondaryMotion設定は維持し、元の保存ファイルは自動では書き換えない。変更を保存すると旧連動設定は含まれなくなる。
描画の軽量化（変形が同じセルの一括描画、頂点の再利用）は維持する。

## 01 その他の調整

左で対象レイヤーを選び、「一緒に動くパーツ」でFace、裾、前髪、後ろ髪などの独立したレイヤーを選ぶ。「連動なし」で解除する。既存素材のfollowPartも同じ操作で変更・解除できる。新規の未設定パーツには自動で連動を追加しない。

移動と回転だけを受け取り、パーツの形を保つ。新方式attachmentは連動元の中心で動きを採取し、1回の画像変換で描画する。尻尾の個別回転は保持する。任意の多段連動や循環は認めない。連動を登録したら02で確認し、動きの大きさを調整する。

旧rigid方式の髪連動と指定済みの取り付け位置は保持する。新規UIからはattachmentを登録する。非表示パーツの表示は自動で変えない。設定はプロジェクト保存で保持する。

## API / MCP

編集画面を接続し、`editor.command` / `POST /api/control/commands` に送る。

```json
{"action":"motion_links","motion_links":{"operation":"inspect"}}
```

`sources`は髪の候補、`parts`は各対象のsource_id・mode・anchor。`revision`を変更時のexpected_revisionに渡すと、同時変更を検出できる。

```json
{"action":"motion_links","motion_links":{"operation":"link","source_id":"p001","part_ids":["p009"],"mode":"rigid","anchor":{"x":610,"y":170}}}
```

modeはrigid（旧髪連動、省略時）またはattachment（01の任意パーツ連動）。attachmentは既存followPartを置き換えられ、unlinkで素材のfollowPartも解除できる。expectedは変更前のmotionLinkまたはfollowPartを渡す。attachmentは連動元の中心付近で移動・傾きを採取し、パーツ全体に一つの変換を適用する。共有メッシュの服連動は再導入しない。anchorはキャンバス内のピクセル座標。unlinkで指定元への追従を解除する。旧expected（全対象の変更前source_id）も利用できる。無効ID・循環・非対応方式・範囲外・競合は適用前に失敗し、一部だけを更新しない。同一設定の再適用はchanged:false。結果URLでcompletedと設定を確認する。

服の連動やconfigure/waist_motionは受け付けない。

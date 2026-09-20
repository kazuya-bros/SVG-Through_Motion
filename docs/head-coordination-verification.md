# 顔の向きと関連パーツの追従（2026-09-19 更新）

## UI

02 → 顔・瞳の「顔の向き」を左右（X）・上下（Y）・傾き（Z）の3スライダーに整理。
関連パーツを選択して追従量や奥行きを指定する前回のUI、首の範囲、固定方向ボタン・閉じ目／開口の重複確認UIは撤去。
顔・髪・耳・飾りの連動は標準で有効にする。旧試作のOFF設定は初回読み込みで移行する。
「待機中に顔を動かす」をOFFにすると指定方向を維持する。瞬き・口パク・髪などはそのまま再生する。
待機中の振幅は折りたたみへ集約。正面に戻すボタンは3軸を0に戻す。首支点の補正は必要なときだけ開く。

## Anime2.5DRigとの対応

参照：E:/other_repo/Anime2.5DRig/lib/rigger.js のSLOTS、lib/app.js のdeform。
前回は前髪1.04・後ろ髪0.94だったが、参照の前髪1.28・後ろ髪0.55へ変更。頭飾り1.20、眼鏡1.18、耳0.96なども役割から自動適用する。
頭部の共通首支点と奥行きごとの左右・上下移動を使用。身体は参照に合わせ16%追従する。衣服・腕・脚にも同じ基準を適用する。
素材が異なるため全処理の完全一致ではない。首と胴体が一体の絵は連続した重みでつなぎ、目の白目・瞳・睫毛はRIFEとの接続も保つため同じ奥行きに保つ。髪の局所物理は本アプリの既存方式を使用する。
既存のfollowPart/motionLink、個別headFollowの保存値は維持し、親変形を二重適用しない。

## 保存・API

settings.headYawOffset（−1〜1）、headPitch（−1〜1）、headRollOffset（−8〜8）、headIdle（boolean）。UI・APIのsettings操作・配信・動画出力は同じrigPoseと変形処理を使う。
settings.headMotionVersion=2は旧オプトイン方式からの移行済み印。以後はAPIから明示的にfaceCoordination=falseにした場合も保持する。
editor.command / POST /api/control/commandsの例：

```json
{"action":"settings","settings":{"headYawOffset":0.6,"headPitch":-0.4,"headRollOffset":3,"headIdle":false}}
```

既存のhead_motion API（inspect/update/reset、競合検出expected_revision）は維持。tuningのdepth下限を0.5へ拡張し、標準後ろ髪0.55を扱える。画面には詳細調整を表示しない。
非表示の旧SVGアニメーション出力のパーツ別連動には未対応。Canvas編集・配信・WebM/MP4・PNG連番は共用する。

## 検証

Node 274件・Python control 14件成功。参照式との左右／上下変位比較、標準の髪・装飾品の奥行き、身体の16%追従、最大角度／奥行きでメッシュ反転なし、親子連動・目の一致を確認。
実素材を隔離サーバー18787で操作。新UIに旧パーツ選択がないこと、左右・上下・傾き、待機切替、正面リセットを確認。指定値を保存し、再読み込みで復元を確認。画面例外なし。
実画面：output/verification/head-simple-controls.png、head-simple-left.png。

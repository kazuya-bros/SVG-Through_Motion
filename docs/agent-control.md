# エージェントから使える制作アプリ

SVG-Throughの製品方針は、AIエージェントが状態を読み、素材を補正し、結果を画像で確認しながら主要工程を進められること。APIを共通の実行入口とし、MCPはそのアダプターにする。Computer Useは画面固有の操作と目視確認を補う。

## 対応範囲

- REST: `/api/agent/capabilities`、`/api/agent/operations`、`/api/agent/operations/{name}`。登録済み操作を名前で発見し、OpenAPIから引数を確認。
- MCP: 公式Python SDK 2.2.0によるstdio接続。同一PCのホストから起動する。HTTPでMCPを公開する構成ではない。
- 素材: 登録、レイヤー補正、追加、切り出し、補修参照、分割、補正後のDepth、PSD保存、SVG変換。編集画面は不要。
- 編集: 目・口・動き、AI補正候補、再生、保存、書き出し。接続した編集画面が必要。
- 出力: セッション作成、接続確認、声一覧、受け取り先、発話・割込・停止、表情と強さ、演出の開始・停止・結果確認、終了。

演出は `output.effects` / `output.effect` / `output.effect_result` で操作できます。[演出の操作とAPI](character-effects.md)を参照してください。

「03 保存」画面はWebM・MP4とプロジェクト保存のみを表示します。描画設定・PNG連番・SpriTalk連携は非表示です。従来の `export` コマンドの `frames`・`sheet`・`spritalk`・`mpng`・`png-parts` などは、画面にボタンがなくても引き続き利用できます。

「01 形を整える」は目・口・その他の調整の3段階です。目・口の初期状態は手動補正、レイヤー一覧はその他の調整で表示します。AI補正UIは通常非表示ですが、補正API/MCPは保持しています。現在の配信準備ではAIのUIを隠し、新規起動時は発話・AI演出の受付をOFFにします。

自動生成した閉じ睫毛は `parts[].lidAdjust.color`（`#rrggbb`、nullで元色）と `lashCount`（整数0〜16、nullは元の本数）で色・本数を調整できます。旧 `lashAmount`（0〜2）は旧データの再現用に保持します。補正プロジェクトの取得・適用と同じフィールドで、UI/プレビュー/配信/動画保存に反映します。色と量のスタイル補正は自動の輪郭プロファイルがある場合だけ適用し、`closedSource: "psd"` の差分には適用しません。元の `closedSvgText` は保持します。RIFEの生成済み中間形状は調整値が変わると既存の署名検証で無効になり、通常のSVG変形に戻ります。

自動睫毛の形のプリセットUIは廃止し、本数スライダーで調整します。閉じ口のUIは `settings.mouthTuning.closed` の `taper`（0〜1）と `curve`（−15〜15）を共有します。旧 `left` / `right` は値を保持し、UIは非表示です。曲線調整に対応した生成輪郭にのみ適用します。

WebM・MP4の動画保存は `/api/loop-exports` の共通処理で全フレームを順送りします。
WebMは `format: "webm-alpha"`、`quality: "balanced"` を使い、30fps・透過・再生時間とシーク情報付きで保存します。
APIのquality省略時は従来どおりlossless（外部素材連携の互換性を維持）。qualityはlosslessまたはbalancedのみを受け付けます。

画像・字幕・時間順の演技は `stage.*` の8操作。`stage.state` の `preview_url` を `svg_preview` に渡すと、実際の出力の合成画像を確認できます。通常設定を保った一時変更、プリセット保存、AI制御の解除まで [AIと演出のガイド](stage-performance.md) を参照してください。画像生成ツールで作ったファイルは `stage.upload` から登録できます。

## 自分で喋る配信と保存した演出

スポイト・可動の照れと冷や汗・方向付き演出・グローバルホットキーは[アバター演出](avatar-hotkeys.md)を参照。`avatar.*`の4操作から、画面やネイティブホットキーと同じ保存・実行・結果確認を行えます。

## MCP接続

### 動きと眉の調整

新規変換・動きの初期化ではループ口パクをONにする。保存済みのOFF指定は維持する。
前髪・後ろ髪・頭飾り・眼鏡・耳は顔の向きに追従し、独立した髪揺れも重ねる。
`stage` の `scene.pose` に `browTiltL` / `browTiltR`（-1〜1）を指定できる。
正で眉の内側が上がり、負で下がる。`browL` / `browR` は高さ。
プリセット内の `expressionPresets[].pose` も同じ傾きフィールドを保存する。
編集画面の表情スライダーは即時プレビューし、「更新」または「追加」でプロジェクトへ反映する（この編集操作は画面専用。エージェントの演出操作は `stage` を使用）。
胸範囲は従来の `editor.command` の動き設定と共通。画面ではプレビュー内の確定・キャンセルを使う。
01「その他の調整」の連動先プルダウンも従来の `motion_links` コマンドと共通で、競合検出と再送時の冪等性を維持する。

### 接続例

Windows配布版ではPythonの追加インストールは不要。起動中のアプリのポート（標準18765）を指定する。MCPを閉じてもアプリは終了せず、MCPが別のバックエンドを起動することもない。

```json
{
  "mcpServers": {
    "svg-through": {
      "command": "C:/Apps/SVG-Through/backend/svg-through-server.exe",
      "args": ["--mcp", "--url", "http://127.0.0.1:18765", "--allow-dir", "C:/MyArtwork"]
    }
  }
}
```

ソース版: requirements.txtを入れたPythonで `python tools/studio_mcp.py --url http://127.0.0.1:8765 --allow-dir E:/MyArtwork`。commandと素材フォルダーは実際の絶対パスに置き換える。`--allow-dir`は複数可。省略するとファイル入出力のみ無効。他のAPI操作は可能。

`svg_status`で状態、`svg_operations`で操作一覧、`svg_describe`でpath/query/body/formの正確な引数を読む。`svg_read`は読み取り専用、`svg_write`はJSON操作、`svg_upload`はmultipart。`svg_preview`は実画像をMCP画像ブロックで返し、`svg_download`は成果物URLを許可フォルダーに保存する。

### 素材補正の例

1. `svg_upload(operation="materials.create", files={"file":"C:/MyArtwork/avatar.psd"})`。
2. 返る素材ID・revisionとレイヤーを読む。`/api/materials/{id}/files/{asset}`を`svg_preview`で確認。
3. `materials.save`へ最新revision・name・layersを送る。409は競合なので読み直す。
4. `inference.status`で環境を確認。`inference.start`にmaterial_id、revision、operation:"depth"を送り、`inference.job`で完了を確認。顔レイヤーが必要。
5. `materials.export`が返すPSD/ZIPを`svg_download`で保存。`materials.convert`でSVG化。

SVG変換の既定は `preset=quality`。元絵＋PSD・素材編集とも最大4倍トレースと輪郭マスクを共用します。処理と制限は [高品質SVG変換](quality-svg.md) を参照してください。

分割・Depthには設定済みSee-Through環境が必要。外部画像生成はエージェント側で行い、補修PNGを追加する。本アプリのMCP接続は外部生成サービスの契約や生成権限を付与しない。

### ブラシ選択によるレイヤー切り出し

`materials.extract`（`POST /api/materials/{mid}/extract`）は、矩形に加えて `mask_png` を受け取ります。UIのブラシも同じAPIを使います。

- `revision`、`part_id`、`rect:[left,top,right,bottom]` は元画像レイヤーのローカルピクセル座標。移動・拡大後のキャンバス座標ではありません。
- `mask_png` は元レイヤー画像と同じ寸法のPNGをBase64にした文字列。`data:image/png;base64,` 接頭辞も可。RGBAはアルファ、グレースケール/RGBは明度を選択強度（0〜255）として使います。`rect` と既存cropの外側は対象外です。
- `cut_source:true` は分離、`false` は元を残して複製。任意の `name` で新レイヤー名を指定できます。
- 元assetは不変で、新レイヤーは元の位置・倍率・不透明度と追従先を引き継ぎます。結果のlayersと画像URLで確認できます。
- 空の選択、寸法不一致、壊れたPNG、ロック中は422。同じrevisionの再送は409で重複切り出しを防ぎます。応答が不明なときは状態を読み直してください。追加後はDepthの再生成が必要です。

画面では「PSDのブラシ切り出し ↗」から素材補正を別画面で開けます。素材補正から作成したプロジェクトは元素材を開き、それ以外はPSDを選びます。素材補正後にSVG変換して新しい編集へ進む流れで、現在開いているSVGプロジェクトへの自動反映は行いません。

### 出力の表情の操作

`output.list`で出力ID・名前配列（0始まり）・現在のindex/strengthを確認する。

```json
{"operation":"output.expression","path":{"sid":"出力ID"},"body":{"request_id":"smile-001","index":1,"strength":0.8}}
```

202は受付。`output.expression_result`（path: sid, request_id）のcompletedは出力画面が適用を返信した状態。unknownは切断や10秒以内に返信がない場合で、成功扱いしない。同じrequest_idと内容は直近100件で重複送信を防ぐ。別の内容で同じIDを使うと409。UI/ホットキーの表情も約2秒間隔で現在状態に反映する。口パクとカメラは継続する。

## 制約

### 胸揺れの位置・範囲

`editor.command` の `action: "settings"`、およびAI補正の `motion` で共通の設定を使えます。

```json
{"action":"settings","settings":{"chestRegionManual":true,"chestCenterX":0.56,"chestCenterY":0.46,"chestRadiusX":0.13,"chestRadiusY":0.08,"chest":12}}
```

中心は画像左上を原点とした幅・高さに対する比率（0〜1）、半径は各辺に対する比率（0.01〜0.5）。画面の「横幅・縦幅」は直径の百分率です。`chestRegionManual:false` で自動推定へ戻ります。既存プロジェクトにも設定でき、保存・出力と共通の変形処理へ反映します。独立した `chest` パーツがある場合は、そのパーツの範囲が優先されます。

画面で範囲を調整中は外部編集コマンドを拒否します。適用またはキャンセル後に再実行してください。202の受付後は `editor.result` で完了を確認し、`editor.project` または書き出したPNGで結果を確認してください。

## その他の制約

- 出力作成APIはURLを返すところまで。ウィンドウ起動、アプリ初回設定、グローバルキー登録は画面で行う。
- カメラ・マイク・ブラウザー音声の初回許可はユーザー操作が必要。
- 任意SVGパス編集、すべての録画設定、リアルタイム入力設定を網羅したわけではない。
- 素材画面を開いたままAPIで補正すると、画面の再読込が必要。revision照合で上書き競合を防ぐが、完全な双方向同期は未実装。
- 発話・表情・編集の履歴は有限のメモリー上。再起動後や履歴外のIDに永久的な重複防止はない。応答不明な変更は状態を照合する。
- RESTは既存のループバック・同一Origin制限を使う。同一PCの信頼したプロセス向けで、OSユーザー内のプロセス認証はない。MCPも外部URL・リダイレクト・プロキシ・非公開desktop APIには接続しない。
- ファイル入出力はallow-dir内、保存は新規ファイルのみ。転送100MB、確認画像20MB / 40MPまで。確認画像は最大1536px。

## 開発方針

新機能は状態取得、引数検証、非同期結果・失敗、画像/成果物、競合と再送、API/MCPの公開可否まで設計する。UIとMCPで別の業務ロジックを作らない。未対応部分はcapabilitiesと本書に記載する。

既存の「目・口と動きをAIに任せる」は限定された補正ワークフロー。その生成同意・revision・操作範囲を維持し、一般的なエージェント制御と区別する。

公式SDK: https://py.sdk.modelcontextprotocol.io/ （同梱2.2.0のAPIで検証）

## 同一ウィンドウの配信導線

「キャラクターを使う」で `POST /api/runtime/sessions` に `accepting:true, ai_enabled:true` を指定し、準備画面から発話とAI演出を待ち受けます。API単独作成の既定値は従来通り両方falseです。準備と配信は同じplayer・WebSocket・セッションの表示切替で、戻る際に `/close` は呼びません。入力機器、声、背景、表情、演出、表示URL、ホットキー設定は準備画面にまとめています。配信画面はマウス移動・ホバーで現れる「準備に戻る」、またはEscapeで準備へ戻れます。表示用 `display=1` には操作UIを出しません。

マイク・カメラの切替は発話の受付と独立しています。準備で明示的に発話受付・AI演出をオフにした場合、その選択は画面切替後も維持します。「通常に戻す」は演技を解除しますが、AI受付は維持します。メインメニューへは準備の左上ロゴから戻り、接続・音声・カメラ・マイクを終了します。APIの `/close` は実際に接続を終了し、準備画面に終了状態を表示します。

音声変更は共通API `PUT /api/runtime/sessions/{sid}/voice`（MCPの `output.voice`）で、`revision` にstatusの `voice_revision`、`tts` にエンジン設定、`gain` に1〜20を渡します。発話中・競合・同一revisionの再送は409、不正設定は422。結果不明時はstatusで設定とrevisionを読み直します。APIキーはサーバー内だけに保持し、状態・プロジェクト・WebSocket通知には出しません。画面では「この声を使う」で適用し、未反映の変更は「声を試す」「配信モードへ」の際にも適用します。

ブラウザによって音声の初回有効化が必要です。AI演出は音声許可と独立して受け付けます。マイク・カメラの許可・開始は画面操作です。

表示用URLの `viewX` / `viewY`（表示領域に対する移動率、-4〜4）と `viewScale`（0.25〜8）でプレビューの構図を引き継ぐ。配信ソフト向けのコピーURLにも反映する。これらは表示領域の配置であり、キャラクター本体のSVGや演出確認PNGを書き換えない。

## RIFEによる瞬き・口パクの中間形状

UIと共通の生成・適用を editor.command の action=rife で実行できます。rife.status / generate / job / cancel は画面なしの生成APIです。引数・再送・失敗・参照画像・保存形式は [rife-morph.md](rife-morph.md) を参照してください。

## 髪飾りの追従

`editor.command` の `action:motion_links` で状態取得・設定・解除できます。髪への位置・回転追従、取り付け位置、設定全体の競合検出に対応します。旧来の服の共有メッシュ連動は廃止。01で明示的に登録する `attachment` は、Faceや裾など任意の独立パーツの移動と傾きに軽量追従します。契約と操作は [motion-links.md](motion-links.md) を参照してください。

胸と服・小物の楕円／ブラシ範囲は [範囲指定の仕様と検証](motion-region-verification.md) を参照してください。

サムネイル選択・ブラシカーソル・感情位置ガイドは画面専用の補助です。保存値とAPIは共通です。[操作と検証](preview-edit-guides.md)を参照してください。

プロジェクト名と保存先の選択は `project_save.choose` / `project_save.write` / `project_save.status` を使います。保存先はWindowsダイアログでユーザーが選びます。[仕様と検証](hem-performance-save.md)を参照してください。

顔・髪・飾りの追従は `editor.command` の `head_motion` で取得・変更・標準に戻せます。仕様と検証は [顔の連動調整](head-coordination-verification.md) を参照してください。

## 配信の見た目

`stage` の `scene.appearance` で縁取り・光・パーツ色・照れ／どんより・任意画像を制御できます。登場演出は `output.effect` の `preset: "ink"` です。UIとOBSも同じ設定を使います。[仕様と操作](broadcast-look.md)を参照してください。

SVGレイヤーのブラシ補正・結合、耳／尻尾／翼の対象と支点、服・小物の揺れ方向は [SVGレイヤー補正](svg-layer-edit.md) の `editor.command / layer_edit` を参照してください。

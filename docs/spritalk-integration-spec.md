# SVG-Through → SpriTalk 連携仕様案

更新日: 2026-09-13 / 文書版: 0.2 / 状態: SVG-Through側の書き出し実装済み・SpriTalk側は未対応

この文書は、SpriTalk側の実装担当へ渡すための仕様である。専用ZIPの出力と再生アダプターをSVG-Through側に実装した。SpriTalk側の取り込み・音声接続・配布は未実装。以下の設計案に対する、現在の正確なAPIと差分は末尾の「実装状況」を参照する。

## 1. 目的と最優先条件

SVG-Throughでユーザーが調整したキャラクターを、SpriTalkで同じ見た目・動きのまま使用し、SpriTalkの発話に口と顎を連動させる。

優先順位は **動きの維持、画質の維持、会話への連動、読み込みの手軽さ**。設定を読み込めるだけでは連携完了としない。

- 前髪・後ろ髪、耳、胸、腕、瞳、顔、顎の動きの対象・強さ・速さ・位相・変形方法を維持する。
- 線、色、半透明、閉じ目・閉じ口、重ね順、マスク、素材の選択を維持する。
- ソースアプリを起動しなくても、SpriTalkだけで再生できる。
- 一枚のループ動画への固定化や、既存SpriTalkの似た設定への置換を、この形式の正常な取り込みとは扱わない。
- 既存SpriTalkのSimple / Layered / PachiPaku / MPNG素材は引き続き使えること。

ユーザー向けの出力分類は「素材出力」を主とし、MPNGと本形式は「他ツール連携」に置く。単体アニメーションSVGの出力は設けない。編集再開用のプロジェクト保存は別機能。

## 2. 方式の決定

**SVG-Through側の再生データを基準にし、SpriTalk側へ専用インポーターと専用表示方式を追加する。描画・動きの計算は共通ランタイムを使用する。**

既存の `spritalk-motion-profile.json` に数値を転記する方式は採らない。同名の「髪の揺れ」でも、重み、支点、波形、変形順が違えば見た目が変わるためである。

役割分担:

| 担当 | 責務 |
|---|---|
| SVG-Through | 編集結果のスナップショット、参照素材の収集、再生パッケージの生成、比較用の基準出力 |
| 共通ランタイム | 待機ポーズ生成、入力の合成、口・目の差分処理、局所変形、マスク・合成、Canvas描画 |
| SpriTalk | ZIP読み込み、素材管理、ランタイム起動、表示サイズ、音声再生、発話時刻・口の開き・母音・表情の入力 |

共通ランタイムはアプリに組み込む。ZIPには実行用JavaScriptを含めず、読み込んだ素材から任意コードを実行しない。SpriTalkが別実装の数式を保守する形ではなく、両アプリが同じ配布物を使用する。

## 3. 現在の実装と切り出しの範囲

2026-09-13のソースを調査した。基準はCanvasのキャラクター表示であり、単体SVG出力や圧縮済みMP4ではない。

| SVG-Through内のソース | 維持すべき責務 |
|---|---|
| `web/canvas-renderer.js` / `prepareCanvasRenderer` | 素材の事前ラスタライズ、差分・マスク・局所メッシュの描画、解像度と破棄処理 |
| `web/motion.js` / `loopPose`, `partMotion` | 待機時間、弾み、胸の追従、耳・瞳・口・まばたきのポーズ生成 |
| `web/rig.js` | 変形グループ、支点、髪の重み、変形順、メッシュと継ぎ目処理 |
| `web/face-rig.js` | 顔の向き、顔パーツの奥行き、Faceだけの顎変形 |
| `web/natural-ears.js`, `web/idle-expression.js` | 自然な耳ピコ、対象パーツ、左右の差・待機中の視線 |
| `web/chest-motion.js` | 胸パーツまたは指定領域の局所変形 |
| `web/raster-source.js` | 現在のSVGと一致する元PNGを使うかの判定 |
| `web/eye-through-hair.js`, `web/eyelid-controls.js` | 前髪越しの目、閉眼差分と表示の切り替え |
| `web/anime-mouth.js`, `web/mouth-controls.js`, `web/mouth-variants.js`, `web/vowels.js` | 元絵・生成口・口差分、補正、母音の混合 |
| `web/natural-motion.js` | サンプルの初期設定。取り込み時に保存設定を上書きする用途には使用しない |

この一覧は入口であり、これらのモジュールがimportする推移的依存も切り出し対象。`ensureSeamRig`等の前処理も対象とする。DOM/SVG/Image/Canvasを使う部分はElectronのレンダラープロセスで実行し、Nodeだけで動くものとは扱わない。

SpriTalk側では、現在 `src/shared/types/store.ts` にSimple / Layered / MPNGの型があり、`src/windows/character/components/CharacterApp.tsx` が表示方式と発話入力を接続している。本形式を識別する型と描画アダプターを追加し、PachiPakuインポーターへ偽装して渡さない。

## 4. パッケージ構成と互換性

提案する出力名: `<character-slug>-spritalk.zip`

```text
manifest.json
scene.json
assets/<sha256>.png
assets/…
preview.png                 任意のサムネイル。描画素材には使用しない
LICENSES/…                  素材や同梱データに必要な表示
```

`manifest.json`の例（識別子・バージョンは仕様案。実装時に両側で確定する）:

```json
{
  "format": "svg-through.character",
  "formatVersion": "1.0.0",
  "character": { "id": "example-character", "name": "Example" },
  "scene": "scene.json",
  "runtime": {
    "id": "svg-through-canvas",
    "apiVersion": 1,
    "behaviorVersion": "1.0.0",
    "requiredCapabilities": ["mesh", "face-jaw", "natural-ears"]
  },
  "canvas": { "width": 1024, "height": 1024 },
  "assets": [],
  "presentation": { "background": "transparent" }
}
```

- `formatVersion`はデータ構造、`apiVersion`はホストとのAPI契約、`behaviorVersion`は描画・動きの意味を識別する。数式や既定値の変更は見た目に影響するため、動作版も更新する。
- 最初の実装では**完全一致する動作版**を要求する。新しい版が古い版を再現できることを比較試験で確認した場合のみ、明示的な互換表で許可する。
- 共通ランタイムの配布時にはビルド識別子とソースのリビジョンまたはハッシュ一覧を記録する。両アプリの診断情報から確認できること。
- 必須機能・必須フィールドを解釈できない場合は、必要なアプリ更新を案内して取り込みを止める。機能を黙って落として成功扱いにしない。
- 任意のメタデータ追加はminor更新、互換性を壊す構造変更はmajor更新とする。旧素材を上書き変換せず、必要なら移行後のコピーを生成する。
- `assets`の各項目は `id`（SHA-256）、`path`、`mime`、`bytes`、`width`、`height`を持つ。実データと照合する。上の空配列は書式説明用で、実キャラクターには参照する全素材が必要。
- パッケージ内の画像参照は `asset:<sha256>` に統一し、インポーターが検証後にローカル参照へ解決する。外部HTTP、元のローカルパス、開発サーバーへの依存を残さない。

## 5. scene.jsonで保持する情報

v1は現行プロジェクトの再生に必要な構造を基礎とし、共通ランタイムが読み込める再生用スナップショットにする。各フィールドの解釈は動作版で固定する。SpriTalkがフィールドを独自に正規化しない。

### 基本・パーツ

- `width`, `height`、現在の`settings`、現在の`rig`、描画順を保った`parts`配列。
- 座標は元キャンバス左上原点、右が+x、下が+y、単位は元キャンバスpx。表示倍率・DPRで座標値を書き換えない。
- 各パーツの`id`, `role`, `x`, `y`, `width`, `height`, `visible`, `opacity`, `deformGroup`, `motionStrength`, `pivotX`, `pivotY`。
- `faceBase`, `earMotion`, `independentAccessory`, `blinkOverlay`など、変形・描画対象を決める情報。
- 配列順は現行描画順をそのまま保持する。画面の「上が手前」というレイヤー一覧を見て逆順へ再変換しない。
- 非表示も維持する。素材のroleを名前や座標から再推測しない。Teth2の名前・固定座標を仕様の条件にしない。

### 絵・差分

- 現在の`svgText`、必要な`closedSvgText`, `openSvgText`, `mouthInteriorSvg`, `mouthVariants`等。
- `mouthMode`, `closedSource`、口・目の調整値、開閉時のマスクと補正に必要な情報。
- `artworkSource`で現在選択されている絵と、`rasterSourceUrl`, `rasterSignature`、照合に必要な選択元の`artworkSources`情報。
- PNG参照は同梱アセットに解決する。SVG内部の画像参照・defs・clipPath・mask・ID参照も保持する。
- 編集履歴・過去候補・未選択素材は、再生処理が参照しないことを確認したものだけ除外する。`previousClosedSvgTexts`等を無条件に全転送しない。

### 変形と設定

- 首・顔の基準、`hairGridSize`, `hairWeights`, `segmented`, `arms`を含め、再生に必要なrigデータを保持する。
- 前髪/後ろ髪の方式・振幅・周期、耳パターン・周期・対象、胸、腕、Face/顎、瞳、弾み、呼吸、まばたきの設定を保持する。
- `duration`と`bounceDuration`は別項目として保持する。ループを伸ばしたときに弾みまで遅くする変換は行わない。
- 元の数値の精度を落としたり、スライダー表示値へ丸め直したりしない。ゼロは「既定値」ではなく停止の指定として保持する。
- `settings`内のpx・度・割合・回数は現行ランタイムの単位を保持する。全てを0〜1へ一括変換しない。
- 書き出しは**編集画面の最新スナップショット**から行う。ディスク上のサンプルJSONや初期プリセットを再読み込みして置き換えない。

認証情報、音声サービスの接続設定、音声ファイル、録音、カメラ情報、編集UIの状態は含めない。

## 6. SVGを出力しない方針と内部素材

「単体SVGを書き出さない」と「内部素材からSVGを全廃する」は別の判断である。

現在の表示は、変更されていない一部のパーツには一致する元PNGを使い、編集済みの絵や目・口の差分などにはSVG由来の描画を使っている。全パーツを再トレースすると線と色が変わり、全差分を一律に低解像度PNGへ焼くと拡大品質や動的な口の補正が変わる。

そのためv1は**現行の素材選択と描画経路を維持する**。パッケージ内部の描画用SVG文字列は許容するが、ユーザー向けのSVG出力機能とはしない。安全に扱える描画データへ制限し、script・イベント属性・外部参照・foreignObject等の実行要素は受け付けない。描画に必要なフィルター等まで無差別に除去しない。

将来PNGテクスチャだけへ整理する場合は、差分・マスク・解像度・動的補正を含む比較試験に合格した別版として導入する。読み込み時の暗黙の変換にしない。

## 7. 共通ランタイムのホストAPI案

```ts
type SpeechInput = {
  active: boolean;
  mouth: number;                 // 0=閉口、1=全開
  vowel?: 'a' | 'i' | 'u' | 'e' | 'o';
};

interface CharacterRuntime {
  prepare(scene: unknown, assets: AssetResolver, options: RenderOptions): Promise<void>;
  render(input: {
    timeSeconds: number;         // 単調なアニメーション時刻
    speech: SpeechInput;
    blink?: { left: number; right: number }; // 0=開眼、1=閉眼。省略時は待機動作
  }): void;
  resize(options: RenderOptions): Promise<void>;
  dispose(): void;
}
```

`AssetResolver`はasset IDから検証済みの画像バイト列/MIMEを得るホスト提供の解決器。`RenderOptions`は出力ピクセル寸法、supersample、透過背景、表示領域を指定する。正確なTS型と機械可読スキーマは、共通ランタイム実装時に両アプリから参照できる一つのパッケージで公開する。

### 入力と時間の所有者

1. 共通ランタイムが`loopPose(timeSeconds, settings)`相当で待機ポーズを作る。
2. **SpriTalkでの通常利用中はデモ用の自動口パク・母音巡回を無効にする**。発話していないときは閉口。元の保存設定自体は破壊しない。
3. SpriTalkは実際の音声再生位置に対応する`mouth`と母音を渡す。合成完了時刻や送信時刻で口を開始しない。pause等は`mouth: 0`に変換する。
4. 発話由来の口入力を待機ポーズへ上書きし、デモ由来の`vowelWeights`が残らないようにする。口と顎には**同じ最終mouth値**を使用する。
5. 口の音量解析・平滑化はSpriTalk側が担当し、ランタイムが同じ平滑化を二重適用しない。ランタイム固有の口の形状補間は維持する。母音素材が無い場合の形状選択も共通処理に従う。
6. 明示的なblink入力があればそのフレームの待機まばたきを置き換え、省略時は待機動作を使う。左右の値を混同しない。
7. 発話開始・終了で待機ループの時刻をリセットしない。音声だけが一時停止した場合は閉口し、待機は継続。キャラクター全体の一時停止はアニメーション時計も止め、再開時にジャンプさせない。
8. 発話終了・停止・失敗・キャラクター切り替え時は、SpriTalkが明示的に`active: false, mouth: 0`を渡す。古い発話の遅延コールバックは世代ID等で破棄する。
9. SpriTalk側の呼吸・全体揺れ・髪物理・口拡縮をこの方式へ重ねない。意図した画面全体の移動やフェードは外側の表示操作として扱う。

顔のカメラ追従や追加表情イベントは、初版の最小APIとは分けて拡張する。v1でも設定済みの顔XYZ・まばたき・瞳・顎の動きは共通の待機/発話処理で維持する。

## 8. 画質・動作の必須条件

### 画質

- 元PNGは再圧縮・減色・JPEG化せず、元解像度とアルファを保持する。選択中の元絵と編集済みの絵を取り違えない。
- 未変更の元PNGを採用するかは、`matchingRasterSource`と同じ照合を行う。署名を削除して強制的に元PNGへ戻さない。
- SVGの再トレース、パス削減、アルファ段階の量子化を取り込み時に行わない。
- 準備時に素材をテクスチャ化し、毎フレームSVGの再解析・再変換を行わない。テクスチャの解像度と最終表示解像度を区別する。
- 表示サイズ/DPRに見合う描画サイズを使用する。現在の解像度上限やsupersampleの実際の適用値を診断可能にし、低解像度キャッシュの引き伸ばしで済ませない。
- メッシュ分割、三角形の重なり、クリップ、フィルター、描画順を共通化する。高速化を理由に全パーツの平行移動・回転へ置き換えない。
- 白・黒・透明背景で、髪の細線、袖、半透明の縁に白フチ/黒フチ/メッシュの線が増えないこと。
- Faceだけの顎変形を維持する。首やtopwearへ変形領域を拡張しない。独立Faceがない素材は顎未対応として扱い、胴体で代用しない。
- 耳対象にはheadwear等の任意に選ばれたレイヤーも含める。左右別パーツか一枚の両耳かの解釈も共通処理を使用する。
- 胸の独立パーツがない場合でも、現在有効な局所領域による動きを維持する。

### 準備・再生・負荷

- `prepare()`は画像decode、rig前処理、マスク/テクスチャの準備とウォームアップ描画を終えてから完了する。途中の静止画や不完全なパーツを一瞬見せない。
- 準備中は進捗を表示し、準備完了後に初めてキャラクター表示と時計を開始する。切り替え時は旧表示から新表示へ原子的に交換する。
- rAF回数ではなく秒の時刻でポーズを生成する。落ちたフレームのために動作全体や口パクが遅くならないこと。
- resizeは新しい描画バッファの準備後に交換する。素材切り替え/終了時に旧Canvas・テクスチャ・イベントを破棄する。
- 初版の性能目標はTeth2・1024px級で30fps以上。これは未計測の目標であり保証値ではない。60fpsは同じ画質で達成できる場合の目標。
- 負荷対策は共通ランタイムのキャッシュ・再計算削減から行う。素材解像度・変形方法・差分を黙って落とすことは禁止。変更が必要なら品質モードを明示し、基準モードの比較結果とは分ける。

## 9. 取り込み・保存

- ZIP一つを選ぶ操作で取り込み、検証済みのパッケージをSpriTalk管理領域へ保存する。元ZIPを移動しても使えること。
- ZIPの相対パス、参照、ファイル容量、展開後容量、画像寸法、ID、ハッシュを検証する。パストラバーサル・ZIP爆弾・任意コード実行を防ぐ。上限値はエラーで説明し、容量超過を解像度低下で隠さない。
- 読み込み結果は「準備中→使用可能」または具体的な失敗理由を示す。壊れた素材・機能不足は既存キャラクターを壊さずに失敗させる。
- SpriTalkのキャラクター書き出し・バックアップにも本形式の全依存素材を含める。復元・削除・サムネイル表示まで扱う。

## 10. 動きと品質の受け入れ試験

実装担当は次の比較結果を残す。取り込み成功やスクリーンショット一枚だけでは完了としない。

### 共通の比較条件

- SVG-ThroughとSpriTalkに**同じ書き出し時点のscene、同じ動作版、同じ時刻・発話入力**を与える。
- 出力寸法、DPR、supersample、背景、色処理を揃え、Electron/Chromium・OS・GPU・ランタイムのビルドを記録する。
- 基準は共通Canvas描画のPNG。動画は目視確認用の補助とし、圧縮差を描画差に混ぜない。
- 初版ではTeth2の6秒ループを30fpsの180時点で比較する。加えて前髪/後ろ髪のspring・wave、耳の各パターン、強さ0/保存値/MAX、長いループを試す。
- Teth2以外にも、左右別の耳、両耳一枚、独立Face無し、独立胸無し、元PNG有り/編集済みSVGの小さな検証素材を用意する。

### 判定

| 観点 | 合格条件 |
|---|---|
| データ | パーツ順、差分、支点、rig配列、設定値が往復後も一致。正規化を除く差を説明できる |
| 数式 | 同一入力のポーズ・変形行列・頂点が一致。数値誤差の比較閾値は1e-6を初期値とする |
| 動き | 耳の立ち上がり/戻り、髪の遅れ、弾みと胸の追従、瞳の控えめな動きが同じ時刻に起きる |
| 発話 | 実音声に口が追従し、休止/終了で閉じる。デモ口パクが混入せず、顎だけがFace内で追従する |
| 輪郭 | 前髪・袖・耳の境界、閉じ目・口の曲線、アルファ、前後関係に新たな欠け/フチ/継ぎ目がない |
| 安定性 | 6秒の継ぎ目、キャラ切り替え、resize、連続発話、音声失敗、再起動・バックアップ復元が正常 |
| 性能 | 基準環境で30秒再生し、描画時間p50/p95、フレーム落ち、準備時間、メモリを記録。目標30fpsを確認 |

同じブラウザエンジン・GPU・描画条件ではピクセル一致を目標にする。異なる環境では完全一致を保証しない。初期判定案は、透明画素の不要なRGBを除外したアルファ付き画像と、白/黒背景に合成した画像で、平均絶対誤差1/255以下かつ「いずれかのチャンネル差が8/255超」の画素が比較対象の0.1%以下。全画面平均だけでなく、目・口・耳・髪・胸それぞれの領域でも確認する。

この閾値はまだ実測していないため、実環境で基準を測り双方合意の上で確定する。小さな目・口の欠け、顎の首への漏れ、メッシュ線は数値が閾値内でも不合格とする。口入力だけを変えた比較では、首・服の領域が変わらないことも確認する。

## 11. 実装の順序と完了条件

1. 両側で本仕様の識別子・バージョン・sceneスキーマ・API型を確定する。対応していない項目を先に列挙する。
2. SVG-ThroughのCanvas/動き処理と全依存を共通モジュールへ切り出す。切り出し前後のCanvas比較を通す。
3. SVG-Through側に専用ZIP出力とパッケージ検証を実装する。現行ソースを参照しなくても全素材が揃うことを確認する。
4. SpriTalk側に専用型、インポーター、描画アダプター、音声入力接続、素材管理/バックアップを実装する。
5. Teth2と汎用検証素材で第10節を実施し、差があれば共通処理かアダプターを修正する。SpriTalkだけで振幅を調整して差を隠さない。
6. 動き・画質・音声連動が通って初めて、ユーザー向けの「SpriTalk用」出力として提供する。

SpriTalk側での比較試験は未実施。SVG-Through内での書き出し往復試験の結果は末尾を参照。既存のMPNGやPachiPaku形式を本形式の対応済み実装とは数えない。

## 12. MPNGとの境界

MPNGは「口無しのループ動画＋口差分＋口の追跡データ」であり、髪・耳・胸・まばたき等の動きは動画に固定される。本形式は素材と共通ランタイムでリアルタイムに再生し、口と顎を発話に連動させる。

両者は「他ツール連携」の別の選択肢とする。本形式が未対応の環境へ、無断でMPNGへ変換して渡さない。

## 13. 実装状況（2026-09-13追記）

現在の出力名は `svg-through-spritalk.zip`。`manifest.json`, `scene.json`, `assets/*.png`, `runtime-sources.json`, `README.txt`を格納する。サムネイルは未同梱。次のモジュールを実際に参照して実装すること。

- `web/character-package.js`: `exportCharacterPackage(project, options)`、`loadCharacterPackage(files, {build})`。filesはZIPを展開した`Map<path, Uint8Array>`。画像・sceneのハッシュと画像寸法を検証し、`asset:<sha256>`を元PNGのdata URLに戻す。現在のloaderは往復検証用でもあり、SpriTalkへの一般公開には第9節のZIP展開制限とSVG入力検証を受信側で追加すること。
- `web/character-runtime.js`: `prepareCharacterRuntime(scene, {maxEdge, supersample, background})`が非同期で準備し、`{canvas, render({timeSeconds, speech, blink}), drawPose(pose), dispose()}`を返す。`render`は通常の発話入力用、`drawPose`は同一入力による比較用。resize時は新インスタンスを準備し、旧インスタンスをdisposeする。第7節のclass風APIは設計の概念例であり、この関数APIが実装済みの入口。
- `studio/integration_export.py`: `/api/integration-runtime`は上記ランタイムの推移的なJS依存とSHA-256を返す。ZIPに実行コードは含めない。SpriTalk側へこれらの依存ファイルを同じ版で組み込み、ビルド識別子の完全一致を確認する。ソースアプリへの接続は取り込み・再生時に不要。
- manifestには`sceneSha256`と`runtime.build`を追加済み。`requiredCapabilities`は現在`mesh`, `face-jaw`, `natural-ears`, `source-artwork`。`integration.receiverStatus`は`requires-adapter`。この値を「SpriTalkですでに使用可能」と表示しない。
- 内部SVGはscene内に保持し、画像参照だけアセット化する。パッケージにはSVGの単体出力ファイルや、アニメーションSVGを含めない。

Teth2で18パーツ・18画像アセットのZIPを実際に生成した。元データとZIP往復後のデータを同じCanvas経路・1024px・supersample 2で180コマ比較し、発話中の開口と顎の動きも入力した。初回の最大色チャンネル差は1/255、差があった色チャンネルは全180コマ合計5箇所。ブラウザーの量子化の範囲内であり、第10節の画像誤差条件内。これは**SpriTalk本体での再生試験ではない**。

再実行用: `web/qa-integration-exports.html`。両アプリを統合した後は、同じ試験をSpriTalkのElectron環境でも行うこと。ランタイムのコードを更新するとbuildが変わるため、両側を揃えてから新しいパッケージを出力する。

最終版の再実行では差が128色チャンネル、最大差は引き続き1/255だった。全180コマのRGBA比較は計754,974,720チャンネルで、いずれも許容条件内。GPU描画の微小な丸め差があるため「完全に画素一致」とは表現しない。


### Optional secondary parts (2026-09-13)

`scene.parts[].secondaryMotion` contains `{enabled: boolean, amount: 0..100, cycles: 1..4, range: 10..100}`. It is optional and disabled when absent. Preserve `sourceLayerName`, `independentAccessory`, `deformGroup`, `pivotX` and `pivotY` with it. The matching shared runtime selects cloth/ribbon/earwear/wings/headwear behavior from the part and generates its loop phase. `range` limits cloth movement to the lower percentage of its height; `cycles` is ignored for brows. Brow displacement uses the final speech mouth opening, including runtime speech overrides. Do not replace this with a generic whole-layer rotation: cloth and wings use rooted deformation. Existing frame/video and MPNG body exports bake the shared renderer output.

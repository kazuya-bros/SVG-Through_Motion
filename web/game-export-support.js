const common=`SVG-Throughの立ち絵・目パチ・口パク素材です。
身体は静止した状態です。髪や身体の揺れは「汎用モーション」から別途書き出せます。
TTS・音声・セリフは含みません。目と口の中間画像は現在の補正を50%の開閉で描画しています。
すべて同じキャンバス寸法・位置です。各パーツを個別にトリミングしないでください。
baseとeye・mouthを同じ位置、同じ倍率で重ねてください。単独のbaseには目・口の抜きがあります。
目は open / mid / close、口は close / mid / open の3段階です。
portrait_e0_m0などの9枚は合成済みの立ち絵です。e0=開眼、e1=中間、e2=閉眼、m0=閉口、m1=中間、m2=開口。
ゲームエンジンでの動作は導入先のバージョン・他のプラグインも含めて確認してください。
\n`;

export async function gameSupportFiles(target,id,signal){
  if(target==='tyrano')return [
    [`data/scenario/${id}_register.ks`,
`; V525 / V600以降。既存シナリオから [call storage="${id}_register.ks"] で呼び出します。
[chara_new name="${id}" jname="キャラクター" storage="${id}/base.png"]
[chara_layer name="${id}" part="eye" id="normal" storage="${id}/eye_open.png" frame_image="eye_close,eye_mid" frame_time="4000-6000,80,80"]
[chara_layer name="${id}" part="mouth" id="normal" storage="${id}/mouth_close.png" lip_image="mouth_mid,mouth_open" lip_type="text"]
[return]
`],
    [`data/scenario/${id}_example.ks`,
`; 新規のテスト用シナリオで使用してください。登録は一度だけ行います。
[call storage="${id}_register.ks"]
[chara_show name="${id}"]
#${id}
こんにちは。ここを自分のセリフに書き換えてください。[p]
#
[chara_hide name="${id}"]
[s]
`],
    ['README.txt',common+`ティラノスクリプト V525 / V600以降向け
1. ZIPのdataフォルダの中身をゲームのdataへコピーします。
2. ${id}_example.ksをテスト用シナリオとして実行するか、その内容を既存シナリオに貼り付けます。
3. #${id} の下にセリフを書くと、そのキャラクターがテキストに合わせて口パクします。
登録用スクリプトは同じキャラクターに対して一度だけ呼び出してください。
音声連動は登録時のlip_typeをvoiceにし、[playse chara="${id}" storage="音声ファイル名"] で指定します。
ティラノビルダーではPNGをキャラクター差分として登録できます。ksの自動取り込みではありません。
公式手順: https://tyrano.jp/usage/tech/pachi
ビルダーの手順: https://help.b.smtu.tyrano.jp/tech/page/charalayer
`]];
  if(target==='rpgmaker')return [
    ['README.txt',common+`RPGツクールMZ向け
1. img/picturesの中身をゲームのimg/picturesへコピーします。
2. 標準の「ピクチャの表示」では ${id}_portrait_e0_m0 を選べば立ち絵を表示できます。
3. 自動再生にはトリアコンタン氏のPictureAnimation.js（MZ版）とPluginCommonBase.jsを別途導入します。
   プラグイン本体はこのZIPに含みません。PluginCommonBaseを先に有効にしてください。
4. PictureAnimation-example.jsに、イベントの「スクリプト」で実行する表示・発話開始・終了の例があります。
   ピクチャ番号1〜3は例です。既存の演出と重ならない番号に変更してください。
この例の口パクは「開始〜終了」の間の繰り返しです。文字送り・句読点・音声への自動同期ではありません。
会話の開始と終了で明示的に切り替えてください。待ち時間まで口パクさせたくない場合は会話処理側から終了を呼びます。
PNGの差分を読める他の立ち絵プラグインでも使用できますが、設定形式の互換を保証するものではありません。
PictureAnimation: https://github.com/triacontane/RPGMakerMV/blob/mz_master/PictureAnimation.js
PluginCommonBaseはMZの公式プラグイン素材を参照してください。
標準ピクチャ: https://rpgmakerofficial.com/product/MZ_help-en/01_10_08.html
`],
    ['PictureAnimation-example.js',
`// RPGツクールMZ: 各区切りを別々のイベント「スクリプト」に貼り付けます。
// 必須: PluginCommonBase.js → PictureAnimation.js の順で有効化。
// 表示例: ピクチャ1=土台、2=目、3=口。3枚とも同じ原点・座標・倍率。
// 【表示】
$gameScreen.showPicture(1, '${id}_base', 0, 100, 0, 100, 100, 255, 0);
PluginManager.callCommand(this, 'PictureAnimation', 'INIT', {cellNumber:'3',frameNumber:'6',direction:'horizon',fade:'0'});
$gameScreen.showPicture(2, '${id}_eye_sheet', 0, 100, 0, 100, 100, 255, 0);
PluginManager.callCommand(this, 'PictureAnimation', 'INIT', {cellNumber:'3',frameNumber:'6',direction:'horizon',fade:'0'});
$gameScreen.showPicture(3, '${id}_mouth_sheet', 0, 100, 0, 100, 100, 255, 0);
// 【一度まばたき】並列イベント等で120〜300フレーム待って実行。
PluginManager.callCommand(this, 'PictureAnimation', 'START', {pictureNumber:'2',loop:'false',wait:'false',animationType:'3',customPattern:'[1,2,3,2,1]'});
// 【発話開始】この後に「文章の表示」を置く。
PluginManager.callCommand(this, 'PictureAnimation', 'START', {pictureNumber:'3',loop:'true',wait:'false',animationType:'2',customPattern:'[]'});
// 【発話終了】「文章の表示」の後、または会話側の終了処理で実行。
PluginManager.callCommand(this, 'PictureAnimation', 'STOP', {pictureNumber:'3',force:'true'});
PluginManager.callCommand(this, 'PictureAnimation', 'SET_CELL', {pictureNumber:'3',cellNumber:'1',wait:'false'});
// 【退場】並列のまばたきイベントも停止。
$gameScreen.erasePicture(1); $gameScreen.erasePicture(2); $gameScreen.erasePicture(3);
`]];
  if(target==='unity'){
    const response=await fetch('/web/game-support/SVGThroughPortraitImporter.cs',{signal});
    if(!response.ok)throw Error('Unity取り込みツールを読み込めませんでした。');
    return [['Assets/SVGThrough/Editor/SVGThroughPortraitImporter.cs',await response.text()],
      ['README.txt',common+`Unity 2022.3以降向け（SpriteRenderer / Animator）
1. AssetsフォルダをUnityプロジェクトへコピーし、コンパイルを待ちます。
2. Projectウィンドウで Assets/SVGThrough/${id}/base.png を選択します。
3. メニュー Assets > SVG-Through > Create Portrait Prefab を実行します。
4. Generatedフォルダに作られたPrefabをシーンに置いてください。再実行時は別フォルダに生成します。
目は自動でまばたきし、口は閉じた状態です。SpriteRendererを使うので表示用カメラが必要です。
会話開始: portrait.transform.Find("Mouth").GetComponent<Animator>().SetBool("Talking", true);
会話終了・中断: 同じAnimatorのTalkingをfalseにします。次のAnimator更新で閉じ口に戻ります。
文字送り中だけtrueにするなど、利用中の会話システムから切り替えてください。
音声解析や特定の会話アセットとの自動接続は含みません。UI Image用Prefabではありません。
PNGは位置合わせを保つためSingle Sprite・足元中央・Pointフィルターで取り込みます。
既存のSpriteシェーダー・Animatorが動作する環境で使用してください。
取り込み・Prefab生成・口のアニメーションはUnity 2022.3.42f1で検証しています。Unity 6での実機確認は未実施です。
公式資料: https://docs.unity3d.com/6000.0/Documentation/ScriptReference/AnimationUtility.SetObjectReferenceCurve.html
`]];
  }
  throw Error('未対応の出力先です。');
}

# ゲーム向け立ち絵の出力

03「書き出し」→「ゲーム素材」で、ティラノ・ツクールMZ・Unity・汎用モーションを選択します。

## 立ち絵パッケージ

ゲーム向け3形式は、静止した身体と、独立して切り替える目・口のPNGを出力します。既存の目・口の補正を使用し、TTSやユーザーのプロジェクト設定は変更しません。

- 土台、目3段階、口3段階。すべて同寸・同位置のRGBA PNG。
- 合成済み立ち絵9枚（目3×口3）。通常の画像差し替えにも利用可能。
- `character.json` と導入手順。
- ティラノ：標準 `chara_layer` の登録用 `.ks` とセリフ例。
- ツクールMZ：`img/pictures` に配置するPNG、PictureAnimation用の横3セル画像とイベントのスクリプト例。PictureAnimationおよびPluginCommonBaseは別途導入。
- Unity：Editor用取り込みツール。同寸のSpriteを設定し、目・口のAnimatorを持つPrefabを生成。会話処理から口の `Talking` を切り替える。

髪・身体の動きは、この差分セットには入りません。従来のPNG連番・スプライトシートは「汎用モーション」で使用できます。Unityとツクールの設定例には音声解析・文字送りへの自動連携は含みません。ティラノはエンジン標準のテキスト・ボイス連動を使用します。

身体の中の目・口を単純に取り除くと前髪の重なりや下地を失うため、完成した描画の変化する画素を部位ごとに切り出します。変化領域が重なった場合はエラーにし、誤った素材を出力しません。元素材に描かれている背景自体を新たに除去する処理ではありません。

## 検証

- `node --test tests/game-export.test.mjs tests/material-export.test.mjs`
- `qa/game-export-check.cjs`：3形式のZIP内容、画像の参照先、9通りの再合成と直接描画の一致、原本不変、中断、従来出力、UI切り替え。
- `qa/game-export-ui-check.cjs`：ボタンからの保存（保存先をテスト内で差し替え）、失敗復帰、中断、画面幅別の収まり、TTS・出力ウィンドウの非起動。
- Unity 2022.3.42f1：独立した `qa/unity-game-export` プロジェクトでコンパイル・Prefab生成・Spriteの寸法/原点・Talkingパラメータ・口のアニメーションのサンプリングを確認。
- Unity 6、ティラノ、ツクールMZのゲーム内での実機確認は未実施。

## 参照した仕様

- [ティラノ：目パチ・口パク](https://tyrano.jp/usage/tech/pachi)
- [ツクールMZ：ピクチャ](https://rpgmakerofficial.com/product/MZ_help-en/01_10_08.html)
- [PictureAnimation MZ版](https://github.com/triacontane/RPGMakerMV/blob/mz_master/PictureAnimation.js)
- [Unity：Spriteアニメーションカーブ](https://docs.unity3d.com/6000.0/Documentation/ScriptReference/AnimationUtility.SetObjectReferenceCurve.html)

# 配布版のPSD読込停止の修正（2026-09-15）

実行中のジョブはrunning / 0%のままでCPU消費がほぼ増えなかった。
py-spyの読み取り診断で、変換ワーカーがread_donors → layer.composite →
scipy.interpolate → _fitpackのネイティブモジュール初期化で待機していることを確認。
同じPSDの読込は通常Pythonで約0.6秒だった。

配布用エントリポイントでpsd_tools.compositeをメインスレッド上に事前ロードし、
変換ワーカーでの初回ロードを避けた。進捗には通常PSD読込・差分PSD読込も表示する。

検証:

- hybridの11テスト、face_donorsの4テストが成功。
- 再ビルドした同梱EXEでPNG変換・PSD変換・親EOFでの正常終了を確認。
- 実際のアップロード一式でも停止せず、Depth照合の入力エラーへ進んだ。
  通常PSDでは耳以外が非表示で、faceを含む使用レイヤーの表示状態を修正する必要がある。
  ユーザーのPSDと実行中アプリは変更・終了していない。
- tools/verify_desktop_backend.pyにPSDワーカー変換と任意の実素材・期待エラー検証を追加。
- ZIPのCRCと内包バックエンドのバイト一致を確認。

配布物: `output/desktop/SVG-Through-Motion-0.2.0-windows-x64-20260915-224345.zip`。
実素材のSVG変換完了は、素材の表示状態が未修正なので未確認。

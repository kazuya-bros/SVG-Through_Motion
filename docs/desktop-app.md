# SVG-Through Motion — Windowsアプリ

## 起動

ポータブル版はZIPをフォルダごと展開し、`svg-through-desktop.exe` を起動します。
隣にある `backend` フォルダを一緒に置いてください。通常処理用Pythonと必要な
ライブラリは同梱されるため、Pythonの追加インストールや手動サーバー起動は不要です。
WindowsのWebView2 Runtimeを使用します。

1. 初回の「アプリ設定」で素材・プロジェクトの保存先を選ぶ。
2. 以前の制作を続ける場合は既存の `data` フォルダを指定する。この環境では `E:\SVG化\data`。
3. 「アプリを起動する」で制作画面を開く。保存先は次回も使用する。
4. 「キャラクターを使う」から保存済みプロジェクトJSONを読み込み、出力を開く。

ブラウザの履歴・最近使ったファイル・声などのブラウザ内設定は、既存ブラウザから
自動移行しません。素材準備の「続きから」は指定した保存先の作業を参照します。

See-Throughは準備済みのPachiPakuGen環境を自動検出します。必要なら起動前の
「See-Through・接続の設定」で環境フォルダを指定してください。GPU環境・モデルは
この配布物に含めません。See-Throughを使わない素材補正とSVG編集は単独で動作します。

## 表情のグローバルホットキー

制作・出力ウィンドウの「アプリ → アプリ設定・ホットキー」から設定画面を開きます。

1. 接続中の「操作するキャラクター」を選ぶ。
2. 表情、キー、切替方式を指定する。割り当ては最大12個。
3. 「有効にする」にチェックして「設定を保存・適用」を押す。
4. 有効になったキーの件数を確認する。登録できないキーは理由が表示される。

- キーは `Ctrl+Alt+2` などCtrlまたはAltを含む組み合わせ。
- 「選んだ表情を維持」は押すと切り替わる。
- 「押している間だけ」は離すと元へ戻る。複数の一時表情も押した順で扱う。
- 停止するには「有効にする」を外し「設定を保存・適用」を押す。
- 割り当ては保存するが、対象はアプリ起動後に選び直す。別のキャラクターへ自動で切り替えない。
- ウィンドウ内の数字1〜9による操作も維持する。
- 割り当ての重複・キーの形式は保存前に検証し、OSによる登録拒否は画面に表示する。
- 出力を閉じた場合は次の入力時に接続エラーを表示する。再度開いた出力を選び直して適用する。

キーの入力欄でキーを押すと組み合わせを記録します。登録済みのキーを入力すると
現在の表情にも作用するため、編集前にホットキーを停止すると落ち着いて設定できます。

## OBSと外部アプリ

OBS用URLとコピー操作は、各出力ウィンドウの「配信ソフトに表示する」にあります。
その出力の動き・表情を同じWebSocket経路で送ります。OBSのブラウザソースは従来どおり使えます。

アプリ版の既定ポートは `18765` です。ブラウザ版の `8765` と共存でき、既存サーバーを
停止・再利用しません。外部音声APIなどには出力画面の接続情報を使用してください。
ポートが使用中なら起動を中断し、詳細設定で別の番号を選べます。

## 終了と保存先

「アプリ → 終了」またはアプリ設定ウィンドウを閉じると、終了確認を表示します。
制作中の内容を保存してから終了してください。終了すると、このアプリが起動した
Pythonサーバーと出力を終了します。制作ウィンドウだけを閉じても出力は継続します。

アプリの設定・処理ログは `%APPDATA%\com.kazuya.svg-through` に置きます。
素材は選択した保存先に置き、アプリの更新と分離します。

## 開発・ビルド

Windows、Rust/MSVC、Node.js、Python 3.10以降を用意します。依存のダウンロードが必要です。
リポジトリのルートで実行します。

```powershell
python -m venv .desktop-build/venv
.\.desktop-build\venv\Scripts\python.exe -m pip install -r requirements.txt pyinstaller
.\.desktop-build\venv\Scripts\python.exe tools/build_desktop_backend.py
npm ci
npm run desktop:dev
```

配布用ビルド:

```powershell
npm run desktop:portable
.\.desktop-build\venv\Scripts\python.exe tools/package_desktop.py
```

`output/desktop` にポータブル版を生成します。`npm run desktop:build` では
NSISインストーラーも生成します（NSIS・WebView2ブートストラッパーの取得が必要な場合があります）。
Python依存はGPU環境から分離した専用venvで同梱します。
開発中にバックエンド・webを変更した場合はPython同梱ビルドもやり直してください。

検証:

```powershell
npm test
python -m unittest discover -s tests
cargo test --manifest-path src-tauri/Cargo.toml
python tools/verify_desktop_backend.py
```

`SVG_THROUGH_DESKTOP_SETTINGS` に設定ファイルの絶対パスを渡すと、検証用の保存先を分離できます。
アプリ設定だけがネイティブコマンドを使用でき、制作・出力・外部ページには
ネイティブ権限を与えていません。ネイティブ操作専用APIはプロセスごとの秘密値で認証します。

# Catlog

猫の `体重 / 食べ物 / うんち回数 / 健康状態 / 写真` と、`飼い主の体重` を記録し、Google Drive に保存するブラウザアプリです。

## ファイル構成

- `index.html`: 画面
- `styles.css`: 見た目
- `app.js`: 記録処理と Google Drive 連携
- `config.js`: Google OAuth 設定
- `config.example.js`: Google OAuth 設定の見本
- `start-local.ps1`: 空いているポートでローカル起動する PowerShell スクリプト
- `manifest.webmanifest`: PWA 設定
- `sw.js`: オフライン用の Service Worker

## 最短で試す方法

1. `config.js` の `googleClientId` をあなたの OAuth Client ID に置き換えます。
2. PowerShell でこのフォルダを開き、次を実行します。

```powershell
.\start-local.ps1
```

3. スクリプトが空いているポートを探し、例として `http://localhost:8000` を表示します。
4. その URL をブラウザで開きます。
5. `Google Drive に接続` を押して認証します。
6. 記録を保存すると、Google Drive に `Catlog` フォルダが自動作成されます。

`start-local.ps1` は `8000-8100` を順番に試して、空いているポートで起動します。

開始ポートを変えたいとき:

```powershell
.\start-local.ps1 -StartPort 9000 -EndPort 9100
```

## ポート競合で困ったとき

既定の `5500` や `8000` が埋まっていても問題ありません。Google OAuth で大事なのは「今実際に開いている生成元」を登録することです。

たとえばアプリを `http://localhost:8003` で開くなら、Google Cloud Console の `承認済みの JavaScript 生成元` に次を追加します。

- `http://localhost:8003`
- `http://127.0.0.1:8003`

URL のパスは不要です。必要なのは `スキーム + ホスト + ポート` です。

## PWA として使う

GitHub Pages のような `https://` 配信で開くと、Catlog をスマホのホーム画面に追加できます。

- Android Chrome 系:
  - 画面内に `インストール` ボタンが出たら、それを押します
- iPhone Safari:
  - 共有メニューから `ホーム画面に追加` を選びます

PWA 化により次が有効になります。

- ホーム画面からアプリのように起動
- 全画面に近い表示で利用
- アプリ本体の静的ファイルをキャッシュして表示を高速化

補足:

- Google Drive への読込と保存にはネット接続が必要です
- オフライン中でも画面の起動自体はできますが、同期はオンライン復帰後に行ってください

## Google Cloud 設定

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作成します。
2. `Google Drive API` を有効化します。
3. `API とサービス` → `認証情報` で `OAuth クライアント ID` を作成します。
4. アプリの種類は、まずは `ウェブアプリケーション` が扱いやすいです。
5. `承認済みの JavaScript 生成元` に、このアプリを配信する URL を登録します。

ローカルで試す場合の例:

- `http://localhost:5500`
- `http://127.0.0.1:5500`
- `http://localhost:8000`
- `http://127.0.0.1:8000`

`file://` 直開きでは OAuth の制約で動かないことがあります。ローカルサーバーで開くのが安全です。

## 既存の HTTP サーバー配下で使う方法

すでに別アプリが `http://localhost:3000` のような URL で動いているなら、その配信先のどこかにこのファイル群を置けば使えます。

例:

- 既存アプリの配信 URL: `http://localhost:3000`
- Catlog の配置先: `http://localhost:3000/catlog/`

この場合、Google Cloud Console に登録する生成元は次です。

- `http://localhost:3000`

ポイント:

- `/catlog/` のようなパスは登録不要です
- `index.html` `app.js` `styles.css` `config.js` を同じ公開ディレクトリ配下に置きます
- 相対パスで読み込んでいるので、サブディレクトリ配置でもそのまま動きます

## GitHub Pages で公開する方法

ローカルサーバーを使いたくない場合は、GitHub Pages がいちばん手軽です。

1. GitHub で新しいリポジトリを作成します。
2. このフォルダの中身をそのリポジトリに入れて push します。
3. GitHub の `Settings` → `Pages` で、公開元を `Deploy from a branch` にします。
4. ブランチは `main`、フォルダは `/ (root)` を選びます。
5. 数分待つと公開 URL が発行されます。

公開 URL の例:

- `https://YOUR_NAME.github.io/Catlog/`

Google Cloud Console の `承認済みの JavaScript 生成元` には次を追加します。

- `https://YOUR_NAME.github.io`

もし独自ドメインを使うなら、その生成元も追加します。

- `https://catlog.example.com`

## GitHub Pages 用の最小コマンド例

Git が使える場合の一例です。

```powershell
git init
git branch -M main
git add .
git commit -m "Add Catlog app"
git remote add origin https://github.com/YOUR_NAME/Catlog.git
git push -u origin main
```

push 後に GitHub 側で Pages を有効化してください。

## 保存される内容

- `Catlog/entries.json`
  - 記録本体の一覧
  - 食べ物は複数件を時刻付きで保存
  - 既存の記録は後から編集可能
- `Catlog/photos/...`
  - アップロードした写真

## 補足

- 認可スコープは `drive.file` を使っています。
- これはアプリが作成または操作したファイルに限定してアクセスする、比較的扱いやすい権限です。
- 写真の表示には Google Drive のサムネイル URL を使っています。
- `config.js` に入れるのは Client ID だけで、Client Secret は不要です。

## 次に広げやすい機能

- 猫を複数匹登録
- 食欲や排泄の詳細メモ追加
- カレンダー表示

# りそなインターン 空席通知ツール

りそなグループ インターンシップ マイページにログインし、
「RESONA Business Academy Premium(3daysワークショップ)」の日程選択ページを定期チェックして、
指定した日程の空席が出たらメールで通知します。

**現在の運用方法: GitHub Actions**(PCの電源に関係なく10分おきにクラウド上で自動実行)
リポジトリ: https://github.com/terumickey/terumickey (公開リポジトリ。ID/パスワード等はSecretsに保存され非公開)

## 仕組み

1. マイページにログイン
2. トップページの「【3daysワークショップ】RESONA Business Academy Premium」の予約確認フォームを送信
3. 予約内容確認ページの「申込内容を変更する」フォームを送信 → 日程選択(空席状況)ページに到達
4. `TARGET_DATES` に指定した日程が「満席」ラベル無しになっていれば「空席あり」と判定
5. 前回チェック時から `full → open` に変化した日程があればメール通知(`state.json` に前回状態を保存し、GitHub Actionsが自動コミットして永続化)

## GitHub Actionsでの運用(現在の設定)

`.github/workflows/check.yml` が10分おき(`*/10 * * * *`)に自動実行されます。
実行に必要な認証情報は以下の7つをリポジトリのSecretsに登録済みです。

`Settings > Secrets and variables > Actions` から確認・変更できます。

- `RESONA_LOGIN_URL`
- `RESONA_ID`
- `RESONA_PASSWORD`
- `TARGET_DATES`
- `GMAIL_USER`
- `GMAIL_APP_PASSWORD`
- `NOTIFY_TO`

手動で1回だけ実行したい場合は、GitHubの `Actions` タブ → `Resona Intern Watcher` →
`Run workflow` から実行できます。実行結果は `Actions` タブの一覧、最新の `state.json` は
リポジトリ直下から確認できます。

**注意**: GitHub Actionsのスケジュール実行は負荷状況により数分〜十数分遅延することがあります
(GitHub公式の既知の制約で、正確に10分おきとは限りません)。

## ローカル(Windows タスクスケジューラ)での運用(現在は未使用)

以前はPC上のタスクスケジューラで動かしていましたが、GitHub Actionsに一本化したため
`ResonaInternWatcher` タスクは削除済みです。もしPC側に戻したい場合は以下の手順です
(GitHub Actions側との二重実行を避けるため、戻す場合はどちらか一方だけ動かしてください)。

### 1. 依存パッケージのインストール

```
npm install
```

(`postinstall` で Playwright 用の Chromium も自動ダウンロードされます)

### 2. `.env` ファイルの作成

`.env.example` をコピーして `.env` を作成し、中身を編集してください(**`.env.example` 自体は編集しないでください**)。

```
copy .env.example .env
```

### 3. 動作確認

```
npm run check
```

もし日程選択ページの構成が変わり画面遷移がうまくいかない場合は、以下のdiscoverモードで
ページの実際のテキスト・スクリーンショットを確認できます。

```
npm run discover
```

→ `day-select.txt` / `day-select.png` に保存されます。日程の表記や「満席」ラベルの位置が
変わっていないか確認し、必要なら `check.js` の `isDateFull` 関数を調整してください。

### 4. タスクスケジューラへの再登録

```
powershell -ExecutionPolicy Bypass -File .\register-task.ps1
```

削除する場合:

```
powershell -ExecutionPolicy Bypass -File .\unregister-task.ps1
```

## 注意事項

- このリポジトリは公開(public)設定です。ID・パスワード等はGitHub Secretsに保存されているため
  第三者には見えませんが、「りそなグループのインターンに応募している」ことや氏名(コミット履歴)は
  誰でも閲覧できる状態です。
- ローカルで動かす場合、`.env` にはID・パスワード・Gmailアプリパスワードが平文で保存されます。
  `.gitignore` 済みでGit管理対象外ですが、他人と共有しているPCでは扱いに注意してください。
- 自動ログイン・自動チェックはマイページの利用規約に抵触する可能性があります。ご自身の判断・責任で利用してください。
- マイページの画面構成(フォーム名など)が変わると動かなくなる可能性があります。その場合は `npm run discover` で再調査してください。

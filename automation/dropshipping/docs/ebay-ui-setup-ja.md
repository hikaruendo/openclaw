# eBay連携 UI操作ガイド（詳細 / 日本語）

この手順は **eBay Developer Program** で、OAuth接続に必要な情報（Client ID / Client Secret / RuName）を取得するためのものです。

---

## 0. 事前に準備
- eBayアカウント（Sandbox推奨）
- このプロジェクトのターミナル
- `.env.example` の項目を把握

---

## 1. eBay Developer Program にログイン
1. ブラウザで `https://developer.ebay.com/` を開く
2. 右上の **Sign in** をクリック
3. eBayアカウントでログイン
4. 初回の場合は Developer Program の登録を完了

---

## 2. Application Keys（Client ID/Secret）を作成
1. 上部メニューから **My Account** → **Application Keys** を開く
2. 画面に **Sandbox** / **Production** のタブがある
3. まず **Sandbox** タブを選択
4. **Create a keyset**（または同等ボタン）をクリック
5. 作成後、以下が表示される:
   - **App ID**（= `EBAY_CLIENT_ID`）
   - **Cert ID**（= `EBAY_CLIENT_SECRET` 相当）
6. 値をコピーして保管

> 注意: UI文言は時期で微妙に変わる場合あり（App ID / Client ID 表記ゆれ）

---

## 3. RuName（OAuth Redirect名）を作成
1. 同じく **Application Keys** 画面で、OAuth関連のセクションへ
2. **User Tokens** または **OAuth Redirect URL / RuName** の管理画面を開く
3. **Add RuName** をクリック
4. 任意の名前で作成（例: `openclaw-ds-ny`）
5. 作成された **RuName** をコピー（`EBAY_RUNAME` に入れる）

---

## 4. 環境変数を設定（ローカル）
ターミナルで、以下を設定（値はあなたのものに置換）:

```bash
export EBAY_ENV=sandbox
export EBAY_CLIENT_ID='YOUR_APP_ID'
export EBAY_CLIENT_SECRET='YOUR_CERT_ID'
export EBAY_RUNAME='YOUR_RUNAME'
```

必要に応じて scope を指定:

```bash
export EBAY_SCOPES='https://api.ebay.com/oauth/api_scope https://api.ebay.com/oauth/api_scope/sell.inventory https://api.ebay.com/oauth/api_scope/sell.fulfillment https://api.ebay.com/oauth/api_scope/sell.account'
```

---

## 5. OAuth認可URLを生成
```bash
node automation/dropshipping/scripts/ebay-oauth.mjs print-auth-url
```

1. ターミナルにURLが表示される
2. そのURLをブラウザで開く
3. eBayの同意画面で **Agree/Allow** をクリック
4. リダイレクト後のURLに `code=...` が付くのでコピー

---

## 6. codeをトークンに交換
```bash
node automation/dropshipping/scripts/ebay-oauth.mjs exchange-code --code='v^1.1#...'
```

成功すると:
- `automation/dropshipping/.secrets/ebay-token.json` が生成
- access token / refresh token を保存

---

## 7. パイプラインをliveモードで起動
```bash
ADAPTER_MODE=live node automation/dropshipping/run-pipeline.mjs
```

### 期待される挙動
- eBayから注文一覧・オファー一覧の取得を試行
- 在庫0は out-of-stock 処理
- 価格更新は `newPrice` がある時のみ実行

---

## 8. よくある詰まりポイント

### A) `invalid_client`
- Client ID / Secret のコピーミス
- Sandbox/Productionのキー混在

### B) `invalid_grant`
- codeの期限切れ（取り直し）
- RuName不一致

### C) `insufficient_scope`
- 同意時のscope不足
- `EBAY_SCOPES` を広げて再認可

### D) live実行で supplier 側エラー
- 仕様通り（Supplier live adapter はまだTODO）
- 先にmockでロジック検証し、次にsupplier API接続

---

## 9. 本番移行時チェック
- Sandboxで2週間連続でKPI達成
- Productionキーを別で発行
- `EBAY_ENV=production` に切替
- 最初の1週間は自動承認上限を保守的に運用

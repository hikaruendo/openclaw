# Meitra Growth Skill (Oliver-style / TikTok自動投稿・学習)

目的: **Meitraの認知→興味→インストール導線**を、短尺コンテンツの量産と学習ループで継続最適化する。

---

## 0) このスキルの設計思想

- **Oliver型**: 1本バズ狙いではなく、"仮説を高速で回す運用システム"を作る
- **証拠主義**: Meitraの実プレイ/実UIを必ず混ぜる（完全AI素材は禁止）
- **自動化の境界**: 生成と投稿準備は自動化、最終公開は人間チェックを通す
- **学習ループ**: 投稿→指標回収→勝ちパターン抽出→翌日生成へ反映

---

## 1) システム全体像

1. **Input（戦略入力）**
   - angle（切り口）
   - proof（実証素材の種類）
   - CTA（1投稿1CTA）
2. **Generation（クリエイティブ生成）**
   - フック/キャプション/スライド台本生成
   - OpenAI `gpt-image-1.5` で補助画像生成
   - 実素材を最低1枚差し込み
3. **Scheduling（投稿準備）**
   - PostizにDraft作成（TikTok向け）
4. **Publishing（公開）**
   - 人間が最終確認して公開
5. **Learning（学習）**
   - パフォーマンスを記録
   - 勝ちフック/負けフック分類
   - 次バッチの生成プロンプトに反映

---

## 2) 使用コンポーネント

- **Meitra repo**: `https://github.com/hikaruendo/mei-tra`
  - 実機スクショ・UI・対戦結果の一次ソース
- **OpenAI Images**: `gpt-image-1.5`
  - 図解/雰囲気補助素材の生成
- **Postiz**
  - TikTok投稿のDraft/スケジュール管理
- **Local automation scripts**
  - `generate_post_pack.mjs`
  - `generate_images_openai.mjs`
  - `postiz_create_draft.mjs`

---

## 3) セットアップ

```bash
cd /Users/hikaruendo/Projects/openclaw/automation/meitra_growth_skill
cp .env.example .env
```

`.env` 例:

```bash
OPENAI_API_KEY=...
OPENAI_IMAGE_MODEL=gpt-image-1.5
POSTIZ_API_KEY=...
POSTIZ_WORKSPACE_ID=...
POSTIZ_CHANNEL_TIKTOK_ID=...
MEITRA_REPO_PATH=/Users/hikaruendo/Projects/openclaw/mei-tra
```

---

## 4) 基本ワークフロー（1投稿）

### 4.1 投稿パック生成

```bash
node scripts/generate_post_pack.mjs \
  --angle "初心者が最初にやりがちなミス" \
  --proof "自分の対戦で逆転勝ちした局面" \
  --cta "#meitra を付けてスクショ投稿して。毎日紹介します"
```

生成先:

- `output/YYYY-MM-DD/HHmm-<slug>/`
  - `hook.txt`
  - `caption.txt`
  - `slides.json`（6枚分の生成仕様）
  - `postiz-payload.json`

### 4.2 画像生成（OpenAI）

```bash
node scripts/generate_images_openai.mjs \
  --slides output/YYYY-MM-DD/HHmm-xxx/slides.json
```

### 4.3 実素材差し込み（必須）

- `slide-03` を Meitra実プレイ素材へ差し替え
- 可能なら `slide-01` か `slide-06` にも実UIを追加

### 4.4 PostizにDraft作成

```bash
node scripts/postiz_create_draft.mjs \
  --input output/YYYY-MM-DD/HHmm-xxx/postiz-payload.json
```

---

## 5) コンテンツガードレール

1. **完全AIのみで構成しない**（実素材1枚以上）
2. **誇大表現禁止**（数字は実測のみ）
3. **1投稿1メッセージ**（主張を絞る）
4. **1投稿1CTA**（保存/コメント/導入のどれか1つ）
5. **著作権・肖像配慮**（第三者素材を無断使用しない）

---

## 6) 日次運用（Oliver型）

### 6.1 投稿バッチ

- 1日3〜5本をDraft化
- 公開は人間が品質ゲート後に実施

### 6.2 計測KPI

- Views
- Avg watch time / Completion rate
- Profile clicks
- Link clicks
- Install
- Trial start
- Trial → Paid

### 6.3 学習ログ

`output/analytics/YYYY-MM-DD.json` に最低以下を保存:

- 投稿ID
- 角度（angle）
- hook種別
- 実素材の種類
- CTA種別
- KPI実績
- 判定（win / hold / lose）

### 6.4 翌日反映ルール

- **win**: 同角度で3バリエーション再生成
- **hold**: フックのみ差し替えて再検証
- **lose**: 角度を停止、別ペルソナで再設計

---

## 7) 改善指示テンプレ（毎日更新）

- 勝ちフック:
- 負けフック:
- 伸びた尺（秒数帯）:
- 伸びた素材タイプ（実戦/図解/比較）:
- 次に増やす角度:
- 一旦やめる角度:
- 明日のCTA:

---

## 8) 実装メモ（次の拡張候補）

- Postiz公開結果の自動取得ジョブ
- KPI自動集計 + angle別ランキング
- `prompt-variants/` ディレクトリで勝ちテンプレ管理
- 週次で「勝ちパターンTOP5」を自動出力

---

## 9) まず守る最小ルール（これだけで崩れない）

- 毎日投稿する
- 実素材を必ず入れる
- 数字を記録する
- 勝ちパターンを翌日に増幅する

---

## 10) 上位GTM戦略（4チャネル）との接続

このスキルは **4チャネルGTMのうち「Content実行基盤」** を担当する。

- **Content（このスキルの主担当）**
  - TikTok短尺を日次で量産
  - 勝ちフックの再利用を自動化
- **Outbound（別ワークフロー）**
  - 反応ユーザーへの手動/半自動フォロー
  - DM導線の仮説検証
- **Ads（将来拡張）**
  - 勝ちクリエイティブを広告転用
  - 最小予算でABテスト
- **SEO（将来拡張）**
  - TikTokで反応が良かったテーマを記事化
  - Meitraの比較・解説ページへ蓄積

### 役割分担の原則

- 上位（GTM）: どのチャネルに投資するかを決める
- 下位（Oliver運用）: Contentチャネルで、毎日改善し続ける

### 週次レビュー（必須）

- 4チャネル別の投入工数
- チャネル別の獲得効率（Install / Trial / Paid）
- 翌週の配分見直し（増やす/維持/止める）

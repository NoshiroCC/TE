# コミット内容（2026-09-15）

## 追加
- `facilities.html` — 施設・レストラン ハブページ（新設）
- `shirakamiterrace.html` — レストラン単独ページ（旧 `restaurant.html` を改名）
- `images/cart-g.jpg`, `images/cart-hello.jpg` — Gカート／ハローキャディ実写

## 削除（リポジトリから消すファイル）
- `blog.html`
- `stories.html`
- `restaurant.html` → `shirakamiterrace.html` に置き換え

## 更新
- `SiteHeader.dc.html` / `SiteFooter.dc.html` — メニュー8項目に統一（ヘッダーとフッターで項目・表記・順番を完全一致）
  1. クラブ概要 `about.html`
  2. 料金プラン `price.html`
  3. 友の会入会 `members.html`
  4. コースガイド `course.html`
  5. 施設・レストラン `facilities.html`
  6. イベント・競技会 `events.html`
  7. アクセス・宿泊 `access.html`
  8. お知らせ・ブログ `news.html`
- `news.html` — お知らせ（スプレッドシート）＋note 3タグ区分に統合
- `price.html` — お得なプラン（note `#ゴルフプラン`）／昼食付き／エキストラチャージ／イベント
- `about.html` — 旧「魅力」ページの内容を統合
- `index.html` — 宿泊コラージュ、乗り物実写、Googleマップ埋め込み
- `access.html` — Googleマップ埋め込み
- `course.html` — ヘッダー帯・コース全景の実写差し替え
- `events.html` / `event.html` / `members.html` — メニュー統一に追随
- `worker-note-rss.js` — `?tag=` によるタグ振り分けに対応（**Cloudflare Workers への貼り直し／Deploy が別途必要**）

## デプロイ後の必須作業
1. Cloudflare Workers `note-rss` に `worker-note-rss.js` を貼り直して Deploy（未実施だと note 連携は0件表示）
2. note 既存記事のタグ付け直し：`#しらかみテラス` / `#お得な情報` / `#NCCの魅力` のいずれか1つ。プラン記事には `#ゴルフプラン` を併用。旧 `#能代カントリーの魅力` は使用しない
3. 旧URL（`/blog.html`, `/stories.html`, `/restaurant.html`）のリダイレクト設定

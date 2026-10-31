> **公開予定URL：https://hasshaku.autoarticles.net/** （Firebase `hasshaku-hashito`、GA4 は未発行 → `site.json` の `gaId` に入れる）
>
> 公開の手順：`npm run build`（`dist/` を `public/` にコピーし、`site.json` から title・description・canonical・OGP/Twitter・JSON-LD・GA4・sitemap.xml・robots.txt・404 を加える）→ `firebase deploy --only hosting --project hasshaku-hashito`。
> 共有画像は `npm run og`（タイトル画面を 1200×630 で撮影 → `assets/og-image.jpg` と、ポータル用の `assets/og-image.png`）。
> 表示確認は `npm run smoke`（ヘッドレス Chromium、1280×720 と 390×844。開始・歩行・ページエラーを確認し、`shots/` に保存）。
> Three.js r160 は MIT（`THREE-LICENSE.txt`）。Game-fleet の `projects/hasshaku` に登録。

# 八尺様 ― 境の夜

ネット怪談「八尺様」を題材にした、五段階で進む一人称3D探索ホラーです。ブラウザだけで動き、PC とスマホに対応します。

夏の帰省。祖父に頼まれた夕暮れの買い物の帰り道で、生垣より背の高い女を見た。盛り塩と札で守られた部屋で、朝まで、知っている人の声にも返事をしてはいけない。

- 五段階の進行と、段階ごとのやり直し
- 地図・手帳（記録・所持品・設定・操作・原典）、三つの記録と二種類の後日談
- 怪声と環境音は Web Audio の合成、台詞は字幕
- 進行は同じブラウザの `localStorage` に保存

原典から引き継いだ要素と本作で加えた要素は、ゲーム内の「原典について」に記載しています。実在する事件の再現ではありません。

## 構成

ビルド不要の単一ファイルです。`dist/index.html` に、スクリプト・スタイル・Three.js・画像（WebP の data URI）をすべて含みます（約1.9MB）。`file://` でもそのまま開けます。

| パス | 内容 |
|---|---|
| `dist/index.html` | ゲーム本体（v4 パッケージ `hasshaku-boundary-v4.html` をそのまま収録） |
| `site.json` | 公開情報（題名・ドメイン・説明・GA4・ジャンル）。ポータルもここから読む |
| `assets/og-image.jpg` / `.png` | 共有画像（1200×630）とポータル用カード |
| `assets/favicon.svg` | ゲーム内のアイコンと同じ図柄 |
| `tools/build-site.js` | `public/` を作る（SEO・GA4・sitemap・robots・404、参照の検査） |
| `tools/smoke.mjs` | ブラウザでの起動・開始・歩行の確認 |
| `tests/` | `site.json` とビルド結果の検査（`npm test`） |

## 公開（初回）

全ゲーム共通ルール A4 の手順です（Game-fleet `docs/all-games-rules.md`）。

1. Firebase プロジェクト `hasshaku-hashito` を作り、Hosting を有効にする。
2. 独自ドメイン `hasshaku.autoarticles.net` を Hosting に登録し、Cloud DNS に CNAME `hasshaku.autoarticles.net. → hasshaku-hashito.web.app.` を追加する。
3. GA4 のウェブストリーム（`https://hasshaku.autoarticles.net`）を作り、測定 ID を `site.json` の `gaId` に入れる。
4. `npm test && npm run build && npm run smoke` → `firebase deploy --only hosting --project hasshaku-hashito`。
5. Game-fleet の `portal/overrides.json` から `hasshaku` の `"status": "wip"` を外してポータルの一覧に出す。

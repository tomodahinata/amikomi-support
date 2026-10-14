# あみこみ サポート

iPhoneアプリ「あみこみ」のサポート・プライバシーポリシー・特定商取引法に基づく表記（GitHub Pages で公開する静的な site）。

| page | 日本語 | English |
|---|---|---|
| サポート（FAQ と問い合わせ） | https://tomodahinata.github.io/amikomi-support/ | https://tomodahinata.github.io/amikomi-support/en/ |
| プライバシーポリシー | https://tomodahinata.github.io/amikomi-support/privacy/ | https://tomodahinata.github.io/amikomi-support/en/privacy/ |
| 特定商取引法に基づく表記 | https://tomodahinata.github.io/amikomi-support/tokushoho/ | https://tomodahinata.github.io/amikomi-support/en/tokushoho/ |

## 正本と変え方

- プライバシーポリシーの正本はアプリの repo（`amikomi`）の `docs/PRIVACY.md`。どの文がどのコードに支えられているかもそこに書いてある。文を変えるときは、正本とこの site を同じ日に直す。
- 保存の場所と App Privacy の回答の正本は `amikomi` の `docs/privacy/data-inventory.md`。
- 価格を変えたら（App Store Connect の価格の変更）、`tokushoho/` と `en/tokushoho/` の「日本の App Store では」の値を同じ日に直す。アプリは価格を書かない（StoreKit の表示価格だけ）。
- 外部のフォント・画像・script・解析は読み込まない（訪問者の情報を第三者に送らない）。色は `style.css` の 16 進の token だけ。

## 確かめ方

```sh
node scripts/check-site.mjs --canonical ../amikomi/docs/PRIVACY.md
```

lang・title・viewport、外部の資源が無いこと（HTML と、どの .css にも @import と外の url() が無いこと）、site の中の link と `#id`、日本語と英語の page の対と h2 の並び、light と dark の色の比（WCAG 2.2 AA）、プライバシーポリシーの見出しの並びと本文の各行が正本と同じこと、を確かめる（依存なし。Node 22 以降）。

## 置き場の費用と止め方

- GitHub Pages（公開の repo）は無料。月の費用は 0 円。
- 止め方: repo の Settings → Pages で公開を止めるか、repo を削除する。止める前に、アプリ（`src/config/supportLinks.ts`）と App Store Connect の URL を新しい置き場に替える（審査の前に必須のページなので、URL を切らさない）。

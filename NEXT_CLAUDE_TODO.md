# 🚨 次のClaude向け：最優先タスク

## 状況サマリー

**前回完了**: Phase 4（A-Frameコンポーネント分割）
- GitHubへpush完了（commit abd2074）
- main.ts: 1193行 → 273行（920行削減）
- ビルド正常動作確認済み

**問題**: Netlifyが自動デプロイされていない

---

## 🎯 最優先タスク：Netlify設定確認

### 手順1: ブラウザMCPでNetlify管理画面を開く

```javascript
// ブラウザMCPツールを使用
browser_navigate("https://app.netlify.com")
```

ログインが必要な場合：
- ユーザーに確認してログイン処理を実施
- サイト一覧から「snipe-and-slash」を選択

### 手順2: デプロイ設定を確認

1. **Site settings** → **Build & deploy** → **Continuous deployment**
2. **Branch deploys** セクションを確認
   - 現在の設定: おそらく `main` ブランチのみ監視
   - 必要な設定: `refactor/typescript-migration` ブランチも監視対象に追加

### 手順3: ブランチデプロイを有効化

**オプションA: ブランチを追加**
```
Deploy contexts:
- Production branch: main
- Branch deploys: All branches または refactor/typescript-migration を明示的に追加
```

**オプションB: mainにマージ（推奨）**
- Phase 4が完了しているので、`refactor/typescript-migration` を `main` にマージ
- これにより自動デプロイが確実に動作する

### 手順4: 手動デプロイでテスト

1. **Deploys** タブを開く
2. **Trigger deploy** → **Deploy site** をクリック
3. ビルドログを確認して、エラーがないかチェック

### 手順5: 動作確認

デプロイ完了後：
```
browser_navigate("https://playful-concha-6af59f.netlify.app")
```

期待される動作：
- Phase 4の成果物（コンポーネント分割版）が表示される
- ブラウザコンソールにエラーがない
- VRモードに入れる

---

## 📋 チェックリスト

- [ ] Netlify管理画面にアクセス
- [ ] Branch deploys設定を確認
- [ ] `refactor/typescript-migration` を監視対象に追加 OR mainにマージ
- [ ] 手動デプロイを実行
- [ ] ビルドログでエラーがないか確認
- [ ] 本番URLで動作確認
- [ ] ブラウザコンソールでエラーチェック

---

## 🔧 トラブルシューティング

### ビルドエラーが出た場合

```bash
# ローカルで再度ビルド確認
cd /Users/kitazawaharesora/Desktop/snipe-and-slash
npm run build
```

正常にビルドできるなら、Netlifyの設定問題。
エラーが出るなら、コードの問題。

### Netlify設定の問題の場合

**確認項目**:
1. Build command: `npm run build`（正しいか？）
2. Publish directory: `dist`（正しいか？）
3. Base directory: 空白または `/`（正しいか？）
4. Node version: package.jsonのenginesに記載がない場合、Netlify UIで指定

**環境変数**:
- 特に設定不要（A-Frameは全てクライアントサイド）

### GitHubとの連携が切れている場合

1. Site settings → Build & deploy → Configure
2. GitHub連携を再設定
3. リポジトリ: `siro-314/snipe-and-slash` を選択

---

## 🚀 完了後の次のステップ

Netlifyデプロイが正常に動作したら：

1. **Phase 5: VR実機確認**
   - Quest 2で本番URLにアクセス
   - VRモードで動作確認
   - チェックリストに沿って確認（HANDOVER.md参照）

2. **バグ修正（もしあれば）**
   - エラーがあれば修正
   - 再度GitHubへpush → Netlify自動デプロイ確認

3. **Phase 6へ進む**
   - 最適化・リファクタリング
   - 型定義の強化

---

## 💡 ヒント

**ブラウザMCPの活用**:
- Netlify管理画面の操作はブラウザMCPで効率的に実施可能
- スクリーンショット機能で設定画面をキャプチャして確認
- クリック・入力操作で設定変更

**mainブランチへのマージが最も確実**:
- Phase 4完了・ビルド確認済み
- `refactor/typescript-migration` → `main` へのマージは安全
- マージすれば確実に自動デプロイが動作する

**時間がない場合**:
- 手動デプロイで本番環境を更新
- 後でブランチ設定を修正

---

## 📝 参考情報

- **GitHub repo**: https://github.com/siro-314/snipe-and-slash
- **Netlify URL**: https://playful-concha-6af59f.netlify.app
- **最新コミット**: abd2074 (refactor/typescript-migration)
- **HANDOVER.md**: 詳細な引き継ぎ情報あり

がんばって！🎮

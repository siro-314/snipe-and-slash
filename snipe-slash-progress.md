# SNIPE & SLASH 開発進捗

## 1. プロジェクトの目的
WebXRベースのブラウザVRゲーム「SNIPE & SLASH」を開発。
- ターゲット: 無料で遊びたいライトユーザー（子供・VRCユーザー層）
- 差別化: ブラウザで無料、スプラトゥーン的なポップで明るい体験
- デプロイ: Netlify → 後からheyVR等で広告SDK組み込み前提

## 2. ディレクトリマップと役割

### 現在（Phase 0: リファクタリング準備中）
```
~/Desktop/snipe-and-slash/
├── index.html              # メインHTML（A-Frameシーン）
├── game.js                 # ゲームロジック（1249行）← リファクタリング対象
├── drone_white.glb         # 白ドローン
├── drone_black.glb         # 黒ドローン
├── sword.glb               # 剣GLBモデル
├── README.md
├── netlify.toml
├── REFACTORING_PLAN.md     # リファクタリング計画書
├── snipe-slash-progress.md # この引き継ぎファイル
└── 開発日記.md             # プロジェクト年表
```

### 最終目標（Phase 5完了後）
```
~/Desktop/snipe-and-slash/
├── public/
│   ├── models/             # GLBモデル移動
│   └── index.html
├── src/
│   ├── domain/             # ビジネスロジック（Pure関数）
│   ├── managers/           # 状態管理
│   ├── components/         # A-Frameコンポーネント
│   │   ├── weapons/
│   │   └── enemies/
│   ├── utils/
│   └── main.ts             # エントリーポイント
├── tsconfig.json
├── package.json
├── vite.config.ts
└── netlify.toml
```

## 3. 技術選定と制約

### 現在の技術スタック
- **WebXR**: A-Frame 1.4.2 + aframe-extras
- **言語**: Pure JavaScript（1249行）
- **ビルドツール**: なし（HTMLで直接読み込み）
- **デプロイ**: Netlify（静的ホスティング）

### リファクタリング後の技術スタック
- **WebXR**: A-Frame 1.4.2（維持）
- **言語**: TypeScript（型安全性）
- **ビルドツール**: Vite（高速ホットリロード）
- **アーキテクチャ**: DDD + 依存性注入
- **デプロイ**: Netlify（Viteビルド出力）

### リファクタリングの理由
- **現状のコード評価**: 66点（個人開発なら合格、チーム開発なら要改善）
  - ✅ ModelManager分離（良い）
  - ✅ エラーハンドリング（良い）
  - ⚠️ グローバル変数依存（改善必要）
  - ⚠️ if-else連鎖（拡張性低い）
  - ⚠️ 1ファイル1249行（保守性低い）

- **目標品質**: 85点以上（プロダクションレベル）
  - ✅ TypeScript化（型安全性）
  - ✅ ファイル分割（1ファイル300行以内）
  - ✅ クラス設計（疎結合・依存性注入）
  - ✅ 抽象化（武器・敵の追加が容易）

### 守るべき既存資産
- ✅ GLBロード機構（ModelManager）
- ✅ Blender座標系変換ロジック
- ✅ 3秒ディレイによる即死バグ対策
- ✅ Box3による高精度当たり判定
- ✅ 敵AIの挙動（速度・攻撃タイミング等）
- ✅ ゲームバランス調整値

## 4. 現状と次の一手

**現在地**: 🚧 **Phase 0: リファクタリング準備中**

**リファクタリング計画**:
- Phase 0: 準備（1-2時間）← 今ここ
- Phase 1: TypeScript化（3-4時間）
- Phase 2: ファイル分割（4-5時間）
- Phase 3: クラス化・依存性注入（5-6時間）
- Phase 4: コンポーネント設計改善（6-7時間）
- Phase 5: 最適化・ドキュメント（2-3時間）

**合計工数**: 21-28時間（約3-4日）

**次にやること**:
1. Gitブランチ作成 `refactor/typescript-migration`
2. Phase 1開始承認を得る
3. package.json作成・TypeScript環境構築

**アカウント切り替え後に打つべきコマンド**:
```bash
cd ~/Desktop/snipe-and-slash

# 現在のPhaseを確認
cat REFACTORING_PLAN.md | grep "🚧"

# 開発サーバー起動（Phase 1以降）
npm run dev

# ビルド確認
npm run build

# Netlifyデプロイ
git push origin refactor/typescript-migration
```

**動作確認手順**:
1. ローカルサーバー起動: `npm run dev` または `python3 -m http.server 8080`
2. ブラウザで http://localhost:8080 を開く
3. VRモードで動作確認（Quest推奨）
4. 全機能チェック:
   - ✅ 剣攻撃
   - ✅ 弓切替・射撃
   - ✅ 敵AI（白・黒ドローン）
   - ✅ HUD表示
   - ✅ クリア画面

**緊急ロールバック**:
```bash
# リファクタリングを中断して元に戻す
git checkout main
git branch -D refactor/typescript-migration

# または特定Phaseに戻す
git reset --hard phase-N-complete
```

---

**本番URL**: https://playful-concha-6af59f.netlify.app  
**GitHubリポジトリ**: https://github.com/siro-314/snipe-and-slash

---
最終更新: 2026-02-10 Phase 0: リファクタリング計画完了

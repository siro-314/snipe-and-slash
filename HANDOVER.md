# Snipe and Slash - Claude専用引き継ぎファイル

## 1. プロジェクトの目的（判断の軸）

**目標**: WebXRベースのブラウザVRゲーム「SNIPE & SLASH」のTypeScriptリファクタリング
- クリーンアーキテクチャへの移行完了
- **判断基準**: 疎結合、拡張性、堅牢性

## 2. ディレクトリマップと役割

```
snipe-and-slash/
├── src/
│   ├── domain/      # ドメインロジック
│   ├── managers/    # マネージャー層
│   ├── components/  # A-Frameコンポーネント
│   ├── utils/       # ユーティリティ
│   ├── global.d.ts  # グローバルTHREE型定義
│   └── main.ts      # エントリーポイント
└── HANDOVER.md      # このファイル
```

## 3. 技術選定

- **WebXR**: A-Frame 1.4.2 (CDN)
- **3D**: A-FrameのグローバルTHREE（Three.js r147内包）
- **言語**: TypeScript 5.3.3
- **ビルド**: Vite 5（threeをexternalに設定）
- **デプロイ**: Netlify（自動デプロイ）

## 4. 重要な技術的判断

### ✅ Three.js重複インスタンス問題の解決（2026-02-12）

**根本原因**: `import * as THREE from 'three'` でViteが**別のThree.js**をバンドルしていた。
A-Frame（CDN）も自前のThree.jsを持つため、2つのThree.jsが共存。
→ `instanceof THREE.Object3D` が常にfalse → `setObject3D` エラー

**解決策**:
1. 全ファイルから `import * as THREE from 'three'` を削除
2. A-FrameのグローバルTHREEを使用
3. `vite.config.ts` で `three` を `external` に設定
4. `src/global.d.ts` で型定義

### ⚠️ 注意事項
- **import禁止**: `import * as THREE from 'three'` は絶対に使わない
- **型注釈**: THREE関連の型は `any` を使用（`@ts-nocheck`もある）
- **GLTFLoader**: `(window as any).THREE.GLTFLoader` から取得

## 5. 現状と次の一手

### ✅ Phase 5完了（2026-02-12 10:47）

**修正内容**:

1. **Three.js重複インスタンス修正** ✅ ← **今回の核心**
   - 全ファイルの`import * as THREE from 'three'`を削除
   - A-FrameのグローバルTHREEを使用
   - Vite configでthreeをexternal化
   - バンドルサイズ大幅削減(24.65KB)

2. **モデルロードタイミング修正** ✅
   - STARTボタンで`preloadModels()`実行
   - 全モデルロード完了後に敵・武器を生成

3. **武器生成の遅延** ✅
   - `game-started`カスタムイベントで制御

4. **GameState参照エラー修正** ✅

**デプロイ情報**:
- コミット: `main@f0e5d74`
- 本番URL: https://playful-concha-6af59f.netlify.app

---

### 🎮 次のタスク: 動作確認 + VR実機テスト

**タスク1**: 本番サイトで動作確認（デプロイ完了後）
- コンソールエラーがゼロになったか確認
- 敵が正しく表示されるか確認
- ゲームが正常にプレイできるか確認

**タスク2**: VR実機確認（Quest 2）
- 基本動作確認
- 武器・敵の動作確認

---

## 6. アカウント切り替え後の再開コマンド

```bash
cd ~/Desktop/snipe-and-slash
git log --oneline -5
npm run dev
```

---

## 7. Phase別進捗管理

| Phase | 状態 | 完了日 |
|-------|------|--------|
| Phase 0-4 | ✅ 完了 | 2026-02-11 |
| **Phase 5** | **✅ 完了** | **2026-02-12** |
| Phase 5確認 | **⏳ 次回** | - |
| Phase 6-7 | ⏳ 未着手 | - |

---

**本番URL**: https://playful-concha-6af59f.netlify.app  
**GitHub**: https://github.com/siro-314/snipe-and-slash  
**最終更新**: 2026-02-12 10:47 Phase 5修正（commit f0e5d74）  
**次のタスク**: 本番動作確認 → VR実機テスト

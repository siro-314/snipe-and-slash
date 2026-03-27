# Snipe and Slash - Claude専用引き継ぎファイル

## 1. プロジェクトの目的
WebXRブラウザVRゲーム「SNIPE & SLASH」。剣＋弓のアクションゲーム。
判断基準: 疎結合・拡張性・堅牢性。

## 2. ディレクトリマップと役割
```
src/components/
  weaponControllerComponent.ts  # 両手それぞれに独立（各手がトリガーで弓に切り替え）
  weapons/swordComponent.ts     # 剣＋弓モード。位置調整モード(calibration)内蔵
  debug/bowDebugComponent.ts    # VR内デバッグパネル＋CALIBRATEボタン（a-text）
index.html                      # 両手に weapon-controller あり
```

## 3. 技術選定と制約
- A-Frame 1.4.2 (CDN) + TypeScript 5.3.3 + Vite 5 + Netlify自動デプロイ
- `import THREE from 'three'` 禁止 → グローバルTHREEを使用
- 型アノテーション `THREE.Vector3` などもNG（global.d.tsで宣言済みだが戻り値型は省略）

## 4. 現状と次の一手

### ✅ コミット 100e722（最新）
- **両手どちらのトリガーでも弓モードに切り替え可能**
- **連射**: 発射後も弓モード維持（`_returnToSwordRequested` 廃止）
- **位置調整モード**: bowDebugパネルの[CALIBRATE]ボタンで有効化
  - 握り判定球（半径0.12m）をグリップで掴んで動かせる
  - パネルに OFFSET と NOCK_WORLD 座標をリアルタイム表示
  - ユーザーが「この値でコードに固定して」と伝えれば nockOffset を定数化できる

### 🎮 次のタスク
1. Quest 2でテスト:
   - 両手どちらのトリガーでも弓が来るか確認
   - 連射できるか確認
   - [CALIBRATE]ボタンを指さし（レイキャスト）でONにして、球をグリップで掴んで弦の正しい位置に動かす
   - パネルの OFFSET 値を教えてもらい nockOffset を定数化
2. 確認後: bowDebugComponent削除＆nockOffset定数化してPhase 6へ

## 5. 再開コマンド
```bash
cd ~/Desktop/snipe-and-slash && git log --oneline -5 && npm run dev
```

**本番URL**: https://playful-concha-6af59f.netlify.app
**最終更新**: 2026-03-26 コミット 100e722

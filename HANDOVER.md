# Snipe and Slash - Claude専用引き継ぎファイル

## 1. プロジェクトの目的
WebXRブラウザVRゲーム「SNIPE & SLASH」。剣＋弓のアクションゲーム。
判断基準: 疎結合・拡張性・堅牢性。

## 2. ディレクトリマップと役割
```
src/components/
  weaponControllerComponent.ts  # 両手独立。triggerHeld フラグで発射後の弓維持を制御
  weapons/
    swordComponent.ts           # 剣＋弓。shootDirPitch/Yaw でCALIB方向補正。lastShootLog で発射ログ
    projectileComponent.ts      # gravity属性で放物線。進行方向にlookAt
    playerArrowComponent.ts
  debug/
    bowDebugComponent.ts        # シーン固定の大きな白ボタン群（前方2m高さ1.4m）
                                # CALIB/PITCH+/-/YAW+/- を剣で斬るか矢を当てて操作
index.html                      # 両手にweapon-controller
```

## 3. 技術選定と制約
- A-Frame 1.4.2 (CDN) + TypeScript 5.3.3 + Vite 5 + Netlify自動デプロイ
- `import THREE from 'three'` 禁止 → グローバルTHREEを使用
- 戻り値型アノテーションは省略（THREE.Vector3等はNG）
- レイキャスト不使用 → UI操作は「剣で斬る・矢を当てる」方式で統一

## 4. 現状と次の一手

### ✅ コミット 0a5d51d（最新）
- **発射後トリガー押しっぱなし → 弓維持**（`triggerHeld` フラグで制御）
- **トリガー離し → 剣に戻る**（弦を引いている最中は無視）
- **矢の方向をCALIBで調整可能**（PITCH+/-・YAW+/- ボタンを剣で叩く、度数表示）
- **lastShootLog**: パネルに `draw:0.xx fallback:true/false` を常時表示
- **CALIBボタン**: シーン内固定（前方2m・高さ1.4m）の大きな白いブロック

### 🔍 矢の太さ問題について
- `fallback:true` なら GLBの矢メッシュが取れていない → CylinderGeometry(r=0.015)で代替
- `fallback:false` なら GLBの矢を使用・スケール2.5倍
- Quest 2でパネルの `last:` 行を見てどちらか確認すること

### 🎮 次のタスク
1. Quest 2でテスト:
   - `last: fallback:true/false` を確認
   - 前方2mにある白い大きなボタンを確認・剣で斬ってCALIB ON
   - PITCH/YAWを調整して矢が正面に飛ぶか確認
   - パネルのPITCH/YAW度数値を教えてもらい定数化
   - OFFSETも確認して nockOffset を定数化
2. 確認後: bowDebugComponent削除・定数化してPhase 6へ

## 5. 再開コマンド
```bash
cd ~/Desktop/snipe-and-slash && git log --oneline -5 && npm run dev
```

**本番URL**: https://playful-concha-6af59f.netlify.app
**GitHub**: https://github.com/siro-314/snipe-and-slash
**最終更新**: 2026-03-27 コミット 0a5d51d

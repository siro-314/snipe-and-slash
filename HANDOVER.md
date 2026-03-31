# Snipe and Slash - Claude専用引き継ぎファイル

## 1. プロジェクトの目的
WebXRブラウザVRゲーム「SNIPE & SLASH」。剣＋弓のアクションゲーム。
判断基準: 疎結合・拡張性・堅牢性。

## 2. ディレクトリマップと役割
```
src/components/
  weaponControllerComponent.ts  # 両手独立。triggerHeldフラグで発射後の弓維持を制御
  weapons/
    swordComponent.ts           # 剣＋弓。nockOffsetで握り判定位置管理。shootDirPitchで射出補正
    projectileComponent.ts      # gravity属性で放物線。進行方向にlookAt
    playerArrowComponent.ts
  debug/
    bowDebugComponent.ts        # CALIBシステム全体を管理
index.html                      # 両手にweapon-controller
```

## 3. 技術選定と制約
- A-Frame 1.4.2 (CDN) + TypeScript 5.3.3 + Vite 5 + Netlify自動デプロイ
- `import THREE from 'three'` 禁止 → グローバルTHREEを使用
- 戻り値型アノテーションは省略（THREE.Vector3等はNG）
- `handEl` など HTMLElement は必ず `as any` でキャストしてからA-Frame APIを使う
- レイキャスト不使用 → UI操作は「手を近づける・矢を当てる」方式で統一
- PITCH/YAWの補正ステップは90度単位固定
- モデルのrotationは触らない。射出方向ズレは shootDirPitch 初期値で補正

## 4. 現状と次の一手

### ✅ コミット 48f04ce（最新）
- **nockSphere 形状**: CapsuleGeometry → SphereGeometry + `scale.set(1, 2, 1)` で楕円体（Ellipsoid）
  - Three.jsにEllipsoidGeometryは存在しないため、スケール変形が最もシンプル
- **nockOffset をローカル座標系に修正（本質的バグ修正）**:
  - 旧: `base.add(this.nockOffset)` → ワールド空間に直接加算（弓回転で握り位置がズレる）
  - 新: `nockOffset.clone().applyQuaternion(bowWorldQuat)` → 弓ローカル→ワールド変換してから加算
  - これで弓の角度を変えても握り判定が弓に追従する
- **isNearString 判定**: 楕円体スケールに合わせて更新（X/Z=0.12, Y=0.24）

### CALIBシステムの設計（現行）
- CALIB ON → 左手の弓を固定座標 `0 1.2 -1.7` に毎フレーム強制移動（tick()でoculus-touch-controlsに勝つ）
- [AXIS:X/Y/Z] ボタンで操作軸選択、グリップ握って動かすと nockOffset が変化
- [PITCH+/-][YAW+/-] → 90度ステップで射出補正
- デバッグパネルに OFFSET/PITCH/YAW を数値表示

### ⚠️ 次にテストしてほしいこと（Quest 2）
1. nockSphereが滑らかな楕円体（ラグビーボール形）になっているか
2. 弓の角度を変えても握り判定が弓に追従するか
3. nockOffset (0,1,0) がデフォルトで正しい位置に出るか

### ✅ CALIB調査結果（確定値・弓ローカル座標系）
- nockOffset: X=0, Y=1, Z=0

### ⚠️ 将来の弓サイズ縮小時のメモ
- nockOffset も同倍率で調整が必要（または弓モデルのスケールを参照して自動追従化）
- 変更箇所: nockOffset 初期値 + SphereGeometry サイズ

## 5. 再開コマンド
```bash
cd ~/Desktop/snipe-and-slash && git log --oneline -5 && npm run dev
```

**本番URL**: https://playful-concha-6af59f.netlify.app
**GitHub**: https://github.com/siro-314/snipe-and-slash
**最終更新**: 2026-03-31 コミット 48f04ce

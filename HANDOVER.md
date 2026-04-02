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

### ✅ コミット 08f9750（最新）
- **矢メッシュ向き補正**（発射方向には一切影響なし）
  - 原因: モデルのローカル長軸がX方向 → lookAt(Z+)後もXを向いたまま
  - 修正: arrowMesh に `rotation.set(-PI/2, 0, PI/2)` を焼き込みZ長軸に変換
  - projectileComponent の lookAt は触っていないので発射方向は完全に独立
  - もし向きがまだズレていたら `rotation.set` の値だけ変えればいい（`-PI/2, 0, 0` や `0, 0, PI/2` など）
  - **巻き戻したい場合**: `git revert 08f9750`（このコミット単独で元に戻せる）

### ✅ コミット f1d8728
- **ジャンプ・縮地実装**（`playerMovementComponent.ts` 新規追加）
  - 地上でAボタン → ジャンプ（jumpForce=6.0, gravity=16.0）
  - 空中でAボタン → 縮地（カメラforward方向に4m、150msでeaseOut）
  - 縮地は1回限り、着地でリセット
  - rigに `player-movement` 属性を付与
  - 左手Xボタンも同じ動作

### ✅ コミット 7285a52
- Raycaster自己衝突バグ修正

### ✅ コミット d439efb
- 弓照準レティクル実装

## 5. 再開コマンド
```bash
cd ~/Desktop/snipe-and-slash && git log --oneline -5 && npm run dev
```

### ✅ コミット 7285a52（最新）
- **Raycaster自己衝突バグ修正**
  - 除外リストに `this.el.object3D`（弓エンティティのルート）を追加
  - 祖先チェックで子メッシュも再帰的に除外されるため、弓モデル全体がRaycastの対象外に
- **弓照準レティクル実装**（`_initAimReticle` / `_updateAimReticle`）
  - 弓ローカルY-方向にRaycaster(far=100)で射線判定、ヒット点（なければ100m先）に照準を表示
  - 外枠: TorusGeometry 白リング（drawProgressで白→水色に変化）
  - 内側: CircleGeometry 水色40%半透明、`scale = 1 - drawProgress`（引ききりで0）
  - シーンルートに配置（スケール影響なし）、弓方向に正対（setFromUnitVectors）
  - 弓モード時のみ表示（setModeで切替）

### ✅ コミット ae8c08c
- drawProgress を弓ローカルY軸射影距離に変更（後方向のみカウント）

### ✅ コミット ae8c08c（最新）
- **drawProgress 計算を弓ローカルY軸射影に変更**
  - 変更前: `handPos.distanceTo(nockPos)` → 純粋な3D距離なので横・前方向に動かしても引いたと判定されていた
  - 変更後: `diff.dot(bowLocalY)` → 弓ローカルY軸（後方向）への射影距離のみ。マイナス値（前に動かした場合）は0に丸める
  - 判定距離スケール（0.5）は変更なし

### ✅ コミット 7132831（最新）
- **nockSphereをシーンルートに戻す**（子にするとスケール問題が発生するため）
- **位置**: `_getNockWorldPos()` のワールド座標をそのまま使用（元々正しかった）
- **回転**: tick内で `el.object3D.getWorldQuaternion(nockSphere.quaternion)` をコピー
  - スケールの影響ゼロ・位置正確・角度追従、全て解決
- **nockOffset**: `(0, 0.7, 0)` — CALIB結果(0,1,0) × スケール0.7倍

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

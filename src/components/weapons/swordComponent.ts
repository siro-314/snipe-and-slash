// THREE はA-Frameのグローバルを使用（global.d.ts で型定義）
import { modelManager } from '../../managers/modelManager';

/**
 * 剣コンポーネント（剣モード⇔弓モード切替）
 *
 * 弓操作フロー:
 *   1. weapon-controllerがトリガーで弓モードに切り替え
 *   2. 反対の手のグリップで弦を掴む (startDraw)
 *   3. 手を引く → drawProgress増加
 *   4. グリップ離す → 発射 (shoot) → 弓モードのまま連射待機
 *
 * 位置調整モード (calibration):
 *   - bow-debug から有効化
 *   - 握り判定球（nockSphere）をグリップでつかんで動かせる
 *   - 座標がデバッグパネルに表示される
 */
export function registerSwordComponent() {
  AFRAME.registerComponent('sword', {
    schema: {
      hand: { type: 'string', default: 'right' }
    },

    init: function () {
      this.modelLoaded = false;
      this.retryTimer = 0;
      this.isReady = false;

      // 状態管理
      this.mode = 'sword';
      this.isDrawn = false;
      this.drawProgress = 0;

      // 両手操作用
      this.otherHand = null;
      this.isGrabbingString = false;
      this.otherHandGripping = false;

      // weapon-controller が検知する射出後復帰フラグ
      this._returnToSwordRequested = false;

      // メッシュ参照
      this.upperBlade = null;
      this.lowerBlade = null;
      this.string = null;
      this.arrow = null;
      this.arrowPrefab = null;

      // 握り判定: Y軸方向に長いカプセル形で可視化
      // 位置オフセット: 弦のワールド座標からの相対補正値（調整モードで更新）
      // X:0, Y:0.9, Z:0 はQuest 2 CALIB調査結果(0,1,0) × 弓スケール0.9倍
      this.nockOffset = new THREE.Vector3(0, 0.9, 0);

      // SphereGeometry をY軸2倍にスケールして楕円体（Ellipsoid）として使用
      // 弓エンティティの子として追加することで、弓の回転・位置に自動追従する
      const sphereGeo = new THREE.SphereGeometry(0.12, 12, 8);
      const sphereMat = new THREE.MeshBasicMaterial({
        color: 0x00ff00, transparent: true, opacity: 0.35, wireframe: true
      });
      this.nockSphere = new THREE.Mesh(sphereGeo, sphereMat);
      this.nockSphere.scale.set(2, 1, 1); // X軸方向に2倍 → 弓の長軸方向に楕円体（要テスト、ダメならZ軸）
      this.nockSphere.visible = false;
      this.el.object3D.add(this.nockSphere); // シーンルートではなく弓の子に追加

      // 位置調整モード
      // calibFixedWorldPos/Quat が非nullの間、tick()で毎フレーム強制上書き（oculus-touch-controls に勝つ）
      this.calibrationMode    = false;
      this.calibFixedWorldPos = null; // THREE.Vector3 | null
      this.calibFixedWorldQuat = null; // THREE.Quaternion | null

      // 発射方向補正: 弓のローカル-Z軸からのオフセット回転（ラジアン）
      // CALIBモードで調整可能。(0,0)=補正なし
      this.shootDirPitch = -Math.PI / 2; // 上下補正（調査結果: -90度が正解）
      this.shootDirYaw   = 0;            // 左右補正（Y軸回転）
      // 最後の発射ログ（デバッグパネルに表示）
      this.lastShootLog = 'no shot yet';

      // 当たり判定有効化（3秒後）
      setTimeout(() => { this.isReady = true; }, 3000);

      this.createFallbackGeometry();
      this.tryLoadModel();
    },

    tryLoadModel: function () {
      const model = modelManager.getClone('sword');
      if (!model) {
        console.warn('[sword] GLB not available');
        return;
      }

      model.scale.set(0.9, 0.9, 0.9); // 弓形態のサイズを0.9倍に縮小
      model.rotation.set(Math.PI / 2, Math.PI / 2, Math.PI);

      model.traverse((node: any) => {
        if (node.isMesh) {
          if (node.name.includes('上ブレード')) this.upperBlade = node;
          if (node.name.includes('下ブレード')) this.lowerBlade = node;
          if (node.name.includes('弦')) this.string = node;
          if (node.name.includes('矢')) {
            this.arrow = node;
            this.arrowPrefab = node.clone();
            this.arrowPrefab.visible = true;
            if (this.arrowPrefab.morphTargetInfluences) this.arrowPrefab.morphTargetInfluences[0] = 0;
            if (this.arrowPrefab.material) {
              this.arrowPrefab.material = this.arrowPrefab.material.clone();
              this.arrowPrefab.material.transparent = false;
              this.arrowPrefab.material.opacity = 1;
            }
          }
        }
      });

      this.morphIndex = 0;
      if (this.el.getObject3D('mesh')) this.el.removeObject3D('mesh');
      this.el.setObject3D('mesh', model);
      this.blade = model;
      this.modelLoaded = true;
      console.log('[sword] Model loaded. string:', this.string ? this.string.name : 'NULL');
      this.setMode('sword');
    },

    createFallbackGeometry: function () {
      const geo = new THREE.BoxGeometry(0.1, 0.1, 1);
      const mat = new THREE.MeshBasicMaterial({ color: 'red', wireframe: true });
      this.el.setObject3D('mesh', new THREE.Mesh(geo, mat));
    },

    // 握り判定の中心ワールド座標を返す（当たり判定・引き量計算に使用）
    // nockSphere は弓の子なので、ローカル座標を設定すれば自動で弓に追従する
    // このメソッドはワールド座標を返す（isNearString/drawProgress計算用）
    _getNockWorldPos: function () {
      const base = new THREE.Vector3();
      const bowWorldQuat = this.el.object3D.getWorldQuaternion(new THREE.Quaternion());

      if (this.string) {
        this.string.getWorldPosition(base);
      } else {
        // フォールバック: 弓エンティティ前方
        const fallback = new THREE.Vector3(0, 0, 0.2).applyQuaternion(bowWorldQuat);
        this.el.object3D.getWorldPosition(base).add(fallback);
      }

      // nockOffset を弓ローカル → ワールド変換して加算
      const worldOffset = this.nockOffset.clone().applyQuaternion(bowWorldQuat);
      return base.add(worldOffset);
    },

    // nockSphere のローカル座標を更新（tick内で呼ぶ）
    // 弓の子なのでローカル座標で直接指定できる
    _updateNockSphereLocalPos: function () {
      if (!this.nockSphere) return;
      // string のローカル座標 + nockOffset をそのままローカルで計算
      if (this.string) {
        // string のローカル座標を弓エンティティ基準で取得
        const stringLocalPos = new THREE.Vector3();
        this.string.getWorldPosition(stringLocalPos);
        this.el.object3D.worldToLocal(stringLocalPos);
        this.nockSphere.position.copy(stringLocalPos.add(this.nockOffset));
      } else {
        this.nockSphere.position.copy(this.nockOffset);
      }
    },

    isNearString: function (): boolean {
      if (!this.otherHand) return false;
      const handPos  = this.otherHand.object3D.getWorldPosition(new THREE.Vector3());
      const nockPos  = this._getNockWorldPos();

      // 楕円体判定: nockSphere の scale(2, 1, 1) に合わせた楕円
      // X方向: radius*2=0.24, Y/Z方向: radius=0.12
      const diff     = handPos.clone().sub(nockPos);
      const radiusX  = 0.24; // scale.x=2倍
      const radiusYZ = 0.12;
      const nx = diff.x / radiusX;
      const ny = diff.y / radiusYZ;
      const nz = diff.z / radiusYZ;
      return (nx * nx + ny * ny + nz * nz) <= 1.0;
    },

    // 逆の手を設定（weapon-controllerから呼ばれる）
    setOtherHand: function (el: any) {
      this.otherHand = el;

      el.addEventListener('gripdown', () => {
        this.otherHandGripping = true;
        // CALIBモード中は弦掴みを無効化（bowDebugComponentが参照弓を制御する）
        if (this.calibrationMode) return;
        if (this.mode === 'bow' && this.isNearString()) {
          this.startDraw();
        }
      });

      el.addEventListener('gripup', () => {
        this.otherHandGripping = false;
        if (this.calibrationMode) return;
        if (this.isGrabbingString) {
          this.shoot();
        }
      });
    },

    setMode: function (mode: string) {
      this.mode = mode;
      if (!this.modelLoaded) return;

      if (mode === 'bow') {
        if (this.upperBlade?.morphTargetInfluences) this.upperBlade.morphTargetInfluences[this.morphIndex] = 1;
        if (this.lowerBlade) this.lowerBlade.visible = true;
        if (this.string) this.string.visible = true;
        if (this.arrow) { this.arrow.visible = false; if (this.arrow.material) this.arrow.material.opacity = 0; }
        if (this.nockSphere) this.nockSphere.visible = true;
      } else {
        if (this.upperBlade?.morphTargetInfluences) this.upperBlade.morphTargetInfluences[this.morphIndex] = 0;
        if (this.lowerBlade) this.lowerBlade.visible = false;
        if (this.string) this.string.visible = false;
        if (this.arrow) this.arrow.visible = false;
        this.isGrabbingString = false;
        this.isDrawn = false;
        if (this.nockSphere) this.nockSphere.visible = false;
      }
    },

    startDraw: function () {
      if (this.mode !== 'bow') return;
      this.isGrabbingString = true;
      this.isDrawn = true;
      if (this.arrow) { this.arrow.visible = true; if (this.arrow.material) this.arrow.material.opacity = 0; }
      console.log('[bow] String grabbed!');
    },

    shoot: function () {
      if (this.mode !== 'bow' || !this.isDrawn) return;

      // 引き量が0.3未満はキャンセル（最低限引かないと飛ばない）
      if (this.drawProgress < 0.3) {
        console.log(`[bow] Draw too weak (${this.drawProgress.toFixed(2)}), cancelled`);
        this.isGrabbingString = false;
        this.isDrawn = false;
        this.drawProgress = 0;
        this.updateMorphs(0);
        if (this.arrow) this.arrow.visible = false;
        this._returnToSwordRequested = true;
        return;
      }

      console.log(`[bow] Shoot! drawProgress=${this.drawProgress.toFixed(2)}`);

      // 矢エンティティ生成
      let arrowMesh: any;
      const usedFallback = !this.arrowPrefab;
      if (this.arrowPrefab) {
        arrowMesh = this.arrowPrefab.clone();
        if (arrowMesh.material) {
          arrowMesh.material = this.arrowPrefab.material.clone();
          arrowMesh.material.transparent = false;
          arrowMesh.material.opacity = 1.0;
        }
        if (arrowMesh.morphTargetInfluences) arrowMesh.morphTargetInfluences[0] = 0;
      } else {
        // フォールバック: 細長いカプセルで矢を表現
        arrowMesh = new THREE.Mesh(
          new THREE.CylinderGeometry(0.015, 0.015, 0.6, 8),
          new THREE.MeshBasicMaterial({ color: '#c8a04a' })
        );
        arrowMesh.rotation.x = Math.PI / 2;
      }
      this.lastShootLog = `draw:${this.drawProgress.toFixed(2)} fallback:${usedFallback}`;

      const arrowEntity = document.createElement('a-entity');
      arrowEntity.setObject3D('mesh', arrowMesh);

      // 発射位置: 弓エンティティのワールド座標
      const pos = this.el.object3D.getWorldPosition(new THREE.Vector3());

      // 発射方向: 弓エンティティの-Z軸 + pitch/yaw補正
      const bowQuat = this.el.object3D.getWorldQuaternion(new THREE.Quaternion());
      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(bowQuat);
      // pitch(上下)補正
      if (this.shootDirPitch !== 0) {
        const pitchAxis = new THREE.Vector3(1, 0, 0).applyQuaternion(bowQuat);
        dir.applyAxisAngle(pitchAxis, this.shootDirPitch);
      }
      // yaw(左右)補正
      if (this.shootDirYaw !== 0) {
        const yawAxis = new THREE.Vector3(0, 1, 0).applyQuaternion(bowQuat);
        dir.applyAxisAngle(yawAxis, this.shootDirYaw);
      }
      dir.normalize();

      if (this.arrow) {
        const worldScale = new THREE.Vector3();
        this.arrow.getWorldScale(worldScale);
        // モデルの矢は細い可能性があるのでスケールをやや拡大
        arrowEntity.object3D.scale.set(
          worldScale.x * 2.5,
          worldScale.y * 2.5,
          worldScale.z * 2.5
        );
      }

      arrowEntity.setAttribute('position', pos);

      // 引き量による威力カーブ
      // 0.3未満: 上でキャンセル済み
      // 0.3〜0.5: 非常に弱い（10〜12 m/s）、重力大きめ → ほぼ山なり
      // 0.5〜0.7: 弱い（12〜18 m/s）、放物線
      // 0.7〜1.0: 実用的（18〜28 m/s）、ほぼ直線
      const p = this.drawProgress;
      // 速度: drawProgressの2乗カーブで急上昇
      const speed = 8 + Math.pow(p, 2) * 20; // 0.3→8.8, 0.5→13, 0.7→17.8, 1.0→28
      // 重力: 弱いほど重力が大きい（山なりになる）
      const gravity = Math.max(0, (1 - p) * 12); // 0.3→8.4, 0.5→6, 0.7→3.6, 1.0→0

      arrowEntity.setAttribute('projectile',
        `direction: ${dir.x} ${dir.y} ${dir.z}; speed: ${speed}; gravity: ${gravity}`
      );
      arrowEntity.setAttribute('player-arrow', '');
      (document.querySelector('a-scene') as any).appendChild(arrowEntity);

      if ((this.el as any).components?.haptics) (this.el as any).components.haptics.pulse(1.0, 50);

      // リセット
      this.isGrabbingString = false;
      this.isDrawn = false;
      this.drawProgress = 0;
      this.updateMorphs(0);
      if (this.arrow) this.arrow.visible = false;
      // 発射後は weapon-controller に剣へ戻すよう通知
      this._returnToSwordRequested = true;
    },

    updateMorphs: function (value: number) {
      if (this.string?.morphTargetInfluences) this.string.morphTargetInfluences[this.morphIndex] = value;
      if (this.arrow?.morphTargetInfluences) this.arrow.morphTargetInfluences[this.morphIndex] = value;
    },

    // 位置調整モードの切替（bow-debugから呼ばれる）
    setCalibrationMode: function (enabled: boolean, fixedWorldPos?: any, fixedWorldQuat?: any) {
      this.calibrationMode     = enabled;
      this.calibFixedWorldPos  = enabled && fixedWorldPos  ? fixedWorldPos.clone()  : null;
      this.calibFixedWorldQuat = enabled && fixedWorldQuat ? fixedWorldQuat.clone() : null;
      if (this.nockSphere) {
        this.nockSphere.visible = enabled || this.mode === 'bow';
        (this.nockSphere.material as any).opacity = enabled ? 0.7 : 0.35;
      }
    },

    // pitch補正を増減（bow-debugから呼ばれる）
    adjustShootPitch: function (delta: number) { this.shootDirPitch += delta; },
    adjustShootYaw:   function (delta: number) { this.shootDirYaw   += delta; },

    getShootAngles: function () {
      return { pitch: this.shootDirPitch, yaw: this.shootDirYaw };
    },

    // 現在の nockOffset を取得（デバッグ表示用）
    getNockOffset: function () {
      return this.nockOffset.clone();
    },

    tick: function (_time: number, delta: number) {
      if (!this.modelLoaded) {
        this.retryTimer += delta;
        if (this.retryTimer > 500) { this.retryTimer = 0; this.tryLoadModel(); }
        return;
      }

      // CALIB中: oculus-touch-controlsの上書きに勝つため毎フレーム強制上書き
      if (this.calibrationMode && this.calibFixedWorldPos) {
        const parent = this.el.object3D.parent;
        if (parent) {
          const localPos = this.calibFixedWorldPos.clone();
          parent.worldToLocal(localPos);
          this.el.object3D.position.copy(localPos);
        }
      }
      if (this.calibrationMode && this.calibFixedWorldQuat) {
        const parent = this.el.object3D.parent;
        if (parent) {
          // ワールドQuatを親のローカルQuatに変換
          const parentWorldQuat = new THREE.Quaternion();
          parent.getWorldQuaternion(parentWorldQuat);
          const localQuat = parentWorldQuat.clone().invert().multiply(this.calibFixedWorldQuat);
          this.el.object3D.quaternion.copy(localQuat);
        }
      }

      // nockSphereのローカル位置を更新（弓の子なので回転は自動追従）
      if ((this.mode === 'bow' || this.calibrationMode) && this.nockSphere) {
        this._updateNockSphereLocalPos();
        const near = this.isNearString();
        const color = this.isGrabbingString
          ? 0xff0000
          : near ? 0xffff00 : 0x00ff00;
        (this.nockSphere.material as any).color.setHex(color);
      }

      // 弓モード中: 引き量計算
      if (this.mode === 'bow' && this.isGrabbingString && this.otherHand) {
        const handPos = this.otherHand.object3D.getWorldPosition(new THREE.Vector3());
        const nockPos = this._getNockWorldPos();
        const dist = handPos.distanceTo(nockPos);
        this.drawProgress = Math.min(Math.max(dist / 0.5, 0), 1);
        this.updateMorphs(this.drawProgress);
        if (this.arrow?.material) this.arrow.material.opacity = this.drawProgress;

        if (this.drawProgress > 0 && this.drawProgress < 1) {
          if ((this.el as any).components?.haptics && Math.random() < 0.1) {
            (this.el as any).components.haptics.pulse(0.1 + this.drawProgress * 0.2, 10);
          }
        }
      }
    }
  });
}

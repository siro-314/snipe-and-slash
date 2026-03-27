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

      // 握り判定: 球で可視化（位置調整モードで動かせる）
      // 位置オフセット: 弦のワールド座標からの相対補正値（調整モードで更新）
      this.nockOffset = new THREE.Vector3(0, 0, 0);

      const sphereGeo = new THREE.SphereGeometry(0.12, 12, 8);
      const sphereMat = new THREE.MeshBasicMaterial({
        color: 0x00ff00, transparent: true, opacity: 0.35, wireframe: true
      });
      this.nockSphere = new THREE.Mesh(sphereGeo, sphereMat);
      this.nockSphere.visible = false;
      this.el.sceneEl.object3D.add(this.nockSphere);

      // 位置調整モード（球の表示制御のみ、移動はbowDebugComponentが担当）
      this.calibrationMode = false;

      // 発射方向補正: 弓のローカル-Z軸からのオフセット回転（ラジアン）
      // CALIBモードで調整可能。(0,0)=補正なし
      this.shootDirPitch = 0; // 上下補正（X軸回転）
      this.shootDirYaw   = 0; // 左右補正（Y軸回転）
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

      model.scale.set(1, 1, 1);
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

    // 握り判定の中心ワールド座標を返す
    _getNockWorldPos: function () {
      const base = new THREE.Vector3();
      if (this.string) {
        this.string.getWorldPosition(base);
      } else {
        // フォールバック: 弓エンティティ前方
        const offset = new THREE.Vector3(0, 0, 0.2);
        offset.applyQuaternion(this.el.object3D.getWorldQuaternion(new THREE.Quaternion()));
        this.el.object3D.getWorldPosition(base).add(offset);
      }
      return base.add(this.nockOffset);
    },

    isNearString: function (): boolean {
      if (!this.otherHand) return false;
      const handPos = this.otherHand.object3D.getWorldPosition(new THREE.Vector3());
      const dist = handPos.distanceTo(this._getNockWorldPos());
      return dist < 0.15; // 球の半径と合わせて0.15m
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
    setCalibrationMode: function (enabled: boolean) {
      this.calibrationMode = enabled;
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

      // 球の位置・色を更新（弓モードまたは調整モード中）
      if ((this.mode === 'bow' || this.calibrationMode) && this.nockSphere) {
        this.nockSphere.position.copy(this._getNockWorldPos());
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

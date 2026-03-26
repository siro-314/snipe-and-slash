// THREE はA-Frameのグローバルを使用（global.d.ts で型定義）
import { modelManager } from '../../managers/modelManager';

/**
 * 剣コンポーネント
 * 剣モード⇔弓モードを切り替える武器システム
 * 
 * 弓操作フロー:
 *   1. weapon-controllerがトリガーで弓モードに切り替え
 *   2. 反対の手のグリップを押す → 弦の近くなら掴み開始 (startDraw)
 *   3. 反対の手を引く → drawProgress が増加（モーフ連動）
 *   4. グリップを離す → 矢を発射 (shoot)
 *   5. 射出後、_returnToSwordRequested フラグを立てる
 *      → weapon-controller が検知して剣モードに戻す
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
      this.mode = 'sword'; // 'sword' or 'bow'
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
      this.arrow = null;
      this.arrowPrefab = null; // 矢の原本（クローン用）

      // デバッグ用: 弦を中心とした円柱（掴み判定範囲の可視化）
      // 半径0.3m・高さ0.8m のワイヤーフレーム円柱
      const cylinderGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.8, 16, 1, true);
      const cylinderMat = new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.25, wireframe: true, side: THREE.DoubleSide });
      this.nockCylinder = new THREE.Mesh(cylinderGeo, cylinderMat);
      this.nockCylinder.visible = false;
      this.el.sceneEl.object3D.add(this.nockCylinder);

      // 当たり判定有効化（3秒後）
      setTimeout(() => {
        this.isReady = true;
        console.log('[sword] Ready to slash!');
      }, 3000);

      // フォールバック表示
      this.createFallbackGeometry();

      // モデルロード試行
      this.tryLoadModel();
    },

    tryLoadModel: function () {
      const model = modelManager.getClone('sword');

      if (model) {
        model.scale.set(1, 1, 1);
        // 回転修正: Blender(X90, Y90) -> (Math.PI/2, Math.PI/2, Math.PI) Z軸180度追加
        model.rotation.set(Math.PI / 2, Math.PI / 2, Math.PI);
        console.log(`[sword] Applied rotation: ${model.rotation.x}, ${model.rotation.y}, ${model.rotation.z}`);

        // モデル内のパーツを取得
        model.traverse((node: any) => {
          if (node.isMesh) {
            if (node.name.includes('上ブレード')) this.upperBlade = node;
            if (node.name.includes('下ブレード')) this.lowerBlade = node;
            if (node.name.includes('弦')) this.string = node;
            if (node.name.includes('矢')) {
              this.arrow = node;
              this.arrowPrefab = node.clone();
              this.arrowPrefab.visible = true;
              if (this.arrowPrefab.morphTargetInfluences) {
                this.arrowPrefab.morphTargetInfluences[0] = 0;
              }
              if (this.arrowPrefab.material) {
                this.arrowPrefab.material = this.arrowPrefab.material.clone();
                this.arrowPrefab.material.transparent = false;
                this.arrowPrefab.material.opacity = 1;
              }
            }
          }
        });

        this.morphIndex = 0;

        // メッシュ差し替え
        if (this.el.getObject3D('mesh')) {
          this.el.removeObject3D('mesh');
        }
        this.el.setObject3D('mesh', model);
        this.blade = model;

        this.modelLoaded = true;
        console.log('[sword] Switched to new GLB model');

        // 初期状態セット
        this.setMode('sword');

      } else {
        console.warn('[sword] GLB not available');
      }
    },

    createFallbackGeometry: function () {
      const geo = new THREE.BoxGeometry(0.1, 0.1, 1);
      const mat = new THREE.MeshBasicMaterial({ color: 'red', wireframe: true });
      this.el.setObject3D('mesh', new THREE.Mesh(geo, mat));
    },

    // 逆の手を設定（weapon-controllerから呼ばれる）
    setOtherHand: function (el: any) {
      this.otherHand = el;

      // グリップ押下: 弓モードで弦の近くなら掴み開始
      el.addEventListener('gripdown', () => {
        this.otherHandGripping = true;
        if (this.mode === 'bow' && this.isNearString()) {
          this.startDraw();
        }
      });

      // グリップ解放: 掴んでいたら発射
      el.addEventListener('gripup', () => {
        this.otherHandGripping = false;
        if (this.isGrabbingString) {
          this.shoot();
        }
      });
    },

    // 弦のワールド座標を取得（stringメッシュがあればそこ、なければ弓エンティティ前方）
    _getNockWorldPos: function () {
      if (this.string) {
        const pos = new THREE.Vector3();
        this.string.getWorldPosition(pos);
        return pos;
      }
      // フォールバック: 弓エンティティ前方0.2m
      const offset = new THREE.Vector3(0, 0, 0.2);
      offset.applyQuaternion(this.el.object3D.getWorldQuaternion(new THREE.Quaternion()));
      return this.el.object3D.getWorldPosition(new THREE.Vector3()).add(offset);
    },

    // 弦に近いか判定（弦のワールド座標と左手の距離）
    isNearString: function (): boolean {
      if (!this.otherHand) return false;
      const handPos = this.otherHand.object3D.getWorldPosition(new THREE.Vector3());
      const nockPos = this._getNockWorldPos();
      const dist = handPos.distanceTo(nockPos);
      console.log(`[bow] isNearString dist=${dist.toFixed(3)}`);
      return dist < 0.3; // 円柱半径と合わせて0.3m
    },

    setMode: function (mode: string) {
      this.mode = mode;
      if (!this.modelLoaded) return;

      if (mode === 'bow') {
        if (this.upperBlade && this.upperBlade.morphTargetInfluences) {
          this.upperBlade.morphTargetInfluences[this.morphIndex] = 1;
        }
        if (this.lowerBlade) this.lowerBlade.visible = true;
        if (this.string) this.string.visible = true;

        if (this.arrow) {
          this.arrow.visible = false;
          if (this.arrow.material) this.arrow.material.opacity = 0;
        }

        if (this.nockCylinder) this.nockCylinder.visible = true;

      } else {
        if (this.upperBlade && this.upperBlade.morphTargetInfluences) {
          this.upperBlade.morphTargetInfluences[this.morphIndex] = 0;
        }
        if (this.lowerBlade) this.lowerBlade.visible = false;
        if (this.string) this.string.visible = false;
        if (this.arrow) this.arrow.visible = false;

        this.isGrabbingString = false;
        this.isDrawn = false;

        if (this.nockCylinder) this.nockCylinder.visible = false;
      }
    },

    startDraw: function () {
      if (this.mode !== 'bow') return;
      this.isGrabbingString = true;
      this.isDrawn = true;

      if (this.arrow) {
        this.arrow.visible = true;
        if (this.arrow.material) this.arrow.material.opacity = 0;
      }

      console.log('[sword/bow] String grabbed! Pull back to draw.');
    },

    shoot: function () {
      if (this.mode !== 'bow' || !this.isDrawn) return;

      // DEBUG: drawProgressのガードを撤廃（0でも発射する）
      // if (this.drawProgress < 0.2) { ... }
      console.log(`[sword/bow] Shooting! Draw progress: ${this.drawProgress.toFixed(2)}`);

      // 矢の発射（モデルクローン）
      let arrowMesh;
      if (this.arrowPrefab) {
        arrowMesh = this.arrowPrefab.clone();
        if (arrowMesh.material) {
          arrowMesh.material = this.arrowPrefab.material.clone();
          arrowMesh.material.transparent = false; // 確実に表示
          arrowMesh.material.opacity = 1.0;
        }
        // モーフィングリセット
        if (arrowMesh.morphTargetInfluences) {
          arrowMesh.morphTargetInfluences[0] = 0;
        }
      } else {
        // フォールバック
        arrowMesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.05),
          new THREE.MeshBasicMaterial({ color: '#00d4ff' })
        );
      }

      const arrowEntity = document.createElement('a-entity');
      arrowEntity.setObject3D('mesh', arrowMesh);

      const pos = this.el.object3D.getWorldPosition(new THREE.Vector3());
      const dir = new THREE.Vector3(0, 0, -1);
      dir.applyQuaternion(this.el.object3D.getWorldQuaternion(new THREE.Quaternion()));

      // スケール補正: 元の矢のワールドスケールを適用
      if (this.arrow) {
        const worldScale = new THREE.Vector3();
        this.arrow.getWorldScale(worldScale);
        arrowEntity.object3D.scale.copy(worldScale);
      }

      arrowEntity.setAttribute('position', pos);

      // 威力や速度を引き具合で変える
      const speed = 10 + (this.drawProgress * 15); // 10~25
      arrowEntity.setAttribute('projectile', `direction: ${dir.x} ${dir.y} ${dir.z}; speed: ${speed}`);
      arrowEntity.setAttribute('player-arrow', '');

      (document.querySelector('a-scene') as any).appendChild(arrowEntity);

      // リセット
      this.isGrabbingString = false;
      this.isDrawn = false;
      this.drawProgress = 0;
      this.updateMorphs(0);
      if (this.arrow) this.arrow.visible = false;

      if ((this.el as any).components.haptics) {
        (this.el as any).components.haptics.pulse(1.0, 50);
      }

      // weapon-controller に剣モードへ戻すことをリクエスト
      this._returnToSwordRequested = true;
    },

    updateMorphs: function (value: number) {
      if (this.string && this.string.morphTargetInfluences) {
        this.string.morphTargetInfluences[this.morphIndex] = value;
      }
      if (this.arrow && this.arrow.morphTargetInfluences) {
        this.arrow.morphTargetInfluences[this.morphIndex] = value;
      }
    },

    tick: function (_time: number, delta: number) {
      if (!this.modelLoaded) {
        this.retryTimer += delta;
        if (this.retryTimer > 500) {
          this.retryTimer = 0;
          this.tryLoadModel();
        }
        return;
      }

      // 円柱の位置・回転・色を弦に追従させる
      if (this.mode === 'bow' && this.nockCylinder) {
        const nockPos = this._getNockWorldPos();
        this.nockCylinder.position.copy(nockPos);

        // 弓の向きに合わせて円柱を回転（弦は弓に対して横軸）
        this.nockCylinder.quaternion.copy(this.el.object3D.getWorldQuaternion(new THREE.Quaternion()));

        // 色制御: 掴み中=赤 / 範囲内=黄 / 待機=緑
        const color = this.isGrabbingString ? 0xff0000 : this.isNearString() ? 0xffff00 : 0x00ff00;
        this.nockCylinder.material.color.setHex(color);
      }

      // 両手操作ロジック: 弦を引いている間のドロー処理
      if (this.mode === 'bow' && this.isGrabbingString && this.otherHand) {
        const handPos = this.otherHand.object3D.getWorldPosition(new THREE.Vector3());
        const nockPos = this._getNockWorldPos();

        // シンプルな距離ベースで引き量を計算（まず動かすことを優先）
        const dist = handPos.distanceTo(nockPos);
        // 0.0mから引き始め、0.5mで最大(1.0)
        this.drawProgress = Math.min(Math.max(dist / 0.5, 0), 1);
        console.log(`[bow] drawProgress=${this.drawProgress.toFixed(2)} dist=${dist.toFixed(3)}`);

        this.updateMorphs(this.drawProgress);

        if (this.arrow && this.arrow.material) {
          this.arrow.material.opacity = this.drawProgress;
        }

        // 振動フィードバック
        if (this.drawProgress > 0 && this.drawProgress < 1) {
          // 弓を持ってる手
          if ((this.el as any).components.haptics && Math.random() < 0.1) {
            (this.el as any).components.haptics.pulse(0.1 + this.drawProgress * 0.2, 10);
          }
        }
      }
    }
  });
}

import * as THREE from 'three';
import { modelManager } from '../../managers/modelManager';

/**
 * 剣コンポーネント
 * 剣モード⇔弓モードを切り替える武器システム
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

      // メッシュ参照
      this.upperBlade = null;
      this.lowerBlade = null;
      this.arrow = null;
      this.arrowPrefab = null; // 矢の原本（クローン用）

      // デバッグ用マーカー（弦の掴み位置）
      const markerGeo = new THREE.SphereGeometry(0.05, 16, 16);
      const markerMat = new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.5, wireframe: true });
      this.nockMarker = new THREE.Mesh(markerGeo, markerMat);
      this.nockMarker.visible = false;
      this.el.sceneEl.object3D.add(this.nockMarker);

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
        model.traverse(node => {
          if ((node as THREE.Mesh).isMesh) {
            const mesh = node as THREE.Mesh;
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
    setOtherHand: function (el) {
      this.otherHand = el;

      // イベントリスナー
      el.addEventListener('gripdown', () => {
        this.otherHandGripping = true;
        // 弦の近くなら掴み開始
        if (this.mode === 'bow' && this.isNearString()) {
          this.startDraw();
        }
      });

      el.addEventListener('gripup', () => {
        this.otherHandGripping = false;
        // 掴んでいたら発射
        if (this.isGrabbingString) {
          this.shoot();
        }
      });
    },

    // 弦に近いか判定
    isNearString: function () {
      if (!this.otherHand || !this.nockMarker) return false;
      const handPos = this.otherHand.object3D.getWorldPosition(new THREE.Vector3());
      const markerPos = this.nockMarker.position;
      const dist = handPos.distanceTo(markerPos);
      return dist < 0.4; // 判定緩和
    },

    setMode: function (mode) {
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

        if (this.nockMarker) this.nockMarker.visible = true;

      } else {
        if (this.upperBlade && this.upperBlade.morphTargetInfluences) {
          this.upperBlade.morphTargetInfluences[this.morphIndex] = 0;
        }
        if (this.lowerBlade) this.lowerBlade.visible = false;
        if (this.string) this.string.visible = false;
        if (this.arrow) this.arrow.visible = false;

        this.isGrabbingString = false;
        this.isDrawn = false;

        if (this.nockMarker) this.nockMarker.visible = false;
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
    },

    shoot: function () {
      if (this.mode !== 'bow' || !this.isDrawn) return;

      // 最低限引いてないと撃てない（誤射防止）
      if (this.drawProgress < 0.2) {
        // キャンセル扱い
        this.isGrabbingString = false;
        this.isDrawn = false;
        this.updateMorphs(0);
        if (this.arrow) this.arrow.visible = false;
        return;
      }

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

      // 威力や速度を引き具合で変える？ 今回は固定かつ高速に（少し遅くして視認性確保）
      const speed = 10 + (this.drawProgress * 15); // 10~25
      arrowEntity.setAttribute('projectile', `direction: ${dir.x} ${dir.y} ${dir.z}; speed: ${speed}`);
      arrowEntity.setAttribute('player-arrow', '');

      document.querySelector('a-scene').appendChild(arrowEntity);

      // リセット
      this.isGrabbingString = false;
      this.isDrawn = false;
      this.drawProgress = 0;
      this.updateMorphs(0);
      if (this.arrow) this.arrow.visible = false;

      if (this.el.components.haptics) {
        this.el.components.haptics.pulse(1.0, 50);
      }
    },

    updateMorphs: function (value) {
      if (this.string && this.string.morphTargetInfluences) {
        this.string.morphTargetInfluences[this.morphIndex] = value;
      }
      if (this.arrow && this.arrow.morphTargetInfluences) {
        this.arrow.morphTargetInfluences[this.morphIndex] = value;
      }
    },

    tick: function (time, delta) {
      if (!this.modelLoaded) {
        this.retryTimer += delta;
        if (this.retryTimer > 500) {
          this.retryTimer = 0;
          this.tryLoadModel();
        }
        return;
      }

      // マーカー位置更新
      if (this.mode === 'bow' && this.nockMarker) {
        // グリップから少しずらした位置を判定基準にする
        const offset = new THREE.Vector3(0, 0, 0.2);
        offset.applyQuaternion(this.el.object3D.getWorldQuaternion(new THREE.Quaternion()));
        const worldPos = this.el.object3D.getWorldPosition(new THREE.Vector3()).add(offset);
        this.nockMarker.position.copy(worldPos);

        // 色制御: 掴んでいれば赤、近ければ黄色、それ以外は緑
        if (this.isGrabbingString) {
          this.nockMarker.material.color.setHex(0xff0000);
        } else if (this.isNearString()) {
          this.nockMarker.material.color.setHex(0xffff00);
        } else {
          this.nockMarker.material.color.setHex(0x00ff00);
        }
      }

      // 両手操作ロジック
      if (this.mode === 'bow' && this.isGrabbingString && this.otherHand) {
        const handPos = this.otherHand.object3D.getWorldPosition(new THREE.Vector3());
        const bowPos = this.el.object3D.getWorldPosition(new THREE.Vector3());
        const dist = handPos.distanceTo(bowPos);

        // 0.1mから引き始め、0.6mで最大(1.0)
        this.drawProgress = Math.min(Math.max((dist - 0.1) / 0.5, 0), 1);

        this.updateMorphs(this.drawProgress);

        if (this.arrow && this.arrow.material) {
          this.arrow.material.opacity = this.drawProgress;
        }

        // 振動フィードバック
        if (this.drawProgress > 0 && this.drawProgress < 1) {
          // 弓を持ってる手
          if (this.el.components.haptics && Math.random() < 0.1) {
            this.el.components.haptics.pulse(0.1 + this.drawProgress * 0.2, 10);
          }
        }
      }
    }
  });
}

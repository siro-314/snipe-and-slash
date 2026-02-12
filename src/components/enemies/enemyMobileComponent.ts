// THREE はA-Frameのグローバルを使用（global.d.ts で型定義）
import { gameState } from '../../domain/gameState';
import { modelManager } from '../../managers/modelManager';
import { hudManager } from '../../managers/hudManager';

/**
 * 敵コンポーネント: 移動型（白ドローン - 射撃型）
 */
export function registerEnemyMobileComponent(checkGameClear: () => void) {
  AFRAME.registerComponent('enemy-mobile', {
    init: function () {
      this.health = 1;
      this.shootCooldown = 2000;
      this.lastShot = Date.now();
      this.modelLoaded = false;

      // GLBモデルを試行、失敗時はフォールバック
      this.loadModel();

      gameState.addEnemy(this);
    },

    loadModel: function () {
      const model = modelManager.getClone('drone_white');

      if (model) {
        // GLBモデル使用
        model.scale.set(0.5, 0.5, 0.5); // サイズ調整
        this.el.setObject3D('mesh', model);
        this.modelLoaded = true;
        console.log('[enemy-mobile] Using GLB model');
      } else {
        // フォールバック: 既存ジオメトリ
        console.warn('[enemy-mobile] GLB not available, using fallback geometry');
        this.createFallbackGeometry();
      }
    },

    createFallbackGeometry: function () {
      const container = new THREE.Object3D();

      // 1. ボディ: カクカクした白球体
      const bodyGeo = new THREE.IcosahedronGeometry(0.3, 1);
      const bodyMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.4,
        flatShading: true
      });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      container.add(body);

      // 2. 目: 赤いレンズ
      const eyeBaseGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.05, 16);
      const eyeBaseMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
      const eyeBase = new THREE.Mesh(eyeBaseGeo, eyeBaseMat);
      eyeBase.rotation.x = Math.PI / 2;
      eyeBase.position.z = 0.25;
      container.add(eyeBase);

      const eyeGeo = new THREE.SphereGeometry(0.08, 16, 16);
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.z = 0.28;
      container.add(eye);

      // 3. 浮遊パーツ（衛星）: 回転するリング
      const ringGeo = new THREE.TorusGeometry(0.5, 0.01, 4, 32);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.5 });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      this.ring = ring;
      container.add(ring);

      this.el.setObject3D('mesh', container);
    },

    tick: function (time, delta) {
      const camera = document.querySelector('[camera]') as any;
      if (!camera) return;

      const targetPos = camera.object3D.position;
      this.el.object3D.lookAt(targetPos);

      // アニメーション: リング回転
      if (this.ring) {
        this.ring.rotation.x += delta * 0.001;
        this.ring.rotation.y += delta * 0.002;
      }

      // 射撃処理
      const now = Date.now();
      if (now - this.lastShot > this.shootCooldown) {
        this.shoot();
        this.lastShot = now;
      }
    },

    shoot: function () {
      const bullet = document.createElement('a-sphere');
      bullet.setAttribute('radius', '0.1');
      bullet.setAttribute('color', '#ff6666');
      bullet.setAttribute('material', 'shader: flat; emissive: #ff0000; emissiveIntensity: 2');

      const pos = this.el.object3D.getWorldPosition(new THREE.Vector3());
      const camera = document.querySelector('[camera]') as any;
      const dir = camera.object3D.position.clone().sub(pos).normalize();

      bullet.setAttribute('position', pos);
      bullet.setAttribute('projectile', `direction: ${dir.x} ${dir.y} ${dir.z}; speed: 3`);
      bullet.setAttribute('enemy-bullet', '');

      document.querySelector('a-scene').appendChild(bullet);
    },

    takeDamage: function () {
      this.health -= 1;
      if (this.health <= 0) {
        this.die();
      }
    },

    die: function () {
      gameState.incrementKills();
      hudManager.update(gameState);

      // 配列から削除
      gameState.removeEnemy(this);

      // エンティティ削除
      if (this.el.parentNode) {
        this.el.parentNode.removeChild(this.el);
      }

      // クリアチェック
      checkGameClear();
    }
  });
}

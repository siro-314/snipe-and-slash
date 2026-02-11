import { gameState } from '../../domain/gameState';
import { modelManager } from '../../managers/modelManager';
import * as THREE from 'three';

/**
 * 敵コンポーネント: 黒ドローン（自爆型）
 * カクカク移動 → タメ → 爆発
 */
export function registerEnemyDroneBlackComponent(
  updateHUD: () => void,
  checkGameClear: () => void
) {
  AFRAME.registerComponent('enemy-drone-black', {
    init: function () {
      this.health = 1;
      this.state = 'approaching';
      this.chargeTime = 1500;
      this.chargeStarted = 0;
      this.moveTimer = 0;
      this.moveInterval = 300;
      this.modelLoaded = false;

      this.loadModel();
      gameState.addEnemy(this);
    },

    loadModel: function () {
      const model = modelManager.getClone('drone_black');

      if (model) {
        model.scale.set(0.5, 0.5, 0.5);
        this.el.setObject3D('mesh', model);
        this.modelLoaded = true;
        console.log('[enemy-drone-black] Using GLB model');
      } else {
        console.warn('[enemy-drone-black] GLB not available, using fallback geometry');
        this.createFallbackGeometry();
      }
    },

    createFallbackGeometry: function () {
      const bodyGeo = new THREE.IcosahedronGeometry(0.3, 1);
      const bodyMat = new THREE.MeshStandardMaterial({
        color: 0x222222,
        roughness: 0.3,
        flatShading: true
      });
      const body = new THREE.Mesh(bodyGeo, bodyMat);

      const eyeGeo = new THREE.SphereGeometry(0.1, 16, 16);
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.z = 0.25;

      const container = new THREE.Object3D();
      container.add(body);
      container.add(eye);
      this.el.setObject3D('mesh', container);
    },

    tick: function (time, delta) {
      const camera = document.querySelector('[camera]') as any;
      if (!camera) return;

      const myPos = this.el.object3D.position;
      const targetPos = camera.object3D.position;
      const distance = myPos.distanceTo(targetPos);

      this.el.object3D.lookAt(targetPos);

      if (this.state === 'approaching') {
        this.moveTimer += delta;
        if (this.moveTimer >= this.moveInterval) {
          this.moveTimer = 0;

          const dir = targetPos.clone().sub(myPos).normalize();
          dir.x += (Math.random() - 0.5) * 0.5;
          dir.y += (Math.random() - 0.5) * 0.3;
          dir.z += (Math.random() - 0.5) * 0.5;
          dir.normalize();

          myPos.add(dir.multiplyScalar(0.8));
        }

        if (distance < 2) {
          this.state = 'charging';
          this.chargeStarted = time;
          console.log('[enemy-drone-black] Charging...');
        }
      } else if (this.state === 'charging') {
        const elapsed = time - this.chargeStarted;

        const scale = 1 + Math.sin(elapsed * 0.01) * 0.1;
        this.el.object3D.scale.set(scale, scale, scale);

        if (elapsed > this.chargeTime) {
          this.explode();
        }
      }
    },

    explode: function () {
      this.state = 'exploding';
      console.log('[enemy-drone-black] Explode!');

      const camera = document.querySelector('[camera]') as any;
      if (camera) {
        const distance = this.el.object3D.position.distanceTo(camera.object3D.position);
        if (distance < 3) {
          gameState.incrementHits();
          updateHUD();
          console.log('[enemy-drone-black] Player hit by explosion!');
        }
      }

      this.die();
    },

    takeDamage: function () {
      this.health -= 1;
      if (this.health <= 0) {
        console.log('[enemy-drone-black] Destroyed before explosion');
        this.die();
      }
    },

    die: function () {
      gameState.incrementKills();
      updateHUD();
      gameState.removeEnemy(this);

      if (this.el.parentNode) {
        this.el.parentNode.removeChild(this.el);
      }

      checkGameClear();
    }
  });
}

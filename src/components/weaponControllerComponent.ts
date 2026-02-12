// THREE はA-Frameのグローバルを使用（global.d.ts で型定義）
import { gameState } from '../domain/gameState';

/**
 * VRコントローラー操作管理コンポーネント
 * トリガー・グリップボタンで武器を操作
 */
export function registerWeaponControllerComponent() {
  AFRAME.registerComponent('weapon-controller', {
    schema: {
      hand: { type: 'string', default: 'right' }
    },

    init: function () {
      this.weaponEntity = null;
      this.triggerPressed = false;
      this.gripPressed = false;
      this.weaponSpawned = false;

      const otherHandId = this.data.hand === 'right' ? 'leftHand' : 'rightHand';
      this.otherHand = document.getElementById(otherHandId);

      // 剣の生成はゲーム開始後に遅延（カスタムイベントで制御）
      this.el.sceneEl.addEventListener('game-started', () => {
        this.spawnWeapon();
      });

      gameState.setCurrentWeapon('sword');

      this.el.addEventListener('triggerdown', this.onTriggerDown.bind(this));
      this.el.addEventListener('triggerup', this.onTriggerUp.bind(this));
      this.el.addEventListener('gripdown', this.onGripDown.bind(this));
      this.el.addEventListener('gripup', this.onGripUp.bind(this));
    },

    spawnWeapon: function () {
      if (this.weaponSpawned) return;

      this.weaponEntity = document.createElement('a-entity');
      this.weaponEntity.setAttribute('sword', `hand: ${this.data.hand}`);
      this.weaponEntity.setAttribute('position', '0 0 -0.1');
      this.el.appendChild(this.weaponEntity);

      if (this.weaponEntity.components.sword) {
        this.weaponEntity.components.sword.setOtherHand(this.otherHand);
      } else {
        this.weaponEntity.addEventListener('componentinitialized', (evt) => {
          if (evt.detail.name === 'sword') {
            this.weaponEntity.components.sword.setOtherHand(this.otherHand);
          }
        });
      }

      this.weaponSpawned = true;
      console.log(`[weapon-controller] Weapon spawned for ${this.data.hand} hand`);
    },

    equipWeapon: function (weaponType) {
      if (this.weaponEntity && this.weaponEntity.components.sword) {
        this.weaponEntity.components.sword.setMode(weaponType);
      }
      gameState.setCurrentWeapon(weaponType);

      if (this.el.components.haptics) {
        this.el.components.haptics.pulse(0.5, 100);
      }
    },

    onTriggerDown: function (evt) {
      this.triggerPressed = true;

      if (gameState.getCurrentWeapon() === 'sword') {
        this.equipWeapon('bow');
      }
    },

    onTriggerUp: function (evt) {
      this.triggerPressed = false;

      if (gameState.getCurrentWeapon() === 'bow') {
        if (this.weaponEntity && this.weaponEntity.components.sword) {
          this.weaponEntity.components.sword.shoot();
        }

        setTimeout(() => {
          this.equipWeapon('sword');
        }, 200);
      }
    },

    onGripDown: function (evt) {
      this.gripPressed = true;

      if (gameState.getCurrentWeapon() === 'bow' && this.weaponEntity) {
        const bow = this.weaponEntity.components.bow;
        if (bow) {
          bow.startDraw();
        }
      }
    },

    onGripUp: function (evt) {
      this.gripPressed = false;
    },

    tick: function () {
      if (gameState.getCurrentWeapon() === 'sword' && this.weaponEntity) {
        const velocity = this.el.object3D.getWorldDirection(new THREE.Vector3());
        const speed = velocity.length();

        if (speed > 0.5) {
          this.checkSwordHit();
        }
      }
    },

    checkSwordHit: function () {
      if (!this.weaponEntity) return;

      const swordComp = this.weaponEntity.components.sword;
      if (!swordComp || !swordComp.blade || !swordComp.isReady) return;

      const swordMesh = swordComp.blade;
      const swordBox = new THREE.Box3().setFromObject(swordMesh);

      const size = new THREE.Vector3();
      swordBox.getSize(size);
      if (size.length() > 5) {
        if (!this.warnedHugeBox) {
          console.warn('[checkSwordHit] Sword Box too huge! Ignoring hit.', size);
          this.warnedHugeBox = true;
        }
        return;
      }

      gameState.getEnemies().forEach(enemy => {
        const enemyEl = enemy.el;
        if (!enemyEl) return;

        const enemyMesh = enemyEl.getObject3D('mesh');
        if (!enemyMesh) return;

        const enemyBox = new THREE.Box3().setFromObject(enemyMesh);

        if (swordBox.intersectsBox(enemyBox)) {
          const now = Date.now();
          if (!enemy.lastHitTime || now - enemy.lastHitTime > 400) {
            enemy.takeDamage();
            enemy.lastHitTime = now;

            const gamepads = navigator.getGamepads();
            if (gamepads) {
              for (let i = 0; i < gamepads.length; i++) {
                const gp = gamepads[i];
                if (gp && gp.hapticActuators && gp.hapticActuators.length > 0) {
                  gp.hapticActuators[0].pulse(1.0, 50);
                }
              }
            }

            console.log('Sword SLASH Hit!');
          }
        }
      });
    }
  });
}

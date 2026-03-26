// THREE はA-Frameのグローバルを使用（global.d.ts で型定義）
import { gameState } from '../domain/gameState';

/**
 * VRコントローラー操作管理コンポーネント
 *
 * 設計方針:
 *   - 両手どちらのトリガーを押してもその手に弓が来る
 *   - 弓モード中: グリップ（反対の手）で弦を掴む → 引いて離すと発射
 *   - 発射後は弓モードのまま維持（連射可能）
 *   - 武器の状態は各コントローラーが独立して管理
 */
export function registerWeaponControllerComponent() {
  AFRAME.registerComponent('weapon-controller', {
    schema: {
      hand: { type: 'string', default: 'right' }
    },

    init: function () {
      this.weaponEntity = null;
      this.weaponSpawned = false;
      this.currentMode = 'sword'; // このコントローラーの現在モード

      // 剣の速度計測用
      this.prevSwordWorldPos = new THREE.Vector3();
      this.hasPrevPos = false;
      this.swordSwingSpeed = 0;

      // 反対の手のエンティティ（otherHandとして渡す用）
      const otherHandId = this.data.hand === 'right' ? 'leftHand' : 'rightHand';
      this.otherHandEl = document.getElementById(otherHandId);

      // ゲーム開始後に武器生成
      this.el.sceneEl.addEventListener('game-started', () => {
        this.spawnWeapon();
      });

      this.el.addEventListener('triggerdown', this.onTriggerDown.bind(this));
      this.el.addEventListener('triggerup', this.onTriggerUp.bind(this));
    },

    spawnWeapon: function () {
      if (this.weaponSpawned) return;

      this.weaponEntity = document.createElement('a-entity');
      this.weaponEntity.setAttribute('sword', `hand: ${this.data.hand}`);
      this.weaponEntity.setAttribute('position', '0 0 -0.1');
      this.el.appendChild(this.weaponEntity);

      const assignOtherHand = () => {
        if (this.weaponEntity.components.sword) {
          this.weaponEntity.components.sword.setOtherHand(this.otherHandEl);
          console.log(`[weapon-controller:${this.data.hand}] setOtherHand → ${this.otherHandEl?.id}`);
        } else {
          console.warn(`[weapon-controller:${this.data.hand}] sword not found after loaded`);
        }
      };

      if (this.weaponEntity.hasLoaded) {
        assignOtherHand();
      } else {
        this.weaponEntity.addEventListener('loaded', assignOtherHand, { once: true });
      }

      this.weaponSpawned = true;
      console.log(`[weapon-controller:${this.data.hand}] Weapon spawned`);
    },

    equipWeapon: function (weaponType: 'sword' | 'bow') {
      if (this.weaponEntity?.components?.sword) {
        this.weaponEntity.components.sword.setMode(weaponType);
      }
      this.currentMode = weaponType;
      gameState.setCurrentWeapon(weaponType);

      if ((this.el as any).components?.haptics) {
        (this.el as any).components.haptics.pulse(0.5, 100);
      }
    },

    // トリガー: 剣→弓（弓モード中はトグルなし、そのまま維持）
    onTriggerDown: function (_evt: any) {
      if (this.currentMode === 'sword') {
        this.equipWeapon('bow');
      }
      // 弓モード中のトリガーは何もしない（弦操作はグリップ）
    },

    onTriggerUp: function (_evt: any) {
      // トリガーを離しても弓モードを維持（連射のため）
      // 剣に戻したい場合は将来的に別ボタンで実装
    },

    tick: function (_time: number, delta: number) {
      // 剣モード: 振りの速度判定で斬撃
      if (this.currentMode === 'sword' && this.weaponEntity) {
        this.updateSwordSwingSpeed(delta);
        if (this.swordSwingSpeed > 1.5) {
          this.checkSwordHit();
        }
      }
    },

    updateSwordSwingSpeed: function (delta: number) {
      if (!this.weaponEntity) return;
      const currentPos = this.weaponEntity.object3D.getWorldPosition(new THREE.Vector3());
      if (this.hasPrevPos) {
        const dist = currentPos.distanceTo(this.prevSwordWorldPos);
        const dt = delta / 1000;
        this.swordSwingSpeed = dt > 0 ? dist / dt : 0;
      }
      this.prevSwordWorldPos.copy(currentPos);
      this.hasPrevPos = true;
    },

    checkSwordHit: function () {
      if (!this.weaponEntity) return;
      const swordComp = this.weaponEntity.components.sword;
      if (!swordComp || !swordComp.isReady) return;

      const swordWorldPos = this.weaponEntity.object3D.getWorldPosition(new THREE.Vector3());
      const swordDir = new THREE.Vector3(0, 0, -1);
      swordDir.applyQuaternion(this.weaponEntity.object3D.getWorldQuaternion(new THREE.Quaternion()));

      const bladeStart = swordWorldPos.clone().add(swordDir.clone().multiplyScalar(0.1));
      const bladeEnd   = swordWorldPos.clone().add(swordDir.clone().multiplyScalar(0.8));
      const hitRadius  = 0.3;

      gameState.getEnemies().forEach((enemy: any) => {
        const enemyEl = enemy.el;
        if (!enemyEl) return;
        const enemyPos = enemyEl.object3D.getWorldPosition(new THREE.Vector3());
        const dist = this.pointToSegmentDistance(enemyPos, bladeStart, bladeEnd);
        if (dist < hitRadius + 0.5) {
          const now = Date.now();
          if (!enemy.lastHitTime || now - enemy.lastHitTime > 400) {
            enemy.takeDamage();
            enemy.lastHitTime = now;
            const gamepads = navigator.getGamepads();
            if (gamepads) {
              for (let i = 0; i < gamepads.length; i++) {
                const gp = gamepads[i];
                if (gp?.hapticActuators?.length > 0) {
                  (gp.hapticActuators[0] as any).pulse(1.0, 50);
                }
              }
            }
          }
        }
      });
    },

    pointToSegmentDistance: function (p: any, a: any, b: any): number {
      const ab = new THREE.Vector3().subVectors(b, a);
      const ap = new THREE.Vector3().subVectors(p, a);
      const t  = Math.max(0, Math.min(1, ap.dot(ab) / ab.dot(ab)));
      return p.distanceTo(a.clone().add(ab.multiplyScalar(t)));
    }
  });
}

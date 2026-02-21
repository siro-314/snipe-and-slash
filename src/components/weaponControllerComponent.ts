// THREE はA-Frameのグローバルを使用（global.d.ts で型定義）
import { gameState } from '../domain/gameState';

/**
 * VRコントローラー操作管理コンポーネント
 * トリガー・グリップボタンで武器を操作
 * 
 * 操作フロー:
 *   剣モード: コントローラーを振ると斬撃（速度ベースの判定）
 *   弓モード: トリガーで切り替え → 反対の手のグリップで弦を掴む → 引いて離すと発射
 * 
 * 切り替え: トリガーを押すと剣⇔弓がトグル
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

      // 剣の速度計測用: 前フレームのワールド座標
      this.prevSwordWorldPos = new THREE.Vector3();
      this.hasPrevPos = false;
      this.swordSwingSpeed = 0;

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
        this.weaponEntity.addEventListener('componentinitialized', (evt: any) => {
          if (evt.detail.name === 'sword') {
            this.weaponEntity.components.sword.setOtherHand(this.otherHand);
          }
        });
      }

      this.weaponSpawned = true;
      console.log(`[weapon-controller] Weapon spawned for ${this.data.hand} hand`);
    },

    equipWeapon: function (weaponType: 'sword' | 'bow') {
      if (this.weaponEntity && this.weaponEntity.components.sword) {
        this.weaponEntity.components.sword.setMode(weaponType);
      }
      gameState.setCurrentWeapon(weaponType);

      if ((this.el as any).components.haptics) {
        (this.el as any).components.haptics.pulse(0.5, 100);
      }
    },

    // ===== トリガー: 剣⇔弓のトグル =====
    onTriggerDown: function (_evt: any) {
      this.triggerPressed = true;

      // 剣モード → 弓モードに切り替え
      if (gameState.getCurrentWeapon() === 'sword') {
        this.equipWeapon('bow');
      }
      // 弓モード中のトリガーダウンは何もしない（弦操作はグリップで行う）
    },

    onTriggerUp: function (_evt: any) {
      this.triggerPressed = false;

      // 弓モード → 剣モードに戻す
      // ただし弦を引いてる最中は戻さない（グリップリリースで発射→自動で戻る）
      if (gameState.getCurrentWeapon() === 'bow') {
        const swordComp = this.weaponEntity?.components?.sword;
        if (swordComp && !swordComp.isGrabbingString && !swordComp.isDrawn) {
          // 弦を掴んでない状態でトリガーを離したら剣に戻す
          this.equipWeapon('sword');
        }
        // 弦を掴んでいる場合はグリップリリースで発射→その後に剣に戻す
      }
    },

    // ===== グリップ: 弓モード中の弦操作 =====
    onGripDown: function (_evt: any) {
      this.gripPressed = true;
      // 弓の弦掴みは swordComponent の setOtherHand で直接処理している
      // (otherHand の gripdown イベントを sword コンポーネントがリスンしている)
    },

    onGripUp: function (_evt: any) {
      this.gripPressed = false;
      // グリップリリースも swordComponent の setOtherHand で直接処理
      // (shoot後の剣モード復帰はここで行う)
    },

    tick: function (_time: number, delta: number) {
      // 剣モード: 振りの速度判定で斬撃チェック
      if (gameState.getCurrentWeapon() === 'sword' && this.weaponEntity) {
        this.updateSwordSwingSpeed(delta);

        // 実際にコントローラーが高速で動いているときだけ斬撃判定
        if (this.swordSwingSpeed > 1.5) { // 1.5 m/s 以上で振りと判定
          this.checkSwordHit();
        }
      }

      // 弓モード中に弦を引いて射出した後、剣に戻す処理
      if (gameState.getCurrentWeapon() === 'bow' && this.weaponEntity) {
        const swordComp = this.weaponEntity.components?.sword;
        if (swordComp && swordComp._returnToSwordRequested) {
          swordComp._returnToSwordRequested = false;
          setTimeout(() => {
            this.equipWeapon('sword');
          }, 300);
        }
      }
    },

    /**
     * コントローラーのワールド座標の移動速度を計算
     * getWorldDirection() は正規化ベクトル（常に長さ1）なので速度には使えない
     */
    updateSwordSwingSpeed: function (delta: number) {
      if (!this.weaponEntity) return;

      const currentPos = this.weaponEntity.object3D.getWorldPosition(new THREE.Vector3());

      if (this.hasPrevPos) {
        const dist = currentPos.distanceTo(this.prevSwordWorldPos);
        const dt = delta / 1000; // ミリ秒→秒
        this.swordSwingSpeed = dt > 0 ? dist / dt : 0; // m/s
      }

      this.prevSwordWorldPos.copy(currentPos);
      this.hasPrevPos = true;
    },

    checkSwordHit: function () {
      if (!this.weaponEntity) return;

      const swordComp = this.weaponEntity.components.sword;
      if (!swordComp || !swordComp.isReady) return;

      // 剣の先端付近のワールド座標でスフィアキャスト的な判定をする
      // Box3().setFromObject() はモデル全体を包むので巨大になりやすい
      // → コントローラー位置から剣の前方方向に沿った線分で判定
      const swordWorldPos = this.weaponEntity.object3D.getWorldPosition(new THREE.Vector3());
      const swordDir = new THREE.Vector3(0, 0, -1);
      swordDir.applyQuaternion(this.weaponEntity.object3D.getWorldQuaternion(new THREE.Quaternion()));

      // 剣の刃の範囲: 根本(0.1m)〜先端(0.8m)
      const bladeStart = swordWorldPos.clone().add(swordDir.clone().multiplyScalar(0.1));
      const bladeEnd = swordWorldPos.clone().add(swordDir.clone().multiplyScalar(0.8));

      // 刃の中間点
      const bladeMid = bladeStart.clone().add(bladeEnd).multiplyScalar(0.5);

      // 判定半径（刃の太さ + 余裕）
      const hitRadius = 0.3; // 0.3m

      gameState.getEnemies().forEach((enemy: any) => {
        const enemyEl = enemy.el;
        if (!enemyEl) return;

        const enemyPos = enemyEl.object3D.getWorldPosition(new THREE.Vector3());

        // 剣の線分（bladeStart〜bladeEnd）と敵の中心点の最近接距離
        const dist = this.pointToSegmentDistance(enemyPos, bladeStart, bladeEnd);

        // 敵の半径（おおよそ0.3〜0.5m）
        const enemyRadius = 0.5;

        if (dist < hitRadius + enemyRadius) {
          const now = Date.now();
          if (!enemy.lastHitTime || now - enemy.lastHitTime > 400) {
            enemy.takeDamage();
            enemy.lastHitTime = now;

            const gamepads = navigator.getGamepads();
            if (gamepads) {
              for (let i = 0; i < gamepads.length; i++) {
                const gp = gamepads[i];
                if (gp && gp.hapticActuators && gp.hapticActuators.length > 0) {
                  (gp.hapticActuators[0] as any).pulse(1.0, 50);
                }
              }
            }

            console.log(`Sword SLASH Hit! (swing speed: ${this.swordSwingSpeed.toFixed(1)} m/s, dist: ${dist.toFixed(2)}m)`);
          }
        }
      });
    },

    /**
     * 点Pから線分(A,B)への最近接距離を計算
     */
    pointToSegmentDistance: function (p: any, a: any, b: any): number {
      const ab = new THREE.Vector3().subVectors(b, a);
      const ap = new THREE.Vector3().subVectors(p, a);
      const t = Math.max(0, Math.min(1, ap.dot(ab) / ab.dot(ab)));
      const closest = a.clone().add(ab.multiplyScalar(t));
      return p.distanceTo(closest);
    }
  });
}

// THREE はA-Frameのグローバルを使用（global.d.ts で型定義）
import { gameState } from '../../domain/gameState';

/**
 * 敵コンポーネント: 固定型（青八面体 - ラミエル風タレット）
 * 3秒チャージ後にビーム連射攻撃
 */
export function registerEnemyTurretComponent(
  updateHUD: () => void,
  checkGameClear: () => void
) {
  AFRAME.registerComponent('enemy-turret', {
    init: function () {
      // === 敵Turretビジュアル: ラミエル風 ===
      const container = new THREE.Object3D();

      // 1. 外殻: 巨大な半透明青八面体
      const shellGeo = new THREE.OctahedronGeometry(0.8, 0);
      const shellMat = new THREE.MeshPhysicalMaterial({
        color: 0x0088ff,
        transparent: true,
        opacity: 0.4,
        transmission: 0.2,
        roughness: 0,
        metalness: 0.1,
        side: THREE.DoubleSide
      });
      const shell = new THREE.Mesh(shellGeo, shellMat);
      this.shell = shell;
      container.add(shell);

      // 2. コア: 内部の輝く結晶
      const coreGeo = new THREE.OctahedronGeometry(0.3, 0);
      const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const core = new THREE.Mesh(coreGeo, coreMat);
      this.core = core;
      container.add(core);

      // 3. ワイヤーフレーム（幾何学感強調）
      const wireGeo = new THREE.WireframeGeometry(shellGeo);
      const wireMat = new THREE.LineBasicMaterial({
        color: 0x00ffff,
        transparent: true,
        opacity: 0.3
      });
      const wire = new THREE.LineSegments(wireGeo, wireMat);
      container.add(wire);

      this.el.setObject3D('mesh', container);

      this.health = 1;
      this.chargeDuration = 3000; // 3秒チャージ
      this.isCharging = false;
      this.chargeStart = 0;
      this.shootCooldown = 5000; // 5秒に一回
      this.lastShot = Date.now() - 3000;

      gameState.addEnemy(this);
    },

    tick: function (time, delta) {
      const now = Date.now();
      const camera = document.querySelector('[camera]') as any;
      if (!camera) return;

      this.el.object3D.lookAt(camera.object3D.position);

      // チャージ開始
      if (!this.isCharging && now - this.lastShot > this.shootCooldown) {
        this.isCharging = true;
        this.chargeStart = now;
      }

      // チャージ中のアニメーション
      if (this.isCharging) {
        const chargeProgress = (now - this.chargeStart) / this.chargeDuration;

        // 回転速度を上げる + 振動
        this.el.object3D.rotation.x += delta * 0.002 * (1 + chargeProgress * 10);
        this.el.object3D.rotation.y += delta * 0.002 * (1 + chargeProgress * 10);
        const shake = (Math.random() - 0.5) * 0.05 * chargeProgress;
        this.el.object3D.position.x += shake;

        // コアの色変化: 白 -> 赤
        if (this.core) {
          const r = 1;
          const g = 1 - chargeProgress;
          const b = 1 - chargeProgress;
          this.core.material.color.setRGB(r, g, b);
        }

        // チャージ完了で射撃
        if (chargeProgress >= 1) {
          this.shoot();
          this.isCharging = false;
          this.lastShot = now;

          // 色を戻す
          if (this.core) this.core.material.color.setHex(0xffffff);
        }
      } else {
        // 通常回転
        this.el.object3D.rotation.x += delta * 0.0005;
        this.el.object3D.rotation.y += delta * 0.001;
      }
    },

    shoot: function () {
      const camera = document.querySelector('[camera]') as any;
      const pos = this.el.object3D.getWorldPosition(new THREE.Vector3());
      const dir = camera.object3D.position.clone().sub(pos).normalize();

      // ビームを5連射で表現
      for (let i = 0; i < 5; i++) {
        setTimeout(() => {
          const beam = document.createElement('a-box');
          beam.setAttribute('width', '0.1');
          beam.setAttribute('height', '0.1');
          beam.setAttribute('depth', '0.3');
          beam.setAttribute('color', '#00ffff');
          beam.setAttribute('material', 'shader: flat; emissive: #00ffff; emissiveIntensity: 5');
          beam.setAttribute('position', pos);
          beam.setAttribute('projectile', `direction: ${dir.x} ${dir.y} ${dir.z}; speed: 20`);
          beam.setAttribute('enemy-bullet', '');

          document.querySelector('a-scene').appendChild(beam);
        }, i * 50);
      }
    },

    takeDamage: function () {
      this.health -= 1;
      if (this.health <= 0) {
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

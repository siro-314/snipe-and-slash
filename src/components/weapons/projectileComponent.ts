// THREE はA-Frameのグローバルを使用（global.d.ts で型定義）

/**
 * 弾丸コンポーネント
 * プレイヤーの矢・敵の弾に使用
 *
 * gravity: 重力加速度 (m/s²)。正の値で下方向に落下。
 *   gravity=0 → 直線飛行
 *   gravity>0 → 放物線飛行
 */
export function registerProjectileComponent() {
  AFRAME.registerComponent('projectile', {
    schema: {
      direction: { type: 'vec3', default: { x: 0, y: 0, z: -1 } },
      speed:     { type: 'number', default: 5 },
      gravity:   { type: 'number', default: 0 }
    },

    init: function () {
      this.velocity = new THREE.Vector3(
        this.data.direction.x,
        this.data.direction.y,
        this.data.direction.z
      ).normalize().multiplyScalar(this.data.speed);

      // 5秒後に自動削除
      setTimeout(() => {
        if (this.el.parentNode) this.el.parentNode.removeChild(this.el);
      }, 5000);
    },

    tick: function (_time: any, delta: any) {
      const dt = delta / 1000;
      // 重力: Y方向に加速度を加算
      this.velocity.y -= this.data.gravity * dt;

      const pos = this.el.object3D.position;
      pos.x += this.velocity.x * dt;
      pos.y += this.velocity.y * dt;
      pos.z += this.velocity.z * dt;

      // 進行方向に矢を向ける
      if (this.velocity.lengthSq() > 0.001) {
        const dir = this.velocity.clone().normalize();
        this.el.object3D.lookAt(
          pos.x + dir.x,
          pos.y + dir.y,
          pos.z + dir.z
        );
      }
    }
  });
}

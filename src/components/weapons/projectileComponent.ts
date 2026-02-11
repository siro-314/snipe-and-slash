import * as THREE from 'three';

/**
 * 弾丸コンポーネント
 * プレイヤーの矢・敵の弾に使用
 */
export function registerProjectileComponent() {
  AFRAME.registerComponent('projectile', {
    schema: {
      direction: { type: 'vec3', default: { x: 0, y: 0, z: -1 } },
      speed: { type: 'number', default: 5 }
    },

    init: function () {
      this.velocity = new THREE.Vector3(
        this.data.direction.x,
        this.data.direction.y,
        this.data.direction.z
      ).normalize().multiplyScalar(this.data.speed);

      // 5秒後に自動削除
      setTimeout(() => {
        if (this.el.parentNode) {
          this.el.parentNode.removeChild(this.el);
        }
      }, 5000);
    },

    tick: function (time, delta) {
      const deltaSeconds = delta / 1000;
      const pos = this.el.object3D.position;

      pos.x += this.velocity.x * deltaSeconds;
      pos.y += this.velocity.y * deltaSeconds;
      pos.z += this.velocity.z * deltaSeconds;
    }
  });
}

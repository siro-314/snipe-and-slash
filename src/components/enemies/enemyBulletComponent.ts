import { gameState } from '../../domain/gameState';
import { hudManager } from '../../managers/hudManager';

/**
 * 敵の弾丸コンポーネント
 * プレイヤーに当たったら被弾
 */
export function registerEnemyBulletComponent() {
  AFRAME.registerComponent('enemy-bullet', {
    tick: function () {
      const camera = document.querySelector('[camera]') as any;
      if (!camera) return;

      const dist = this.el.object3D.position.distanceTo(camera.object3D.position);
      if (dist < 0.3) {
        gameState.incrementHits();
        hudManager.update(gameState);

        // 弾丸削除
        if (this.el.parentNode) {
          this.el.parentNode.removeChild(this.el);
        }
      }
    }
  });
}

import { gameState } from '../../domain/gameState';

/**
 * プレイヤーの矢コンポーネント
 * 敵に当たる判定
 */
export function registerPlayerArrowComponent() {
  AFRAME.registerComponent('player-arrow', {
    tick: function () {
      const arrowPos = this.el.object3D.position;

      gameState.getEnemies().forEach(enemy => {
        if (!enemy.el) return;

        const enemyPos = enemy.el.object3D.position;
        const distance = arrowPos.distanceTo(enemyPos);

        if (distance < 0.5) {
          enemy.takeDamage();

          // 矢を削除
          if (this.el.parentNode) {
            this.el.parentNode.removeChild(this.el);
          }
        }
      });
    }
  });
}

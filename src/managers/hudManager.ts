/**
 * HUD（Heads-Up Display）管理
 * - UI要素の更新
 * - 安全なDOM操作
 * - nullチェック完備
 */

import type { GameStateManager } from '../domain/gameState';

export class HUDManager {
  private killsElement: HTMLElement | null = null;
  private hitsElement: HTMLElement | null = null;
  private accuracyElement: HTMLElement | null = null;

  /**
   * HUD要素を初期化
   */
  init(): void {
    this.killsElement = document.getElementById('kills');
    this.hitsElement = document.getElementById('hits');
    this.accuracyElement = document.getElementById('accuracy');

    if (!this.killsElement || !this.hitsElement || !this.accuracyElement) {
      console.warn('[HUD] Some HUD elements not found');
    } else {
      console.log('[HUD] Initialized successfully');
    }
  }

  /**
   * GameStateからHUDを更新
   * @param gameState ゲーム状態
   */
  update(gameState: GameStateManager): void {
    const kills = gameState.getKills();
    const hits = gameState.getHits();
    const accuracy = gameState.getAccuracy();

    if (this.killsElement) {
      this.killsElement.textContent = kills.toString();
    }

    if (this.hitsElement) {
      this.hitsElement.textContent = hits.toString();
    }

    if (this.accuracyElement) {
      this.accuracyElement.textContent = `${accuracy}%`;
    }
  }

  /**
   * 個別要素の更新
   */
  updateKills(value: number): void {
    if (this.killsElement) {
      this.killsElement.textContent = value.toString();
    }
  }

  updateHits(value: number): void {
    if (this.hitsElement) {
      this.hitsElement.textContent = value.toString();
    }
  }

  updateAccuracy(value: number): void {
    if (this.accuracyElement) {
      this.accuracyElement.textContent = `${value}%`;
    }
  }

  /**
   * HUDをリセット
   */
  reset(): void {
    this.updateKills(0);
    this.updateHits(0);
    this.updateAccuracy(0);
  }

  /**
   * デバッグ用：HUD状態を表示
   */
  debug(): void {
    console.log('[HUD]', {
      killsElement: !!this.killsElement,
      hitsElement: !!this.hitsElement,
      accuracyElement: !!this.accuracyElement
    });
  }
}

// シングルトンインスタンスをエクスポート
export const hudManager = new HUDManager();

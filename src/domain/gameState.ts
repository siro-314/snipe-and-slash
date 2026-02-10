/**
 * ゲーム状態管理
 * - Pure State Management（副作用なし）
 * - イベント駆動設計の準備
 */

import type { Enemy, Projectile } from './types';

export interface GameStateData {
  kills: number;
  hits: number;
  enemies: Enemy[];
  projectiles: Projectile[];
  isGameStarted: boolean;
  startTime: number; // ゲーム開始時刻
  currentWeapon: 'sword' | 'bow';
  activeHand: 'left' | 'right';
}

/**
 * ゲーム状態を管理するクラス
 * 将来的にEventEmitterを継承して、状態変更をイベント通知できるようにする
 */
export class GameStateManager {
  private state: GameStateData;

  constructor() {
    this.state = {
      kills: 0,
      hits: 0,
      enemies: [],
      projectiles: [],
      isGameStarted: false,
      startTime: Date.now(),
      currentWeapon: 'sword',
      activeHand: 'right'
    };
  }

  // ========================================
  // Getters（状態取得）
  // ========================================

  getState(): Readonly<GameStateData> {
    return { ...this.state };
  }

  getKills(): number {
    return this.state.kills;
  }

  getHits(): number {
    return this.state.hits;
  }

  getEnemies(): ReadonlyArray<Enemy> {
    return [...this.state.enemies];
  }

  getProjectiles(): ReadonlyArray<Projectile> {
    return [...this.state.projectiles];
  }

  isStarted(): boolean {
    return this.state.isGameStarted;
  }

  getAccuracy(): number {
    if (this.state.hits === 0) return 0;
    return Math.round((this.state.kills / this.state.hits) * 100);
  }

  getStartTime(): number {
    return this.state.startTime;
  }

  getCurrentWeapon(): 'sword' | 'bow' {
    return this.state.currentWeapon;
  }

  getActiveHand(): 'left' | 'right' {
    return this.state.activeHand;
  }

  // ========================================
  // Setters（状態変更）
  // ========================================

  incrementKills(): void {
    this.state.kills++;
  }

  incrementHits(): void {
    this.state.hits++;
  }

  addEnemy(enemy: Enemy): void {
    this.state.enemies.push(enemy);
  }

  removeEnemy(enemy: Enemy): void {
    const index = this.state.enemies.indexOf(enemy);
    if (index > -1) {
      this.state.enemies.splice(index, 1);
    }
  }

  addProjectile(projectile: Projectile): void {
    this.state.projectiles.push(projectile);
  }

  removeProjectile(projectile: Projectile): void {
    const index = this.state.projectiles.indexOf(projectile);
    if (index > -1) {
      this.state.projectiles.splice(index, 1);
    }
  }

  setCurrentWeapon(weapon: 'sword' | 'bow'): void {
    this.state.currentWeapon = weapon;
  }

  setActiveHand(hand: 'left' | 'right'): void {
    this.state.activeHand = hand;
  }

  startGame(): void {
    this.state.isGameStarted = true;
  }

  resetGame(): void {
    this.state = {
      kills: 0,
      hits: 0,
      enemies: [],
      projectiles: [],
      isGameStarted: false,
      startTime: Date.now(),
      currentWeapon: 'sword',
      activeHand: 'right'
    };
  }

  // ========================================
  // ユーティリティ
  // ========================================

  /**
   * デバッグ用：状態をコンソールに出力
   */
  debug(): void {
    console.log('[GameState]', {
      kills: this.state.kills,
      hits: this.state.hits,
      accuracy: this.getAccuracy() + '%',
      enemyCount: this.state.enemies.length,
      projectileCount: this.state.projectiles.length,
      isStarted: this.state.isGameStarted
    });
  }
}

// シングルトンインスタンスをエクスポート
export const gameState = new GameStateManager();

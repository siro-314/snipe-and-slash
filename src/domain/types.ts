/**
 * SNIPE & SLASH - 型定義
 * 
 * このファイルはプロジェクト全体で使用される型定義を提供します。
 */

// ========================================
// ゲーム状態関連の型
// ========================================

/**
 * 武器の種類
 */
export type WeaponType = 'sword' | 'bow';

/**
 * 操作する手
 */
export type HandType = 'left' | 'right';

/**
 * ゲームの状態を管理する型
 */
export interface GameStateType {
  /** 倒した敵の数 */
  kills: number;
  
  /** 被弾数 */
  hits: number;
  
  /** ゲーム開始時刻（ミリ秒） */
  startTime: number;
  
  /** 敵のリスト */
  enemies: Enemy[];
  
  /** 弾丸のリスト */
  projectiles: Projectile[];
  
  /** 現在の武器 */
  currentWeapon: WeaponType;
  
  /** アクティブな手 */
  activeHand: HandType;
}

// ========================================
// エンティティ関連の型
// ========================================

/**
 * 敵の基本情報
 */
export interface Enemy {
  /** エンティティ要素 */
  el: any; // A-Frameエンティティ（型定義複雑のためany）
  
  /** 体力 */
  health: number;
  
  /** 敵のタイプ */
  type: 'white' | 'black' | 'turret';
  
  /** ダメージを受ける関数 */
  takeDamage: () => void;
  
  /** 最終被弾時刻（多段ヒット防止用） */
  lastHitTime?: number;
}

/**
 * 弾丸の基本情報
 */
export interface Projectile {
  /** エンティティ要素 */
  el: any; // A-Frameエンティティ（型定義複雑のためany）
  
  /** 発射元（'player' または 'enemy'） */
  source: 'player' | 'enemy';
}

// ========================================
// モデル管理関連の型
// ========================================

/**
 * GLBモデル名
 */
export type ModelName = 'drone_white' | 'drone_black' | 'sword';

/**
 * モデルマネージャーの型
 */
export interface ModelManagerType {
  /** ロード済みモデルのマップ */
  models: Record<string, THREE.Object3D>;
  
  /** GLTFローダー */
  loader: any | null; // GLTFLoader型は実行時にインポート
  
  /** 初期化 */
  init(): void;
  
  /** モデルをロード */
  load(name: ModelName, url: string): Promise<THREE.Object3D>;
  
  /** モデルのクローンを取得 */
  getClone(name: ModelName): THREE.Object3D | null;
}

// ========================================
// A-Frameコンポーネント関連の型
// ========================================

/**
 * 剣コンポーネントのデータ型
 */
export interface SwordComponentData {
  /** どちらの手で持つか */
  hand: HandType;
}

/**
 * 敵AIコンポーネントのデータ型
 */
export interface EnemyAIData {
  /** 敵のタイプ */
  type: 'white' | 'black' | 'turret';
  
  /** 移動速度 */
  speed?: number;
  
  /** 射撃間隔（ミリ秒） */
  shootInterval?: number;
}

/**
 * 弾丸コンポーネントのデータ型
 */
export interface ProjectileData {
  /** 移動速度 */
  speed: number;
  
  /** 発射元 */
  source: 'player' | 'enemy';
  
  /** 方向ベクトル */
  direction: THREE.Vector3;
}

// ========================================
// ユーティリティ型
// ========================================

/**
 * Vector3の代替型（簡易版）
 */
export interface Vector3Like {
  x: number;
  y: number;
  z: number;
}

/**
 * 色の型（CSSカラー文字列）
 */
export type ColorString = string;

/**
 * スコア計算の結果
 */
export interface ScoreResult {
  /** 基本スコア */
  baseScore: number;
  
  /** 被弾ペナルティ */
  hitPenalty: number;
  
  /** 時間ペナルティ */
  timePenalty: number;
  
  /** 最終スコア */
  finalScore: number;
}

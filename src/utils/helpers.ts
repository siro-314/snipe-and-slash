/**
 * ユーティリティ関数
 * - 共通処理の集約
 * - Pure関数（副作用なし）
 */

import * as THREE from 'three';

/**
 * Blenderから移植したモデルの座標・回転を補正
 * @param object Three.jsオブジェクト
 */
export function applyBlenderCorrection(object: THREE.Object3D): void {
  // Blenderの座標系（Z-up）をThree.js（Y-up）に変換
  object.rotation.x = -Math.PI / 2;
  console.log('[Utils] Applied Blender correction');
}

/**
 * 2つのオブジェクト間の距離を計算
 * @param obj1 オブジェクト1
 * @param obj2 オブジェクト2
 * @returns 距離
 */
export function getDistance(obj1: THREE.Object3D, obj2: THREE.Object3D): number {
  return obj1.position.distanceTo(obj2.position);
}

/**
 * オブジェクトが範囲内にいるか判定
 * @param obj1 オブジェクト1
 * @param obj2 オブジェクト2
 * @param range 範囲
 * @returns 範囲内ならtrue
 */
export function isInRange(obj1: THREE.Object3D, obj2: THREE.Object3D, range: number): boolean {
  return getDistance(obj1, obj2) <= range;
}

/**
 * ランダムな位置を生成（敵スポーン用）
 * @param radius 半径
 * @param height 高さ
 * @returns THREE.Vector3
 */
export function getRandomSpawnPosition(radius: number = 15, height: number = 1.6): THREE.Vector3 {
  const angle = Math.random() * Math.PI * 2;
  const distance = 5 + Math.random() * radius;
  
  return new THREE.Vector3(
    Math.cos(angle) * distance,
    height,
    Math.sin(angle) * distance
  );
}

/**
 * ランダムな整数を生成
 * @param min 最小値
 * @param max 最大値
 * @returns ランダムな整数
 */
export function getRandomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * ランダムな浮動小数点数を生成
 * @param min 最小値
 * @param max 最大値
 * @returns ランダムな浮動小数点数
 */
export function getRandomFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

/**
 * 配列からランダムに要素を選択
 * @param array 配列
 * @returns ランダムな要素
 */
export function getRandomElement<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

/**
 * デバッグ用：オブジェクトの位置をログ出力
 * @param name オブジェクト名
 * @param obj Three.jsオブジェクト
 */
export function debugPosition(name: string, obj: THREE.Object3D): void {
  console.log(`[Debug] ${name} position:`, {
    x: obj.position.x.toFixed(2),
    y: obj.position.y.toFixed(2),
    z: obj.position.z.toFixed(2)
  });
}

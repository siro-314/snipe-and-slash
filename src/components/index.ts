/**
 * コンポーネント統合インデックス
 * 全てのA-Frameコンポーネントをここで登録
 */

// 武器コンポーネント
export { registerSwordComponent } from './weapons/swordComponent';
export { registerProjectileComponent } from './weapons/projectileComponent';
export { registerPlayerArrowComponent } from './weapons/playerArrowComponent';

// 敵コンポーネント
export { registerEnemyMobileComponent } from './enemies/enemyMobileComponent';
export { registerEnemyBulletComponent } from './enemies/enemyBulletComponent';
export { registerEnemyTurretComponent } from './enemies/enemyTurretComponent';
export { registerEnemyDroneBlackComponent } from './enemies/enemyDroneBlackComponent';

// コントローラーコンポーネント
export { registerWeaponControllerComponent } from './weaponControllerComponent';

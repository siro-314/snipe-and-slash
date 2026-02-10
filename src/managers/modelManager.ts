/**
 * GLBモデル管理
 * - Three.js GLTFLoaderを使用
 * - モデルのロード・キャッシュ・クローン生成
 * - エラーハンドリング・フォールバック
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export interface ModelManagerType {
  loader: GLTFLoader | null;
  models: Record<string, THREE.Group>;
  init(): void;
  load(name: string, url: string): Promise<THREE.Group>;
  getClone(name: string): THREE.Group | null;
}

/**
 * モデル管理クラス
 * - シングルトンパターン
 * - Promise-based非同期ロード
 * - 詳細なエラーログ
 */
export class ModelManagerClass implements ModelManagerType {
  loader: GLTFLoader | null = null;
  models: Record<string, THREE.Group> = {};

  /**
   * GLTFLoaderを初期化
   */
  init(): void {
    this.loader = new GLTFLoader();
    console.log('[ModelManager] GLTFLoader initialized');
  }

  /**
   * GLBモデルをロード
   * @param name モデル名（キャッシュキー）
   * @param url GLBファイルのパス
   * @returns ロードされたモデル
   */
  async load(name: string, url: string): Promise<THREE.Group> {
    return new Promise((resolve, reject) => {
      if (!this.loader) {
        const err = new Error(`[ModelManager] Loader not initialized for ${name}`);
        console.error(err.message);
        reject(err);
        return;
      }

      console.log(`[ModelManager] Loading ${name} from ${url}...`);

      this.loader.load(
        url,
        (gltf) => {
          console.log(`[ModelManager] ✅ ${name} loaded successfully`);
          this.models[name] = gltf.scene;
          resolve(gltf.scene);
        },
        (progress) => {
          if (progress.lengthComputable) {
            const percentComplete = (progress.loaded / progress.total) * 100;
            console.log(`[ModelManager] ${name}: ${percentComplete.toFixed(1)}%`);
          }
        },
        (error) => {
          console.error(`[ModelManager] ❌ Failed to load ${name}:`, error);
          reject(error);
        }
      );
    });
  }

  /**
   * キャッシュされたモデルのクローンを取得
   * @param name モデル名
   * @returns クローンされたモデル（存在しない場合はnull）
   */
  getClone(name: string): THREE.Group | null {
    const model = this.models[name];
    if (!model) {
      console.warn(`[ModelManager] Model '${name}' not found in cache`);
      return null;
    }

    const clone = model.clone();
    
    // マテリアルもディープクローン
    clone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        if (mesh.material) {
          mesh.material = Array.isArray(mesh.material)
            ? mesh.material.map(mat => mat.clone())
            : mesh.material.clone();
        }
      }
    });

    console.log(`[ModelManager] Cloned ${name}`);
    return clone;
  }

  /**
   * デバッグ用：ロード済みモデルリストを表示
   */
  debug(): void {
    console.log('[ModelManager] Loaded models:', Object.keys(this.models));
  }

  /**
   * 全モデルをアンロード（メモリ解放）
   */
  clear(): void {
    Object.keys(this.models).forEach(name => {
      this.models[name].traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          if (mesh.geometry) mesh.geometry.dispose();
          if (mesh.material) {
            if (Array.isArray(mesh.material)) {
              mesh.material.forEach(mat => mat.dispose());
            } else {
              mesh.material.dispose();
            }
          }
        }
      });
    });
    this.models = {};
    console.log('[ModelManager] All models cleared');
  }
}

// シングルトンインスタンスをエクスポート
export const modelManager = new ModelManagerClass();

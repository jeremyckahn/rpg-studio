import * as PIXI from 'pixi.js';

export class TextureManager {
  private static instance: TextureManager;
  private readonly textures: Map<string, PIXI.Texture> = new Map();

  public static getInstance(): TextureManager {
    if (!TextureManager.instance) {
      TextureManager.instance = new TextureManager();
    }
    return TextureManager.instance;
  }

  public registerTexture(key: string, texture: PIXI.Texture): void {
    if (texture.baseTexture) {
      texture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
    }
    this.textures.set(key, texture);
  }

  public getTexture(key: string): PIXI.Texture | undefined {
    return this.textures.get(key);
  }

  public hasTexture(key: string): boolean {
    return this.textures.has(key);
  }

  public async loadTexture(key: string, url: string): Promise<PIXI.Texture> {
    const texture = await PIXI.Assets.load<PIXI.Texture>(url);
    if (texture.baseTexture) {
      texture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
    }
    this.textures.set(key, texture);
    return texture;
  }

  public async invalidateTexture(key?: string): Promise<void> {
    if (key) {
      const existing = this.textures.get(key);
      if (existing) {
        existing.destroy(true);
        this.textures.delete(key);
      }
      if (PIXI.Assets.cache.has(key)) {
        PIXI.Assets.cache.reset();
      }
    } else {
      for (const tex of this.textures.values()) {
        tex.destroy(true);
      }
      this.textures.clear();
      PIXI.Assets.cache.reset();
    }
  }
}

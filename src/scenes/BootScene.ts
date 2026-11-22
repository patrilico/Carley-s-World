import Phaser from 'phaser';
import { paintFinish, paintGround, paintHills, paintLights } from '../render/art';
import { paintFurniture, paintHouse } from '../render/houseArt';

/** Paints all static vector art into textures, then starts the world. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create(): void {
    paintLights(this);
    paintHills(this);
    paintHouse(this);
    paintFurniture(this);
    paintGround(this);
    paintFinish(this);
    this.scene.start('WorldScene');
  }
}

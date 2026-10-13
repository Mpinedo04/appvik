import { describe, expect, it } from 'vitest';
import { localToWorld } from '../core/model/geometry';
import type { Rotation } from '../core/model/types';
import { S, localToScene } from './layout';

describe('correspondencia 2D → 3D', () => {
  it('cualquier punto local cae bajo su posición del esquema con todos los giros y reflejos', () => {
    const local = { x: 50, y: -30 };
    for (const rot of [0, 90, 180, 270] as Rotation[]) {
      for (const flip of [false, true]) {
        const c = { x: 120, y: 340, rot, flip };
        const w = localToWorld(c, local);
        const [x, z] = localToScene(c, local);
        expect(x).toBeCloseTo(w.x * S, 9);
        expect(z).toBeCloseTo(w.y * S, 9);
      }
    }
  });
});

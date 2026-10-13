/**
 * Accionamientos en 3D (unidades de dibujo). Se dibujan hacia −X desde x = 0 y el lado
 * derecho se refleja. Se montan en el extremo de la corredera y se mueven con ella.
 */
import { AXIS_Y } from '../../view3d/layout';
import { box, cylX, cylZ, sphere } from '../../view3d/geom';
import { Part } from '../parts3d';

export function Actuator3D({ type, engaged }: { type: string; engaged: boolean }) {
  const y = AXIS_Y;
  switch (type) {
    case 'pushbutton':
      return (
        <group>
          <Part geom={cylX(2, 10)} mat="steel" position={[-5, y, 0]} />
          <Part geom={cylX(7.5, 4)} mat="red" position={[-12, y, 0]} />
          <Part geom={sphere(5)} mat="red" position={[-13, y, 0]} scale={[0.45, 1, 1]} />
        </group>
      );
    case 'servo':
      return (
        <group>
          <Part geom={box(8, 14, 14)} mat="anodizedBlue" position={[-4, y, 0]} />
          <Part geom={cylX(2, 6)} mat="steel" position={[-11, y, 0]} />
          <Part geom={cylX(7, 4)} mat="black" position={[-16, y, 0]} />
        </group>
      );
    case 'lever':
      return (
        <group>
          <Part geom={cylX(2, 10)} mat="steel" position={[-5, y, 0]} />
          <Part geom={cylZ(3, 8)} mat="black" position={[-11, y, 0]} />
          <group position={[-11, y, 0]} rotation={[0, 0, engaged ? -0.6 : 0.6]}>
            <Part
              geom={cylX(1.3, 22)}
              mat="steel"
              position={[0, 11, 0]}
              rotation={[0, 0, Math.PI / 2]}
            />
            <Part geom={sphere(3.4)} mat="black" position={[0, 22, 0]} />
          </group>
          {/* Enclavamiento: muesca con bola */}
          <Part geom={box(8, 3, 6)} mat="aluminium" position={[-4, y + 6, 0]} />
        </group>
      );
    case 'pedal':
      return (
        <group>
          <Part geom={cylX(2, 10)} mat="steel" position={[-5, y, 0]} />
          <group position={[-12, y - 4, 0]} rotation={[0, 0, engaged ? -0.15 : 0.25]}>
            <Part geom={box(24, 2, 16)} mat="black" position={[-10, 0, 0]} />
          </group>
        </group>
      );
    case 'roller':
      return (
        <group>
          <Part geom={cylX(2, 10)} mat="steel" position={[-5, y, 0]} />
          <Part geom={box(4, 8, 8)} mat="aluminium" position={[-11, y, 0]} />
          <Part geom={cylZ(4.5, 3)} mat="black" position={[-16, y, 0]} />
        </group>
      );
    case 'roller-oneway':
      return (
        <group>
          <Part geom={cylX(2, 8)} mat="steel" position={[-4, y, 0]} />
          <group position={[-8, y, 0]} rotation={[0, 0, engaged ? 0 : -0.5]}>
            <Part geom={box(10, 2, 3)} mat="steel" position={[-5, 0, 0]} />
            <Part geom={cylZ(3.8, 3)} mat="black" position={[-11, 0, 0]} />
          </group>
        </group>
      );
    default:
      return null;
  }
}

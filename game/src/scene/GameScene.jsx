import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { CameraControls } from '@react-three/drei';
import { createGame, getGame } from '../game/engine';

// models are loaded up front (scene/models.js) and handed in ready to use
export default function GameScene({ layout, meta, models }) {
  const { scene, camera, gl } = useThree();
  const controls = useRef();

  useEffect(() => {
    const { house, bhaiya, honey, maa, baba } = models;
    createGame({
      scene, camera, gl, controls: controls.current, house, layout, meta,
      chars: { bhaiya, honey, maa, baba },
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useFrame((_, dt) => getGame()?.update(dt));

  return (
    <>
      <CameraControls ref={controls} makeDefault />
      <hemisphereLight args={['#e6eeff', '#b8977a', 0.8]} />
      <directionalLight
        castShadow
        position={[-11, 15, 21]}
        intensity={2.3}
        color="#ffe2ba"
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
      >
        <orthographicCamera attach="shadow-camera" args={[-22, 22, 22, -22, 1, 80]} />
      </directionalLight>
    </>
  );
}

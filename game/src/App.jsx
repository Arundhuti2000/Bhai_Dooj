import { useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import GameScene from './scene/GameScene';
import Overlays from './ui/Overlays';
import { loadModels } from './scene/models';

export default function App() {
  const [data, setData] = useState(null);
  useEffect(() => {
    const get = (f) => fetch(import.meta.env.BASE_URL + f).then((r) => r.json());
    Promise.all([get('layout.json'), get('characters.json'), loadModels()])
      .then(([layout, meta, models]) => setData({ layout, meta, models }));
  }, []);
  return (
    <>
      <Canvas
        shadows
        dpr={[1, 2]}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        camera={{ fov: 50, near: 0.05, far: 500, position: [16, 14, 20] }}
      >
        {data && <GameScene layout={data.layout} meta={data.meta} models={data.models} />}
      </Canvas>
      <Overlays />
    </>
  );
}

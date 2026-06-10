import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const MAT_PROPS = { color: '#8899aa', roughness: 0.55, metalness: 0.1 };

// Reusable helpers
function S({ r = 0.1, seg = 16, pos, children }) {
  return (
    <mesh position={pos}>
      <sphereGeometry args={[r, seg, seg]} />
      {children}
    </mesh>
  );
}

function Cyl({ top, bot, h, seg = 16, pos, rot, children }) {
  return (
    <mesh position={pos} rotation={rot}>
      <cylinderGeometry args={[top, bot, h, seg]} />
      {children}
    </mesh>
  );
}

function Cap({ r, len, seg = 8, rseg = 16, pos, rot, children }) {
  return (
    <mesh position={pos} rotation={rot}>
      <capsuleGeometry args={[r, len, seg, rseg]} />
      {children}
    </mesh>
  );
}

function Hand({ side }) {
  const s = side === 'L' ? -1 : 1;
  const x = s * 0.53;
  const mat = <meshStandardMaterial {...MAT_PROPS} />;

  // 4 fingers spread across palm width
  const fingerOffsets = [-0.034, -0.011, 0.012, 0.035];
  const fingerLengths = [0.055, 0.062, 0.058, 0.048];

  return (
    <group>
      {/* Palm */}
      <mesh position={[x, 0.04, 0.01]}>
        <boxGeometry args={[0.09, 0.07, 0.022]} />
        {mat}
      </mesh>
      {/* Fingers */}
      {fingerOffsets.map((xOff, i) => (
        <Cap key={i} r={0.013} len={fingerLengths[i]} seg={4} rseg={8}
          pos={[x + xOff, -0.012, 0.01]}
          rot={[0, 0, 0]}
        >{mat}</Cap>
      ))}
      {/* Thumb */}
      <Cap r={0.015} len={0.042} seg={4} rseg={8}
        pos={[x + s * 0.058, 0.025, 0.015]}
        rot={[0, 0, s * 0.7]}
      >{mat}</Cap>
    </group>
  );
}

function FigureMesh({ rotate }) {
  const groupRef = useRef();

  useFrame((_, delta) => {
    if (rotate && groupRef.current) {
      groupRef.current.rotation.y += delta * 0.55;
    }
  });

  const mat = <meshStandardMaterial {...MAT_PROPS} />;

  return (
    <group ref={groupRef} position={[0, -0.55, 0]}>

      {/* ── HEAD ── */}
      <S r={0.16} seg={24} pos={[0, 1.52, 0]}>{mat}</S>

      {/* ── NECK ── */}
      <Cyl top={0.06} bot={0.075} h={0.16} pos={[0, 1.32, 0]}>{mat}</Cyl>

      {/* ── TORSO ── */}
      {/* Chest — tapers from wide shoulder to waist */}
      <Cyl top={0.33} bot={0.25} h={0.48} seg={20} pos={[0, 0.96, 0]}>{mat}</Cyl>
      {/* Abdomen */}
      <Cyl top={0.25} bot={0.22} h={0.24} seg={16} pos={[0, 0.60, 0]}>{mat}</Cyl>
      {/* Pelvis — wider at hips */}
      <Cyl top={0.22} bot={0.26} h={0.28} seg={16} pos={[0, 0.34, 0]}>{mat}</Cyl>

      {/* ── LEFT ARM ── */}
      <S r={0.11} seg={14} pos={[-0.41, 1.18, 0]}>{mat}</S>
      <Cap r={0.072} len={0.30} pos={[-0.46, 0.88, 0]} rot={[0, 0, Math.PI * 0.067]}>{mat}</Cap>
      <S r={0.065} seg={12} pos={[-0.50, 0.62, 0]}>{mat}</S>
      <Cap r={0.055} len={0.26} pos={[-0.52, 0.37, 0]} rot={[0, 0, Math.PI * 0.03]}>{mat}</Cap>
      <S r={0.048} seg={10} pos={[-0.53, 0.14, 0]}>{mat}</S>

      {/* ── RIGHT ARM ── */}
      <S r={0.11} seg={14} pos={[0.41, 1.18, 0]}>{mat}</S>
      <Cap r={0.072} len={0.30} pos={[0.46, 0.88, 0]} rot={[0, 0, -Math.PI * 0.067]}>{mat}</Cap>
      <S r={0.065} seg={12} pos={[0.50, 0.62, 0]}>{mat}</S>
      <Cap r={0.055} len={0.26} pos={[0.52, 0.37, 0]} rot={[0, 0, -Math.PI * 0.03]}>{mat}</Cap>
      <S r={0.048} seg={10} pos={[0.53, 0.14, 0]}>{mat}</S>

      {/* ── HANDS ── */}
      <Hand side="L" />
      <Hand side="R" />

      {/* ── LEFT LEG ── */}
      <S r={0.10} seg={12} pos={[-0.19, 0.10, 0]}>{mat}</S>
      <Cap r={0.105} len={0.42} pos={[-0.19, -0.22, 0]}>{mat}</Cap>
      <S r={0.090} seg={12} pos={[-0.19, -0.52, 0]}>{mat}</S>
      <Cap r={0.075} len={0.38} pos={[-0.19, -0.80, 0]}>{mat}</Cap>
      <S r={0.065} seg={10} pos={[-0.19, -1.04, 0]}>{mat}</S>
      <mesh position={[-0.19, -1.10, 0.06]}>
        <boxGeometry args={[0.11, 0.065, 0.24]} />
        {mat}
      </mesh>

      {/* ── RIGHT LEG ── */}
      <S r={0.10} seg={12} pos={[0.19, 0.10, 0]}>{mat}</S>
      <Cap r={0.105} len={0.42} pos={[0.19, -0.22, 0]}>{mat}</Cap>
      <S r={0.090} seg={12} pos={[0.19, -0.52, 0]}>{mat}</S>
      <Cap r={0.075} len={0.38} pos={[0.19, -0.80, 0]}>{mat}</Cap>
      <S r={0.065} seg={10} pos={[0.19, -1.04, 0]}>{mat}</S>
      <mesh position={[0.19, -1.10, 0.06]}>
        <boxGeometry args={[0.11, 0.065, 0.24]} />
        {mat}
      </mesh>
    </group>
  );
}

function HitBox({ onHover, onUnhover }) {
  return (
    <mesh position={[0, -0.15, 0]} onPointerEnter={onHover} onPointerLeave={onUnhover}>
      <boxGeometry args={[1.2, 2.9, 0.9]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

export default function HumanFigure({ rotate = false, onHover, onUnhover }) {
  return (
    <Canvas
      style={{ position: 'absolute', inset: 0, background: 'transparent' }}
      camera={{ position: [0, 0.1, 4.2], fov: 44 }}
      gl={{ alpha: true }}
    >
      <ambientLight intensity={0.35} />
      <directionalLight position={[2, 4, 3]} intensity={1.2} />
      <pointLight position={[-3, 2, 1]} intensity={0.5} color="#90c0ff" />
      <pointLight position={[1, -1, 3]} intensity={0.3} color="#ffd090" />

      {onHover && <HitBox onHover={onHover} onUnhover={onUnhover} />}
      <FigureMesh rotate={rotate} />
    </Canvas>
  );
}

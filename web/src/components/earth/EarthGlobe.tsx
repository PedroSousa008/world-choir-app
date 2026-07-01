import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import type { PledgeLight } from '../types';

const EARTH_TEXTURE = 'https://unpkg.com/three-globe@2.31.1/example/img/earth-night.jpg';
const BUMP_TEXTURE = 'https://unpkg.com/three-globe@2.31.1/example/img/earth-topology.png';
const CLOUDS_TEXTURE = 'https://unpkg.com/three-globe@2.31.1/example/img/earth-clouds.png';

/** Full rotation in ~10 minutes */
const ROTATION_PERIOD_SEC = 600;

function latLngToPosition(lat: number, lng: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

function hashOffset(id: string): { lat: number; lng: number } {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 1000;
  return { lat: ((h % 17) - 8) * 0.015, lng: (((h * 7) % 17) - 8) * 0.015 };
}

interface SceneProps {
  lights: PledgeLight[];
  pulsePhase: number;
  newLightId: string | null;
}

function EarthScene({ lights, pulsePhase, newLightId }: SceneProps) {
  const groupRef = useRef<THREE.Group>(null);
  const atmosphereRef = useRef<THREE.Mesh>(null);
  const cloudsRef = useRef<THREE.Mesh>(null);
  const breatheRef = useRef(0);

  const [earthMap, bumpMap, cloudsMap] = useTexture([EARTH_TEXTURE, BUMP_TEXTURE, CLOUDS_TEXTURE]);

  const lightPositions = useMemo(() => {
    return lights.map((light) => {
      const offset = hashOffset(light.id);
      return latLngToPosition(
        light.latitude + offset.lat,
        light.longitude + offset.lng,
        1.012
      );
    });
  }, [lights]);

  useFrame((state, delta) => {
    breatheRef.current += delta;

    if (groupRef.current) {
      groupRef.current.rotation.y += (Math.PI * 2 * delta) / ROTATION_PERIOD_SEC;
    }

    if (cloudsRef.current) {
      cloudsRef.current.rotation.y += delta * 0.015;
    }

    if (atmosphereRef.current) {
      const breathe = 1 + Math.sin(breatheRef.current * 0.8) * 0.012;
      const pulse = pulsePhase > 0 ? 1 + Math.sin(pulsePhase * Math.PI) * 0.04 : 0;
      const scale = 1.06 * breathe + pulse;
      atmosphereRef.current.scale.setScalar(scale);
    }
  });

  return (
    <group ref={groupRef}>
      <ambientLight intensity={0.35} />
      <directionalLight position={[4, 2, 4]} intensity={0.9} color="#a8c8ff" />
      <directionalLight position={[-3, -1, -2]} intensity={0.15} color="#1a3050" />

      <mesh>
        <sphereGeometry args={[1, 64, 64]} />
        <meshStandardMaterial
          map={earthMap}
          bumpMap={bumpMap}
          bumpScale={0.04}
          roughness={0.85}
          metalness={0.05}
        />
      </mesh>

      <mesh ref={cloudsRef}>
        <sphereGeometry args={[1.008, 48, 48]} />
        <meshStandardMaterial
          map={cloudsMap}
          transparent
          opacity={0.18}
          depthWrite={false}
        />
      </mesh>

      <mesh ref={atmosphereRef}>
        <sphereGeometry args={[1, 48, 48]} />
        <meshBasicMaterial
          color="#4a90d9"
          transparent
          opacity={0.08}
          side={THREE.BackSide}
          depthWrite={false}
        />
      </mesh>

      {lightPositions.map((pos, i) => {
        const light = lights[i];
        const isNew = light.id === newLightId;
        return (
          <mesh key={light.id} position={pos}>
            <sphereGeometry args={[isNew ? 0.014 : 0.009, 8, 8]} />
            <meshBasicMaterial
              color={isNew ? '#fff8e0' : '#7ec8f0'}
              transparent
              opacity={isNew ? 1 : 0.92}
            />
          </mesh>
        );
      })}
    </group>
  );
}

interface Props {
  lights: PledgeLight[];
  pulsePhase: number;
  newLightId: string | null;
  className?: string;
}

export function EarthGlobe({ lights, pulsePhase, newLightId, className }: Props) {
  return (
    <div className={className} aria-hidden>
      <Canvas
        camera={{ position: [0, 0.15, 2.6], fov: 42 }}
        dpr={[1, 1.75]}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        style={{ background: 'transparent' }}
      >
        <EarthScene lights={lights} pulsePhase={pulsePhase} newLightId={newLightId} />
      </Canvas>
    </div>
  );
}

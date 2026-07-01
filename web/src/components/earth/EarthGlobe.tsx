import { Suspense, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import type { PledgeLight } from '../../types';
import './EarthGlobe.css';

const EARTH_TEXTURE = 'https://unpkg.com/three-globe@2.31.1/example/img/earth-night.jpg';
const BUMP_TEXTURE = 'https://unpkg.com/three-globe@2.31.1/example/img/earth-topology.png';
const CLOUDS_TEXTURE = 'https://unpkg.com/three-globe@2.31.1/example/img/earth-clouds.png';

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

  useFrame((_, delta) => {
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
      atmosphereRef.current.scale.setScalar(1.06 * breathe + pulse);
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
        <meshStandardMaterial map={cloudsMap} transparent opacity={0.18} depthWrite={false} />
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

function EarthFallbackSphere() {
  const groupRef = useRef<THREE.Group>(null);
  const atmosphereRef = useRef<THREE.Mesh>(null);
  const breatheRef = useRef(0);

  useFrame((_, delta) => {
    breatheRef.current += delta;
    if (groupRef.current) {
      groupRef.current.rotation.y += (Math.PI * 2 * delta) / ROTATION_PERIOD_SEC;
    }
    if (atmosphereRef.current) {
      const breathe = 1 + Math.sin(breatheRef.current * 0.8) * 0.012;
      atmosphereRef.current.scale.setScalar(1.06 * breathe);
    }
  });

  return (
    <group ref={groupRef}>
      <ambientLight intensity={0.4} />
      <directionalLight position={[4, 2, 4]} intensity={0.8} color="#a8c8ff" />
      <mesh>
        <sphereGeometry args={[1, 48, 48]} />
        <meshStandardMaterial color="#1a3a5c" emissive="#0a2040" emissiveIntensity={0.4} roughness={0.9} />
      </mesh>
      <mesh ref={atmosphereRef}>
        <sphereGeometry args={[1, 32, 32]} />
        <meshBasicMaterial color="#4a90d9" transparent opacity={0.1} side={THREE.BackSide} />
      </mesh>
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
    <div className={`earth-globe-wrap ${className ?? ''}`} aria-hidden>
      <Canvas
        camera={{ position: [0, 0.15, 2.6], fov: 42 }}
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        style={{ background: 'transparent' }}
        fallback={
          <div className="earth-globe-wrap__css-fallback">
            <div className="earth-globe-wrap__css-sphere" />
          </div>
        }
      >
        <Suspense fallback={<EarthFallbackSphere />}>
          <EarthScene lights={lights} pulsePhase={pulsePhase} newLightId={newLightId} />
        </Suspense>
      </Canvas>
    </div>
  );
}

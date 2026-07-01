import { Suspense, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import type { CityGlow } from '../../types';
import './EarthGlobe.css';

const DAY_TEXTURE = '/textures/earth-day.jpg';
const LIGHTS_TEXTURE = '/textures/earth-lights.png';
const NORMAL_TEXTURE = '/textures/earth-normal.jpg';
const CLOUDS_TEXTURE = '/textures/earth-clouds.png';

const ROTATION_PERIOD_SEC = 480;
const EARTH_RADIUS = 1.55;
const EARTH_CENTER_Y = -0.72;

function latLngToPosition(lat: number, lng: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

interface SceneProps {
  cityGlows: CityGlow[];
  pulsePhase: number;
  newGlowKey: string | null;
}

function EarthScene({ cityGlows, pulsePhase, newGlowKey }: SceneProps) {
  const earthRef = useRef<THREE.Group>(null);
  const cloudsRef = useRef<THREE.Mesh>(null);
  const atmosphereRef = useRef<THREE.Mesh>(null);
  const breatheRef = useRef(0);

  const [dayMap, lightsMap, normalMap, cloudsMap] = useTexture([
    DAY_TEXTURE,
    LIGHTS_TEXTURE,
    NORMAL_TEXTURE,
    CLOUDS_TEXTURE,
  ]);

  const pledgeSprites = useMemo(() => {
    return cityGlows.map((glow) => {
      const key = `${glow.city}|${glow.country}`;
      const intensity = Math.min(1, 0.3 + glow.pledges * 0.1);
      const pos = latLngToPosition(glow.latitude, glow.longitude, EARTH_RADIUS + 0.018);
      return { key, pos, intensity, isNew: key === newGlowKey };
    });
  }, [cityGlows, newGlowKey]);

  useFrame((_, delta) => {
    breatheRef.current += delta;

    if (earthRef.current) {
      earthRef.current.rotation.y += (Math.PI * 2 * delta) / ROTATION_PERIOD_SEC;
      const breathe = 1 + Math.sin(breatheRef.current * 0.55) * 0.006;
      const pulse = pulsePhase > 0 ? 1 + Math.sin(pulsePhase * Math.PI) * 0.018 : 0;
      earthRef.current.scale.setScalar(breathe + pulse);
    }

    if (cloudsRef.current) {
      cloudsRef.current.rotation.y += delta * 0.012;
    }

    if (atmosphereRef.current) {
      const breathe = 1 + Math.sin(breatheRef.current * 0.55) * 0.01;
      const pulse = pulsePhase > 0 ? 1 + Math.sin(pulsePhase * Math.PI) * 0.03 : 0;
      atmosphereRef.current.scale.setScalar((EARTH_RADIUS + 0.08) * (breathe + pulse));
    }
  });

  return (
    <group position={[0, EARTH_CENTER_Y, 0]}>
      <group ref={earthRef}>
        <mesh>
          <sphereGeometry args={[EARTH_RADIUS, 96, 96]} />
          <meshStandardMaterial
            map={dayMap}
            normalMap={normalMap}
            emissiveMap={lightsMap}
            emissive={new THREE.Color('#ffcc88')}
            emissiveIntensity={0.85}
            roughness={0.82}
            metalness={0.04}
          />
        </mesh>

        <mesh ref={cloudsRef}>
          <sphereGeometry args={[EARTH_RADIUS + 0.012, 72, 72]} />
          <meshStandardMaterial
            map={cloudsMap}
            transparent
            opacity={0.22}
            depthWrite={false}
          />
        </mesh>

        {pledgeSprites.map(({ key, pos, intensity, isNew }) => (
          <mesh key={key} position={pos}>
            <sphereGeometry args={[isNew ? 0.022 : 0.012 + intensity * 0.008, 10, 10]} />
            <meshBasicMaterial
              color={isNew ? '#fff8d8' : '#8ecfff'}
              transparent
              opacity={isNew ? 1 : 0.55 + intensity * 0.4}
            />
          </mesh>
        ))}
      </group>

      <mesh ref={atmosphereRef}>
        <sphereGeometry args={[1, 64, 64]} />
        <meshBasicMaterial
          color="#5ba8e8"
          transparent
          opacity={0.11}
          side={THREE.BackSide}
          depthWrite={false}
        />
      </mesh>

      <directionalLight position={[5, 3, 4]} intensity={1.4} color="#c8dcff" />
      <directionalLight position={[-4, -1, -3]} intensity={0.08} color="#1a2840" />
      <ambientLight intensity={0.12} color="#1a3050" />
    </group>
  );
}

function EarthFallbackSphere() {
  const groupRef = useRef<THREE.Group>(null);
  const breatheRef = useRef(0);

  useFrame((_, delta) => {
    breatheRef.current += delta;
    if (groupRef.current) {
      groupRef.current.rotation.y += (Math.PI * 2 * delta) / ROTATION_PERIOD_SEC;
      const breathe = 1 + Math.sin(breatheRef.current * 0.55) * 0.006;
      groupRef.current.scale.setScalar(breathe);
    }
  });

  return (
    <group ref={groupRef} position={[0, EARTH_CENTER_Y, 0]}>
      <ambientLight intensity={0.25} />
      <directionalLight position={[5, 3, 4]} intensity={1} color="#a8c8ff" />
      <mesh>
        <sphereGeometry args={[EARTH_RADIUS, 64, 64]} />
        <meshStandardMaterial
          color="#1e4a6e"
          emissive="#0a1830"
          emissiveIntensity={0.5}
          roughness={0.9}
        />
      </mesh>
      <mesh>
        <sphereGeometry args={[EARTH_RADIUS + 0.06, 48, 48]} />
        <meshBasicMaterial color="#4a90d9" transparent opacity={0.1} side={THREE.BackSide} />
      </mesh>
    </group>
  );
}

interface Props {
  cityGlows: CityGlow[];
  pulsePhase: number;
  newGlowKey: string | null;
  className?: string;
}

export function EarthGlobe({ cityGlows, pulsePhase, newGlowKey, className }: Props) {
  return (
    <div className={`earth-globe-wrap earth-globe-wrap--hemisphere ${className ?? ''}`} aria-hidden>
      <Canvas
        camera={{ position: [0, 0.42, 2.05], fov: 48, near: 0.1, far: 100 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        style={{ background: 'transparent' }}
      >
        <Suspense fallback={<EarthFallbackSphere />}>
          <EarthScene
            cityGlows={cityGlows}
            pulsePhase={pulsePhase}
            newGlowKey={newGlowKey}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}

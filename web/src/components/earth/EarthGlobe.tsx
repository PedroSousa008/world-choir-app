import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import type { CityGlow } from '../../types';
import './EarthGlobe.css';

const DAY_TEXTURE = '/textures/earth-day-4k.jpg';
const NIGHT_TEXTURE = '/textures/earth-night-4k.jpg';
const CLOUDS_TEXTURE = '/textures/earth-clouds-4k.jpg';

const ROTATION_PERIOD_SEC = 480;
const EARTH_RADIUS = 1.62;
const EARTH_CENTER_Y = -0.78;
/** Face Europe / Africa night side toward the viewer */
const INITIAL_ROTATION_Y = -0.55;

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
  const breatheRef = useRef(0);

  const [dayMap, nightMap, cloudsMap] = useTexture([
    DAY_TEXTURE,
    NIGHT_TEXTURE,
    CLOUDS_TEXTURE,
  ]);

  useEffect(() => {
    for (const tex of [dayMap, nightMap, cloudsMap]) {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 16;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
    }
  }, [dayMap, nightMap, cloudsMap]);

  const pledgeSprites = useMemo(() => {
    return cityGlows.map((glow) => {
      const key = `${glow.city}|${glow.country}`;
      const intensity = Math.min(1, 0.25 + glow.pledges * 0.08);
      const pos = latLngToPosition(glow.latitude, glow.longitude, EARTH_RADIUS + 0.006);
      return { key, pos, intensity, isNew: key === newGlowKey };
    });
  }, [cityGlows, newGlowKey]);

  useFrame((_, delta) => {
    breatheRef.current += delta;

    if (earthRef.current) {
      earthRef.current.rotation.y += (Math.PI * 2 * delta) / ROTATION_PERIOD_SEC;
      const breathe = 1 + Math.sin(breatheRef.current * 0.5) * 0.004;
      const pulse = pulsePhase > 0 ? 1 + Math.sin(pulsePhase * Math.PI) * 0.01 : 0;
      earthRef.current.scale.setScalar(breathe + pulse);
    }

    if (cloudsRef.current) {
      cloudsRef.current.rotation.y += delta * 0.008;
    }
  });

  return (
    <group position={[0, EARTH_CENTER_Y, 0]} rotation={[0, INITIAL_ROTATION_Y, 0]}>
      <ambientLight intensity={1} />

      <group ref={earthRef}>
        <mesh>
          <sphereGeometry args={[EARTH_RADIUS, 128, 128]} />
          <meshPhongMaterial
            map={dayMap}
            emissiveMap={nightMap}
            emissive={new THREE.Color('#ffffff')}
            emissiveIntensity={0.38}
            shininess={0}
            specular={new THREE.Color('#000000')}
          />
        </mesh>

        <mesh ref={cloudsRef}>
          <sphereGeometry args={[EARTH_RADIUS + 0.008, 96, 96]} />
          <meshPhongMaterial
            map={cloudsMap}
            transparent
            opacity={0.14}
            depthWrite={false}
            shininess={0}
            specular={new THREE.Color('#000000')}
          />
        </mesh>

        {pledgeSprites.map(({ key, pos, intensity, isNew }) => (
          <mesh key={key} position={pos}>
            <sphereGeometry args={[isNew ? 0.012 : 0.006 + intensity * 0.004, 6, 6]} />
            <meshBasicMaterial
              color={isNew ? '#ffe8b0' : '#c8a060'}
              transparent
              opacity={isNew ? 0.95 : 0.35 + intensity * 0.35}
            />
          </mesh>
        ))}
      </group>
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
      const breathe = 1 + Math.sin(breatheRef.current * 0.5) * 0.004;
      groupRef.current.scale.setScalar(breathe);
    }
  });

  return (
    <group ref={groupRef} position={[0, EARTH_CENTER_Y, 0]} rotation={[0, INITIAL_ROTATION_Y, 0]}>
      <ambientLight intensity={1} />
      <mesh>
        <sphereGeometry args={[EARTH_RADIUS, 64, 64]} />
        <meshBasicMaterial color="#1a3050" />
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
        camera={{ position: [0, 0.38, 2.12], fov: 46, near: 0.1, far: 100 }}
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

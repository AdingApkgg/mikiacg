"use client";

import { useRef, useMemo, useEffect, useSyncExternalStore } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useUIStore } from "@/stores/app";

interface ParticleConfig {
  type: "sakura" | "firefly" | "snow" | "stars" | "aurora" | "cyber" | "none";
  density: number;
  speed: number;
  opacity: number;
  color: string;
}

interface ParticleProps {
  config: ParticleConfig;
  count: number;
  mouse: React.RefObject<{ x: number; y: number }>;
}

const PRESETS: Record<string, { colors: number[]; size: [number, number] }> = {
  sakura: {
    colors: [0xffb7c5, 0xff69b4, 0xffc0cb, 0xffa0b4, 0xffe4e9],
    size: [0.1, 0.18],
  },
  firefly: {
    colors: [0xffee58, 0xfff176, 0xfdd835, 0xffeb3b, 0xffc107],
    size: [0.06, 0.12],
  },
  snow: {
    colors: [0xffffff, 0xe3f2fd, 0xbbdefb, 0xf5f5f5, 0xe8eaf6],
    size: [0.04, 0.12],
  },
  stars: {
    colors: [0xffffff, 0xfff9c4, 0xbbdefb, 0xf3e5f5, 0xffe0b2],
    size: [0.02, 0.06],
  },
  cyber: {
    colors: [0x00ff41, 0x00cc33, 0x39ff14, 0x00ff80, 0x00e5ff],
    size: [0.02, 0.04],
  },
};

function mapDensity(density: number, isMobile: boolean): number {
  const base = 40 + (density / 100) * 260;
  return Math.floor(isMobile ? base * 0.4 : base);
}

function getMouseWorld(mouseNorm: { x: number; y: number }) {
  return { x: mouseNorm.x * 8, y: mouseNorm.y * 5 };
}

function applyMouseForce(
  px: number, py: number,
  mx: number, my: number,
  dt: number,
  radius: number, strength: number,
  attract: boolean = false,
) {
  const dx = px - mx;
  const dy = py - my;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < radius && dist > 0.01) {
    const force = (1 - dist / radius) * strength * dt;
    const sign = attract ? -1 : 1;
    return { x: (dx / dist) * force * sign, y: (dy / dist) * force * sign };
  }
  return { x: 0, y: 0 };
}

function createPetalGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.bezierCurveTo(0.25, 0.1, 0.35, 0.45, 0, 0.7);
  shape.bezierCurveTo(-0.35, 0.45, -0.25, 0.1, 0, 0);
  return new THREE.ShapeGeometry(shape);
}

// ============================
// Particle data generators (called outside render via useRef init)
// ============================
function generateSakuraParticles(count: number, color: string) {
  const preset = PRESETS.sakura;
  return Array.from({ length: count }, (_, i) => ({
    x: (Math.random() - 0.5) * 22,
    y: Math.random() * 14 - 3,
    z: -1 + Math.random() * 4,
    rotX: Math.random() * Math.PI * 2,
    rotY: Math.random() * Math.PI * 2,
    rotZ: Math.random() * Math.PI * 2,
    speedY: 0.4 + Math.random() * 0.6,
    speedRotX: (Math.random() - 0.5) * 2.2,
    speedRotY: (Math.random() - 0.5) * 1.0,
    speedRotZ: (Math.random() - 0.5) * 1.8,
    swayPhase: Math.random() * Math.PI * 2,
    swayAmp: 0.4 + Math.random() * 0.8,
    swayFreq: 0.6 + Math.random() * 0.8,
    scale: preset.size[0] + Math.random() * (preset.size[1] - preset.size[0]),
    pulsePhase: Math.random() * Math.PI * 2,
    color: color
      ? new THREE.Color(color)
      : new THREE.Color(preset.colors[i % preset.colors.length]),
  }));
}

function generateFireflyParticles(count: number, color: string) {
  const preset = PRESETS.firefly;
  return Array.from({ length: count }, (_, i) => ({
    x: (Math.random() - 0.5) * 20,
    y: (Math.random() - 0.5) * 12,
    z: (Math.random() - 0.5) * 6,
    vx: (Math.random() - 0.5) * 0.3,
    vy: (Math.random() - 0.5) * 0.2,
    wanderAngle: Math.random() * Math.PI * 2,
    wanderSpeed: 0.5 + Math.random() * 1.5,
    phase: Math.random() * Math.PI * 2,
    pulseSpeed: 1.2 + Math.random() * 2.5,
    scale: preset.size[0] + Math.random() * (preset.size[1] - preset.size[0]),
    baseColor: color
      ? new THREE.Color(color)
      : new THREE.Color(preset.colors[i % preset.colors.length]),
  }));
}

function generateSnowParticles(count: number, color: string) {
  const preset = PRESETS.snow;
  return Array.from({ length: count }, (_, i) => ({
    x: (Math.random() - 0.5) * 22,
    y: Math.random() * 14 - 3,
    z: -2 + Math.random() * 6,
    speedY: 0.15 + Math.random() * 0.45,
    swayPhase1: Math.random() * Math.PI * 2,
    swayPhase2: Math.random() * Math.PI * 2,
    swayAmp1: 0.2 + Math.random() * 0.5,
    swayAmp2: 0.1 + Math.random() * 0.3,
    rotZ: Math.random() * Math.PI * 2,
    rotSpeedZ: (Math.random() - 0.5) * 0.6,
    scale: preset.size[0] + Math.random() * (preset.size[1] - preset.size[0]),
    sparklePhase: Math.random() * Math.PI * 2,
    sparkleSpeed: 3 + Math.random() * 5,
    depthFactor: 0.5 + Math.random() * 0.5,
    color: color
      ? new THREE.Color(color)
      : new THREE.Color(preset.colors[i % preset.colors.length]),
  }));
}

function generateStarsParticles(count: number, color: string) {
  const preset = PRESETS.stars;
  return Array.from({ length: count }, (_, i) => ({
    x: (Math.random() - 0.5) * 26,
    y: (Math.random() - 0.5) * 16,
    z: -3 - Math.random() * 5,
    phase: Math.random() * Math.PI * 2,
    twinkleSpeed: 0.4 + Math.random() * 2.5,
    scale: preset.size[0] + Math.random() * (preset.size[1] - preset.size[0]),
    flashTimer: 8 + Math.random() * 20,
    flashCountdown: 8 + Math.random() * 20,
    isFlashing: false,
    color: color
      ? new THREE.Color(color)
      : new THREE.Color(preset.colors[i % preset.colors.length]),
  }));
}

function generateCyberParticles(count: number, color: string) {
  const preset = PRESETS.cyber;
  const total = Math.floor(count * 1.5);
  return Array.from({ length: total }, (_, i) => ({
    x: (Math.random() - 0.5) * 22,
    y: Math.random() * 16 - 4,
    z: (Math.random() - 0.5) * 5,
    speedY: 1.2 + Math.random() * 4.0,
    baseScale: preset.size[0] + Math.random() * (preset.size[1] - preset.size[0]),
    tailLength: 0.5 + Math.random() * 3.0,
    phase: Math.random() * Math.PI * 2,
    flashSpeed: 2 + Math.random() * 6,
    brightness: 0.4 + Math.random() * 0.6,
    color: color
      ? new THREE.Color(color)
      : new THREE.Color(preset.colors[i % preset.colors.length]),
  }));
}

// ============================
// Sakura
// ============================
function SakuraParticles({ config, count, mouse }: ParticleProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null!);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const geometry = useMemo(() => createPetalGeometry(), []);
  const particlesRef = useRef(generateSakuraParticles(count, config.color));

  useEffect(() => {
    const particles = particlesRef.current;
    const preset = PRESETS.sakura;
    for (let i = 0; i < particles.length; i++) {
      particles[i].color = config.color
        ? new THREE.Color(config.color)
        : new THREE.Color(preset.colors[i % preset.colors.length]);
    }
    if (!meshRef.current) return;
    for (let i = 0; i < particles.length; i++) {
      meshRef.current.setColorAt(i, particles[i].color);
    }
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
  }, [config.color]);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    const particles = particlesRef.current;
    const spd = config.speed;
    const dt = Math.min(delta, 0.05);
    const mw = getMouseWorld(mouse.current);

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.y -= p.speedY * spd * dt;
      p.rotX += p.speedRotX * spd * dt;
      p.rotY += p.speedRotY * spd * dt;
      p.rotZ += p.speedRotZ * spd * dt;
      p.swayPhase += spd * dt * p.swayFreq;
      p.x += Math.sin(p.swayPhase) * p.swayAmp * dt;

      const mf = applyMouseForce(p.x, p.y, mw.x, mw.y, dt, 2.5, 3.0);
      p.x += mf.x;
      p.y += mf.y;

      if (p.y < -8) { p.y = 8 + Math.random() * 3; p.x = (Math.random() - 0.5) * 22; }
      if (p.x > 13) p.x = -13;
      if (p.x < -13) p.x = 13;

      p.pulsePhase += dt * 1.5;
      const pulse = 1 + Math.sin(p.pulsePhase) * 0.08;

      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(p.rotX, p.rotY, p.rotZ);
      dummy.scale.setScalar(p.scale * pulse);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[geometry, undefined, count]}>
      <meshBasicMaterial
        transparent
        opacity={config.opacity}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </instancedMesh>
  );
}

// ============================
// Firefly
// ============================
function FireflyParticles({ config, count, mouse }: ParticleProps) {
  const coreRef = useRef<THREE.InstancedMesh>(null!);
  const haloRef = useRef<THREE.InstancedMesh>(null!);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const particlesRef = useRef(generateFireflyParticles(count, config.color));

  useEffect(() => {
    const particles = particlesRef.current;
    const preset = PRESETS.firefly;
    for (let i = 0; i < particles.length; i++) {
      particles[i].baseColor = config.color
        ? new THREE.Color(config.color)
        : new THREE.Color(preset.colors[i % preset.colors.length]);
    }
    if (!coreRef.current) return;
    for (let i = 0; i < particles.length; i++) {
      coreRef.current.setColorAt(i, particles[i].baseColor);
      haloRef.current?.setColorAt(i, particles[i].baseColor);
    }
    if (coreRef.current.instanceColor) coreRef.current.instanceColor.needsUpdate = true;
    if (haloRef.current?.instanceColor) haloRef.current.instanceColor.needsUpdate = true;
  }, [config.color]);

  useFrame((_, delta) => {
    if (!coreRef.current) return;
    const particles = particlesRef.current;
    const spd = config.speed;
    const dt = Math.min(delta, 0.05);
    const mw = getMouseWorld(mouse.current);

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];

      p.wanderAngle += (Math.random() - 0.5) * 2.0 * dt;
      p.vx += Math.cos(p.wanderAngle) * p.wanderSpeed * dt * 0.15;
      p.vy += Math.sin(p.wanderAngle) * p.wanderSpeed * dt * 0.15;
      p.vx *= 0.98;
      p.vy *= 0.98;

      p.x += p.vx * spd * dt;
      p.y += p.vy * spd * dt;
      p.phase += p.pulseSpeed * spd * dt;

      const mf = applyMouseForce(p.x, p.y, mw.x, mw.y, dt, 3.0, 1.5, true);
      p.x += mf.x;
      p.y += mf.y;

      if (p.x > 12) p.vx = -Math.abs(p.vx);
      if (p.x < -12) p.vx = Math.abs(p.vx);
      if (p.y > 7) p.vy = -Math.abs(p.vy);
      if (p.y < -7) p.vy = Math.abs(p.vy);

      const pulse = Math.sin(p.phase) * 0.5 + 0.5;
      const coreScale = p.scale * (0.6 + pulse * 0.6);
      const haloScale = p.scale * (2.5 + pulse * 2.0);

      dummy.position.set(p.x, p.y, p.z);
      dummy.scale.setScalar(coreScale);
      dummy.updateMatrix();
      coreRef.current.setMatrixAt(i, dummy.matrix);

      if (haloRef.current) {
        dummy.scale.setScalar(haloScale);
        dummy.updateMatrix();
        haloRef.current.setMatrixAt(i, dummy.matrix);
      }
    }
    coreRef.current.instanceMatrix.needsUpdate = true;
    if (haloRef.current) haloRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      <instancedMesh ref={coreRef} args={[undefined, undefined, count]}>
        <circleGeometry args={[1, 12]} />
        <meshBasicMaterial
          transparent
          opacity={config.opacity}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </instancedMesh>
      <instancedMesh ref={haloRef} args={[undefined, undefined, count]}>
        <circleGeometry args={[1, 12]} />
        <meshBasicMaterial
          transparent
          opacity={config.opacity * 0.12}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </instancedMesh>
    </>
  );
}

// ============================
// Snow
// ============================
function SnowParticles({ config, count, mouse }: ParticleProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null!);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const particlesRef = useRef(generateSnowParticles(count, config.color));

  useEffect(() => {
    const particles = particlesRef.current;
    const preset = PRESETS.snow;
    for (let i = 0; i < particles.length; i++) {
      particles[i].color = config.color
        ? new THREE.Color(config.color)
        : new THREE.Color(preset.colors[i % preset.colors.length]);
    }
    if (!meshRef.current) return;
    for (let i = 0; i < particles.length; i++) {
      meshRef.current.setColorAt(i, particles[i].color);
    }
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
  }, [config.color]);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    const particles = particlesRef.current;
    const spd = config.speed;
    const dt = Math.min(delta, 0.05);
    const mw = getMouseWorld(mouse.current);

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.y -= p.speedY * spd * dt * p.depthFactor;
      p.swayPhase1 += spd * dt * 0.6;
      p.swayPhase2 += spd * dt * 0.9;
      p.rotZ += p.rotSpeedZ * spd * dt;
      p.x += (Math.sin(p.swayPhase1) * p.swayAmp1 + Math.cos(p.swayPhase2) * p.swayAmp2) * dt;

      const mf = applyMouseForce(p.x, p.y, mw.x, mw.y, dt, 2.0, 4.0);
      p.x += mf.x;
      p.y += mf.y;

      if (p.y < -8) { p.y = 8 + Math.random() * 3; p.x = (Math.random() - 0.5) * 22; }

      p.sparklePhase += p.sparkleSpeed * dt;
      const sparkle = Math.max(0, Math.sin(p.sparklePhase));
      const s = p.scale * p.depthFactor * (0.9 + sparkle * 0.2);

      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(0, 0, p.rotZ);
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      <circleGeometry args={[1, 8]} />
      <meshBasicMaterial
        transparent
        opacity={config.opacity}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </instancedMesh>
  );
}

// ============================
// Stars
// ============================
function StarsParticles({ config, count }: Omit<ParticleProps, "mouse">) {
  const meshRef = useRef<THREE.InstancedMesh>(null!);
  const haloRef = useRef<THREE.InstancedMesh>(null!);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const particlesRef = useRef(generateStarsParticles(count, config.color));

  useEffect(() => {
    const particles = particlesRef.current;
    const preset = PRESETS.stars;
    for (let i = 0; i < particles.length; i++) {
      particles[i].color = config.color
        ? new THREE.Color(config.color)
        : new THREE.Color(preset.colors[i % preset.colors.length]);
    }
    if (!meshRef.current) return;
    for (let i = 0; i < particles.length; i++) {
      meshRef.current.setColorAt(i, particles[i].color);
      haloRef.current?.setColorAt(i, particles[i].color);
    }
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
    if (haloRef.current?.instanceColor) haloRef.current.instanceColor.needsUpdate = true;
  }, [config.color]);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    const particles = particlesRef.current;
    const spd = config.speed;
    const dt = Math.min(delta, 0.05);

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.phase += p.twinkleSpeed * spd * dt;
      p.flashCountdown -= dt;

      let brightness: number;
      if (p.flashCountdown <= 0) {
        p.isFlashing = true;
        p.flashCountdown = p.flashTimer;
      }
      if (p.isFlashing) {
        brightness = 1.5 + Math.sin(p.phase * 8) * 0.5;
        if (Math.sin(p.phase * 8) < -0.8) p.isFlashing = false;
      } else {
        brightness = Math.sin(p.phase) * 0.4 + 0.6;
      }

      const s = p.scale * (0.3 + brightness * 0.7);
      const haloS = p.scale * (1.5 + brightness * 2.5);

      dummy.position.set(p.x, p.y, p.z);
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);

      if (haloRef.current) {
        dummy.scale.setScalar(haloS);
        dummy.updateMatrix();
        haloRef.current.setMatrixAt(i, dummy.matrix);
      }
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
    if (haloRef.current) haloRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
        <circleGeometry args={[1, 6]} />
        <meshBasicMaterial
          transparent
          opacity={config.opacity}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </instancedMesh>
      <instancedMesh ref={haloRef} args={[undefined, undefined, count]}>
        <circleGeometry args={[1, 8]} />
        <meshBasicMaterial
          transparent
          opacity={config.opacity * 0.08}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </instancedMesh>
    </>
  );
}

// ============================
// Aurora
// ============================
const auroraVertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const auroraFragmentShader = `
varying vec2 vUv;
uniform float uTime;
uniform float uSpeed;
uniform float uOpacity;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;
uniform vec2 uMouse;

void main() {
  vec2 uv = vUv;
  float t = uTime * uSpeed * 0.25;

  float mouseWarp = smoothstep(0.6, 0.0, length(uv - vec2(uMouse.x * 0.5 + 0.5, uMouse.y * 0.5 + 0.5))) * 0.08;

  float wave1 = sin(uv.x * 4.0 + t) * 0.15;
  float wave2 = sin(uv.x * 7.0 - t * 1.4) * 0.10;
  float wave3 = cos(uv.x * 5.5 + t * 0.8) * 0.08;
  float wave4 = sin(uv.x * 3.0 - t * 0.5) * 0.12;
  float totalWave = wave1 + wave2 + wave3 + wave4 + mouseWarp;

  float band1Pos = 0.68 + totalWave;
  float band1 = exp(-pow((uv.y - band1Pos) * 7.0, 2.0));

  float band2Pos = 0.42 + totalWave * 0.6;
  float band2 = exp(-pow((uv.y - band2Pos) * 9.0, 2.0)) * 0.45;

  float band3Pos = 0.55 + totalWave * 0.8;
  float band3 = exp(-pow((uv.y - band3Pos) * 12.0, 2.0)) * 0.3;

  float intensity = max(max(band1, band2), band3);

  float cx = sin(t * 0.2 + uv.x * 2.0) * 0.5 + 0.5;
  float cx2 = cos(t * 0.15 + uv.x * 3.0) * 0.5 + 0.5;
  vec3 color = mix(uColor1, uColor2, cx);
  color = mix(color, uColor3, cx2 * 0.35);
  color += vec3(0.05, 0.02, 0.0) * band1;

  float alpha = intensity * uOpacity * 0.55;
  float noise = fract(sin(dot(uv * t * 0.01, vec2(12.9898, 78.233))) * 43758.5453);
  alpha *= 0.92 + noise * 0.08;

  gl_FragColor = vec4(color * (1.0 + intensity * 0.2), alpha);
}
`;

function AuroraEffect({ config, mouse }: { config: ParticleConfig; mouse: React.RefObject<{ x: number; y: number }> }) {
  const materialRef = useRef<THREE.ShaderMaterial>(null!);

  const colors = useMemo(() => {
    if (config.color) {
      const base = new THREE.Color(config.color);
      const hsl = { h: 0, s: 0, l: 0 };
      base.getHSL(hsl);
      return {
        c1: base,
        c2: new THREE.Color().setHSL((hsl.h + 0.15) % 1, hsl.s, hsl.l),
        c3: new THREE.Color().setHSL((hsl.h + 0.35) % 1, hsl.s * 0.8, hsl.l * 0.9),
      };
    }
    return {
      c1: new THREE.Color(0x00ff88),
      c2: new THREE.Color(0x3388ff),
      c3: new THREE.Color(0x9933ff),
    };
  }, [config.color]);

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uSpeed: { value: config.speed },
    uOpacity: { value: config.opacity },
    uColor1: { value: colors.c1 },
    uColor2: { value: colors.c2 },
    uColor3: { value: colors.c3 },
    uMouse: { value: new THREE.Vector2(0, 0) },
  }), [config.speed, config.opacity, colors]);

  useFrame((state) => {
    if (!materialRef.current) return;
    materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
    materialRef.current.uniforms.uMouse.value.set(mouse.current.x, mouse.current.y);
  });

  return (
    <mesh position={[0, 0, -3]}>
      <planeGeometry args={[26, 16]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={auroraVertexShader}
        fragmentShader={auroraFragmentShader}
        uniforms={uniforms}
        transparent
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

// ============================
// Cyber
// ============================
function CyberParticles({ config, count, mouse }: ParticleProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null!);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const particlesRef = useRef(generateCyberParticles(count, config.color));
  const actualCount = Math.floor(count * 1.5);

  useEffect(() => {
    const particles = particlesRef.current;
    const preset = PRESETS.cyber;
    for (let i = 0; i < particles.length; i++) {
      particles[i].color = config.color
        ? new THREE.Color(config.color)
        : new THREE.Color(preset.colors[i % preset.colors.length]);
    }
    if (!meshRef.current) return;
    for (let i = 0; i < particles.length; i++) {
      meshRef.current.setColorAt(i, particles[i].color);
    }
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
  }, [config.color]);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    const particles = particlesRef.current;
    const spd = config.speed;
    const dt = Math.min(delta, 0.05);
    const mw = getMouseWorld(mouse.current);

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.y -= p.speedY * spd * dt;
      p.phase += p.flashSpeed * spd * dt;

      if (p.y < -9) {
        p.y = 9 + Math.random() * 3;
        p.x = (Math.random() - 0.5) * 22;
        p.speedY = 1.2 + Math.random() * 4.0;
        p.brightness = 0.4 + Math.random() * 0.6;
      }

      const dist = Math.sqrt((p.x - mw.x) ** 2 + (p.y - mw.y) ** 2);
      const mouseGlow = dist < 3 ? (1 - dist / 3) * 0.4 : 0;

      const flash = Math.sin(p.phase) * 0.3 + 0.7;
      const s = p.baseScale * (p.brightness + mouseGlow) * flash;

      dummy.position.set(p.x, p.y, p.z);
      dummy.scale.set(s, s * p.tailLength, s);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, actualCount]}>
      <boxGeometry args={[1, 1, 0.1]} />
      <meshBasicMaterial
        transparent
        opacity={config.opacity * 0.85}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </instancedMesh>
  );
}

// ============================
// Scene orchestrator
// ============================
function ParticleScene({ config, count, mouse }: ParticleProps) {
  switch (config.type) {
    case "sakura":
      return <SakuraParticles key={count} config={config} count={count} mouse={mouse} />;
    case "firefly":
      return <FireflyParticles key={count} config={config} count={count} mouse={mouse} />;
    case "snow":
      return <SnowParticles key={count} config={config} count={count} mouse={mouse} />;
    case "stars":
      return <StarsParticles key={count} config={config} count={count} />;
    case "aurora":
      return <AuroraEffect config={config} mouse={mouse} />;
    case "cyber":
      return <CyberParticles key={count} config={config} count={count} mouse={mouse} />;
    default:
      return null;
  }
}

// ============================
// Main export
// ============================
const subscribeResize = (cb: () => void) => {
  window.addEventListener("resize", cb);
  return () => window.removeEventListener("resize", cb);
};
const getIsMobile = () => window.innerWidth < 768;
const getIsMobileServer = () => false;

const subscribeVisibility = (cb: () => void) => {
  document.addEventListener("visibilitychange", cb);
  return () => document.removeEventListener("visibilitychange", cb);
};
const getPageVisible = () => document.visibilityState === "visible";
const getPageVisibleServer = () => true;

const subscribeReducedMotion = (cb: () => void) => {
  const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
  mql.addEventListener("change", cb);
  return () => mql.removeEventListener("change", cb);
};
const getReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const getReducedMotionServer = () => false;

export default function ParticleBackground({ config }: { config: ParticleConfig }) {
  const reducedMotion = useUIStore((s) => s.reducedMotion);
  const isMobile = useSyncExternalStore(subscribeResize, getIsMobile, getIsMobileServer);
  const mouseRef = useRef({ x: 0, y: 0 });
  const pageVisible = useSyncExternalStore(subscribeVisibility, getPageVisible, getPageVisibleServer);
  const prefersReduced = useSyncExternalStore(subscribeReducedMotion, getReducedMotion, getReducedMotionServer);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      mouseRef.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouseRef.current.y = -(e.clientY / window.innerHeight) * 2 + 1;
    };
    window.addEventListener("mousemove", handler, { passive: true });
    return () => window.removeEventListener("mousemove", handler);
  }, []);

  if (reducedMotion || prefersReduced || config.type === "none" || !pageVisible) return null;

  const count = mapDensity(config.density, isMobile);

  return (
    <div
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
      aria-hidden
    >
      <Canvas
        camera={{ position: [0, 0, 8], fov: 60 }}
        dpr={[1, isMobile ? 1 : 1.5]}
        gl={{ antialias: false, alpha: true, powerPreference: "low-power" }}
        style={{ background: "transparent" }}
        frameloop="always"
      >
        <ParticleScene config={config} count={count} mouse={mouseRef} />
      </Canvas>
    </div>
  );
}

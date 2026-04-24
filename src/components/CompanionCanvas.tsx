import React, { useEffect, useState, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Environment, ContactShadows } from '@react-three/drei';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRM } from '@pixiv/three-vrm';
import * as THREE from 'three';

interface CompanionAvatarProps {
  url?: string;
  isSpeaking?: boolean;
}

function AvatarModel({ url, isSpeaking }: CompanionAvatarProps) {
  const [vrm, setVrm] = useState<VRM | null>(null);
  const [error, setError] = useState<string | null>(null);
  const modelRef = useRef<THREE.Group>(null);
  
  // Basic blinking state
  const clock = useRef(new THREE.Clock());

  useEffect(() => {
    if (!url) return;
    
    let cancelled = false;
    const loader = new GLTFLoader();
    
    // Register VRM Plugin
    loader.register((parser) => new VRMLoaderPlugin(parser));
    
    loader.load(
      url,
      (gltf) => {
        if (cancelled) return;
        const vrmData = gltf.userData.vrm as VRM;
        if (vrmData) {
          // Disable frustum culling for VRM bones
          vrmData.scene.traverse((obj) => {
            obj.frustumCulled = false;
          });
          setVrm(vrmData);
          
          // Rotate 180 degrees to face camera
          VRMUtils.rotateVRM0(vrmData); 
        }
      },
      (progress) => {
        // console.log(`Loading model... ${Math.round((progress.loaded / progress.total) * 100)}%`);
      },
      (err) => {
        if (cancelled) return;
        console.error("Failed to load VRM model", err);
        setError("Errore caricamento modello VRM");
      }
    );

    return () => {
      cancelled = true;
    };
  }, [url]);

  // Animation Loop (Blinking, Lip Sync, Idle breathing)
  useFrame((state, delta) => {
    if (!vrm) return;
    
    const time = clock.current.getElapsedTime();
    
    // 1. Idle Breathing (slight rotation on chest/head)
    const spine = vrm.humanoid?.getNormalizedBoneNode('spine');
    if (spine) {
      spine.rotation.x = Math.sin(time * 2) * 0.02;
    }
    
    // 2. Random Blinking
    const blinkWeight = Math.sin(time * 5) > 0.95 ? 1 : 0; // Simple fast blink
    vrm.expressionManager?.setValue('blink', blinkWeight);
    
    // 3. Fake Lip Sync when speaking
    if (isSpeaking) {
      // Very basic random lip flap
      const flap = Math.abs(Math.sin(time * 15)) * 0.8;
      vrm.expressionManager?.setValue('aa', flap);
    } else {
      vrm.expressionManager?.setValue('aa', 0);
    }

    // 4. Update VRM
    vrm.update(delta);
  });

  if (error) return null;
  if (!vrm) return null;

  return <primitive ref={modelRef} object={vrm.scene} position={[0, -1.5, 0]} />;
}

// Utility to fix rotation on older VRMs
const VRMUtils = {
  rotateVRM0: (vrm: VRM) => {
    vrm.scene.rotation.y = Math.PI;
  }
};

export function CompanionCanvas({ url, isSpeaking }: CompanionAvatarProps) {
  return (
    <div className="w-full h-full relative bg-gradient-to-b from-surface to-background overflow-hidden rounded-2xl shadow-xl border border-border/50">
      {!url && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-muted z-10">
          <div className="w-16 h-16 mb-4 rounded-full bg-elevated border border-border flex items-center justify-center">
            <span className="text-2xl">👤</span>
          </div>
          <p className="text-sm font-medium">Nessun Modello VRM caricato</p>
          <p className="text-xs mt-1">Vai nelle Impostazioni &gt; Avatar per caricarne uno.</p>
        </div>
      )}
      
      <Canvas camera={{ position: [0, 1.2, 2.5], fov: 40 }}>
        <ambientLight intensity={0.7} />
        <directionalLight position={[2, 2, 2]} intensity={1.5} castShadow />
        <directionalLight position={[-2, 1, -1]} intensity={0.5} />
        
        {url && <AvatarModel url={url} isSpeaking={isSpeaking} />}
        
        <Environment preset="city" />
        <ContactShadows position={[0, -1.5, 0]} opacity={0.4} scale={5} blur={2} far={2} />
        
        <OrbitControls 
          target={[0, 1.2, 0]} 
          enablePan={false} 
          minDistance={1} 
          maxDistance={4}
          maxPolarAngle={Math.PI / 2 + 0.1}
          minPolarAngle={Math.PI / 3}
        />
      </Canvas>
    </div>
  );
}

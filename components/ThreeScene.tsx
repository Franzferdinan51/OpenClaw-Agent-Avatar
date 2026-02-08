
import React, { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { MorphTargetDictionary, SceneHandle } from '../types';

interface ThreeSceneProps {
    onModelLoad: (dictionary: MorphTargetDictionary) => void;
    onLoadProgress: (progress: number) => void;
}

const MODEL_PATH = 'https://threejs.org/examples/models/gltf/RobotExpressive/RobotExpressive.glb';

export const ThreeScene = forwardRef<SceneHandle, ThreeSceneProps>(({ onModelLoad, onLoadProgress }, ref) => {
    const mountRef = useRef<HTMLDivElement>(null);
    const headMeshRef = useRef<THREE.Mesh | null>(null);
    const morphInfluencesRef = useRef<(number[] | undefined) | null>(null);

    useImperativeHandle(ref, () => ({
        setMorphTargetInfluence: (name: string, value: number) => {
            if (headMeshRef.current && headMeshRef.current.morphTargetDictionary && morphInfluencesRef.current) {
                const index = headMeshRef.current.morphTargetDictionary[name];
                if (index !== undefined) {
                    morphInfluencesRef.current[index] = value;
                }
            }
        },
        resetMorphTargets: () => {
            if (morphInfluencesRef.current) {
                for (let i = 0; i < morphInfluencesRef.current.length; i++) {
                    morphInfluencesRef.current[i] = 0;
                }
            }
        }
    }));

    useEffect(() => {
        if (!mountRef.current) return;

        const currentMount = mountRef.current;

        // Scene
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x111827); // Darker gray-900 equivalent
        scene.fog = new THREE.Fog(0x111827, 4, 18);

        // Camera
        const camera = new THREE.PerspectiveCamera(45, currentMount.clientWidth / currentMount.clientHeight, 0.1, 1000);
        camera.position.set(0, 1.5, 5); // Slightly further back for better framing with UI

        // Renderer
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Performance optimization
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        currentMount.appendChild(renderer.domElement);

        // Controls
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.target.set(0, 1.2, 0); 
        controls.enablePan = false;
        controls.enableZoom = true;
        controls.minDistance = 2;
        controls.maxDistance = 8;
        controls.dampingFactor = 0.05;
        controls.enableDamping = true;
        
        // --- Improved Cyberpunk/Sci-Fi Lighting ---
        
        // 1. Base Ambient
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
        scene.add(ambientLight);

        // 2. Cyan Rim Light (Left)
        const rimLightL = new THREE.SpotLight(0x00ffff, 5);
        rimLightL.position.set(-5, 3, 0);
        rimLightL.lookAt(0, 1, 0);
        scene.add(rimLightL);

        // 3. Warm/Red Rim Light (Right) - Contrast
        const rimLightR = new THREE.SpotLight(0xff00aa, 2);
        rimLightR.position.set(5, 3, -1);
        rimLightR.lookAt(0, 1, 0);
        scene.add(rimLightR);

        // 4. Main Key Light (White/Cool)
        const keyLight = new THREE.DirectionalLight(0xffffff, 2.5);
        keyLight.position.set(2, 4, 5);
        scene.add(keyLight);


        // Model Loading
        const loader = new GLTFLoader();
        loader.load(MODEL_PATH, 
            (gltf) => {
                const model = gltf.scene;
                // Center and scale model slightly
                model.position.y = -1; 
                scene.add(model);

                model.traverse((node) => {
                    if (!headMeshRef.current && node instanceof THREE.Mesh && node.morphTargetInfluences) {
                        headMeshRef.current = node;
                        morphInfluencesRef.current = node.morphTargetInfluences;
                        onModelLoad(node.morphTargetDictionary as MorphTargetDictionary);
                    }
                    // Make material slightly more metallic/reflective for sci-fi look
                    if (node instanceof THREE.Mesh) {
                        node.castShadow = true;
                        node.receiveShadow = true;
                        if(node.material instanceof THREE.MeshStandardMaterial) {
                            node.material.roughness = 0.4;
                        }
                    }
                });
                
                // Trigger initial animation state
                const mixer = new THREE.AnimationMixer(model);
                const clips = gltf.animations;
                // Play 'Idle' if it exists
                const idleClip = clips.find(c => c.name.toLowerCase().includes('idle'));
                if(idleClip) {
                    mixer.clipAction(idleClip).play();
                }

                // If we want to animate non-morph animations, we need to expose mixer. 
                // For now, we rely on morph targets for lipsync.
            }, 
            (xhr) => {
                if (xhr.total > 0) {
                    onLoadProgress(Math.round((xhr.loaded / xhr.total) * 100));
                }
            }, 
            (error) => console.error('Model error:', error)
        );

        // Animation Loop
        let animationFrameId: number;
        const animate = () => {
            animationFrameId = requestAnimationFrame(animate);
            controls.update();
            renderer.render(scene, camera);
        };
        animate();

        const handleResize = () => {
            camera.aspect = currentMount.clientWidth / currentMount.clientHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
        };
        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            cancelAnimationFrame(animationFrameId);
            if (currentMount && renderer.domElement) {
               currentMount.removeChild(renderer.domElement);
            }
        };
    }, [onModelLoad, onLoadProgress]);

    return <div ref={mountRef} className="w-full h-full" />;
});

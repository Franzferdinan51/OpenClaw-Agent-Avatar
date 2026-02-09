import React, { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { MorphTargetDictionary, SceneHandle } from '../types';

interface ThreeSceneProps {
    modelUrl?: string; // Optional URL to override default
    lightIntensity?: number;
    onModelLoad: (dictionary: MorphTargetDictionary) => void;
    onLoadProgress: (progress: number) => void;
}

const DEFAULT_MODEL_PATH = 'https://threejs.org/examples/models/gltf/RobotExpressive/RobotExpressive.glb';

export const ThreeScene = forwardRef<SceneHandle, ThreeSceneProps>(({ modelUrl, lightIntensity = 1.0, onModelLoad, onLoadProgress }, ref) => {
    const mountRef = useRef<HTMLDivElement>(null);
    const headMeshRef = useRef<THREE.Mesh | null>(null);
    const morphInfluencesRef = useRef<(number[] | undefined) | null>(null);
    const vrmRef = useRef<any>(null); // Store VRM instance
    const mouseRef = useRef({ x: 0, y: 0 });
    const lookAtTargetRef = useRef<THREE.Object3D | null>(null);

    // Light Refs for dynamic updates
    const ambientLightRef = useRef<THREE.AmbientLight | null>(null);
    const spotLightLRef = useRef<THREE.SpotLight | null>(null);
    const spotLightRRef = useRef<THREE.SpotLight | null>(null);
    const keyLightRef = useRef<THREE.DirectionalLight | null>(null);

    useImperativeHandle(ref, () => ({
        setMorphTargetInfluence: (name: string, value: number) => {
            // 1. Handle VRM Expressions (Preferred if VRM loaded)
            if (vrmRef.current && vrmRef.current.expressionManager) {
                // Map generic "open mouth" signals to VRM 'aa'
                if (['mouthOpen', 'jawOpen', 'viseme_O', 'MouthOpen', 'vrc.v_oh'].includes(name)) {
                    vrmRef.current.expressionManager.setValue('aa', value);
                } 
            } 
            
            // 2. Handle Standard GLTF Morph Targets (Fallback / Robot)
            if (headMeshRef.current && headMeshRef.current.morphTargetDictionary && morphInfluencesRef.current) {
                const index = headMeshRef.current.morphTargetDictionary[name];
                if (index !== undefined) {
                    morphInfluencesRef.current[index] = value;
                }
            }
        },
        resetMorphTargets: () => {
            // Reset VRM
            if (vrmRef.current && vrmRef.current.expressionManager) {
                vrmRef.current.expressionManager.setValue('aa', 0);
                vrmRef.current.expressionManager.setValue('ih', 0);
                vrmRef.current.expressionManager.setValue('ou', 0);
            }

            // Reset GLTF
            if (morphInfluencesRef.current) {
                for (let i = 0; i < morphInfluencesRef.current.length; i++) {
                    morphInfluencesRef.current[i] = 0;
                }
            }
        }
    }));

    // Dynamic Light Intensity Update
    useEffect(() => {
        const intensity = Math.max(0, lightIntensity);
        if (ambientLightRef.current) ambientLightRef.current.intensity = 0.8 * intensity;
        if (spotLightLRef.current) spotLightLRef.current.intensity = 7 * intensity;
        if (spotLightRRef.current) spotLightRRef.current.intensity = 4 * intensity;
        if (keyLightRef.current) keyLightRef.current.intensity = 3.5 * intensity;
    }, [lightIntensity]);

    useEffect(() => {
        if (!mountRef.current) return;

        const currentMount = mountRef.current;

        // Scene
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x0a0a12); 
        scene.fog = new THREE.Fog(0x0a0a12, 4, 20);

        // Camera
        const camera = new THREE.PerspectiveCamera(30, currentMount.clientWidth / currentMount.clientHeight, 0.1, 1000);
        const initialCameraPos = new THREE.Vector3(0, 1.4, 9.0); 
        camera.position.copy(initialCameraPos);

        // Renderer
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.2; 
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        currentMount.appendChild(renderer.domElement);

        // Controls
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.target.set(0, 1.2, 0); 
        controls.enablePan = false;
        controls.enableZoom = true;
        controls.minDistance = 2;
        controls.maxDistance = 15;
        controls.dampingFactor = 0.05;
        controls.enableDamping = true;
        
        // Lighting Setup
        const baseIntensity = lightIntensity || 1.0;

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.8 * baseIntensity);
        scene.add(ambientLight);
        ambientLightRef.current = ambientLight;
        
        const rimLightL = new THREE.SpotLight(0x00ffff, 7 * baseIntensity);
        rimLightL.position.set(-5, 3, 0);
        scene.add(rimLightL);
        spotLightLRef.current = rimLightL;
        
        const rimLightR = new THREE.SpotLight(0xff00aa, 4 * baseIntensity);
        rimLightR.position.set(5, 3, -1);
        scene.add(rimLightR);
        spotLightRRef.current = rimLightR;
        
        const keyLight = new THREE.DirectionalLight(0xffffff, 3.5 * baseIntensity);
        keyLight.position.set(2, 4, 5);
        scene.add(keyLight);
        keyLightRef.current = keyLight;

        // VRM LookAt Target
        const lookAtTarget = new THREE.Object3D();
        camera.add(lookAtTarget); 
        scene.add(camera);
        lookAtTargetRef.current = lookAtTarget;

        // Model Loader
        const loader = new GLTFLoader();
        loader.register((parser) => new VRMLoaderPlugin(parser));

        const activeModelUrl = modelUrl || DEFAULT_MODEL_PATH;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const isVrm = activeModelUrl.toLowerCase().endsWith('.vrm');

        loader.load(activeModelUrl, 
            (gltf) => {
                const vrm = gltf.userData.vrm;

                if (vrm) {
                    // --- VRM SETUP ---
                    vrmRef.current = vrm;
                    VRMUtils.removeUnnecessaryJoints(gltf.scene);

                    vrm.scene.rotation.y = Math.PI; 
                    
                    // Adjust Camera for VRM
                    const box = new THREE.Box3().setFromObject(vrm.scene);
                    const center = box.getCenter(new THREE.Vector3());
                    const size = box.getSize(new THREE.Vector3());
                    
                    vrm.scene.position.x += (vrm.scene.position.x - center.x);
                    vrm.scene.position.y -= box.min.y; 
                    vrm.scene.position.z += (vrm.scene.position.z - center.z);
                    
                    const faceHeight = size.y * 0.85; 
                    controls.target.set(0, faceHeight, 0);
                    camera.position.set(0, faceHeight, 5.0);
                    initialCameraPos.copy(camera.position);

                    scene.add(vrm.scene);
                    onModelLoad({ 'mouthOpen': 0, 'jawOpen': 0 });
                    console.log("VRM Loaded", vrm);

                } else {
                    // --- STANDARD GLTF SETUP ---
                    vrmRef.current = null;
                    const model = gltf.scene;
                    model.position.y = -1; 
                    scene.add(model);

                    controls.target.set(0, 1.2, 0);
                    initialCameraPos.set(0, 1.4, 9.0);
                    camera.position.copy(initialCameraPos);

                    model.traverse((node) => {
                        if (!headMeshRef.current && node instanceof THREE.Mesh && node.morphTargetInfluences) {
                            headMeshRef.current = node;
                            morphInfluencesRef.current = node.morphTargetInfluences;
                            onModelLoad(node.morphTargetDictionary as MorphTargetDictionary);
                        }
                        if (node instanceof THREE.Mesh) {
                            node.castShadow = true;
                            node.receiveShadow = true;
                            if(node.material instanceof THREE.MeshStandardMaterial) {
                                node.material.roughness = 0.4;
                                node.material.metalness = 0.6;
                            }
                        }
                    });

                    // General Animation Handling
                    const mixer = new THREE.AnimationMixer(model);
                    const clips = gltf.animations;
                    
                    if (clips && clips.length > 0) {
                        // 1. Try to find 'idle'
                        const idleClip = clips.find(c => c.name.toLowerCase().includes('idle'));
                        // 2. If no idle, play the first available clip (likely the main animation)
                        const clipToPlay = idleClip || clips[0];
                        
                        const action = mixer.clipAction(clipToPlay);
                        action.play();
                        console.log(`Playing animation: ${clipToPlay.name}`);
                    }

                    (scene as any).userData.mixer = mixer;
                }
            }, 
            (xhr) => {
                if (xhr.total > 0) {
                    onLoadProgress(Math.round((xhr.loaded / xhr.total) * 100));
                }
            }, 
            (error) => console.error('Model error:', error)
        );

        // Mouse Parallax Logic
        const handleMouseMove = (e: MouseEvent) => {
            mouseRef.current.x = (e.clientX / window.innerWidth) * 2 - 1;
            mouseRef.current.y = -(e.clientY / window.innerHeight) * 2 + 1;
        };
        window.addEventListener('mousemove', handleMouseMove);

        // Animation Loop
        const clock = new THREE.Clock();
        let animationFrameId: number;

        const animate = () => {
            animationFrameId = requestAnimationFrame(animate);
            const delta = clock.getDelta();

            controls.update();

            // 1. VRM Update
            if (vrmRef.current) {
                // LookAt
                if (vrmRef.current.lookAt) {
                    lookAtTarget.position.x = mouseRef.current.x * 1.5;
                    lookAtTarget.position.y = mouseRef.current.y * 1.0; 
                    vrmRef.current.lookAt.target = lookAtTarget;
                }
                vrmRef.current.update(delta);
            }

            // 2. GLTF Mixer Update
            if ((scene as any).userData.mixer) {
                (scene as any).userData.mixer.update(delta);
            }

            // Camera Parallax
            const parallaxX = initialCameraPos.x + (mouseRef.current.x * 0.5);
            const parallaxY = initialCameraPos.y + (mouseRef.current.y * 0.5);
            camera.position.x += (parallaxX - camera.position.x) * 0.05;
            camera.position.y += (parallaxY - camera.position.y) * 0.05;
            
            camera.lookAt(controls.target);
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
            window.removeEventListener('mousemove', handleMouseMove);
            cancelAnimationFrame(animationFrameId);
            if (currentMount && renderer.domElement) {
               currentMount.removeChild(renderer.domElement);
            }
            if (vrmRef.current) {
                VRMUtils.deepDispose(vrmRef.current.scene);
            }
        };
    }, [modelUrl, onModelLoad, onLoadProgress]);

    return <div ref={mountRef} className="w-full h-full" />;
});
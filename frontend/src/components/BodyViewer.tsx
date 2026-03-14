import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Environment, OrbitControls, useCursor, useGLTF } from '@react-three/drei';
import * as THREE from 'three';

import { aggregateMetricColor, discreteMetricColor, type MetricMode } from '../lib/colors';
import { Legend } from './Legend';
import type { ActivationLabel, AggregateActivation, BodySchemaResponse, ExerciseInference } from '../types';
import { normalizedActivationsFromExercises } from '../lib/workoutTree';

type BodyViewerProps = {
  metricMode: MetricMode;
  schema: BodySchemaResponse | null;
  selectedExercise: string;
  exercises: ExerciseInference[];
  aggregateActivations: AggregateActivation[];
  aggregateIntensityMap?: Map<string, number>;
  selectedBodyPartId: string | null;
  highlightedBodyPartIds?: Set<string>;
  onSelectBodyPart: (bodyPartId: string | null) => void;
};

type SceneBodyProps = BodyViewerProps & {
  activationLookup: Map<string, ActivationLabel>;
  cumulativeLookup: Map<string, number>;
  useNormalizedAggregate: boolean;
  meshLookup: Map<string, string>;
  isTouchDevice: boolean;
};

function normalizeMeshName(name: string) {
  return name.replace(/_/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

function transformGeometry(geometry: THREE.BufferGeometry, center: THREE.Vector3, scaleFactor: number) {
  const positionAttribute = geometry.getAttribute('position');
  if (positionAttribute) {
    const positions = positionAttribute.array as ArrayLike<number> & { [index: number]: number };
    for (let index = 0; index < positions.length; index += 3) {
      const bx = positions[index];
      const by = positions[index + 1];
      const bz = positions[index + 2];

      positions[index] = (bx - center.x) * scaleFactor;
      positions[index + 1] = (bz - center.z) * scaleFactor;
      positions[index + 2] = -(by - center.y) * scaleFactor;
    }
    positionAttribute.needsUpdate = true;
  }

  const normalAttribute = geometry.getAttribute('normal');
  if (normalAttribute) {
    const normals = normalAttribute.array as ArrayLike<number> & { [index: number]: number };
    for (let index = 0; index < normals.length; index += 3) {
      const nx = normals[index];
      const ny = normals[index + 1];
      const nz = normals[index + 2];

      normals[index] = nx;
      normals[index + 1] = nz;
      normals[index + 2] = -ny;
    }
    normalAttribute.needsUpdate = true;
  }

  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
}

function SceneBody({ activationLookup, cumulativeLookup, useNormalizedAggregate, meshLookup, selectedBodyPartId, highlightedBodyPartIds, onSelectBodyPart, metricMode, isTouchDevice }: SceneBodyProps) {
  const { scene } = useGLTF('/assets/anatomy.glb');
  const { camera } = useThree();
  const controlsRef = useRef<any>(null);
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);

  const transformedGroup = useMemo(() => {
    const root = new THREE.Group();
    const sourceBox = new THREE.Box3().setFromObject(scene);
    const sourceCenter = sourceBox.getCenter(new THREE.Vector3());
    const sourceSize = sourceBox.getSize(new THREE.Vector3());
    const targetHeight = 30;
    const scaleFactor = targetHeight / sourceSize.z;

    scene.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) {
        return;
      }

      const geometry = child.geometry.clone();
      transformGeometry(geometry, sourceCenter, scaleFactor);

      const mesh = new THREE.Mesh(geometry);
      mesh.name = child.name;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      root.add(mesh);
    });

    return root;
  }, [scene]);

  useEffect(() => {
    transformedGroup.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) {
        return;
      }

      const bodyPartId = meshLookup.get(normalizeMeshName(child.name));
      const label = bodyPartId ? activationLookup.get(bodyPartId) ?? 'none' : 'none';
      const cumulativeScore = bodyPartId ? cumulativeLookup.get(bodyPartId) ?? 0 : 0;
      child.userData.bodyPartId = bodyPartId;
      if (child.userData.selectionOutline) {
        const existingOutline = child.userData.selectionOutline as THREE.LineSegments;
        child.remove(existingOutline);
        existingOutline.geometry.dispose();
        (existingOutline.material as THREE.Material).dispose();
      }
      const isSelected = bodyPartId === selectedBodyPartId;
      const isHighlighted = Boolean(bodyPartId && highlightedBodyPartIds?.has(bodyPartId));
      const hasOutline = isSelected || isHighlighted;
      child.material = new THREE.MeshStandardMaterial({
        color: hasOutline
          ? '#3f7cff'
          : useNormalizedAggregate
            ? aggregateMetricColor(cumulativeScore, metricMode)
            : discreteMetricColor(label, metricMode),
        roughness: 0.55,
        metalness: 0,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: useNormalizedAggregate ? (cumulativeScore > 0 ? 0.98 : 0.35) : (label === 'none' ? 0.45 : 0.96),
        emissive: new THREE.Color(hasOutline ? '#163a8a' : '#000000'),
        emissiveIntensity: hasOutline ? 0.45 : 0
      });

      if (hasOutline) {
        const edges = new THREE.EdgesGeometry(child.geometry, 25);
        const outline = new THREE.LineSegments(
          edges,
          new THREE.LineBasicMaterial({ color: '#163a8a', linewidth: 2 })
        );
        outline.scale.setScalar(1.01);
        child.add(outline);
        child.userData.selectionOutline = outline;
      }
    });
  }, [activationLookup, highlightedBodyPartIds, meshLookup, metricMode, selectedBodyPartId, transformedGroup, useNormalizedAggregate, cumulativeLookup]);

  useEffect(() => {
    transformedGroup.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(transformedGroup);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const perspectiveCamera = camera as THREE.PerspectiveCamera;
    const distance = Math.max((maxDim / 2) / Math.tan(THREE.MathUtils.degToRad(perspectiveCamera.fov / 2)) * 1.35, 32);

    perspectiveCamera.position.set(center.x, center.y + size.y * 0.08, center.z + distance);
    perspectiveCamera.near = 0.1;
    perspectiveCamera.far = 500;
    perspectiveCamera.updateProjectionMatrix();

    if (controlsRef.current) {
      controlsRef.current.target.copy(center);
      controlsRef.current.minDistance = 8;
      controlsRef.current.maxDistance = 120;
      controlsRef.current.update();
    }
  }, [camera, transformedGroup]);

  return (
    <>
      <primitive
        object={transformedGroup}
        onPointerOver={(event: { object: THREE.Object3D }) => {
          if (meshLookup.has(normalizeMeshName(event.object.name))) {
            setHovered(true);
          }
        }}
        onPointerOut={() => setHovered(false)}
        onClick={(event: { object: THREE.Object3D; stopPropagation: () => void }) => {
          event.stopPropagation();
          onSelectBodyPart(meshLookup.get(normalizeMeshName(event.object.name)) ?? null);
        }}
      />
      <OrbitControls
        ref={controlsRef}
        makeDefault
        enablePan={!isTouchDevice}
        enableRotate
        enableZoom
        screenSpacePanning
        dampingFactor={0.08}
        enableDamping
        rotateSpeed={isTouchDevice ? 0.75 : 0.9}
        panSpeed={0.9}
        zoomSpeed={isTouchDevice ? 0.85 : 0.9}
        mouseButtons={{
          LEFT: THREE.MOUSE.ROTATE,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.PAN
        }}
        touches={{
          ONE: THREE.TOUCH.ROTATE,
          TWO: isTouchDevice ? THREE.TOUCH.DOLLY_ROTATE : THREE.TOUCH.DOLLY_PAN
        }}
      />
    </>
  );
}

export function BodyViewer(props: BodyViewerProps) {
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(pointer: coarse)');
    const updateInputMode = () => setIsTouchDevice(mediaQuery.matches);

    updateInputMode();

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', updateInputMode);
      return () => mediaQuery.removeEventListener('change', updateInputMode);
    }

    mediaQuery.addListener(updateInputMode);
    return () => mediaQuery.removeListener(updateInputMode);
  }, []);

  const matchingExercise = useMemo(
    () => props.exercises.find((item) => item.exercise_name === props.selectedExercise || item.path.join(' > ') === props.selectedExercise),
    [props.exercises, props.selectedExercise]
  );
  const useNormalizedAggregate = props.selectedExercise === '__aggregate__' || !matchingExercise ? props.exercises.length > 1 : false;

  const activationLookup = useMemo(() => {
    const map = new Map<string, ActivationLabel>();

    if (props.selectedExercise === '__aggregate__' || !matchingExercise) {
      props.aggregateActivations.forEach((item) => map.set(item.body_part_id, props.metricMode === 'load' ? item.load_label : item.endurance_label));
    } else {
      matchingExercise.activations.forEach((item) => map.set(item.body_part_id, props.metricMode === 'load' ? item.load_label : item.endurance_label));
    }

    return map;
  }, [matchingExercise, props.aggregateActivations, props.exercises, props.metricMode, props.selectedExercise]);

  const cumulativeLookup = useMemo(() => {
    const map = new Map<string, number>(props.aggregateIntensityMap ?? []);
    if (!useNormalizedAggregate) {
      return map;
    }
    if (map.size === 0) {
      normalizedActivationsFromExercises(props.exercises, props.metricMode).forEach((item) => map.set(item.body_part_id, item.display_intensity));
    }
    return map;
  }, [props.aggregateIntensityMap, props.exercises, props.metricMode, useNormalizedAggregate]);

  const meshLookup = useMemo(() => {
    const map = new Map<string, string>();
    props.schema?.body_parts.forEach((part) => {
      map.set(normalizeMeshName(part.mesh_name), part.body_part_id);
      part.aliases.forEach((alias) => map.set(normalizeMeshName(alias), part.body_part_id));
    });
    return map;
  }, [props.schema]);

  return (
    <div className="viewer-shell">
      <Canvas camera={{ position: [0, 8, 42], fov: 50 }} onPointerMissed={() => props.onSelectBodyPart(null)}>
        <color attach="background" args={['#111315']} />
        <ambientLight intensity={1.1} />
        <directionalLight position={[10, 20, 15]} intensity={1.5} color="#f3d6d2" />
        <directionalLight position={[-10, 10, -10]} intensity={0.8} color="#d24b4b" />
        <directionalLight position={[0, 5, -20]} intensity={0.35} color="#5f0f17" />
        <Suspense fallback={null}>
          <SceneBody {...props} activationLookup={activationLookup} cumulativeLookup={cumulativeLookup} useNormalizedAggregate={useNormalizedAggregate} meshLookup={meshLookup} isTouchDevice={isTouchDevice} />
          <Environment preset="warehouse" />
        </Suspense>
      </Canvas>
      <Legend className="legend-overlay" aggregateMode={useNormalizedAggregate} metricMode={props.metricMode} />
      <div className="viewer-note">{isTouchDevice ? 'Drag to rotate, pinch to zoom, and tap a region to inspect it.' : 'Left-drag to rotate, right-drag to pan, scroll to zoom, and click a region to inspect it.'}</div>
    </div>
  );
}

useGLTF.preload('/assets/anatomy.glb');

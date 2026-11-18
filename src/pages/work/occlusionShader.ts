import * as THREE from "three";

export interface MaterialDefaults {
  baseOpacity: number;
  baseTransparent: boolean;
  baseDepthWrite: boolean;
  baseSide: THREE.Side;
  baseBlending: THREE.Blending;
}

export interface OcclusionShaderHandle {
  uOccActive: { value: number };
  uOccOpacity: { value: number };
  uManualOpacity: { value: number };
  defaults: MaterialDefaults;
}

/** Shared camera-to-target sightline uniforms updated once per frame for zero-allocation GPU shading. */
export const SHARED_OCCLUSION_UNIFORMS = {
  uOccCamPos: { value: new THREE.Vector3() },
  uOccTargetPos: { value: new THREE.Vector3() },
  uOccRadius: { value: 2.6 },
  uOccRimColor: { value: new THREE.Color("#22d3ee") },
};

const VERT_DECLS = /* glsl */ `
varying vec3 vOccWorldPos;
varying vec3 vOccWorldNormal;
`;

const VERT_BODY = /* glsl */ `
vec4 occWorldPos = vec4( transformed, 1.0 );
vec3 occWorldNormal = normal;
#ifdef USE_INSTANCING
  occWorldPos = instanceMatrix * occWorldPos;
  occWorldNormal = mat3( instanceMatrix ) * occWorldNormal;
#endif
occWorldPos = modelMatrix * occWorldPos;
occWorldNormal = normalize( mat3( modelMatrix ) * occWorldNormal );
vOccWorldPos = occWorldPos.xyz;
vOccWorldNormal = occWorldNormal;
`;

const FRAG_DECLS = /* glsl */ `
uniform float uOccActive;
uniform float uOccOpacity;
uniform float uManualOpacity;
uniform vec3 uOccCamPos;
uniform vec3 uOccTargetPos;
uniform float uOccRadius;
uniform vec3 uOccRimColor;
varying vec3 vOccWorldPos;
varying vec3 vOccWorldNormal;
`;

const FRAG_BODY = /* glsl */ `
#include <opaque_fragment>
float occBlend = clamp(uOccActive, 0.0, 1.0);
if (occBlend > 0.001) {
  vec3 segAB = uOccTargetPos - uOccCamPos;
  float segLenSq = max(dot(segAB, segAB), 0.0001);
  float tProj = clamp(dot(vOccWorldPos - uOccCamPos, segAB) / segLenSq, 0.0, 1.0);
  vec3 closestPt = uOccCamPos + segAB * tProj;
  float distToSight = length(vOccWorldPos - closestPt);

  // Smooth alpha-blending sightline corridor: clearest near the center of the camera->target ray
  float corridor = 1.0 - smoothstep(uOccRadius * 0.42, uOccRadius, distToSight);
  float spatialFactor = mix(0.45, 1.0, corridor);
  float occAlpha = mix(1.0, clamp(uOccOpacity, 0.05, 0.95), occBlend * spatialFactor);

  // Subtle holographic Fresnel rim so faded walls/racks keep readable spatial edges
  vec3 viewVec = normalize(uOccCamPos - vOccWorldPos);
  float fresnel = pow(1.0 - abs(dot(normalize(vOccWorldNormal), viewVec)), 2.5);
  gl_FragColor.rgb += uOccRimColor * fresnel * occBlend * (0.25 + 0.35 * corridor);
  gl_FragColor.a *= occAlpha * clamp(uManualOpacity, 0.05, 1.0);
} else {
  gl_FragColor.a *= clamp(uManualOpacity, 0.05, 1.0);
}
`;

export function updateOcclusionShaderUniforms(
  camPos: THREE.Vector3,
  targetPos: THREE.Vector3,
  corridorRadius = 2.6,
) {
  SHARED_OCCLUSION_UNIFORMS.uOccCamPos.value.copy(camPos);
  SHARED_OCCLUSION_UNIFORMS.uOccTargetPos.value.copy(targetPos);
  SHARED_OCCLUSION_UNIFORMS.uOccRadius.value = corridorRadius;
}

/**
 * Installs a GLSL alpha-blending + sightline corridor occlusion shader on a Three.js
 * material via onBeforeCompile, preserving PBR lighting, textures, and instancing.
 */
export function installOcclusionShader(
  material: THREE.Material,
  initialOpacity = 0.22,
  initialActive = 0,
): OcclusionShaderHandle {
  const existing = material.userData.occHandle as OcclusionShaderHandle | undefined;
  if (existing) return existing;

  const std = material as THREE.MeshStandardMaterial;
  const defaults: MaterialDefaults = {
    baseOpacity: std.opacity ?? 1,
    baseTransparent: std.transparent,
    baseDepthWrite: std.depthWrite,
    baseSide: std.side,
    baseBlending: std.blending,
  };

  const handle: OcclusionShaderHandle = {
    uOccActive: { value: initialActive },
    uOccOpacity: { value: initialOpacity },
    uManualOpacity: { value: 1 },
    defaults,
  };

  material.userData.occHandle = handle;
  material.customProgramCacheKey = () => `evol_occlusion_alpha_shader_v1_${material.type}`;

  const prevOnBeforeCompile = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (prevOnBeforeCompile) prevOnBeforeCompile(shader, renderer);

    shader.uniforms.uOccActive = handle.uOccActive;
    shader.uniforms.uOccOpacity = handle.uOccOpacity;
    shader.uniforms.uManualOpacity = handle.uManualOpacity;
    shader.uniforms.uOccCamPos = SHARED_OCCLUSION_UNIFORMS.uOccCamPos;
    shader.uniforms.uOccTargetPos = SHARED_OCCLUSION_UNIFORMS.uOccTargetPos;
    shader.uniforms.uOccRadius = SHARED_OCCLUSION_UNIFORMS.uOccRadius;
    shader.uniforms.uOccRimColor = SHARED_OCCLUSION_UNIFORMS.uOccRimColor;

    if (!shader.vertexShader.includes("vOccWorldPos")) {
      shader.vertexShader = `${VERT_DECLS}\n${shader.vertexShader}`;
      if (shader.vertexShader.includes("#include <project_vertex>")) {
        shader.vertexShader = shader.vertexShader.replace(
          "#include <project_vertex>",
          `#include <project_vertex>\n${VERT_BODY}`,
        );
      }
    }

    if (!shader.fragmentShader.includes("uOccActive")) {
      shader.fragmentShader = `${FRAG_DECLS}\n${shader.fragmentShader}`;
      if (shader.fragmentShader.includes("#include <opaque_fragment>")) {
        shader.fragmentShader = shader.fragmentShader.replace("#include <opaque_fragment>", FRAG_BODY);
      }
    }
  };

  if (initialActive > 0.005) {
    material.transparent = true;
    material.blending = THREE.NormalBlending;
    material.depthWrite = false;
    material.side = THREE.DoubleSide;
  }

  material.needsUpdate = true;
  return handle;
}

/**
 * Smoothly damps an object's occlusion shader weight and synchronizes WebGL alpha-blending state.
 */
export function stepOcclusionMaterial(
  mat: THREE.Material,
  handle: OcclusionShaderHandle,
  occluding: boolean,
  occlusionOpacity: number,
  manualOpacity: number,
  dt: number,
) {
  handle.uOccOpacity.value = occlusionOpacity;
  handle.uManualOpacity.value = manualOpacity;

  const targetActive = occluding ? 1 : 0;
  const current = handle.uOccActive.value;
  if (Math.abs(current - targetActive) > 0.004) {
    handle.uOccActive.value = THREE.MathUtils.damp(current, targetActive, 13, Math.min(dt, 0.05));
  } else {
    handle.uOccActive.value = targetActive;
  }

  const translucent = handle.uOccActive.value > 0.015 || manualOpacity < 0.985;
  const nextTransparent = handle.defaults.baseTransparent || translucent;
  if (mat.transparent !== nextTransparent) {
    mat.transparent = nextTransparent;
    mat.needsUpdate = true;
  }
  mat.blending = translucent ? THREE.NormalBlending : handle.defaults.baseBlending;
  mat.depthWrite = translucent ? false : handle.defaults.baseDepthWrite;
  mat.side = translucent ? THREE.DoubleSide : handle.defaults.baseSide;
}

import * as THREE from "three";
import type { JointDef } from "../../lib/workTypes";

/** sand3d writes every joint as a named node: `userData.s3d_joint` = { name, type, axis, lower, upper },
 *  with the moving part as the node's child. The axis is in the NODE's local space and the node may
 *  carry its own rest rotation (the robot's wheels do), so motion is always applied relative to the
 *  rest pose instead of overwriting it. */
export interface JointRig {
  def: JointDef;
  node: THREE.Object3D;
  axis: THREE.Vector3;
  restPos: THREE.Vector3;
  restQuat: THREE.Quaternion;
  parentScale: number;  // node units -> metres (sand3d nodes are in mm under a scaled root)
  value: number;        // current value: radians, or metres for prismatic
  spinSign: number;     // +1 if a positive angle rolls a wheel forward (+X) — used by the runtime
  side: number;         // +1 / -1: which side of the vehicle the joint sits on (sign of local Z)
}

const FORWARD_ROLL_AXIS = new THREE.Vector3(0, 0, -1); // rolling toward +X is a rotation about -Z

export function buildRig(root: THREE.Object3D): JointRig[] {
  root.updateMatrixWorld(true);
  const out: JointRig[] = [];
  const v = new THREE.Vector3();
  root.traverse((o) => {
    const j = o.userData?.s3d_joint;
    if (!j || !Array.isArray(j.axis)) return;
    const axis = new THREE.Vector3(j.axis[0], j.axis[1], j.axis[2]).normalize();
    const restQuat = o.quaternion.clone();
    out.push({
      def: { name: j.name ?? o.name, type: j.type, lower: j.lower ?? 0, upper: j.upper ?? 0 },
      node: o, axis,
      restPos: o.position.clone(), restQuat,
      parentScale: o.parent ? o.parent.getWorldScale(v).x || 1 : 1,
      value: 0,
      spinSign: axis.clone().applyQuaternion(restQuat).dot(FORWARD_ROLL_AXIS) >= 0 ? 1 : -1,
      side: o.position.z >= 0 ? 1 : -1,
    });
  });
  return out;
}

const _q = new THREE.Quaternion();
const _d = new THREE.Vector3();
export function applyJoint(r: JointRig, value: number) {
  r.value = value;
  if (r.def.type === "prismatic") {
    _d.copy(r.axis).applyQuaternion(r.restQuat).multiplyScalar(value / r.parentScale);
    r.node.position.copy(r.restPos).add(_d);
  } else {
    r.node.quaternion.copy(r.restQuat).multiply(_q.setFromAxisAngle(r.axis, value));
  }
}

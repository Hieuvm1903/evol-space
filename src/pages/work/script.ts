/** A small, safe behaviour language for Play mode — one command per line, `#` starts a comment.
 *  It is parsed (never eval'd), so a saved scene can't run arbitrary code.
 *
 *    speed <m/s>                      set drive speed
 *    alt <metres>                     target altitude for aerial drones
 *    joint <name> <value>             move any named joint (radians or metres)
 *    goto <label> [dx dz]             drive to an object (+ optional offset);  goto <x> <z>  for a point
 *    face <label>                     turn to look at an object
 *    turn <degrees>                   turn relative to the current heading
 *    lift <metres>                    move the lift joint (waits until it arrives)
 *    wait <seconds>
 *    pick <label|asset>               grab the nearest matching object within reach of the platform
 *    place <label> [dy] [dx] [dz]     drop the carried object on a target (+ offset; dy = height)
 *    belt [speed] [length] [width] [top]   make this object a conveyor belt
 *    loop [n] ... end                 repeat (forever if n is omitted)
 *    halt                             stop the script
 */
export type Instr =
  | { op: "speed"; value: number }
  | { op: "alt"; value: number }
  | { op: "joint"; name: string; value: number }
  | { op: "goto"; label: string | null; x: number; z: number; dx: number; dz: number }
  | { op: "face"; label: string }
  | { op: "turn"; deg: number }
  | { op: "lift"; value: number }
  | { op: "wait"; seconds: number }
  | { op: "pick"; query: string }
  | { op: "place"; label: string; dy: number; dx: number; dz: number }
  | { op: "belt"; speed: number; length: number; width: number; top: number }
  | { op: "loop"; count: number }
  | { op: "end" }
  | { op: "halt" };

export interface ParseError { line: number; message: string }
export interface ParseResult { program: Instr[]; errors: ParseError[] }

function tokenize(line: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) out.push(m[1] ?? m[2]);
  return out;
}

export function parseScript(src: string): ParseResult {
  const program: Instr[] = [];
  const errors: ParseError[] = [];
  let depth = 0;

  src.split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1;
    const text = raw.replace(/#.*$/, "").trim();
    if (!text) return;
    const t = tokenize(text);
    const cmd = t[0].toLowerCase();
    const err = (message: string) => errors.push({ line, message });
    const isNum = (s?: string) => s !== undefined && s !== "" && Number.isFinite(Number(s));
    const num = (s: string | undefined, name: string, def?: number): number | null => {
      if (s === undefined) { if (def !== undefined) return def; err(`'${cmd}' needs ${name}`); return null; }
      if (!isNum(s)) { err(`'${s}' is not a number (${name})`); return null; }
      return Number(s);
    };

    switch (cmd) {
      case "speed": { const v = num(t[1], "a speed"); if (v !== null) { if (v <= 0) err("speed must be > 0"); else program.push({ op: "speed", value: v }); } break; }
      case "alt": { const v = num(t[1], "an altitude in metres"); if (v !== null) program.push({ op: "alt", value: Math.max(0, v) }); break; }
      case "joint": {
        if (!t[1]) { err("'joint' needs <name> <value>"); break; }
        const v = num(t[2], "a target value");
        if (v !== null) program.push({ op: "joint", name: t[1], value: v });
        break;
      }
      case "goto": {
        if (t.length < 2) { err("'goto' needs a label or x z"); break; }
        if (isNum(t[1]) && isNum(t[2])) program.push({ op: "goto", label: null, x: Number(t[1]), z: Number(t[2]), dx: 0, dz: 0 });
        else {
          const dx = num(t[2], "dx", 0), dz = num(t[3], "dz", 0);
          if (dx !== null && dz !== null) program.push({ op: "goto", label: t[1], x: 0, z: 0, dx, dz });
        }
        break;
      }
      case "face": if (!t[1]) err("'face' needs a label"); else program.push({ op: "face", label: t[1] }); break;
      case "turn": { const v = num(t[1], "degrees"); if (v !== null) program.push({ op: "turn", deg: v }); break; }
      case "lift": { const v = num(t[1], "a height in metres"); if (v !== null) program.push({ op: "lift", value: v }); break; }
      case "wait": { const v = num(t[1], "seconds"); if (v !== null) program.push({ op: "wait", seconds: Math.max(0, v) }); break; }
      case "pick": if (!t[1]) err("'pick' needs a label or asset name"); else program.push({ op: "pick", query: t[1] }); break;
      case "place": {
        if (!t[1]) { err("'place' needs a target label"); break; }
        const dy = num(t[2], "dy", 0), dx = num(t[3], "dx", 0), dz = num(t[4], "dz", 0);
        if (dy !== null && dx !== null && dz !== null) program.push({ op: "place", label: t[1], dy, dx, dz });
        break;
      }
      case "belt": {
        const speed = num(t[1], "speed", 0.4), length = num(t[2], "length", 2), width = num(t[3], "width", 0.64), top = num(t[4], "top", 0.75);
        if (speed !== null && length !== null && width !== null && top !== null) program.push({ op: "belt", speed, length, width, top });
        break;
      }
      case "loop": {
        const n = t[1] === undefined ? Infinity : num(t[1], "a count");
        if (n !== null) { if (n < 1) err("loop count must be >= 1"); else { program.push({ op: "loop", count: n }); depth++; } }
        break;
      }
      case "end": if (depth === 0) err("'end' without a matching 'loop'"); else { depth--; program.push({ op: "end" }); } break;
      case "halt": program.push({ op: "halt" }); break;
      default: err(`unknown command '${t[0]}'`);
    }
  });
  if (depth > 0) errors.push({ line: src.split(/\r?\n/).length, message: "'loop' is missing its 'end'" });
  return { program, errors };
}

export const SCRIPT_TEMPLATES: { name: string; script: string }[] = [
  {
    name: "Tote transfer: rack → conveyor",
    script: `# Edit the labels (R0-3, CV-1) to match your objects.
speed 1.2
loop
  goto R0-3 0 1.25      # park in the aisle in front of the rack
  face R0-3
  lift 0.15             # raise the platform to tote height
  pick tote             # grab the nearest tote within reach
  lift 0
  goto 5.9 1.25         # leave the aisle...
  goto 5.9 3.75         # ...and go round to the conveyor
  place CV-1 0.75       # drop it on the belt (belt top is 0.75 m)
  wait 1
  goto 5.9 1.25
end
`,
  },
  {
    name: "Patrol a rectangle",
    script: `speed 1.0
loop
  goto -6.9 1.25
  goto 5.8 1.25
  goto 5.8 -1.0
  goto -6.9 -1.0
end
`,
  },
  { name: "Conveyor belt", script: `# Moves anything resting on top of it along its local +X axis.\nbelt 0.4 2 0.64 0.75\n` },
];

export type RobotProfileId =
  | "robot"
  | "robot_arm"
  | "robot_transfer"
  | "drone"
  | "humanoid"
  | "truck"
  | "conveyor"
  | "custom";

export interface RobotProfileMeta {
  id: RobotProfileId;
  label: string;
  subtitle: string;
  assetKey: string | null;
  defaultJoints: string[];
}

export interface RobotScriptTemplate {
  id: string;
  profile: RobotProfileId;
  name: string;
  summary: string;
  tags: string[];
  script: string;
}

export const ROBOT_PROFILES: RobotProfileMeta[] = [
  {
    id: "robot",
    label: "AMR Mobile Robot",
    subtitle: "Wheeled carrier with prismatic lift platform",
    assetKey: "robot",
    defaultJoints: ["lift_slide", "wheel_l_spin", "wheel_r_spin"],
  },
  {
    id: "robot_arm",
    label: "6-DOF Robot Arm",
    subtitle: "Articulated base, shoulder, elbow, wrist & gripper",
    assetKey: "robot_arm",
    defaultJoints: ["base_yaw", "shoulder_pitch", "elbow_pitch", "wrist_roll", "finger_l_slide", "finger_r_slide"],
  },
  {
    id: "robot_transfer",
    label: "ASRS Transfer Shuttle",
    subtitle: "Rail carriage, mast lift & telescopic fork",
    assetKey: "robot_transfer",
    defaultJoints: ["travel_slide", "lift_slide", "fork_slide"],
  },
  {
    id: "drone",
    label: "Aerial Quadrotor Drone",
    subtitle: "Vertical altitude climb & airborne waypoint flight",
    assetKey: "drone",
    defaultJoints: ["rotor_fl_spin", "rotor_fr_spin", "rotor_rl_spin", "rotor_rr_spin"],
  },
  {
    id: "humanoid",
    label: "Humanoid Operator",
    subtitle: "Bipedal walking gait + articulated head & arms",
    assetKey: "humanoid",
    defaultJoints: ["head_yaw", "elbow_l_pitch", "elbow_r_pitch", "knee_l_pitch", "knee_r_pitch"],
  },
  {
    id: "truck",
    label: "Dock Delivery Truck",
    subtitle: "4-wheel dock approach & shuttle",
    assetKey: "truck",
    defaultJoints: ["wheel_f_l_spin", "wheel_f_r_spin", "wheel_r_l_spin", "wheel_r_r_spin"],
  },
  {
    id: "conveyor",
    label: "Conveyor Belt",
    subtitle: "Drives cargo resting on the belt surface",
    assetKey: "conveyor",
    defaultJoints: [],
  },
  {
    id: "custom",
    label: "Custom / AI Model",
    subtitle: "Uses detected s3d_joint rigs or drive waypoints",
    assetKey: null,
    defaultJoints: [],
  },
];

export const ROBOT_SCRIPT_TEMPLATES: RobotScriptTemplate[] = [
  // --- AMR Mobile Robot ---
  {
    id: "amr-tote-demo",
    profile: "robot",
    name: "Pick & Place Tote (Rack → Conveyor)",
    summary: "Drives to R0-3, raises lift, picks tote, carries to CV-1 and drops it onto the belt.",
    tags: ["goto", "face", "lift", "pick", "place"],
    script: `# Works in both the 3D demo and warehouse layout!
speed 1.3
loop
  goto R0-3 0 1.0       # approach rack R0-3
  face R0-3
  lift 0.16             # raise platform to tote height
  pick tote             # grab nearest tote
  lift 0.02
  goto CV-1 -1.1 0      # carry tote to conveyor CV-1
  face CV-1
  place CV-1 0.75       # drop onto belt top (0.75 m)
  wait 0.8
  goto 0 0
end
`,
  },
  {
    id: "amr-patrol",
    profile: "robot",
    name: "Square Floor Patrol",
    summary: "Smoothly drives a closed rectangular patrol with corner pauses.",
    tags: ["speed", "goto", "wait", "loop"],
    script: `speed 1.2
loop
  goto 2.2 -1.6
  wait 0.3
  goto 2.2 1.6
  wait 0.3
  goto -2.2 1.6
  wait 0.3
  goto -2.2 -1.6
  wait 0.3
end
`,
  },
  {
    id: "amr-lift-check",
    profile: "robot",
    name: "Lift & Pivot Calibration",
    summary: "Tests prismatic lift travel and in-place differential wheel turning.",
    tags: ["lift", "turn", "wait"],
    script: `speed 1.0
loop
  lift 0.28
  wait 0.5
  turn 90
  lift 0.0
  wait 0.4
  turn 90
end
`,
  },

  // --- 6-DOF Robot Arm ---
  {
    id: "arm-pick-place",
    profile: "robot_arm",
    name: "Pick & Place Workcell Cycle",
    summary: "Rotates base, pitches shoulder/elbow to grasp, lifts, swings 90°, and releases.",
    tags: ["base_yaw", "shoulder_pitch", "elbow_pitch", "gripper"],
    script: `# 6-DOF industrial arm pick-and-place
loop
  joint base_yaw 0.0
  joint shoulder_pitch -0.45
  joint elbow_pitch -0.85
  joint finger_l_slide 0.035
  joint finger_r_slide 0.035
  wait 0.35
  joint finger_l_slide 0.005
  joint finger_r_slide 0.005
  joint shoulder_pitch 0.15
  joint elbow_pitch -0.35
  joint base_yaw 1.55
  joint shoulder_pitch -0.35
  joint wrist_roll 1.57
  wait 0.3
  joint finger_l_slide 0.035
  joint finger_r_slide 0.035
  joint shoulder_pitch 0.0
  joint wrist_roll 0.0
end
`,
  },
  {
    id: "arm-scan",
    profile: "robot_arm",
    name: "Sensor Sweep & Calibration",
    summary: "Sweeps the turret left and right while flexing shoulder, elbow, and wrist.",
    tags: ["base_yaw", "wrist_roll", "loop"],
    script: `loop
  joint shoulder_pitch -0.25
  joint elbow_pitch -0.6
  joint base_yaw -1.1
  joint wrist_roll 0.8
  wait 0.3
  joint base_yaw 1.1
  joint wrist_roll -0.8
  wait 0.3
end
`,
  },

  // --- ASRS Transfer Shuttle ---
  {
    id: "xfer-fetch-store",
    profile: "robot_transfer",
    name: "ASRS Aisle Fetch & Store",
    summary: "Slides along rack rail, elevates lift carriage, and extends telescopic forks.",
    tags: ["travel_slide", "lift_slide", "fork_slide"],
    script: `# ASRS rail shuttle cycle (metres)
loop
  joint travel_slide 0.2
  joint lift_slide 0.1
  joint fork_slide 0.45
  wait 0.35
  joint fork_slide 0.0
  joint travel_slide 2.2
  joint lift_slide 1.1
  joint fork_slide 0.48
  wait 0.35
  joint fork_slide 0.0
  joint lift_slide 0.1
end
`,
  },
  {
    id: "xfer-vertical",
    profile: "robot_transfer",
    name: "Multi-Tier Mast Test",
    summary: "Steps lift_slide across three rack shelf elevations.",
    tags: ["lift_slide", "wait"],
    script: `loop
  joint lift_slide 0.1
  wait 0.4
  joint lift_slide 0.8
  wait 0.4
  joint lift_slide 1.5
  wait 0.4
end
`,
  },

  // --- Aerial Quadrotor Drone ---
  {
    id: "drone-inventory-sweep",
    profile: "drone",
    name: "High-Bay Inventory Flight",
    summary: "Takes off to altitude, spins all 4 rotors, and flies an aerial inspection loop.",
    tags: ["alt", "speed", "goto"],
    script: `speed 2.2
alt 2.2
wait 0.6
loop
  goto -2.2 -1.6
  wait 0.4
  goto 2.2 -1.6
  wait 0.4
  goto 2.2 1.6
  wait 0.4
  goto -2.2 1.6
  wait 0.4
end
`,
  },
  {
    id: "drone-hover-scan",
    profile: "drone",
    name: "Hover & 360° Yaw Scan",
    summary: "Climbs to hover height, turns in 90° increments, then descends to pad.",
    tags: ["alt", "turn", "wait"],
    script: `speed 1.6
loop
  alt 2.0
  wait 0.8
  turn 90
  wait 0.4
  turn 90
  wait 0.4
  turn 180
  wait 0.5
  alt 0.0
  wait 1.2
end
`,
  },

  // --- Humanoid Operator ---
  {
    id: "humanoid-patrol-scan",
    profile: "humanoid",
    name: "Aisle Walk & Head Scan",
    summary: "Walks with automatic arm/leg gait between stations and turns head to inspect racks.",
    tags: ["goto", "head_yaw", "wait"],
    script: `speed 1.05
loop
  goto -2.0 0.8
  joint head_yaw 0.85
  wait 0.4
  joint head_yaw -0.85
  wait 0.4
  joint head_yaw 0.0
  goto 2.0 -0.8
  joint elbow_r_pitch -1.1
  wait 0.5
  joint elbow_r_pitch -0.25
end
`,
  },
  {
    id: "humanoid-station-check",
    profile: "humanoid",
    name: "Station Inspection Pose",
    summary: "Alternates head scan and forearm inspection gestures in place.",
    tags: ["head_yaw", "elbow_l_pitch", "elbow_r_pitch"],
    script: `loop
  joint head_yaw 0.7
  joint elbow_l_pitch -1.0
  wait 0.5
  joint head_yaw -0.7
  joint elbow_l_pitch -0.2
  joint elbow_r_pitch -1.0
  wait 0.5
  joint head_yaw 0.0
  joint elbow_r_pitch -0.2
end
`,
  },

  // --- Truck ---
  {
    id: "truck-dock-shuttle",
    profile: "truck",
    name: "Dock Approach & Shuttle",
    summary: "Drives between staging bay and loading dock with spinning wheels.",
    tags: ["speed", "goto", "wait"],
    script: `speed 1.7
loop
  goto 2.4 0
  wait 1.2
  goto -2.4 0
  wait 1.0
end
`,
  },

  // --- Conveyor ---
  {
    id: "conveyor-standard",
    profile: "conveyor",
    name: "Standard Conveyor (0.45 m/s)",
    summary: "Moves any totes/cargo placed on top along the belt's local +X axis.",
    tags: ["belt"],
    script: `# belt <speed> <length> <width> <top_height>
belt 0.45 2 0.64 0.75
`,
  },
  {
    id: "conveyor-fast",
    profile: "conveyor",
    name: "High-Speed Sortation (0.95 m/s)",
    summary: "Fast transfer belt for high-throughput sorting lanes.",
    tags: ["belt"],
    script: `belt 0.95 2 0.64 0.75
`,
  },

  // --- Custom / AI ---
  {
    id: "custom-orbit",
    profile: "custom",
    name: "Waypoint Drive & Turn Loop",
    summary: "Drives any dynamic model through 4 floor waypoints.",
    tags: ["speed", "goto", "turn"],
    script: `speed 1.1
loop
  goto 2.0 0
  turn 90
  goto 2.0 2.0
  goto -2.0 2.0
  goto -2.0 0
end
`,
  },
];

export const SCRIPT_COMMANDS: { cmd: string; snippet: string; desc: string }[] = [
  { cmd: "speed", snippet: "speed 1.2", desc: "Set drive speed (m/s)" },
  { cmd: "goto", snippet: "goto 2.0 1.5", desc: "Drive to <x> <z> or <label> [dx dz]" },
  { cmd: "face", snippet: "face R0-3", desc: "Turn toward target object" },
  { cmd: "turn", snippet: "turn 90", desc: "Rotate relative degrees" },
  { cmd: "lift", snippet: "lift 0.16", desc: "Move AMR lift_slide (m)" },
  { cmd: "alt", snippet: "alt 2.2", desc: "Set drone altitude (m)" },
  { cmd: "joint", snippet: "joint base_yaw 1.2", desc: "Drive any joint <name> <val>" },
  { cmd: "pick", snippet: "pick tote", desc: "Grab nearest matching item" },
  { cmd: "place", snippet: "place CV-1 0.75", desc: "Drop item on target [dy dx dz]" },
  { cmd: "belt", snippet: "belt 0.45 2 0.64 0.75", desc: "Activate conveyor belt physics" },
  { cmd: "wait", snippet: "wait 0.5", desc: "Pause execution (seconds)" },
  { cmd: "loop", snippet: "loop\n  wait 0.5\nend", desc: "Repeat block (forever or N times)" },
];

export function assetToProfileId(asset: string | null | undefined): RobotProfileId {
  switch (asset) {
    case "robot":
    case "robot_arm":
    case "robot_transfer":
    case "drone":
    case "humanoid":
    case "truck":
    case "conveyor":
      return asset;
    default:
      return "custom";
  }
}

export function buildCustomJointTemplate(
  joints: { name: string; type: "revolute" | "continuous" | "prismatic"; lower: number; upper: number }[],
): RobotScriptTemplate | null {
  if (!joints.length) return null;
  const lines = ["# Auto-generated cycle for detected joints", "loop"];
  for (const j of joints.slice(0, 6)) {
    const hi =
      j.type === "continuous"
        ? 1.57
        : Number((j.lower + (j.upper - j.lower) * 0.8).toFixed(2));
    lines.push(`  joint ${j.name} ${hi}`);
  }
  lines.push("  wait 0.4");
  for (const j of joints.slice(0, 6)) {
    const lo =
      j.type === "continuous"
        ? 0
        : Number((j.lower + (j.upper - j.lower) * 0.15).toFixed(2));
    lines.push(`  joint ${j.name} ${lo}`);
  }
  lines.push("  wait 0.4", "end");
  return {
    id: "custom-detected-joints",
    profile: "custom",
    name: `Articulate Detected Joints (${joints.length})`,
    summary: `Animates this model's detected joints: ${joints.slice(0, 4).map((j) => j.name).join(", ")}${joints.length > 4 ? "…" : ""}.`,
    tags: joints.slice(0, 4).map((j) => j.name),
    script: lines.join("\n") + "\n",
  };
}

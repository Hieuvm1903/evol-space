/** A small, safe behaviour language for Play mode — one command per line, `#` starts a comment.
 *  It is parsed (never eval'd), so a saved scene can't run arbitrary code.
 *
 *    speed <m/s>                      set drive speed
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

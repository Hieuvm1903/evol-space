"""Build every models/*.py, validate layout contracts, generate manifest.json, and optionally publish to Supabase.

  python tools/build.py                    # build all into ./dist
  python tools/build.py --only robot       # build one model
  python tools/build.py --upload           # build, upload to <set>/<hash>/, register version
"""

import argparse
from datetime import datetime, timezone
import hashlib
import importlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import sand3d as s3d  # noqa: E402
from lib import supabase_io  # noqa: E402
from lib.common import ASSET_ROLES  # noqa: E402


def discover(only=None):
    names = sorted(p.stem for p in (ROOT / "models").glob("*.py") if not p.stem.startswith("_"))
    if only:
        unknown = set(only) - set(names)
        if unknown:
            raise SystemExit(f"Unknown model(s): {', '.join(sorted(unknown))}. Available: {', '.join(names)}")
        names = [n for n in names if n in only]
    return names


def build_all(out: Path, only=None):
    out.mkdir(parents=True, exist_ok=True)
    names = discover(only)
    mods = {n: importlib.import_module(f"models.{n}") for n in names}
    glb_names = [n for n, m in mods.items() if hasattr(m, "build")]
    files = []
    layout_data = None

    for n, m in mods.items():
        if hasattr(m, "build"):
            s3d.empty_scene()
            s3d.units("mm")
            path = out / f"{n}.glb"
            s3d.export(m.build(), str(path))
        elif hasattr(m, "build_json"):
            layout_data = m.build_json(glb_names)
            path = out / f"{n}.json"
            path.write_text(json.dumps(layout_data, indent=2))
        else:
            raise SystemExit(f"models/{n}.py needs build() or build_json(assets)")
        print(f"built {path.name} ({path.stat().st_size / 1024:.0f} KB)")
        files.append(path)

    if only is None:
        manifest = {
            "schemaVersion": "2.0",
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "assets": {
                n: {
                    "file": f"{n}.glb",
                    "role": ASSET_ROLES.get(n, "equipment"),
                    "bytes": (out / f"{n}.glb").stat().st_size,
                    "joints": (layout_data or {}).get("joints", {}).get(n, []),
                    "indicatorMeshes": (layout_data or {}).get("indicator_meshes", {}).get(n, []),
                }
                for n in glb_names
            },
        }
        manifest_path = out / "manifest.json"
        manifest_path.write_text(json.dumps(manifest, indent=2))
        files.append(manifest_path)
        print(f"generated {manifest_path.name} ({len(glb_names)} models)")

    return files


def content_hash(files):
    h = hashlib.sha256()
    for p in sorted(files):
        h.update(p.name.encode())
        h.update(p.read_bytes())
    return h.hexdigest()[:8]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(ROOT / "dist"))
    ap.add_argument("--only", nargs="*")
    ap.add_argument("--upload", action="store_true")
    ap.add_argument("--set", default="warehouse", help="model set name (row in model_sets)")
    ap.add_argument("--bucket", default="models")
    a = ap.parse_args()

    files = build_all(Path(a.out), a.only)
    version = content_hash(files)
    print(f"set '{a.set}' version {version}")
    if not a.upload:
        return
    if a.only:
        raise SystemExit("--upload publishes a complete set; don't combine it with --only")
    if supabase_io.version_exists(a.set, version):
        print("this exact version is already published - nothing to do")
        return
    base_path = f"{a.set}/{version}"
    for p in files:
        supabase_io.upload_file(p, a.bucket, f"{base_path}/{p.name}")
    supabase_io.register_version(a.set, version, base_path, {p.stem: p.name for p in files})
    print(f"published {base_path}")


if __name__ == "__main__":
    main()

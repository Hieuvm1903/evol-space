"""Offline validation for model-sand3d scripts and layout.json spatial integrity."""

import ast
import importlib
import math
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))


def check_syntax():
    py_files = list((ROOT / "models").glob("*.py")) + list((ROOT / "lib").glob("*.py")) + list((ROOT / "tools").glob("*.py"))
    for p in py_files:
        ast.parse(p.read_text(encoding="utf-8"), filename=str(p))
    print(f"[ok] syntax verified across {len(py_files)} Python files")


def check_layout():
    model_names = {p.stem for p in (ROOT / "models").glob("*.py") if not p.stem.startswith("_") and p.stem != "layout"}
    layout_mod = importlib.import_module("models.layout")
    layout = layout_mod.build_json(sorted(model_names))

    missing_assets = set(layout.get("instances", {}).keys()) - model_names
    if missing_assets:
        raise SystemExit(f"Layout references missing models: {sorted(missing_assets)}")

    missing_joint_assets = set(layout.get("joints", {}).keys()) - model_names
    if missing_joint_assets:
        raise SystemExit(f"Layout joints reference missing models: {sorted(missing_joint_assets)}")

    # Verify ARM-1 is within physical reach (<= 1.15m) of its target pick station ST-1
    arms = layout["instances"].get("robot_arm", [])
    stations = {s["id"]: s for s in layout["instances"].get("station", [])}
    for arm in arms:
        target = stations.get(arm.get("pick"))
        if target:
            dx = arm["position"][0] - target["position"][0]
            dz = arm["position"][2] - target["position"][2]
            dist = math.hypot(dx, dz)
            if dist > 1.15:
                raise SystemExit(f"{arm['id']} is {dist:.2f}m from {target['id']} (exceeds 1.15m reach)")

    # Verify all bounds stay inside declared meta bounds
    bx0, bx1 = layout["meta"]["bounds"]["x"]
    bz0, bz1 = layout["meta"]["bounds"]["z"]
    for asset, items in layout["instances"].items():
        if asset == "warehouse":
            continue
        for it in items:
            x, _, z = it["position"]
            if not (bx0 <= x <= bx1 and bz0 <= z <= bz1):
                raise SystemExit(f"{asset}:{it['id']} position {[x, z]} outside meta bounds")

    print(f"[ok] layout integrity verified ({len(model_names)} models, {sum(len(v) for v in layout['instances'].values())} instances)")


if __name__ == "__main__":
    check_syntax()
    check_layout()

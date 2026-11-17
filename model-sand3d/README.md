# model-sand3d

3D warehouse assets and Digital Twin layout specification built with [sand3d](https://github.com/Sandflow-ai/sand3d).

One file per model in `models/`. On every push to `main`, GitHub Actions validates `layout.json` contracts, builds all `.glb` assets + `layout.json` + `manifest.json`, publishes them to Supabase Storage under `warehouse/<hash>/`, and registers the version in `model_sets`.

## Warehouse Asset Catalog (v2.0)

- **Structural & Infrastructure**: `warehouse.py`, `rack.py`, `track.py`, `charger.py`
- **Material Handling & Cells**: `conveyor.py`, `station.py` (with `tower_green` / `tower_amber` / `tower_red` status meshes), `robot_arm.py` (6-axis + parallel gripper), `robot_transfer.py` (3-axis rail shuttle)
- **Autonomous & Mobile Fleet**: `robot.py` (AMR with wheel spin + lift), `drone.py` (quadrotor with 4 rotor joints), `truck.py` (6-wheel box truck), `humanoid.py` (articulated operator)
- **Inventory & Cargo**: `tote.py`, `pallet.py`, `goods.py`, `bag.py`
- **Scene Blueprint**: `layout.py` (`schemaVersion: "2.0"` with `instances`, `robots`, `drones`, `workers`, `vehicles`, `zones`, `joints`, `indicator_meshes`, and `telemetry_examples`)

## Local Usage

```bash
python3.13 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python tools/validate.py               # validate syntax, bounds, reach & contracts
python tools/build.py                  # build *.glb, layout.json, manifest.json -> dist/
python tools/build.py --only robot     # build a single model
```

## One-time Supabase Setup

1. Run `supabase/schema.sql` in the Supabase SQL editor.
2. Add `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` (service_role) to GitHub repository Actions secrets.

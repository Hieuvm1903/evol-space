"""Shared helpers and semantic metadata for every model script."""

import sand3d as s3d

VIOLET, CYAN, PINK, AMBER, RED, GREEN = "#8b6ff5", "#22d3ee", "#e879f9", "#f59e0b", "#ef4444", "#22c55e"

ASSET_ROLES = {
    "warehouse": "facility_shell",
    "rack": "static_storage",
    "tote": "inventory_unit",
    "pallet": "inventory_unit",
    "goods": "inventory_unit",
    "bag": "inventory_unit",
    "track": "infrastructure",
    "conveyor": "material_handling",
    "station": "workstation",
    "charger": "energy_dock",
    "robot": "amr_fleet",
    "robot_arm": "workcell_arm",
    "robot_transfer": "rail_shuttle",
    "humanoid": "operator",
    "drone": "aerial_patrol",
    "truck": "dock_vehicle",
}


def mat(ob, kind, color=None, **kw):
    s3d.material(ob, kind, color=color, **kw)
    return ob

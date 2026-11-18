"""Layout data for instancing / ECS / Digital Twin -> layout.json (not a mesh)."""

import math


def _loop(cx, cz, rx, rz, n=8):
    """Closed patrol loop (ellipse) as [[x, z], ...]."""
    return [
        [round(cx + rx * math.cos(2 * math.pi * i / n), 3), round(cz + rz * math.sin(2 * math.pi * i / n), 3)]
        for i in range(n)
    ]


def build_json(assets):
    """Plain data an ECS / instancing / Digital Twin renderer consumes. glTF axes, metres.
    The warehouse shell is 24 x 16 m, centred at z=3; its dock (back) wall is on the -Z side."""
    bays, pitch, rows, row_pitch = 8, 1.3, 4, 2.5
    xs = [(i - (bays - 1) / 2) * pitch for i in range(bays)]
    racks, totes = [], []
    levels_m = [0.2, 0.8, 1.4, 2.0, 2.6]
    for r in range(rows):
        for i, x in enumerate(xs):
            rid = f"R{r}-{i}"
            racks.append({"id": rid, "position": [round(x, 3), 0, round(r * row_pitch, 3)], "rotationY": 0})
            for lv, y in enumerate(levels_m):
                for slot, dx in enumerate((-0.3, 0.3)):
                    if (r + i + lv + slot) % 3 != 0:
                        totes.append(
                            {
                                "id": f"T-{rid}-{lv}-{slot}",
                                "rack": rid,
                                "level": lv,
                                "position": [round(x + dx, 3), y + 0.102, round(r * row_pitch, 3)],
                            }
                        )

    x0, x1 = xs[0] - 1.2, xs[-1] + 1.2
    robots = []
    for k in range(3):
        za = k * row_pitch + row_pitch / 2
        zc = -1.0 - 0.4 * k
        robots.append(
            {
                "id": f"AMR-{k + 1}",
                "start": [round(x0, 3), 0, round(za, 3)],
                "loop": [
                    [round(x0, 3), round(za, 3)],
                    [round(x1, 3), round(za, 3)],
                    [round(x1, 3), round(zc, 3)],
                    [round(x0, 3), round(zc, 3)],
                ],
                "speedMps": 1.2,
            }
        )

    # Picking station + robot arm positioned cleanly within 0.85m arm reach envelope
    st_x, st_z = round(x0 - 1.8, 3), -1.4
    arm_x, arm_z = round(st_x - 0.9, 3), st_z

    # Shipping / receiving pallets inside the -Z dock doors
    pallets = [
        {"id": f"PAL-{i + 1}", "position": [px, 0, -3.6], "rotationY": 0, "load": "goods"}
        for i, px in enumerate((-7.0, -5.8, 5.8, 7.0))
    ]

    # Goods and bags staged on conveyor CV-1 (belt top ~0.71 m)
    cv_x = round(x1 + 1.6, 3)
    goods = [
        {"id": f"G-{i + 1}", "on": "CV-1", "position": [cv_x, 0.71, z], "rotationY": 90}
        for i, z in enumerate((3.05, 3.65, 4.25))
    ]
    bags = [
        {"id": "B-1", "on": "CV-1", "position": [cv_x, 0.71, 4.8], "rotationY": 90},
        {"id": "B-2", "position": [-9.5, 0, 9.5], "rotationY": 20},
    ]

    # Rail line feeding shipping: 3 x 4 m segments along Z at x = 10.5
    tracks = [
        {"id": f"TRK-{i + 1}", "position": [10.5, 0, round(1.0 + i * 4.0, 3)], "rotationY": 90}
        for i in range(3)
    ]

    # AMR charging docks along the west charging bay
    chargers = [
        {"id": "CHG-1", "position": [-10.4, 0, 4.4], "rotationY": 0, "powerKw": 3.2},
        {"id": "CHG-2", "position": [-10.4, 0, 5.6], "rotationY": 0, "powerKw": 3.2},
    ]

    drones = [
        {"id": "DR-1", "altitude": 4.5, "speedMps": 2.5, "loop": _loop(0.0, 3.0, 9.0, 5.5), "pad": [10.5, 9.5]},
        {"id": "DR-2", "altitude": 5.5, "speedMps": 2.0, "loop": _loop(0.0, 3.0, 6.0, 3.5), "pad": [-10.5, 9.5]},
    ]
    workers = [
        {"id": "HM-1", "speedMps": 1.0, "loop": [[-10.0, 6.4], [-10.0, 9.8], [-7.0, 9.8], [-7.0, 6.4]]},
    ]
    vehicles = [
        {"id": "TR-1", "path": [[0.0, -24.0], [0.0, -8.8]], "rotationY": 90, "speedMps": 2.0, "dock": "D-2"},
    ]

    zones = [
        {"id": "receiving", "name": "Receiving Dock", "kind": "dock", "x": [-9.2, 9.2], "z": [-4.9, -2.5], "color": "#10b981"},
        {
            "id": "storage",
            "name": "Storage Aisles",
            "kind": "racking",
            "x": [round(xs[0] - 0.8, 2), round(xs[-1] + 0.8, 2)],
            "z": [-0.8, round(rows * row_pitch - 1.5, 2)],
            "color": "#6366f1",
        },
        {"id": "picking", "name": "Robotic Pick Cell", "kind": "robot_cell", "x": [-10.4, -6.5], "z": [-2.4, 0.8], "color": "#ec4899"},
        {"id": "shipping", "name": "Shipping Corridor", "kind": "conveyor", "x": [6.3, 11.4], "z": [-1.4, 10.2], "color": "#22d3ee"},
        {"id": "charging", "name": "AMR Charging Bay", "kind": "amr_parking", "x": [-11.3, -8.2], "z": [3.7, 6.3], "color": "#f59e0b"},
    ]

    return {
        "schemaVersion": "2.0",
        "meta": {
            "units": "metres",
            "axes": "glTF (Y up, Z toward viewer)",
            "origin": "asset floor-centre",
            "bounds": {"x": [-12.0, 12.0], "z": [-25.0, 11.0]},
            "building": {"size": [24.0, 16.0], "height": 7.0, "dock_wall": "-Z"},
        },
        "assets": {k: f"{k}.glb" for k in assets},
        "joints": {
            "robot": ["wheel_l_spin", "wheel_r_spin", "lift_slide"],
            "robot_arm": ["base_yaw", "shoulder_pitch", "elbow_pitch", "wrist_roll", "finger_l_slide", "finger_r_slide"],
            "robot_transfer": ["travel_slide", "lift_slide", "fork_slide"],
            "humanoid": ["head_yaw", "elbow_l_pitch", "elbow_r_pitch", "knee_l_pitch", "knee_r_pitch"],
            "drone": ["rotor_front_spin", "rotor_back_spin", "rotor_left_spin", "rotor_right_spin"],
            "truck": [f"wheel_{t}_{s}_spin" for t in ("front", "mid", "rear") for s in ("l", "r")],
        },
        "indicator_meshes": {
            "station": ["tower_green", "tower_amber", "tower_red"],
            "charger": ["chg_status_led"],
        },
        "instances": {
            "warehouse": [{"id": "WH-1", "position": [0, 0, 3.0], "rotationY": 0}],
            "rack": racks,
            "tote": totes,
            "conveyor": [{"id": "CV-1", "position": [cv_x, 0, 3.75], "rotationY": 90, "beltSpeedMps": 0.4}],
            "station": [{"id": "ST-1", "position": [st_x, 0, st_z], "rotationY": 90}],
            "charger": chargers,
            "pallet": pallets,
            "goods": goods,
            "bag": bags,
            "track": tracks,
            "robot_arm": [{"id": "ARM-1", "position": [arm_x, 0, arm_z], "rotationY": 0, "pick": "ST-1"}],
            "robot_transfer": [{"id": "XFER-1", "position": [0.0, 0, 9.4], "rotationY": 0, "railLengthM": 4.0}],
            "humanoid": [{"id": "HM-1", "position": [-10.0, 0, 6.4], "rotationY": 0}],
            "drone": [{"id": d["id"], "position": [d["pad"][0], 0, d["pad"][1]], "rotationY": 0} for d in drones],
            "truck": [{"id": "TR-1", "position": [0.0, 0, -8.8], "rotationY": 90}],
        },
        "robots": robots,
        "drones": drones,
        "workers": workers,
        "vehicles": vehicles,
        "zones": zones,
        "telemetry_example": {
            "id": "AMR-1",
            "t": 1731100000.0,
            "x": -6.5,
            "z": 1.25,
            "heading": 0.0,
            "battery": 0.82,
            "lift": 0.0,
            "state": "moving",
        },
        "telemetry_examples": {
            "DR-1": {"id": "DR-1", "t": 1731100000.0, "x": 4.0, "y": 4.5, "z": 6.0, "yaw": 1.2, "battery": 0.64, "state": "patrol"},
            "ARM-1": {
                "id": "ARM-1",
                "t": 1731100000.0,
                "joints": {
                    "base_yaw": 0.4,
                    "shoulder_pitch": -0.3,
                    "elbow_pitch": 0.8,
                    "wrist_roll": 0.0,
                    "finger_l_slide": 0.02,
                    "finger_r_slide": 0.02,
                },
                "state": "picking",
            },
            "XFER-1": {"id": "XFER-1", "t": 1731100000.0, "travel": 1.2, "lift": 0.9, "fork": 0.0, "state": "lifting"},
            "TR-1": {"id": "TR-1", "t": 1731100000.0, "x": 0.0, "z": -14.0, "speedMps": 2.0, "state": "arriving"},
        },
    }

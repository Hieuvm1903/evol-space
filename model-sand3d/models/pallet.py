"""Industrial EUR slatted pallet -> pallet.glb"""

import sand3d as s3d
from lib.common import mat, AMBER


def build(w=1200, d=800, h=144):
    """3-runner slatted timber pallet resting at z=0: 3 base runners, 9 spacer blocks, 5 top deck slats, corner bumper strips."""
    parts = []
    runner_w = 100
    deck_t = 22
    block_h = h - 2 * deck_t

    # Bottom runners along X
    for i, sy in enumerate((-1, 0, 1)):
        y = sy * (d / 2 - runner_w / 2)
        parts.append(mat(s3d.at(s3d.box(f"runner{i}", w, runner_w, deck_t), y=y, z=0), "walnut", "#5c432d"))

    # 9 spacer blocks
    for ix, sx in enumerate((-1, 0, 1)):
        x = sx * (w / 2 - 70)
        for iy, sy in enumerate((-1, 0, 1)):
            y = sy * (d / 2 - runner_w / 2)
            parts.append(
                mat(
                    s3d.at(s3d.box(f"block{ix}_{iy}", 140, runner_w, block_h), x=x, y=y, z=deck_t),
                    "walnut",
                    "#4a3524",
                )
            )

    # 5 top deck planks along X
    plank_w = 115
    for k in range(5):
        y = -d / 2 + plank_w / 2 + k * ((d - plank_w) / 4)
        parts.append(
            mat(
                s3d.at(s3d.box(f"plank{k}", w, plank_w, deck_t), y=y, z=h - deck_t),
                "walnut",
                "#705338",
            )
        )

    # High-visibility corner wear guards
    for i, sx in enumerate((-1, 1)):
        for j, sy in enumerate((-1, 1)):
            parts.append(
                mat(
                    s3d.at(
                        s3d.box(f"corner{i}_{j}", 40, 40, h),
                        x=sx * (w / 2 - 20),
                        y=sy * (d / 2 - 20),
                    ),
                    "painted_metal",
                    AMBER,
                )
            )

    return s3d.assembly("pallet", *parts)

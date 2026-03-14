from __future__ import annotations

import hashlib
import json
import re
from functools import lru_cache

from app.config import get_settings
from app.models import (
    ActivationLabel,
    BodyPartSchemaItem,
    BodySchemaResponse,
    MuscleGroupSchemaItem,
)


GROUP_DEFINITIONS = [
    {
        "muscle_group_id": "chest",
        "display_name": "Chest",
        "category": "upper_body",
        "include": [r"pectoralis", r"serratus anterior"],
    },
    {
        "muscle_group_id": "front_shoulders",
        "display_name": "Front Shoulders",
        "category": "upper_body",
        "include": [r"clavicular part of .* deltoid"],
    },
    {
        "muscle_group_id": "side_shoulders",
        "display_name": "Side Shoulders",
        "category": "upper_body",
        "include": [r"acromial part of .* deltoid"],
    },
    {
        "muscle_group_id": "rear_shoulders_rotator_cuff",
        "display_name": "Rear Shoulders / Rotator Cuff",
        "category": "upper_body",
        "include": [
            r"spinal part of .* deltoid",
            r"supraspinatus",
            r"infraspinatus",
            r"teres minor",
            r"subscapularis",
        ],
    },
    {
        "muscle_group_id": "biceps",
        "display_name": "Biceps",
        "category": "arms",
        "include": [
            r"biceps brachii",
            r"brachialis",
            r"brachioradialis",
            r"coracobrachialis",
        ],
    },
    {
        "muscle_group_id": "triceps",
        "display_name": "Triceps",
        "category": "arms",
        "include": [r"triceps brachii"],
    },
    {
        "muscle_group_id": "forearms",
        "display_name": "Forearms",
        "category": "arms",
        "include": [
            r"carpi",
            r"pronator",
            r"supinator",
            r"extensor digitorum$",
            r"extensor digiti minimi$",
            r"palmaris longus",
        ],
    },
    {
        "muscle_group_id": "lats",
        "display_name": "Lats",
        "category": "back",
        "include": [r"latissimus dorsi", r"teres major"],
    },
    {
        "muscle_group_id": "upper_back",
        "display_name": "Upper Back",
        "category": "back",
        "include": [r"trapezius", r"rhomboid", r"levator scapulae"],
    },
    {
        "muscle_group_id": "spinal_erectors",
        "display_name": "Spinal Erectors",
        "category": "back",
        "include": [
            r"iliocostalis",
            r"longissimus",
            r"spinalis",
            r"multifidus",
            r"semispinalis",
            r"interspinalis",
        ],
    },
    {
        "muscle_group_id": "abs",
        "display_name": "Abs",
        "category": "core",
        "include": [r"rectus abdominis", r"transversus abdominis"],
    },
    {
        "muscle_group_id": "obliques_core",
        "display_name": "Obliques / Core",
        "category": "core",
        "include": [r"external oblique", r"internal oblique"],
    },
    {
        "muscle_group_id": "glutes",
        "display_name": "Glutes",
        "category": "lower_body",
        "include": [
            r"gluteus maximus",
            r"gluteus medius",
            r"gluteus minimus",
            r"tensor fasciae latae",
        ],
    },
    {
        "muscle_group_id": "quadriceps",
        "display_name": "Quadriceps",
        "category": "lower_body",
        "include": [
            r"rectus femoris",
            r"vastus lateralis",
            r"vastus medialis",
            r"vastus intermedius",
        ],
    },
    {
        "muscle_group_id": "hamstrings",
        "display_name": "Hamstrings",
        "category": "lower_body",
        "include": [r"biceps femoris", r"semitendinosus", r"semimembranosus"],
    },
    {
        "muscle_group_id": "adductors",
        "display_name": "Adductors",
        "category": "lower_body",
        "include": [
            r"adductor brevis",
            r"adductor longus",
            r"adductor magnus",
            r"adductor minimus",
            r"gracilis",
            r"pectineus",
        ],
    },
    {
        "muscle_group_id": "hip_flexors",
        "display_name": "Hip Flexors",
        "category": "lower_body",
        "include": [
            r"iliacus",
            r"psoas",
            r"sartorius",
            r"pectineus",
            r"rectus femoris",
        ],
    },
    {
        "muscle_group_id": "calves",
        "display_name": "Calves",
        "category": "lower_body",
        "include": [r"gastrocnemius", r"soleus", r"plantaris"],
    },
    {
        "muscle_group_id": "shins",
        "display_name": "Shins",
        "category": "lower_body",
        "include": [r"tibialis anterior", r"fibularis"],
    },
]


def slugify_name(name: str) -> str:
    value = name.lower().strip()
    value = value.replace("(", " ").replace(")", " ")
    value = re.sub(r"[^a-z0-9]+", "_", value)
    value = re.sub(r"_+", "_", value)
    return value.strip("_")


def canonical_body_part_id(entry: dict[str, object]) -> str:
    bp_id = str(entry.get("bpId") or "").strip()
    if bp_id:
        return f"bp3d:{bp_id}"
    return f"zanatomy:{slugify_name(str(entry['name']))}"


def _part_side(name: str) -> str:
    lowered = name.lower()
    if "left" in lowered:
        return "left"
    if "right" in lowered:
        return "right"
    return "center"


def _matches(name: str, patterns: list[str]) -> bool:
    return any(re.search(pattern, name) for pattern in patterns)


def _build_muscle_groups(
    parts: list[BodyPartSchemaItem],
) -> list[MuscleGroupSchemaItem]:
    groups: list[MuscleGroupSchemaItem] = []
    for definition in GROUP_DEFINITIONS:
        members = [
            part
            for part in parts
            if not part.is_tendon
            and _matches(part.canonical_name.lower(), definition["include"])
        ]
        left = [
            part.body_part_id
            for part in members
            if _part_side(part.canonical_name) == "left"
        ]
        right = [
            part.body_part_id
            for part in members
            if _part_side(part.canonical_name) == "right"
        ]
        center = [
            part.body_part_id
            for part in members
            if _part_side(part.canonical_name) == "center"
        ]
        groups.append(
            MuscleGroupSchemaItem(
                muscle_group_id=definition["muscle_group_id"],
                display_name=definition["display_name"],
                category=definition["category"],
                member_body_part_ids=[part.body_part_id for part in members],
                body_part_ids_left=left,
                body_part_ids_right=right,
                body_part_ids_center=center,
                bilateral=bool(left and right),
            )
        )
    return groups


@lru_cache
def load_body_schema() -> BodySchemaResponse:
    settings = get_settings()
    raw_entries = json.loads(settings.mesh_mapping_path.read_text())
    parts = [
        BodyPartSchemaItem(
            body_part_id=canonical_body_part_id(entry),
            canonical_name=str(entry["name"]),
            mesh_name=str(entry["name"]),
            source=str(entry["source"]),
            source_body_id=str(entry.get("bpId") or "") or None,
            fma_id=str(entry.get("fmaId") or "") or None,
            is_tendon=bool(entry["isTendon"]),
            aliases=sorted({str(entry["name"]), str(entry["originalName"])}),
        )
        for entry in raw_entries
    ]
    groups = _build_muscle_groups(parts)
    version_input = json.dumps(
        {
            "body_parts": [part.model_dump() for part in parts],
            "muscle_groups": [group.model_dump() for group in groups],
        },
        sort_keys=True,
    )
    version = hashlib.sha256(version_input.encode("utf-8")).hexdigest()[:12]
    return BodySchemaResponse(
        version=version,
        labels=[
            ActivationLabel.none,
            ActivationLabel.low,
            ActivationLabel.moderate,
            ActivationLabel.high,
        ],
        body_parts=parts,
        muscle_groups=groups,
    )


@lru_cache
def allowed_body_part_ids() -> set[str]:
    return {part.body_part_id for part in load_body_schema().body_parts}


@lru_cache
def allowed_muscle_group_ids() -> set[str]:
    return {group.muscle_group_id for group in load_body_schema().muscle_groups}


@lru_cache
def muscle_group_map() -> dict[str, MuscleGroupSchemaItem]:
    return {group.muscle_group_id: group for group in load_body_schema().muscle_groups}


@lru_cache
def body_part_to_muscle_group_ids() -> dict[str, list[str]]:
    mapping: dict[str, list[str]] = {}
    for group in load_body_schema().muscle_groups:
        for body_part_id in group.member_body_part_ids:
            mapping.setdefault(body_part_id, []).append(group.muscle_group_id)
    return mapping

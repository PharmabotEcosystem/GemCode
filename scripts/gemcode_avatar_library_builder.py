import argparse
import json
import os
import shutil
import sys
import zipfile
from pathlib import Path


if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}
MODEL_EXTENSIONS = {".vrm", ".glb", ".gltf", ".fbx", ".obj"}
SUPPORTED_RUNTIME_MODEL_EXTENSIONS = [".glb", ".gltf", ".vrm", ".obj"]
ARCHIVE_EXTENSIONS = {".var", ".zip"}
SKIP_FOLDERS = {
    "$RECYCLE.BIN",
    "System Volume Information",
    "WindowsApps",
    "steamapps",
    "node_modules",
    ".git",
    "__pycache__",
    ".claude",
    "Cache",
    "logs",
    "Temp",
}
POSITIVE_HINTS = {
    "avatar",
    "avatar3d",
    "character",
    "companion",
    "person",
    "humanoid",
    "metahuman",
    "juno",
    "girl",
    "woman",
    "female",
    "male",
    "man",
    "vrm",
    "look",
    "appearance",
    "face",
    "portrait",
}
NEGATIVE_HINTS = {
    "car",
    "vehicle",
    "plugin",
    "plugins",
    "preset",
    "presets",
    "hair",
    "clothing",
    "sound",
    "audio",
    "music",
    "scene",
    "prop",
}
TECHNICAL_TEXTURE_HINTS = {
    "normal",
    "rough",
    "metal",
    "ao",
    "sss",
    "sssmap",
    "cornea",
    "mask",
    "channel",
    "occlusion",
    "eye_occlusion",
    "opacity",
    "basecolor",
    "specular",
    "albedo",
    "diffuse",
    "texture",
    "bump",
}

RUNTIME_MODEL_PRIORITY = {
    ".glb": 0,
    ".gltf": 1,
    ".vrm": 2,
    ".obj": 3,
    ".fbx": 4,
}


def score_asset(file_name: str, keywords: list[str]) -> int:
    lower = file_name.lower()
    score = 0
    for keyword in keywords:
        if keyword in lower:
            score += 2
    if "transparent" in lower:
        score += 1
    if "4k" in lower or "8k" in lower:
        score += 1
    if "preview" in lower or "thumb" in lower:
        score -= 2
    return score


def pick_best(files: list[str], keywords: list[str]) -> str:
    if not files:
        return ""
    return sorted(files, key=lambda item: (-score_asset(Path(item).name, keywords), item.lower()))[0]


def pick_best_runtime_model(files: list[str]) -> str:
    if not files:
        return ""

    def sort_key(item: str) -> tuple[int, int, str]:
        suffix = Path(item).suffix.lower()
        supported_rank = SUPPORTED_RUNTIME_MODEL_EXTENSIONS.index(suffix) if suffix in SUPPORTED_RUNTIME_MODEL_EXTENSIONS else 99
        return (supported_rank, -score_asset(Path(item).name, ["main", "body", "character", "avatar", "vrm", "glb", "gltf"]), item.lower())

    return sorted(files, key=sort_key)[0]


def bundle_priority(bundle: dict) -> tuple[int, int, int, str]:
    primary_model = str(bundle.get("primaryModel", "") or "")
    ext = Path(primary_model).suffix.lower()
    model_rank = RUNTIME_MODEL_PRIORITY.get(ext, 99)
    has_model = 0 if primary_model else 1
    source_type = str(bundle.get("sourceType", "folder"))
    source_rank = 0 if source_type == "folder" else 1
    name = str(bundle.get("name", "")).lower()
    folder_path = str(bundle.get("folderPath", "")).lower()

    penalty = 0
    if "addonpackages" in folder_path:
        penalty += 4
    if "engine\\content" in folder_path or "engine/content" in folder_path:
        penalty += 5
    if "intermediate" in folder_path:
        penalty += 6
    if "avatar3d" in folder_path:
        penalty -= 3
    if "character" in folder_path or "avatar" in folder_path:
        penalty -= 2

    return (has_model, model_rank + penalty, source_rank, name)


def is_presentational_image(file_path: str) -> bool:
    lower = Path(file_path).name.lower()
    return not any(hint in lower for hint in TECHNICAL_TEXTURE_HINTS)


def relevance_score(path_text: str, image_files: list[str], model_files: list[str]) -> int:
    lower = path_text.lower()
    score = 0
    for hint in POSITIVE_HINTS:
        if hint in lower:
            score += 2
    for hint in NEGATIVE_HINTS:
        if hint in lower:
            score -= 2

    if model_files:
        score += 4
    if len(image_files) >= 2:
        score += 2

    joined_names = " ".join(Path(item).name.lower() for item in image_files + model_files)
    for hint in POSITIVE_HINTS:
        if hint in joined_names:
            score += 1
    for hint in NEGATIVE_HINTS:
        if hint in joined_names:
            score -= 1

    if "atom\\person" in lower or "atom/person" in lower:
        score += 4
    if "addonpackages" in lower:
        score += 2
    return score


def build_folder_bundle(folder_path: Path, image_files: list[str], model_files: list[str]) -> dict | None:
    if not image_files and not model_files:
        return None

    if relevance_score(str(folder_path), image_files, model_files) < 3:
        return None

    presentational_images = [item for item in image_files if is_presentational_image(item)]
    base_image = pick_best(presentational_images, ["base", "body", "main", "idle", "render", "portrait", "full", "photo"])
    blink_image = pick_best(presentational_images, ["blink", "closed", "eyes", "eyeclose"])
    mouth_open_image = pick_best(presentational_images, ["mouth", "open", "talk", "speak", "viseme", "lip"])
    aura_image = pick_best(presentational_images, ["aura", "glow", "fx", "effect"])
    preview_image = base_image or (presentational_images[0] if presentational_images else "")
    primary_model = pick_best_runtime_model(model_files)

    if not base_image and not primary_model:
        return None

    return {
        "name": folder_path.name,
        "folderPath": str(folder_path),
        "previewImage": preview_image,
        "baseImage": base_image,
        "blinkImage": blink_image,
        "mouthOpenImage": mouth_open_image,
        "auraImage": aura_image,
        "primaryModel": primary_model,
        "imageCount": len(image_files),
        "modelCount": len(model_files),
        "compatibility": "ready-2d" if base_image else "model-only",
        "sourceType": "folder",
    }


def safe_extract_member(archive: zipfile.ZipFile, member_name: str, output_path: Path) -> str:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with archive.open(member_name) as source, output_path.open("wb") as target:
      shutil.copyfileobj(source, target)
    return str(output_path)


def build_archive_bundle(archive_path: Path, cache_dir: Path) -> dict | None:
    try:
        with zipfile.ZipFile(archive_path) as archive:
            image_members = [name for name in archive.namelist() if Path(name).suffix.lower() in IMAGE_EXTENSIONS]
            model_members = [name for name in archive.namelist() if Path(name).suffix.lower() in MODEL_EXTENSIONS]
            if not image_members and not model_members:
                return None

            archive_relevance = relevance_score(
                f"{archive_path} {' '.join(image_members[:30])} {' '.join(model_members[:30])}",
                image_members,
                model_members,
            )
            if archive_relevance < 3:
                return None

            presentational_members = [item for item in image_members if is_presentational_image(item)]
            base_member = pick_best(presentational_members, ["base", "body", "main", "idle", "render", "portrait", "full", "preview", "photo"])
            blink_member = pick_best(presentational_members, ["blink", "closed", "eyes", "eyeclose"])
            mouth_member = pick_best(presentational_members, ["mouth", "open", "talk", "speak", "viseme", "lip"])
            aura_member = pick_best(presentational_members, ["aura", "glow", "fx", "effect"])
            preview_member = base_member or (presentational_members[0] if presentational_members else "")
            primary_model = pick_best_runtime_model(model_members)

            cache_bucket = cache_dir / archive_path.stem
            preview_image = ""
            base_image = ""
            blink_image = ""
            mouth_image = ""
            aura_image = ""

            if preview_member:
                preview_image = safe_extract_member(archive, preview_member, cache_bucket / Path(preview_member).name)
            if base_member:
                base_image = safe_extract_member(archive, base_member, cache_bucket / f"base-{Path(base_member).name}")
            elif preview_image:
                base_image = preview_image
            if blink_member:
                blink_image = safe_extract_member(archive, blink_member, cache_bucket / f"blink-{Path(blink_member).name}")
            if mouth_member:
                mouth_image = safe_extract_member(archive, mouth_member, cache_bucket / f"mouth-{Path(mouth_member).name}")
            if aura_member:
                aura_image = safe_extract_member(archive, aura_member, cache_bucket / f"aura-{Path(aura_member).name}")

            compatibility = "ready-2d" if base_image else ("archive-preview" if preview_image else "model-only")
            return {
                "name": archive_path.stem,
                "folderPath": str(archive_path),
                "previewImage": preview_image,
                "baseImage": base_image,
                "blinkImage": blink_image,
                "mouthOpenImage": mouth_image,
                "auraImage": aura_image,
                "primaryModel": primary_model,
                "imageCount": len(image_members),
                "modelCount": len(model_members),
                "compatibility": compatibility,
                "sourceType": "archive",
            }
    except Exception:
        return None


def scan_root(root_path: Path, cache_dir: Path, max_depth: int, max_results: int) -> list[dict]:
    results: list[dict] = []
    queue: list[tuple[Path, int]] = [(root_path, 0)]
    visited: set[str] = set()

    while queue:
        current_path, depth = queue.pop(0)
        current_key = str(current_path).lower()
        if current_key in visited:
            continue
        visited.add(current_key)

        try:
            entries = list(current_path.iterdir())
        except Exception:
            continue

        image_files: list[str] = []
        model_files: list[str] = []

        for entry in entries:
            if entry.is_dir():
                if depth < max_depth and entry.name not in SKIP_FOLDERS:
                    queue.append((entry, depth + 1))
                continue

            suffix = entry.suffix.lower()
            if suffix in IMAGE_EXTENSIONS:
                image_files.append(str(entry))
            elif suffix in MODEL_EXTENSIONS:
                model_files.append(str(entry))
            elif suffix in ARCHIVE_EXTENSIONS:
                bundle = build_archive_bundle(entry, cache_dir)
                if bundle:
                    results.append(bundle)

        folder_bundle = build_folder_bundle(current_path, image_files, model_files)
        if folder_bundle:
            results.append(folder_bundle)

    ranked = sorted(results, key=bundle_priority)
    return ranked[:max_results]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True)
    parser.add_argument("--cache-dir", required=True)
    parser.add_argument("--max-depth", type=int, default=4)
    parser.add_argument("--max-results", type=int, default=300)
    args = parser.parse_args()

    root_path = Path(args.root)
    cache_dir = Path(args.cache_dir)
    cache_dir.mkdir(parents=True, exist_ok=True)

    items = scan_root(root_path, cache_dir, args.max_depth, args.max_results)
    payload = {
        "rootPath": str(root_path),
        "items": items,
    }
    sys.stdout.write(json.dumps(payload, ensure_ascii=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
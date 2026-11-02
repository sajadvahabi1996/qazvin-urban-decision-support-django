"""Dataset catalog and safe access to bundled GeoJSON/JSON files."""
from pathlib import Path
from typing import Any

DATA_DIR = Path(__file__).resolve().parents[1] / "data"

# Public API keys are intentionally separated from physical filenames.
# Only datasets listed here can be served or exported by the application.
DATASETS: dict[str, tuple[str, str, str]] = {
    "roads": ("rah_qazvin.json", "شبکه معابر", "راه‌ها"),
    "bus": ("bus_qazvin.json", "ایستگاه‌های اتوبوس", "اتوبوس"),
    "taxi": ("taxi_qazvin.json", "ایستگاه‌های تاکسی", "تاکسی"),
    "fuel": ("sokht_qazvin.json", "جایگاه‌های سوخت", "سوخت"),
    "problems": ("problems.geojson", "گزارش‌های مشکلات شهری", "مشکلات"),
    "hospitals": ("hospital.json", "مراکز درمانی", "درمانگاه‌ها"),
    "landuse": ("landuse_web.geojson", "کاربری اراضی", "کاربری"),
    "od-priority": ("od_priority.geojson", "شاخص اولویت محلات", "اولویت OD"),
    "neighborhoods": ("mahalat_qazvin_wgs84.geojson", "محدوده محلات", "محلات"),
}


class DatasetNotFoundError(LookupError):
    """Raised when a dataset key is not part of the public catalog."""


def get_dataset_path(dataset_key: str) -> Path:
    """Return the path for a catalogued dataset.

    The key is resolved through the fixed catalog rather than being treated as
    a user-supplied path, preventing path traversal.
    """
    definition = DATASETS.get(dataset_key)
    if definition is None:
        raise DatasetNotFoundError(dataset_key)

    path = DATA_DIR / definition[0]
    if not path.is_file():
        raise FileNotFoundError(f"Dataset file is missing: {definition[0]}")
    return path


def load_dataset(dataset_key: str) -> Any:
    """Load a catalogued dataset as JSON."""
    import json

    path = get_dataset_path(dataset_key)
    with path.open("r", encoding="utf-8-sig") as source:
        return json.load(source)


def get_features(payload: Any) -> list[Any]:
    """Normalize a GeoJSON FeatureCollection or a plain feature list."""
    if isinstance(payload, dict) and isinstance(payload.get("features"), list):
        return payload["features"]
    if isinstance(payload, list):
        return payload
    return []

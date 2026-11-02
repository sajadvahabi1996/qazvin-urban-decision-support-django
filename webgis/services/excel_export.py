"""Excel report generation for the bundled urban datasets."""
import json
from collections import Counter
from collections.abc import Iterator
from io import BytesIO
from typing import Any

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.worksheet import Worksheet

from .datasets import DATASETS, get_features, load_dataset

XLSX_CONTENT_TYPE = (
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
)


def _safe_cell(value: Any) -> Any:
    """Convert nested values to Excel cells and mitigate formula injection."""
    if value is None:
        return ""
    if isinstance(value, dict | list | tuple):
        value = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if isinstance(value, str):
        # Excel may interpret strings beginning with formula markers as formulas.
        if value.lstrip()[:1] in {"=", "+", "-", "@"}:
            return "'" + value
        return value
    if isinstance(value, int | float | bool):
        return value
    return str(value)


def _coordinate_pairs(coordinates: Any) -> Iterator[tuple[float, float]]:
    """Yield longitude/latitude pairs from nested GeoJSON coordinates."""
    if not isinstance(coordinates, list | tuple):
        return
    if (
        len(coordinates) >= 2
        and all(isinstance(value, int | float) for value in coordinates[:2])
    ):
        yield float(coordinates[0]), float(coordinates[1])
        return
    for child in coordinates:
        yield from _coordinate_pairs(child)


def _geometry_metadata(
    feature: dict[str, Any],
) -> tuple[str, float | str, float | str, str]:
    geometry = feature.get("geometry") or {}
    geometry_type = geometry.get("type", "")
    coordinates = geometry.get("coordinates")
    pairs = list(_coordinate_pairs(coordinates)) if coordinates is not None else []
    if not pairs:
        return geometry_type, "", "", ""

    longitudes = [pair[0] for pair in pairs]
    latitudes = [pair[1] for pair in pairs]
    if geometry_type == "Point":
        longitude, latitude = longitudes[0], latitudes[0]
        return (
            geometry_type,
            longitude,
            latitude,
            f"{longitude:.6f}, {latitude:.6f}",
        )

    center_x = (min(longitudes) + max(longitudes)) / 2
    center_y = (min(latitudes) + max(latitudes)) / 2
    bounds = (
        f"{min(longitudes):.6f}, {min(latitudes):.6f}, "
        f"{max(longitudes):.6f}, {max(latitudes):.6f}"
    )
    return geometry_type, center_x, center_y, bounds


def _style_table(worksheet: Worksheet) -> None:
    header_fill = PatternFill("solid", fgColor="174A7E")
    header_font = Font(name="Vazirmatn", color="FFFFFF", bold=True, size=10)
    body_font = Font(name="Vazirmatn", color="20354D", size=9)
    bottom_border = Side(style="hair", color="DCE5EF")

    for cell in worksheet[1]:
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(
            horizontal="center", vertical="center", wrap_text=True
        )
        cell.border = Border(bottom=Side(style="thin", color="9CB8D7"))

    worksheet.row_dimensions[1].height = 32
    for row in worksheet.iter_rows(min_row=2):
        for cell in row:
            cell.font = body_font
            cell.alignment = Alignment(
                horizontal="right" if isinstance(cell.value, str) else "center",
                vertical="top",
                wrap_text=False,
            )
            cell.border = Border(bottom=bottom_border)
            if cell.row % 2 == 0:
                cell.fill = PatternFill("solid", fgColor="F6F9FC")

    for column_cells in worksheet.columns:
        column_letter = get_column_letter(column_cells[0].column)
        header = str(column_cells[0].value or "")
        sample_values = [str(cell.value or "") for cell in list(column_cells)[1:100]]
        max_length = max(
            [len(header)] + [min(len(value), 42) for value in sample_values]
        )
        worksheet.column_dimensions[column_letter].width = min(
            max(max_length + 2, 12), 34
        )


def _write_dataset_sheet(
    workbook: Workbook, dataset_key: str, payload: Any
) -> int:
    label = DATASETS[dataset_key][1]
    worksheet = workbook.create_sheet(title=DATASETS[dataset_key][2][:31])
    features = get_features(payload)

    property_keys: list[str] = []
    seen_keys: set[str] = set()
    for feature in features:
        properties = feature.get("properties") if isinstance(feature, dict) else {}
        if not isinstance(properties, dict):
            properties = {}
        for property_key in properties:
            normalized_key = str(property_key)
            if normalized_key not in seen_keys:
                seen_keys.add(normalized_key)
                property_keys.append(normalized_key)

    base_headers = [
        "ردیف",
        "نوع هندسه",
        "X / طول یا مرکز تقریبی",
        "Y / عرض یا مرکز تقریبی",
        "محدوده مختصات (W,S,E,N)",
    ]
    worksheet.append(base_headers + property_keys)

    for index, feature in enumerate(features, start=1):
        if not isinstance(feature, dict):
            feature = {"properties": {"value": feature}}
        properties = feature.get("properties")
        if not isinstance(properties, dict):
            properties = {}
        geometry_type, x, y, bounds = _geometry_metadata(feature)
        row = [index, geometry_type, x, y, bounds]
        row.extend(_safe_cell(properties.get(key)) for key in property_keys)
        worksheet.append(row)

    _style_table(worksheet)
    worksheet.freeze_panes = "A2"
    worksheet.auto_filter.ref = worksheet.dimensions
    worksheet.sheet_properties.pageSetUpPr.fitToPage = True
    worksheet.page_setup.fitToWidth = 1
    worksheet.sheet_view.rightToLeft = True
    worksheet.sheet_properties.tabColor = "1769E0"
    worksheet.sheet_view.showGridLines = False
    worksheet.oddFooter.center.text = f"{label} | سامانه تصمیم‌یار شهری قزوین"
    return len(features)


def create_workbook(dataset_keys: list[str]) -> BytesIO:
    """Build an in-memory workbook for one or more catalogued datasets."""
    workbook = Workbook()
    summary = workbook.active
    summary.title = "خلاصه"
    summary.sheet_view.rightToLeft = True
    summary.sheet_view.showGridLines = False
    summary.append(["گزارش خروجی داده‌های مکانی", "سامانه تصمیم‌یار شهری قزوین"])
    summary.append(["نام لایه", "تعداد عوارض", "نوع هندسه"])

    records = []
    for dataset_key in dataset_keys:
        payload = load_dataset(dataset_key)
        features = get_features(payload)
        geometry_types = Counter(
            (feature.get("geometry") or {}).get("type", "نامشخص")
            for feature in features
            if isinstance(feature, dict)
        )
        geometry_summary = (
            "، ".join(
                f"{geometry_type}: {count}"
                for geometry_type, count in geometry_types.most_common()
            )
            or "بدون هندسه"
        )
        records.append((dataset_key, payload, len(features), geometry_summary))

    for dataset_key, _payload, count, geometry_summary in records:
        summary.append([DATASETS[dataset_key][1], count, geometry_summary])

    for cell in summary[1]:
        cell.fill = PatternFill("solid", fgColor="174A7E")
        cell.font = Font(name="Vazirmatn", color="FFFFFF", bold=True, size=12)
        cell.alignment = Alignment(horizontal="right", vertical="center")
    for cell in summary[2]:
        cell.fill = PatternFill("solid", fgColor="DDEBFA")
        cell.font = Font(name="Vazirmatn", color="174A7E", bold=True)
    for row in summary.iter_rows(min_row=3):
        for cell in row:
            cell.font = Font(name="Vazirmatn", size=10, color="20354D")
            cell.alignment = Alignment(
                horizontal="right", vertical="top", wrap_text=True
            )

    summary.row_dimensions[1].height = 30
    summary.column_dimensions["A"].width = 34
    summary.column_dimensions["B"].width = 18
    summary.column_dimensions["C"].width = 55
    summary.freeze_panes = "A3"
    summary.auto_filter.ref = f"A2:C{summary.max_row}"

    total_count = 0
    for dataset_key, payload, count, _geometry_summary in records:
        _write_dataset_sheet(workbook, dataset_key, payload)
        total_count += count

    summary.append(
        [
            "مجموع رکوردها",
            total_count,
            "تعداد رکوردهای فایل‌های منبع؛ نه ارزیابی کیفیت داده",
        ]
    )
    for cell in summary[summary.max_row]:
        cell.fill = PatternFill("solid", fgColor="E6F7EF")
        cell.font = Font(name="Vazirmatn", color="176B4D", bold=True)
        cell.alignment = Alignment(horizontal="right", vertical="top", wrap_text=True)

    output = BytesIO()
    workbook.save(output)
    output.seek(0)
    return output

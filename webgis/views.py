"""HTTP views for the Qazvin Urban Decision Support WebGIS."""
import logging

from django.http import (
    FileResponse,
    Http404,
    HttpRequest,
    HttpResponse,
    JsonResponse,
)
from django.shortcuts import render
from django.views.decorators.cache import cache_control
from django.views.decorators.http import require_GET

from .services.datasets import (
    DATASETS,
    DatasetNotFoundError,
    get_dataset_path,
)
from .services.excel_export import XLSX_CONTENT_TYPE, create_workbook

logger = logging.getLogger(__name__)


@require_GET
def index(request: HttpRequest) -> HttpResponse:
    """Render the main WebGIS application."""
    return render(request, "webgis/index.html")


@require_GET
def health(request: HttpRequest) -> JsonResponse:
    """Lightweight health endpoint for local checks and service monitoring."""
    return JsonResponse(
        {"status": "ok", "service": "qazvin-urban-decision-support"}
    )


@require_GET
@cache_control(public=True, max_age=300)
def dataset(request: HttpRequest, dataset_name: str) -> FileResponse:
    """Serve a dataset selected from the fixed application catalog."""
    try:
        dataset_path = get_dataset_path(dataset_name)
    except (DatasetNotFoundError, FileNotFoundError) as exc:
        raise Http404("Dataset not found") from exc

    media_type = (
        "application/geo+json"
        if dataset_path.suffix.lower() == ".geojson"
        else "application/json"
    )
    response = FileResponse(
        dataset_path.open("rb"),
        content_type=f"{media_type}; charset=utf-8",
    )
    response["X-Content-Type-Options"] = "nosniff"
    return response


@require_GET
def export_excel(request: HttpRequest) -> HttpResponse:
    """Export one catalogued dataset or all datasets as an XLSX workbook."""
    requested_dataset = request.GET.get("dataset", "all").strip()

    if requested_dataset == "all":
        dataset_keys = list(DATASETS)
    elif requested_dataset in DATASETS:
        dataset_keys = [requested_dataset]
    else:
        return JsonResponse(
            {
                "error": "dataset نامعتبر است.",
                "available": ["all", *DATASETS],
            },
            status=400,
        )

    try:
        workbook = create_workbook(dataset_keys)
    except (OSError, ValueError):
        logger.exception("Unable to generate Excel export for %s", requested_dataset)
        return JsonResponse(
            {"error": "آماده‌سازی فایل خروجی ناموفق بود."},
            status=500,
        )

    filename_suffix = (
        "all-data" if requested_dataset == "all" else requested_dataset
    )
    filename = f"qazvin-urban-decision-support-{filename_suffix}.xlsx"
    response = HttpResponse(workbook.getvalue(), content_type=XLSX_CONTENT_TYPE)
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    response["X-Content-Type-Options"] = "nosniff"
    response["Cache-Control"] = "no-store"
    return response

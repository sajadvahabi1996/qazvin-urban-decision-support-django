"""HTTP-level tests for the WebGIS pages and API endpoints."""

from pathlib import Path

from django.test import SimpleTestCase
from django.urls import reverse

from webgis.services.datasets import DATASETS

PROJECT_ROOT = Path(__file__).resolve().parents[2]
FRONTEND_BUNDLE = (
    PROJECT_ROOT
    / "webgis"
    / "static"
    / "webgis"
    / "js"
    / "app.bundle.js"
)


class WebGISPageTests(SimpleTestCase):
    def test_home_page_renders_application_assets_in_runtime_order(self):
        response = self.client.get(reverse("webgis:index"))

        self.assertEqual(response.status_code, 200)
        html = response.content.decode("utf-8")
        engine_position = html.index("digital-twin-engine.js")
        bundle_position = html.index("app.bundle.js")
        layout_position = html.index("ui-layout-fixes.js")
        reports_position = html.index("reports.js")

        self.assertLess(engine_position, bundle_position)
        self.assertLess(bundle_position, layout_position)
        self.assertLess(layout_position, reports_position)
        self.assertNotIn("src/app.js", html)
        self.assertIn("app.bundle.js?v=4", html)

    def test_generated_bundle_is_static_and_avoids_runtime_code_evaluation(self):
        bundle = FRONTEND_BUNDLE.read_text(encoding="utf-8")

        self.assertIn("const map = L.map(", bundle)
        self.assertNotIn("eval(", bundle)
        self.assertNotIn("new Function", bundle)
        self.assertNotIn("QAZVINAPPPARTS.push", bundle)

    def test_health_endpoint_returns_service_status(self):
        response = self.client.get(reverse("webgis:health"))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {"status": "ok", "service": "qazvin-urban-decision-support"},
        )

    def test_health_endpoint_rejects_non_get_requests(self):
        response = self.client.post(reverse("webgis:health"))
        self.assertEqual(response.status_code, 405)


class DatasetEndpointTests(SimpleTestCase):
    def test_dataset_is_served_from_the_fixed_catalog(self):
        response = self.client.get(
            reverse("webgis:data", kwargs={"dataset_name": "bus"})
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.headers["Content-Type"],
            "application/json; charset=utf-8",
        )
        self.assertEqual(response.headers["X-Content-Type-Options"], "nosniff")
        self.assertIn("max-age=300", response.headers["Cache-Control"])

    def test_geojson_dataset_uses_geojson_media_type(self):
        response = self.client.get(
            reverse("webgis:data", kwargs={"dataset_name": "neighborhoods"})
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.headers["Content-Type"],
            "application/geo+json; charset=utf-8",
        )

    def test_all_catalogued_datasets_are_available(self):
        for dataset_key in DATASETS:
            with self.subTest(dataset=dataset_key):
                response = self.client.get(
                    reverse("webgis:data", kwargs={"dataset_name": dataset_key})
                )
                self.assertEqual(response.status_code, 200)

    def test_unknown_dataset_is_not_served(self):
        response = self.client.get("/api/data/not-a-dataset/")
        self.assertEqual(response.status_code, 404)

    def test_dataset_endpoint_rejects_non_get_requests(self):
        response = self.client.post("/api/data/bus/")
        self.assertEqual(response.status_code, 405)

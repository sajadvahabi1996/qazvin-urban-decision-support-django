from io import BytesIO

from django.test import SimpleTestCase
from django.urls import reverse
from openpyxl import load_workbook


class WebGISViewsTests(SimpleTestCase):
    def test_health_endpoint(self):
        response = self.client.get(reverse("webgis:health"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "ok")

    def test_dataset_is_served(self):
        response = self.client.get(reverse("webgis:data", kwargs={"dataset_name": "bus"}))
        self.assertEqual(response.status_code, 200)
        self.assertIn("application/geo+json", response.headers["Content-Type"])

    def test_unknown_dataset_is_not_served(self):
        response = self.client.get("/api/data/not-a-dataset/")
        self.assertEqual(response.status_code, 404)

    def test_export_single_dataset_returns_valid_xlsx(self):
        response = self.client.get(reverse("webgis:export_excel"), {"dataset": "bus"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        workbook = load_workbook(BytesIO(response.content), read_only=True, data_only=True)
        self.assertIn("خلاصه", workbook.sheetnames)
        self.assertIn("اتوبوس", workbook.sheetnames)
        sheet = workbook["اتوبوس"]
        self.assertGreater(sheet.max_row, 1)
        workbook.close()

    def test_invalid_export_dataset_returns_400(self):
        response = self.client.get(reverse("webgis:export_excel"), {"dataset": "../../settings"})
        self.assertEqual(response.status_code, 400)

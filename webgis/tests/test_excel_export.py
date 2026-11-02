"""Tests for spreadsheet generation and export safety."""

from io import BytesIO

from django.test import SimpleTestCase
from django.urls import reverse
from openpyxl import load_workbook

from webgis.services.datasets import DATASETS
from webgis.services.excel_export import _safe_cell


class ExcelCellSafetyTests(SimpleTestCase):
    def test_formula_like_text_is_escaped(self):
        for value in ("=1+1", "+SUM(A1:A2)", "-cmd|' /C calc'!A0", "@SUM(A1:A2)"):
            with self.subTest(value=value):
                self.assertEqual(_safe_cell(value), "'" + value)

    def test_leading_whitespace_before_formula_marker_is_escaped(self):
        self.assertEqual(_safe_cell("  @SUM(A1:A2)"), "'  @SUM(A1:A2)")

    def test_nested_values_are_serialized_as_json(self):
        self.assertEqual(_safe_cell({"name": "محله"}), '{"name":"محله"}')
        self.assertEqual(_safe_cell([1, 2]), "[1,2]")

    def test_none_is_exported_as_an_empty_cell(self):
        self.assertEqual(_safe_cell(None), "")


class ExcelExportEndpointTests(SimpleTestCase):
    def test_single_dataset_export_returns_a_valid_workbook(self):
        response = self.client.get(
            reverse("webgis:export_excel"), {"dataset": "bus"}
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response["Content-Type"],
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        self.assertIn("attachment;", response["Content-Disposition"])
        workbook = load_workbook(
            BytesIO(response.content), read_only=True, data_only=True
        )
        self.assertIn("خلاصه", workbook.sheetnames)
        self.assertIn(DATASETS["bus"][2], workbook.sheetnames)
        self.assertGreater(workbook[DATASETS["bus"][2]].max_row, 1)
        workbook.close()

    def test_all_datasets_export_contains_summary_and_dataset_sheets(self):
        response = self.client.get(
            reverse("webgis:export_excel"), {"dataset": "all"}
        )
        self.assertEqual(response.status_code, 200)

        workbook = load_workbook(
            BytesIO(response.content), read_only=True, data_only=True
        )
        self.assertEqual(len(workbook.sheetnames), len(DATASETS) + 1)
        self.assertEqual(workbook.sheetnames[0], "خلاصه")
        workbook.close()

    def test_invalid_dataset_parameter_returns_bad_request(self):
        response = self.client.get(
            reverse("webgis:export_excel"),
            {"dataset": "../../settings"},
        )
        self.assertEqual(response.status_code, 400)

    def test_export_endpoint_rejects_non_get_requests(self):
        response = self.client.post(reverse("webgis:export_excel"))
        self.assertEqual(response.status_code, 405)

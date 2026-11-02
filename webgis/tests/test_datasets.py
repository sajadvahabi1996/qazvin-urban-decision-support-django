"""Tests for the dataset catalog and data normalization helpers."""

from django.test import SimpleTestCase

from webgis.services.datasets import (
    DATASETS,
    DATA_DIR,
    DatasetNotFoundError,
    get_dataset_path,
    get_features,
    load_dataset,
)


class DatasetCatalogTests(SimpleTestCase):
    def test_catalog_contains_only_files_inside_data_directory(self):
        for dataset_key in DATASETS:
            with self.subTest(dataset=dataset_key):
                dataset_path = get_dataset_path(dataset_key)
                self.assertEqual(dataset_path.parent, DATA_DIR)
                self.assertTrue(dataset_path.is_file())

    def test_unknown_dataset_key_is_rejected(self):
        with self.assertRaises(DatasetNotFoundError):
            get_dataset_path("../../settings")

    def test_every_bundled_dataset_is_valid_json(self):
        for dataset_key in DATASETS:
            with self.subTest(dataset=dataset_key):
                payload = load_dataset(dataset_key)
                self.assertIsInstance(payload, (dict, list))

    def test_load_dataset_reads_bundled_utf8_data(self):
        payload = load_dataset("neighborhoods")
        self.assertIsInstance(payload, dict)
        self.assertIsInstance(payload.get("features"), list)

    def test_get_features_normalizes_feature_collections_and_lists(self):
        feature = {"type": "Feature", "properties": {"id": 1}}
        self.assertEqual(get_features({"features": [feature]}), [feature])
        self.assertEqual(get_features([feature]), [feature])
        self.assertEqual(get_features({"features": None}), [])
        self.assertEqual(get_features(None), [])

import json
import unittest
from pathlib import Path
import importlib.util

ROOT = Path(__file__).parents[1]
spec = importlib.util.spec_from_file_location("update_timetables", ROOT / "scripts/update_timetables.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class TimetableParserTest(unittest.TestCase):
    def setUp(self):
        self.html = (ROOT / "tests/fixtures/ekitan_route.html").read_text(encoding="utf-8")

    def test_destination_and_day(self):
        destination, label = module.parse_route_info(self.html)
        self.assertEqual(destination, "亀有駅")
        self.assertEqual(label, "亀有駅")
        self.assertEqual(module.parse_day(self.html, "平日"), ["0608", "0623"])

    def test_each_day_fixture_variant(self):
        for day in ("土曜", "休日"):
            fixture = self.html.replace("平日", day)
            self.assertEqual(module.parse_day(fixture, day), ["0608", "0623"])

    def test_time_validation(self):
        for value in ("0000", "2359", "2901"):
            module.validate_time(value)
        with self.assertRaises(ValueError):
            module.validate_time("2460")

    def test_data_shape(self):
        data = {"routes": [{"stop": "奥戸3丁目", "destination": "亀有駅", "source": "x", "times": {
            "平日": ["0608"], "土曜": ["0700"], "休日": ["0800"]}}]}
        self.assertEqual(module.validate_data(data), {"平日": 1, "土曜": 1, "休日": 1})


if __name__ == "__main__":
    unittest.main()

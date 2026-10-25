import colorsys
import itertools
import tempfile
import unittest
from pathlib import Path

from app import create_app


class BookmarkApiTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.app = create_app({
            "TESTING": True,
            "DATABASE": str(Path(self.temp_dir.name) / "test.sqlite"),
        })
        self.client = self.app.test_client()
        self.state = self.client.get("/api/state").get_json()
        self.design = next(item for item in self.state["categories"] if item["name"] == "Design")

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_creates_updates_and_deletes_bookmarks(self):
        response = self.client.post("/api/bookmarks", json={
            "title": "Example",
            "url": "example.com/path",
            "categoryId": self.design["id"],
        })
        self.assertEqual(response.status_code, 201)
        bookmark = response.get_json()
        self.assertEqual(bookmark["url"], "https://example.com/path")

        response = self.client.put(f"/api/bookmarks/{bookmark['id']}", json={
            "title": "Updated",
            "url": "https://example.org",
            "categoryId": self.design["id"],
        })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["title"], "Updated")

        response = self.client.delete(f"/api/bookmarks/{bookmark['id']}")
        self.assertEqual(response.status_code, 204)

    def test_rejects_unsafe_urls_and_duplicate_categories(self):
        response = self.client.post("/api/bookmarks", json={
            "title": "Unsafe",
            "url": "javascript:alert(1)",
            "categoryId": self.design["id"],
        })
        self.assertEqual(response.status_code, 400)

        response = self.client.post("/api/categories", json={"name": "Design"})
        self.assertEqual(response.status_code, 409)

    def test_persists_category_creation_order_and_collapse(self):
        created = self.client.post("/api/categories", json={"name": "Research"})
        self.assertEqual(created.status_code, 201)
        new_category = created.get_json()
        category_id = new_category["id"]
        self.assertRegex(new_category["color"], r"^#[0-9a-fA-F]{6}$")
        colors = [item["color"] for item in self.state["categories"]] + [new_category["color"]]
        hues = [
            colorsys.rgb_to_hls(*(int(color[index:index + 2], 16) / 255 for index in (1, 3, 5)))[0]
            for color in colors
        ]
        for left, right in itertools.combinations(hues, 2):
            hue_distance = min(abs(left - right), 1 - abs(left - right))
            self.assertGreaterEqual(hue_distance, 20 / 360)
        category_ids = [item["id"] for item in self.state["categories"]] + [category_id]

        response = self.client.patch("/api/categories/order", json={"ids": list(reversed(category_ids))})
        self.assertEqual(response.status_code, 200)
        response = self.client.patch(f"/api/categories/{category_id}/collapsed", json={"collapsed": True})
        self.assertEqual(response.status_code, 200)

        state = self.client.get("/api/state").get_json()
        self.assertEqual([item["id"] for item in state["categories"]], list(reversed(category_ids)))
        self.assertTrue(next(item for item in state["categories"] if item["id"] == category_id)["collapsed"])

    def test_rejects_incomplete_category_order(self):
        response = self.client.patch("/api/categories/order", json={"ids": []})
        self.assertEqual(response.status_code, 400)

    def test_updates_category_color_and_rejects_invalid_values(self):
        response = self.client.patch(
            f"/api/categories/{self.design['id']}/color",
            json={"color": "#1122AA"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["color"], "#1122aa")

        state = self.client.get("/api/state").get_json()
        updated = next(item for item in state["categories"] if item["id"] == self.design["id"])
        self.assertEqual(updated["color"], "#1122aa")

        response = self.client.patch(
            f"/api/categories/{self.design['id']}/color",
            json={"color": "red"},
        )
        self.assertEqual(response.status_code, 400)

    def test_renames_category_and_rejects_duplicate_names(self):
        response = self.client.patch(
            f"/api/categories/{self.design['id']}",
            json={"name": "Visual Design"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["name"], "Visual Design")

        state = self.client.get("/api/state").get_json()
        renamed = next(item for item in state["categories"] if item["id"] == self.design["id"])
        self.assertEqual(renamed["name"], "Visual Design")
        self.assertEqual(renamed["color"], self.design["color"])

        response = self.client.patch(
            f"/api/categories/{self.design['id']}",
            json={"name": "Development"},
        )
        self.assertEqual(response.status_code, 409)

    def test_deletes_category_and_its_bookmarks(self):
        created_category = self.client.post("/api/categories", json={"name": "Disposable"}).get_json()
        bookmark = self.client.post("/api/bookmarks", json={
            "title": "Temporary link",
            "url": "https://example.com/temp",
            "categoryId": created_category["id"],
        }).get_json()

        response = self.client.delete(f"/api/categories/{created_category['id']}")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["deletedBookmarkCount"], 1)

        state = self.client.get("/api/state").get_json()
        self.assertNotIn(created_category["id"], [item["id"] for item in state["categories"]])
        self.assertNotIn(bookmark["id"], [item["id"] for item in state["bookmarks"]])

    def test_serves_dashboard_and_security_headers(self):
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("/static/js/app.js", response.get_data(as_text=True))
        self.assertEqual(response.headers["X-Content-Type-Options"], "nosniff")
        self.assertIn("frame-ancestors 'none'", response.headers["Content-Security-Policy"])


if __name__ == "__main__":
    unittest.main()

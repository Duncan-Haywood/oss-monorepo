import unittest

import pick_track


class MilestonesTest(unittest.TestCase):
    def test_capture_lists_milestones(self):
        listed, free = pick_track.milestones("capture")
        self.assertIn("capture-crop", listed)
        self.assertTrue(set(free) <= set(listed))

    def test_unknown_prefix_is_empty(self):
        self.assertEqual(pick_track.milestones("nosuchtrack"), ([], []))


if __name__ == "__main__":
    unittest.main()

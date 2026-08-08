#!/usr/bin/env python3
"""
Regenerates resources/settings/settings.xml and resources/settings/properties.xml
from the CITIES list below.

Run this after adding/reordering/removing a city in source/CityData.mc so
the on-device settings picker (settings.xml) and the shipped defaults
(properties.xml) stay in sync with the catalog. This list, CityData.CITIES,
and defaultCityIndices in source/WorldTravelerView.mc must all agree on
city order -- there is no single source of truth enforced at build time.

Usage: python3 scripts/gen_settings.py
(run from the venture root, ventures/garmin-world-traveler-watchface/)
"""

import os

# Keep in exact sync with source/CityData.mc's CITIES array order.
CITIES = [
    "Pago Pago", "Honolulu", "Anchorage", "Los Angeles", "Denver", "Chicago",
    "New York", "Halifax", "Sao Paulo", "London", "Paris", "Athens",
    "Moscow", "Dubai", "Karachi", "Delhi", "Dhaka", "Bangkok", "Beijing",
    "Tokyo", "Sydney", "Honiara", "Auckland", "Nukualofa",
]

# Number of user-selectable city slots. Keep in sync with citySlotKeys /
# defaultCityIndices / columns in source/WorldTravelerView.mc.
SLOT_COUNT = 16

# Default city index per slot (into CITIES above). Keep in sync with
# defaultCityIndices in source/WorldTravelerView.mc.
DEFAULT_INDICES = [1, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 15, 17, 18, 19, 20]

THEMES = ["Midnight", "Aurora", "Sand", "Mono"]

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def city_list_entries(indent="            "):
    return "\n".join(
        f'{indent}<listEntry value="{i}">{name}</listEntry>'
        for i, name in enumerate(CITIES)
    )


def build_settings_xml():
    blocks = []
    for n in range(1, SLOT_COUNT + 1):
        blocks.append(
            f'    <setting propertyKey="@Properties.City{n}Index" title="@Strings.City{n}Title">\n'
            f'        <settingConfig type="list">\n'
            f'{city_list_entries()}\n'
            f'        </settingConfig>\n'
            f'    </setting>'
        )

    theme_entries = "\n".join(
        f'            <listEntry value="{i}">@Strings.Theme{name}</listEntry>'
        for i, name in enumerate(THEMES)
    )
    blocks.append(
        '    <setting propertyKey="@Properties.ThemeIndex" title="@Strings.ThemeTitle">\n'
        '        <settingConfig type="list">\n'
        f'{theme_entries}\n'
        '        </settingConfig>\n'
        '    </setting>'
    )

    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<settings>\n' + "\n".join(blocks) + "\n</settings>\n"
    )


def build_properties_xml():
    assert len(DEFAULT_INDICES) == SLOT_COUNT
    props = "\n".join(
        f'    <property id="City{n}Index" type="number">{DEFAULT_INDICES[n - 1]}</property>'
        for n in range(1, SLOT_COUNT + 1)
    )
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<!--\n'
        '  Default values. Index numbers refer to CityData.CITIES in\n'
        '  source/CityData.mc, keep the two in sync if the catalog is reordered.\n'
        '  Regenerate this file (and settings.xml) with scripts/gen_settings.py.\n'
        '-->\n'
        '<properties>\n'
        f'{props}\n'
        '    <property id="ThemeIndex" type="number">0</property>\n'
        '</properties>\n'
    )


def main():
    settings_path = os.path.join(ROOT, "resources", "settings", "settings.xml")
    properties_path = os.path.join(ROOT, "resources", "settings", "properties.xml")

    with open(settings_path, "w") as f:
        f.write(build_settings_xml())
    with open(properties_path, "w") as f:
        f.write(build_properties_xml())

    print(f"Wrote {settings_path}")
    print(f"Wrote {properties_path}")
    print(f"{len(CITIES)} cities x {SLOT_COUNT} slots")


if __name__ == "__main__":
    main()

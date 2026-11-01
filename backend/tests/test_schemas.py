from copy import deepcopy

import pytest
from conftest import DISPLAY, PROFILE
from ctx_server.errors import APIError
from ctx_server.schemas import normalize_content, resolve_profile


def test_legacy_id_repair_and_stability():
    value = deepcopy(PROFILE)
    del value["profile"]["schedules"][0]["id"]
    normalized, warnings = normalize_content("profile", value)
    assert warnings
    assert normalized["profile"]["activeWeekScheduleId"] == ""
    assert normalize_content("profile", normalized)[0] == normalized
    value["profile"]["schedules"][0]["id"] = "duplicate"
    value["profile"]["schedules"].append(deepcopy(value["profile"]["schedules"][0]))
    value["profile"]["activeWeekScheduleId"] = "duplicate"
    normalized, warnings = normalize_content("profile", value)
    assert len({w["id"] for w in normalized["profile"]["schedules"]}) == 2
    assert normalized["profile"]["activeWeekScheduleId"] == ""


@pytest.mark.parametrize(
    "mutate",
    [
        lambda p: p.update(version=2),
        lambda p: p["profile"].update(unrecognized=True),
        lambda p: p["profile"].update(name="\ud800"),
        lambda p: p["profile"]["schedules"][0]["daySchedules"][0].update(enableDay=True),
        lambda p: p["profile"]["schedules"][0]["daySchedules"][0]["classes"][0].update(endTime="07:59:00"),
        lambda p: p["profile"]["schedules"][0]["daySchedules"][0]["classes"].append(
            {"subject": "语文", "startTime": "08:30:00", "endTime": "09:00:00"}
        ),
    ],
)
def test_invalid_profile(mutate):
    value = deepcopy(PROFILE)
    mutate(value)
    with pytest.raises(APIError):
        normalize_content("profile", value)


@pytest.mark.parametrize(
    "section,field,value",
    [
        ("courseBarConfig", "uiAccessEnabled", True),
        ("courseBarConfig", "screenName", "screen"),
        ("appearanceConfig", "themeColor", "red"),
        ("desktopCountdownConfig", "scalePercent", 201),
        ("desktopCountdownConfig", "targetDateTime", "2026-10-25T08:00:00Z"),
        ("desktopCountdownConfig", "enable", True),
    ],
)
def test_display_whitelist_and_ranges(section, field, value):
    content = deepcopy(DISPLAY)
    content.setdefault(section, {})[field] = value
    with pytest.raises(APIError):
        normalize_content("display_config", content)


def test_display_v2_optional_sections_and_legacy_preservation():
    legacy, _ = normalize_content("display_config", DISPLAY)
    assert legacy["schema_version"] == 1
    assert "windowInterceptionConfig" not in legacy and "pluginConfig" not in legacy
    content = deepcopy(DISPLAY) | {
        "schema_version": 2,
        "windowInterceptionConfig": {"rules": [
            {"exePath": "C:/Apps/test.exe", "className": "TestWindow"}
        ]},
        "pluginConfig": {"plugins": {"org.example.clock": {"enabled": True}}},
    }
    normalized, _ = normalize_content("display_config", content)
    assert normalized["windowInterceptionConfig"]["rules"][0]["titleContains"] == ""
    assert normalized["windowInterceptionConfig"]["rules"][0]["enabled"] is True
    assert normalize_content("display_config", normalized)[0] == normalized
    content["windowInterceptionConfig"]["rules"] = []
    assert normalize_content("display_config", content)[0]["windowInterceptionConfig"] == {"rules": []}


@pytest.mark.parametrize("section,value", [
    ("windowInterceptionConfig", None),
    ("windowInterceptionConfig", {"rules": [{"exePath": " ", "className": "Window"}]}),
    ("windowInterceptionConfig", {"rules": [{"exePath": "a.exe", "className": ""}]}),
    ("windowInterceptionConfig", {"rules": [], "unknown": True}),
    ("pluginConfig", {"plugins": {"invalid": {"enabled": True}}}),
    ("pluginConfig", {"plugins": {"org.con.test": {"enabled": True}}}),
    ("pluginConfig", {"plugins": {"org.example.clock": {"enabled": "true"}}}),
    ("pluginConfig", {"plugins": {"org.example.clock": {"enabled": True, "grantedPermissions": {}}}}),
])
def test_display_v2_rejects_invalid_rules_and_plugin_preferences(section, value):
    for version in (1, 2):
        content = deepcopy(DISPLAY) | {"schema_version": version, section: value}
        with pytest.raises(APIError):
            normalize_content("display_config", content)


@pytest.mark.parametrize("section,value", [
    ("windowInterceptionConfig", {"rules": []}),
    ("pluginConfig", {"plugins": {}}),
])
def test_display_v1_rejects_new_sections(section, value):
    with pytest.raises(APIError):
        normalize_content("display_config", deepcopy(DISPLAY) | {section: value})


def test_date_preview_manual_odd_even_and_override():
    value = deepcopy(PROFILE)
    data = value["profile"]
    data["semesterStartDate"] = "2026-10-19"
    data["schedules"][0]["mode"] = "odd"
    normalized, _ = normalize_content("profile", value)
    assert resolve_profile(normalized, "2026-10-19")["classes"]
    assert not resolve_profile(normalized, "2026-10-26")["classes"]
    data["activeWeekScheduleId"] = "week-a"
    normalized, _ = normalize_content("profile", value)
    assert resolve_profile(normalized, "2026-10-26")["classes"]
    data["dateOverrides"] = [
        {
            "date": "2026-10-26",
            "sourceWeekScheduleId": "week-a",
            "sourceWeekday": 1,
            "sourceClasses": data["schedules"][0]["daySchedules"][0]["classes"],
            "classes": [],
        }
    ]
    normalized, _ = normalize_content("profile", value)
    assert resolve_profile(normalized, "2026-10-26") == {
        "special": True,
        "schedule_id": "week-a",
        "classes": [],
    }


def test_ambiguous_preview_is_not_arbitrary():
    value = deepcopy(PROFILE)
    week = deepcopy(value["profile"]["schedules"][0])
    week["id"] = "week-b"
    value["profile"]["schedules"].append(week)
    normalized, _ = normalize_content("profile", value)
    assert "多张" in resolve_profile(normalized, "2026-10-19")["error"]

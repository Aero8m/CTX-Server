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

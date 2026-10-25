"""Strict wire schemas shared through generated JSON Schema and TypeScript."""

import json
import re
import uuid
from collections import Counter
from datetime import date, datetime, time
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator

from .errors import APIError

Name = Annotated[str, Field(min_length=1, max_length=100)]
ID = Annotated[str, Field(pattern=r"^[a-f0-9]{32}$")]
Kind = Literal["profile", "display_config"]
Positive = Annotated[int, Field(ge=1, le=2147483647)]
Text = Annotated[str, Field(max_length=1000)]


class Wire(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, validate_default=True)


def nonblank(value):
    if not value.strip():
        raise ValueError("不能为空白文本")
    return value


def valid_date(value):
    if value is not None:
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
            raise ValueError("日期必须为 YYYY-MM-DD")
        date.fromisoformat(value)
    return value


def valid_time(value):
    if not re.fullmatch(r"\d{2}:\d{2}:\d{2}", value):
        raise ValueError("时间必须为 HH:mm:ss")
    time.fromisoformat(value)
    return value


class TimeRange(Wire):
    startTime: str
    endTime: str
    _time = field_validator("startTime", "endTime")(valid_time)

    @model_validator(mode="after")
    def ordered(self):
        if self.startTime >= self.endTime:
            raise ValueError("开始时间必须早于结束时间")
        return self


class Course(TimeRange):
    subject: Name
    _subject = field_validator("subject")(nonblank)


def no_overlap(items):
    ordered = sorted(items, key=lambda c: c.startTime)
    if any(a.endTime > b.startTime for a, b in zip(ordered, ordered[1:])):
        raise ValueError("时间段重叠")
    return items


class Subject(Wire):
    name: Name
    simplifiedName: Annotated[str, Field(max_length=100)]
    teacher: Annotated[str, Field(max_length=100)]
    _name = field_validator("name")(nonblank)


class TimeLine(Wire):
    name: Name
    timePoints: Annotated[list[TimeRange], Field(max_length=1000)]
    _name = field_validator("name")(nonblank)
    _overlap = field_validator("timePoints")(no_overlap)


class DaySchedule(Wire):
    name: Name
    enableDay: Annotated[int, Field(ge=1, le=7)]
    classes: Annotated[list[Course], Field(max_length=1000)]
    _name = field_validator("name")(nonblank)
    _overlap = field_validator("classes")(no_overlap)


class WeekSchedule(Wire):
    name: Name
    id: Annotated[str, Field(min_length=1, max_length=128)]
    mode: Literal["all", "odd", "even"]
    daySchedules: Annotated[list[DaySchedule], Field(max_length=7)]
    _name = field_validator("name", "id")(nonblank)

    @field_validator("daySchedules")
    @classmethod
    def distinct_days(cls, days):
        if len({d.enableDay for d in days}) != len(days):
            raise ValueError("星期重复")
        return days


class DateOverride(Wire):
    date: str
    sourceWeekScheduleId: Annotated[str, Field(min_length=1, max_length=128)]
    sourceWeekday: Annotated[int, Field(ge=1, le=7)]
    sourceClasses: Annotated[list[Course], Field(max_length=1000)]
    classes: Annotated[list[Course], Field(max_length=1000)]
    _date = field_validator("date")(valid_date)
    _overlap = field_validator("sourceClasses", "classes")(no_overlap)


class ReminderRule(Wire):
    id: Annotated[str, Field(min_length=1, max_length=128)]
    name: Name
    enabled: bool
    text: Annotated[str, Field(min_length=1, max_length=1000)]
    weekdays: Annotated[list[Annotated[int, Field(ge=1, le=7)]], Field(min_length=1, max_length=7)]
    course: Annotated[int, Field(ge=0, le=2)]
    subject: Annotated[str, Field(max_length=100)]
    period: Annotated[int, Field(ge=1, le=999)]
    timing: Annotated[int, Field(ge=0, le=2)]
    time: str
    offsetMinutes: Annotated[int, Field(ge=-1439, le=1439)]
    _time = field_validator("time")(valid_time)
    _text = field_validator("name", "text", "id")(nonblank)

    @model_validator(mode="after")
    def conditions(self):
        if len(set(self.weekdays)) != len(self.weekdays):
            raise ValueError("提醒星期重复")
        if self.course == 1 and not self.subject.strip():
            raise ValueError("指定科目提醒必须填写科目")
        if self.timing == 0 and any(p in self.text for p in ("{科目}", "{节次}")):
            raise ValueError("固定时间提醒不能使用课程占位符")
        return self


class Profile(Wire):
    name: Name
    semesterStartDate: str | None = None
    subjects: Annotated[list[Subject], Field(max_length=1000)]
    timeLines: Annotated[list[TimeLine], Field(max_length=100)]
    schedules: Annotated[list[WeekSchedule], Field(max_length=100)]
    activeWeekScheduleId: Annotated[str, Field(max_length=128)] = ""
    dateOverrides: Annotated[list[DateOverride], Field(max_length=1000)] = Field(default_factory=list)
    reminderRules: Annotated[list[ReminderRule], Field(max_length=1000)] = Field(default_factory=list)
    _date = field_validator("semesterStartDate")(valid_date)
    _name = field_validator("name")(nonblank)

    @model_validator(mode="after")
    def references(self):
        for values, label in [
            ([s.name.strip() for s in self.subjects], "科目名称"),
            ([s.id for s in self.schedules], "课表 ID"),
            ([r.id for r in self.reminderRules], "提醒 ID"),
            ([o.date for o in self.dateOverrides], "特殊安排日期"),
        ]:
            if len(set(values)) != len(values):
                raise ValueError(label + "重复")
        ids = {s.id for s in self.schedules}
        if self.activeWeekScheduleId and self.activeWeekScheduleId not in ids:
            raise ValueError("手动选择的课表不存在")
        for override in self.dateOverrides:
            source = next(
                (
                    d
                    for w in self.schedules
                    if w.id == override.sourceWeekScheduleId
                    for d in w.daySchedules
                    if d.enableDay == override.sourceWeekday
                ),
                None,
            )
            if not source or sorted((c.model_dump() for c in source.classes), key=str) != sorted(
                (c.model_dump() for c in override.sourceClasses), key=str
            ):
                raise ValueError("特殊安排来源不存在或与来源快照不一致")
        return self


class NativeProfile(Wire):
    version: Literal[1]
    profile: Profile

    @field_validator("version", mode="before")
    @classmethod
    def strict_version(cls, value):
        if type(value) is not int:
            raise ValueError("版本号必须为整数")
        return value


class Component(Wire):
    typeId: Literal["builtin/date", "builtin/courseView", "builtin/countdown", "builtin/textTip"]
    instanceId: Annotated[str, Field(min_length=1, max_length=128)]
    enabled: bool = True
    settings: dict = Field(default_factory=dict)
    text: Annotated[str, Field(max_length=1000)] | None = None
    courseSpacing: Annotated[int, Field(ge=0, le=100)] | None = None

    @model_validator(mode="after")
    def settings_allowed(self):
        if self.settings:
            raise ValueError("首版内置组件 settings 必须为空对象")
        if self.text is not None and self.typeId != "builtin/textTip":
            raise ValueError("仅文本提示组件支持 text")
        if self.courseSpacing is not None and self.typeId != "builtin/courseView":
            raise ValueError("仅课程查看组件支持 courseSpacing")
        return self


class CourseBar(Wire):
    enable: bool = True
    height: Annotated[int, Field(ge=1, le=1000)] = 49
    componentSpacing: Annotated[int, Field(ge=0, le=100)] = 14
    components: Annotated[list[Component], Field(max_length=32)]

    @field_validator("components")
    @classmethod
    def unique_components(cls, items):
        if len({c.instanceId for c in items}) != len(items):
            raise ValueError("组件 instanceId 重复")
        return items


class Appearance(Wire):
    themeColor: Annotated[str, Field(pattern=r"^#[0-9a-fA-F]{6}$")] = "#1191d3"
    themeMode: Literal["system", "light", "dark"] = "system"
    windowEffect: Literal["normal", "elaMica", "mica", "micaAlt", "acrylic", "dwmBlur"] = "mica"


class Countdown(Wire):
    enable: bool = False
    targetDateTime: Annotated[str, Field(max_length=19)] = ""
    labelTag: Annotated[str, Field(max_length=100)] = ""
    englishTag: Annotated[str, Field(max_length=100)] = ""
    showMilliseconds: bool = True
    useLegacyPlacement: bool = True
    rightMargin: Annotated[int, Field(ge=0, le=10000)] = 24
    bottomMargin: Annotated[int, Field(ge=0, le=10000)] = 24
    scalePercent: Annotated[int, Field(ge=50, le=200)] = 100

    @model_validator(mode="after")
    def target(self):
        if self.targetDateTime:
            if not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}", self.targetDateTime):
                raise ValueError("目标时间必须为无时区的 YYYY-MM-DDTHH:mm:ss")
            datetime.fromisoformat(self.targetDateTime)
        elif self.enable:
            raise ValueError("启用倒计时需要目标时间")
        return self


class DisplayConfig(Wire):
    schema_version: Literal[1] = 1
    courseBarConfig: CourseBar
    appearanceConfig: Appearance = Field(default_factory=Appearance)
    desktopCountdownConfig: Countdown = Field(default_factory=Countdown)

    _strict_version = field_validator("schema_version", mode="before")(NativeProfile.strict_version.__func__)


class Credentials(Wire):
    username: Annotated[str, Field(pattern=r"^[A-Za-z0-9_]{3,32}$")]
    password: Annotated[str, Field(min_length=10, max_length=128)]
    captcha_id: ID | None = None
    captcha_answer: Annotated[str, Field(max_length=10)] | None = None


class PasswordChange(Wire):
    old_password: Annotated[str, Field(min_length=1, max_length=128)]
    new_password: Annotated[str, Field(min_length=10, max_length=128)]


class Named(Wire):
    name: Name
    _name = field_validator("name")(nonblank)


class DeviceEdit(Wire):
    name: Name | None = None
    group_id: ID | None = None

    @field_validator("name")
    @classmethod
    def valid_name(cls, value):
        return nonblank(value) if value is not None else value


class PairCodeCreate(Named):
    group_id: ID | None = None


class PairClaim(Wire):
    code: Annotated[str, Field(pattern=r"^[A-Z2-9]{12}$")]
    claim_id: Annotated[str, Field(min_length=16, max_length=64, pattern=r"^[a-zA-Z0-9_-]+$")]
    device_secret: Annotated[str, Field(min_length=43, max_length=128, pattern=r"^[A-Za-z0-9_-]+$")]
    client_version: Annotated[str, Field(max_length=100)] = ""


class ResourceCreate(Named):
    kind: Kind
    content: dict


class ResourceValidate(Wire):
    kind: Kind
    content: dict


class ResourceEdit(Wire):
    revision: Positive
    name: Name | None = None
    content: dict | None = None
    archived: bool | None = None


class ResourceRef(Wire):
    id: ID
    revision: Positive


class ReleaseRequest(Wire):
    resources: Annotated[list[ResourceRef], Field(min_length=1, max_length=2)]
    device_ids: Annotated[list[ID], Field(max_length=1000)] = Field(default_factory=list)
    group_ids: Annotated[list[ID], Field(max_length=1000)] = Field(default_factory=list)
    note: Annotated[str, Field(max_length=500)] = ""


class RollbackRequest(Wire):
    device_ids: Annotated[list[ID], Field(max_length=1000)] = Field(default_factory=list)
    group_ids: Annotated[list[ID], Field(max_length=1000)] = Field(default_factory=list)
    note: Annotated[str, Field(max_length=500)] = ""


class LocalState(Wire):
    generation: Annotated[int, Field(ge=0)]
    version_id: ID | None = None


class SupportedFormats(Wire):
    profile: Annotated[list[Positive], Field(max_length=10)] = Field(default_factory=lambda: [1])
    display_config: Annotated[list[Positive], Field(max_length=10)] = Field(default_factory=lambda: [1])


class SyncRequest(Wire):
    client_version: Annotated[str, Field(max_length=100)] = ""
    supported_formats: SupportedFormats = Field(default_factory=SupportedFormats)
    applied: dict[Kind, LocalState] = Field(default_factory=dict)


class ReceiptRequest(Wire):
    assignment_id: ID
    kind: Kind
    generation: Positive
    version_id: ID
    attempt: Positive
    result: Literal["applied", "failed", "blocked"]
    reason: Annotated[str, Field(max_length=1000)] = ""


def parse(schema, data):
    try:
        return schema.model_validate(data)
    except ValidationError as error:
        raise APIError(
            "validation_error",
            "请求内容未通过校验",
            422,
            [
                {"path": ".".join(map(str, e["loc"])), "message": e["msg"]}
                for e in error.errors(include_input=False)
            ],
        ) from None


def canonical(data):
    return json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


def normalize_content(kind, content):
    warnings = []
    try:
        serialized = canonical(content)
        serialized.encode("utf-8")
        content = json.loads(serialized)
    except (ValueError, TypeError, RecursionError):
        raise APIError("validation_error", "JSON 包含非法数值或嵌套过深", 422) from None
    if kind == "profile":
        profile = content.get("profile")
        if isinstance(profile, dict) and isinstance(profile.get("schedules"), list):
            weeks = profile["schedules"]
            ids = [s.get("id", "") for s in weeks if isinstance(s, dict)]
            # Let the strict parser report wrong ID types rather than repairing them.
            if all(isinstance(i, str) for i in ids):
                counts = Counter(ids)
                selected = profile.get("activeWeekScheduleId", "")
                if isinstance(selected, str) and (not selected.strip() or counts[selected] != 1):
                    if selected:
                        warnings.append("手动课表选择无唯一有效引用，已恢复自动匹配")
                    profile["activeWeekScheduleId"] = ""
                used = set(ids)
                for week in weeks:
                    if isinstance(week, dict) and (
                        not week.get("id", "").strip() or counts[week.get("id", "")] != 1
                    ):
                        new_id = uuid.uuid4().hex
                        while new_id in used:
                            new_id = uuid.uuid4().hex
                        week["id"] = new_id
                        used.add(new_id)
                        warnings.append("已为旧档案中缺失或重复的周课表 ID 生成稳定 ID")
        model = parse(NativeProfile, content)
    else:
        model = parse(DisplayConfig, content)
    return model.model_dump(exclude_none=True), warnings


def resolve_profile(content, day_text, selected_id=None):
    """Same precedence as DateSchedule::resolve: override, manual, automatic."""
    value = parse(NativeProfile, content).profile
    try:
        valid_date(day_text)
        day = date.fromisoformat(day_text)
    except (ValueError, TypeError):
        raise APIError("validation_error", "日期必须为 YYYY-MM-DD", 422) from None
    for override in value.dateOverrides:
        if override.date == day_text:
            return {
                "special": True,
                "schedule_id": override.sourceWeekScheduleId,
                "classes": [c.model_dump() for c in sorted(override.classes, key=lambda c: c.startTime)],
            }
    selection = selected_id or value.activeWeekScheduleId
    matches = []
    first_monday = None
    if value.semesterStartDate:
        start = date.fromisoformat(value.semesterStartDate)
        from datetime import timedelta

        first_monday = start - timedelta(days=start.weekday())
    for week in value.schedules:
        if selection:
            if week.id == selection:
                matches.append(week)
            continue
        if not any(d.enableDay == day.isoweekday() for d in week.daySchedules):
            continue
        if week.mode != "all":
            if first_monday is None:
                return {"error": "单双周课表需要学期开始日期", "classes": []}
            number = (day - first_monday).days // 7 + 1
            if number < 1 or (week.mode == "odd") != (number % 2 == 1):
                continue
        matches.append(week)
    if len(matches) > 1:
        return {"error": "多张周课表匹配，请明确选择", "matches": [w.id for w in matches], "classes": []}
    if not matches:
        return {"error": "选择的课表不存在" if selection else None, "classes": []}
    week = matches[0]
    courses = next((d.classes for d in week.daySchedules if d.enableDay == day.isoweekday()), [])
    return {
        "special": False,
        "schedule_id": week.id,
        "name": week.name,
        "classes": [c.model_dump() for c in sorted(courses, key=lambda c: c.startTime)],
    }

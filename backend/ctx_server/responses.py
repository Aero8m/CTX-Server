"""Response contracts exported alongside request schemas for client generation."""

from typing import Literal

from .schemas import Kind, Wire


class AccountView(Wire):
    id: str
    username: str
    created_at: str


class GroupView(Wire):
    id: str
    name: str
    created_at: str


class ChannelView(Wire):
    kind: Kind
    generation: int
    assignment_id: str | None
    target_version_id: str | None
    applied_version_id: str | None
    applied_generation: int
    attempt: int
    status: Literal["pending", "applied", "failed", "blocked"]
    reason: str


class ReceiptView(Wire):
    id: str
    assignment_id: str
    kind: Kind
    generation: int
    version_id: str
    attempt: int
    result: Literal["applied", "failed", "blocked"]
    reason: str
    created_at: str


class DeviceView(Wire):
    id: str
    name: str
    group_id: str | None
    created_at: str
    revoked_at: str | None
    last_seen_at: str | None
    client_version: str
    online: bool
    channels: list[ChannelView]
    receipts: list[ReceiptView] | None = None


class ResourceView(Wire):
    id: str
    name: str
    kind: Kind
    revision: int
    archived: bool
    created_at: str
    updated_at: str
    content: dict | None = None


class VersionView(Wire):
    id: str
    resource_id: str
    kind: Kind
    sha256: str
    format_version: int


class TargetView(Wire):
    assignment_id: str
    device_id: str
    device_name: str
    kind: Kind
    generation: int
    version_id: str
    superseded: bool
    status: Literal["pending", "applied", "failed", "blocked"]
    reason: str


class ReleaseView(Wire):
    id: str
    created_at: str
    note: str
    rollback_of: str | None
    versions: list[VersionView]
    target_count: int
    targets: list[TargetView] | None = None


class SyncTarget(ChannelView):
    version_id: str
    sha256: str
    format_version: int
    compatible: bool
    download_url: str | None


class SyncView(Wire):
    device_id: str
    server_time: str
    sync_after_seconds: int
    channels: dict[Kind, SyncTarget | None]


class PreviewDevice(Wire):
    id: str
    name: str


class PreviewVersion(Wire):
    kind: Kind
    sha256: str
    content: dict


class PreviewView(Wire):
    preview_token: str
    devices: list[PreviewDevice]
    versions: list[PreviewVersion]


class LoginView(Wire):
    account: AccountView
    csrf_token: str


class ResourceSaveView(Wire):
    resource: ResourceView
    warnings: list[str]


class ReceiptSavedView(Wire):
    receipt_id: str
    duplicate: bool


class PairingView(Wire):
    id: str
    name: str
    group_id: str | None
    expires_at: str
    revoked_at: str | None
    device_id: str | None
    created_at: str
    code: str | None = None


class PairResult(Wire):
    device_id: str
    name: str


class CSRFView(Wire):
    csrf_token: str
    authenticated: bool


class CaptchaView(Wire):
    id: str
    image: str
    expires_at: str


class ValidationView(Wire):
    content: dict
    warnings: list[str]


class DatePreviewView(Wire):
    special: bool | None = None
    schedule_id: str | None = None
    name: str | None = None
    error: str | None = None
    matches: list[str] | None = None
    classes: list[dict]


class HealthView(Wire):
    status: Literal["ok", "ready"]


class ErrorDetail(Wire):
    code: str
    message: str
    details: dict | list | str | None
    request_id: str


class ErrorView(Wire):
    error: ErrorDetail


class Paged(Wire):
    items: list[dict]
    total: int
    page: int
    page_size: int


RESPONSE_MODELS = [
    AccountView,
    GroupView,
    ChannelView,
    ReceiptView,
    DeviceView,
    ResourceView,
    VersionView,
    TargetView,
    ReleaseView,
    SyncView,
    PreviewView,
    LoginView,
    ResourceSaveView,
    ReceiptSavedView,
    PairingView,
    PairResult,
    CSRFView,
    CaptchaView,
    ValidationView,
    DatePreviewView,
    HealthView,
    ErrorView,
    Paged,
]

RESPONSE_MAP = {
    "live": HealthView,
    "ready": HealthView,
    "csrf": CSRFView,
    "captcha": CaptchaView,
    "register": LoginView,
    "login": LoginView,
    "me": AccountView,
    "create_group": GroupView,
    "edit_group": GroupView,
    "device_detail": DeviceView,
    "edit_device": DeviceView,
    "revoke_device": DeviceView,
    "create_pairing": PairingView,
    "revoke_pairing": PairingView,
    "pair_device": PairResult,
    "create_resource": ResourceSaveView,
    "edit_resource": ResourceSaveView,
    "resource_detail": ResourceView,
    "resource_preview": DatePreviewView,
    "validate_resource": ValidationView,
    "preview_release": PreviewView,
    "preview_rollback": PreviewView,
    "publish": ReleaseView,
    "release_detail": ReleaseView,
    "rollback_release": ReleaseView,
    "device_sync": SyncView,
    "device_receipt": ReceiptSavedView,
}

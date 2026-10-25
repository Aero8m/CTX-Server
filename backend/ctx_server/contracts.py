"""Executable API inventory. Request models are the validation source of truth."""

from flask import current_app, has_app_context

from . import responses as r
from . import schemas as s

OPERATIONS = [
    ("get", "/health/live", None, "none", "存活检查"),
    ("get", "/health/ready", None, "none", "数据库及迁移就绪检查"),
    ("get", "/auth/csrf", None, "none", "初始化页面会话与 CSRF"),
    ("get", "/auth/captcha", None, "cookie", "创建一次性图形验证码"),
    ("post", "/auth/register", s.Credentials, "csrf", "注册并登录"),
    ("post", "/auth/login", s.Credentials, "csrf", "登录"),
    ("get", "/auth/me", None, "cookie", "查询当前账号"),
    ("post", "/auth/logout", None, "cookie", "退出"),
    ("post", "/auth/password", s.PasswordChange, "cookie", "修改密码并退出所有会话"),
    ("get", "/groups", None, "cookie", "分组列表"),
    ("post", "/groups", s.Named, "cookie", "创建分组"),
    ("patch", "/groups/{object_id}", s.Named, "cookie", "分组改名"),
    ("delete", "/groups/{object_id}", None, "cookie", "删除分组并解除成员关系"),
    ("get", "/devices", None, "cookie", "设备列表"),
    ("get", "/devices/{object_id}", None, "cookie", "设备详情及最近 50 条回执"),
    ("patch", "/devices/{object_id}", s.DeviceEdit, "cookie", "设备改名或分组"),
    ("post", "/devices/{object_id}/revoke", None, "cookie", "撤销设备"),
    ("get", "/pairing-codes", None, "cookie", "配对码记录"),
    ("post", "/pairing-codes", s.PairCodeCreate, "cookie", "生成配对码（仅此次返回明文）"),
    ("post", "/pairing-codes/{object_id}/revoke", None, "cookie", "撤销配对码"),
    ("get", "/resources", None, "cookie", "资源列表"),
    ("post", "/resources", s.ResourceCreate, "cookie", "创建资源草稿"),
    ("post", "/resources/import", s.ResourceCreate, "cookie", "导入原生 JSON"),
    ("post", "/resources/validate", s.ResourceValidate, "cookie", "校验并规范化内容，不保存草稿"),
    ("get", "/resources/{object_id}", None, "cookie", "草稿详情"),
    ("patch", "/resources/{object_id}", s.ResourceEdit, "cookie", "乐观并发更新草稿"),
    ("get", "/resources/{object_id}/content", None, "cookie", "下载草稿 JSON"),
    ("get", "/resources/{object_id}/preview", None, "cookie", "指定日期预览"),
    ("post", "/releases/preview", s.ReleaseRequest, "cookie", "固定目标与内容预览"),
    ("post", "/releases", s.ReleaseRequest, "cookie", "幂等发布"),
    ("get", "/releases", None, "cookie", "发布历史"),
    ("get", "/releases/{object_id}", None, "cookie", "发布详情与目标结果"),
    ("post", "/releases/{object_id}/rollback/preview", s.RollbackRequest, "cookie", "回滚预览"),
    ("post", "/releases/{object_id}/rollback", s.RollbackRequest, "cookie", "复制历史内容为新发布"),
    ("get", "/versions/{object_id}/content", None, "either", "下载不可变 UTF-8 JSON 原始字节"),
    ("post", "/device/pair", s.PairClaim, "none", "一次性配对与安全重试"),
    ("post", "/device/sync", s.SyncRequest, "bearer", "设备同步"),
    ("post", "/device/receipts", s.ReceiptRequest, "bearer", "幂等应用回执"),
]


def wire_schemas():
    classes = {schema.__name__: schema for _, _, schema, _, _ in OPERATIONS if schema}
    classes.update(NativeProfile=s.NativeProfile, DisplayConfig=s.DisplayConfig)
    classes.update({model.__name__: model for model in r.RESPONSE_MODELS})
    return {name: schema.model_json_schema() for name, schema in classes.items()}


def build_openapi():
    components = {}
    for name, schema in wire_schemas().items():
        components.update(schema.pop("$defs", {}))
        components[name] = schema
    # Pydantic local references become OpenAPI component references.
    import json

    components = json.loads(json.dumps(components).replace("#/$defs/", "#/components/schemas/"))
    paths = {}
    for method, path, schema, auth, summary in OPERATIONS:
        endpoint = ""
        if has_app_context():
            endpoint = next(
                (
                    rule.endpoint.split(".")[-1]
                    for rule in current_app.url_map.iter_rules()
                    if rule.rule.removeprefix("/api/v1").replace("<", "{").replace(">", "}") == path
                    and method.upper() in rule.methods
                ),
                "",
            )
        data_schema = (
            {"$ref": f"#/components/schemas/{r.RESPONSE_MAP[endpoint].__name__}"}
            if endpoint in r.RESPONSE_MAP
            else {"type": "object"}
        )
        paged = {
            "devices": "DeviceView",
            "groups": "GroupView",
            "resources": "ResourceView",
            "releases": "ReleaseView",
            "pairing_codes": "PairingView",
        }
        if endpoint in paged:
            data_schema = {
                "allOf": [{"$ref": "#/components/schemas/Paged"}],
                "properties": {
                    "items": {"type": "array", "items": {"$ref": "#/components/schemas/" + paged[endpoint]}}
                },
            }
        raw = path.endswith("/content")
        created = endpoint in {
            "register",
            "create_group",
            "create_pairing",
            "pair_device",
            "create_resource",
            "publish",
            "rollback_release",
        }
        success_schema = {
            "type": "object",
            "required": ["data"],
            "additionalProperties": False,
            "properties": {"data": data_schema},
        }
        operation = {
            "summary": summary,
            "operationId": method + path.replace("/", "_").replace("{", "").replace("}", ""),
            "responses": {
                "201" if created else "200": {
                    "description": "不可变 JSON 原始字节" if raw else "成功响应",
                    "content": {
                        "application/json": {"schema": {"type": "object"} if raw else success_schema}
                    },
                },
                "default": {
                    "description": "统一错误",
                    "content": {"application/json": {"schema": {"$ref": "#/components/schemas/ErrorView"}}},
                },
            },
        }
        parameters = []
        if "{object_id}" in path:
            parameters.append(
                {
                    "name": "object_id",
                    "in": "path",
                    "required": True,
                    "schema": {"type": "string", "pattern": "^[a-f0-9]{32}$"},
                }
            )
        if method not in ("get", "head") and auth in ("cookie", "csrf"):
            parameters.append(
                {"name": "X-CSRF-Token", "in": "header", "required": True, "schema": {"type": "string"}}
            )
        if path == "/releases" and method == "post" or path.endswith("/rollback"):
            parameters.extend(
                {"name": name, "in": "header", "required": True, "schema": {"type": "string"}}
                for name in ("Idempotency-Key", "X-Preview-Token")
            )
        if method == "get" and path in ("/devices", "/groups", "/resources", "/releases", "/pairing-codes"):
            parameters.extend(
                {
                    "name": name,
                    "in": "query",
                    "schema": {"type": "integer", "minimum": 1, "maximum": maximum, "default": default},
                }
                for name, maximum, default in (("page", 2147483647, 1), ("page_size", 100, 20))
            )
        if path.endswith("/preview") and method == "get":
            parameters.extend(
                [
                    {
                        "name": "date",
                        "in": "query",
                        "required": True,
                        "schema": {"type": "string", "format": "date"},
                    },
                    {"name": "schedule_id", "in": "query", "schema": {"type": "string"}},
                ]
            )
        filters = {
            "/devices": ["q", "group_id", "revoked"],
            "/resources": ["q", "kind", "archived"],
            "/releases": ["device_id"],
        }
        if method == "get" and path in filters:
            parameters.extend(
                {"name": name, "in": "query", "schema": {"type": "string"}} for name in filters[path]
            )
        if parameters:
            operation["parameters"] = parameters
        if schema:
            operation["requestBody"] = {
                "required": True,
                "content": {
                    "application/json": {"schema": {"$ref": f"#/components/schemas/{schema.__name__}"}}
                },
            }
        operation["security"] = {
            "cookie": [{"cookieAuth": []}],
            "csrf": [{"cookieAuth": []}],
            "bearer": [{"deviceAuth": []}],
            "either": [{"cookieAuth": []}, {"deviceAuth": []}],
            "none": [],
        }[auth]
        paths.setdefault(path, {})[method] = operation
    return {
        "openapi": "3.1.0",
        "info": {"title": "CTX-Server API", "version": "0.1.0"},
        "servers": [{"url": "/api/v1"}],
        "paths": paths,
        "components": {
            "schemas": components,
            "securitySchemes": {
                "cookieAuth": {"type": "apiKey", "in": "cookie", "name": "ctx_session"},
                "deviceAuth": {"type": "http", "scheme": "bearer"},
            },
        },
    }

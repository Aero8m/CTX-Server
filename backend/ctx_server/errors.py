from flask import g, jsonify


class APIError(Exception):
    def __init__(self, code, message, status=400, details=None):
        self.code, self.message, self.status, self.details = code, message, status, details
        super().__init__(message)


def error_response(code, message, status, details=None):
    return jsonify(
        error={
            "code": code,
            "message": message,
            "details": details,
            "request_id": getattr(g, "request_id", ""),
        }
    ), status

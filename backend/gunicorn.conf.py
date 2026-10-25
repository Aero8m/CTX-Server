import os

bind = "0.0.0.0:8000"
workers = int(os.getenv("WEB_WORKERS", "2"))
worker_class = "gthread"
threads = 2
timeout = 30
graceful_timeout = 30
keepalive = 5
accesslog = "-"
errorlog = "-"
access_log_format = '{"method":"%(m)s","path":"%(U)s","status":%(s)s,"duration_us":%(D)s}'
# The application validates HTTPS and trusts exactly one configured Nginx hop.
forwarded_allow_ips = ""

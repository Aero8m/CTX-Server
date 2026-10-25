FROM python:3.13.17-slim-bookworm@sha256:e32be0e55814a08977501ca863271d9bd02443710db8f2afaf8372e2c4508530
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /app
COPY backend/requirements.lock ./requirements.lock
RUN pip install --no-cache-dir -r requirements.lock && useradd --uid 10001 --no-create-home ctx
COPY backend/ctx_server ./ctx_server
COPY backend/migrations ./migrations
COPY backend/wsgi.py backend/gunicorn.conf.py backend/entrypoint.py ./
COPY contracts /contracts
USER 10001:10001
EXPOSE 8000
ENTRYPOINT ["python", "entrypoint.py"]
CMD ["gunicorn", "--config", "gunicorn.conf.py", "wsgi:app"]

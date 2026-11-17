"""Tiny Supabase client over HTTP (no extra dependencies)."""
import json, mimetypes, os, time, urllib.error, urllib.parse, urllib.request
from pathlib import Path

CONTENT_TYPES = {".glb": "model/gltf-binary", ".json": "application/json"}


def _env():
    try:
        return os.environ["SUPABASE_URL"].rstrip("/"), os.environ["SUPABASE_SERVICE_KEY"]
    except KeyError as e:
        raise SystemExit(f"Missing environment variable {e}. Set SUPABASE_URL and SUPABASE_SERVICE_KEY.")


def _request(req, retries=3):
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code < 500 or attempt == retries - 1:
                raise SystemExit(f"Supabase {e.code}: {e.read().decode()[:300]}")
        except urllib.error.URLError:
            if attempt == retries - 1:
                raise
        time.sleep(2 ** attempt)


def version_exists(name, version):
    base, key = _env()
    q = urllib.parse.urlencode({"name": f"eq.{name}", "version": f"eq.{version}", "select": "id"})
    req = urllib.request.Request(f"{base}/rest/v1/model_sets?{q}", headers={"apikey": key, "Authorization": f"Bearer {key}"})
    return bool(json.loads(_request(req)))


def upload_file(path: Path, bucket: str, dest: str):
    base, key = _env()
    ctype = CONTENT_TYPES.get(path.suffix) or mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    req = urllib.request.Request(
        f"{base}/storage/v1/object/{bucket}/{dest}", data=path.read_bytes(), method="POST",
        headers={"Authorization": f"Bearer {key}", "apikey": key, "Content-Type": ctype,
                 "x-upsert": "true", "Cache-Control": "max-age=31536000, immutable"})
    _request(req)
    print(f"  uploaded {dest}")


def register_version(name, version, base_path, files):
    base, key = _env()
    req = urllib.request.Request(
        f"{base}/rest/v1/model_sets", method="POST",
        data=json.dumps({"name": name, "version": version, "base_path": base_path, "files": files}).encode(),
        headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json",
                 "Prefer": "resolution=ignore-duplicates"})
    _request(req)

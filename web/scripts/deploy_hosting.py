# העלאת dist ל-Firebase Hosting (opuli.web.app) דרך ה-REST API, עם הרשאות gcloud של המשתמש
# (בלי firebase-tools ובלי מפתח service account). ראו README בתיקייה.
"""Deploy a static dist/ folder to a Firebase Hosting site via the REST API.
Usage: python3 hosting_deploy.py <site_id> <dist_dir>   (token in env ACCESS_TOKEN, project in PROJECT)
"""
import gzip, hashlib, json, os, sys, urllib.request
from pathlib import Path

site, dist = sys.argv[1], Path(sys.argv[2])
TOKEN, PROJECT = os.environ["ACCESS_TOKEN"], os.environ["PROJECT"]
API = "https://firebasehosting.googleapis.com/v1beta1"


def call(method, url, body=None, data=None, ctype="application/json"):
    headers = {"Authorization": f"Bearer {TOKEN}", "x-goog-user-project": PROJECT}
    if body is not None:
        data = json.dumps(body).encode()
    if data is not None:
        headers["Content-Type"] = ctype
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        sys.exit(f"{method} {url} -> {e.code}: {e.read().decode()[:500]}")


config = {
    "rewrites": [{"glob": "**", "path": "/index.html"}],
    "headers": [
        {"glob": "/assets/**", "headers": {"Cache-Control": "public, max-age=31536000, immutable"}},
        {"glob": "**/*.html", "headers": {"Cache-Control": "no-cache"}},
    ],
}
version = call("POST", f"{API}/sites/{site}/versions", {"config": config})["name"]

files, blobs = {}, {}
for p in dist.rglob("*"):
    if p.is_file():
        gz = gzip.compress(p.read_bytes(), mtime=0)
        h = hashlib.sha256(gz).hexdigest()
        files["/" + p.relative_to(dist).as_posix()] = h
        blobs[h] = gz

pop = call("POST", f"{API}/{version}:populateFiles", {"files": files})
upload_url = pop.get("uploadUrl")
for h in pop.get("uploadRequiredHashes", []):
    call("POST", f"{upload_url}/{h}", data=blobs[h], ctype="application/octet-stream")

call("PATCH", f"{API}/{version}?update_mask=status", {"status": "FINALIZED"})
rel = call("POST", f"{API}/sites/{site}/releases?versionName={version}", {})
print("released", rel.get("name"), len(files), "files")

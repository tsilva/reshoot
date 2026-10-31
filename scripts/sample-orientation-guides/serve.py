"""Serve the textureless orientation proxies and capture image-generation guides."""

import argparse
import hashlib
import json
import re
import shutil
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

SCRIPT_DIR = Path(__file__).resolve().parent
REPO = SCRIPT_DIR.parents[1]
ASSETS = REPO / "design/qa/orientation-guided-rotation"
PRODUCTS = {"doll": "linen-doll", "mug": "ceramic-mug", "bag": "leather-handbag"}
VIEWS = ["front", "front-three-quarter", "right-profile", "back-right-three-quarter",
         "back", "back-left-three-quarter", "left-profile", "front-left-three-quarter"]
FILES = {"/doll-proxy.glb": ASSETS / "linen-doll/proxy.glb", "/mug-proxy-parameters.json": ASSETS / "ceramic-mug/proxy-parameters.json", "/bag-proxy-parameters.json": ASSETS / "leather-handbag/proxy-parameters.json"}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--prepare-dependencies", type=Path)
    parser.add_argument("--dependencies-dir", type=Path)
    parser.add_argument("--output-dir", type=Path)
    args = parser.parse_args()
    if args.prepare_dependencies:
        destination = args.prepare_dependencies.resolve()
        destination.mkdir(parents=True, exist_ok=True)
        for source, target in [("package.template.json", "package.json"),
                               ("pnpm-workspace.template.yaml", "pnpm-workspace.yaml"),
                               ("pnpm-lock.yaml", "pnpm-lock.yaml"), (".npmrc", ".npmrc")]:
            output = destination / target
            if output.exists():
                parser.error(f"Refusing to overwrite {output}")
            shutil.copyfile(SCRIPT_DIR / source, output)
        print(f"Prepared {destination}; install with pnpm --dir PATH install --frozen-lockfile --ignore-scripts")
        return
    if not args.dependencies_dir or not args.output_dir:
        parser.error("Supply --dependencies-dir and --output-dir, or --prepare-dependencies")
    dependencies = args.dependencies_dir.resolve()
    metadata = json.loads((dependencies / "three/package.json").read_text())
    if metadata["version"] != "0.182.0":
        parser.error("The reviewed renderer requires three 0.182.0")
    output = args.output_dir.resolve()
    output.mkdir(parents=True, exist_ok=True)
    allowed = {f"{product}-guide-{view}.png" for product in PRODUCTS for view in VIEWS}
    allowed.update(f"{product}-guide-rig.json" for product in PRODUCTS)

    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *handler_args, **kwargs):
            super().__init__(*handler_args, directory=str(SCRIPT_DIR), **kwargs)

        def translate_path(self, path):
            request_path = unquote(urlparse(path).path)
            if request_path in FILES:
                return str(FILES[request_path])
            if request_path.startswith("/vendor/"):
                candidate = (dependencies / request_path.removeprefix("/vendor/")).resolve()
                if candidate.is_relative_to(dependencies):
                    return str(candidate)
                return str(SCRIPT_DIR / "missing")
            return super().translate_path(path)

        def do_POST(self):
            if self.headers.get("Origin") != f"http://127.0.0.1:{self.server.server_port}":
                self.send_error(403)
                return
            name = self.path.removeprefix("/save/")
            length = int(self.headers.get("Content-Length", "0"))
            if not self.path.startswith("/save/") or name not in allowed or not 0 < length < 24_000_000:
                self.send_error(400)
                return
            data = self.rfile.read(length)
            if name.endswith(".png"):
                if not data.startswith(b"\x89PNG\r\n\x1a\n"):
                    self.send_error(400)
                    return
                (output / name).write_bytes(data)
            else:
                record = json.loads(data)
                product = name.split("-", 1)[0]
                if [frame["id"] for frame in record["frames"]] != VIEWS:
                    self.send_error(400)
                    return
                record["capture"] = {
                    "renderer": "scripts/sample-orientation-guides/capture.mjs",
                    "rendererSha256": digest(SCRIPT_DIR / "capture.mjs"),
                    "assets": {str(path.relative_to(REPO)): digest(path)
                               for alias, path in FILES.items() if alias.startswith(f"/{product}-")},
                }
                for frame in record["frames"]:
                    image = output / f"{product}-guide-{frame['id']}.png"
                    frame["outputPngSha256"] = digest(image)
                (output / name).write_text(json.dumps(record, indent=2) + "\n")
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"OK")

        def log_message(self, format_string, *message_args):
            # Keep routine module and per-frame requests out of the task log.
            if re.match(r"[45]", str(message_args[1]) if len(message_args) > 1 else ""):
                super().log_message(format_string, *message_args)

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    print(f"http://127.0.0.1:{server.server_port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()

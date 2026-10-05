"""Local dev server for the portfolio: python serve.py [port]

Same as `python -m http.server`, but tells the browser to re-check every file on each load
(Cache-Control: no-cache), so edits always show up on a normal refresh.

It also gives the Cool News "Refresh" button a local back end, so refreshing works while you
develop without going through GitHub:
  POST /api/news/refresh  runs the real pipeline (node scripts/news/run.mjs) in the background,
                          with the API key read from scripts/news/*.env on this machine — the key
                          stays in this process, it is never sent to the browser
  GET  /api/news/status   {"state": "idle" | "running" | "done" | "failed", ...}
Only answers requests from this machine (the server binds to localhost).
"""
import functools
import glob
import http.server
import json
import os
import subprocess
import sys
import threading
import time

ROOT = os.path.dirname(os.path.abspath(__file__))
NEWS_DIR = os.path.join(ROOT, 'scripts', 'news')

job = {'state': 'idle', 'started': 0, 'finished': 0, 'log': ''}
job_lock = threading.Lock()


def read_env():
    """KEY=value lines from any scripts/news/*.env file (gitignored), layered over os.environ."""
    env = dict(os.environ)
    for path in sorted(glob.glob(os.path.join(NEWS_DIR, '*.env'))):
        with open(path, encoding='utf-8') as fh:
            for line in fh:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    k, v = line.split('=', 1)
                    env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def run_pipeline():
    try:
        if not os.path.isdir(os.path.join(NEWS_DIR, 'node_modules')):
            subprocess.run('npm install', cwd=NEWS_DIR, shell=True, check=True, capture_output=True)
        proc = subprocess.run(['node', 'run.mjs'], cwd=NEWS_DIR, env=read_env(),
                              capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=1800)
        out = (proc.stdout or '') + (proc.stderr or '')
        with job_lock:
            job.update(state='done' if proc.returncode == 0 else 'failed', finished=time.time(), log=out[-4000:])
        print(out)
    except Exception as err:  # a missing node, a timeout — report it rather than hang the button
        with job_lock:
            job.update(state='failed', finished=time.time(), log=str(err))


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def send_json(self, code, data):
        body = json.dumps(data).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.split('?')[0] == '/api/news/status':
            with job_lock:
                return self.send_json(200, {k: job[k] for k in ('state', 'started', 'finished', 'log')})
        return super().do_GET()

    def do_POST(self):
        if self.path.split('?')[0] != '/api/news/refresh':
            return self.send_json(404, {'ok': False, 'error': 'not found'})
        with job_lock:
            if job['state'] == 'running':
                return self.send_json(200, {'ok': True, 'state': 'running'})
            job.update(state='running', started=time.time(), finished=0, log='')
        threading.Thread(target=run_pipeline, daemon=True).start()
        return self.send_json(202, {'ok': True, 'state': 'running'})


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5173
    handler = functools.partial(Handler, directory=ROOT)
    with http.server.ThreadingHTTPServer(('127.0.0.1', port), handler) as httpd:
        print(f'Serving the portfolio at http://localhost:{port} (no-cache)')
        httpd.serve_forever()

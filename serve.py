"""Local dev server for the portfolio: python serve.py [port]

Same as `python -m http.server`, but tells the browser to re-check every file on each load
(Cache-Control: no-cache), so edits always show up on a normal refresh.
"""
import functools
import http.server
import os
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5173
    root = os.path.dirname(os.path.abspath(__file__))
    handler = functools.partial(NoCacheHandler, directory=root)
    with http.server.ThreadingHTTPServer(('', port), handler) as httpd:
        print(f'Serving the portfolio at http://localhost:{port} (no-cache)')
        httpd.serve_forever()

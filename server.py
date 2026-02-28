#!/usr/bin/env python3
import http.server, socketserver, os

PORT = 8000
FILE_MAP = {
    'budget':      'db/calulator_data.csv',
    'investments': 'db/investments.csv',
    'debt':        'db/debt.csv',
}

class Handler(http.server.SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.path.startswith('/api/save/'):
            name = self.path[len('/api/save/'):]
            if name not in FILE_MAP:
                self.send_response(400); self.end_headers(); return
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length).decode('utf-8')
            with open(FILE_MAP[name], 'w') as f:
                f.write(body)
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(b'{"status":"ok"}')
        else:
            self.send_response(404); self.end_headers()

    def log_message(self, *args): pass  # silence request logs

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"Budget Calculator running on http://localhost:{PORT}")
    httpd.serve_forever()

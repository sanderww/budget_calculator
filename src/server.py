#!/usr/bin/env python3
import http.server, socketserver, os, shutil
from datetime import datetime

PORT = 8000
FILE_MAP = {
    'transactions_budget':           'db/transactions/budget.csv',
    'transactions_ra':               'db/transactions/ra.csv',
    'transactions_investments':      'db/transactions/investments.csv',
    'transactions_debt':             'db/transactions/debt.csv',
    'config_public':                 'db/config.public.csv',
    'config_private':                'db/config.private.csv',
    'test_transactions_budget':      'db/test/transactions/budget.csv',
    'test_transactions_ra':          'db/test/transactions/ra.csv',
    'test_transactions_investments': 'db/test/transactions/investments.csv',
    'test_transactions_debt':        'db/test/transactions/debt.csv',
    'test_config_public':            'db/test/config.public.csv',
    'test_config_private':           'db/test/config.private.csv',
}
REAL_KEYS = {
    'transactions_budget',
    'transactions_ra',
    'transactions_investments',
    'transactions_debt',
    'config_public',
    'config_private',
}
BACKUP_DIR = '/Users/sanderwiersma/Documents/budget_backups'

def backup_file(filepath, name):
    """Create a timestamped backup before overwriting a real data file."""
    if not os.path.exists(filepath):
        return
    os.makedirs(BACKUP_DIR, exist_ok=True)
    ts = datetime.now().strftime('%Y%m%d_%H%M%S')
    backup_path = os.path.join(BACKUP_DIR, f'{name}_{ts}.csv')
    shutil.copy2(filepath, backup_path)

class Handler(http.server.SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.path.startswith('/api/save/'):
            name = self.path[len('/api/save/'):]
            if name not in FILE_MAP:
                self.send_response(400); self.end_headers(); return
            # Block writes to real keys when test mode header is set
            if name in REAL_KEYS and self.headers.get('X-Test-Mode') == 'true':
                self.send_response(403)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(b'{"error":"cannot write to real data in test mode"}')
                return
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length).decode('utf-8')
            filepath = FILE_MAP[name]
            # Backup real data files before overwriting
            if name in REAL_KEYS:
                backup_file(filepath, name)
            os.makedirs(os.path.dirname(filepath), exist_ok=True)
            with open(filepath, 'w') as f:
                f.write(body)
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(b'{"status":"ok"}')
        else:
            self.send_response(404); self.end_headers()

    def log_message(self, *args): pass  # silence request logs

    def translate_path(self, path):
        """Serve src/budget_calculator.html for root; check src/ for other missing files."""
        if path == '/':
            return os.path.join(os.getcwd(), 'src', 'budget_calculator.html')
        result = super().translate_path(path)
        if not os.path.exists(result):
            src_path = os.path.join(os.getcwd(), 'src', os.path.relpath(result, os.getcwd()))
            if os.path.exists(src_path):
                return src_path
        return result

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"Budget Calculator running on http://localhost:{PORT}")
    httpd.serve_forever()

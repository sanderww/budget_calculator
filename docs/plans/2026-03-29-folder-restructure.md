# Folder Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize the project from a flat root into a `src/`, `docs/` structure without breaking any functionality.

**Architecture:** Move source files (`budget_calculator.html`, `calculations.js`, `server.py`) into `src/`. Flatten `docs/superpowers/` nesting. Move `prompts/` into `docs/prompts/`. Update all references (server path resolution, test imports, Makefile, .gitignore).

**Tech Stack:** Python stdlib HTTP server, ES modules, Vitest, Make

---

### Task 1: Move source files to `src/`

**Files:**
- Create: `src/` directory
- Move: `budget_calculator.html` → `src/budget_calculator.html`
- Move: `calculations.js` → `src/calculations.js`
- Move: `server.py` → `src/server.py`

- [ ] **Step 1: Create `src/` and move files**

```bash
mkdir -p src
git mv budget_calculator.html src/budget_calculator.html
git mv calculations.js src/calculations.js
git mv server.py src/server.py
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "refactor: move source files to src/"
```

---

### Task 2: Update server to serve files from `src/`

**Files:**
- Modify: `src/server.py`

The server uses `SimpleHTTPRequestHandler` which serves from CWD (project root). After moving HTML/JS to `src/`, the server needs to also look there for static files. Override `translate_path()` to check `src/` when a file isn't found at the project root.

- [ ] **Step 1: Update `src/server.py` — override `translate_path`**

Add this method to the `Handler` class, after the existing `log_message` method:

```python
    def translate_path(self, path):
        """Check src/ for files not found at project root."""
        result = super().translate_path(path)
        if not os.path.exists(result):
            # Try src/ subdirectory
            src_path = os.path.join(os.getcwd(), 'src', os.path.relpath(result, os.getcwd()))
            if os.path.exists(src_path):
                return src_path
        return result
```

The full `Handler` class should look like:

```python
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
        """Check src/ for files not found at project root."""
        result = super().translate_path(path)
        if not os.path.exists(result):
            src_path = os.path.join(os.getcwd(), 'src', os.path.relpath(result, os.getcwd()))
            if os.path.exists(src_path):
                return src_path
        return result
```

- [ ] **Step 2: Commit**

```bash
git add src/server.py
git commit -m "feat: server serves static files from src/ transparently"
```

---

### Task 3: Update Makefile

**Files:**
- Modify: `Makefile`

- [ ] **Step 1: Update server path in Makefile**

Change line 10 from:

```makefile
		nohup python3 server.py > $(LOG_FILE) 2>&1 & echo $$! > $(PID_FILE); \
```

to:

```makefile
		nohup python3 src/server.py > $(LOG_FILE) 2>&1 & echo $$! > $(PID_FILE); \
```

- [ ] **Step 2: Commit**

```bash
git add Makefile
git commit -m "refactor: update Makefile to use src/server.py"
```

---

### Task 4: Update test import path

**Files:**
- Modify: `tests/calculations.test.js`

- [ ] **Step 1: Update import path**

Change line 17 from:

```javascript
} from '../calculations.js';
```

to:

```javascript
} from '../src/calculations.js';
```

- [ ] **Step 2: Run tests to verify**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/calculations.test.js
git commit -m "refactor: update test import path for src/"
```

---

### Task 5: Flatten docs and move prompts

**Files:**
- Move: `docs/superpowers/plans/*` → `docs/plans/`
- Move: `docs/superpowers/specs/*` → `docs/specs/`
- Move: `prompts/*` → `docs/prompts/`
- Remove: `docs/superpowers/` (empty after moves)
- Remove: `prompts/` (empty after moves)

- [ ] **Step 1: Create target directories and move files**

```bash
mkdir -p docs/plans docs/specs docs/prompts
git mv docs/superpowers/plans/* docs/plans/
git mv docs/superpowers/specs/* docs/specs/
git mv prompts/* docs/prompts/
rmdir docs/superpowers/plans docs/superpowers/specs docs/superpowers
rmdir prompts
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "refactor: flatten docs structure, move prompts to docs/"
```

---

### Task 6: Update `.gitignore`

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Update `.gitignore`**

Replace the full contents with:

```gitignore
# Ignore database CSV files
db/*.csv
db/backups/
db/test/

# MacOS
.DS_Store

# Ignore sensitive server files
server.log
.server.pid

# ignore to_do.md
to_do.md
```

Changes from current:
- Removed `!db/examples/` (directory doesn't exist)
- Removed `prompts/*.md` and `!prompts/requirement_spec_2026_01_11.md` (prompts moved to docs, tracked there)
- Added `db/backups/` (runtime artifacts)
- Added `db/test/` (local test data for UI test mode toggle)

- [ ] **Step 2: Commit**

```bash
git add .gitignore
git commit -m "refactor: update gitignore for new structure"
```

---

### Task 7: Verify everything works end-to-end

- [ ] **Step 1: Run unit tests**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 2: Restart the server**

```bash
make stop
make start
```

Expected: "Server started with PID ..."

- [ ] **Step 3: Verify HTML loads**

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/budget_calculator.html
```

Expected: `200`

- [ ] **Step 4: Verify calculations.js loads**

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/calculations.js
```

Expected: `200`

- [ ] **Step 5: Verify assets load**

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/assets/favicon.png
```

Expected: `200`

- [ ] **Step 6: Verify CSV data loads (using test key)**

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/db/test/calulator_data.csv
```

Expected: `200`

- [ ] **Step 7: Verify save endpoint works (test key only)**

```bash
curl -s -X POST -H "Content-Type: text/csv" -H "X-Test-Mode: true" -d "test" http://localhost:8000/api/save/test_budget
```

Expected: `{"status":"ok"}`

- [ ] **Step 8: Manual browser check**

Open `http://localhost:8000/budget_calculator.html` and verify:
- Page loads with styling
- Budget tab shows data
- Investments tab shows data
- Debt tab shows data
- Test mode toggle works (switch to test mode, data changes, switch back)

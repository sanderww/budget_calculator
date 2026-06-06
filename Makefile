PID_FILE = .server.pid
LOG_FILE = server.log
PORT = 8000

.PHONY: start stop restart status commit-remote

start:
	@if [ -f $(PID_FILE) ] && kill -0 $$(cat $(PID_FILE)) 2>/dev/null; then \
		echo "Server is already running with PID $$(cat $(PID_FILE))"; \
	else \
		rm -f $(PID_FILE); \
		if lsof -nP -iTCP:$(PORT) -sTCP:LISTEN >/dev/null 2>&1; then \
			echo "Port $(PORT) is in use by an untracked process. Run 'make stop' to clear it, then try again."; \
			exit 1; \
		fi; \
		nohup python3 src/server.py > $(LOG_FILE) 2>&1 & echo $$! > $(PID_FILE); \
		sleep 1; \
		if kill -0 $$(cat $(PID_FILE)) 2>/dev/null; then \
			echo "Server started with PID $$(cat $(PID_FILE)). Logs in $(LOG_FILE)"; \
		else \
			echo "Server failed to start. Last lines of $(LOG_FILE):"; \
			tail -n 8 $(LOG_FILE); \
			rm -f $(PID_FILE); \
			exit 1; \
		fi; \
	fi

stop:
	@if [ -f $(PID_FILE) ]; then \
		kill $$(cat $(PID_FILE)) 2>/dev/null || true; \
		rm -f $(PID_FILE); \
		echo "Server stopped"; \
	else \
		echo "Server is not running (no PID file)"; \
	fi
	@# Wait for the port to be released so a follow-up start can't hit "Address already in use".
	@n=0; while lsof -nP -iTCP:$(PORT) -sTCP:LISTEN >/dev/null 2>&1; do \
		n=$$((n+1)); \
		if [ $$n -ge 20 ]; then \
			echo "Port $(PORT) still held after waiting; killing remaining listener(s)."; \
			lsof -nP -tiTCP:$(PORT) -sTCP:LISTEN | xargs kill 2>/dev/null || true; \
			sleep 1; \
			break; \
		fi; \
		sleep 0.25; \
	done

restart: stop start

status:
	@if [ -f $(PID_FILE) ] && kill -0 $$(cat $(PID_FILE)) 2>/dev/null; then \
		echo "Server is running with PID $$(cat $(PID_FILE)) on port $(PORT)"; \
	elif [ -f $(PID_FILE) ]; then \
		echo "Stale PID file (process $$(cat $(PID_FILE)) is dead). Run 'make stop' to clean up."; \
	else \
		echo "Server is not running"; \
	fi

commit-remote:
	@git checkout dev
	@git add .
	@if [ -n "$$(git status --porcelain)" ]; then \
		echo "Enter commit message: "; \
		read msg; \
		git commit -m "$$msg"; \
		git checkout main; \
		git merge dev; \
		git push origin main; \
		git checkout dev; \
	else \
		echo "Nothing to commit on dev. Checking sync status of main..."; \
		git checkout main; \
		git fetch origin main; \
		git status -uno; \
		git checkout dev; \
	fi
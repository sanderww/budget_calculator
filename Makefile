PID_FILE = .server.pid
LOG_FILE = server.log

.PHONY: start stop restart status

start:
	@if [ -f $(PID_FILE) ]; then \
		echo "Server is already running with PID $$(cat $(PID_FILE))"; \
	else \
		nohup python3 -m http.server > $(LOG_FILE) 2>&1 & echo $$! > $(PID_FILE); \
		echo "Server started with PID $$(cat $(PID_FILE)). Logs in $(LOG_FILE)"; \
	fi

stop:
	@if [ -f $(PID_FILE) ]; then \
		kill $$(cat $(PID_FILE)) || true; \
		rm $(PID_FILE); \
		echo "Server stopped"; \
	else \
		echo "Server is not running"; \
	fi

restart: stop start

status:
	@if [ -f $(PID_FILE) ]; then \
		echo "Server is running with PID $$(cat $(PID_FILE))"; \
	else \
		echo "Server is not running"; \
	fi
.PHONY: all lint format
all: lint format
lint:
	@echo "Running lint checks..."
	@flake8 src/ app.py --max-line-length=88 --ignore=E501,W503

format:
	@echo "Formatting code with black..."
	@black src/ app.py --line-length 88


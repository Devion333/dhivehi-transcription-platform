FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Command is overridden per-service in compose.dev.yml
CMD ["python", "-u", "mock_convert.py"]

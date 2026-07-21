# Programmer Name : Mr. Reehan Mohamed Ashraf, TP077077, APD3F2511SE, Software Engineering Student, APU, Technology Park Malaysia
# Program Name: Dockerfile
# Description: Docker build configuration for the mock_workers service
# First Written on: 03/07/2026
# Edited on: 21/07/2026
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Command is overridden per-service in compose.dev.yml
CMD ["python", "-u", "mock_convert.py"]

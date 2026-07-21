# Programmer Name : Mr. Reehan Mohamed Ashraf, TP077077, APD3F2511SE, Software Engineering Student, APU, Technology Park Malaysia
# Program Name: Dockerfile
# Description: Docker build configuration for the convert service
# First Written on: 03/07/2026
# Edited on: 21/07/2026
FROM python:3.10-slim

WORKDIR /app

# Install ffmpeg
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY convert.py .

CMD ["python", "-u", "convert.py"]

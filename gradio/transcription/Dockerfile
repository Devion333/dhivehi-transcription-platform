# Programmer Name : Mr. Reehan Mohamed Ashraf, TP077077, APD3F2511SE, Software Engineering Student, APU, Technology Park Malaysia
# Program Name: Dockerfile
# Description: Docker build configuration for the transcription service
# First Written on: 03/07/2026
# Edited on: 21/07/2026
FROM python:3.10-slim

WORKDIR /app

ARG REQUIREMENTS_FILE=requirements.txt
COPY ${REQUIREMENTS_FILE} requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["python", "-u", "transcription.py"]

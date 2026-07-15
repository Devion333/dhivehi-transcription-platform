FROM python:3.10-slim

WORKDIR /app

ARG REQUIREMENTS_FILE=requirements.txt
COPY ${REQUIREMENTS_FILE} requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["python", "-u", "transcription.py"]

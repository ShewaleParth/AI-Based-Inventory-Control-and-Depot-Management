FROM python:3.10-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

# Copy the entire backend and models correctly mapped
COPY Backend ./Backend

WORKDIR /app/Backend/code

EXPOSE 5001

CMD ["python", "app.py"]

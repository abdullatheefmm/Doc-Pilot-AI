FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
# Add pytest for CI
RUN pip install pytest pytest-asyncio

# Copy application code
COPY . .

# Create necessary directories
RUN mkdir -data
RUN mkdir -p data/fastapi_docs/uploads

# Expose the FastAPI port
EXPOSE 8000

# Run the backend
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]

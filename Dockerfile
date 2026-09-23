FROM ubuntu:22.04

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

WORKDIR /app

# Install build dependencies, compilers, and runtimes in a single optimized layer:
# - g++ & build-essential for first-class C++ support (g++, libc headers)
# - default-jdk-headless for Java compilation and runtime (javac, java)
# - python3 for Python 3 support
# - curl & Node.js for backend server
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    build-essential \
    g++ \
    default-jdk-headless \
    python3 \
    && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Create unprivileged sandbox user (UID 1001) for safe, non-root execution
RUN groupadd -g 1001 sandbox && \
    useradd -u 1001 -g sandbox -m -s /bin/bash sandbox

# Copy backend dependencies and install
COPY editor-backend/package.json ./
RUN npm install --production

# Copy backend source code
COPY editor-backend/ ./

# Create execution sandbox mount point and ensure unprivileged user ownership
RUN mkdir -p /sandbox && \
    chown -R sandbox:sandbox /app /sandbox

# Drop root privileges: run strictly as unprivileged sandbox user
USER sandbox

EXPOSE 5000

CMD ["npm", "start"]

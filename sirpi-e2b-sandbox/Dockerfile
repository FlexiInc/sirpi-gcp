FROM e2bdev/code-interpreter:latest

USER root

# Update package lists
RUN apt-get update

# ============================================================================
# DOCKER (with daemon)
# ============================================================================
RUN apt-get install -y \
    apt-transport-https \
    ca-certificates \
    curl \
    gnupg \
    lsb-release

# Add Docker's official GPG key and repository
RUN mkdir -p /etc/apt/keyrings
RUN curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
RUN echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian bullseye stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install both Docker CLI and daemon
RUN apt-get update && apt-get install -y docker-ce-cli docker-ce

# Add user to docker group so they can run Docker commands
RUN usermod -aG docker user

# ============================================================================
# TERRAFORM (Latest Stable: 1.12.2)
# ============================================================================
RUN curl -fsSL https://releases.hashicorp.com/terraform/1.12.2/terraform_1.12.2_linux_amd64.zip -o terraform.zip && \
    unzip terraform.zip && \
    mv terraform /usr/local/bin/ && \
    rm terraform.zip

# ============================================================================
# GOOGLE CLOUD SDK (gcloud)
# ============================================================================
RUN curl https://packages.cloud.google.com/apt/doc/apt-key.gpg | gpg --dearmor -o /usr/share/keyrings/cloud.google.gpg && \
    echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" | tee -a /etc/apt/sources.list.d/google-cloud-sdk.list && \
    apt-get update && apt-get install -y google-cloud-cli

# ============================================================================
# AWS CLI
# ============================================================================
RUN curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip" && \
    unzip awscliv2.zip && \
    ./aws/install && \
    rm -rf aws awscliv2.zip

# ============================================================================
# COMMON BUILD TOOLS
# ============================================================================
RUN apt-get install -y \
    git \
    jq \
    unzip \
    wget \
    make \
    gcc \
    g++ \
    build-essential

# Clean up
RUN apt-get clean && rm -rf /var/lib/apt/lists/*

# Verify installations
RUN docker --version && \
    terraform --version && \
    gcloud version && \
    aws --version && \
    git --version

# Set working directory
WORKDIR /home/user

# Switch back to default user
USER user

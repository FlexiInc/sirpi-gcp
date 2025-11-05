# Sirpi Infrastructure

AWS CDK infrastructure for deploying Bedrock agents (optional component).

## Overview

This directory contains AWS CDK code for provisioning AWS Bedrock agents that can be used as an alternative AI orchestration layer. This is an optional component - Sirpi's primary AI orchestration uses Google's Gemini directly.

## Structure

```
infrastructure/
├── bin/
│   └── sirpi-cdk.ts          # CDK app entry point
├── lib/
│   └── bedrock-agents-stack.ts  # Bedrock agent stack
├── iam-policies/
│   └── cdk-deployment-policy.json  # IAM policy for CDK deployment
├── cdk.json                  # CDK configuration
└── package.json             # Dependencies
```

## Prerequisites

- AWS CLI configured with credentials
- AWS CDK installed: `npm install -g aws-cdk`
- Node.js 18+

## Setup

```bash
# Install dependencies
npm install

# Bootstrap CDK (first time only)
cdk bootstrap

# Synthesize CloudFormation template
cdk synth

# Deploy stack
cdk deploy

# Destroy stack
cdk destroy
```

## IAM Policy

The `iam-policies/cdk-deployment-policy.json` contains the minimum permissions required for deploying this CDK stack. Attach this policy to your deployment user/role.

## Configuration

CDK configuration is in `cdk.json`:
- Environment (AWS account/region)
- Stack parameters
- Bootstrap options

## Bedrock Agents

The stack provisions:
- Bedrock Agent for infrastructure analysis
- Lambda functions for agent actions
- IAM roles and policies
- S3 buckets for agent artifacts

## Note

This is an experimental feature and not required for core Sirpi functionality. The main deployment path uses Gemini AI for infrastructure generation.

## Cost Considerations

Bedrock agents incur costs based on:
- Agent invocations
- Input/output tokens
- Lambda execution time

Ensure you understand AWS Bedrock pricing before deploying.

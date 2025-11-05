import boto3
from src.core.config import settings

# Hardcoded for this specific cleanup
role_arn = "arn:aws:iam::353114555842:role/SirpiInfrastructureAutomationRole"
external_id = "18934fb9-c1d9-49d7-a74e-e05af1ac9e52"  # Replace with actual external_id
project_name = "taskflow"

# Assume role
sts = boto3.client("sts", region_name=settings.aws_region)
response = sts.assume_role(
    RoleArn=role_arn,
    RoleSessionName="sirpi-cleanup",
    ExternalId=external_id,
    DurationSeconds=3600,
)

creds = response["Credentials"]

# Get DynamoDB client with assumed credentials
dynamodb = boto3.client(
    "dynamodb",
    region_name=settings.aws_region,
    aws_access_key_id=creds["AccessKeyId"],
    aws_secret_access_key=creds["SecretAccessKey"],
    aws_session_token=creds["SessionToken"],
)

# Delete the lock entry
bucket_name = "sirpi-terraform-states-353114555842"
state_key = f"projects/{project_name}/terraform.tfstate"
lock_id = f"{bucket_name}/{state_key}-md5"

try:
    dynamodb.delete_item(
        TableName=settings.dynamodb_terraform_lock_table,
        Key={"LockID": {"S": lock_id}}
    )
    print(f"✅ Deleted DynamoDB lock entry: {lock_id}")
except Exception as e:
    print(f"❌ Failed to delete lock entry: {e}")

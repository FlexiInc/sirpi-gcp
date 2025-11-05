from src.services.supabase import supabase
from src.services.deployment.s3_state_manager import S3StateManager

# Get AWS connection for the user
user_id = "user_34r7YHBTvPGCG04tOajMiMBPOCX"
aws_conn = supabase.get_aws_connection(user_id)

if not aws_conn:
    print("❌ No AWS connection found")
    exit(1)

role_arn = aws_conn["role_arn"]
external_id = aws_conn["external_id"]
project_name = "taskflow"

print(f"Role ARN: {role_arn}")
print(f"External ID: {external_id}")
print(f"Project: {project_name}")

# Clean up
manager = S3StateManager(role_arn, external_id)
manager.cleanup_state(project_name)
print("✅ Cleanup complete!")

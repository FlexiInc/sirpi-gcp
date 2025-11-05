import asyncio
from e2b import AsyncTemplate, default_build_logger
from template import template
from dotenv import load_dotenv
import os

load_dotenv()

E2B_API_KEY = os.getenv("E2B_API_KEY")

async def main():
    await AsyncTemplate.build(
        template,
        alias="sirpi-e2b-sandbox",
        on_build_logs=default_build_logger(),
    )


if __name__ == "__main__":
    asyncio.run(main())
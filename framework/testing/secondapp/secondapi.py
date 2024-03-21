from typing import Annotated, List

import aiofiles
from fastapi import FastAPI, Request, Depends, UploadFile, File, Form
from pydantic import BaseModel
from starlette.middleware.cors import CORSMiddleware

app = FastAPI()

origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class EvidenceCreation(BaseModel):
    name: str
    description: str
    reason: str
@app.post('/create_evidence')
async def create_evidence(ticket_id: Annotated[str,Form()], files: List[UploadFile]):
    print()
    return True


if __name__ == '__main__':
    import uvicorn

    uvicorn.run(app, host='0.0.0.0', port=8008)
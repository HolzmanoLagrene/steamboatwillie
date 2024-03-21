import json
from contextlib import asynccontextmanager
from io import BytesIO
from typing import Dict

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
from starlette.background import BackgroundTask
from starlette.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialise the Client on startup and add it to the state
    # http://127.0.0.1:8001/ is the base_url of the other server that requests should be forwarded to
    async with httpx.AsyncClient(base_url='http://192.168.1.158:8080') as client:
        yield {'client': client}
        # The Client closes on shutdown


app = FastAPI(lifespan=lifespan)
origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


async def redirect_to_turbinia(request: Request, url: str, remove_query: bool = True) -> (Dict, Dict):
    try:
        frontend_data = dict(request.query_params)
        client = request.state.client
        if remove_query:
            url = httpx.URL(path=url)
        else:
            url = httpx.URL(path=url,query=request.query_params)
        req = client.build_request(
            request.method, url, headers=request.headers.raw, content=request.stream()
        )
        r = await client.send(req, stream=True)
        raw_response = StreamingResponse(
            r.aiter_raw(),
            status_code=r.status_code,
            headers=r.headers,
            background=BackgroundTask(r.aclose)
        )
        response_body = b""
        async for chunk in raw_response.body_iterator:
            response_body += chunk
        json_content_data = json.load(BytesIO(response_body))[0]
        return json_content_data, frontend_data, raw_response.status_code, dict(raw_response.headers)
    except Exception as e:
        raise Exception(f"Failed to redirect the request to Turbinia with error: {e}")


@app.post('/create_evidence',response_class=JSONResponse)
async def create_evidence(request: Request):
    try:
        json_content_data,frontend_data,status_code,headers =await redirect_to_turbinia(request,"/api/evidence/upload",remove_query=True)
        response = JSONResponse(content=json_content_data, status_code=status_code)
    except Exception as e:
        response = JSONResponse(content={}, status_code=400)
    return response


if __name__ == '__main__':
    import uvicorn

    uvicorn.run(app, host='0.0.0.0', port=8006)

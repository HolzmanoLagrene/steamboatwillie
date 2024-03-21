import json
from contextlib import asynccontextmanager
from datetime import timedelta
from io import BytesIO
from typing import List, Dict

import httpx
from fastapi import Depends, FastAPI
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.templating import Jinja2Templates
from fastapi_login import LoginManager
from fastapi_login.exceptions import InvalidCredentialsException
from starlette import status
from starlette.background import BackgroundTask
from starlette.requests import Request
from starlette.responses import HTMLResponse, RedirectResponse, JSONResponse, StreamingResponse
from starlette.staticfiles import StaticFiles

from framework.testing.app.db import FakeDatabase


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with httpx.AsyncClient(base_url='http://192.168.1.158:8080') as client:
        yield {'client': client}


app = FastAPI(lifespan=lifespan)
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")


class NotAuthenticatedException(Exception):
    pass


SECRET = "super-secret-key"
manager = LoginManager(SECRET, '/login', use_cookie=True, custom_exception=NotAuthenticatedException)

DB = {
    'users': {
        'blez': 'blez',
        'mrps': 'mrps',
        'psbt': 'psbt',

    }
}


def query_user(user_id: str):
    return DB['users'].get(user_id)


def get_users() -> List[str]:
    return list(DB['users'].keys())


@manager.user_loader()
def load_user(user_id: str):
    user = DB['users'].get(user_id)
    return user


@app.exception_handler(NotAuthenticatedException)
def auth_exception_handler(request: Request, exc: NotAuthenticatedException):
    """
    Redirect the user to the login page if not logged in
    """
    return RedirectResponse(url='/login')


def get_user_data_if_exists(data):
    username = data.username
    password = data.password
    db_password = query_user(username)
    if not db_password:
        raise InvalidCredentialsException
    elif password != db_password:
        raise InvalidCredentialsException
    return username


def login_form(request: Request):
    return templates.TemplateResponse("login.html", {"request": request, "usernames": get_users()})


@app.post('/login')
def login(data: OAuth2PasswordRequestForm = Depends()):
    username = get_user_data_if_exists(data)
    token = manager.create_access_token(data={'sub': username}, expires=timedelta(minutes=60))
    response = RedirectResponse(url="/", status_code=status.HTTP_303_SEE_OTHER)
    manager.set_cookie(response, token)
    return response


@app.get('/logout')
def login():
    response = RedirectResponse(url='/login')
    response.delete_cookie("access_token")
    return response


@app.get('/')
def home(request: Request, user=Depends(manager)):
    fd = FakeDatabase()
    return templates.TemplateResponse("home.html", {"request": request, "logged_in_user": user, "case_data": fd.list_cases()})


async def redirect_to_turbinia(request: Request, url: str, remove_query: bool = True) -> (Dict, Dict):
    try:
        frontend_data = dict(request.query_params)
        client = request.state.client
        if remove_query:
            url = httpx.URL(path=url)
        else:
            url = httpx.URL(path=url, query=request.query_params)
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


@app.post('/create_evidence', response_class=JSONResponse)
async def create_evidence(request: Request, user=Depends(manager)):
    try:
        json_content_data, frontend_data, status_code, headers = await redirect_to_turbinia(request, "/api/evidence/upload", remove_query=True)
        fd = FakeDatabase()
        fd.add_evidence_to_case(frontend_data["case"], json_content_data)
        response = JSONResponse(content=json_content_data, status_code=status_code)
    except Exception as e:
        response = JSONResponse(content={}, status_code=400)
    return response


@app.post('/create_new_case')
def protected_route(case_name: str, case_description: str, user=Depends(manager)):
    fd = FakeDatabase()
    fd.add_case(case_name, case_description)
    return True


@app.get('/evidence_data')
def protected_route(case: str, user=Depends(manager)):
    fd = FakeDatabase()
    return fd.list_evidence_for_case(case)

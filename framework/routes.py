import random
from datetime import timedelta, datetime
from typing import List

from fastapi import BackgroundTasks
from fastapi import Request, Depends
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from fastapi.security import OAuth2PasswordRequestForm
from fastapi_login import LoginManager
from fastapi_login.exceptions import InvalidCredentialsException
from starlette import status
from starlette.responses import RedirectResponse, FileResponse
from starlette.templating import Jinja2Templates

from framework.airflow_wrapper import EvidencePipelineOrchestrator
from framework.db import FakeDatabase
from framework.exceptions import NotAuthenticatedException
from framework.schemas import ProcessingGraphData, UpdateGraphData
from framework.turbinia_wrapper import redirect_to_turbinia
from framework.utils import TurbiniaWrapper, EvidenceGraph

templates = Jinja2Templates(directory="templates")

SECRET = "super-secret-key"
manager = LoginManager(SECRET, '/login', use_cookie=True, custom_exception=NotAuthenticatedException)

DB = {
    'users': {
        'blez': 'blez',
        'mrps': 'mrps',
        'psbt': 'psbt',

    }
}

running_threads = {}


def query_user(user_id: str):
    return DB['users'].get(user_id)


def get_users() -> List[str]:
    return list(DB['users'].keys())


@manager.user_loader()
def load_user(user_id: str):
    user = DB['users'].get(user_id)
    return user


def auth_exception_handler(request: Request, exc: NotAuthenticatedException):
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


def home(request: Request, user=Depends(manager)):
    return RedirectResponse("/cases")


def cases(request: Request, user=Depends(manager)):
    fd = FakeDatabase()
    return templates.TemplateResponse("home.html", {"request": request, "flag": "cases", "logged_in_user": user, "case_data": fd.list_cases()})


def evidence(request: Request, user=Depends(manager)):
    fd = FakeDatabase()
    return templates.TemplateResponse("home.html", {"request": request, "flag": "evidence", "logged_in_user": user, "case_data": fd.list_cases()})


def processing(request: Request, user=Depends(manager)):
    fd = FakeDatabase()
    return templates.TemplateResponse("home.html", {"request": request, "flag": "processing", "logged_in_user": user, "case_data": fd.list_cases()})


async def create_new_custom_processing_graph(data: ProcessingGraphData):
    eg = EvidenceGraph(clear_state=True)
    eg.generate_initial_processing_graph(data.evidence_type)
    eg.save_state()
    processing_graph_data = eg.to_json()
    json_compatible_item_data = jsonable_encoder(processing_graph_data)
    return JSONResponse(content=json_compatible_item_data)


async def get_evidence_types(request: Request):
    eg = EvidenceGraph()
    input_evidence = eg.get_available_input_evidence_types()
    eg.save_state()
    json_compatible_item_data = jsonable_encoder(input_evidence)
    return JSONResponse(content=json_compatible_item_data)


async def update_graph(data: UpdateGraphData):
    eg = EvidenceGraph()
    if data.update_type == "job_state":
        eg.change_node_state(data.job_id.split("-")[1], data.job_state)
    elif data.update_type == "disable_all":
        eg.disable_all()
    elif data.update_type == "enable_all":
        eg.enable_all()
    elif data.update_type == "config_change":
        task_name, config_name = data.job_id.split("-")
        eg.change_task_parameter(task_name, config_name, data.job_state)
    elif data.update_type == "evidence_processing_choice":
        outputtype, handler = data.job_id.split("-")
        eg.change_evidence_status(outputtype, handler, data.job_state)
    eg.save_state()
    processing_graph_data = eg.to_json()
    json_compatible_item_data = jsonable_encoder(processing_graph_data)
    return JSONResponse(content=json_compatible_item_data)


async def start_processing(case: str, evidence: str, background_tasks: BackgroundTasks, user=Depends(manager)):
    eg = EvidenceGraph()
    epo = EvidencePipelineOrchestrator()
    fd = FakeDatabase()
    local_path = fd.get_location(case, evidence)
    yaml_string = eg.to_yaml_string(encode=True)
    evidence_type = eg.get_evidence_name_for_process()
    turbinia_handle = TurbiniaWrapper.start_process(evidence_type, local_path, yaml_string)
    fd.add_processing_handle(case, evidence, turbinia_handle)
    #epo.start_output_handling_pipelines(case, evidence, turbinia_handle, eg)
    background_tasks.add_task(epo.start_output_handling_pipelines, *(case, evidence, turbinia_handle, eg))
    return JSONResponse(content={'status': 'success', 'data': "data"})


async def remove_processing(case: str, evidence: str, processing_handle, background_tasks: BackgroundTasks):
    fd = FakeDatabase()
    fd.del_processing_handle(case, evidence, processing_handle)


def login_form(request: Request):
    return templates.TemplateResponse("login.html", {"request": request, "usernames": get_users()})


def login(data: OAuth2PasswordRequestForm = Depends()):
    username = get_user_data_if_exists(data)
    token = manager.create_access_token(data={'sub': username}, expires=timedelta(minutes=60))
    response = RedirectResponse(url="/", status_code=status.HTTP_303_SEE_OTHER)
    manager.set_cookie(response, token)
    return response


def logout():
    response = RedirectResponse(url='/login')
    response.delete_cookie("access_token")
    return response


async def create_evidence(request: Request, user=Depends(manager)):
    fd = FakeDatabase()
    try:
        json_content_data, frontend_data, status_code, headers = await redirect_to_turbinia(request, "/api/evidence/upload", remove_query=True)
        fd.add_evidence_to_case(frontend_data["case"], json_content_data, frontend_data["description"], user)
        response = JSONResponse(content=fd.list_evidence_for_case(frontend_data["case"]), status_code=status_code)
    except Exception as e:
        response = JSONResponse(content=[], status_code=400)
    return response


def create_new_case(case_name: str, case_description: str, user=Depends(manager)):
    fd = FakeDatabase()
    fd.add_case(case_name, case_description, user)
    return True


def get_evidence_in_case(selectedCase: str, user=Depends(manager)):
    fd = FakeDatabase()
    return fd.list_evidence_for_case(selectedCase)


def create_fake():
    def generate_values():
        # Generate three random values
        value1 = random.randint(0, 10)
        value2 = random.randint(0, 10 - value1)
        value3 = random.randint(0, 10 - value1 - value2)

        # Calculate the fourth value to ensure the total sum is 100
        value4 = 10 - value1 - value2 - value3

        return value1, value2, value3, value4

    result = {}
    for key in ["Timesketch", "ElasticSearch", "Kottos"]:
        s, f, q, r = generate_values()
        result[key] = ["success"] * s + ["failed"] * f + ["queued"] * q + ["running"] * r
    return result


def get_processing_status_for_evidence(case: str, evidence: str, background_tasks: BackgroundTasks, user=Depends(manager)):
    fd = FakeDatabase()
    afw = EvidencePipelineOrchestrator()
    evidence_data = fd.get_evidence_in_case(case, evidence)
    status_packed_all = []
    if "processing_handle" in evidence_data and evidence_data["processing_handle"]:
        for processing_handle, airflow_handles in evidence_data["processing_handle"].items():
            processing_overall_status = TurbiniaWrapper.get_request_status(processing_handle)
            output_handling_overall_status = afw.get_state_of_output_handling_pipelines(case, evidence, processing_handle)
            status_packed = {
                "id": processing_handle,
                "processing_status": processing_overall_status["status"],
                "processing_start": min([datetime.strptime(a["start_time"].split(".")[0], "%Y-%m-%dT%H:%M:%S") for a in processing_overall_status["tasks"]]).strftime("%d.%m.%Y %H:%M:%S"),
                "processing_successful_tasks": processing_overall_status["successful_tasks"],
                "processing_failed_tasks": processing_overall_status["failed_tasks"],
                "processing_queued_tasks": processing_overall_status["task_count"] - (processing_overall_status["successful_tasks"] + processing_overall_status["failed_tasks"]),
                "output_handling_overall_status": output_handling_overall_status
            }
            status_packed_all.append(status_packed)
        content = status_packed_all
    else:
        content = []
    return JSONResponse(content=content, status_code=200)

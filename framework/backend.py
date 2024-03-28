from fastapi import FastAPI, APIRouter
from starlette.responses import HTMLResponse
from starlette.staticfiles import StaticFiles

from framework.routes import *
from framework.turbinia_wrapper import lifespan

app = FastAPI(lifespan=lifespan)
app.mount("/static", StaticFiles(directory="static"), name="static")

cases_router = APIRouter(prefix="/cases", tags=["cases"])
cases_router.mount("/static", StaticFiles(directory="static"), name="static")
cases_router.add_api_route('/', endpoint=cases, methods=["GET"], response_class=HTMLResponse)
cases_router.add_api_route('/create_new_case', methods=["POST"], endpoint=create_new_case, response_class=JSONResponse)

evidence_router = APIRouter(prefix="/evidence", tags=["evidence"])
evidence_router.add_api_route('/', endpoint=evidence, methods=["GET"], response_class=HTMLResponse)
evidence_router.add_api_route('/evidence_types', methods=["GET"], endpoint=get_evidence_types, response_class=HTMLResponse)
evidence_router.add_api_route('/create_evidence', methods=["POST"], endpoint=create_evidence, response_class=JSONResponse)
evidence_router.add_api_route('/list_of_evidence', methods=["GET"], endpoint=get_evidence_in_case, response_class=JSONResponse)

processing_router = APIRouter(prefix="/processing", tags=["processing"])
processing_router.add_api_route('/', endpoint=processing, methods=["GET"], response_class=HTMLResponse)
processing_router.add_api_route('/create_process', methods=["POST"], endpoint=create_new_custom_processing_graph, response_class=JSONResponse)
processing_router.add_api_route('/update_graph', methods=["POST"], endpoint=update_graph, response_class=JSONResponse)
processing_router.add_api_route('/start_process', methods=["POST"], endpoint=start_processing, response_class=JSONResponse)
processing_router.add_api_route('/fetch_processing_status', methods=["GET"], endpoint=get_processing_status_for_evidence, response_class=JSONResponse)
processing_router.add_api_route('/remove_processing', methods=["GET"], endpoint=remove_processing, response_class=JSONResponse)

app.add_exception_handler(NotAuthenticatedException, auth_exception_handler)

app.add_api_route('/', endpoint=home, methods=["GET"], response_class=HTMLResponse)
app.add_api_route('/login', methods=["GET"], endpoint=login_form, response_class=HTMLResponse)
app.add_api_route('/login', methods=["POST"], endpoint=login, response_class=JSONResponse)
app.add_api_route('/logout', methods=["GET"], endpoint=logout, response_class=JSONResponse)

app.include_router(cases_router)
app.include_router(evidence_router)
app.include_router(processing_router)

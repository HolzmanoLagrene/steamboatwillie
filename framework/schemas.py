from pydantic import BaseModel


class ProcessingGraphData(BaseModel):
    evidence_type: str


class UpdateGraphData(BaseModel):
    update_type: str
    job_id: str
    job_state: bool | str
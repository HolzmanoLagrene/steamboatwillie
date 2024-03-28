import random
import string
import time
from collections import defaultdict
from pathlib import Path
from typing import Dict, List
from typing import Optional

import pandas as pd
from airflow_client import client
from airflow_client.client.api import dag_api, dag_run_api
from airflow_client.client.model.dag import DAG
from airflow_client.client.model.dag_run import DAGRun

from framework.db import FakeDatabase
from framework.utils import EvidenceGraph, TurbiniaWrapper


def with_api_client(func):
    def wrapped_f(self, *args, **kwargs):
        with client.ApiClient(self.configuration) as api_client:
            result = func(self, api_client, *args, **kwargs)
        return result

    return wrapped_f


class AirflowApiWrapper:

    def __init__(self):
        self.configuration = client.Configuration(
            host="http://localhost:8080/api/v1"
        )

    @with_api_client
    def get_dag_status(self, api_client, dag_id: str):
        api_instance = dag_api.DAGApi(api_client)
        try:
            api_response = api_instance.get_dag_details(dag_id=dag_id)
            return api_response
        except client.ApiException as e:
            print("Exception when calling ConfigApi->ge"
                  "t_config: %s\n" % e)
            return None

    @with_api_client
    def unpause_dag(self, api_client, dag_id: str):
        api_instance = dag_api.DAGApi(api_client)
        dag = DAG(
            is_paused=False,
        )
        try:
            api_response = api_instance.patch_dag(dag_id, dag)
            return api_response
        except client.ApiException as e:
            print("Exception when calling DAGApi->patch_dag: %s\n" % e)
            return None

    @with_api_client
    def run_dag(self, api_client, dag_id: str, conf: Dict, dag_run_id: Optional[str] = None, note: str = None) -> str:
        def generate_random_string_with_prefix():
            random_suffix = ''.join(random.choices(string.ascii_letters + string.digits, k=25))
            return f"{dag_id}_{random_suffix}"

        dag_status = self.get_dag_status(dag_id=dag_id)
        if dag_status.is_paused:
            update_result = self.unpause_dag(dag_id=dag_id)
        api_instance = dag_run_api.DAGRunApi(api_client)
        if not dag_run_id:
            dag_run_id = generate_random_string_with_prefix()
        dag_run = DAGRun(
            dag_run_id=dag_run_id,
            conf=conf,
            note=note if note else "",
        )
        try:
            api_response = api_instance.post_dag_run(dag_id, dag_run)
            return api_response.dag_run_id
        except client.ApiException as e:
            print("Exception when calling DAGRunApi->post_dag_run: %s\n" % e)
            return None

    @with_api_client
    def get_dag_run_status(self, api_client, dag_id: str, dag_run_id: str):
        api_instance = dag_run_api.DAGRunApi(api_client)
        try:
            api_response = api_instance.get_dag_run(dag_id, dag_run_id)
            return api_response
        except client.ApiException as e:
            print("Exception when calling DAGRunApi->get_dag_run: %s\n" % e)
            return None
    @with_api_client
    def has_dag_id(self, api_client, dag_id: str):
        api_instance = dag_api.DAGApi(api_client)
        try:
            api_response = api_instance.get_dags()
            return any([a["dag_id"]==dag_id for a in api_response.dags])
        except client.ApiException as e:
            print("Exception when calling DAGRunApi->get_dag_run: %s\n" % e)
            return False

    def track_dag_run(self, dag_id: str, dag_run_id: str):
        task_ended_not_ended = True
        while task_ended_not_ended:
            status = self.get_dag_run_status(dag_id=dag_id, dag_run_id=dag_run_id)
            if status is not None:
                task_ended_not_ended = status.state.value not in ["success", "failed"]
                print(f"DAG {dag_id} with RUN ID: {dag_run_id} has status: {status.state}")
                time.sleep(1)
            else:
                break


class EvidencePipelineOrchestrator:

    def __init__(self):
        self.api = AirflowApiWrapper()

    def get_nodes(self, node):
        if node["enabled"] and node["type"] == "evidence" and any([a for a in node["possible_processors"].values()]):
            return True
        else:
            return False

    def patch_path(self, path: str):
        return Path("/media/CrazySnitch_Shared/turbinia").joinpath(path.lstrip("/")).as_posix()

    def clean_task_data(self, task_datas: List):
        task_datas_clean = []
        for task_data in task_datas:
            task_datas_clean.append({task_data["name"]:list(set([self.patch_path(p) for p in task_data["saved_paths"]]))})
        return task_datas_clean

    def get_pipeline_evidence_mapping(self, eg: EvidenceGraph):
        evidence_to_pipeline_mapping = {}
        evidence_nodes = eg.customized_graph.find_nodes(lambda x: self.get_nodes(x))
        for evidence_node in evidence_nodes:
            active_pipelines = [a for a, b in eg.customized_graph.nodes[evidence_node]["possible_processors"].items() if b]
            evidence_to_pipeline_mapping[evidence_node] = active_pipelines
        return evidence_to_pipeline_mapping

    def create_next_scheduled_airflow_jobs(self, data, evidence_to_pipeline_mapping, eg):
        handled_jobs = []
        df_tasks = pd.DataFrame(data["tasks"])
        next_scheduled_airflow_data = defaultdict(lambda : defaultdict(lambda:defaultdict(list)))
        for taskname, task_df in df_tasks[~pd.isna(df_tasks["successful"]) & ~df_tasks["id"].isin(handled_jobs)].groupby("name"):
            handled_jobs += task_df.id.tolist()
            try:
                job_name_to_task = list(eg.customized_graph.predecessors[taskname]).pop()
            except:
                continue
            evidence_name = list(eg.customized_graph.successors[job_name_to_task].intersection(eg.customized_graph.find_nodes(self.get_nodes)))[0]
            task_data = task_df[["name","saved_paths"]].to_dict("records")
            for pipeline in evidence_to_pipeline_mapping[evidence_name]:
                task_datas = self.clean_task_data(task_data)
                for task_data_ in task_datas:
                    for task_name, pathlist in task_data_.items():
                        next_scheduled_airflow_data[pipeline][evidence_name][task_name].append(pathlist)
        return EvidencePipelineOrchestrator.defaultdict_to_dict(next_scheduled_airflow_data)

    @staticmethod
    def defaultdict_to_dict(d):
        if isinstance(d, defaultdict):
            d = dict(d)
        if isinstance(d, dict):
            for key, value in d.items():
                d[key] = EvidencePipelineOrchestrator.defaultdict_to_dict(value)
        return d
    def start_output_handling_pipelines(self, case: str, evidence: str, processing_handle: dict, eg: EvidenceGraph):
        evidence_to_pipeline_mapping = self.get_pipeline_evidence_mapping(eg)
        is_request_running = True
        fd = FakeDatabase()
        while is_request_running:
            started_tasks = TurbiniaWrapper.get_request_state(processing_handle["request_id"])
            if started_tasks["status"] != "running":
                is_request_running = False
                continue
            next_scheduled_airflow_data = self.create_next_scheduled_airflow_jobs(started_tasks, evidence_to_pipeline_mapping, eg)
            for pipeline_name, pipeline_data in next_scheduled_airflow_data.items():
                pipeline_name_airflow = f"{pipeline_name.lower()}_pipeline"
                if self.api.has_dag_id(pipeline_name_airflow):
                    dag_run_id = self.api.run_dag(pipeline_name_airflow, pipeline_data)
                    if dag_run_id:
                        fd.add_airflow_handle(case, evidence, processing_handle["request_id"], dag_run_id)
            time.sleep(5)

    def get_state_of_output_handling_pipelines(self, case: str, evidence: str, processing_handle: str ):
        fd = FakeDatabase()
        airflow_handles = fd.get_airflow_handle_list(case, evidence, processing_handle)
        overall_state = defaultdict(list)
        for airflow_handle in airflow_handles:
            pipeline_id = "_".join(airflow_handle.split("_")[0:2])
            pipeline_name = pipeline_id.replace("_pipeline", "").capitalize()
            status = self.api.get_dag_run_status(pipeline_id, airflow_handle)
            overall_state[pipeline_name]+=[str(status.state)]
        return dict(overall_state)


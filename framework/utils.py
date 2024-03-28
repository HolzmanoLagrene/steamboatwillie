import base64
import copy
import inspect
import os.path
import pickle
import time
import uuid
from collections import defaultdict
from typing import Dict, Any, Union

import networkx as nx
import pathpy as pp
import yaml
from turbinia_api_lib import ApiClient, TurbiniaEvidenceApi, TurbiniaRequestsApi
from turbinia_api_lib.configuration import Configuration
from turbinia_api_lib.model.base_request_options import BaseRequestOptions
from turbinia_api_lib.model.request import Request

from framework.output_pipeline_mapping import output_to_pipeline


class GraphToYaml:
    @classmethod
    def from_graph_to_yml(self, json_data: dict, encode=False):
        result_dict = {"globals": {"jobs_allowlist": []}}
        for job, tasks in json_data.items():
            result_dict["globals"]["jobs_allowlist"].append(job)
            for task, config in tasks.items():
                result_dict[f"{task}_config"] = {"task": task}
                for param_name, param_value in config.items():
                    if param_value:
                        result_dict[f"{task}_config"][param_name] = param_value
                if len(result_dict[f"{task}_config"]) == 1:
                    del result_dict[f"{task}_config"]
        yaml_string = yaml.dump(result_dict, allow_unicode=True, default_flow_style=False, sort_keys=False)
        if encode:
            yaml_string = base64.b64encode(yaml_string.encode()).decode()
        return yaml_string


class TurbiniaWrapper:

    def __init__(self):
        pass

    @classmethod
    def start_process(self, evidence_type, source_path, recipe_data, description="Some description", reason="Some reason", requester="The usual suspect", ):
        request = Request(
            description=description,
            evidence={
                "source_path": source_path,
                "type": evidence_type
            },
            request_options=BaseRequestOptions(
                reason=reason,
                recipe_data=recipe_data,
                request_id=str(uuid.uuid1()),
                requester=requester,
            ),
        )
        configuration = Configuration(host="http://192.168.1.158:8080")
        with ApiClient(configuration) as api:
            req_api = TurbiniaRequestsApi(api)
            request_id = req_api.create_request(request)
        return request_id

    @classmethod
    def get_request_state(cls, request_id):
        configuration = Configuration(host="http://192.168.1.158:8080")
        with ApiClient(configuration) as api:
            req_api = TurbiniaRequestsApi(api)
            while True:
                try:
                    response = req_api.get_request_status(request_id)
                    break
                except Exception as e:
                    time.sleep(1)
        return response

    @classmethod
    def upload_evidence(cls, case_number, evidence_name, evidence_file, **kwargs):
        configuration = Configuration(host="http://192.168.1.158:8080")
        with ApiClient(configuration) as api:
            ev_api = TurbiniaEvidenceApi(api)
            request_id = ev_api.upload_evidence([evidence_file], f"{case_number}/{evidence_name}")
        return request_id

    @classmethod
    def get_request_status(cls, turbinia_request_handle: str):
        configuration = Configuration(host="http://192.168.1.158:8080")
        with ApiClient(configuration) as api:
            req_api = TurbiniaRequestsApi(api)
            status = req_api.get_request_status(turbinia_request_handle)
            return status


class EvidenceGraph:
    def __init__(self, clear_state: bool = False):
        if os.path.exists("full_graph.p"):
            with open("full_graph.p", "br") as in_:
                self.full_base_graph = pickle.load(in_)
        else:
            self.full_base_graph = self.build_base_model()
        if clear_state:
            try:
                os.remove("custom_graph.p")
            except OSError:
                pass
            self.customized_graph = self.full_base_graph
        elif os.path.exists("custom_graph.p"):
            with open("custom_graph.p", "br") as in_:
                self.customized_graph = pickle.load(in_)
        else:
            self.customized_graph = self.full_base_graph

    def save_state(self):
        with open("custom_graph.p", "wb") as out_:
            pickle.dump(self.customized_graph, out_)
        with open("full_graph.p", "wb") as out_:
            pickle.dump(self.full_base_graph, out_)

    def get_evidence_name_for_process(self):
        return self.customized_graph.find_nodes(select_node=lambda x: x["indegree"] == 0)[0]

    def is_valid_subclass(self, class_hierarchy, subclass_):
        contains_turbinia_job = False
        for cls in class_hierarchy:
            if str(cls) != subclass_ and cls != object:
                if inspect.getmro(cls)[1] == subclass_:
                    contains_turbinia_job = True
                    break
        return contains_turbinia_job

    def build_base_model(self):
        from turbinia.jobs.interface import TurbiniaJob
        from turbinia.workers import TurbiniaTask
        result = {}
        for subclass in TurbiniaJob.__subclasses__():
            evidence_in = []
            evidence_out = []
            tasks = defaultdict(dict)
            class_dict = dict(inspect.getmembers(inspect.getmodule(subclass), inspect.isclass))
            module_imports = [[c for c in inspect.getmembers(inspect.getmodule(b), inspect.isclass)] for a, b in inspect.getmembers(inspect.getmodule(subclass), inspect.ismodule)]
            for classlist_from_modules in module_imports:
                for module_name, class_ in classlist_from_modules:
                    if not module_name in class_dict:
                        class_dict[module_name] = class_
            for name, class_ in class_dict.items():
                class_hierarchy = inspect.getmro(class_)
                if self.is_valid_subclass(class_hierarchy, TurbiniaJob):
                    evidence_in += [a.__name__ for a in class_.evidence_input]
                    evidence_out += [a.__name__ for a in class_.evidence_output]
                if self.is_valid_subclass(class_hierarchy, TurbiniaTask):
                    tasks[f"{class_.__name__}"]["parameters"] = class_.TASK_CONFIG
                    tasks[f"{class_.__name__}"]["types"] = self.identify_value_types(class_.TASK_CONFIG)
            result[subclass.__name__] = {"evidence_in": evidence_in, "evidence_out": evidence_out, "tasks": tasks}
        n = pp.Network(directed=True)
        for jobname, data in result.items():
            n.add_node(jobname, type="job", enabled=True, deactivated_by_inference_of=None)
            for ev_out in data["evidence_out"]:
                n.add_node(ev_out, type="evidence", enabled=True, deactivated_by_inference_of=None, possible_processors=self.get_processors(ev_out))
                n.add_edge(jobname, ev_out)
            for ev_in in data["evidence_in"]:
                n.add_node(ev_in, type="evidence", enabled=True, deactivated_by_inference_of=None, possible_processors=self.get_processors(ev_in))
                n.add_edge(ev_in, jobname)
            for taskname, config in data["tasks"].items():
                n.add_node(taskname, type="task", enabled=True, deactivated_by_inference_of=None, task_config=config['parameters'], config_types=config["types"])
                n.add_edge(jobname, taskname)
        with open("full_graph.p", "wb") as out_:
            pickle.dump(n, out_)
        return n

    @staticmethod
    def identify_value_types(data: Dict[str, Any]) -> Dict[str, Union[str, type]]:
        types = {}

        for key, value in data.items():
            if value is None:
                types[key] = str
            elif isinstance(value, list):
                if value:
                    inner_type = type(value[0])
                    types[key] = [inner_type]
                else:
                    types[key] = [str]
            else:
                types[key] = type(value)

        return types

    def enable_all(self):
        for node in self.customized_graph.find_nodes(select_node=lambda x: x["type"] == "job"):
            self.customized_graph.nodes[node]["enabled"] = True

    def disable_all(self):
        for node in self.customized_graph.find_nodes(select_node=lambda x: x["type"] == "job"):
            self.customized_graph.nodes[node]["enabled"] = False

    def change_node_state(self, node_name: str, node_value: bool):
        g = pp.classes.network.network_to_networkx(self.customized_graph)
        if node_name in self.customized_graph.nodes:
            descendants = set(nx.descendants(g, node_name))
            self.customized_graph.nodes[node_name]["enabled"] = node_value
            deactivated_nodes = [name for name, data in self.customized_graph.nodes.items() if not data["enabled"]]
            if not node_value:
                for deactivated_node in deactivated_nodes:
                    if deactivated_node in g.nodes:
                        g.remove_node(deactivated_node)
                for descendant in descendants.difference(deactivated_nodes):
                    ancestors = nx.ancestors(g, descendant)
                    if len(ancestors.difference(descendants)) == 0:
                        self.customized_graph.nodes[descendant]["enabled"] = node_value
                        self.customized_graph.nodes[descendant]["deactivated_by_inference_of"] = node_name
            else:
                for descendant in descendants:
                    self.customized_graph.nodes[descendant]["enabled"] = True
                    self.customized_graph.nodes[descendant]["deactivated_by_inference_of"] = None

    def generate_initial_processing_graph(self, initial_evidence_type: str):
        g = pp.classes.network.network_to_networkx(self.full_base_graph)
        descendants = set(nx.descendants(g, initial_evidence_type))
        remaining_nodes = list(descendants) + [initial_evidence_type]
        self.customized_graph = copy.copy(self.full_base_graph)
        subgraphs = g.subgraph(remaining_nodes)
        largest_subgraph_nodes = [nodes for nodes in nx.weakly_connected_components(subgraphs) if initial_evidence_type in nodes][0]
        largest_subgraph = g.subgraph(largest_subgraph_nodes)
        self.customized_graph = pp.classes.network.network_from_networkx(largest_subgraph)

    def change_task_parameter(self, task_name: str, task_parameter_name: str, task_parameter_value: Any):
        if task_name in self.customized_graph.nodes and task_parameter_name in self.customized_graph.nodes[task_name]["task_config"]:
            self.customized_graph.nodes[task_name]["task_config"][task_parameter_name] = task_parameter_value
        else:
            pass

    def change_evidence_status(self, evidence_name: str, handler_name: str, evidence_value: bool):
        self.customized_graph.nodes[evidence_name]["possible_processors"][handler_name] = evidence_value

    def get_available_input_evidence_types2(self):
        return self.customized_graph.find_nodes(select_node=lambda x: x["type"] == "evidence" and "source_path" in x["task_params"])

    def get_available_input_evidence_types(self):
        configuration = Configuration(host="http://192.168.1.158:8080")
        with ApiClient(configuration) as api:
            possible_evidence = TurbiniaEvidenceApi(api).get_evidence_types()
        result = []
        for evidence_type, config in possible_evidence.items():
            if "source_path" in config:
                result.append(evidence_type)
        return result

    def to_json(self) -> Dict[str, Dict]:
        jobs = defaultdict(dict)
        for job_node in self.customized_graph.find_nodes(select_node=lambda x: x["type"] == "job"):
            jobs[job_node]["job_config"] = self.customized_graph.nodes[job_node]
            task_nodes = [a for a in self.customized_graph.find_nodes(select_node=lambda x: x["type"] == "task") if a in self.customized_graph.successors[job_node]]
            tasks = {a: self.customized_graph.nodes[a] for a in task_nodes}
            for task in tasks:
                if "config_types" in tasks[task]:
                    del tasks[task]["config_types"]
            jobs[job_node]["tasks"] = tasks
            enabled_outputs = [{a: self.customized_graph.nodes[a]["possible_processors"]} for a in self.customized_graph.find_nodes(select_node=lambda x: x["type"] == "evidence" and x["enabled"]) if a in self.customized_graph.successors[job_node]]
            if enabled_outputs:
                jobs[job_node]["evidence"] = enabled_outputs[0]
            else:
                jobs[job_node]["evidence"] = {}
        return jobs

    def visualize_base_graph(self):
        self.visualize_graph(self.full_base_graph)

    def visualize_customized_graph(self):
        self.visualize_graph(self.customized_graph)

    @staticmethod
    def visualize_graph(graph):
        node_color = {}
        node_size = {}
        for node, data in graph.nodes.items():
            if data["type"] == "task":
                color = "black"
                size = 5
            elif data["type"] == "job":
                color = "red"
                size = 10
            elif data["type"] == "evidence":
                color = "blue"
                size = 10
            if not data["enabled"]:
                color = "violet"
            node_color[node] = color
            node_size[node] = size
        pp.visualisation.export_html(graph, "out.html", node_color=node_color, node_size=node_size, width=1800, height=1200)

    @staticmethod
    def is_not_empty(value):
        if value is None:
            return False
        elif isinstance(value, str):
            return bool(value.strip())  # Check if string is not empty after stripping whitespace
        elif isinstance(value, list):
            return bool(value)
        elif isinstance(value, dict):
            return bool(value)  # Check if list is not empty
        else:
            return True

    def to_yaml_string(self, encode=False):
        result_dict = {"globals": {"jobs_allowlist": []}}
        jobs = self.customized_graph.find_nodes(select_node=lambda x: x["enabled"] == True and x["type"] == "job")
        result_dict["globals"]["jobs_allowlist"] = jobs

        tasks = self.customized_graph.find_nodes(select_node=lambda x: x["enabled"] == True and x["type"] == "task")
        for task in tasks:
            task_node = self.customized_graph.nodes[task]
            clean_params = {}
            for param_name, param_value in task_node["task_config"].items():
                if self.is_not_empty(param_value):
                    clean_params[param_name] = param_value
            if self.is_not_empty(clean_params):
                clean_params = {"task": task, **clean_params}
                result_dict[f"{task}_config"] = clean_params
        yaml_string = yaml.dump(result_dict, allow_unicode=True, default_flow_style=False, sort_keys=False)
        if encode:
            yaml_string = base64.b64encode(yaml_string.encode()).decode()
        return yaml_string

    def get_processors(self, evidence_output):
        if evidence_output in output_to_pipeline:
            return {option: True for option in fixed_options_for_now[evidence_output] + ["ElasticSearch"]}
        else:
            return {"ElasticSearch": True}

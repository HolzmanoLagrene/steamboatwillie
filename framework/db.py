import json
import os.path
import uuid


class FakeDatabase:

    def __init__(self):
        self.load_state()

    def save_state(self):
        with open("database.json", "w") as out_:
            json.dump(self.db, out_)

    def load_state(self):
        if os.path.exists("database.json"):
            try:
                with open("database.json", "rb") as in_:
                    self.db = json.load(in_)
            except Exception as e:
                self.db = {
                    "cases": {
                    }
                }
        else:
            self.db = {
                "cases": {
                }
            }

    def add_case(self, case_number, case_description, case_creator):
        self.db["cases"][case_number] = {"case_description": case_description, "creator": case_creator}
        self.save_state()

    def add_evidence_to_case(self, case_number, evidence_data, description, creator):
        if case_number in self.db["cases"]:
            evidence_data["unique_id"] = str(uuid.uuid4())
            evidence_data["processing_handle"] = {}
            evidence_data["creator"] = creator
            evidence_data["description"] = description
            if "case_data" in self.db["cases"][case_number]:
                self.db["cases"][case_number]["case_data"].append(evidence_data)
            else:
                self.db["cases"][case_number]["case_data"] = [evidence_data]
        self.save_state()

    def add_processing_handle(self, case_number, uuid, processing_handle):
        [a for a in self.db["cases"][case_number]["case_data"] if a["unique_id"] == uuid][0]["processing_handle"].update({processing_handle["request_id"]: []})
        self.save_state()

    def del_processing_handle(self, case_number, uuid, processing_handle):
        try:
            del [a for a in self.db["cases"][case_number]["case_data"] if a["unique_id"] == uuid][0]["processing_handle"][processing_handle]
        except:
            pass
        self.save_state()

    def add_airflow_handle(self, case_number, uuid, processing_handle, airflow_handle):
        [a for a in self.db["cases"][case_number]["case_data"] if a["unique_id"] == uuid][0]["processing_handle"][processing_handle].append(airflow_handle)
        self.save_state()

    def get_airflow_handle_list(self,case_number, uuid, processing_handle):
        return [a for a in self.db["cases"][case_number]["case_data"] if a["unique_id"] == uuid][0]["processing_handle"][processing_handle]

    def list_cases(self):
        return [(k, v["case_description"], v["creator"]) for k, v in self.db["cases"].items()]

    def get_location(self, case_number, uuid):
        return [a for a in self.db["cases"][case_number]["case_data"] if a["unique_id"] == uuid][0]["file_path"]

    def get_evidence_in_case(self, case_number, uuid):
        return [a for a in self.db["cases"][case_number]["case_data"] if a["unique_id"] == uuid][0]

    def list_evidence_for_case(self, case_number):
        if "case_data" in self.db["cases"][case_number]:
            return [(a["original_name"], a["description"], a["processing_handle"], a["unique_id"], a["creator"]) for a in self.db["cases"][case_number]["case_data"]]
        else:
            return []

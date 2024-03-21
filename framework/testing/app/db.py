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
            evidence_data["creator"] = creator
            evidence_data["description"] = description
            if "case_data" in self.db["cases"][case_number]:
                self.db["cases"][case_number]["case_data"].append(evidence_data)
            else:
                self.db["cases"][case_number]["case_data"] = [evidence_data]
        self.save_state()

    def list_cases(self):
        return [(k, v["case_description"], v["creator"]) for k, v in self.db["cases"].items()]

    def list_evidence_for_case(self, case_number):
        if "case_data" in self.db["cases"][case_number]:
            return [(a["original_name"], a["description"], a["unique_id"], a["creator"]) for a in self.db["cases"][case_number]["case_data"]]
        else:
            return []

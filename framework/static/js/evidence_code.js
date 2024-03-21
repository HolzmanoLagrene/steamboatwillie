let dropArea = document.getElementById("drop-area");

let fileElem = document.getElementById("fileElem");
const caseSelectDropdown = document.getElementById('caseSelect');

var active_file;
["dragenter", "dragover"].forEach((eventName) => {
    dropArea.addEventListener(eventName, function highlight(e) {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer.items.length === 1 && e.dataTransfer.items[0].kind === "file") {
            dropArea.classList.add("highlight");
        } else {
            dropArea.classList.add("wrong_input")
        }
    }, false);
});
["dragleave", "drop"].forEach((eventName) => {

    dropArea.addEventListener(eventName, function unhighlight(e) {
        e.preventDefault();
        e.stopPropagation();
        dropArea.classList.remove("highlight");
        dropArea.classList.remove("wrong_input");
        dropArea.classList.remove("deactivated");
    }, false);
});
dropArea.addEventListener("drop", function (event) {
    let items = event.dataTransfer.items;
    if (items && items.length === 1 && items[0].kind === "file") {
        active_file = items[0].getAsFile()
        openEvidenceModal()
    } else {
        console.log(`${items[0].kind} Type instead of file`)
    }

}, false);
dropArea.addEventListener("click", function (event) {
    fileElem.click();
}, false);
fileElem.addEventListener("change", function (event) {
    active_file = fileElem.files[0]
    openEvidenceModal()
});

function fill_evidence_table(jsonData) {
    const tableBody = document.getElementById('existingEvidenceTable');
    tableBody.innerHTML = ""
    jsonData.forEach(rowData => {
        const row = document.createElement('tr');
        rowData.forEach(cellData => {
            const cell = document.createElement('td');
            cell.textContent = cellData;
            row.appendChild(cell);
        });
        tableBody.appendChild(row);
    });
}

// Add event listener for 'change' event
caseSelectDropdown.addEventListener('change', async (event) => {
    // Get the selected value
    const selectedValue = event.target.value;
    try {
        // Make a fetch request to the backend
        const response = await fetch(`/evidence/list_of_evidence?selectedCase=${selectedValue}`);
        if (response.ok) {
            const jsonData = await response.json();
            fill_evidence_table(jsonData)
        } else {
            console.error('Error:', response.statusText);
        }
    } catch (error) {
        console.error('Error:', error);
    }
    dropArea.style.setProperty("visibility", "visible")
});

function openEvidenceModal() {
    const evidence_modal_field_name = document.getElementById("evidenceName")
    if (active_file) {
        evidence_modal_field_name.value = active_file.name
        $('#createEvidenceModal').modal('show');
    } else {
        console.log()
    }

}


function submitForm() {
    var formData = new FormData();
    const evidence_name = document.getElementById('evidenceName').value
    const case_name = document.getElementById('caseSelect').value
    formData.append("case", case_name)
    formData.append("name", evidence_name)
    formData.append("description", document.getElementById('evidenceDescription').value)
    const qs = new URLSearchParams(formData).toString();
    var turbinia_form = new FormData();
    turbinia_form.append("files", active_file)
    turbinia_form.append("ticket_id", `${case_name}`)
    $('#createEvidenceModal').modal('hide');
    fetch('/evidence/create_evidence?' + qs, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
        },
        body: turbinia_form
    })
        .then(async response => {
            if (response.ok) {
                const jsonData = await response.json();
                fill_evidence_table(jsonData)
            } else {
                console.error('Form submission failed');
            }
        })
        .catch(error => {
            console.error('Error:', error);
        });
}


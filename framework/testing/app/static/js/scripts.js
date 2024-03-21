document.addEventListener('DOMContentLoaded', function () {

    // Show/hide the form section when the "Configure new Task" button is clicked
    $('#configureBtn').click(function () {
        $('#topSection').toggle();
    });
    fetch_evidence_types();
    $('#evidenceDropdown').change(async function () {
        const cardContainer = document.getElementById('cardContainer');
        cardContainer.innerHTML = ""
        const apiUrl = encodeURIComponent($(this).val());
        await create_initial_process_graph(apiUrl);
    });
});
// Drag and drop event listeners for the drop area
let dropArea = document.getElementById("drop-area");
let fileElem = document.getElementById("fileElem");
var active_file;
["dragenter", "dragover"].forEach((eventName) => {
    dropArea.addEventListener(eventName, function highlight(e) {
        e.preventDefault();
        e.stopPropagation();
        dropArea.classList.add("highlight");
    }, false);
});
["dragleave", "drop"].forEach((eventName) => {
    dropArea.addEventListener(eventName, function unhighlight(e) {
        e.preventDefault();
        e.stopPropagation();
        dropArea.classList.remove("highlight");
    }, false);
});
dropArea.addEventListener("drop", function (event) {
    let items = event.dataTransfer.items;
    if (items && items.length > 0 && items[0].kind === "file") {
        active_file = items[0].getAsFile()
        openEvidenceModal()
    } else {
        console.log("String Type instead of file")
    }

}, false);
dropArea.addEventListener("click", function (event) {
    fileElem.click();
}, false);
fileElem.addEventListener("change", function (event) {
    active_file = fileElem.files[0]
    openEvidenceModal()
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

function create_new_case() {
    var formData = new FormData();
    formData.append("case_name", document.getElementById('caseNumber').value)
    formData.append("case_description", document.getElementById('caseDescription').value)
    const qs = new URLSearchParams(formData).toString();
    $('#createCaseModal').modal('hide');
    fetch('/create_new_case?' + qs, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
        }
    })
        .then(response => {
            if (response.ok) {
                console.log('Form submitted successfully');
                // Optionally, close the modal
            } else {
                console.error('Form submission failed');
            }
        })
        .catch(error => {
            console.error('Error:', error);
        });
    location.href = '/';
}

document.getElementById('caseSelect2').addEventListener('change', async function (event) {
    // Get selected case ID from the dropdown
    const caseId = event.target.value;

    try {
        // Send request to backend to query evidence data
        const response = await fetch(`/evidence_data?case=${caseId}`);
        if (response.ok) {
            // Parse response data as JSON
            const data = await response.json();
            const selectElement = document.getElementById('evidenceSelect');
            selectElement.innerHTML = ''; // Clear existing options

            data.forEach(([value, label]) => {
                const optionElement = document.createElement('option');
                optionElement.value = label;
                optionElement.textContent = value;
                selectElement.appendChild(optionElement);
            });

            // Enable the select element
            selectElement.disabled = false;
        } else {
            console.error('Failed to query evidence data');
        }
    } catch (error) {
        console.error('Error:', error);
    }
});


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
    turbinia_form.append("ticket_id", `${case_name}/${evidence_name}`)
    $('#createEvidenceModal').modal('hide');
    fetch('/create_evidence?' + qs, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
        },
        body: turbinia_form
    })
        .then(response => {
            if (response.ok) {
                console.log('Form submitted successfully');
                // Optionally, close the modal
            } else {
                console.error('Form submission failed');
            }
        })
        .catch(error => {
            console.error('Error:', error);
        });
}


function update_existing_form(graph_data) {
    for (const job_key in graph_data) {
        try {
            const job_data = graph_data[job_key];
            const job_config = job_data.job_config
            const card_body = document.getElementById('CardBody-' + job_key);
            const input_element = document.getElementById('checkboxHeader-' + job_key);
            const deactivated_element = document.getElementById('warningButton-' + job_key)
            const writing = document.getElementById('CardHeader-' + job_key).getElementsByTagName("h5")[0];

            if (job_config.enabled === false) {
                input_element.checked = false
                if (card_body && card_body.classList.contains('show')) {
                    card_body.classList.remove('show');
                }
                if (!deactivated_element && job_config.deactivated_by_inference_of !== null) {
                    input_element.disabled = true
                    const deactivated_by_inference_of_element = document.createElement("button");
                    deactivated_by_inference_of_element.setAttribute('id', 'warningButton-' + job_key)
                    deactivated_by_inference_of_element.classList.add("btn", "btn-danger", "btn-sm", "ml-2")
                    deactivated_by_inference_of_element.innerHTML = `Deactivated due to disabled ${job_config.deactivated_by_inference_of}`
                    const card_header = document.getElementById('CardHeader-' + job_key).querySelector('.form-check');
                    writing.innerHTML = `<del>${writing.innerHTML}</del>`
                    card_header.appendChild(deactivated_by_inference_of_element)
                }
            } else {
                input_element.disabled = false
                input_element.checked = true
                if (deactivated_element) {
                    const deactivation_element = document.getElementById('warningButton-' + job_key);
                    const card_header_element = document.getElementById('CardHeader-' + job_key).querySelector('.form-check');
                    card_header_element.removeChild(deactivation_element)
                    writing.innerHTML = job_key
                }

            }
        } catch (e) {
            console.log()
        }
    }
}

async function update_process_graph(type_, value_, id_) {
    try {
        const requestOptions = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({"update_type": type_, "job_state": value_, "job_id": id_})
        };

        let response = await fetch(`/update_graph`, requestOptions);
        if (response.ok) {
            graph_data = await response.json()
            update_existing_form(graph_data)
        } else {
            console.error('');
        }
    } catch (error) {
        console.error('', error);
    }
}

async function disableAll() {
    await update_process_graph(type_ = "disable_all", value_ = false, id_ = "")
}

async function enableAll() {
    await update_process_graph(type_ = "enable_all", value_ = false, id_ = "")
}

function collapseAll() {
    const cardbodies = document.querySelectorAll('[id^="CardBody"]');
    cardbodies.forEach(cardbody => {
        if (cardbody.classList.contains('show')) {
            cardbody.classList.remove('show');
        }
    });
}

function unfoldAll() {
    const cardheaders = document.querySelectorAll('[id^="CardHeader"]');
    cardheaders.forEach(cardheader => {
        const controlheader = document.getElementById("checkboxHeader-" + cardheader.id.split("-")[1])
        const cardbody = document.getElementById("CardBody-" + cardheader.id.split("-")[1])
        if (controlheader && cardbody && controlheader.checked === true && !cardbody.classList.contains('show')) {
            cardbody.classList.add('show');
        }
    });
}

async function create_initial_form(initial_processing_graph) {
    const cardContainer = document.getElementById('cardContainer');
    const disableButton = document.createElement("button")
    const enableButton = document.createElement("button")
    const collapseButton = document.createElement("button")
    const unfoldButton = document.createElement("button")
    disableButton.classList.add("btn", "btn-primary", "ml-2")
    enableButton.classList.add("btn", "btn-primary", "ml-2")
    collapseButton.classList.add("btn", "btn-primary", "ml-2")
    unfoldButton.classList.add("btn", "btn-primary", "ml-2")
    disableButton.innerHTML = `Disable All`
    enableButton.innerHTML = `Enable All`
    collapseButton.innerHTML = `Collapse All`
    unfoldButton.innerHTML = `Open All`
    cardContainer.appendChild(disableButton)
    cardContainer.appendChild(enableButton)
    cardContainer.appendChild(collapseButton)
    cardContainer.appendChild(unfoldButton)

    disableButton.addEventListener("click", async function () {
        await disableAll()
    }, false);
    enableButton.addEventListener("click", async function () {
        await enableAll()
    }, false);
    collapseButton.addEventListener("click", function () {
        collapseAll()
    }, false);
    unfoldButton.addEventListener("click", function () {
        unfoldAll()
    }, false);


    for (const key in initial_processing_graph) {
        if (key.includes("Job")) {
            const jobData = initial_processing_graph[key];

            // Create a card for each key
            const card = document.createElement('div');
            card.classList.add('card', 'mb-4');

            const cardHeader = document.createElement('div');
            cardHeader.setAttribute('id', 'CardHeader-' + key)
            cardHeader.classList.add('card-header', 'custom-card-header')
            const inputWrapper = document.createElement("div")
            inputWrapper.classList.add('form-check')
            cardHeader.appendChild(inputWrapper)
            const input = document.createElement("input")
            input.classList.add('form-check-input', 'custom-checkbox')
            input.setAttribute('type', 'checkbox')
            input.setAttribute('value', '')
            input.setAttribute('checked', 'true')
            input.setAttribute('id', 'checkboxHeader-' + key)
            input.addEventListener("click", async function (event) {
                event.stopImmediatePropagation();
                await update_process_graph(type_ = "job_state", value_ = event.target.checked, id_ = cardHeader.id)
            }, false);
            cardHeader.addEventListener('click', function (event) {
                event.stopPropagation()
                event.preventDefault()
                const cardbody = document.getElementById('CardBody-' + key)
                const check_body_header = document.getElementById('checkboxHeader-' + key)
                if (cardbody && cardbody.classList.contains('show')) {
                    cardbody.classList.remove('show');
                } else if (check_body_header.checked === true) {
                    cardbody.classList.add('show');
                }
            })
            inputWrapper.appendChild(input)
            const label = document.createElement("label")
            label.classList.add('form-check-label')
            label.setAttribute('htmlFor', 'checkboxHeader')
            label.innerHTML = `<h5>${key}</h5>`


            inputWrapper.appendChild(label)

            card.appendChild(cardHeader);
            if (Object.keys(jobData.tasks).length > 0) {
                const cardBody = document.createElement('div');
                cardBody.setAttribute('id', 'CardBody-' + key)
                cardBody.classList.add('card-body', 'collapse', 'show');
                card.appendChild(cardBody);

                const tabContainer = document.createElement('div');
                tabContainer.classList.add('tab-container');
                cardBody.appendChild(tabContainer);

                const navTabs = document.createElement('ul');
                navTabs.classList.add('nav', 'nav-tabs');
                navTabs.setAttribute("role", "tablist")
                tabContainer.appendChild(navTabs);


                const tabContent = document.createElement('div');
                tabContent.classList.add('tab-content', 'mt-3');
                tabContainer.appendChild(tabContent);

                var first_iteration = true;
                // Iterate over the task keys within each job key
                for (const taskKey in jobData.tasks) {
                    const taskData = jobData.tasks[taskKey];
                    const navTabsInner = document.createElement('li');
                    navTabsInner.classList.add('nav-item');
                    navTabsInner.setAttribute("role", "presentation")
                    navTabs.appendChild(navTabsInner);

                    const tabId = `${key}-${taskKey}`;
                    const tabLink = document.createElement('button');
                    if (first_iteration) {
                        tabLink.classList.add('nav-link', 'active');
                    } else {
                        tabLink.classList.add('nav-link');
                    }
                    tabLink.setAttribute('id', tabId);
                    tabLink.setAttribute('data-bs-toggle', 'tab');
                    tabLink.setAttribute('data-bs-target', `#${tabId}-content`);
                    tabLink.setAttribute('type', `button`);
                    tabLink.setAttribute('role', `tab`);
                    tabLink.setAttribute('aria-controls', `${tabId}-content`);
                    tabLink.setAttribute('aria-selected', `true`);
                    tabLink.textContent = taskKey;
                    navTabsInner.appendChild(tabLink);

                    const tabPane = document.createElement('div');
                    if (first_iteration) {
                        first_iteration = false;
                        tabPane.classList.add('tab-pane', 'show', 'active');
                    } else {
                        tabPane.classList.add('tab-pane');
                    }
                    tabPane.setAttribute('role', `tabpanel`);
                    tabPane.setAttribute('id', `${tabId}-content`);
                    tabLink.setAttribute('aria-labelledby', tabId);
                    tabContent.appendChild(tabPane);
                    if (Object.keys(taskData.task_config).length > 0) {
                        const table = document.createElement('table');
                        table.classList.add('table');
                        tabPane.appendChild(table);

                        const tableHead = document.createElement('thead');
                        const tableHeadRow = document.createElement('tr');
                        const tableHeadCellName = document.createElement('th');
                        tableHeadCellName.innerText = "Name"
                        const tableHeadCellValue = document.createElement('th');
                        tableHeadCellValue.innerText = "Value"
                        tableHeadRow.appendChild(tableHeadCellName)
                        tableHeadRow.appendChild(tableHeadCellValue)
                        tableHead.appendChild(tableHeadRow);
                        tableHead.appendChild(tableHeadRow);
                        table.appendChild(tableHead);

                        const tableBody = document.createElement('tbody');
                        table.appendChild(tableBody);

                        // Iterate over the configuration keys within each task key
                        for (const configKey in taskData.task_config) {
                            const configValue = taskData.task_config[configKey]
                            const tableBodyRow = document.createElement('tr');
                            tableBody.appendChild(tableBodyRow);
                            const tableBodyCellName = document.createElement('td');
                            tableBodyCellName.textContent = configKey;
                            tableBodyRow.appendChild(tableBodyCellName);
                            const tableBodyCell = document.createElement('td');
                            tableBodyCell.setAttribute('contenteditable', 'true');
                            tableBodyCell.setAttribute('id', `${key}-${taskKey}-${configKey}`);
                            tableBodyCell.textContent = configValue;
                            tableBodyCell.addEventListener("blur", async function (event) {
                                update_process_graph("config_change", tableBodyCell.textContent, `${taskKey}-${configKey}`)
                            });
                            tableBodyRow.appendChild(tableBodyCell);
                        }
                    }
                }

            }
            cardContainer.appendChild(card);
        }
    }

    const sendButton = document.createElement("button")
    sendButton.setAttribute("id", "sendDataButton")
    sendButton.classList.add("btn", "btn-primary")
    sendButton.innerHTML = "Start Task"
    sendButton.addEventListener('click', sendData);
    cardContainer.appendChild(sendButton)
}

// Fetch evidence list and populate the dropdown
async function fetch_evidence_types() {
    try {
        const response = await fetch('/evidence_types');
        if (response.ok) {
            const evidenceList = await response.json();
            const dropdown = document.getElementById('evidenceDropdown');
            evidenceList.forEach(function (evidence) {
                const option = document.createElement('option');
                option.text = evidence;
                dropdown.add(option);
            });
        } else {
            console.error('Error fetching evidence list.');
        }
    } catch (error) {
        console.error('Error fetching evidence list:', error);
    }
}


async function create_initial_process_graph(evidenceType) {
    try {
        const requestOptions = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({evidence_type: evidenceType})
        };

        let response = await fetch(`/create_process`, requestOptions);
        if (response.ok) {
            graph_data = await response.json()
            await create_initial_form(graph_data)
        } else {
            console.error('Error creating initial processing graph.');
        }
    } catch (error) {
        console.error('Error creating the Intital Form:', error);
    }
}


async function sendData() {
    var formData = new FormData();
    formData.append("case", document.getElementById('caseSelect2').value)
    formData.append("evidence", document.getElementById('evidenceSelect').value)
    const qs = new URLSearchParams(formData).toString();
    fetch('/start_process?' + qs, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
        }
    })
        .then(response => {
            const cardContainer = document.getElementById('cardContainer');
            cardContainer.innerHTML = ""
            const dropdown = document.getElementById('evidenceDropdown');
            dropdown.selectedIndex = 0;
        })
        .catch(error => {
            console.error('Error:', error);
        });
}
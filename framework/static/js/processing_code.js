document.getElementById('caseSelect2').addEventListener('change', async function (event) {
    // Get selected case ID from the dropdown
    const caseId = event.target.value;

    try {
        // Send request to backend to query evidence data
        const response = await fetch(`/evidence/list_of_evidence?selectedCase=${caseId}`);
        if (response.ok) {
            // Parse response data as JSON
            const data = await response.json();
            const selectElement = document.getElementById('evidenceSelect');
            selectElement.innerHTML = ''; // Clear existing options
            const defaultOption = document.createElement('option');
            defaultOption.textContent = "Choose Evidence"
            defaultOption.disabled = true;
            defaultOption.selected = true;
            defaultOption.hidden = true;
            selectElement.appendChild(defaultOption)

            data.forEach(([original_name, description, processing_handle, unique_id, creator]) => {
                const optionElement = document.createElement('option');
                optionElement.value = unique_id;
                optionElement.textContent = original_name;
                selectElement.appendChild(optionElement);
            });

            // Enable the select element
            selectElement.disabled = false;
            fetch_evidence_types();
            const processingCardContainer = document.getElementById('processingCardContainer');
            processingCardContainer.innerHTML = ""
            const dropdown = document.getElementById('evidenceDropdown');
            dropdown.selectedIndex = 0;

        } else {
            console.error('Failed to query evidence data');
        }
    } catch (error) {
        console.error('Error:', error);
    }
});

document.addEventListener('DOMContentLoaded', function () {

    // Show/hide the form section when the "Configure new Task" button is clicked
    $('#configureBtn').click(async function () {
        const evidenceTypeSelect = document.getElementById('evidenceDropdown').value
        await create_initial_process_graph(evidenceTypeSelect);
        $('#topSection').toggle();
    });
    $('#evidenceDropdown').change(async function () {
        $('#topSection').hide();
        const processingCardContainer = document.getElementById('processingCardContainer');
        const outputCardContainer = document.getElementById('outputCardContainer');
        outputCardContainer.innerHTML = ""
        processingCardContainer.innerHTML = ""
        const caseSelect = document.getElementById('caseSelect2').value
        const evidenceSelect = document.getElementById('evidenceSelect').value
        const evidenceTypeSelect = document.getElementById('evidenceDropdown').value
        if (caseSelect && evidenceSelect && evidenceTypeSelect) {
            const startConfigureButton = document.getElementById('configureBtn')
            startConfigureButton.disabled = false;
        }
    });
});
$('#evidenceSelect').change(async function () {
    fetchDataAndFillTableRepeatedly();
});

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

    const outputCardContainer = document.getElementById('outputCardContainer');
    outputCardContainer.innerHTML = ""
    const aggregatedOutputCounts = createSortedEvidenceOutputDict(graph_data)

    for (const outputType in aggregatedOutputCounts) {
        const count = aggregatedOutputCounts[outputType].count
        const handlers = aggregatedOutputCounts[outputType].options
        const card = document.createElement('div');
        card.classList.add('card');
        const cardHeader = document.createElement('div');
        cardHeader.setAttribute('id', 'CardHeader-' + outputType)
        cardHeader.classList.add('card-header', 'custom-card-header')
        cardHeader.innerHTML = `<h5 style="display: inline-block;">${outputType}</h5><i class="ml-2 icon-badge">${count}</i>`
        cardHeader.addEventListener('click', function (event) {
            event.stopPropagation()
            event.preventDefault()
            const cardbody = document.getElementById('CardBody-' + outputType)
            if (cardbody && cardbody.classList.contains('show')) {
                cardbody.classList.remove('show');
            } else {
                cardbody.classList.add('show');
            }
        })
        const cardBody = document.createElement('div');
        cardBody.setAttribute('id', 'CardBody-' + outputType)
        cardBody.classList.add('card-body', 'collapse', 'show');
        card.appendChild(cardHeader);
        for (const handler in handlers) {
            const handler_value = handlers[handler]
            const inputWrapper = document.createElement("div")
            inputWrapper.classList.add('form-check')
            const input = document.createElement("input")
            input.classList.add('form-check-input', 'custom-checkbox')
            input.setAttribute('type', 'checkbox')
            input.setAttribute('value', '')
            input.checked = JSON.parse(handler_value)
            input.setAttribute('id', `checkboxHeader-${outputType}-${handler}`)
            input.addEventListener("click", async function (event) {
                event.stopImmediatePropagation();
                await update_process_graph(type_ = "evidence_processing_choice", value_ = event.target.checked, id_ = `${outputType}-${handler}`)
            }, false);
            const label = document.createElement("label")
            label.classList.add('form-check-label')
            label.setAttribute('htmlFor', 'checkboxHeader-' + handler)
            label.innerHTML = `<h5>${handler}</h5>`
            inputWrapper.appendChild(input)
            inputWrapper.appendChild(label)
            cardBody.appendChild(inputWrapper)
        }
        card.appendChild(cardBody);
        outputCardContainer.appendChild(card)

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

        let response = await fetch(`/processing/update_graph`, requestOptions);
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

function createSortedEvidenceOutputDict(initial_graph_data) {
    var aggregatedOutputCounts = {};
    for (const key in initial_graph_data) {
        const evidenceList = initial_graph_data[key].evidence;
        for (const outputEvidence in evidenceList) {
            const possible_handlers = evidenceList[outputEvidence]
            if (aggregatedOutputCounts[outputEvidence]) {
                aggregatedOutputCounts[outputEvidence]["count"]++;
            } else {
                aggregatedOutputCounts[outputEvidence] = {"count": 1, "options": possible_handlers};
            }
        }
    }
    const sortedKeys = Object.keys(aggregatedOutputCounts).sort();
    const aggregatedOutputCountsSorted = {};
    sortedKeys.forEach(key => {
        aggregatedOutputCountsSorted[key] = aggregatedOutputCounts[key];
    });
    return aggregatedOutputCountsSorted
}

async function create_initial_form(initial_processing_graph) {
    const processingCardContainer = document.getElementById('processingCardContainer');


    for (const key in initial_processing_graph) {
        if (key.includes("Job")) {
            const jobData = initial_processing_graph[key];

            // Create a card for each key
            const card = document.createElement('div');
            card.classList.add('card');

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
            processingCardContainer.appendChild(card);
        }
    }

    const outputCardContainer = document.getElementById('outputCardContainer');

    const aggregatedOutputCounts = createSortedEvidenceOutputDict(initial_processing_graph)

    for (const outputType in aggregatedOutputCounts) {
        const count = aggregatedOutputCounts[outputType].count
        const handlers = aggregatedOutputCounts[outputType].options
        const card = document.createElement('div');
        card.classList.add('card');
        const cardHeader = document.createElement('div');
        cardHeader.setAttribute('id', 'CardHeader-' + outputType)
        cardHeader.classList.add('card-header', 'custom-card-header')
        cardHeader.innerHTML = `<h5 style="display: inline-block;">${outputType}</h5><i class="ml-2 icon-badge">${count}</i>`
        cardHeader.addEventListener('click', function (event) {
            event.stopPropagation()
            event.preventDefault()
            const cardbody = document.getElementById('CardBody-' + outputType)
            if (cardbody && cardbody.classList.contains('show')) {
                cardbody.classList.remove('show');
            } else {
                cardbody.classList.add('show');
            }
        })
        const cardBody = document.createElement('div');
        cardBody.setAttribute('id', 'CardBody-' + outputType)
        cardBody.classList.add('card-body', 'collapse', 'show');
        card.appendChild(cardHeader);
        for (const handler in handlers) {
            const handler_value = handlers[handler]
            const inputWrapper = document.createElement("div")
            inputWrapper.classList.add('form-check')
            const input = document.createElement("input")
            input.classList.add('form-check-input', 'custom-checkbox')
            input.setAttribute('type', 'checkbox')
            input.setAttribute('value', '')
            input.checked = JSON.parse(handler_value)
            input.setAttribute('id', `checkboxHeader-${outputType}-${handler}`)
            input.addEventListener("click", async function (event) {
                event.stopImmediatePropagation();
                await update_process_graph(type_ = "evidence_processing_choice", value_ = event.target.checked, id_ = `${outputType}-${handler}`)
            }, false);
            const label = document.createElement("label")
            label.classList.add('form-check-label')
            label.setAttribute('htmlFor', 'checkboxHeader-' + handler)
            label.innerHTML = `<h5>${handler}</h5>`
            inputWrapper.appendChild(input)
            inputWrapper.appendChild(label)
            cardBody.appendChild(inputWrapper)
        }
        card.appendChild(cardBody);
        outputCardContainer.appendChild(card)

    }
}

// Fetch evidence list and populate the dropdown
async function fetch_evidence_types() {
    try {
        const response = await fetch('/evidence/evidence_types');
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

        let response = await fetch(`/processing/create_process`, requestOptions);
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
    fetch('/processing/start_process?' + qs, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
        }
    })
        .then(response => {
            const processingCardContainer = document.getElementById('processingCardContainer');
            const outputCardContainer = document.getElementById('outputCardContainer');
            outputCardContainer.innerHTML = ""
            processingCardContainer.innerHTML = ""
            const dropdown = document.getElementById('evidenceDropdown');
            dropdown.selectedIndex = 0;
            const startConfigureButton = document.getElementById('configureBtn')
            startConfigureButton.disabled = true;
            $('#topSection').hide();
        })
        .catch(error => {
            console.error('Error:', error);
        });
}

// Function to fetch data from the API and fill the table
async function fetchDataAndFillTable() {
    const selectedCase = document.getElementById('caseSelect2').value
    const selectedeEvidence = document.getElementById('evidenceSelect').value
    if (selectedCase && selectedeEvidence) {
        var formData = new FormData();
        formData.append("case", selectedCase)
        formData.append("evidence", selectedeEvidence)
        const qs = new URLSearchParams(formData).toString();

        fetch('/processing/fetch_processing_status?' + qs, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
            }
        }).then(async function (response) {
            const data = await response.json()
            fillTable(data);
        }).catch(error => {
            console.error('Error:', error);
        });
    }
}


function createStatusPie(status_pie, OutputName, data) {
    status_pie.style.setProperty("background-image", `url("/static/img/${OutputName.toLowerCase()}_icon.png")`)
    status_pie.style.setProperty("height", `40px`)
    status_pie.style.setProperty("width", `auto`)

    const data_ = {
        labels: ['Queued', 'Success', 'Failed', 'Running'],
        datasets: [
            {
                data: [data.queued, data.success, data.failure, data.running],
                backgroundColor: ['rgb(128,123,123)', 'rgb(2,185,2)', 'rgb(255,0,0)', 'rgb(60,60,255)'],
            }
        ]
    };

    const config = {
        type: 'doughnut',
        data: data_,
        options: {
            cutout: "65%",
            animation: {
                duration: 0
            },
            responsive: false,
            plugins: {
                legend: {
                    display: false,
                },
                title: {
                    display: false,
                }
            }
        },
    };

    new Chart(status_pie, config);
}

// Function to fill the table with data
function fillTable(data) {
    const tableBody = document.getElementById('existingProcessingTable');
    tableBody.innerHTML = '';

    data.forEach(item => {
        const row = document.createElement('tr');
        row.setAttribute("id",`processing_row_${item.id}`)
        const nameCell = document.createElement('td');
        nameCell.classList.add("align-middle")

        nameCell.textContent = item.processing_start;
        row.appendChild(nameCell);

        const turbiniaProgressCell = document.createElement('td');
        const queuedIcon = createIcon(item.processing_queued_tasks, 'fas fa-tasks queued-icon ml-1');
        const failedIcon = createIcon(item.processing_failed_tasks, 'fas fa-exclamation-circle failed-icon ml-1');
        const successfulIcon = createIcon(item.processing_successful_tasks, 'fas fa-check-circle successful-icon ml-1');
        turbiniaProgressCell.appendChild(failedIcon);
        turbiniaProgressCell.appendChild(createArrowIcon("left"));
        turbiniaProgressCell.appendChild(queuedIcon);
        turbiniaProgressCell.appendChild(createArrowIcon("right"));
        turbiniaProgressCell.appendChild(successfulIcon);
        turbiniaProgressCell.classList.add("align-middle")

        switch (item.processing_status) {
            case "completed_with_errors":
                const completed_with_errors = document.createElement('i');
                completed_with_errors.classList.add('fas', 'fa-exclamation-circle', 'error-icon', "ml-4");
                turbiniaProgressCell.appendChild(completed_with_errors)
                break
            case "successful":
                const success = document.createElement('i');
                success.classList.add('fas', 'fa-check-circle', 'success-icon', "ml-4");
                turbiniaProgressCell.appendChild(success)
                break
            case "failed":
                const failed = document.createElement('i');
                failed.classList.add('fas', 'fa-times-circle', 'failure-icon', "ml-4");
                turbiniaProgressCell.appendChild(failed)
                break
            default:
                const spinningIcon = document.createElement('i');
                spinningIcon.classList.add('fas', 'fa-spinner', 'fa-spin', "ml-4");
                turbiniaProgressCell.appendChild(spinningIcon)

        }

        const outputHandlingCell = document.createElement('td');
        outputHandlingCell.classList.add("d-flex", "flex-row")
        if (Object.keys(item.output_handling_overall_status).length > 0) {
            const aggregatedData = aggregateStatus(item.output_handling_overall_status);
            for (const [key, counts] of Object.entries(aggregatedData)) {
                const statusPie = document.createElement('canvas');
                statusPie.setAttribute("id", `status_pie_${item.id}_${key}`)
                createStatusPie(statusPie, key, counts)
                outputHandlingCell.appendChild(statusPie)
            }
        }
        outputHandlingCell.classList.add("align-middle")
        const buttonCell = document.createElement('td');
        const button = document.createElement('button');
        button.innerText="Remove Processing"
        button.setAttribute("id",`remove_handle_${item.id}`)
        button.addEventListener('click', function (event) {
            event.stopPropagation()
            event.preventDefault()
            const caseSelect = document.getElementById('caseSelect2').value
            const evidenceSelect = document.getElementById('evidenceSelect').value
            var formData = new FormData();
            formData.append("case", caseSelect)
            formData.append("evidence", evidenceSelect)
            formData.append("processing_handle", event.target.id.replace("remove_handle_",""))

            const qs = new URLSearchParams(formData).toString();

            fetch('/processing/remove_processing?' + qs, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                }
            }).then(async function (response) {
                const data = await response.json()
            }).catch(error => {
                console.error('Error:', error);
            });
        })
        button.classList.add('btn', 'btn-primary');
        buttonCell.appendChild(button)

        row.appendChild(turbiniaProgressCell);
        row.appendChild(outputHandlingCell)
        row.appendChild(buttonCell)
        tableBody.appendChild(row);
    });
}


function aggregateStatus(data) {
    // Initialize an object to store the aggregated percentages
    const aggregatedPercentages = {};

    // Iterate over each key-value pair in the data
    for (const [key, values] of Object.entries(data)) {
        // Count the total number of tasks for the current key
        const totalTasks = values.length;

        // Initialize an object to store the aggregated percentages for the current key
        const percentages = {
            success: 0,
            failure: 0,
            queued: 0,
            running: 0
        };

        // Count the number of each status in the values array and calculate the percentage
        for (const value of values) {
            if (value === 'success') {
                percentages.success++;
            } else if (value === 'failure') {
                percentages.failure++;
            } else if (value === 'queued') {
                percentages.queued++;
            } else if (value === 'running') {
                percentages.running++;
            }
        }

        // Convert counts to percentages
        for (const status in percentages) {
            percentages[status] = (percentages[status] / totalTasks) * 100;
        }

        // Store the aggregated percentages for the key
        aggregatedPercentages[key] = percentages;
    }

    return aggregatedPercentages;
}

// Function to create an icon element
function createIcon(value, iconClass) {
    const icon = document.createElement('i');
    icon.textContent = value;
    icon.classList.add(...iconClass.split(" "));
    return icon;
}

// Function to create an arrow icon element
function createArrowIcon(direction) {
    const arrowIcon = document.createElement('i');
    arrowIcon.classList.add('arrow-icon', 'fas', `fa-arrow-${direction}`, "ml-1");
    return arrowIcon;
}

var intervalID

// Function to fetch data from the API and fill the table
function fetchDataAndFillTableRepeatedly() {
    if (intervalID) {
        clearInterval(intervalID);
    }
    fetchDataAndFillTable();
    intervalID = setInterval(() => {
        fetchDataAndFillTable();
    }, 5000); // 10 seconds
}

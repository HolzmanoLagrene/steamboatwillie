function create_new_case() {
    var formData = new FormData();
    formData.append("case_name", document.getElementById('caseNumber').value)
    formData.append("case_description", document.getElementById('caseDescription').value)
    const qs = new URLSearchParams(formData).toString();
    $('#createCaseModal').modal('hide');
    fetch('/cases/create_new_case?' + qs, {
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

$('#caseNumber').on('input', function (e) {
    const case_number_input = document.getElementById('caseNumber')
        const submitButton = document.getElementById('submit_button')

    if (!(this.checkValidity())) {
        case_number_input.style.setProperty("background-color", "red")
    } else {
        case_number_input.style.setProperty("background-color", "green")
        submitButton.disabled = false;
    }
    this.reportValidity();
})



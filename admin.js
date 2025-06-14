// AWS Configuration
const AWS_CONFIG = {
    region: 'us-east-2',
    bucketName: 'mous-life-journal',
    allowedFileTypes: ['jpg', 'jpeg', 'png', 'gif', 'mp4', 'mov', 'MOV'],
    cognito: {
        identityPoolId: 'us-east-2:749f4e77-a158-4363-ba7d-dd0357652ad2',
        userPoolId: 'us-east-2_uKaIhSvH7'
    }
};

// Initialize AWS SDK
AWS.config.update({
    region: AWS_CONFIG.region
});

// Initialize the Amazon Cognito credentials provider
AWS.config.credentials = new AWS.CognitoIdentityCredentials({
    IdentityPoolId: AWS_CONFIG.cognito.identityPoolId
});

// Create S3 instance
const s3 = new AWS.S3();

// DOM Elements
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const uploadBtn = document.getElementById('uploadBtn');
const uploadList = document.getElementById('uploadList');
const sectionSelect = document.getElementById('sectionSelect');
const eventSection = document.getElementById('eventSection');
const eventName = document.getElementById('eventName');
const eventDate = document.getElementById('eventDate');
const createEventBtn = document.getElementById('createEventBtn');
const eventList = document.getElementById('eventList');
const currentPath = document.getElementById('currentPath');
const uploadConfirmation = document.getElementById('uploadConfirmation');

// Selected files and current event
let selectedFiles = [];
let currentEvent = null;

// Load existing events for a country
async function loadEvents(country) {
    try {
        console.log('Loading events for:', country);
        eventSection.style.display = 'block'; // Show the event section immediately

        const params = {
            Bucket: AWS_CONFIG.bucketName,
            Prefix: `sections/${country}/`,
            Delimiter: '/'
        };

        console.log('Fetching S3 objects with params:', params);
        const data = await s3.listObjectsV2(params).promise();
        console.log('S3 response:', data);

        const events = new Set();

        // Get unique event folders
        if (data.CommonPrefixes) {
            data.CommonPrefixes.forEach(prefix => {
                const eventName = prefix.Prefix.split('/')[2];
                if (eventName) {
                    events.add(eventName);
                }
            });
        }

        // Also check Contents for direct files/folders
        if (data.Contents) {
            data.Contents.forEach(content => {
                const parts = content.Key.split('/');
                if (parts.length > 2) {
                    const eventName = parts[2];
                    if (eventName && !eventName.startsWith('.')) {
                        events.add(eventName);
                    }
                }
            });
        }

        console.log('Found events:', Array.from(events));

        // Display events
        eventList.innerHTML = '<h3>Existing Events:</h3>';
        if (events.size === 0) {
            eventList.innerHTML += '<p>No events yet. Create your first event!</p>';
        } else {
            events.forEach(event => {
                const item = document.createElement('div');
                item.className = 'event-item';
                item.textContent = event;
                item.addEventListener('click', () => selectEvent(event));
                eventList.appendChild(item);
            });
        }

    } catch (error) {
        console.error('Error loading events:', error);
        eventList.innerHTML = '<p>Error loading events. Please try again.</p>';
    }
}

// Create new event
async function createEvent() {
    const country = sectionSelect.value;
    if (!country || !eventName.value || !eventDate.value) {
        alert('Please fill in both event name and date');
        return;
    }

    // Parse the date as UTC to avoid timezone issues
    const [year, month] = eventDate.value.split('-');
    const date = new Date(Date.UTC(year, month - 1));
    const monthYear = date.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    const eventFolder = `${eventName.value} - ${monthYear}`;
    
    try {
        console.log('Creating event folder:', eventFolder);
        
        // Create an empty object to mark the folder
        await s3.putObject({
            Bucket: AWS_CONFIG.bucketName,
            Key: `sections/${country}/${eventFolder}/.folder`,
            Body: ''
        }).promise();

        console.log('Event folder created successfully');
        
        // Reload events
        await loadEvents(country);
        
        // Clear inputs
        eventName.value = '';
        eventDate.value = '';
        
        // Select the new event
        selectEvent(eventFolder);
    } catch (error) {
        console.error('Error creating event:', error);
        alert('Error creating event. Please try again.');
    }
}

// Select an event
function selectEvent(event) {
    currentEvent = event;
    
    // Update UI
    document.querySelectorAll('.event-item').forEach(item => {
        item.classList.remove('selected');
        if (item.textContent === event) {
            item.classList.add('selected');
        }
    });

    // Update current path display
    currentPath.textContent = `Selected path: sections/${sectionSelect.value}/${event}`;
    currentPath.style.display = 'block';
    
    // Enable upload if files are selected
    updateUploadButton();
}

// Handle file selection
function handleFiles(files) {
    selectedFiles = Array.from(files);
    updateUploadButton();
    displaySelectedFiles();
}

// Update upload button state
function updateUploadButton() {
    uploadBtn.disabled = selectedFiles.length === 0 || !sectionSelect.value || !currentEvent;
    if (uploadBtn.disabled) {
        uploadBtn.title = 'Please select a country, event, and files to upload';
    } else {
        uploadBtn.title = 'Click to upload files';
    }
}

// Display selected files
function displaySelectedFiles() {
    uploadList.innerHTML = '';
    selectedFiles.forEach((file, index) => {
        const item = document.createElement('div');
        item.className = 'upload-item';
        item.innerHTML = `
            <span class="filename">${file.name}</span>
            <span class="status">Pending</span>
            <div class="progress-bar">
                <div class="progress-fill" id="progress-${index}"></div>
            </div>
        `;
        uploadList.appendChild(item);
    });
}

// Upload files to S3
async function uploadFiles() {
    const country = sectionSelect.value;
    uploadConfirmation.textContent = '';
    let successCount = 0;
    
    for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        const fileName = file.name;
        const fileKey = `sections/${country}/${currentEvent}/${fileName}`;
        
        const params = {
            Bucket: AWS_CONFIG.bucketName,
            Key: fileKey,
            Body: file,
            ContentType: file.type
        };

        try {
            console.log('Uploading file:', fileKey);
            const upload = s3.upload(params);
            
            // Update progress bar
            upload.on('httpUploadProgress', (progress) => {
                const progressPercent = (progress.loaded / progress.total) * 100;
                document.getElementById(`progress-${i}`).style.width = `${progressPercent}%`;
            });

            await upload.promise();
            console.log('File uploaded successfully:', fileKey);
            
            // Update status
            const statusElement = uploadList.children[i].querySelector('.status');
            statusElement.textContent = 'Completed';
            statusElement.style.color = '#4CAF50';
            successCount++;
        } catch (error) {
            console.error('Upload error:', error);
            const statusElement = uploadList.children[i].querySelector('.status');
            statusElement.textContent = 'Failed';
            statusElement.style.color = '#f44336';
        }
    }
    // Show confirmation message
    if (successCount === selectedFiles.length) {
        uploadConfirmation.textContent = `✅ All ${successCount} files uploaded to ${country} / ${currentEvent}!`;
    } else {
        uploadConfirmation.textContent = `⚠️ Uploaded ${successCount} of ${selectedFiles.length} files. Check errors above.`;
    }
}

// Event Listeners
sectionSelect.addEventListener('change', (e) => {
    const country = e.target.value;
    if (country) {
        console.log('Country selected:', country);
        eventSection.style.display = 'block';
        loadEvents(country);
    } else {
        console.log('No country selected');
        eventSection.style.display = 'none';
        currentEvent = null;
        currentPath.style.display = 'none';
    }
    updateUploadButton();
});

createEventBtn.addEventListener('click', createEvent);

dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.style.background = 'rgba(224, 224, 224, 0.1)';
});

dropZone.addEventListener('dragleave', () => {
    dropZone.style.background = 'none';
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.style.background = 'none';
    handleFiles(e.dataTransfer.files);
});

fileInput.addEventListener('change', (e) => {
    handleFiles(e.target.files);
});

uploadBtn.addEventListener('click', uploadFiles);

// Initialize - hide the event section and current path initially
eventSection.style.display = 'none';
currentPath.style.display = 'none'; 
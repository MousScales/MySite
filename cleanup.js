// AWS Configuration
const AWS = require('aws-sdk');

const AWS_CONFIG = {
    region: 'us-east-2',
    bucketName: 'mous-life-journal',
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

async function deleteAllEvents() {
    try {
        // List all objects in the sections folder
        const objects = await s3.listObjectsV2({
            Bucket: AWS_CONFIG.bucketName,
            Prefix: 'sections/'
        }).promise();

        if (objects.Contents.length === 0) {
            console.log('No objects found to delete');
            return;
        }

        // Create delete params
        const deleteParams = {
            Bucket: AWS_CONFIG.bucketName,
            Delete: {
                Objects: objects.Contents.map(obj => ({ Key: obj.Key })),
                Quiet: false
            }
        };

        // Delete all objects
        console.log(`Deleting ${objects.Contents.length} objects...`);
        const result = await s3.deleteObjects(deleteParams).promise();
        console.log('Deletion complete:', result);

        // Check if there are more objects (pagination)
        if (objects.IsTruncated) {
            console.log('More objects exist. Please run the script again.');
        } else {
            console.log('All objects have been deleted successfully.');
        }

    } catch (error) {
        console.error('Error deleting objects:', error);
    }
}

// Run the deletion
deleteAllEvents(); 
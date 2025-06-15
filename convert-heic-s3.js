// convert-heic-s3.js
const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');
const heicConvert = require('heic-convert');

// Configure AWS
AWS.config.update({ region: 'us-east-2' });
const s3 = new AWS.S3();
const BUCKET = 'mous-life-journal';

async function listAllHeicFiles(Prefix) {
  let files = [];
  let ContinuationToken;
  do {
    const params = { Bucket: BUCKET, Prefix, ContinuationToken };
    const data = await s3.listObjectsV2(params).promise();
    files = files.concat((data.Contents || []).filter(obj => obj.Key.toLowerCase().endsWith('.heic')));
    ContinuationToken = data.IsTruncated ? data.NextContinuationToken : undefined;
  } while (ContinuationToken);
  return files;
}

async function downloadFile(Key) {
  const data = await s3.getObject({ Bucket: BUCKET, Key }).promise();
  return data.Body;
}

async function uploadJpg(Key, jpgBuffer) {
  const newKey = Key.replace(/\.heic$/i, '.jpg');
  await s3.putObject({
    Bucket: BUCKET,
    Key: newKey,
    Body: jpgBuffer,
    ContentType: 'image/jpeg',
    ACL: 'public-read',
  }).promise();
  console.log(`Uploaded: ${newKey}`);
}

async function convertAllHeicToJpg() {
  const files = await listAllHeicFiles('sections/');
  console.log(`Found ${files.length} HEIC files.`);
  for (const file of files) {
    try {
      const heicBuffer = await downloadFile(file.Key);
      const jpgBuffer = await heicConvert({
        buffer: heicBuffer,
        format: 'JPEG',
        quality: 0.92,
      });
      await uploadJpg(file.Key, jpgBuffer);
    } catch (e) {
      console.error(`Failed to convert ${file.Key}:`, e);
    }
  }
}

convertAllHeicToJpg(); 
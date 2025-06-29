// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const AWS = require('aws-sdk');
const app = express();
const PORT = 5000;

// Add CORS headers
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// Configure AWS SDK using environment variables
AWS.config.update({
  region: process.env.AWS_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

// Create an S3 service object
const s3 = new AWS.S3();

// Set the S3 folder path and bucket name from environment variables
const S3_FOLDER_PATH = process.env.S3_FOLDER_PATH || 'lofi stations/';
const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME || 'lowfi-records';

// Verify AWS credentials are available
const verifyAwsCredentials = () => {
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    console.error('WARNING: AWS credentials are missing. Please update your .env file with valid credentials.');
    return false;
  }
  console.log('AWS credentials loaded successfully');
  return true;
};

// Check credentials when server starts
const credentialsVerified = verifyAwsCredentials();

// Middleware to verify AWS credentials before API calls
const checkAwsCredentials = (req, res, next) => {
  if (!credentialsVerified) {
    return res.status(500).json({
      success: false,
      error: 'AWS credentials are not properly configured. Check server logs for details.'
    });
  }
  next();
};

// Helper function to handle S3 errors
const handleS3Error = (err, res) => {
  if (err.code === 'NoSuchBucket') {
    return res.status(404).json({
      success: false,
      error: `Bucket '${S3_BUCKET_NAME}' does not exist.`
    });
  } else if (err.code === 'AccessDenied') {
    return res.status(403).json({
      success: false,
      error: `Access denied to bucket '${S3_BUCKET_NAME}'. Check your IAM permissions.`
    });
  } else if (err.code === 'CredentialsError') {
    return res.status(401).json({
      success: false,
      error: 'Invalid AWS credentials. Please check your Access Key and Secret Access Key.'
    });
  } else if (err.code === 'NetworkingError') {
    return res.status(503).json({
      success: false,
      error: 'Network error while connecting to AWS. Please check your internet connection.'
    });
  }
  
  res.status(500).json({
    success: false,
    error: err.message,
    code: err.code
  });
};

// The only route - fetch albums from the S3 folder
app.get('/albums', checkAwsCredentials, async (req, res) => {
  try {
    console.log(`[${new Date().toISOString()}] /albums endpoint hit - will randomize track order for all albums`);
    console.log(`Fetching albums from S3 bucket: ${S3_BUCKET_NAME}, folder: ${S3_FOLDER_PATH}`);
    
    const params = {
      Bucket: S3_BUCKET_NAME,
      Prefix: S3_FOLDER_PATH,
      MaxKeys: 1000
    };
    
    const data = await s3.listObjectsV2(params).promise();
    console.log(`Objects in '${S3_FOLDER_PATH}' folder retrieved successfully: ${data.Contents.length} items found`);
    
    // Group the files by album
    const albumMap = {};
    
    data.Contents.forEach(item => {
      // Skip the folder itself
      if (item.Key === S3_FOLDER_PATH) return;
      
      // Extract the album and track information from the path
      // Format expected: "lofi stations/AlbumName - Artist/01 - Track Name.mp3"
      const relativePath = item.Key.replace(S3_FOLDER_PATH, '');
      const parts = relativePath.split('/');
      
      if (parts.length < 2) return; // Skip items not in an album subfolder
      
      const albumInfo = parts[0]; // "AlbumName - Artist"
      const trackFileName = parts[1]; // "01 - Track Name.mp3"
      
      // Extract album name and artist
      let albumName = albumInfo;
      let artist = "Unknown Artist";
      
      if (albumInfo.includes(' - ')) {
        const albumParts = albumInfo.split(' - ');
        albumName = albumParts[0].trim();
        artist = albumParts[1].trim();
      }
      
      // Extract track number and name
      let trackNumber = 0;
      let trackName = trackFileName;
      
      // Check if the filename starts with a number (e.g., "01 - ")
      const trackMatch = trackFileName.match(/^(\d+)\s*-\s*(.+)/);
      if (trackMatch) {
        trackNumber = parseInt(trackMatch[1], 10);
        trackName = trackMatch[2].trim();
      }
      
      // Remove file extension from track name
      trackName = trackName.replace(/\.[^/.]+$/, "");
      
      // Create album entry if it doesn't exist
      if (!albumMap[albumInfo]) {
        albumMap[albumInfo] = {
          albumName: albumName,
          artist: artist,
          tracks: [],
          coverUrl: null
        };
      }
      
      // Check if this is a cover image
      if (trackFileName.toLowerCase().includes('cover') || trackFileName.toLowerCase().includes('.jpg') || 
          trackFileName.toLowerCase().includes('.jpeg') || trackFileName.toLowerCase().includes('.png')) {
        albumMap[albumInfo].coverUrl = `${process.env.CLOUDFRONT_DOMAIN}${item.Key}`;
        return;
      }
      
      // Generate a unique track ID (combination of timestamp, random number, and track info)
      const timestamp = Date.now();
      const random = Math.floor(Math.random() * 10000);
      const uniqueId = `${timestamp}-${random}-${albumInfo.replace(/\s/g, '-')}-${trackNumber}`;
      
      // Add the track with unique ID
      albumMap[albumInfo].tracks.push({
        trackId: uniqueId,
        name: trackName,
        url: `${process.env.CLOUDFRONT_DOMAIN}${item.Key}`,
        order: trackNumber
      });
    });
    
    // Convert albumMap to array and assign random track order
    const formattedAlbums = Object.values(albumMap).map(album => {
      // First sort tracks by original track number for consistent display
      album.tracks.sort((a, b) => a.order - b.order);
      
      // Now assign random order values to each track (between 0 and track count - 1)
      const trackCount = album.tracks.length;
      
      // Create an array of available positions
      const availablePositions = Array.from({ length: trackCount }, (_, i) => i);
      
      // Shuffle the available positions using Fisher-Yates algorithm
      for (let i = availablePositions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [availablePositions[i], availablePositions[j]] = [availablePositions[j], availablePositions[i]];
      }
      
      // Assign each track a random position
      album.tracks.forEach((track, index) => {
        track.order = availablePositions[index];
      });
      
      return album;
    });
    
    res.json({
      success: true,
      albums: formattedAlbums,
      count: formattedAlbums.length
    });
  } catch (err) {
    console.error(`Error fetching albums from S3:`, err);
    handleS3Error(err, res);
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Configured to fetch albums from S3 bucket: ${S3_BUCKET_NAME}, folder: ${S3_FOLDER_PATH}`);
});

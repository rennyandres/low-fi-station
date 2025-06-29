# Low Fi Station API

A simple Express server that connects to AWS S3 to fetch and serve lo-fi music albums.

## Features

- Single API endpoint (`/albums`) that returns structured album and track data
- Connects to AWS S3 to fetch music files from a designated bucket and folder
- Randomizes track order each time the endpoint is accessed
- Generates unique track IDs for each request
- Parses album names, artists, and track information from file structure

## Setup

1. Clone this repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file with the following variables:
   ```
   AWS_ACCESS_KEY_ID=your_aws_access_key
   AWS_SECRET_ACCESS_KEY=your_aws_secret_key
   AWS_REGION=your_aws_region
   CLOUDFRONT_DOMAIN=your_cloudfront_domain/
   S3_BUCKET_NAME=your_s3_bucket_name
   S3_FOLDER_PATH=your_s3_folder_path/
   ```
4. Start the server:
   ```bash
   node server.js
   ```

## API Endpoints

### GET /albums

Returns a list of albums with their tracks from the S3 bucket.

**Response format:**
```json
{
  "success": true,
  "albums": [
    {
      "albumName": "Album Title",
      "artist": "Artist Name",
      "coverUrl": "https://cloudfront-url/to/cover.jpg",
      "tracks": [
        {
          "trackId": "unique-id",
          "name": "Track Name",
          "url": "https://cloudfront-url/to/track.mp3",
          "order": 2
        }
      ]
    }
  ],
  "count": 1
}
```

## Expected S3 Structure

The API expects files in your S3 bucket to follow this structure:

```
your_folder_path/
  │
  ├── Album Name - Artist/
  │   ├── 01 - Track Name.mp3
  │   ├── 02 - Another Track.mp3
  │   └── cover.jpg
  │
  └── Another Album - Another Artist/
      ├── 01 - Track Name.mp3
      └── ...
```

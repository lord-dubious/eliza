#!/bin/bash

# Change to the project directory
cd "$(dirname "$0")"

# Define the media folder path
MEDIA_FOLDER="./media"

# Check if the media folder exists
if [ ! -d "$MEDIA_FOLDER" ]; then
    echo "Error: Media folder not found at $MEDIA_FOLDER"
    echo "Creating media folder..."
    mkdir -p "$MEDIA_FOLDER"
    echo "Media folder created. Please add some images to it."
    exit 1
fi

# Count the number of image files in the media folder
IMAGE_COUNT=$(find "$MEDIA_FOLDER" -type f \( -name "*.jpg" -o -name "*.jpeg" -o -name "*.png" -o -name "*.gif" \) | wc -l)

# Check if there are any image files
if [ "$IMAGE_COUNT" -eq 0 ]; then
    echo "Error: No image files found in $MEDIA_FOLDER"
    echo "Please add some images to the media folder."
    exit 1
fi

# List the image files
echo "Found $IMAGE_COUNT image files in $MEDIA_FOLDER:"
find "$MEDIA_FOLDER" -type f \( -name "*.jpg" -o -name "*.jpeg" -o -name "*.png" -o -name "*.gif" \) -exec basename {} \;

echo "Media folder check completed successfully."
exit 0

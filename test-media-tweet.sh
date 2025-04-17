#!/bin/bash

# Change to the project directory
cd "$(dirname "$0")"

# Check if the media folder exists and contains images
echo "Checking media folder..."
./check-media-folder.sh

# Check if the media folder check was successful
if [ $? -ne 0 ]; then
    echo "Error: Media folder check failed. Please add some images to the media folder."
    exit 1
fi

# Run the test media tweet script
echo "Running test media tweet script..."
node --loader ts-node/esm agent/src/test-media-tweet.ts

echo "Test completed."

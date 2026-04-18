# Use the official Microsoft Playwright image
# This image comes with all necessary system dependencies and browsers pre-installed
FROM mcr.microsoft.com/playwright:v1.44.0-jammy

# Set the working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
# We use --production to keep the image small
RUN npm install

# Copy the rest of the application code
COPY . .

# Expose the port the app runs on
EXPOSE 3000

# Set environment variables for headless mode
ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Start the server
CMD ["npm", "run", "serve"]

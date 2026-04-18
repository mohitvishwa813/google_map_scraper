# Base image with Node 20 + Chrome pre-installed for Playwright
FROM apify/actor-node-playwright-chrome:20

# Copy all files from the current directory to the container
COPY . ./

# Install production dependencies
RUN npm install --quiet --only=prod --no-optional

# Ensure Playwright can find the system Chrome and its shared-library deps
RUN npx playwright install --with-deps chromium || true

# Start the HTTP server (listens on $PORT, default 3000)
CMD ["npm", "start"]

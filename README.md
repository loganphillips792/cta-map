# cta-map

# Running application

cd frontend/cta-map
add jawg.io token to .env file
npm run dev

## Docker usage

Build the production container image from the repo root:

```bash
docker build -t cta-map -f Docker/Dockerfile .
```

Then run it locally and expose the app on port 8080:

```bash
docker run --rm -p 8080:80 cta-map
```

Visit `http://localhost:8080` to verify the Vite build is being served by nginx from the Docker image.


Run UI Tests:

1. `cd cta-map/frontend/cta-map`
2. `npm run test:e2e `

# Data

[CTA Developer Center: Bus Tracker API - CTA](https://www.transitchicago.com/developers/bustracker/)

[Open Data from the CTA - CTA](https://www.transitchicago.com/data/)

# TODO

- Add playwright to pipeline
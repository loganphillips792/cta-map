# cta-map

# Running application

1. `cd frontend/cta-map`
2. add jawg.io token to .env file
3. `npm run dev`
4. `cd backend`
5. add CTA_API_KEY to .env file
6. `npm run dev`

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

## Bus Routes Daily total 

[CTA - Ridership - Bus Routes - Daily Totals by Route | City of Chicago | Data Portal](https://data.cityofchicago.org/Transportation/CTA-Ridership-Bus-Routes-Daily-Totals-by-Route/jyb9-n7fm/about_data)

1. Download CSV of the bus ridership by routes [here](https://data.cityofchicago.org/Transportation/CTA-Ridership-Bus-Routes-Daily-Totals-by-Route/jyb9-n7fm/about_data)

2. Put CSV file in `data/` directory

3. import data: `go run scripts/import_ridership_data.go data/<file_name>.csv`

4. Test db import: `sqlite3 /Users/logan/repos/cta-map/backend/data/ridership.db "SELECT route, SUM(rides) as total_rides
    FROM ridership WHERE year = 2023 GROUP BY route ORDER BY total_rides DESC LIMIT 5;"`


5. `SELECT route, SUM(rides) as total_rides
    FROM ridership WHERE year = 2023 GROUP BY route ORDER BY total_rides DESC LIMIT 5;`;

# TODO

- Add playwright to pipeline
- Add spans to be able to keep track of API calls in grafana

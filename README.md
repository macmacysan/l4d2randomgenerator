# L4D2 Addon Roulette

Small free-hosting-friendly randomizer for public Left 4 Dead 2 Workshop campaigns.

## Deploy the API

1. Create a free Cloudflare account and open **Workers & Pages → Create Worker**.
2. Paste the contents of `worker.js` into the Worker editor and deploy it.
3. Copy the Worker URL.

## Deploy the website

1. In `index.html`, replace `YOUR_CLOUDFLARE_WORKER_URL` with the Worker URL.
2. Upload `index.html` to GitHub Pages, Cloudflare Pages, Netlify, or any static host.

The API searches public L4D2 Workshop campaign listings, chooses one randomly, and returns its Steam title, image, description, and link. It does not access private Steam accounts or expose credentials.

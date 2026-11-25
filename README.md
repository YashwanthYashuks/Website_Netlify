# YT_Boquets_ReturnGifts (Netlify version)

Static pages in `public/` + one serverless function (`netlify/functions/api.mjs`).
Products and orders are stored in **Netlify Blobs** (built in, no setup needed).

## Deploy
1. Push this folder to GitHub/GitLab and import it in Netlify (build command: none; publish dir `public` is set in `netlify.toml`).
   Or run `npm install -g netlify-cli && npm install && netlify deploy --prod`.
2. In **Site configuration → Environment variables** add:
   - `ADMIN_USER`, `ADMIN_PASSWORD` – admin login
   - `SECRET_KEY` – any long random string (signs admin sessions)
3. Redeploy. Admin panel: `/admin.html`.

## Run locally
`npm install && npx netlify dev` → http://localhost:8888

## Product images
Put image files in `public/images/` and use the filename in the admin form (or paste a full image URL).
Currently only `elegant_rose_bouquet.jpg` is included – add the other four filenames
(`premium_flower_bouquet.jpg`, `mini_return_gift_pack.jpg`, `premium_return_gift_box.jpg`, `custom_wedding_gift.jpg`)
or a 🌷 placeholder is shown.

WhatsApp number / address: edit `CONFIG` at the top of `public/js/app.js`.

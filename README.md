# Cine Illimite IDF

Mobile-first static page for UGC, MK2, and UGC/MK2 Illimite partner cinema showtimes in Ile-de-France.

## What It Does

- Shows future dates when they exist in the fetched data.
- Filters by date, cinema, network, and search text.
- Opens official reservation links when the source provides them.
- Stores refreshed data in `data/showtimes.json`, so the public site is static and works on GitHub Pages.

## Data Sources

- UGC accepted cinemas list: `https://www.ugc.fr/cinemas-acceptant-ui.html`
- Independent partner cinema API: `https://datacinesindes.fr/data-fair/api/v1/datasets/programmation-cinemas`
- UGC showings endpoint used by UGC cinema pages.
- MK2 public cinema pages.

The UGC and MK2 sources are public website endpoints, not a formal public API. If they change their HTML structure, the update script may need adjustment.

## Local Preview

This project is static. Serve the folder with any local HTTP server, then open the local URL.

The bundled `data/showtimes.json` is a refreshed snapshot. GitHub Actions keeps replacing it with live data.

## GitHub Pages Deployment

1. Create a new GitHub repository.
2. Put the contents of this folder at the repository root.
3. Push to GitHub.
4. In GitHub, go to `Settings -> Pages`.
5. Set source to `Deploy from a branch`, branch `main`, folder `/ (root)`.
6. Open the `Actions` tab and run `Update showtimes` once manually.

After that, GitHub Actions refreshes `data/showtimes.json` every 6 hours. The public phone link is:

```text
https://zhiyangcai-web.github.io/cinema-illimite-idf/
```

To fetch more or fewer future days, edit `DAYS_AHEAD` in `.github/workflows/update-showtimes.yml`.

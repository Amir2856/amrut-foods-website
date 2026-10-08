MAHA AMRUT PREMIUM WEBSITE — DEPLOYMENT NOTES
================================================
Files:
- package.json
- server.js
- public/index.html
- public/styles.css
- public/app.js
- public/images/ (add official logo/product photos here)

UPDATE GITHUB
1. Extract this ZIP.
2. In Amir2856/amrut-foods-website, replace package.json and server.js.
3. Replace public/index.html, public/styles.css, public/app.js.
4. Commit. Render should redeploy if connected to this repository.
5. Test /api/health and submit a test enquiry.

BRAND ASSETS
- The CSS wordmark is temporary, NOT the official Amrut logo. Replace it with your official logo image before launch; do not redraw/alter your logo.
- Product bag visuals are CSS mockups, not actual pack photos. Replace with approved product pack photos before publishing.
- Hero/editorial images use remote Unsplash image URLs. Replace with licensed/original brand photography for production.

ENQUIRIES
- Form validates fields, rate-limits requests and saves leads to data/leads.json.
- Render local storage may be ephemeral. For durable lead storage, add a persistent disk or database before relying on it for business-critical enquiries.
- Optional email uses Resend HTTPS API, not SMTP.
- Set Render environment variables:
  RESEND_API_KEY = private Resend API key
  ENQUIRY_TO = contact@amrutfoodz.com
  ENQUIRY_FROM = Maha Amrut <verified-sender@amrutfoodz.com>
- ENQUIRY_FROM must be a sender/domain verified in Resend. Never paste secrets into source code/GitHub.
- Without these variables, lead storage still runs but email notification is not sent.
- No admin dashboard/database integration is included yet.

BEFORE PUBLIC LAUNCH
- Replace temporary wordmark and product mockups.
- Confirm all product/brand claims and pack information.
- Check mobile layout and actual enquiry delivery.
- Add durable storage and privacy policy appropriate to how enquiries are handled.

# Offerte App (NL)

Volledig functionele offerte-app in React met:
- Foto-upload (als bijlage en in PDF-overzicht)
- PDF-generatie (html2canvas + jsPDF)
- E-mail verzenden via EmailJS (eigen account/service)
- Lokale opslag (localStorage)
- Zelftests voor helper-functies

## Snel starten

```bash
npm install
npm run dev
```

Open de URL die Vite toont (meestal http://localhost:5173).

## E-mail configureren (EmailJS)

1. Maak een account op https://www.emailjs.com
2. Maak een **Service** en **Template** met velden: `subject, message, to_email, to_name, from_name, from_email, html_content`
3. Klik in de app op ⚙️ **Instellingen** en vul **Service ID**, **Template ID** en **Public Key** in.
4. Verstuur de offerte per e-mail. De PDF en geüploade foto’s gaan mee als bijlagen.

## Build

```bash
npm run build
npm run preview
```

## Bestandstructuur

- `index.html` — include Tailwind via CDN.
- `src/App.jsx` — hoofdapplicatie.
- `src/main.jsx` — mount React app.
- `package.json` — scripts en dependencies.

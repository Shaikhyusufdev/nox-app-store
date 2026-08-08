# NOX Store — Mini APK App Store

Ek chota app-store: home page pe latest app hero, "Other Apps" listing, har app ka
apna auto-generated page, aur password-protected admin panel jaha se naye apps
add karte hi unka page automatically ban jata hai.

## 1. Supabase setup (database + storage for screenshots only)

1. https://supabase.com pe naya project banao (free tier kaafi hai).
2. Dashboard > **SQL Editor** > New Query > `supabase-schema.sql` ka content
   paste karke Run karo. Isse `apps` table ban jayega.
   - Agar tumne pehle koi purana schema already run kiya tha (screenshots
     column hataane wala), to `migration-restore-screenshots.sql` bhi run
     kar do taaki column wapas aa jaye.
3. Dashboard > **Storage** > naya bucket banao naam `screenshots`, aur
   **Public bucket** toggle ON karna (APK ke liye koi bucket nahi chahiye —
   wo sirf ek link hai jo tum khud kahi aur host karoge).
4. Dashboard > **Settings > API** se ye 2 cheeze copy karo:
   - `Project URL`
   - `service_role` key (secret key, anon key nahi)

## 2. Local setup

```bash
npm install
cp .env.example .env
```

`.env` file kholke fill karo:
```
SUPABASE_URL=<tumhara project URL>
SUPABASE_SERVICE_KEY=<tumhara service_role key>
ADMIN_PASSWORD=<koi strong password>
```

Run karo:
```bash
npm start
```

Site khulegi `http://localhost:3000` pe. Admin panel: `http://localhost:3000/admin.html`

## 3. Deploy (Vercel)

1. Is poore updated `app-store` folder ko GitHub repo mein push karo (jo tumne already banaya hai).
2. https://vercel.com pe GitHub se login karo. "Add New Project" > apna repo (`nox-app-store`) import karo.
3. Framework Preset: "Other" select karo (auto-detect ho sakta hai `vercel.json` ki wajah se).
4. **Environment Variables** section mein add karo:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY`
   - `ADMIN_PASSWORD`
5. Deploy karo. Ek `.vercel.app` URL milega jaha site turant live hogi.

**Note:** Vercel ke free (Hobby) plan pe serverless function requests ki body
size ~4.5 MB tak limited hoti hai. Agar screenshots is se bade hain to upload
fail ho sakta hai — screenshots ko compress/resize karke rakhna (jaise
1-2 MB tak) safe rahega.

## 4. Custom domain connect karna (noxwinex.store)

Vercel ke Project > Settings > Domains mein apna domain add karo, wo tumhe
ek A record aur CNAME record dega. Hostinger hPanel > DNS/Nameservers >
Manage DNS records mein wo records add kar do — bilkul waisa hi jaisa
pehle discuss kiya tha portfolio site ke liye.

## Kaise kaam karta hai

- **Home page** (`index.html`) — sabse latest add kiya hua app dikhata hai:
  naam top pe, 5-6 screenshots, aur neeche bada Download button. Top nav mein
  bhi ek Download button hai (seedha latest APK download karta hai) aur uske
  bagal mein "Other Apps" button (`apps.html` pe le jata hai).
- **Other Apps page** (`apps.html`) — admin ne jitne bhi apps add kiye hain,
  sabki tile-grid list.
- **Per-app page** — kisi bhi app pe click karo to `/app/<slug>` URL khulta
  hai. Ye page static nahi hai — ek hi `app.html` file URL se slug padhkar
  API se us app ka data (naam, size, version, rating, download button) fetch
  karti hai. Matlab jab bhi admin panel se naya app add karoge, uska page
  **automatically** ban jata hai — koi extra kaam nahi.
- **Admin panel** (`admin.html`) — password se login, form bharo (name,
  version, size, rating, description, up to 6 screenshots, aur **APK ka
  direct download link** jo tumne kahi aur host kar rakha hai). Submit karte
  hi screenshots Supabase Storage mein upload hoti hain aur database mein
  entry ban jati hai — turant live. APK khud upload nahi hota, sirf uska
  link save hota hai.

## Security note

`ADMIN_PASSWORD` ko strong rakhna aur `.env` file ko kabhi GitHub pe commit
mat karna (isko `.gitignore` mein already add karna bhool mat jana).

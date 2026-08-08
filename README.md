# NOX Store — Mini APK App Store

Ek chota app-store: home page pe latest app hero, "Other Apps" listing, har app ka
apna auto-generated page, aur password-protected admin panel jaha se naye apps
add karte hi unka page automatically ban jata hai.

## 1. Supabase setup (database + file storage)

1. https://supabase.com pe naya project banao (free tier kaafi hai).
2. Dashboard > **SQL Editor** > New Query > `supabase-schema.sql` ka content
   paste karke Run karo. Isse `apps` table ban jayega.
3. Dashboard > **Storage** > naye 2 buckets banao, **Public** rakhna dono ko:
   - `apks`
   - `screenshots`
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

## 3. Deploy (Render — free, recommended kyunki backend chahiye)

Vercel serverless functions APK jaisi bade files ke liye ideal nahi hain, isliye
is backend (Express + file uploads) ke liye **Render.com** use karo — free tier
available hai.

1. Is poore `app-store` folder ko ek naye GitHub repo mein push karo.
2. https://render.com pe GitHub se login, "New > Web Service" > apna repo select karo.
3. Build command: `npm install` | Start command: `npm start`
4. Environment tab mein `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `ADMIN_PASSWORD` add karo.
5. Deploy hone ke baad ek URL milega jaise `nox-store.onrender.com`.

## 4. Custom domain connect karna (noxwinex.store)

Render ke "Settings > Custom Domain" mein apna domain add karo, wo tumhe ek
CNAME record dega. Hostinger hPanel > DNS/Nameservers > Manage DNS records
mein wo CNAME add kar do (jaisa pichle deployment mein Vercel ke liye kiya tha).

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
  version, size, rating, description, screenshots, APK file), submit karte hi
  Supabase Storage mein files upload hoti hain aur database mein entry ban
  jati hai — turant live.

## Security note

`ADMIN_PASSWORD` ko strong rakhna aur `.env` file ko kabhi GitHub pe commit
mat karna (isko `.gitignore` mein already add karna bhool mat jana).

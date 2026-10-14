# 🌐 Connect Portal

Isang modernong Web Portal na naka-disenyo para i-deploy gamit ang **Render**, **GitHub**, at **Neon PostgreSQL** database. Gumagana ito sa kahit anong browser tulad ng **Safari** at **Google Chrome** (sa desktop at mobile).

---

## 🏗️ Tech Stack

* **Hosting & Web Service:** [Render](https://render.com) (Node.js runtime, libreng tier)
* **Source Control & CI/CD:** [GitHub](https://github.com) (awtomatikong nagde-deploy sa Render tuwing may bago kang push)
* **Database:** [Neon](https://neon.tech) (Serverless PostgreSQL)
* **Backend:** Express.js + `pg` (Node-Postgres) + JWT Authentication + bcryptjs + Virtual Game APIs
* **Frontend:** Responsive Social & Arcade Portal (Newsfeed + Lucky Spin Wheel + Double Dice + Coin Flip)

---

## 📁 Project Structure

```
connect-portal/
├── public/
│   └── index.html       # Frontend Portal UI (Login, Register, Newsfeed, Likes, Comments)
├── db.js                # Neon PostgreSQL connection & auto-migration script
├── server.js            # Express API server (Auth, Feed, Likes, Comments)
├── package.json         # Node.js dependencies at start script
├── render.yaml          # Render deployment blueprint
├── .env.example         # Template para sa Neon DATABASE_URL
└── README.md            # Hakbang-hakbang na gabay sa deployment
```

---

## 🚀 Hakbang-hakbang na Gabay sa Pag-deploy

### Step 1: Kumuha ng Libreng Database sa Neon (Neon.tech)

1. Pumunta sa **[https://neon.tech](https://neon.tech)** at mag-sign up (gamitin ang iyong GitHub o Google account).
2. I-click ang **"Create a project"**.
   * Project name: `connect-portal`
   * Database name: `neondb` (default)
3. Pagkatapos ma-create, makikita mo ang iyong **Connection Details**.
4. Piliin ang **Node.js** o **Connection string** at kopyahin ang buong URL:
   ```text
   postgresql://username:password@ep-sample-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```
   *(I-save muna ito sa notepad dahil ilalagay ito sa Render mamaya!)*

---

### Step 2: I-upload ang Code sa GitHub (GitHub.com)

1. Pumunta sa **[https://github.com](https://github.com)** at mag-log in.
2. I-click ang **"New"** button sa ilalim ng Repositories para gumawa ng bagong repository:
   * Repository name: `connect-portal`
   * Piliin ang **Public** o **Private**.
   * Huwag nang lagyan ng check ang "Add a README file" (may README na tayo).
   * I-click ang **"Create repository"**.
3. I-upload ang mga files mula sa `connect-portal` folder:
   * Sa page ng iyong bagong repo, i-click ang link na **"uploading an existing file"**.
   * I-drag at i-drop ang mga sumusunod na file mula sa `connect-portal`:
     - `package.json`
     - `server.js`
     - `db.js`
     - `render.yaml`
     - folder na `public/` (kasama ang `index.html`)
   * I-click ang **"Commit changes"**.

---

### Step 3: I-deploy sa Render (Render.com)

1. Pumunta sa **[https://render.com](https://render.com)** at mag-log in gamit ang iyong **GitHub** account.
2. Sa Render Dashboard, i-click ang **"New +"** button at piliin ang **"Web Service"**.
3. Piliin ang **"Build and deploy from a Git repository"** at i-click ang **Next**.
4. Piliin ang iyong `connect-portal` repository mula sa GitHub.
5. Ilagay ang mga settings:
   * **Name:** `connect-portal` (o kahit anong pangalan na gusto mo)
   * **Region:** Singapore o Oregon (alinman ang pinakamalapit sa iyo)
   * **Branch:** `main`
   * **Runtime:** `Node`
   * **Build Command:** `npm install`
   * **Start Command:** `npm start`
   * **Instance Type:** `Free`
6. Mag-scroll pababa sa **"Environment Variables"** at idagdag ang mga ito:
   * **Key:** `DATABASE_URL`
     * **Value:** *(I-paste dito ang Neon connection string na kinopya mo sa Step 1)*
   * **Key:** `JWT_SECRET`
     * **Value:** *(Kahit anong random na secret string, e.g. `portal-secret-key-12345`)*
7. I-click ang **"Deploy Web Service"**!

---

### Step 4: Buksan ang Live Portal sa Safari o Google Chrome! 🎉

* Hintayin matapos ang build sa Render (mga 1-2 minuto).
* Kapag lumabas na ang **"Live"**, makikita mo ang live URL sa itaas ng Render Dashboard (halimbawa: `https://connect-portal-xxxx.onrender.com`).
* I-click ang link na ito para buksan sa **Safari** o **Google Chrome** sa iyong Mac, iPhone, iPad, o Android phone!
* Makikita mo ang berdeng badge sa itaas: **"🟢 Neon PostgreSQL Connected"**!

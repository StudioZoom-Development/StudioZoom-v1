# Environment Setup & CI/CD Guide (Staging vs Production)

To maintain a clean and safe development cycle, we isolate our testing workspace (Staging) from our live client-facing application (Production). 

Our domain **`studiozoomproductions.in`** will point to the live Production build, while a staging URL will serve as the preview environment for testing features.

---

## 1. Environment Architecture

```mermaid
graph TD
    subgraph Git Repository
        DevBranch[dev branch]
        MainBranch[main branch]
    end

    subgraph GitHub Actions
        CI_Check[CI: Lint & Build Validation]
    end

    subgraph Vercel Hosting
        VercelDev[Staging Deploy / Preview]
        VercelProd[Production Deploy / Live]
    end

    subgraph Custom Domain
        Domain[studiozoomproductions.in]
    end

    subgraph Firebase
        F_Dev[(Dev Project: studio-zoom)]
        F_Prod[(Prod Project: studio-zoom-production)]
    end

    DevBranch --> CI_Check
    MainBranch --> CI_Check
    
    DevBranch -- Auto Deploy --> VercelDev --> F_Dev
    MainBranch -- Auto Deploy --> VercelProd --> F_Prod
    
    VercelProd --> Domain
```

---

## 2. Firebase Configuration Details

### A. Development/Staging (`studio-zoom`)
*   **Authentication:** Email/Password enabled.
*   **Firestore Database:** Rules & composite indexes deployed.
*   **Environment File (`.env.development`):**
    ```env
    NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyBwWM3bA4pH6-vVW788GMi9Sa9Ovoqd8SY
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=studio-zoom.firebaseapp.com
    NEXT_PUBLIC_FIREBASE_PROJECT_ID=studio-zoom
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=studio-zoom.firebasestorage.app
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=939824676231
    NEXT_PUBLIC_FIREBASE_APP_ID=1:939824676231:web:926efea5c2e128bd45a722
    NEXT_PUBLIC_APP_ENV=development
    ```

### B. Production (`studio-zoom-production`)
*   **Authentication:** Email/Password enabled.
*   **Firestore Database:** Rules & composite indexes deployed.
*   **Environment File (`.env.production`):**
    ```env
    NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyCByk4aa-mpG6Qf0oTi23EjwdwBGXeyc-I
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=studio-zoom-production.firebaseapp.com
    NEXT_PUBLIC_FIREBASE_PROJECT_ID=studio-zoom-production
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=studio-zoom-production.firebasestorage.app
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=144888939355
    NEXT_PUBLIC_FIREBASE_APP_ID=1:144888939355:web:e76327fc9de5fdf13b507e
    NEXT_PUBLIC_APP_ENV=production
    ```

---

## 3. Vercel Hosting & Domain Setup (`studiozoomproductions.in`)

Next.js is designed to deploy directly to Vercel. 

### Step 1: Create the Project on Vercel
1.  Go to [Vercel Dashboard](https://vercel.com) and click **Add New** → **Project**.
2.  Import your GitHub repository.
3.  Under **Framework Preset**, select **Next.js**.
4.  Set the Root Directory to `studio-zoom`.
5.  Click **Deploy**.

### Step 2: Configure Environment Variables in Vercel
To prevent checking API secrets into public GitHub code, add the keys directly in Vercel.

1.  In Vercel, go to **Settings** → **Environment Variables**.
2.  Add the following variables twice (once for Dev, once for Prod):

| Variable Name | Environment Scopes | Dev Value (`studio-zoom`) | Prod Value (`studio-zoom-production`) |
| :--- | :--- | :--- | :--- |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Dev + Preview / Production | `AIzaSyBwWM3bA4...` | `AIzaSyCByk4aa...` |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Dev + Preview / Production | `studio-zoom.firebaseapp.com` | `studio-zoom-production.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Dev + Preview / Production | `studio-zoom` | `studio-zoom-production` |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Dev + Preview / Production | `studio-zoom.firebasestorage.app` | `studio-zoom-production.firebasestorage.app` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Dev + Preview / Production | `939824676231` | `144888939355` |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Dev + Preview / Production | `1:939824676231:...` | `1:144888939355:...` |
| `NEXT_PUBLIC_APP_ENV` | Dev + Preview / Production | `development` | `production` |

### Step 3: Link Custom Domain `studiozoomproductions.in`
1.  In Vercel, go to **Settings** → **Domains**.
2.  Click **Add** and enter `studiozoomproductions.in`.
3.  Check the box to redirect the `www.` version to the apex domain: `www.studiozoomproductions.in` → `studiozoomproductions.in`.
4.  Set the target branch to `main` (Production).

### Step 4: Update Domain DNS Records (at your domain provider)
Log in to the domain registrar where you purchased `studiozoomproductions.in` (e.g. GoDaddy, Namecheap, Google Domains) and update your DNS records:

*   **Apex Domain (Record A):**
    *   Type: `A`
    *   Name: `@`
    *   Value: `76.76.21.21` (Vercel’s global IP address)
*   **Subdomain (CNAME):**
    *   Type: `CNAME`
    *   Name: `www`
    *   Value: `cname.vercel-dns.com`

Vercel will automatically provision a free secure SSL certificate (HTTPS) once the DNS propagates (usually takes 5 to 15 minutes).

---

## 4. GitHub Branching & CI/CD Strategy

### Branching Rules
1.  **`dev` branch:** The active working branch. Pushing to this branch triggers a Vercel staging deploy (accessible at your custom staging URL, e.g. `studio-zoom-git-dev-username.vercel.app`).
2.  **`main` branch:** The production branch. Merging `dev` into `main` automatically triggers Vercel to rebuild and publish live to `studiozoomproductions.in`.

### GitHub Actions CI
The file `.github/workflows/ci.yml` in your repository will automatically run on every push and Pull Request to both `dev` and `main`. It runs:
1.  Code Lint checks (`npm run lint`).
2.  Next.js production build compiler (`npm run build`).

If there is a syntax error or a build compilation failure, the GitHub Action will fail, preventing broken code from being merged or deployed.

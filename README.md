# FlottaManager 🚛

Dashboard per gestire profitti e costi della flotta camion.

## File del progetto
- `index.html` — struttura della pagina
- `style.css` — stile grafico
- `app.js` — logica app + Firebase
- `vercel.json` — configurazione Vercel

## Deploy su Vercel (5 minuti)

### Metodo 1 — Drag & Drop (più semplice)
1. Vai su [vercel.com](https://vercel.com) → crea account gratuito
2. Nella dashboard clicca **"Add New Project"**
3. Scegli **"Deploy from template"** oppure trascina la cartella del progetto
4. Vercel pubblica automaticamente → ricevi un link tipo `flotta-camion.vercel.app`

### Metodo 2 — GitHub (consigliato per aggiornamenti futuri)
1. Crea un repo su [github.com](https://github.com) (gratuito)
2. Carica i file del progetto nel repo
3. Vai su [vercel.com](https://vercel.com) → "Import Git Repository"
4. Seleziona il repo → Deploy automatico

## Configurazione Firebase
Già configurata in `app.js`. Assicurati di avere su Firebase:
- **Firestore Database** abilitato (modalità test va bene per iniziare)
- **Authentication** → Email/Password abilitato

## Regole Firestore consigliate
Nella console Firebase → Firestore → Regole, incolla:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /flotte/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

Questo assicura che ogni utente veda solo i propri dati.

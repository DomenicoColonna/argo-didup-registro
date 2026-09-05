# Mini registro (Argo didUP)

Interfaccia personale che legge i dati da **didUP Famiglia** usando la stessa API
dell'app ufficiale: voti, media calcolata in locale, compiti e calendario.

## Avvio

```bash
node server.js          # poi apri http://localhost:3000
PORT=8080 node server.js
```

Nessuna dipendenza: serve solo Node 18+ (qui c'e' la v20).

## Diagnosi del login

```bash
node login-test.js
```

Stampa ogni passo del flusso (`oauth2/auth` -> `sso/login` -> `token` -> `login`
-> `profilo` -> `dashboard`) e si ferma esattamente dove Argo rifiuta, con il
messaggio restituito.

## Come funziona

- `argo.js` – client dell'API: login OAuth2 + PKCE su `auth.portaleargo.it`
  (identico a quello dell'app Android/iOS), poi chiamate a
  `https://www.portaleargo.it/appfamiglia/api/rest/*`.
- `server.js` – ponte locale: l'API di Argo non manda header CORS, quindi il
  browser non puo' chiamarla direttamente. Tiene la sessione in RAM e serve
  `public/`.
- `public/` – UI in HTML + JS vanilla + Tailwind (CDN): home con media e
  prossimi impegni, calendario mensile, compiti, voti per materia, medie.
  Una scheda si apre anche via query string: `?tab=voti`.

Le credenziali non vengono mai salvate su disco: servono solo per ottenere il
token. Token, profilo e dati scaricati vengono salvati in `dati/sessioni.json`
(permessi 600, ignorato da git) per sopravvivere ai riavvii; il cookie dura
180 giorni e il token Argo si rinnova da solo con il refresh token.

## Installazione sul telefono (PWA)

`public/manifest.webmanifest`, le icone e `public/sw.js` rendono l'app
installabile, ma il browser lo permette solo da **HTTPS**: su un IP in chiaro
resta il semplice "Aggiungi a schermata Home". Serve un dominio con certificato
(es. Caddy davanti al server).

## Calcolo della media

Argo espone `mediaGenerale` e `mediaMaterie`, ma se la scuola li disabilita
arrivano vuoti: la media viene quindi ricalcolata dai singoli voti
(`public/app.js`, funzione `calcolaMedie`).

Regola usata: un voto conta se ha un valore numerico > 0 e Argo non lo esclude
(`numMedia !== 0`, `faMenoMedia !== 'S'`). I voti esclusi sono marcati "non in
media" nella lista, e la spunta **conta tutti i voti** nella scheda Media
permette di confrontare le due versioni.

Vengono mostrate: media generale (media di tutti i voti), media delle medie per
materia, media per materia con distinzione scritto/orale e andamento mensile.

## Endpoint API utili (per estensioni future)

| Endpoint | Contenuto |
| --- | --- |
| `dashboard/dashboard` | voti, compiti, bacheca, assenze, promemoria, medie |
| `dettaglioprofilo` | dati anagrafici |
| `orario-giorno` | orario del giorno |
| `votiscrutinio` | pagelle |
| `ricevimento` | colloqui |
| `downloadallegatobacheca` | allegati bacheca |

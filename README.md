# search.exe

A small search engine built from scratch. The interesting part is not the UI —
it is that the backend does not scan documents for a substring. It builds an
**inverted index** at ingest time and **ranks** matches with TF-IDF at query
time, the same shape as a real search engine, in about 300 readable lines.

There is also a **T-Rex runner** written from scratch on a `<canvas>` — parallax
scenery, a day/night cycle, particles and pterodactyls, all drawn with
rectangles and driven by one `requestAnimationFrame` loop.

```
docker-compose.yml         Run the whole thing with one command
k8s/                       Kubernetes manifests
search-exe/
  backend/                 Express API (port 5000)
    data/                  The .txt documents that get indexed
    search.js              The engine: tokenizer, index, TF-IDF, snippets, spell check
    search.test.js         28 tests (node --test, no dependencies)
    ingest.js              Builds searchIndex.json from data/
    server.js              HTTP layer only - no search logic lives here
    Dockerfile
  frontend/                React + Vite (port 5173, proxies /api to the backend)
    src/game/dinoEngine.js The game rules: plain JS, no React, no DOM
    src/game/*.test.js     20 tests, including the physics
    src/components/        Logo, SearchBar, SearchResults, Highlight, DinoGame
    Dockerfile             Multi-stage: build with Node, serve with nginx
    nginx.conf.template
```

## Running it

### With Docker (nothing to install but Docker)

```sh
docker compose up --build
```

Then open **http://localhost:8080**. No Node, no `npm install`, no version
mismatches — each image carries its own runtime. `docker compose down` stops it.

### Without Docker (for development, with hot reload)

Node.js 18+ and two terminals.

```sh
# Terminal 1 - backend
cd search-exe/backend
npm install
npm run ingest      # build searchIndex.json from data/
npm start           # http://localhost:5000

# Terminal 2 - frontend
cd search-exe/frontend
npm install
npm run dev         # http://localhost:5173
```

Either way, try `inverted index`, `tf-idf`, `event loop`, or misspell something
like `levenshtien` to see the spell correction.

```sh
npm test            # works in both folders (48 tests total)
npm run lint        # frontend
```

## How the search works

**1. Ingest (offline, once).** `ingest.js` reads every file in `data/`,
tokenizes it, and builds the inverted index.

A forward index maps a document to its words. An inverted index flips it, which
is the question a search actually asks — *which documents contain "react"?*

```js
// { term: { docId: timesItAppearsInThatDoc } }
{ react: { "0": 3, "2": 1 }, hooks: { "0": 5 } }
```

Looking up a word is now a hash-map hit plus work proportional only to the
number of matching documents, instead of a scan over the whole corpus.

**2. Query (online, per request).** `search.js` scores every candidate document
with **TF-IDF**:

- **TF** — how often the term appears in *this* document, divided by the
  document's length, so long documents don't win just for being long.
- **IDF** — `log(1 + N / documentsContainingTheTerm)`. A word in every document
  tells you nothing; a word in one document is a strong signal.

Two adjustments on top of that:

- a **title boost**, because a filename match is usually what was meant;
- a **coverage multiplier**, squared. TF-IDF scores each word independently, so
  searching *"delta time"* would otherwise let a document that just says "time"
  a lot beat one that actually discusses both words.

**3. Presentation.** Snippets are cut from around the first match rather than
from the start of the file, and the API returns which terms matched so the
frontend can wrap them in `<mark>`.

**4. Typos.** When a query word is missing from the vocabulary, the engine finds
the closest real word by **Damerau-Levenshtein distance** — Levenshtein plus the
transposition case, so `dgos` → `dogs` costs 1 edit instead of 2. That case
matters: swapping two adjacent letters is the most common way people mistype.
Candidates whose length differs by more than the edit budget are rejected
without computing the distance at all.

### API

| Endpoint | Returns |
|---|---|
| `GET /api/search?q=&page=` | ranked results, total, page count, timing, matched terms, spelling suggestion |
| `GET /api/suggest?q=` | autocomplete terms for the search box |
| `GET /api/file/:filename` | one full document |
| `GET /api/stats` | corpus size |
| `GET /api/health` | liveness — is the process up? |
| `GET /api/ready` | readiness — is an index loaded? 503 if not |

## How the game works

`src/game/dinoEngine.js` holds the rules and knows nothing about React:
`createGame()`, `updateGame(state, dt)`, `drawGame(ctx, state)`. `DinoGame.jsx`
only owns the canvas, the loop and the keyboard.

That split is why the physics can be tested at all — the test suite runs three
simulated minutes of gameplay in Node, with a stub canvas context that records
draw calls instead of painting them. It checks that a jump clears the tallest
cactus, that movement is frame-rate independent, that nothing leaks, and that
**every obstacle gap stays wider than the distance one jump covers** — that
last check caught a real bug where obstacles at high speed spawned closer than
a jump was long, so the player landed on the next cactus with no way to avoid it.

A few details worth knowing:

- **Delta time.** Every movement is multiplied by the seconds since the last
  frame. Moving a fixed number of pixels per frame would run the game at double
  speed on a 120hz monitor.
- **The world lives in a `useRef`, not `useState`.** Nothing in the JSX depends
  on the score — the canvas draws it — so the component never re-renders during
  play.
- **Cleanup.** The effect returns a function that cancels the animation frame
  and removes the key listeners. Without it, closing the modal would leave the
  loop running forever.

## Containers

Two images, because the two halves have nothing in common at runtime: the API is
a Node process, the frontend is a pile of static files that need a web server.

**The backend image** installs dependencies *before* copying the source. Docker
caches each instruction as a layer and reuses it while its inputs are unchanged,
so editing `search.js` reuses the cached `npm ci` layer instead of reinstalling
everything. It also runs `node ingest.js` at build time, so a started container
serves searches immediately and needs no writable storage.

**The frontend image is multi-stage.** Stage one uses Node to run `npm run
build`. Stage two is nginx, and copies *only* `dist/` across — Node, the sources
and ~200MB of `node_modules` stay behind in stage one and never ship:

```
search-exe-frontend:0.2.0    81.7MB     nginx + a few hundred KB of assets
search-exe-backend:0.2.0     244MB      needs the Node runtime, so it keeps it
```

**Where did the Vite proxy go?** In development, Vite's dev server forwards
`/api` to `localhost:5000`. There is no Vite in a container, so nginx takes over
that job — same-origin either way, so the browser never needs CORS. The upstream
address is not baked into the image: `nginx.conf.template` contains
`${BACKEND_URL}`, which is substituted from the environment at container start.
That is the reason one image runs under both compose and Kubernetes.

A few other choices worth naming:

- **Both containers run as non-root** (`uid 1000` and `uid 101`). Containers run
  as root unless told otherwise, which means a container escape starts as root on
  the host.
- **The backend port is never published.** Only the frontend is reachable from
  your machine; it talks to the backend over the private network compose creates,
  addressing it as `http://backend:5000`. Exposing only the edge is the same
  reasoning as a ClusterIP Service below.
- **`depends_on: condition: service_healthy`** waits for the backend's
  healthcheck to pass, not merely for its container to exist, so the first page
  load cannot reach a backend whose index has not loaded.
- **The backend filesystem is read-only**, with a `tmpfs` for `/tmp`. It only
  ever reads its own files.

## Kubernetes

`k8s/` holds the manifests. Compose runs containers on one machine; Kubernetes
schedules them across a cluster, keeps the requested number alive, and replaces
the ones that fail.

```sh
minikube start
minikube addons enable ingress
minikube addons enable metrics-server        # needed by the autoscaler

# Build the images, then hand them to the cluster. Without this step the pods
# would try to pull them from a registry that has never heard of them.
docker compose build
minikube image load search-exe-backend:0.2.0
minikube image load search-exe-frontend:0.2.0

kubectl apply -f k8s/
kubectl get pods -n search-exe -w

echo "$(minikube ip) search-exe.local" | sudo tee -a /etc/hosts
# then open http://search-exe.local
```

`kubectl delete namespace search-exe` removes everything.

### The ideas it demonstrates

**Declarative state.** The manifests describe what should be true, not steps to
get there. A controller continuously compares the cluster against them and closes
the gap. `kubectl delete pod` and another appears — not because anything reacted
to the deletion, but because two replicas were asked for and only one existed.

**Labels, not names.** A Deployment finds its pods with a label selector, and a
Service finds its backends the same way. Nothing addresses anything by name.

**Services are stable names over disposable pods.** Pod IPs change constantly, so
nothing should ever address a pod directly. The Service keeps a list of *ready*
pod IPs and load-balances across them, which is why the frontend can point at
`http://backend:5000` forever. That name is in-cluster DNS —
`backend.search-exe.svc.cluster.local` — and it is the same address compose
provides, which is why one image serves both.

**Liveness and readiness are different questions.** This is the distinction the
two probe endpoints exist to make:

| | asks | if it fails |
|---|---|---|
| `livenessProbe` → `/api/health` | is the process wedged? | **restart** the container |
| `readinessProbe` → `/api/ready` | can this pod serve a search *now*? | **remove it from the Service**, no restart |

`/api/ready` returns 503 until the index is loaded. Getting this wrong is a
classic outage: a liveness probe that depends on something external turns a
dependency's blip into a cluster-wide restart loop. It is also what makes the
rolling update safe — `maxUnavailable: 0` brings up a new pod, waits for it to
report ready, and only then retires an old one. Zero downtime.

**Requests versus limits.** `requests` are what the scheduler reserves when
choosing a node; `limits` are the ceiling — exceed the CPU limit and the process
is throttled, exceed the memory limit and it is killed. Declaring requests is
also what makes the autoscaler possible: utilisation is usage divided by request,
so with no request there is no percentage to compute.

**Horizontal autoscaling.** The HPA adds backend pods when average CPU passes 70%
of the request and removes them when it drops — quickly on the way up, slowly on
the way down, since flapping between replica counts is worse than running one pod
too many. It targets 70% rather than 100% because the headroom is what absorbs a
spike during the ~15s a new pod takes to start and pass readiness.

**Ingress as the single entrance.** An Ingress is HTTP-aware, so one load
balancer and one IP can route by host and path to many Services — as opposed to a
`type: LoadBalancer` Service per app, which means a cloud load balancer, and a
bill, for each one.

**Security context.** `runAsNonRoot`, `allowPrivilegeEscalation: false`,
`readOnlyRootFilesystem`, and all Linux capabilities dropped. nginx genuinely
needs to write in three places, so those get explicit `emptyDir` mounts — a
read-only root filesystem means every writable path is deliberate.

**Disruption budget.** A PodDisruptionBudget keeps at least one backend pod
serving during *voluntary* disruption, such as a node being drained for an
upgrade. Without one, a drain can evict every pod at once and take the API down
even though nothing has failed.

## Adding documents

Drop `.txt` files into `search-exe/backend/data/` and re-run `npm run ingest`.
The server notices the index file's modified time has changed and reloads it, so
no restart is needed. UTF-16 files (what Notepad produces by default on Windows)
are decoded by their byte-order mark.

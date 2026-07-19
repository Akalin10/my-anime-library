import { createServer } from "node:http";

const host = "127.0.0.1";
const port = 3131;
const posterUrl = `http://${host}:${port}/poster.png`;
const poster = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

function media(id = 1) {
  return {
    id,
    idMal: id === 1 ? 1 : 5,
    title:
      id === 1
        ? { romaji: "Cowboy Bebop", english: "Cowboy Bebop", native: "カウボーイビバップ" }
        : { romaji: "Cowboy Bebop: Tengoku no Tobira", english: "Cowboy Bebop: The Movie", native: "カウボーイビバップ 天国の扉" },
    synonyms: id === 1 ? ["Cowboy Bebop 1998"] : [],
    release: { year: id === 1 ? 1998 : 2001 },
    format: id === 1 ? "TV" : "MOVIE",
    episodes: id === 1 ? 26 : 1,
    studios: { nodes: [{ name: "Sunrise" }] },
    description: "A space western following the crew of the Bebop.",
    coverImage: { extraLarge: posterUrl, large: posterUrl, medium: posterUrl },
  };
}

function json(response, status, body) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

const server = createServer((request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    json(response, 200, { ok: true });
    return;
  }
  if (request.method === "GET" && request.url === "/poster.png") {
    response.writeHead(200, {
      "content-type": "image/png",
      "content-length": String(poster.length),
      "cache-control": "no-store",
    });
    response.end(poster);
    return;
  }
  if (request.method !== "POST" || request.url !== "/graphql") {
    json(response, 404, { error: "not found" });
    return;
  }

  const chunks = [];
  request.on("data", (chunk) => chunks.push(chunk));
  request.on("end", () => {
    let payload;
    try {
      payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      json(response, 400, { error: "invalid json" });
      return;
    }

    if (String(payload.variables?.search ?? "").toLowerCase().includes("fail")) {
      json(response, 503, { error: "fixture outage" });
      return;
    }
    if (payload.query?.includes("query SearchAnime")) {
      json(response, 200, { data: { Page: { media: [media(1)] } } });
      return;
    }
    if (payload.query?.includes("query AnimeDetail")) {
      json(response, 200, { data: { Media: media(Number(payload.variables?.id ?? 1)) } });
      return;
    }
    if (payload.query?.includes("query AnimeRelations")) {
      json(response, 200, {
        data: {
          Media: {
            relations: {
              edges: [{ relationType: "MOVIE", node: { ...media(5), type: "ANIME" } }],
            },
          },
        },
      });
      return;
    }
    json(response, 400, { errors: [{ message: "unknown fixture query" }] });
  });
});

server.listen(port, host);

function close() {
  server.close(() => process.exit(0));
}

process.on("SIGINT", close);
process.on("SIGTERM", close);

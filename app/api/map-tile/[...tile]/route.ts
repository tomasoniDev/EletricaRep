import { NextResponse } from "next/server";

const TILE_SOURCES = [
  "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
  "https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
  "https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
  "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
];

function validTilePart(value: string, maxLength = 8) {
  return /^\d+$/.test(value) && value.length <= maxLength;
}

async function fetchTile(url: string) {
  return fetch(url, {
    headers: {
      "User-Agent": "AssistenciaTomasoni/1.0 (hub.tomasoni.ind.br)"
    },
    next: { revalidate: 60 * 60 * 24 * 14 }
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tile?: string[] }> }
) {
  const { tile = [] } = await params;
  const [z = "", x = "", rawY = ""] = tile;
  const y = rawY.replace(/\.png$/i, "");

  if (tile.length !== 3 || !validTilePart(z, 2) || !validTilePart(x) || !validTilePart(y)) {
    return NextResponse.json({ error: "Tile invalido." }, { status: 400 });
  }

  for (const source of TILE_SOURCES) {
    const url = source
      .replace("{z}", z)
      .replace("{x}", x)
      .replace("{y}", y);

    const response = await fetchTile(url).catch(() => null);
    if (!response?.ok) continue;

    const tileBuffer = await response.arrayBuffer();
    return new Response(tileBuffer, {
      headers: {
        "Cache-Control": "public, max-age=1209600, s-maxage=1209600, stale-while-revalidate=604800",
        "Content-Type": response.headers.get("content-type") ?? "image/png"
      }
    });
  }

  return NextResponse.json({ error: "Tile indisponivel." }, { status: 502 });
}

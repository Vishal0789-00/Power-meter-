
import { createClient } from "npm:@supabase/supabase-js@2";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SECRET_KEYS = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")!);
const SUPABASE_SECRET_KEY = SECRET_KEYS["default"];

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY);

const METERS = ["Main", "Raw", "Lighting", "HVAC"];

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function normalizeValue(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return String(value).trim();
}

async function getUser(req: Request) {
  const auth = req.headers.get("Authorization");
  if (!auth) throw new Error("Missing Authorization header");

  const token = auth.replace(/^Bearer\s+/i, "");
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) throw new Error("Invalid or expired login");
  return data.user;
}

async function extractOneFloor(floorName: string, imageUrl: string, readingDate: string) {

  const schema = {
    type: "object",
    properties: {
      readings: {
        type: "array",
        items: {
          type: "object",
          properties: {
            position: { type: "integer" },
            kwh: { type: ["string", "null"] },
            kvah: { type: ["string", "null"] },
            status: { type: "string", enum: ["OK", "REVIEW"] },
          },
          required: ["position", "kwh", "kvah", "status"],
          additionalProperties: false,
        },
      },
    },
    required: ["readings"],
    additionalProperties: false,
  };

  const instruction = `
You are extracting readings from ONE floor control-system screenshot.

There are exactly 8 opened meter parameter panels, arranged left-to-right.
The fixed mapping is:
1 = West Main
2 = West Raw
3 = West Lighting
4 = West HVAC
5 = East Main
6 = East Raw
7 = East Lighting
8 = East HVAC

For each of the 8 panels, extract ONLY:
- kWh: the numeric value beside "Total Energy" and unit kWh.
- kVAh: the numeric value beside "Apparent Power per Hour" and unit kVAH/kVAh.

Ignore EVERYTHING else, including:
voltage, current, frequency, power factor, harmonics, active power/kW, apparent power/kVA, timestamps, alarms, SLD values, labels and any other numbers.

Preserve the exact displayed numeric string, including decimal places.
Do not calculate, round, or infer missing digits.
If a target value is not clearly readable, return null and status REVIEW.
Always return positions 1 through 8.

The image may be photographed at an angle. Use the visual position of the eight popup panels and the target labels as anchors.
`;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-5.6-luna",
      input: [{
        role: "user",
        content: [
          { type: "input_text", text: instruction },
          { type: "input_image", image_url: imageUrl, detail: "high" },
        ],
      }],
      text: {
        format: {
          type: "json_schema",
          name: "floor_meter_readings",
          strict: true,
          schema,
        },
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI error ${response.status}: ${errText}`);
  }

  const result = await response.json();
  const parsed = JSON.parse(result.output_text);
  const byPosition = new Map<number, any>();
  for (const r of parsed.readings ?? []) byPosition.set(Number(r.position), r);

  const rows = [];
  for (let position = 1; position <= 8; position++) {
    const side = position <= 4 ? "West" : "East";
    const meter = position <= 4 ? METERS[position - 1] : METERS[position - 5];
    const r = byPosition.get(position);

    const kwh = normalizeValue(r?.kwh);
    const kvah = normalizeValue(r?.kvah);
    const status = (!r || r.status === "REVIEW" || !kwh || !kvah) ? "REVIEW" : "OK";

    rows.push({
      floor_name: floorName,
      side,
      meter_type: meter,
      position,
      kwh,
      kvah,
      status,
      reading_date: readingDate,
    });
  }
  return rows;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY secret is not configured");

    const user = await getUser(req);
    const body = await req.json();
    const floors = Array.isArray(body.floors) ? body.floors : [];
    const readingDate = body.readingDate || new Date().toISOString().slice(0, 10);

    if (floors.length < 1 || floors.length > 6) {
      return json({ error: "Upload between 1 and 6 floor images." }, 400);
    }

    const allRows = [];

    for (const floor of floors) {
      if (!floor.floorName || !floor.imageDataUrl) {
        throw new Error("Each floor must have floorName and imageDataUrl");
      }
      const rows = await extractOneFloor(String(floor.floorName), String(floor.imageDataUrl), String(readingDate));
      allRows.push(...rows);
    }

    // Replace the selected day's readings for the selected floors.
    const floorNames = [...new Set(allRows.map((r) => r.floor_name))];
    for (const floorName of floorNames) {
      await supabaseAdmin
        .from("meter_readings")
        .delete()
        .eq("user_id", user.id)
        .eq("reading_date", readingDate)
        .eq("floor_name", floorName);
    }

    const insertRows = allRows.map((r) => ({ ...r, user_id: user.id }));
    const { error: insertError } = await supabaseAdmin
      .from("meter_readings")
      .insert(insertRows);

    if (insertError) throw insertError;

    return json({ readings: allRows, floorsProcessed: floorNames.length });
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
  

import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";

const directory = process.env.P00_SCREENSHOT_DIR || "/tmp/hhy-p00-admin-screens";
const report = JSON.parse(await fs.readFile(path.join(directory, "report.json"), "utf8"));

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function decodePng(raw) {
  const signature = "89504e470d0a1a0a";
  if (raw.subarray(0, 8).toString("hex") !== signature) throw new Error("not a PNG");
  let offset = 8;
  let width = 0;
  let height = 0;
  let type = 0;
  let depth = 0;
  const compressed = [];
  while (offset < raw.length) {
    const size = raw.readUInt32BE(offset);
    const chunkType = raw.subarray(offset + 4, offset + 8).toString("ascii");
    const data = raw.subarray(offset + 8, offset + 8 + size);
    if (chunkType === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8];
      type = data[9];
    }
    if (chunkType === "IDAT") compressed.push(data);
    offset += size + 12;
  }
  if (depth !== 8 || ![2, 6].includes(type)) throw new Error(`unsupported PNG format ${depth}/${type}`);
  const channels = type === 6 ? 4 : 3;
  const source = zlib.inflateSync(Buffer.concat(compressed));
  const stride = width * channels;
  const pixels = Buffer.alloc(width * height * channels);
  let sourceOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = source[sourceOffset++];
    const row = pixels.subarray(y * stride, (y + 1) * stride);
    const prior = y ? pixels.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x += 1) {
      const value = source[sourceOffset++];
      const left = x >= channels ? row[x - channels] : 0;
      const up = prior ? prior[x] : 0;
      const upLeft = prior && x >= channels ? prior[x - channels] : 0;
      row[x] = filter === 0 ? value : filter === 1 ? (value + left) & 255 : filter === 2 ? (value + up) & 255 : filter === 3 ? (value + Math.floor((left + up) / 2)) & 255 : filter === 4 ? (value + paeth(left, up, upLeft)) & 255 : (() => { throw new Error(`unsupported PNG filter ${filter}`); })();
    }
  }
  return { width, height, channels, pixels };
}

function similarity(actual, baseline) {
  if (actual.width !== baseline.width || actual.height !== baseline.height || actual.channels !== baseline.channels) return null;
  let matched = 0;
  let error = 0;
  const pixels = actual.width * actual.height;
  for (let offset = 0; offset < actual.pixels.length; offset += actual.channels) {
    let difference = 0;
    for (let channel = 0; channel < actual.channels; channel += 1) difference += Math.abs(actual.pixels[offset + channel] - baseline.pixels[offset + channel]);
    error += difference;
    if (difference <= 48) matched += 1;
  }
  return { matchPercent: Number((matched * 100 / pixels).toFixed(3)), meanChannelError: Number((error / (pixels * actual.channels)).toFixed(3)) };
}

for (const state of report) {
  const actual = decodePng(await fs.readFile(path.join(directory, `${state.name}.png`)));
  const baseline = decodePng(await fs.readFile(path.join(directory, `${state.name}.reference.png`)));
  state.visual = similarity(actual, baseline);
  state.pass = Boolean(state.visual && state.visual.matchPercent >= 90 && state.metrics.frameWidth === 1440 && state.metrics.frameHeight === 1024 && state.innerMetrics.scrollWidth <= 1440 && state.innerMetrics.scrollHeight <= 1024);
}

const passed = report.filter((state) => state.pass).length;
await fs.writeFile(path.join(directory, "report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ total: report.length, passed, failed: report.filter((state) => !state.pass).map((state) => ({ name: state.name, visual: state.visual, metrics: state.metrics, innerMetrics: state.innerMetrics })) }, null, 2));

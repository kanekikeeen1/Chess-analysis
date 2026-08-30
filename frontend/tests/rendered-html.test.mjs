import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

async function readJavaScriptTree(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const contents = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return readJavaScriptTree(entryPath);
    return entry.name.endsWith(".js") ? readFile(entryPath, "utf8") : "";
  }));
  return contents.join("\n");
}

test("emits the home, archive and exercise experiences", async () => {
  const clientJavaScript = await readJavaScriptTree(path.join(root, "dist", "client", "assets"));

  assert.match(clientJavaScript, /Phân tích ván cờ/);
  assert.match(clientJavaScript, /Kho ván cờ/);
  assert.match(clientJavaScript, /Lộ trình luyện tập/);
  assert.match(clientJavaScript, /30 khai cuộc/);
  assert.match(clientJavaScript, /Ưu tiên có kết quả sớm/);
  assert.match(clientJavaScript, /Nhãn ổn định và chính xác hơn/);
  assert.match(clientJavaScript, /Chọn độ sâu Game Review/);
  assert.match(clientJavaScript, /Thực chiến với Stockfish/);
  assert.match(clientJavaScript, /Thế cờ nhận diện khai cuộc/);
  assert.match(clientJavaScript, /Xem lại toàn bộ ván cờ/);
  assert.match(clientJavaScript, /Tự động phát/);
});

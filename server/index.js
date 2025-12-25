const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const QRCode = require("qrcode");
const { v4: uuidv4 } = require("uuid");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

// --- Dossiers ---
const uploadDir = path.join(__dirname, "uploads");
const publicDir = path.join(__dirname, "public");
const dbPath = path.join(__dirname, "db.json");

if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
if (!fs.existsSync(dbPath)) fs.writeFileSync(dbPath, "{}");

// --- Helpers DB JSON ---
function readDb() {
  try {
    return JSON.parse(fs.readFileSync(dbPath, "utf-8") || "{}");
  } catch {
    return {};
  }
}
function writeDb(db) {
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
}

// --- Multer storage ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const id = uuidv4();
    const ext = path.extname(file.originalname) || ".bin";
    cb(null, `${id}${ext}`);
  },
});
const upload = multer({ storage });

// --- Middlewares ---
app.use(express.json());
app.use("/uploads", express.static(uploadDir));
app.use("/public", express.static(publicDir));

// --- Home ---
app.get("/", (req, res) => {
  res.send(`
    <div style="font-family:Arial;max-width:820px;margin:0 auto;padding:24px;">
      <h2>RealSnap MVP</h2>
      <p>Upload une image → lien de vérification + QR</p>
      <form action="/api/upload" method="post" enctype="multipart/form-data" style="margin-top:16px;">
        <input type="file" name="file" accept="image/*" required />
        <button type="submit" style="margin-left:8px;">Upload</button>
      </form>
    </div>
  `);
});

// --- Upload ---
app.post("/api/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Aucun fichier reçu" });

    const filename = req.file.filename;
    const id = filename.split(".")[0];

    // Base URL (Codespaces/Proxy safe)
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const verifyUrl = `${baseUrl}/v/${id}`;

    // Hash SHA-256
    const fileBuffer = fs.readFileSync(req.file.path);
    const hash = crypto.createHash("sha256").update(fileBuffer).digest("hex");
    const createdAt = new Date().toISOString();

    // Save record in db.json
    const db = readDb();
    db[id] = {
      id,
      filename,
      originalUrl: `/uploads/${filename}`,
      verifyUrl,
      hash,
      createdAt,
    };
    writeDb(db);

    // Generate QR (data URL + png)
    const qrDataUrl = await QRCode.toDataURL(verifyUrl);
    const qrPngPath = path.join(publicDir, `${id}.png`);
    await QRCode.toFile(qrPngPath, verifyUrl, { width: 320 });

    return res.send(`
      <div style="font-family:Arial;max-width:820px;margin:0 auto;padding:24px;">
        <h2>✅ Upload OK</h2>

        <p><b>Lien de vérification :</b><br/>
          <a href="${verifyUrl}" target="_blank">${verifyUrl}</a>
        </p>

        <p><b>Hash SHA-256 :</b><br/>
          <code style="word-break:break-all;display:block;background:#f7f7f7;padding:10px;border-radius:8px;">
            ${hash}
          </code>
        </p>

        <p><b>QR Code :</b></p>
        <img src="${qrDataUrl}" style="border:1px solid #eee;border-radius:12px;" />

        <p style="margin-top:12px;">
          PNG direct : <a href="/public/${id}.png" target="_blank">/public/${id}.png</a><br/>
          Fichier original : <a href="/uploads/${filename}" target="_blank">/uploads/${filename}</a>
        </p>

        <p><a href="/">⬅️ Revenir</a></p>
      </div>
    `);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

// --- Verify page ---
app.get("/v/:id", (req, res) => {
  const { id } = req.params;

  const db = readDb();
  const record = db[id];

  if (!record) {
    return res.status(404).send(`
      <div style="font-family:Arial;max-width:820px;margin:0 auto;padding:24px;">
        <h2>❌ Introuvable</h2>
        <p>Aucun original enregistré pour cet ID.</p>
      </div>
    `);
  }

  return res.send(`
    <div style="font-family:Arial;max-width:820px;margin:0 auto;padding:24px;">
      <h2 style="margin-bottom:6px;">✅ Verified by RealSnap (MVP)</h2>
      <p style="margin-top:0;color:#444;">Preuve d’originalité (prototype)</p>

      <div style="border:1px solid #eee;border-radius:12px;padding:16px;margin:16px 0;">
        <p><b>ID:</b> ${record.id}</p>
        <p><b>Date d’enregistrement:</b> ${record.createdAt}</p>
        <p><b>Hash SHA-256:</b></p>
        <code style="word-break:break-all;display:block;background:#f7f7f7;padding:10px;border-radius:8px;">
          ${record.hash}
        </code>
      </div>

      <div style="border:1px solid #eee;border-radius:12px;padding:16px;">
        <p style="margin-top:0;"><b>Original stocké:</b></p>
        <img src="${record.originalUrl}" style="max-width:100%;border:1px solid #ddd;border-radius:12px;" />
        <p style="margin-bottom:0;">
          <a href="${record.originalUrl}" target="_blank">Ouvrir / Télécharger l’original</a>
        </p>
      </div>
    </div>
  `);
});

// --- Start ---
app.listen(PORT, "0.0.0.0", () => {
  console.log(`RealSnap MVP running on http://localhost:${PORT}`);
});


